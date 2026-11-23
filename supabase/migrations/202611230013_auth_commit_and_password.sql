begin;
alter table public.profiles add column password_setup_required boolean not null default false;

-- GoTrue writes Admin app_metadata after INSERT, before committing the same transaction.
create or replace function app_private.auth_user_created() returns trigger language plpgsql security definer set search_path='' as $$ begin
 insert into public.profiles(id,full_name) values(new.id,left(coalesce(new.raw_user_meta_data->>'full_name',''),160));
 return new;
end $$;
create function app_private.validate_auth_signup() returns trigger language plpgsql security definer set search_path='' as $$
declare final_user auth.users;versions uuid[];v uuid;server_created boolean;local_demo boolean;begin
 select * into final_user from auth.users where id=new.id;
 if not found then return null;end if;
 server_created:=coalesce(final_user.raw_app_meta_data->>'icarus_server_created','false')='true';
 local_demo:=coalesce(final_user.raw_app_meta_data->>'icarus_local_demo','false')='true';
 if local_demo and not exists(select 1 from app_private.local_demo_guard where singleton and enabled) then perform app_private.fail('Demonstração local desabilitada.');end if;
 -- Email confirmation alone never authorizes public signup (Auth can auto-confirm).
 if not server_created and final_user.invited_at is null then
  if (select count(distinct kind) from public.legal_versions where published and not demo)<>2 then perform app_private.fail('Cadastro público indisponível.');end if;
  begin
   select array_agg(x::uuid) into versions from jsonb_array_elements_text(coalesce(final_user.raw_user_meta_data->'legal_version_ids','[]')) x;
  exception when others then perform app_private.fail('Aceite os termos atuais.');end;
  if (select count(distinct kind) from public.legal_versions where published and not demo and id=any(versions))<>2 then perform app_private.fail('Aceite os termos atuais.');end if;
  for v in select id from public.legal_versions where published and not demo and id=any(versions) loop
   insert into public.legal_acceptances(user_id,legal_version_id,marketing_opt_in) values(final_user.id,v,coalesce((final_user.raw_user_meta_data->>'marketing_opt_in')::boolean,false));
  end loop;
 end if;
 update public.profiles set password_setup_required=coalesce(final_user.raw_app_meta_data->>'icarus_password_setup_required','false')='true' where id=final_user.id;
 return null;
end $$;
create constraint trigger app_validate_auth_signup after insert on auth.users deferrable initially deferred for each row execute function app_private.validate_auth_signup();
revoke execute on function app_private.auth_user_created(),app_private.validate_auth_signup() from public,anon,authenticated;

create or replace function app_private.actor(p_allow_aal1 boolean default false) returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();sid uuid;p public.profiles;s public.app_sessions;idle interval;begin
 if u is null then perform app_private.fail('Sessão inválida. Entre novamente.');end if;
 sid:=nullif(auth.jwt()->>'session_id','')::uuid;
 select * into p from public.profiles where id=u;
 if not found or p.suspended then perform app_private.fail('Acesso indisponível.');end if;
 if p.password_setup_required and not p_allow_aal1 then perform app_private.fail('Defina sua senha para acessar o conteúdo.');end if;
 if sid is null or not exists(select 1 from auth.sessions where id=sid and user_id=u and (not_after is null or not_after>now()) and (p_allow_aal1 or p.role='member' or auth.sessions.aal='aal2')) then perform app_private.fail('Sessão inválida. Entre novamente.');end if;
 idle:=case when p.role='member' then interval '2 hours' else interval '30 minutes' end;
 insert into public.app_sessions(id,user_id,expires_at) values(sid,u,now()+idle) on conflict(id) do nothing;
 select * into s from public.app_sessions where id=sid and user_id=u for update;
 if not found or s.revoked_at is not null or least(s.expires_at,s.last_activity_at+idle)<=now() then perform app_private.fail('Sessão expirada. Entre novamente.');end if;
 if p.role<>'member' and not p_allow_aal1 and coalesce(auth.jwt()->>'aal','aal1')<>'aal2' then perform app_private.fail('Confirme o segundo fator para continuar.');end if;
 return u;
end $$;
create function app_private.service_session(p_actor uuid,p_allow_setup boolean default false) returns void language plpgsql stable security definer set search_path='' as $$
declare headers jsonb:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;sid uuid;session_aal text;begin
 begin sid:=nullif(headers->>'x-icarus-session-id','')::uuid;exception when invalid_text_representation then perform app_private.fail('Sessão inválida.');end;
 session_aal:=headers->>'x-icarus-aal';
 if p_actor is null or sid is null or session_aal is null or session_aal not in ('aal1','aal2') or not exists(
  select 1 from public.profiles p join public.app_sessions a on a.user_id=p.id join auth.sessions s on s.id=a.id and s.user_id=p.id
  where p.id=p_actor and not p.suspended and (p_allow_setup or not p.password_setup_required) and a.id=sid and a.revoked_at is null and a.expires_at>now()
  and a.last_activity_at+case when p.role='member' then interval '2 hours' else interval '30 minutes' end>now()
  and (s.not_after is null or s.not_after>now()) and (p_allow_setup or p.role='member' or (session_aal='aal2' and s.aal='aal2'))
 ) then perform app_private.fail('Sessão inválida, expirada ou configuração de senha pendente.');end if;
end $$;
create or replace function app_private.service_actor(p_actor uuid) returns void language plpgsql stable security definer set search_path='' as $$ begin perform app_private.service_session(p_actor,false);end $$;
revoke execute on function app_private.actor(boolean),app_private.service_session(uuid,boolean),app_private.service_actor(uuid) from public,anon,authenticated;

create function public.app_complete_password_setup(p_actor_id uuid,p_session_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$ begin
 perform app_private.service_session(p_actor_id,true);
 if p_session_id is distinct from ((current_setting('request.headers',true)::jsonb)->>'x-icarus-session-id')::uuid then perform app_private.fail('Sessão inválida.');end if;
 if not exists(select 1 from auth.users where id=p_actor_id and email_confirmed_at is not null) then perform app_private.fail('Confirme seu email antes de definir a senha.');end if;
 -- Edge calls only after native Auth.updateUser(password) succeeds; hashes are not evidence of password setup.
 update public.profiles set password_setup_required=false where id=p_actor_id;
 update auth.users set raw_app_meta_data=coalesce(raw_app_meta_data,'{}')||jsonb_build_object('icarus_password_setup_required',false) where id=p_actor_id;
 perform app_private.audit(p_actor_id,'password-setup-complete','profiles',p_actor_id);
 return jsonb_build_object('ok',true,'password_setup_required',false);
end $$;
revoke execute on function public.app_complete_password_setup(uuid,uuid) from public,anon,authenticated;
grant execute on function public.app_complete_password_setup(uuid,uuid) to service_role;
notify pgrst,'reload schema';
commit;
