begin;

-- Marca da instalação num bucket público só dela: logo colorida (fundo claro), branca (fundo escuro),
-- favicon e assinatura do certificado (por curso, copiada para o certificado na emissão).
alter table app_private.installation_brand
  add column logo_light text check (logo_light ~ '^logo/light-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|webp)$'),
  add column logo_dark text check (logo_dark ~ '^logo/dark-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|webp)$'),
  add column icon text check (icon ~ '^icon/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$');
alter table public.courses add column signature_path text check (signature_path ~ '^signature/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$');
alter table public.certificates add column signature_path text check (signature_path ~ '^signature/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$');

-- Leitura só pela URL pública. Sem policy em storage.objects: listar e gravar ficam negados a anon e authenticated; só a Edge grava, com a service role.
-- Não altera um bucket de mesmo nome que já exista: num projeto compartilhado ele pode ser de outro sistema.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('icarus-brand', 'icarus-brand', true, 512000, array['image/png', 'image/webp'])
on conflict (id) do nothing;
do $$
begin
  if not exists(select 1 from storage.buckets where id = 'icarus-brand' and public and file_size_limit = 512000 and allowed_mime_types = array['image/png', 'image/webp']) then
    raise exception 'O bucket icarus-brand já existe com outra configuração (público, limite ou tipos). Ele pode ser de outro sistema: confira antes de instalar a logo do Icarus.';
  end if;
end $$;

create function public.app_brand_asset_begin(p_actor_id uuid, p_variant text, p_content_type text)
returns text language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.service_actor(p_actor_id);
  if not app_private.is_staff(p_actor_id, array['admin']) then perform app_private.fail(); end if;
  perform app_private.throttle(p_actor_id, 'brand-asset', 10);
  if p_variant in ('light', 'dark') and p_content_type in ('image/png', 'image/webp') then
    return 'logo/' || p_variant || '-' || gen_random_uuid() || case p_content_type when 'image/png' then '.png' else '.webp' end;
  elsif p_variant in ('icon', 'signature') and p_content_type = 'image/png' then
    return p_variant || '/' || gen_random_uuid() || '.png';
  end if;
  perform app_private.fail('Envie a imagem em PNG (a logo também aceita WebP).');
end $$;
revoke execute on function public.app_brand_asset_begin(uuid, text, text) from public, anon, authenticated;
grant execute on function public.app_brand_asset_begin(uuid, text, text) to service_role;

-- Grava (ou remove, com caminho nulo) e devolve o objeto anterior, que a Edge só apaga depois deste commit.
create function public.app_brand_asset_commit(p_actor_id uuid, p_variant text, p_path text, p_course_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  current_brand app_private.installation_brand;
  course public.courses;
  previous text;
  pattern text := case p_variant when 'light' then '^logo/light-' when 'dark' then '^logo/dark-' when 'icon' then '^icon/' when 'signature' then '^signature/' end
    || '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.' || case when p_variant in ('light', 'dark') then '(png|webp)$' else 'png$' end;
begin
  perform app_private.service_actor(p_actor_id);
  if not app_private.is_staff(p_actor_id, array['admin']) then perform app_private.fail(); end if;
  if pattern is null or (p_variant = 'signature') <> (p_course_id is not null) or (p_path is not null and (
    p_path !~ pattern or not exists(select 1 from storage.objects where bucket_id = 'icarus-brand' and name = p_path)
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
      icon = case when p_variant = 'icon' then p_path else icon end
    where singleton returning * into current_brand;
    perform app_private.audit(p_actor_id, case when p_path is null then 'remove' else 'save' end,
      case p_variant when 'icon' then 'installation_icon' else 'installation_logo_' || p_variant end, null);
  end if;
  return jsonb_build_object('logo_light', current_brand.logo_light, 'logo_dark', current_brand.logo_dark, 'icon', current_brand.icon, 'previous', previous);
end $$;
revoke execute on function public.app_brand_asset_commit(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.app_brand_asset_commit(uuid, text, text, uuid) to service_role;

create or replace function public.app_public_context() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('name',(select name from app_private.installation_brand where singleton),'logo_light',(select logo_light from app_private.installation_brand where singleton),'logo_dark',(select logo_dark from app_private.installation_brand where singleton),'icon',(select icon from app_private.installation_brand where singleton),'legal_ready',(select count(distinct kind)=2 from public.legal_versions where published and not demo),'registration_enabled',(select count(distinct kind)=2 from public.legal_versions where published and not demo),
 'legal_versions',coalesce((select jsonb_agg(jsonb_build_object('id',id,'kind',kind,'version',version,'title',title,'body',body,'demo',demo)) from public.legal_versions where published),'[]'::jsonb),'plans',coalesce((select jsonb_agg(to_jsonb(p)-'created_at') from public.plans p where active),'[]'::jsonb),'onboarding_questions',coalesce((select jsonb_agg(to_jsonb(q) order by order_index,id) from public.onboarding_questions q where active),'[]'::jsonb))
$$;
revoke execute on function public.app_public_context() from public, anon, authenticated;
grant execute on function public.app_public_context() to anon, authenticated;
comment on function public.app_public_context() is 'anon-ok: configuração pública, marca e versões legais, sem segredos';

create or replace function public.app_bootstrap() returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.actor(true);oid uuid;begin
 for oid in select o.id from public.orders o join auth.users a on a.id=u and a.email_confirmed_at is not null and lower(a.email)=lower(o.buyer_data->>'email') where o.status='paid' and o.finalized_at is null and (o.user_id is null or o.user_id=u) loop perform app_private.finalize_order(oid,u);end loop;
 return jsonb_build_object('profile',app_private.profile_json(u),'plans',coalesce((select jsonb_agg(to_jsonb(p)-'created_at') from public.plans p where active),'[]'::jsonb),'settings',jsonb_build_object('name',(select name from app_private.installation_brand where singleton),'name_revision',(select revision from app_private.installation_brand where singleton),'logo_light',(select logo_light from app_private.installation_brand where singleton),'logo_dark',(select logo_dark from app_private.installation_brand where singleton),'icon',(select icon from app_private.installation_brand where singleton),'terms_url','/termos','privacy_url','/privacidade','onboarding',(select to_jsonb(o)-'singleton' from public.onboarding o limit 1),'onboarding_questions',coalesce((select jsonb_agg(to_jsonb(q) order by order_index,id) from public.onboarding_questions q where active),'[]'::jsonb),'capabilities',jsonb_build_object('checkout',false,'bunny',false)),
 'orders',coalesce((select jsonb_agg(jsonb_build_object('id',id,'plan_id',plan_id,'status',status,'amount_cents',amount_cents,'created_at',created_at,'checkout_url',checkout_url) order by created_at desc) from public.orders where user_id=u),'[]'::jsonb));
end $$;
revoke execute on function public.app_bootstrap() from public, anon, authenticated;
grant execute on function public.app_bootstrap() to authenticated;

-- A emissão copia a assinatura do curso, como já fazia com nome, cargo e URL.
create or replace function app_private.issue_certificate(p_actor uuid,p_course uuid) returns text language plpgsql security definer set search_path='' as $$
declare c public.courses;eligibility jsonb;code_out text;begin
 -- Adquira o perfil antes do curso, na mesma ordem da emissão por progresso.
 perform app_private.lock_lesson_engagement_actor(p_actor);
 select * into c from public.courses where id=p_course for update;
 if not found then return null;end if;
 eligibility:=app_private.certificate_eligibility(p_actor,p_course);
 if eligibility->>'certificate_code' is not null then return eligibility->>'certificate_code';end if;
 if not (eligibility->>'can_issue')::boolean then return null;end if;
 insert into public.certificates(user_id,course_id,curriculum_version,student_name,course_title,duration_minutes,lesson_ids,demo,signer_name,signer_title,signature_url,signature_path)
 values(p_actor,c.id,c.curriculum_version,(select full_name from public.profiles where id=p_actor),c.title,(select ceil(sum(duration_seconds)/60.0) from public.lessons where id=any(c.required_lesson_ids)),c.required_lesson_ids,(select demo from public.profiles where id=p_actor),c.signer_name,c.signer_title,c.signature_url,c.signature_path)
 on conflict(user_id,course_id,curriculum_version) do nothing;
 select code into code_out from public.certificates where user_id=p_actor and course_id=c.id and curriculum_version=c.curriculum_version and revoked_at is null;
 return code_out;
end $$;
revoke execute on function app_private.issue_certificate(uuid,uuid) from public,anon,authenticated;

create or replace function public.app_certificate(p_code text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;begin
 if p_code is null or length(p_code)<>48 then perform app_private.fail('Certificado indisponível.');end if;
 select jsonb_build_object('id',id,'code',code,'student_name',student_name,'course_title',course_title,'duration_minutes',duration_minutes,'issued_at',issued_at,'revoked_at',revoked_at,'demo',demo,'signer_name',signer_name,'signer_title',signer_title,'signature_url',signature_url,'signature_path',signature_path) into result from public.certificates where code=p_code;
 if result is null then perform app_private.fail('Certificado indisponível.');end if;return result;
end $$;
revoke execute on function public.app_certificate(text) from public,anon,authenticated;grant execute on function public.app_certificate(text) to anon,authenticated;
comment on function public.app_certificate(text) is 'anon-ok: código opaco, snapshot de emissão, sem email/CPF ou listagem';

notify pgrst, 'reload schema';
commit;
