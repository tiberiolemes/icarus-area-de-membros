begin;

-- Modelo global do certificado: responsável, cargo e assinatura, guardados com a marca da instalação.
alter table app_private.installation_brand
  add column certificate_signer_name text not null default '' check (char_length(certificate_signer_name) <= 160),
  add column certificate_signer_title text not null default '' check (char_length(certificate_signer_title) <= 160),
  add column certificate_signature_path text check (certificate_signature_path ~ '^signature/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$');

-- Curso com nome e cargo nulos usa o modelo global; preenchidos, personaliza só aquele curso.
-- A troca de modo passa pelo app_admin_save que já existe (signer_name e signer_title nulos).
alter table public.courses
  alter column signer_name drop not null,
  alter column signer_title drop not null,
  add constraint courses_signer_mode_check check ((signer_name is null) = (signer_title is null));
-- Quem já tem responsável preenchido continua personalizado; os demais passam a usar o modelo.
update public.courses set signer_name = null, signer_title = null where btrim(signer_name) = '' and btrim(signer_title) = '';

create function public.app_admin_certificate_defaults() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform app_private.require_role(array['admin', 'instructor']);
  return (select jsonb_build_object('signer_name', certificate_signer_name, 'signer_title', certificate_signer_title, 'signature_path', certificate_signature_path)
    from app_private.installation_brand where singleton);
end $$;
revoke execute on function public.app_admin_certificate_defaults() from public, anon, authenticated, service_role;
grant execute on function public.app_admin_certificate_defaults() to authenticated;

create function public.app_admin_save_certificate_defaults(p_signer_name text, p_signer_title text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := app_private.require_role(array['admin']);
  signer_name text := btrim(p_signer_name);
  signer_title text := btrim(p_signer_title);
  current_brand app_private.installation_brand;
begin
  if signer_name is null or signer_title is null or char_length(signer_name) not between 3 and 160 or char_length(signer_title) not between 2 and 160 then
    perform app_private.fail('Informe o nome do responsável, com 3 a 160 caracteres, e o cargo, com 2 a 160.');
  end if;
  update app_private.installation_brand set certificate_signer_name = signer_name, certificate_signer_title = signer_title
  where singleton and (certificate_signer_name, certificate_signer_title) is distinct from (signer_name, signer_title)
  returning * into current_brand;
  if found then
    perform app_private.audit(actor_id, 'save', 'certificate_defaults', null);
  else
    select * into strict current_brand from app_private.installation_brand where singleton;
  end if;
  return jsonb_build_object('signer_name', current_brand.certificate_signer_name, 'signer_title', current_brand.certificate_signer_title,
    'signature_path', current_brand.certificate_signature_path);
end $$;
revoke execute on function public.app_admin_save_certificate_defaults(text, text) from public, anon, authenticated, service_role;
grant execute on function public.app_admin_save_certificate_defaults(text, text) to authenticated;

-- Assinatura sem curso é a do modelo global. O restante é a função da 202611260013.
create or replace function public.app_brand_asset_commit(p_actor_id uuid, p_variant text, p_path text, p_course_id uuid, p_ratio double precision)
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
  if pattern is null or (p_variant <> 'signature' and p_course_id is not null) or (p_path is not null and (
    p_path !~ pattern or not exists(select 1 from storage.objects where bucket_id = 'icarus-brand' and name = p_path
      and (p_path !~ '\.svg$' or metadata->>'mimetype' = 'image/svg+xml'))
  )) then
    perform app_private.fail('Imagem indisponível. Envie o arquivo novamente.');
  end if;

  if p_variant = 'signature' then
    if p_course_id is null then
      select * into strict current_brand from app_private.installation_brand where singleton for update;
      previous := current_brand.certificate_signature_path;
    else
      select * into course from public.courses where id = p_course_id for update;
      if not found then perform app_private.fail('Curso indisponível.'); end if;
      previous := course.signature_path;
    end if;
    -- Cada arquivo de assinatura pertence a um curso ou ao modelo; os certificados emitidos guardam o seu.
    if p_path is distinct from previous and (exists(select 1 from public.courses where signature_path = p_path)
      or exists(select 1 from public.certificates where signature_path = p_path)
      or exists(select 1 from app_private.installation_brand where certificate_signature_path = p_path)) then
      perform app_private.fail('Imagem indisponível. Envie o arquivo novamente.');
    end if;
    if previous is not distinct from p_path then
      previous := null;
    else
      if p_course_id is null then
        update app_private.installation_brand set certificate_signature_path = p_path where singleton;
        perform app_private.audit(p_actor_id, case when p_path is null then 'remove' else 'save' end, 'certificate_defaults', null);
      else
        update public.courses set signature_path = p_path, signature_url = null where id = p_course_id;
        perform app_private.audit(p_actor_id, case when p_path is null then 'remove' else 'save' end, 'course_signature', p_course_id);
      end if;
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
revoke execute on function public.app_brand_asset_commit(uuid, text, text, uuid, double precision) from public, anon, authenticated, service_role;
grant execute on function public.app_brand_asset_commit(uuid, text, text, uuid, double precision) to service_role;

-- Publicar com certificado exige responsável: o do curso ou, se ele usa o modelo, o global.
-- Curso novo sem responsável próprio nasce usando o modelo. O restante é a função da 202611250003.
create or replace function app_private.validate_course() returns trigger language plpgsql set search_path='' as $$
declare signer_name text;signer_title text;begin
 if tg_op='INSERT' and btrim(coalesce(new.signer_name,''))='' and btrim(coalesce(new.signer_title,''))='' then new.signer_name:=null;new.signer_title:=null;end if;
 if new.status='published' and new.certificate_enabled then
  select coalesce(new.signer_name,b.certificate_signer_name),coalesce(new.signer_title,b.certificate_signer_title) into signer_name,signer_title from app_private.installation_brand b where b.singleton;
  if length(trim(signer_name))<3 or length(trim(signer_title))<2 then perform app_private.fail('Configure o responsável pelo certificado antes de publicar.');end if;
 end if;
 if new.cover_url is not null and (new.cover_url !~ '^course-cover/[a-f0-9-]{36}/[a-f0-9-]{36}\.(jpg|jpeg|png|webp)$' and new.cover_url !~ '^demo/') then perform app_private.fail('Use o upload privado para a capa.');end if;
 if new.signature_url is not null then perform app_private.fail('Envie a assinatura em PNG na aba Certificado do curso.');end if;
 return new;
end $$;

-- Elegibilidade confere o responsável efetivo. O restante é a função da 202611230015.
create or replace function app_private.certificate_eligibility(p_actor uuid,p_course uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c public.courses;p public.profiles;issued public.certificates;reason text;b app_private.installation_brand;begin
 select * into c from public.courses where id=p_course;
 select * into p from public.profiles where id=p_actor;
 select * into b from app_private.installation_brand where singleton;
 if p.id is null or p.suspended or p.password_setup_required then reason:='Seu acesso está indisponível ou exige a definição da senha.';
 elsif c.id is null or c.status<>'published' then reason:='Curso indisponível para emissão.';
 elsif not c.certificate_enabled then reason:='Este curso não emite certificado.';
 elsif not app_private.entitled(p_actor,c.access_mode,c.plan_ids) then reason:='Seu plano ou sua vigência não permite emitir este certificado.';
 elsif length(trim(p.full_name))<3 then reason:='Preencha seu nome completo para emitir o certificado.';
 elsif length(trim(coalesce(c.signer_name,b.certificate_signer_name)))<3 or length(trim(coalesce(c.signer_title,b.certificate_signer_title)))<2 then reason:='O responsável pelo certificado ainda não foi configurado.';
 elsif cardinality(c.required_lesson_ids)=0 then reason:='O curso ainda não possui currículo obrigatório publicado.';
 elsif not exists(select 1 from public.lessons where id=any(c.required_lesson_ids) and not is_preview) then reason:='A conclusão apenas de prévias não emite certificado.';
 elsif coalesce((select sum(duration_seconds) from public.lessons where id=any(c.required_lesson_ids)),0)<=0 then reason:='A carga horária do curso ainda não foi configurada.';
 elsif exists(select 1 from unnest(c.required_lesson_ids) x left join public.lessons l on l.id=x left join public.sections s on s.id=l.section_id left join public.modules m on m.id=s.module_id where l.id is null or l.status<>'published' or s.status<>'published' or m.status<>'published' or (m.access_mode<>'inherit' and not app_private.entitled(p_actor,m.access_mode,m.plan_ids))) then reason:='Há aulas obrigatórias indisponíveis para seu acesso.';
 elsif exists(select 1 from unnest(c.required_lesson_ids) x where not exists(select 1 from public.lesson_progress lp where lp.user_id=p_actor and lp.lesson_id=x and lp.completed_at is not null)) then reason:='Conclua todas as aulas obrigatórias para emitir o certificado.';
 end if;
 if reason is not null then return jsonb_build_object('can_issue',false,'certificate_reason',reason,'certificate_code',null);end if;
 select * into issued from public.certificates where user_id=p_actor and course_id=c.id and curriculum_version=c.curriculum_version;
 if found then return jsonb_build_object('can_issue',false,'certificate_reason',case when issued.revoked_at is null then 'Certificado já emitido.' else 'Este certificado foi revogado.' end,'certificate_code',case when issued.revoked_at is null then issued.code end);end if;
 return jsonb_build_object('can_issue',true,'certificate_reason',null,'certificate_code',null);
end $$;
revoke execute on function app_private.certificate_eligibility(uuid,uuid) from public,anon,authenticated;

-- A emissão copia o responsável efetivo; o certificado guarda o da emissão. O restante é a função da 202611250003.
create or replace function app_private.issue_certificate(p_actor uuid,p_course uuid) returns text language plpgsql security definer set search_path='' as $$
declare c public.courses;b app_private.installation_brand;eligibility jsonb;code_out text;begin
 -- Adquira o perfil antes do curso, na mesma ordem da emissão por progresso.
 perform app_private.lock_lesson_engagement_actor(p_actor);
 select * into c from public.courses where id=p_course for update;
 if not found then return null;end if;
 eligibility:=app_private.certificate_eligibility(p_actor,p_course);
 if eligibility->>'certificate_code' is not null then return eligibility->>'certificate_code';end if;
 if not (eligibility->>'can_issue')::boolean then return null;end if;
 select * into b from app_private.installation_brand where singleton;
 insert into public.certificates(user_id,course_id,curriculum_version,student_name,course_title,duration_minutes,lesson_ids,demo,signer_name,signer_title,signature_url,signature_path)
 values(p_actor,c.id,c.curriculum_version,(select full_name from public.profiles where id=p_actor),c.title,(select ceil(sum(duration_seconds)/60.0) from public.lessons where id=any(c.required_lesson_ids)),c.required_lesson_ids,(select demo from public.profiles where id=p_actor),
  coalesce(c.signer_name,b.certificate_signer_name),coalesce(c.signer_title,b.certificate_signer_title),c.signature_url,case when c.signer_name is null then b.certificate_signature_path else c.signature_path end)
 on conflict(user_id,course_id,curriculum_version) do nothing;
 select code into code_out from public.certificates where user_id=p_actor and course_id=c.id and curriculum_version=c.curriculum_version and revoked_at is null;
 return code_out;
end $$;
revoke execute on function app_private.issue_certificate(uuid,uuid) from public,anon,authenticated;

notify pgrst, 'reload schema';
commit;
