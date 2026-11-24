begin;
create or replace function ica_private.actor(p_allow_aal1 boolean default false) returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); sid uuid; p public.ica_profiles; s public.ica_app_sessions; idle interval;
begin
 if u is null then perform ica_private.fail('Sessão inválida. Entre novamente.'); end if;
 sid:=nullif(auth.jwt()->>'session_id','')::uuid;
 select * into p from public.ica_profiles where id=u;
 if not found or p.suspended then perform ica_private.fail('Acesso indisponível.'); end if;
 if sid is null or not exists(select 1 from auth.sessions where id=sid and user_id=u and (not_after is null or not_after>now()) and (p_allow_aal1 or p.role='member' or auth.sessions.aal='aal2')) then perform ica_private.fail('Sessão inválida. Entre novamente.'); end if;
 idle:=case when p.role='member' then interval '2 hours' else interval '30 minutes' end;
 insert into public.ica_app_sessions(id,user_id,expires_at) values(sid,u,now()+idle) on conflict(id) do nothing;
 select * into s from public.ica_app_sessions where id=sid and user_id=u for update;
 if not found or s.revoked_at is not null or least(s.expires_at,s.last_activity_at+idle)<=now() then perform ica_private.fail('Sessão expirada. Entre novamente.'); end if;
 if p.role<>'member' and not p_allow_aal1 and coalesce(auth.jwt()->>'aal','aal1')<>'aal2' then perform ica_private.fail('Confirme o segundo fator para continuar.'); end if;
 return u;
end $$;
create or replace function public.app_admin_save(p_entity text,p_id uuid,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=ica_private.require_role(ica_private.entity_roles(p_entity));id_out uuid:=coalesce(p_id,gen_random_uuid());old_data jsonb;ids uuid[];cid uuid;begin
 case p_entity
 when 'courses' then
  perform ica_private.validate_keys(p_data,array['slug','title','description','cover_url','status','access_mode','plan_ids','certificate_enabled','signer_name','signer_title','signature_url']);
  if p_id is not null then select to_jsonb(t) into old_data from public.ica_courses t where id=p_id for update;if old_data is null then perform ica_private.fail('Registro indisponível.');end if;end if;
  if p_data->>'status'='archived' or old_data->>'status'='archived' then perform ica_private.fail('Use arquivar ou restaurar com confirmação.');end if;
  if p_id is null then
   insert into public.ica_courses(id,slug,title,description,cover_url,status,access_mode,plan_ids,certificate_enabled,signer_name,signer_title,signature_url) values(id_out,coalesce((p_data->>'slug')::text,''),coalesce((p_data->>'title')::text,''),coalesce((p_data->>'description')::text,''),coalesce((p_data->>'cover_url')::text,null),coalesce((p_data->>'status')::text,'draft'),coalesce((p_data->>'access_mode')::text,'subscribers'),coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(p_data->'plan_ids') x),'{}'::uuid[]),coalesce((p_data->>'certificate_enabled')::boolean,false),coalesce((p_data->>'signer_name')::text,''),coalesce((p_data->>'signer_title')::text,''),coalesce((p_data->>'signature_url')::text,null));
  else
   update public.ica_courses set slug=case when p_data?'slug' then (p_data->>'slug')::text else slug end,title=case when p_data?'title' then (p_data->>'title')::text else title end,description=case when p_data?'description' then (p_data->>'description')::text else description end,cover_url=case when p_data?'cover_url' then (p_data->>'cover_url')::text else cover_url end,status=case when p_data?'status' then (p_data->>'status')::text else status end,access_mode=case when p_data?'access_mode' then (p_data->>'access_mode')::text else access_mode end,plan_ids=case when p_data?'plan_ids' then coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(p_data->'plan_ids') x),'{}'::uuid[]) else plan_ids end,certificate_enabled=case when p_data?'certificate_enabled' then (p_data->>'certificate_enabled')::boolean else certificate_enabled end,signer_name=case when p_data?'signer_name' then (p_data->>'signer_name')::text else signer_name end,signer_title=case when p_data?'signer_title' then (p_data->>'signer_title')::text else signer_title end,signature_url=case when p_data?'signature_url' then (p_data->>'signature_url')::text else signature_url end where id=id_out;
  end if;
  if p_data->>'status'='published' then
   if exists(select 1 from public.ica_courses where id=id_out and certificate_enabled and (length(trim(signer_name))<3 or length(trim(signer_title))<2)) then perform ica_private.fail('Configure o responsável pelo certificado antes de publicar.');end if;
   perform ica_private.refresh_curriculum(id_out);
  end if;
  if exists(select 1 from public.ica_courses t,unnest(t.plan_ids) x where t.id=id_out and not exists(select 1 from public.ica_plans where id=x)) then perform ica_private.fail('Plano inválido.');end if;
 when 'modules' then
  perform ica_private.validate_keys(p_data,array['course_id','slug','title','order_index','status','access_mode','plan_ids']);
  if p_id is not null then select to_jsonb(t) into old_data from public.ica_modules t where id=p_id for update;if old_data is null then perform ica_private.fail('Registro indisponível.');end if;end if;
  if p_id is not null and p_data?'course_id' and (p_data->'course_id') is distinct from (old_data->'course_id') then perform ica_private.fail('O vínculo original deve ser preservado.');end if;
  if p_data->>'status'='archived' or old_data->>'status'='archived' then perform ica_private.fail('Use arquivar ou restaurar com confirmação.');end if;
  if p_id is null then
   insert into public.ica_modules(id,course_id,slug,title,order_index,status,access_mode,plan_ids) values(id_out,coalesce((p_data->>'course_id')::uuid,null),coalesce((p_data->>'slug')::text,''),coalesce((p_data->>'title')::text,''),coalesce((p_data->>'order_index')::integer,0),coalesce((p_data->>'status')::text,'draft'),coalesce((p_data->>'access_mode')::text,'inherit'),coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(p_data->'plan_ids') x),'{}'::uuid[]));
  else
   update public.ica_modules set course_id=case when p_data?'course_id' then (p_data->>'course_id')::uuid else course_id end,slug=case when p_data?'slug' then (p_data->>'slug')::text else slug end,title=case when p_data?'title' then (p_data->>'title')::text else title end,order_index=case when p_data?'order_index' then (p_data->>'order_index')::integer else order_index end,status=case when p_data?'status' then (p_data->>'status')::text else status end,access_mode=case when p_data?'access_mode' then (p_data->>'access_mode')::text else access_mode end,plan_ids=case when p_data?'plan_ids' then coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(p_data->'plan_ids') x),'{}'::uuid[]) else plan_ids end where id=id_out;
  end if;
  if exists(select 1 from public.ica_modules t,unnest(t.plan_ids) x where t.id=id_out and not exists(select 1 from public.ica_plans where id=x)) then perform ica_private.fail('Plano inválido.');end if;
  if exists(select 1 from public.ica_modules m join public.ica_courses c on c.id=m.course_id where m.id=id_out and m.status='published' and c.status='archived') then perform ica_private.fail('Curso arquivado.');end if;
 when 'sections' then
  perform ica_private.validate_keys(p_data,array['module_id','title','order_index','is_bonus','status']);
  if p_id is not null then select to_jsonb(t) into old_data from public.ica_sections t where id=p_id for update;if old_data is null then perform ica_private.fail('Registro indisponível.');end if;end if;
  if p_id is not null and p_data?'module_id' and (p_data->'module_id') is distinct from (old_data->'module_id') then perform ica_private.fail('O vínculo original deve ser preservado.');end if;
  if p_data->>'status'='archived' or old_data->>'status'='archived' then perform ica_private.fail('Use arquivar ou restaurar com confirmação.');end if;
  if p_id is null then
   insert into public.ica_sections(id,module_id,title,order_index,is_bonus,status) values(id_out,coalesce((p_data->>'module_id')::uuid,null),coalesce((p_data->>'title')::text,''),coalesce((p_data->>'order_index')::integer,0),coalesce((p_data->>'is_bonus')::boolean,false),coalesce((p_data->>'status')::text,'draft'));
  else
   update public.ica_sections set module_id=case when p_data?'module_id' then (p_data->>'module_id')::uuid else module_id end,title=case when p_data?'title' then (p_data->>'title')::text else title end,order_index=case when p_data?'order_index' then (p_data->>'order_index')::integer else order_index end,is_bonus=case when p_data?'is_bonus' then (p_data->>'is_bonus')::boolean else is_bonus end,status=case when p_data?'status' then (p_data->>'status')::text else status end where id=id_out;
  end if;
  if exists(select 1 from public.ica_sections s join public.ica_modules m on m.id=s.module_id where s.id=id_out and s.status='published' and m.status='archived') then perform ica_private.fail('Módulo arquivado.');end if;
 when 'lessons' then
  perform ica_private.validate_keys(p_data,array['section_id','slug','title','body','type','duration_seconds','video_id','storage_path','is_preview','is_required','order_index','status']);
  if p_id is not null then select to_jsonb(t) into old_data from public.ica_lessons t where id=p_id for update;if old_data is null then perform ica_private.fail('Registro indisponível.');end if;end if;
  if p_id is not null and p_data?'section_id' and (p_data->'section_id') is distinct from (old_data->'section_id') then perform ica_private.fail('O vínculo original deve ser preservado.');end if;
  if p_data->>'status'='archived' or old_data->>'status'='archived' then perform ica_private.fail('Use arquivar ou restaurar com confirmação.');end if;
  if p_id is null then
   insert into public.ica_lessons(id,section_id,slug,title,body,type,duration_seconds,video_id,storage_path,is_preview,is_required,order_index,status) values(id_out,coalesce((p_data->>'section_id')::uuid,null),coalesce((p_data->>'slug')::text,''),coalesce((p_data->>'title')::text,''),coalesce((p_data->>'body')::text,''),coalesce((p_data->>'type')::text,'text'),coalesce((p_data->>'duration_seconds')::integer,0),coalesce((p_data->>'video_id')::text,null),coalesce((p_data->>'storage_path')::text,null),coalesce((p_data->>'is_preview')::boolean,false),coalesce((p_data->>'is_required')::boolean,true),coalesce((p_data->>'order_index')::integer,0),coalesce((p_data->>'status')::text,'draft'));
  else
   update public.ica_lessons set section_id=case when p_data?'section_id' then (p_data->>'section_id')::uuid else section_id end,slug=case when p_data?'slug' then (p_data->>'slug')::text else slug end,title=case when p_data?'title' then (p_data->>'title')::text else title end,body=case when p_data?'body' then (p_data->>'body')::text else body end,type=case when p_data?'type' then (p_data->>'type')::text else type end,duration_seconds=case when p_data?'duration_seconds' then (p_data->>'duration_seconds')::integer else duration_seconds end,video_id=case when p_data?'video_id' then (p_data->>'video_id')::text else video_id end,storage_path=case when p_data?'storage_path' then (p_data->>'storage_path')::text else storage_path end,is_preview=case when p_data?'is_preview' then (p_data->>'is_preview')::boolean else is_preview end,is_required=case when p_data?'is_required' then (p_data->>'is_required')::boolean else is_required end,order_index=case when p_data?'order_index' then (p_data->>'order_index')::integer else order_index end,status=case when p_data?'status' then (p_data->>'status')::text else status end where id=id_out;
  end if;
  if exists(select 1 from public.ica_lessons l join public.ica_sections s on s.id=l.section_id where l.id=id_out and l.status='published' and s.status='archived') then perform ica_private.fail('Seção arquivada.');end if;
 when 'material_folders' then
  perform ica_private.validate_keys(p_data,array['name','parent_id','status','access_mode','plan_ids']);
  if p_id is not null then select to_jsonb(t) into old_data from public.ica_material_folders t where id=p_id for update;if old_data is null then perform ica_private.fail('Registro indisponível.');end if;end if;
  if p_id is not null and p_data?'parent_id' and (p_data->'parent_id') is distinct from (old_data->'parent_id') then perform ica_private.fail('O vínculo original deve ser preservado.');end if;
  if p_data->>'status'='archived' or old_data->>'status'='archived' then perform ica_private.fail('Use arquivar ou restaurar com confirmação.');end if;
  if p_id is null then
   insert into public.ica_material_folders(id,name,parent_id,status,access_mode,plan_ids) values(id_out,coalesce((p_data->>'name')::text,''),coalesce((p_data->>'parent_id')::uuid,null),coalesce((p_data->>'status')::text,'draft'),coalesce((p_data->>'access_mode')::text,'subscribers'),coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(p_data->'plan_ids') x),'{}'::uuid[]));
  else
   update public.ica_material_folders set name=case when p_data?'name' then (p_data->>'name')::text else name end,parent_id=case when p_data?'parent_id' then (p_data->>'parent_id')::uuid else parent_id end,status=case when p_data?'status' then (p_data->>'status')::text else status end,access_mode=case when p_data?'access_mode' then (p_data->>'access_mode')::text else access_mode end,plan_ids=case when p_data?'plan_ids' then coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(p_data->'plan_ids') x),'{}'::uuid[]) else plan_ids end where id=id_out;
  end if;
  if exists(select 1 from public.ica_material_folders t,unnest(t.plan_ids) x where t.id=id_out and not exists(select 1 from public.ica_plans where id=x)) then perform ica_private.fail('Plano inválido.');end if;
 when 'materials' then
  perform ica_private.validate_keys(p_data,array['name','description','folder_id','lesson_id','file_type','size_bytes','storage_path','status','access_mode','plan_ids']);
  if p_id is not null then select to_jsonb(t) into old_data from public.ica_materials t where id=p_id for update;if old_data is null then perform ica_private.fail('Registro indisponível.');end if;end if;
  if p_id is not null and p_data?'lesson_id' and (p_data->'lesson_id') is distinct from (old_data->'lesson_id') then perform ica_private.fail('O vínculo original deve ser preservado.');end if;
  if p_data->>'status'='archived' or old_data->>'status'='archived' then perform ica_private.fail('Use arquivar ou restaurar com confirmação.');end if;
  if p_id is null then
   insert into public.ica_materials(id,name,description,folder_id,lesson_id,file_type,size_bytes,storage_path,status,access_mode,plan_ids) values(id_out,coalesce((p_data->>'name')::text,''),coalesce((p_data->>'description')::text,''),coalesce((p_data->>'folder_id')::uuid,null),coalesce((p_data->>'lesson_id')::uuid,null),coalesce((p_data->>'file_type')::text,'application/pdf'),coalesce((p_data->>'size_bytes')::bigint,0),coalesce((p_data->>'storage_path')::text,null),coalesce((p_data->>'status')::text,'draft'),coalesce((p_data->>'access_mode')::text,'subscribers'),coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(p_data->'plan_ids') x),'{}'::uuid[]));
  else
   update public.ica_materials set name=case when p_data?'name' then (p_data->>'name')::text else name end,description=case when p_data?'description' then (p_data->>'description')::text else description end,folder_id=case when p_data?'folder_id' then (p_data->>'folder_id')::uuid else folder_id end,lesson_id=case when p_data?'lesson_id' then (p_data->>'lesson_id')::uuid else lesson_id end,file_type=case when p_data?'file_type' then (p_data->>'file_type')::text else file_type end,size_bytes=case when p_data?'size_bytes' then (p_data->>'size_bytes')::bigint else size_bytes end,storage_path=case when p_data?'storage_path' then (p_data->>'storage_path')::text else storage_path end,status=case when p_data?'status' then (p_data->>'status')::text else status end,access_mode=case when p_data?'access_mode' then (p_data->>'access_mode')::text else access_mode end,plan_ids=case when p_data?'plan_ids' then coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(p_data->'plan_ids') x),'{}'::uuid[]) else plan_ids end where id=id_out;
  end if;
  if exists(select 1 from public.ica_materials t,unnest(t.plan_ids) x where t.id=id_out and not exists(select 1 from public.ica_plans where id=x)) then perform ica_private.fail('Plano inválido.');end if;
 when 'plans' then
  perform ica_private.validate_keys(p_data,array['name','slug','price_cents','access_months','benefits','active']);
  if p_id is not null then select to_jsonb(t) into old_data from public.ica_plans t where id=p_id for update;if old_data is null then perform ica_private.fail('Registro indisponível.');end if;end if;
  if p_id is null then
   insert into public.ica_plans(id,name,slug,price_cents,access_months,benefits,active) values(id_out,coalesce((p_data->>'name')::text,''),coalesce((p_data->>'slug')::text,''),coalesce((p_data->>'price_cents')::integer,0),coalesce((p_data->>'access_months')::integer,12),coalesce(p_data->'benefits','[]'::jsonb),coalesce((p_data->>'active')::boolean,false));
  else
   update public.ica_plans set name=case when p_data?'name' then (p_data->>'name')::text else name end,slug=case when p_data?'slug' then (p_data->>'slug')::text else slug end,price_cents=case when p_data?'price_cents' then (p_data->>'price_cents')::integer else price_cents end,access_months=case when p_data?'access_months' then (p_data->>'access_months')::integer else access_months end,benefits=case when p_data?'benefits' then p_data->'benefits' else benefits end,active=case when p_data?'active' then (p_data->>'active')::boolean else active end where id=id_out;
  end if;
 when 'spaces' then
  perform ica_private.validate_keys(p_data,array['name','description','status','access_mode','plan_ids','order_index']);
  if p_id is not null then select to_jsonb(t) into old_data from public.ica_spaces t where id=p_id for update;if old_data is null then perform ica_private.fail('Registro indisponível.');end if;end if;
  if p_data->>'status'='archived' or old_data->>'status'='archived' then perform ica_private.fail('Use arquivar ou restaurar com confirmação.');end if;
  if p_id is null then
   insert into public.ica_spaces(id,name,description,status,access_mode,plan_ids,order_index) values(id_out,coalesce((p_data->>'name')::text,''),coalesce((p_data->>'description')::text,''),coalesce((p_data->>'status')::text,'draft'),coalesce((p_data->>'access_mode')::text,'subscribers'),coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(p_data->'plan_ids') x),'{}'::uuid[]),coalesce((p_data->>'order_index')::integer,0));
  else
   update public.ica_spaces set name=case when p_data?'name' then (p_data->>'name')::text else name end,description=case when p_data?'description' then (p_data->>'description')::text else description end,status=case when p_data?'status' then (p_data->>'status')::text else status end,access_mode=case when p_data?'access_mode' then (p_data->>'access_mode')::text else access_mode end,plan_ids=case when p_data?'plan_ids' then coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(p_data->'plan_ids') x),'{}'::uuid[]) else plan_ids end,order_index=case when p_data?'order_index' then (p_data->>'order_index')::integer else order_index end where id=id_out;
  end if;
  if exists(select 1 from public.ica_spaces t,unnest(t.plan_ids) x where t.id=id_out and not exists(select 1 from public.ica_plans where id=x)) then perform ica_private.fail('Plano inválido.');end if;
 when 'legal_versions' then
  perform ica_private.validate_keys(p_data,array['kind','version','title','body','published','demo']);
  if p_id is not null then select to_jsonb(t) into old_data from public.ica_legal_versions t where id=p_id for update;if old_data is null then perform ica_private.fail('Registro indisponível.');end if;end if;
  if p_id is not null and exists(select 1 from public.ica_legal_acceptances where legal_version_id=p_id) and exists(select 1 from jsonb_each(p_data) x where x.key<>'published' and x.value is distinct from old_data->x.key) then perform ica_private.fail('Crie uma nova versão do texto legal.');end if;
  if coalesce((p_data->>'published')::boolean,false) then update public.ica_legal_versions set published=false where kind=coalesce(p_data->>'kind',old_data->>'kind') and id<>id_out;end if;
  if p_id is null then
   insert into public.ica_legal_versions(id,kind,version,title,body,published,demo) values(id_out,coalesce((p_data->>'kind')::text,''),coalesce((p_data->>'version')::text,''),coalesce((p_data->>'title')::text,''),coalesce((p_data->>'body')::text,''),coalesce((p_data->>'published')::boolean,false),coalesce((p_data->>'demo')::boolean,false));
  else
   update public.ica_legal_versions set kind=case when p_data?'kind' then (p_data->>'kind')::text else kind end,version=case when p_data?'version' then (p_data->>'version')::text else version end,title=case when p_data?'title' then (p_data->>'title')::text else title end,body=case when p_data?'body' then (p_data->>'body')::text else body end,published=case when p_data?'published' then (p_data->>'published')::boolean else published end,demo=case when p_data?'demo' then (p_data->>'demo')::boolean else demo end where id=id_out;
  end if;
 when 'onboarding' then
  perform ica_private.validate_keys(p_data,array['name_label','company_label','company_required']);
  if p_id is not null then select to_jsonb(t) into old_data from public.ica_onboarding t where id=p_id for update;if old_data is null then perform ica_private.fail('Registro indisponível.');end if;end if;
  if p_id is null then
   insert into public.ica_onboarding(id,name_label,company_label,company_required) values(id_out,coalesce((p_data->>'name_label')::text,'Nome completo'),coalesce((p_data->>'company_label')::text,'Empresa'),coalesce((p_data->>'company_required')::boolean,true));
  else
   update public.ica_onboarding set name_label=case when p_data?'name_label' then (p_data->>'name_label')::text else name_label end,company_label=case when p_data?'company_label' then (p_data->>'company_label')::text else company_label end,company_required=case when p_data?'company_required' then (p_data->>'company_required')::boolean else company_required end where id=id_out;
  end if;
 when 'onboarding_questions' then
  perform ica_private.validate_keys(p_data,array['key','label','type','options','required','active','order_index']);
  if p_id is not null then select to_jsonb(t) into old_data from public.ica_onboarding_questions t where id=p_id for update;if old_data is null then perform ica_private.fail('Registro indisponível.');end if;end if;
  if p_id is null then
   insert into public.ica_onboarding_questions(id,key,label,type,options,required,active,order_index) values(id_out,coalesce((p_data->>'key')::text,''),coalesce((p_data->>'label')::text,''),coalesce((p_data->>'type')::text,'text'),coalesce(p_data->'options','[]'::jsonb),coalesce((p_data->>'required')::boolean,false),coalesce((p_data->>'active')::boolean,true),coalesce((p_data->>'order_index')::integer,0));
  else
   update public.ica_onboarding_questions set key=case when p_data?'key' then (p_data->>'key')::text else key end,label=case when p_data?'label' then (p_data->>'label')::text else label end,type=case when p_data?'type' then (p_data->>'type')::text else type end,options=case when p_data?'options' then p_data->'options' else options end,required=case when p_data?'required' then (p_data->>'required')::boolean else required end,active=case when p_data?'active' then (p_data->>'active')::boolean else active end,order_index=case when p_data?'order_index' then (p_data->>'order_index')::integer else order_index end where id=id_out;
  end if;
 else perform ica_private.fail('Esta entidade não permite edição.');end case;
 if p_entity='courses' and exists(select 1 from public.ica_courses c where c.id=id_out and c.status='published' and c.certificate_enabled and (cardinality(c.required_lesson_ids)=0 or not exists(select 1 from public.ica_lessons l where l.id=any(c.required_lesson_ids) and not l.is_preview) or coalesce((select sum(l.duration_seconds) from public.ica_lessons l where l.id=any(c.required_lesson_ids)),0)<=0)) then perform ica_private.fail('Configure aulas obrigatórias e carga horária antes de publicar o certificado.');end if;
 perform ica_private.audit(u,case when p_id is null then 'create' else 'update' end,p_entity,id_out);
 return jsonb_build_object('id',id_out);
end $$;
create or replace function ica_private.course_json(p_actor uuid,p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',c.id,'slug',c.slug,'title',c.title,'description',c.description,'cover_url',c.cover_url,'status',c.status,'access_mode',c.access_mode,'plan_ids',c.plan_ids,'certificate_enabled',c.certificate_enabled,
 'required_lessons',cardinality(c.required_lesson_ids),'total_lessons',q.total,'completed_lessons',q.done,'progress_percent',case when cardinality(c.required_lesson_ids)>0 then round(100.0*(select count(*) from public.ica_lesson_progress lp where lp.user_id=p_actor and lp.lesson_id=any(c.required_lesson_ids) and lp.completed_at is not null)/cardinality(c.required_lesson_ids)) else 0 end,'duration_seconds',q.duration,'can_access',ica_private.course_access(p_actor,c.id))
 from public.ica_courses c cross join lateral(select count(*) total,count(*) filter(where lp.completed_at is not null) done,count(*) filter(where lp.completed_at is not null and l.id=any(c.required_lesson_ids)) required_done,coalesce(sum(l.duration_seconds),0) duration from public.ica_lessons l join public.ica_sections s on s.id=l.section_id join public.ica_modules m on m.id=s.module_id left join public.ica_lesson_progress lp on lp.lesson_id=l.id and lp.user_id=p_actor where m.course_id=c.id and l.status='published' and s.status='published' and m.status='published')q where c.id=p_id
$$;
revoke execute on function ica_private.actor(boolean),ica_private.course_json(uuid,uuid) from public,anon,authenticated;
revoke execute on function public.app_admin_save(text,uuid,jsonb) from public,anon;
grant execute on function public.app_admin_save(text,uuid,jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
