begin;

-- Marcação por plano: a conta do Asaas não repassa juros do parcelamento ao aluno.
alter table public.plans add column interest_free boolean not null default false;

-- Recriada a partir de 202611280001_material_lessons.sql. Mudam o ramo de planos e storage_path, que aula e material deixam de aceitar.
-- O caminho vem só do upload, e a exclusão definitiva apaga do Storage apenas os caminhos dos uploads.
create or replace function public.app_admin_save(p_entity text,p_id uuid,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.require_role(app_private.entity_roles(p_entity));id_out uuid:=coalesce(p_id,gen_random_uuid());old_data jsonb;ids uuid[];cid uuid;begin
 case p_entity
 when 'courses' then
  perform app_private.validate_keys(p_data,array['slug','title','description','cover_url','status','access_mode','plan_ids','certificate_enabled','signer_name','signer_title','signature_url']);
  if p_id is not null then select to_jsonb(t) into old_data from public.courses t where id=p_id for update;if old_data is null then perform app_private.fail('Registro indisponível.');end if;end if;
  if p_data->>'status'='archived' or old_data->>'status'='archived' then perform app_private.fail('Use arquivar ou restaurar com confirmação.');end if;
  if p_id is null then
   insert into public.courses(id,slug,title,description,cover_url,status,access_mode,plan_ids,certificate_enabled,signer_name,signer_title,signature_url) values(id_out,coalesce((p_data->>'slug')::text,''),coalesce((p_data->>'title')::text,''),coalesce((p_data->>'description')::text,''),coalesce((p_data->>'cover_url')::text,null),coalesce((p_data->>'status')::text,'draft'),coalesce((p_data->>'access_mode')::text,'subscribers'),coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(p_data->'plan_ids') x),'{}'::uuid[]),coalesce((p_data->>'certificate_enabled')::boolean,false),coalesce((p_data->>'signer_name')::text,''),coalesce((p_data->>'signer_title')::text,''),coalesce((p_data->>'signature_url')::text,null));
  else
   update public.courses set slug=case when p_data?'slug' then (p_data->>'slug')::text else slug end,title=case when p_data?'title' then (p_data->>'title')::text else title end,description=case when p_data?'description' then (p_data->>'description')::text else description end,cover_url=case when p_data?'cover_url' then (p_data->>'cover_url')::text else cover_url end,status=case when p_data?'status' then (p_data->>'status')::text else status end,access_mode=case when p_data?'access_mode' then (p_data->>'access_mode')::text else access_mode end,plan_ids=case when p_data?'plan_ids' then coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(p_data->'plan_ids') x),'{}'::uuid[]) else plan_ids end,certificate_enabled=case when p_data?'certificate_enabled' then (p_data->>'certificate_enabled')::boolean else certificate_enabled end,signer_name=case when p_data?'signer_name' then (p_data->>'signer_name')::text else signer_name end,signer_title=case when p_data?'signer_title' then (p_data->>'signer_title')::text else signer_title end,signature_url=case when p_data?'signature_url' then (p_data->>'signature_url')::text else signature_url end where id=id_out;
  end if;
  if p_data->>'status'='published' then
   if exists(select 1 from public.courses where id=id_out and certificate_enabled and (length(trim(signer_name))<3 or length(trim(signer_title))<2)) then perform app_private.fail('Configure o responsável pelo certificado antes de publicar.');end if;
   perform app_private.refresh_curriculum(id_out);
  end if;
  if exists(select 1 from public.courses t,unnest(t.plan_ids) x where t.id=id_out and not exists(select 1 from public.plans where id=x)) then perform app_private.fail('Plano inválido.');end if;
 when 'modules' then
  perform app_private.validate_keys(p_data,array['course_id','slug','title','order_index','status','access_mode','plan_ids']);
  if p_id is not null then select to_jsonb(t) into old_data from public.modules t where id=p_id for update;if old_data is null then perform app_private.fail('Registro indisponível.');end if;end if;
  if p_id is not null and p_data?'course_id' and (p_data->'course_id') is distinct from (old_data->'course_id') then perform app_private.fail('O vínculo original deve ser preservado.');end if;
  if p_data->>'status'='archived' or old_data->>'status'='archived' then perform app_private.fail('Use arquivar ou restaurar com confirmação.');end if;
  if p_id is null then
   insert into public.modules(id,course_id,slug,title,order_index,status,access_mode,plan_ids) values(id_out,coalesce((p_data->>'course_id')::uuid,null),coalesce((p_data->>'slug')::text,''),coalesce((p_data->>'title')::text,''),coalesce((p_data->>'order_index')::integer,0),coalesce((p_data->>'status')::text,'draft'),coalesce((p_data->>'access_mode')::text,'inherit'),coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(p_data->'plan_ids') x),'{}'::uuid[]));
  else
   update public.modules set course_id=case when p_data?'course_id' then (p_data->>'course_id')::uuid else course_id end,slug=case when p_data?'slug' then (p_data->>'slug')::text else slug end,title=case when p_data?'title' then (p_data->>'title')::text else title end,order_index=case when p_data?'order_index' then (p_data->>'order_index')::integer else order_index end,status=case when p_data?'status' then (p_data->>'status')::text else status end,access_mode=case when p_data?'access_mode' then (p_data->>'access_mode')::text else access_mode end,plan_ids=case when p_data?'plan_ids' then coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(p_data->'plan_ids') x),'{}'::uuid[]) else plan_ids end where id=id_out;
  end if;
  if exists(select 1 from public.modules t,unnest(t.plan_ids) x where t.id=id_out and not exists(select 1 from public.plans where id=x)) then perform app_private.fail('Plano inválido.');end if;
  if exists(select 1 from public.modules m join public.courses c on c.id=m.course_id where m.id=id_out and m.status='published' and c.status='archived') then perform app_private.fail('Curso arquivado.');end if;
 when 'sections' then
  perform app_private.validate_keys(p_data,array['module_id','title','order_index','is_bonus','status']);
  if p_id is not null then select to_jsonb(t) into old_data from public.sections t where id=p_id for update;if old_data is null then perform app_private.fail('Registro indisponível.');end if;end if;
  if p_id is not null and p_data?'module_id' and (p_data->'module_id') is distinct from (old_data->'module_id') then perform app_private.fail('O vínculo original deve ser preservado.');end if;
  if p_data->>'status'='archived' or old_data->>'status'='archived' then perform app_private.fail('Use arquivar ou restaurar com confirmação.');end if;
  if p_id is null then
   insert into public.sections(id,module_id,title,order_index,is_bonus,status) values(id_out,coalesce((p_data->>'module_id')::uuid,null),coalesce((p_data->>'title')::text,''),coalesce((p_data->>'order_index')::integer,0),coalesce((p_data->>'is_bonus')::boolean,false),coalesce((p_data->>'status')::text,'draft'));
  else
   update public.sections set module_id=case when p_data?'module_id' then (p_data->>'module_id')::uuid else module_id end,title=case when p_data?'title' then (p_data->>'title')::text else title end,order_index=case when p_data?'order_index' then (p_data->>'order_index')::integer else order_index end,is_bonus=case when p_data?'is_bonus' then (p_data->>'is_bonus')::boolean else is_bonus end,status=case when p_data?'status' then (p_data->>'status')::text else status end where id=id_out;
  end if;
  if exists(select 1 from public.sections s join public.modules m on m.id=s.module_id where s.id=id_out and s.status='published' and m.status='archived') then perform app_private.fail('Módulo arquivado.');end if;
 when 'lessons' then
  perform app_private.validate_keys(p_data,array['section_id','slug','title','body','type','duration_seconds','video_id','is_preview','is_required','order_index','status']);
  if p_id is not null then select to_jsonb(t) into old_data from public.lessons t where id=p_id for update;if old_data is null then perform app_private.fail('Registro indisponível.');end if;end if;
  if p_id is not null and p_data?'section_id' and (p_data->'section_id') is distinct from (old_data->'section_id') then perform app_private.fail('O vínculo original deve ser preservado.');end if;
  if p_data->>'status'='archived' or old_data->>'status'='archived' then perform app_private.fail('Use arquivar ou restaurar com confirmação.');end if;
  if p_id is null then
   insert into public.lessons(id,section_id,slug,title,body,type,duration_seconds,video_id,is_preview,is_required,order_index,status) values(id_out,coalesce((p_data->>'section_id')::uuid,null),coalesce((p_data->>'slug')::text,''),coalesce((p_data->>'title')::text,''),coalesce((p_data->>'body')::text,''),coalesce((p_data->>'type')::text,'text'),coalesce((p_data->>'duration_seconds')::integer,0),coalesce((p_data->>'video_id')::text,null),coalesce((p_data->>'is_preview')::boolean,false),coalesce((p_data->>'is_required')::boolean,true),coalesce((p_data->>'order_index')::integer,0),coalesce((p_data->>'status')::text,'draft'));
  else
   update public.lessons set section_id=case when p_data?'section_id' then (p_data->>'section_id')::uuid else section_id end,slug=case when p_data?'slug' then (p_data->>'slug')::text else slug end,title=case when p_data?'title' then (p_data->>'title')::text else title end,body=case when p_data?'body' then (p_data->>'body')::text else body end,type=case when p_data?'type' then (p_data->>'type')::text else type end,duration_seconds=case when p_data?'duration_seconds' then (p_data->>'duration_seconds')::integer else duration_seconds end,video_id=case when p_data?'video_id' then (p_data->>'video_id')::text else video_id end,is_preview=case when p_data?'is_preview' then (p_data->>'is_preview')::boolean else is_preview end,is_required=case when p_data?'is_required' then (p_data->>'is_required')::boolean else is_required end,order_index=case when p_data?'order_index' then (p_data->>'order_index')::integer else order_index end,status=case when p_data?'status' then (p_data->>'status')::text else status end where id=id_out;
  end if;
  if exists(select 1 from public.lessons l join public.sections s on s.id=l.section_id where l.id=id_out and l.status='published' and s.status='archived') then perform app_private.fail('Seção arquivada.');end if;
 when 'material_folders' then
  perform app_private.validate_keys(p_data,array['name','parent_id','status','access_mode','plan_ids']);
  if p_id is not null then select to_jsonb(t) into old_data from public.material_folders t where id=p_id for update;if old_data is null then perform app_private.fail('Registro indisponível.');end if;end if;
  if p_id is not null and p_data?'parent_id' and (p_data->'parent_id') is distinct from (old_data->'parent_id') then perform app_private.fail('O vínculo original deve ser preservado.');end if;
  if p_data->>'status'='archived' or old_data->>'status'='archived' then perform app_private.fail('Use arquivar ou restaurar com confirmação.');end if;
  if p_id is null then
   insert into public.material_folders(id,name,parent_id,status,access_mode,plan_ids) values(id_out,coalesce((p_data->>'name')::text,''),coalesce((p_data->>'parent_id')::uuid,null),coalesce((p_data->>'status')::text,'draft'),coalesce((p_data->>'access_mode')::text,'subscribers'),coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(p_data->'plan_ids') x),'{}'::uuid[]));
  else
   update public.material_folders set name=case when p_data?'name' then (p_data->>'name')::text else name end,parent_id=case when p_data?'parent_id' then (p_data->>'parent_id')::uuid else parent_id end,status=case when p_data?'status' then (p_data->>'status')::text else status end,access_mode=case when p_data?'access_mode' then (p_data->>'access_mode')::text else access_mode end,plan_ids=case when p_data?'plan_ids' then coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(p_data->'plan_ids') x),'{}'::uuid[]) else plan_ids end where id=id_out;
  end if;
  if exists(select 1 from public.material_folders t,unnest(t.plan_ids) x where t.id=id_out and not exists(select 1 from public.plans where id=x)) then perform app_private.fail('Plano inválido.');end if;
 when 'materials' then
  perform app_private.validate_keys(p_data,array['name','description','folder_id','lesson_id','lesson_ids','file_type','size_bytes','status','access_mode','plan_ids']);
  if p_id is not null then select to_jsonb(t) into old_data from public.materials t where id=p_id for update;if old_data is null then perform app_private.fail('Registro indisponível.');end if;end if;
  if p_data->>'status'='archived' or old_data->>'status'='archived' then perform app_private.fail('Use arquivar ou restaurar com confirmação.');end if;
  if p_id is null then
   insert into public.materials(id,name,description,folder_id,file_type,size_bytes,status,access_mode,plan_ids) values(id_out,coalesce((p_data->>'name')::text,''),coalesce((p_data->>'description')::text,''),coalesce((p_data->>'folder_id')::uuid,null),coalesce((p_data->>'file_type')::text,'application/pdf'),coalesce((p_data->>'size_bytes')::bigint,0),coalesce((p_data->>'status')::text,'draft'),coalesce((p_data->>'access_mode')::text,'subscribers'),coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(p_data->'plan_ids') x),'{}'::uuid[]));
  else
   update public.materials set name=case when p_data?'name' then (p_data->>'name')::text else name end,description=case when p_data?'description' then (p_data->>'description')::text else description end,folder_id=case when p_data?'folder_id' then (p_data->>'folder_id')::uuid else folder_id end,file_type=case when p_data?'file_type' then (p_data->>'file_type')::text else file_type end,size_bytes=case when p_data?'size_bytes' then (p_data->>'size_bytes')::bigint else size_bytes end,status=case when p_data?'status' then (p_data->>'status')::text else status end,access_mode=case when p_data?'access_mode' then (p_data->>'access_mode')::text else access_mode end,plan_ids=case when p_data?'plan_ids' then coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(p_data->'plan_ids') x),'{}'::uuid[]) else plan_ids end where id=id_out;
  end if;
  if exists(select 1 from public.materials t,unnest(t.plan_ids) x where t.id=id_out and not exists(select 1 from public.plans where id=x)) then perform app_private.fail('Plano inválido.');end if;
  -- lesson_ids substitui o conjunto inteiro; lesson_id antigo é ignorado.
  if p_data?'lesson_ids' then
   if jsonb_array_length(p_data->'lesson_ids')>200 then perform app_private.fail('Vincule no máximo 200 aulas.');end if;
   ids:=array(select distinct x::uuid from jsonb_array_elements_text(p_data->'lesson_ids') x);
   if exists(select 1 from unnest(ids) x where not exists(select 1 from public.lessons where id=x)) then perform app_private.fail('Aula indisponível.');end if;
   delete from public.material_lessons where material_id=id_out and lesson_id<>all(ids);
   insert into public.material_lessons(material_id,lesson_id) select id_out,x from unnest(ids) x on conflict do nothing;
  end if;
 when 'plans' then
  perform app_private.validate_keys(p_data,array['name','slug','price_cents','access_months','benefits','active','interest_free']);
  if p_data?'interest_free' and jsonb_typeof(p_data->'interest_free')<>'boolean' then perform app_private.fail('Marcação de parcelamento sem juros inválida.');end if;
  if p_id is not null then select to_jsonb(t) into old_data from public.plans t where id=p_id for update;if old_data is null then perform app_private.fail('Registro indisponível.');end if;end if;
  if p_id is null then
   insert into public.plans(id,name,slug,price_cents,access_months,benefits,active,interest_free) values(id_out,coalesce((p_data->>'name')::text,''),coalesce((p_data->>'slug')::text,''),coalesce((p_data->>'price_cents')::integer,0),coalesce((p_data->>'access_months')::integer,12),coalesce(p_data->'benefits','[]'::jsonb),coalesce((p_data->>'active')::boolean,false),coalesce((p_data->>'interest_free')::boolean,false));
  else
   update public.plans set name=case when p_data?'name' then (p_data->>'name')::text else name end,slug=case when p_data?'slug' then (p_data->>'slug')::text else slug end,price_cents=case when p_data?'price_cents' then (p_data->>'price_cents')::integer else price_cents end,access_months=case when p_data?'access_months' then (p_data->>'access_months')::integer else access_months end,benefits=case when p_data?'benefits' then p_data->'benefits' else benefits end,active=case when p_data?'active' then (p_data->>'active')::boolean else active end,interest_free=case when p_data?'interest_free' then (p_data->>'interest_free')::boolean else interest_free end where id=id_out;
  end if;
 when 'spaces' then
  perform app_private.validate_keys(p_data,array['name','description','status','access_mode','plan_ids','order_index']);
  if p_id is not null then select to_jsonb(t) into old_data from public.spaces t where id=p_id for update;if old_data is null then perform app_private.fail('Registro indisponível.');end if;end if;
  if p_data->>'status'='archived' or old_data->>'status'='archived' then perform app_private.fail('Use arquivar ou restaurar com confirmação.');end if;
  if p_id is null then
   insert into public.spaces(id,name,description,status,access_mode,plan_ids,order_index) values(id_out,coalesce((p_data->>'name')::text,''),coalesce((p_data->>'description')::text,''),coalesce((p_data->>'status')::text,'draft'),coalesce((p_data->>'access_mode')::text,'subscribers'),coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(p_data->'plan_ids') x),'{}'::uuid[]),coalesce((p_data->>'order_index')::integer,0));
  else
   update public.spaces set name=case when p_data?'name' then (p_data->>'name')::text else name end,description=case when p_data?'description' then (p_data->>'description')::text else description end,status=case when p_data?'status' then (p_data->>'status')::text else status end,access_mode=case when p_data?'access_mode' then (p_data->>'access_mode')::text else access_mode end,plan_ids=case when p_data?'plan_ids' then coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(p_data->'plan_ids') x),'{}'::uuid[]) else plan_ids end,order_index=case when p_data?'order_index' then (p_data->>'order_index')::integer else order_index end where id=id_out;
  end if;
  if exists(select 1 from public.spaces t,unnest(t.plan_ids) x where t.id=id_out and not exists(select 1 from public.plans where id=x)) then perform app_private.fail('Plano inválido.');end if;
 when 'legal_versions' then
  perform app_private.validate_keys(p_data,array['kind','version','title','body','published','demo']);
  if p_id is not null then select to_jsonb(t) into old_data from public.legal_versions t where id=p_id for update;if old_data is null then perform app_private.fail('Registro indisponível.');end if;end if;
  if p_id is not null and exists(select 1 from public.legal_acceptances where legal_version_id=p_id) and exists(select 1 from jsonb_each(p_data) x where x.key<>'published' and x.value is distinct from old_data->x.key) then perform app_private.fail('Crie uma nova versão do texto legal.');end if;
  if coalesce((p_data->>'published')::boolean,false) then update public.legal_versions set published=false where kind=coalesce(p_data->>'kind',old_data->>'kind') and id<>id_out;end if;
  if p_id is null then
   insert into public.legal_versions(id,kind,version,title,body,published,demo) values(id_out,coalesce((p_data->>'kind')::text,''),coalesce((p_data->>'version')::text,''),coalesce((p_data->>'title')::text,''),coalesce((p_data->>'body')::text,''),coalesce((p_data->>'published')::boolean,false),coalesce((p_data->>'demo')::boolean,false));
  else
   update public.legal_versions set kind=case when p_data?'kind' then (p_data->>'kind')::text else kind end,version=case when p_data?'version' then (p_data->>'version')::text else version end,title=case when p_data?'title' then (p_data->>'title')::text else title end,body=case when p_data?'body' then (p_data->>'body')::text else body end,published=case when p_data?'published' then (p_data->>'published')::boolean else published end,demo=case when p_data?'demo' then (p_data->>'demo')::boolean else demo end where id=id_out;
  end if;
 when 'onboarding' then
  perform app_private.validate_keys(p_data,array['name_label','company_label','company_required']);
  if p_id is not null then select to_jsonb(t) into old_data from public.onboarding t where id=p_id for update;if old_data is null then perform app_private.fail('Registro indisponível.');end if;end if;
  if p_id is null then
   insert into public.onboarding(id,name_label,company_label,company_required) values(id_out,coalesce((p_data->>'name_label')::text,'Nome completo'),coalesce((p_data->>'company_label')::text,'Empresa'),coalesce((p_data->>'company_required')::boolean,true));
  else
   update public.onboarding set name_label=case when p_data?'name_label' then (p_data->>'name_label')::text else name_label end,company_label=case when p_data?'company_label' then (p_data->>'company_label')::text else company_label end,company_required=case when p_data?'company_required' then (p_data->>'company_required')::boolean else company_required end where id=id_out;
  end if;
 when 'onboarding_questions' then
  perform app_private.validate_keys(p_data,array['key','label','type','options','required','active','order_index']);
  if p_id is not null then select to_jsonb(t) into old_data from public.onboarding_questions t where id=p_id for update;if old_data is null then perform app_private.fail('Registro indisponível.');end if;end if;
  if p_id is null then
   insert into public.onboarding_questions(id,key,label,type,options,required,active,order_index) values(id_out,coalesce((p_data->>'key')::text,''),coalesce((p_data->>'label')::text,''),coalesce((p_data->>'type')::text,'text'),coalesce(p_data->'options','[]'::jsonb),coalesce((p_data->>'required')::boolean,false),coalesce((p_data->>'active')::boolean,true),coalesce((p_data->>'order_index')::integer,0));
  else
   update public.onboarding_questions set key=case when p_data?'key' then (p_data->>'key')::text else key end,label=case when p_data?'label' then (p_data->>'label')::text else label end,type=case when p_data?'type' then (p_data->>'type')::text else type end,options=case when p_data?'options' then p_data->'options' else options end,required=case when p_data?'required' then (p_data->>'required')::boolean else required end,active=case when p_data?'active' then (p_data->>'active')::boolean else active end,order_index=case when p_data?'order_index' then (p_data->>'order_index')::integer else order_index end where id=id_out;
  end if;
 else perform app_private.fail('Esta entidade não permite edição.');end case;
 if p_entity='courses' and exists(select 1 from public.courses c where c.id=id_out and c.status='published' and c.certificate_enabled and (cardinality(c.required_lesson_ids)=0 or not exists(select 1 from public.lessons l where l.id=any(c.required_lesson_ids) and not l.is_preview) or coalesce((select sum(l.duration_seconds) from public.lessons l where l.id=any(c.required_lesson_ids)),0)<=0)) then perform app_private.fail('Configure aulas obrigatórias e carga horária antes de publicar o certificado.');end if;
 perform app_private.audit(u,case when p_id is null then 'create' else 'update' end,p_entity,id_out);
 return jsonb_build_object('id',id_out);
end $$;
revoke execute on function public.app_admin_save(text,uuid,jsonb) from public, anon, authenticated, service_role;
grant execute on function public.app_admin_save(text,uuid,jsonb) to authenticated;

commit;
