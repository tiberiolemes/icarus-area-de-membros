begin;

create table ica_private.installation_brand (
  singleton boolean primary key default true check (singleton),
  name text not null default 'Icarus' check (char_length(name) between 1 and 80),
  revision integer not null default 0 check (revision >= 0)
);
alter table ica_private.installation_brand enable row level security;
revoke all on table ica_private.installation_brand from public, anon, authenticated, service_role;
insert into ica_private.installation_brand default values;

create function public.app_admin_save_installation_name(p_name text, p_expected_revision integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := ica_private.require_role(array['admin']);
  proposed_name text := btrim(p_name, U&'\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\202F\205F\3000');
  current_brand ica_private.installation_brand;
begin
  -- Match the editor's Unicode space and Default_Ignorable_Code_Point checks in a locale-independent range.
  if proposed_name is null or char_length(proposed_name) not between 1 and 80
    or proposed_name collate pg_catalog."C" ~ U&'[\0001-\001F\007F-\009F\061C\200E-\200F\2028-\202E\2066-\2069]'
    or proposed_name collate pg_catalog."C" !~ U&'[^\0020\00A0\1680\2000-\200A\202F\205F\3000\00AD\034F\061C\115F-\1160\17B4-\17B5\180B-\180F\200B-\200F\202A-\202E\2060-\206F\2800\3164\FE00-\FE0F\FEFF\FFA0\FFF0-\FFF8\+01BCA0-\+01BCA3\+01D173-\+01D17A\+0E0000-\+0E0FFF]' then
    perform ica_private.fail('Informe um nome de instalação visível, com até 80 caracteres e sem controles de formatação.');
  end if;

  select * into strict current_brand from ica_private.installation_brand where singleton for update;
  if proposed_name = current_brand.name or p_expected_revision is distinct from current_brand.revision then
    return jsonb_build_object('name', current_brand.name, 'revision', current_brand.revision, 'saved', proposed_name = current_brand.name);
  end if;

  update ica_private.installation_brand set name = proposed_name, revision = revision + 1 where singleton returning * into current_brand;
  perform ica_private.audit(actor_id, 'save', 'installation_brand', null);
  return jsonb_build_object('name', current_brand.name, 'revision', current_brand.revision, 'saved', true);
end $$;
revoke execute on function public.app_admin_save_installation_name(text,integer) from public, anon, authenticated, service_role;
grant execute on function public.app_admin_save_installation_name(text,integer) to authenticated;

create or replace function public.app_public_context() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('name',(select name from ica_private.installation_brand where singleton),'legal_ready',(select count(distinct kind)=2 from public.ica_legal_versions where published and not demo),'registration_enabled',(select count(distinct kind)=2 from public.ica_legal_versions where published and not demo),
 'legal_versions',coalesce((select jsonb_agg(jsonb_build_object('id',id,'kind',kind,'version',version,'title',title,'body',body,'demo',demo)) from public.ica_legal_versions where published),'[]'::jsonb),'plans',coalesce((select jsonb_agg(to_jsonb(p)-'created_at') from public.ica_plans p where active),'[]'::jsonb),'onboarding_questions',coalesce((select jsonb_agg(to_jsonb(q) order by order_index,id) from public.ica_onboarding_questions q where active),'[]'::jsonb))
$$;
revoke execute on function public.app_public_context() from public, anon, authenticated;
grant execute on function public.app_public_context() to anon, authenticated;
comment on function public.app_public_context() is 'anon-ok: configuração pública e versões legais, sem segredos';

create or replace function public.app_bootstrap() returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=ica_private.actor(true);oid uuid;begin
 for oid in select o.id from public.ica_orders o join auth.users a on a.id=u and a.email_confirmed_at is not null and lower(a.email)=lower(o.buyer_data->>'email') where o.status='paid' and o.finalized_at is null and (o.user_id is null or o.user_id=u) loop perform ica_private.finalize_order(oid,u);end loop;
 return jsonb_build_object('profile',ica_private.profile_json(u),'plans',coalesce((select jsonb_agg(to_jsonb(p)-'created_at') from public.ica_plans p where active),'[]'::jsonb),'settings',jsonb_build_object('name',(select name from ica_private.installation_brand where singleton),'name_revision',(select revision from ica_private.installation_brand where singleton),'terms_url','/termos','privacy_url','/privacidade','onboarding',(select to_jsonb(o)-'singleton' from public.ica_onboarding o limit 1),'onboarding_questions',coalesce((select jsonb_agg(to_jsonb(q) order by order_index,id) from public.ica_onboarding_questions q where active),'[]'::jsonb),'capabilities',jsonb_build_object('checkout',false,'bunny',false)),
 'orders',coalesce((select jsonb_agg(jsonb_build_object('id',id,'plan_id',plan_id,'status',status,'amount_cents',amount_cents,'created_at',created_at,'checkout_url',checkout_url) order by created_at desc) from public.ica_orders where user_id=u),'[]'::jsonb));
end $$;
revoke execute on function public.app_bootstrap() from public, anon, authenticated;
grant execute on function public.app_bootstrap() to authenticated;

notify pgrst, 'reload schema';
commit;
