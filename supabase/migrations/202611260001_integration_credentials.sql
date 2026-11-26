begin;

create extension if not exists supabase_vault with schema vault;

create function public.app_integration_credentials(p_provider text)
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce((
  select decoded.fields||jsonb_build_object('_updated_by_name',p.full_name)
  from vault.decrypted_secrets v
  cross join lateral (select v.decrypted_secret::jsonb fields) decoded
  left join public.profiles p on p.id=(decoded.fields->>'_updated_by')::uuid
  where v.name=case p_provider when 'asaas' then 'icarus_integration_asaas' when 'bunny' then 'icarus_integration_bunny' end
 ), '{}'::jsonb);
$$;
revoke execute on function public.app_integration_credentials(text) from public,anon,authenticated,service_role;
grant execute on function public.app_integration_credentials(text) to service_role;

create function app_private.consume_reauth(p_token text,p_actor uuid,p_session uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 update public.reauth_nonces set consumed_at=now()
 where token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and actor_id=p_actor
  and session_id=p_session and consumed_at is null and expires_at>now();
 if not found then perform app_private.fail('Confirmação expirada. Confirme sua senha novamente.'); end if;
end $$;
revoke execute on function app_private.consume_reauth(text,uuid,uuid) from public,anon,authenticated,service_role;

create or replace function app_private.consume_reauth(p_token text,p_actor uuid)
returns void language sql security definer set search_path='' as $$
 select app_private.consume_reauth(p_token,p_actor,(auth.jwt()->>'session_id')::uuid);
$$;
revoke execute on function app_private.consume_reauth(text,uuid) from public,anon,authenticated,service_role;

create function app_private.authorize_integration(p_actor_id uuid,p_reauth_token text,p_write boolean)
returns void language plpgsql security definer set search_path='' as $$
declare headers jsonb:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
begin
 perform app_private.service_session(p_actor_id);
 if not exists(select 1 from public.profiles where id=p_actor_id and role='admin' and not demo) then
  raise insufficient_privilege using message='Somente administradores podem alterar integrações.';
 end if;
 if p_write then
  if not app_private.requires_aal2(p_actor_id) or headers->>'x-icarus-aal' is distinct from 'aal2' then
   raise insufficient_privilege using message='Confirme o segundo fator para alterar a integração.';
  end if;
  perform app_private.consume_reauth(p_reauth_token,p_actor_id,(headers->>'x-icarus-session-id')::uuid);
  begin
   perform app_private.throttle(p_actor_id,'integration_write',5);
  exception when sqlstate 'P0001' then
   raise sqlstate 'PT429' using message='Muitas tentativas. Aguarde um minuto e tente novamente.';
  end;
 end if;
end $$;
revoke execute on function app_private.authorize_integration(uuid,text,boolean) from public,anon,authenticated,service_role;

create function public.app_admin_save_integration(p_actor_id uuid,p_provider text,p_fields jsonb,p_reauth_token text)
returns void language plpgsql security definer set search_path='' as $$
declare
 secret_name text;
 secret_id uuid;
 saved jsonb;
 allowed_keys text[];
 field_name text;
 field_value jsonb;
 supplied text;
 environment text;
begin
 perform app_private.authorize_integration(p_actor_id,p_reauth_token,true);
 case p_provider
  when 'asaas' then
   secret_name:='icarus_integration_asaas';
   allowed_keys:=array['env','api_key','webhook_token'];
  when 'bunny' then
   secret_name:='icarus_integration_bunny';
   allowed_keys:=array['library_id','api_key','cdn_host','token_key'];
  else perform app_private.fail('Provedor inválido.');
 end case;
 if p_fields is null or jsonb_typeof(p_fields)<>'object' or p_fields='{}'::jsonb then
  perform app_private.fail('Informe os campos a atualizar.');
 end if;
 for field_name, field_value in select key, value from jsonb_each(p_fields) loop
  supplied:=field_value #>> '{}';
  if not (field_name=any(allowed_keys)) or jsonb_typeof(field_value)<>'string'
    or (case field_name
     when 'env' then supplied not in ('sandbox','production')
     when 'library_id' then supplied !~ '^[1-9][0-9]{0,14}$'
     when 'cdn_host' then length(supplied)>253 or supplied !~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*\.[a-z][a-z0-9]{1,62}$'
     when 'webhook_token' then supplied !~ '^[a-f0-9]{64}$'
     else length(supplied) not between 5 and 512 or supplied ~ '[^!-~]'
    end) then
   perform app_private.fail('Confira os campos da integração.');
  end if;
 end loop;
 if p_provider='asaas' and not (p_fields?'env') then
  perform app_private.fail('Selecione o ambiente do Asaas.');
 end if;
 perform pg_advisory_xact_lock(hashtextextended(secret_name,0));
 select id,decrypted_secret::jsonb into secret_id,saved from vault.decrypted_secrets where name=secret_name;
 saved:=coalesce(saved,'{}'::jsonb);
 if p_provider='asaas' then
  environment:=p_fields->>'env';
  if not (p_fields?'webhook_token') then
   if saved->>'env' is distinct from environment and saved?'_production_active_hash' then
    saved:=saved-'_production_active_hash';
    perform app_private.audit(p_actor_id,'disable','asaas',null,'Cobranças em produção desativadas após trocar o ambiente.');
   end if;
   saved:=saved||jsonb_build_object('env',environment);
  end if;
  if environment='production' and (
   (p_fields?'api_key' and p_fields->>'api_key' is distinct from saved->>'production_api_key')
   or (p_fields?'webhook_token' and p_fields->>'webhook_token' is distinct from saved->>'production_webhook_token')
  ) then
   if saved?'_production_active_hash' then
    perform app_private.audit(p_actor_id,'disable','asaas',null,'Cobranças em produção desativadas após alterar credenciais.');
   end if;
   saved:=saved-array['_production_active_hash','_production_test_hash','_production_tested_at'];
  end if;
  if p_fields?'api_key' then
   saved:=saved||jsonb_build_object(environment||'_api_key',p_fields->>'api_key');
  end if;
  if p_fields?'webhook_token' then
   saved:=saved||jsonb_build_object(environment||'_webhook_token',p_fields->>'webhook_token');
  end if;
  if saved->>'sandbox_webhook_token'=saved->>'production_webhook_token' then
   perform app_private.fail('Use tokens de webhook diferentes no Sandbox e na Produção.');
  end if;
 else
  saved:=saved||p_fields;
 end if;
 saved:=saved||jsonb_build_object('_updated_at',now(),'_updated_by',p_actor_id);
 if secret_id is null then
  perform vault.create_secret(saved::text,secret_name);
 else
  perform vault.update_secret(secret_id,saved::text);
 end if;
 perform app_private.audit(p_actor_id,'save',p_provider,null,
  case p_provider when 'asaas' then 'Configuração do Asaas ('||
   case environment when 'sandbox' then 'Sandbox' else 'Produção' end||')'
   else 'Configuração do Bunny Stream' end);
end $$;
revoke execute on function public.app_admin_save_integration(uuid,text,jsonb,text) from public,anon,authenticated,service_role;
grant execute on function public.app_admin_save_integration(uuid,text,jsonb,text) to service_role;

create function public.app_admin_asaas_production(p_actor_id uuid,p_action text,p_fingerprint text,p_reauth_token text default null)
returns void language plpgsql security definer set search_path='' as $$
declare
 secret_name constant text:='icarus_integration_asaas';
 secret_id uuid;
 saved jsonb;
begin
 if p_action is null or p_action not in ('test','test-failed','enable','disable')
   or (p_action<>'disable' and coalesce(p_fingerprint,'') !~ '^[a-f0-9]{64}$') then
  perform app_private.fail('Confira o teste do Asaas em Produção.');
 end if;
 perform app_private.authorize_integration(p_actor_id,p_reauth_token,p_action in ('enable','disable'));
 perform pg_advisory_xact_lock(hashtextextended(secret_name,0));
 select id,decrypted_secret::jsonb into secret_id,saved from vault.decrypted_secrets where name=secret_name;
 saved:=coalesce(saved,'{}'::jsonb);
 if p_action='test' then
  saved:=saved||jsonb_build_object('_production_test_hash',p_fingerprint,'_production_tested_at',now());
 elsif p_action='test-failed' then
  if saved->>'_production_test_hash' is distinct from p_fingerprint then return; end if;
  saved:=saved-array['_production_test_hash','_production_tested_at'];
 else
  if p_action='enable' then
   if saved->>'_production_test_hash' is distinct from p_fingerprint
      or coalesce((saved->>'_production_tested_at')::timestamptz, '-infinity')<=now()-interval '24 hours' then
    perform app_private.fail('Faça um novo teste do Asaas em Produção com as credenciais atuais.');
   end if;
   saved:=saved||jsonb_build_object('_production_active_hash',p_fingerprint);
  else
   saved:=saved-'_production_active_hash';
  end if;
  saved:=saved||jsonb_build_object('_updated_at',now(),'_updated_by',p_actor_id);
  perform app_private.audit(p_actor_id,p_action,'asaas',null,'Cobranças em produção');
 end if;
 if secret_id is null then
  perform vault.create_secret(saved::text,secret_name);
 else
  perform vault.update_secret(secret_id,saved::text);
 end if;
end $$;
revoke execute on function public.app_admin_asaas_production(uuid,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.app_admin_asaas_production(uuid,text,text,text) to service_role;

alter table public.orders add column asaas_environment text not null default 'sandbox'
 check (asaas_environment in ('sandbox','production'));

create function public.app_checkout_begin(
 p_actor_id uuid,p_plan_id uuid,p_attempt_key text,p_method text,p_installments integer,
 p_buyer_data jsonb,p_legal_version_ids uuid[],p_marketing_opt_in boolean,p_receipt_hash text,p_asaas_environment text,
 p_production_fingerprint text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare reservation jsonb; order_id uuid;
begin
 if p_asaas_environment is null or p_asaas_environment not in ('sandbox','production') then
  perform app_private.fail('Ambiente de pagamento inválido.');
 end if;
 if p_asaas_environment='production' and (
   p_production_fingerprint is null
   or p_production_fingerprint is distinct from public.app_integration_credentials('asaas')->>'_production_active_hash'
 ) then
  raise sqlstate 'PT503' using message='Cobranças em Produção estão desativadas.';
 end if;
 reservation:=public.app_checkout_begin(p_actor_id,p_plan_id,p_attempt_key,p_method,p_installments,
  p_buyer_data,p_legal_version_ids,p_marketing_opt_in,p_receipt_hash);
 order_id:=(reservation->>'order_id')::uuid;
 if (reservation->>'create_gateway')::boolean then
  begin
   perform app_private.throttle('00000000-0000-4000-8000-000000000001','checkout_global',60);
  exception when sqlstate 'P0001' then
   raise sqlstate 'PT429' using message='O checkout atingiu o limite de novos pedidos. Tente novamente em um minuto.';
  end;
  update public.orders set asaas_environment=p_asaas_environment where id=order_id;
 end if;
 return reservation||jsonb_build_object('asaas_environment',
  (select asaas_environment from public.orders where id=order_id));
end $$;
revoke execute on function public.app_checkout_begin(uuid,uuid,text,text,integer,jsonb,uuid[],boolean,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.app_checkout_begin(uuid,uuid,text,text,integer,jsonb,uuid[],boolean,text,text,text) to service_role;

create or replace function public.app_payment_context(p_order_id uuid,p_gateway_id text default null)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('order_id',id,'gateway_id',gateway_id,'asaas_environment',asaas_environment)
 from public.orders
 where (p_order_id is not null and id=p_order_id)
    or (p_order_id is null and p_gateway_id is not null and gateway_id=p_gateway_id)
 limit 1;
$$;
revoke execute on function public.app_payment_context(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.app_payment_context(uuid,text) to service_role;

commit;
