begin;

-- Logo da instalação: colorida (fundo claro) e branca (fundo escuro), servidas por um bucket público só da marca.
alter table app_private.installation_brand
  add column logo_light text check (logo_light ~ '^logo/light-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|webp)$'),
  add column logo_dark text check (logo_dark ~ '^logo/dark-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|webp)$');

-- Leitura só pela URL pública. Sem policy em storage.objects: listar e gravar ficam negados a anon e authenticated; só a Edge grava, com a service role.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('icarus-brand', 'icarus-brand', true, 512000, array['image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = 512000, allowed_mime_types = array['image/png', 'image/webp'];

create function public.app_brand_logo_begin(p_actor_id uuid, p_variant text, p_content_type text)
returns text language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.service_actor(p_actor_id);
  if not app_private.is_staff(p_actor_id, array['admin']) then perform app_private.fail(); end if;
  perform app_private.throttle(p_actor_id, 'brand-logo', 10);
  if p_variant is null or p_variant not in ('light', 'dark') or p_content_type is null or p_content_type not in ('image/png', 'image/webp') then
    perform app_private.fail('Envie a logo em PNG ou WebP.');
  end if;
  return 'logo/' || p_variant || '-' || gen_random_uuid() || case p_content_type when 'image/png' then '.png' else '.webp' end;
end $$;
revoke execute on function public.app_brand_logo_begin(uuid, text, text) from public, anon, authenticated;
grant execute on function public.app_brand_logo_begin(uuid, text, text) to service_role;

-- Grava (ou remove, com caminho nulo) e devolve o objeto anterior, que a Edge só apaga depois deste commit.
create function public.app_brand_logo_commit(p_actor_id uuid, p_variant text, p_path text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  current_brand app_private.installation_brand;
  previous text;
begin
  perform app_private.service_actor(p_actor_id);
  if not app_private.is_staff(p_actor_id, array['admin']) then perform app_private.fail(); end if;
  if p_variant is null or p_variant not in ('light', 'dark') or (p_path is not null and (
    p_path !~ ('^logo/' || p_variant || '-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|webp)$')
    or not exists(select 1 from storage.objects where bucket_id = 'icarus-brand' and name = p_path)
  )) then
    perform app_private.fail('Logo indisponível. Envie o arquivo novamente.');
  end if;

  select * into strict current_brand from app_private.installation_brand where singleton for update;
  previous := case p_variant when 'light' then current_brand.logo_light else current_brand.logo_dark end;
  if previous is not distinct from p_path then
    previous := null;
  else
    update app_private.installation_brand set
      logo_light = case when p_variant = 'light' then p_path else logo_light end,
      logo_dark = case when p_variant = 'dark' then p_path else logo_dark end
    where singleton returning * into current_brand;
    perform app_private.audit(p_actor_id, case when p_path is null then 'remove' else 'save' end, 'installation_logo_' || p_variant, null);
  end if;
  return jsonb_build_object('logo_light', current_brand.logo_light, 'logo_dark', current_brand.logo_dark, 'previous', previous);
end $$;
revoke execute on function public.app_brand_logo_commit(uuid, text, text) from public, anon, authenticated;
grant execute on function public.app_brand_logo_commit(uuid, text, text) to service_role;

create or replace function public.app_public_context() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('name',(select name from app_private.installation_brand where singleton),'logo_light',(select logo_light from app_private.installation_brand where singleton),'logo_dark',(select logo_dark from app_private.installation_brand where singleton),'legal_ready',(select count(distinct kind)=2 from public.legal_versions where published and not demo),'registration_enabled',(select count(distinct kind)=2 from public.legal_versions where published and not demo),
 'legal_versions',coalesce((select jsonb_agg(jsonb_build_object('id',id,'kind',kind,'version',version,'title',title,'body',body,'demo',demo)) from public.legal_versions where published),'[]'::jsonb),'plans',coalesce((select jsonb_agg(to_jsonb(p)-'created_at') from public.plans p where active),'[]'::jsonb),'onboarding_questions',coalesce((select jsonb_agg(to_jsonb(q) order by order_index,id) from public.onboarding_questions q where active),'[]'::jsonb))
$$;
revoke execute on function public.app_public_context() from public, anon, authenticated;
grant execute on function public.app_public_context() to anon, authenticated;
comment on function public.app_public_context() is 'anon-ok: configuração pública, marca e versões legais, sem segredos';

create or replace function public.app_bootstrap() returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.actor(true);oid uuid;begin
 for oid in select o.id from public.orders o join auth.users a on a.id=u and a.email_confirmed_at is not null and lower(a.email)=lower(o.buyer_data->>'email') where o.status='paid' and o.finalized_at is null and (o.user_id is null or o.user_id=u) loop perform app_private.finalize_order(oid,u);end loop;
 return jsonb_build_object('profile',app_private.profile_json(u),'plans',coalesce((select jsonb_agg(to_jsonb(p)-'created_at') from public.plans p where active),'[]'::jsonb),'settings',jsonb_build_object('name',(select name from app_private.installation_brand where singleton),'name_revision',(select revision from app_private.installation_brand where singleton),'logo_light',(select logo_light from app_private.installation_brand where singleton),'logo_dark',(select logo_dark from app_private.installation_brand where singleton),'terms_url','/termos','privacy_url','/privacidade','onboarding',(select to_jsonb(o)-'singleton' from public.onboarding o limit 1),'onboarding_questions',coalesce((select jsonb_agg(to_jsonb(q) order by order_index,id) from public.onboarding_questions q where active),'[]'::jsonb),'capabilities',jsonb_build_object('checkout',false,'bunny',false)),
 'orders',coalesce((select jsonb_agg(jsonb_build_object('id',id,'plan_id',plan_id,'status',status,'amount_cents',amount_cents,'created_at',created_at,'checkout_url',checkout_url) order by created_at desc) from public.orders where user_id=u),'[]'::jsonb));
end $$;
revoke execute on function public.app_bootstrap() from public, anon, authenticated;
grant execute on function public.app_bootstrap() to authenticated;

notify pgrst, 'reload schema';
commit;
