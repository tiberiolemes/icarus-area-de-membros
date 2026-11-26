begin;

alter table app_private.installation_brand
  add column logo_light_ratio double precision check (logo_light_ratio between (1.0 / 4096) and 4096),
  add column logo_dark_ratio double precision check (logo_dark_ratio between (1.0 / 4096) and 4096),
  drop constraint installation_brand_logo_light_check,
  drop constraint installation_brand_logo_dark_check,
  drop constraint installation_brand_icon_check;
alter table app_private.installation_brand
  add constraint installation_brand_logo_light_check check (logo_light ~ '^logo/light-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|webp|svg)$'),
  add constraint installation_brand_logo_dark_check check (logo_dark ~ '^logo/dark-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|webp|svg)$'),
  add constraint installation_brand_icon_check check (icon ~ '^icon/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|svg)$'),
  add constraint installation_brand_light_ratio_check check ((logo_light is not null or logo_light_ratio is null) and (logo_light !~ '\.svg$' or logo_light_ratio is not null)),
  add constraint installation_brand_dark_ratio_check check ((logo_dark is not null or logo_dark_ratio is null) and (logo_dark !~ '\.svg$' or logo_dark_ratio is not null));

-- Preserve o contrato do bucket e interrompa a atualização se ele tiver sido reconfigurado.
update storage.buckets set allowed_mime_types = array['image/png', 'image/webp', 'image/svg+xml']
where id = 'icarus-brand' and public and file_size_limit = 512000 and allowed_mime_types = array['image/png', 'image/webp'];
do $$
begin
  if not exists(select 1 from storage.buckets where id = 'icarus-brand' and public and file_size_limit = 512000 and allowed_mime_types = array['image/png', 'image/webp', 'image/svg+xml']) then
    raise exception 'O bucket icarus-brand está com outra configuração. Confira o bucket antes de habilitar SVG.';
  end if;
end $$;

-- A leitura pela URL pública do Storage continua disponível. SDKs do navegador não listam nem gravam objetos neste bucket.
create policy icarus_brand_service_only on storage.objects as restrictive for all to anon, authenticated
using (bucket_id <> 'icarus-brand') with check (bucket_id <> 'icarus-brand');

create or replace function public.app_brand_asset_begin(p_actor_id uuid, p_variant text, p_content_type text)
returns text language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.service_actor(p_actor_id);
  if not app_private.is_staff(p_actor_id, array['admin']) then perform app_private.fail(); end if;
  perform app_private.throttle(p_actor_id, 'brand-asset', 10);
  if p_variant in ('light', 'dark') and p_content_type in ('image/png', 'image/webp', 'image/svg+xml') then
    return 'logo/' || p_variant || '-' || gen_random_uuid() || case p_content_type when 'image/png' then '.png' when 'image/webp' then '.webp' else '.svg' end;
  elsif (p_variant = 'icon' and p_content_type in ('image/png', 'image/svg+xml')) or (p_variant = 'signature' and p_content_type = 'image/png') then
    return p_variant || '/' || gen_random_uuid() || case p_content_type when 'image/svg+xml' then '.svg' else '.png' end;
  end if;
  perform app_private.fail('Formato de imagem não permitido.');
end $$;
revoke execute on function public.app_brand_asset_begin(uuid, text, text) from public, anon, authenticated;
grant execute on function public.app_brand_asset_begin(uuid, text, text) to service_role;

create function public.app_brand_asset_commit(p_actor_id uuid, p_variant text, p_path text, p_course_id uuid, p_ratio double precision)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  current_brand app_private.installation_brand;
  course public.courses;
  previous text;
  pattern text := case p_variant when 'light' then '^logo/light-' when 'dark' then '^logo/dark-' when 'icon' then '^icon/' when 'signature' then '^signature/' end
    || '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.' || case when p_variant in ('light', 'dark') then '(png|webp|svg)$' when p_variant = 'icon' then '(png|svg)$' else 'png$' end;
begin
  perform app_private.service_actor(p_actor_id);
  if not app_private.is_staff(p_actor_id, array['admin']) then perform app_private.fail(); end if;
  if (p_ratio is not null and (p_path is null or p_variant = 'signature' or
    p_ratio not between (1.0 / 4096) and 4096 or (p_variant = 'icon' and p_ratio <> 1)))
    or (p_path ~ '\.svg$' and p_ratio is null) then
    perform app_private.fail('Proporção da imagem inválida.');
  end if;
  if pattern is null or (p_variant = 'signature') <> (p_course_id is not null) or (p_path is not null and (
    p_path !~ pattern or not exists(select 1 from storage.objects where bucket_id = 'icarus-brand' and name = p_path
      and (p_path !~ '\.svg$' or metadata->>'mimetype' = 'image/svg+xml'))
  )) then
    perform app_private.fail('Imagem indisponível. Envie o arquivo novamente.');
  end if;

  if p_variant = 'signature' then
    select * into course from public.courses where id = p_course_id for update;
    if not found then perform app_private.fail('Curso indisponível.'); end if;
    -- Cada arquivo de assinatura pertence a um curso; os certificados emitidos guardam o seu.
    if p_path is distinct from course.signature_path and (exists(select 1 from public.courses where signature_path = p_path)
      or exists(select 1 from public.certificates where signature_path = p_path)) then
      perform app_private.fail('Imagem indisponível. Envie o arquivo novamente.');
    end if;
    previous := course.signature_path;
    if previous is not distinct from p_path then
      previous := null;
    else
      update public.courses set signature_path = p_path, signature_url = null where id = p_course_id;
      perform app_private.audit(p_actor_id, case when p_path is null then 'remove' else 'save' end, 'course_signature', p_course_id);
      if exists(select 1 from public.certificates where signature_path = previous) then previous := null; end if;
    end if;
    return jsonb_build_object('signature_path', p_path, 'previous', previous);
  end if;

  select * into strict current_brand from app_private.installation_brand where singleton for update;
  previous := case p_variant when 'light' then current_brand.logo_light when 'dark' then current_brand.logo_dark else current_brand.icon end;
  if previous is not distinct from p_path then
    previous := null;
  else
    update app_private.installation_brand set
      logo_light = case when p_variant = 'light' then p_path else logo_light end,
      logo_dark = case when p_variant = 'dark' then p_path else logo_dark end,
      logo_light_ratio = case when p_variant = 'light' then p_ratio else logo_light_ratio end,
      logo_dark_ratio = case when p_variant = 'dark' then p_ratio else logo_dark_ratio end,
      icon = case when p_variant = 'icon' then p_path else icon end
    where singleton returning * into current_brand;
    perform app_private.audit(p_actor_id, case when p_path is null then 'remove' else 'save' end,
      case p_variant when 'icon' then 'installation_icon' else 'installation_logo_' || p_variant end, null);
  end if;
  return jsonb_build_object('logo_light', current_brand.logo_light, 'logo_dark', current_brand.logo_dark, 'icon', current_brand.icon,
    'logo_light_ratio', current_brand.logo_light_ratio, 'logo_dark_ratio', current_brand.logo_dark_ratio, 'previous', previous);
end $$;
revoke execute on function public.app_brand_asset_commit(uuid, text, text, uuid, double precision) from public, anon, authenticated;
grant execute on function public.app_brand_asset_commit(uuid, text, text, uuid, double precision) to service_role;

-- A função publicada na 2.8.0 continua valendo durante a troca da Edge e para assinaturas.
create or replace function public.app_brand_asset_commit(p_actor_id uuid, p_variant text, p_path text, p_course_id uuid default null)
returns jsonb language sql security definer set search_path = '' as $$
  select public.app_brand_asset_commit(p_actor_id, p_variant, p_path, p_course_id, null::double precision)
    - 'logo_light_ratio' - 'logo_dark_ratio'
$$;
revoke execute on function public.app_brand_asset_commit(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.app_brand_asset_commit(uuid, text, text, uuid) to service_role;

create or replace function public.app_public_context() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('modules',app_private.modules_json(),'name',(select name from app_private.installation_brand where singleton),'logo_light',(select logo_light from app_private.installation_brand where singleton),'logo_dark',(select logo_dark from app_private.installation_brand where singleton),'icon',(select icon from app_private.installation_brand where singleton),'logo_light_ratio',(select logo_light_ratio from app_private.installation_brand where singleton),'logo_dark_ratio',(select logo_dark_ratio from app_private.installation_brand where singleton),'legal_ready',(select count(distinct kind)=2 from public.legal_versions where published and not demo),'registration_enabled',(select count(distinct kind)=2 from public.legal_versions where published and not demo),
 'legal_versions',coalesce((select jsonb_agg(jsonb_build_object('id',id,'kind',kind,'version',version,'title',title,'body',body,'demo',demo)) from public.legal_versions where published),'[]'::jsonb),'plans',coalesce((select jsonb_agg(to_jsonb(p)-'created_at') from public.plans p where active),'[]'::jsonb),'onboarding_questions',coalesce((select jsonb_agg(to_jsonb(q) order by order_index,id) from public.onboarding_questions q where active),'[]'::jsonb))
$$;

create or replace function public.app_bootstrap() returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.actor(true);oid uuid;begin
 for oid in select o.id from public.orders o join auth.users a on a.id=u and a.email_confirmed_at is not null and lower(a.email)=lower(o.buyer_data->>'email') where o.status='paid' and o.finalized_at is null and (o.user_id is null or o.user_id=u) loop perform app_private.finalize_order(oid,u);end loop;
 return jsonb_build_object('profile',app_private.profile_json(u),'plans',coalesce((select jsonb_agg(to_jsonb(p)-'created_at') from public.plans p where active),'[]'::jsonb),'settings',jsonb_build_object('modules',app_private.modules_json(),'name',(select name from app_private.installation_brand where singleton),'name_revision',(select revision from app_private.installation_brand where singleton),'logo_light',(select logo_light from app_private.installation_brand where singleton),'logo_dark',(select logo_dark from app_private.installation_brand where singleton),'icon',(select icon from app_private.installation_brand where singleton),'logo_light_ratio',(select logo_light_ratio from app_private.installation_brand where singleton),'logo_dark_ratio',(select logo_dark_ratio from app_private.installation_brand where singleton),'terms_url','/termos','privacy_url','/privacidade','onboarding',(select to_jsonb(o)-'singleton' from public.onboarding o limit 1),'onboarding_questions',coalesce((select jsonb_agg(to_jsonb(q) order by order_index,id) from public.onboarding_questions q where active),'[]'::jsonb),'capabilities',jsonb_build_object('checkout',false,'bunny',false)),
 'orders',coalesce((select jsonb_agg(jsonb_build_object('id',id,'plan_id',plan_id,'status',status,'amount_cents',amount_cents,'created_at',created_at,'checkout_url',checkout_url) order by created_at desc) from public.orders where user_id=u),'[]'::jsonb));
end $$;

revoke execute on function public.app_public_context() from public, anon, authenticated;
grant execute on function public.app_public_context() to anon, authenticated;
comment on function public.app_public_context() is 'anon-ok: configuração pública, marca e versões legais, sem segredos';
revoke execute on function public.app_bootstrap() from public, anon, authenticated;
grant execute on function public.app_bootstrap() to authenticated;

notify pgrst, 'reload schema';
commit;
