begin;
create or replace function app_private.actor(p_allow_aal1 boolean default false) returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); sid uuid; p public.profiles; s public.app_sessions; idle interval;
begin
 if u is null then perform app_private.fail('Sessão inválida. Entre novamente.'); end if;
 sid:=nullif(auth.jwt()->>'session_id','')::uuid;
 select * into p from public.profiles where id=u;
 if not found or p.suspended then perform app_private.fail('Acesso indisponível.'); end if;
 if sid is null or not exists(select 1 from auth.sessions where id=sid and user_id=u and (not_after is null or not_after>now())) then perform app_private.fail('Sessão inválida. Entre novamente.'); end if;
 idle:=case when p.role='member' then interval '2 hours' else interval '30 minutes' end;
 insert into public.app_sessions(id,user_id,expires_at) values(sid,u,now()+idle) on conflict(id) do nothing;
 select * into s from public.app_sessions where id=sid and user_id=u for update;
 if not found or s.revoked_at is not null or least(s.expires_at,s.last_activity_at+idle)<=now() then perform app_private.fail('Sessão expirada. Entre novamente.'); end if;
 if p.role<>'member' and not p_allow_aal1 and coalesce(auth.jwt()->>'aal','aal1')<>'aal2' then perform app_private.fail('Confirme o segundo fator para continuar.'); end if;
 return u;
end $$;
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
  perform app_private.validate_keys(p_data,array['section_id','slug','title','body','type','duration_seconds','video_id','storage_path','is_preview','is_required','order_index','status']);
  if p_id is not null then select to_jsonb(t) into old_data from public.lessons t where id=p_id for update;if old_data is null then perform app_private.fail('Registro indisponível.');end if;end if;
  if p_id is not null and p_data?'section_id' and (p_data->'section_id') is distinct from (old_data->'section_id') then perform app_private.fail('O vínculo original deve ser preservado.');end if;
  if p_data->>'status'='archived' or old_data->>'status'='archived' then perform app_private.fail('Use arquivar ou restaurar com confirmação.');end if;
  if p_id is null then
   insert into public.lessons(id,section_id,slug,title,body,type,duration_seconds,video_id,storage_path,is_preview,is_required,order_index,status) values(id_out,coalesce((p_data->>'section_id')::uuid,null),coalesce((p_data->>'slug')::text,''),coalesce((p_data->>'title')::text,''),coalesce((p_data->>'body')::text,''),coalesce((p_data->>'type')::text,'text'),coalesce((p_data->>'duration_seconds')::integer,0),coalesce((p_data->>'video_id')::text,null),coalesce((p_data->>'storage_path')::text,null),coalesce((p_data->>'is_preview')::boolean,false),coalesce((p_data->>'is_required')::boolean,true),coalesce((p_data->>'order_index')::integer,0),coalesce((p_data->>'status')::text,'draft'));
  else
   update public.lessons set section_id=case when p_data?'section_id' then (p_data->>'section_id')::uuid else section_id end,slug=case when p_data?'slug' then (p_data->>'slug')::text else slug end,title=case when p_data?'title' then (p_data->>'title')::text else title end,body=case when p_data?'body' then (p_data->>'body')::text else body end,type=case when p_data?'type' then (p_data->>'type')::text else type end,duration_seconds=case when p_data?'duration_seconds' then (p_data->>'duration_seconds')::integer else duration_seconds end,video_id=case when p_data?'video_id' then (p_data->>'video_id')::text else video_id end,storage_path=case when p_data?'storage_path' then (p_data->>'storage_path')::text else storage_path end,is_preview=case when p_data?'is_preview' then (p_data->>'is_preview')::boolean else is_preview end,is_required=case when p_data?'is_required' then (p_data->>'is_required')::boolean else is_required end,order_index=case when p_data?'order_index' then (p_data->>'order_index')::integer else order_index end,status=case when p_data?'status' then (p_data->>'status')::text else status end where id=id_out;
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
  perform app_private.validate_keys(p_data,array['name','description','folder_id','lesson_id','file_type','size_bytes','storage_path','status','access_mode','plan_ids']);
  if p_id is not null then select to_jsonb(t) into old_data from public.materials t where id=p_id for update;if old_data is null then perform app_private.fail('Registro indisponível.');end if;end if;
  if p_id is not null and p_data?'lesson_id' and (p_data->'lesson_id') is distinct from (old_data->'lesson_id') then perform app_private.fail('O vínculo original deve ser preservado.');end if;
  if p_data->>'status'='archived' or old_data->>'status'='archived' then perform app_private.fail('Use arquivar ou restaurar com confirmação.');end if;
  if p_id is null then
   insert into public.materials(id,name,description,folder_id,lesson_id,file_type,size_bytes,storage_path,status,access_mode,plan_ids) values(id_out,coalesce((p_data->>'name')::text,''),coalesce((p_data->>'description')::text,''),coalesce((p_data->>'folder_id')::uuid,null),coalesce((p_data->>'lesson_id')::uuid,null),coalesce((p_data->>'file_type')::text,'application/pdf'),coalesce((p_data->>'size_bytes')::bigint,0),coalesce((p_data->>'storage_path')::text,null),coalesce((p_data->>'status')::text,'draft'),coalesce((p_data->>'access_mode')::text,'subscribers'),coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(p_data->'plan_ids') x),'{}'::uuid[]));
  else
   update public.materials set name=case when p_data?'name' then (p_data->>'name')::text else name end,description=case when p_data?'description' then (p_data->>'description')::text else description end,folder_id=case when p_data?'folder_id' then (p_data->>'folder_id')::uuid else folder_id end,lesson_id=case when p_data?'lesson_id' then (p_data->>'lesson_id')::uuid else lesson_id end,file_type=case when p_data?'file_type' then (p_data->>'file_type')::text else file_type end,size_bytes=case when p_data?'size_bytes' then (p_data->>'size_bytes')::bigint else size_bytes end,storage_path=case when p_data?'storage_path' then (p_data->>'storage_path')::text else storage_path end,status=case when p_data?'status' then (p_data->>'status')::text else status end,access_mode=case when p_data?'access_mode' then (p_data->>'access_mode')::text else access_mode end,plan_ids=case when p_data?'plan_ids' then coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(p_data->'plan_ids') x),'{}'::uuid[]) else plan_ids end where id=id_out;
  end if;
  if exists(select 1 from public.materials t,unnest(t.plan_ids) x where t.id=id_out and not exists(select 1 from public.plans where id=x)) then perform app_private.fail('Plano inválido.');end if;
 when 'plans' then
  perform app_private.validate_keys(p_data,array['name','slug','price_cents','access_months','benefits','active']);
  if p_id is not null then select to_jsonb(t) into old_data from public.plans t where id=p_id for update;if old_data is null then perform app_private.fail('Registro indisponível.');end if;end if;
  if p_id is null then
   insert into public.plans(id,name,slug,price_cents,access_months,benefits,active) values(id_out,coalesce((p_data->>'name')::text,''),coalesce((p_data->>'slug')::text,''),coalesce((p_data->>'price_cents')::integer,0),coalesce((p_data->>'access_months')::integer,12),coalesce(p_data->'benefits','[]'::jsonb),coalesce((p_data->>'active')::boolean,false));
  else
   update public.plans set name=case when p_data?'name' then (p_data->>'name')::text else name end,slug=case when p_data?'slug' then (p_data->>'slug')::text else slug end,price_cents=case when p_data?'price_cents' then (p_data->>'price_cents')::integer else price_cents end,access_months=case when p_data?'access_months' then (p_data->>'access_months')::integer else access_months end,benefits=case when p_data?'benefits' then p_data->'benefits' else benefits end,active=case when p_data?'active' then (p_data->>'active')::boolean else active end where id=id_out;
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
 perform app_private.audit(u,case when p_id is null then 'create' else 'update' end,p_entity,id_out);
 return jsonb_build_object('id',id_out);
end $$;
create or replace function public.app_admin_list(p_entity text,p_query text default '',p_page integer default 1) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.require_role(app_private.entity_roles(p_entity));result jsonb;begin
 if p_page<1 or p_page>100000 or length(p_query)>200 then perform app_private.fail('Busca inválida.');end if;
 case p_entity
 when 'courses' then
  select jsonb_build_object('items',coalesce((select jsonb_agg(x.dto order by x.seq) from(select to_jsonb(t) dto,row_number() over(order by t.created_at desc,t.id) seq from public.courses t where to_jsonb(t)::text ilike '%'||p_query||'%' order by t.created_at desc,t.id limit 20 offset (p_page-1)*20)x),'[]'::jsonb),'total',(select count(*) from public.courses t where to_jsonb(t)::text ilike '%'||p_query||'%'),'page',p_page,'page_size',20) into result;
 when 'modules' then
  select jsonb_build_object('items',coalesce((select jsonb_agg(x.dto order by x.seq) from(select to_jsonb(t) dto,row_number() over(order by t.id) seq from public.modules t where to_jsonb(t)::text ilike '%'||p_query||'%' order by t.id limit 20 offset (p_page-1)*20)x),'[]'::jsonb),'total',(select count(*) from public.modules t where to_jsonb(t)::text ilike '%'||p_query||'%'),'page',p_page,'page_size',20) into result;
 when 'sections' then
  select jsonb_build_object('items',coalesce((select jsonb_agg(x.dto order by x.seq) from(select to_jsonb(t) dto,row_number() over(order by t.id) seq from public.sections t where to_jsonb(t)::text ilike '%'||p_query||'%' order by t.id limit 20 offset (p_page-1)*20)x),'[]'::jsonb),'total',(select count(*) from public.sections t where to_jsonb(t)::text ilike '%'||p_query||'%'),'page',p_page,'page_size',20) into result;
 when 'lessons' then
  select jsonb_build_object('items',coalesce((select jsonb_agg(x.dto order by x.seq) from(select to_jsonb(t) dto,row_number() over(order by t.id) seq from public.lessons t where to_jsonb(t)::text ilike '%'||p_query||'%' order by t.id limit 20 offset (p_page-1)*20)x),'[]'::jsonb),'total',(select count(*) from public.lessons t where to_jsonb(t)::text ilike '%'||p_query||'%'),'page',p_page,'page_size',20) into result;
 when 'material_folders' then
  select jsonb_build_object('items',coalesce((select jsonb_agg(x.dto order by x.seq) from(select to_jsonb(t) dto,row_number() over(order by t.id) seq from public.material_folders t where to_jsonb(t)::text ilike '%'||p_query||'%' order by t.id limit 20 offset (p_page-1)*20)x),'[]'::jsonb),'total',(select count(*) from public.material_folders t where to_jsonb(t)::text ilike '%'||p_query||'%'),'page',p_page,'page_size',20) into result;
 when 'materials' then
  select jsonb_build_object('items',coalesce((select jsonb_agg(x.dto order by x.seq) from(select to_jsonb(t) dto,row_number() over(order by t.id) seq from public.materials t where to_jsonb(t)::text ilike '%'||p_query||'%' order by t.id limit 20 offset (p_page-1)*20)x),'[]'::jsonb),'total',(select count(*) from public.materials t where to_jsonb(t)::text ilike '%'||p_query||'%'),'page',p_page,'page_size',20) into result;
 when 'plans' then
  select jsonb_build_object('items',coalesce((select jsonb_agg(x.dto order by x.seq) from(select to_jsonb(t) dto,row_number() over(order by t.created_at desc,t.id) seq from public.plans t where to_jsonb(t)::text ilike '%'||p_query||'%' order by t.created_at desc,t.id limit 20 offset (p_page-1)*20)x),'[]'::jsonb),'total',(select count(*) from public.plans t where to_jsonb(t)::text ilike '%'||p_query||'%'),'page',p_page,'page_size',20) into result;
 when 'spaces' then
  select jsonb_build_object('items',coalesce((select jsonb_agg(x.dto order by x.seq) from(select to_jsonb(t) dto,row_number() over(order by t.id) seq from public.spaces t where to_jsonb(t)::text ilike '%'||p_query||'%' order by t.id limit 20 offset (p_page-1)*20)x),'[]'::jsonb),'total',(select count(*) from public.spaces t where to_jsonb(t)::text ilike '%'||p_query||'%'),'page',p_page,'page_size',20) into result;
 when 'legal_versions' then
  select jsonb_build_object('items',coalesce((select jsonb_agg(x.dto order by x.seq) from(select to_jsonb(t) dto,row_number() over(order by t.created_at desc,t.id) seq from public.legal_versions t where to_jsonb(t)::text ilike '%'||p_query||'%' order by t.created_at desc,t.id limit 20 offset (p_page-1)*20)x),'[]'::jsonb),'total',(select count(*) from public.legal_versions t where to_jsonb(t)::text ilike '%'||p_query||'%'),'page',p_page,'page_size',20) into result;
 when 'onboarding' then
  select jsonb_build_object('items',coalesce((select jsonb_agg(x.dto order by x.seq) from(select to_jsonb(t) dto,row_number() over(order by t.id) seq from public.onboarding t where to_jsonb(t)::text ilike '%'||p_query||'%' order by t.id limit 20 offset (p_page-1)*20)x),'[]'::jsonb),'total',(select count(*) from public.onboarding t where to_jsonb(t)::text ilike '%'||p_query||'%'),'page',p_page,'page_size',20) into result;
 when 'onboarding_questions' then
  select jsonb_build_object('items',coalesce((select jsonb_agg(x.dto order by x.seq) from(select to_jsonb(t) dto,row_number() over(order by t.id) seq from public.onboarding_questions t where to_jsonb(t)::text ilike '%'||p_query||'%' order by t.id limit 20 offset (p_page-1)*20)x),'[]'::jsonb),'total',(select count(*) from public.onboarding_questions t where to_jsonb(t)::text ilike '%'||p_query||'%'),'page',p_page,'page_size',20) into result;
 when 'profiles' then
  select jsonb_build_object('items',coalesce((select jsonb_agg(x.dto order by x.seq) from(select app_private.profile_json(t.id) dto,row_number() over(order by t.created_at desc,t.id) seq from public.profiles t where to_jsonb(t)::text ilike '%'||p_query||'%' order by t.created_at desc,t.id limit 20 offset (p_page-1)*20)x),'[]'::jsonb),'total',(select count(*) from public.profiles t where to_jsonb(t)::text ilike '%'||p_query||'%'),'page',p_page,'page_size',20) into result;
 when 'orders' then
  select jsonb_build_object('items',coalesce((select jsonb_agg(x.dto order by x.seq) from(select to_jsonb(t)-'receipt_hash'-'buyer_data'-'attempt_key' dto,row_number() over(order by t.created_at desc,t.id) seq from public.orders t where (t.id::text||' '||t.status||' '||t.amount_cents::text) ilike '%'||p_query||'%' order by t.created_at desc,t.id limit 20 offset (p_page-1)*20)x),'[]'::jsonb),'total',(select count(*) from public.orders t where (t.id::text||' '||t.status||' '||t.amount_cents::text) ilike '%'||p_query||'%'),'page',p_page,'page_size',20) into result;
 when 'posts' then
  select jsonb_build_object('items',coalesce((select jsonb_agg(x.dto order by x.seq) from(select app_private.post_json(u,t.id) dto,row_number() over(order by t.created_at desc,t.id) seq from public.posts t where to_jsonb(t)::text ilike '%'||p_query||'%' order by t.created_at desc,t.id limit 20 offset (p_page-1)*20)x),'[]'::jsonb),'total',(select count(*) from public.posts t where to_jsonb(t)::text ilike '%'||p_query||'%'),'page',p_page,'page_size',20) into result;
 when 'replies' then
  select jsonb_build_object('items',coalesce((select jsonb_agg(x.dto order by x.seq) from(select app_private.reply_json(u,t.id) dto,row_number() over(order by t.created_at desc,t.id) seq from public.replies t where to_jsonb(t)::text ilike '%'||p_query||'%' order by t.created_at desc,t.id limit 20 offset (p_page-1)*20)x),'[]'::jsonb),'total',(select count(*) from public.replies t where to_jsonb(t)::text ilike '%'||p_query||'%'),'page',p_page,'page_size',20) into result;
 when 'reports' then
  select jsonb_build_object('items',coalesce((select jsonb_agg(x.dto order by x.seq) from(select to_jsonb(t) dto,row_number() over(order by t.created_at desc,t.id) seq from public.reports t where to_jsonb(t)::text ilike '%'||p_query||'%' order by t.created_at desc,t.id limit 20 offset (p_page-1)*20)x),'[]'::jsonb),'total',(select count(*) from public.reports t where to_jsonb(t)::text ilike '%'||p_query||'%'),'page',p_page,'page_size',20) into result;
 when 'tickets' then
  select jsonb_build_object('items',coalesce((select jsonb_agg(x.dto order by x.seq) from(select app_private.ticket_json(u,t.id) dto,row_number() over(order by t.created_at desc,t.id) seq from public.tickets t where to_jsonb(t)::text ilike '%'||p_query||'%' order by t.created_at desc,t.id limit 20 offset (p_page-1)*20)x),'[]'::jsonb),'total',(select count(*) from public.tickets t where to_jsonb(t)::text ilike '%'||p_query||'%'),'page',p_page,'page_size',20) into result;
 when 'audit_events' then
  select jsonb_build_object('items',coalesce((select jsonb_agg(x.dto order by x.seq) from(select to_jsonb(t) dto,row_number() over(order by t.created_at desc,t.id) seq from public.audit_events t where to_jsonb(t)::text ilike '%'||p_query||'%' order by t.created_at desc,t.id limit 20 offset (p_page-1)*20)x),'[]'::jsonb),'total',(select count(*) from public.audit_events t where to_jsonb(t)::text ilike '%'||p_query||'%'),'page',p_page,'page_size',20) into result;
 when 'privacy_requests' then
  select jsonb_build_object('items',coalesce((select jsonb_agg(x.dto order by x.seq) from(select to_jsonb(t) dto,row_number() over(order by t.created_at desc,t.id) seq from public.privacy_requests t where to_jsonb(t)::text ilike '%'||p_query||'%' order by t.created_at desc,t.id limit 20 offset (p_page-1)*20)x),'[]'::jsonb),'total',(select count(*) from public.privacy_requests t where to_jsonb(t)::text ilike '%'||p_query||'%'),'page',p_page,'page_size',20) into result;
 else perform app_private.fail();end case;return result;
end $$;
create or replace function public.app_upload_context(p_actor_id uuid,p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;begin
 perform app_private.service_actor(p_actor_id);
 if not app_private.upload_gate(p_actor_id,p_id) then perform app_private.fail('Upload indisponível.');end if;
 select jsonb_build_object('id',id,'bucket','icarus-private','path',path,'size_bytes',size_bytes,'content_type',content_type,'status',state,'expires_at',expires_at) into result from public.uploads where id=p_id and actor_id=p_actor_id and (state='ready' or expires_at>now());
 if result is null then perform app_private.fail('Upload indisponível ou expirado.');end if;return result;
end $$;
alter table public.uploads add column message_id uuid references public.ticket_messages(id);
create function app_private.link_attachment() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if new.ticket_id is not null then select id into new.message_id from public.ticket_messages where ticket_id=new.ticket_id and author_id=new.actor_id order by created_at desc,id desc limit 1;end if;return new;
end $$;
create trigger app_attachment_message before insert on public.uploads for each row execute function app_private.link_attachment();
create or replace function app_private.ticket_json(p_actor uuid,p_id uuid,p_messages boolean default false) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',t.id,'subject',t.subject,'priority',t.priority,'status',t.status,'created_at',t.created_at,'updated_at',t.updated_at,'messages',case when p_messages then coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'author_name',a.full_name,'author_id',a.id,'avatar_id',a.avatar_id,'body',m.body,'created_at',m.created_at,'attachments',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'name',x.file_name,'file_type',x.content_type,'size_bytes',x.size_bytes)) from public.uploads x where x.message_id=m.id and x.state='ready'),'[]'::jsonb)) order by m.created_at,m.id) from public.ticket_messages m join public.profiles a on a.id=m.author_id where m.ticket_id=t.id),'[]'::jsonb) else '[]'::jsonb end,'attachments',case when p_messages then coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',file_name,'file_type',content_type,'size_bytes',size_bytes,'created_at',created_at) order by created_at,id) from public.uploads where ticket_id=t.id and state='ready'),'[]'::jsonb) else '[]'::jsonb end) from public.tickets t where t.id=p_id and app_private.ticket_access(p_actor,t.id)
$$;
create or replace function app_private.post_json(p_actor uuid,p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',p.id,'space_id',p.space_id,'author_name',a.full_name,'author_id',a.id,'author_role',a.role,'avatar_id',a.avatar_id,'plan_name',(select pl.name from public.subscriptions s join public.plans pl on pl.id=s.plan_id where s.user_id=a.id and s.starts_at<=now() and s.ends_at>now() and s.revoked_at is null order by s.ends_at desc limit 1),'title',p.title,'body',p.body,'status',p.status,'created_at',p.created_at,'updated_at',p.updated_at,'image_id',(select id from public.uploads where post_id=p.id and path=p.image_path),'vote_count',(select count(*) from public.votes where post_id=p.id),'voted',exists(select 1 from public.votes where post_id=p.id and actor_id=p_actor),'reply_count',(select count(*) from public.replies r where r.post_id=p.id and (r.status='approved' or r.author_id=p_actor or app_private.is_staff(p_actor,array['admin','moderator']))),'can_edit',p.author_id=p_actor)
 from public.posts p join public.profiles a on a.id=p.author_id where p.id=p_id
$$;
create or replace function app_private.reply_json(p_actor uuid,p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',r.id,'post_id',r.post_id,'author_name',a.full_name,'author_id',a.id,'author_role',a.role,'avatar_id',a.avatar_id,'plan_name',null,'body',r.body,'status',r.status,'created_at',r.created_at,'vote_count',(select count(*) from public.votes where reply_id=r.id),'voted',exists(select 1 from public.votes where reply_id=r.id and actor_id=p_actor),'can_edit',false) from public.replies r join public.profiles a on a.id=r.author_id where r.id=p_id
$$;
create or replace function public.app_progress(p_lesson_id uuid,p_position_seconds numeric default 0,p_complete boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.actor();l public.lessons;cid uuid;p public.lesson_progress;cert text;begin
 if not app_private.lesson_access(u,p_lesson_id) then perform app_private.fail('Aula indisponível para seu acesso.');end if;
 if p_position_seconds is null or p_position_seconds<0 or p_position_seconds='NaN'::numeric or p_position_seconds>86400 then perform app_private.fail('Posição inválida.');end if;
 select * into l from public.lessons where id=p_lesson_id;
 -- Staff preview of drafts cannot count as member curriculum completion.
 if l.status<>'published' or not exists(select 1 from public.sections s join public.modules m on m.id=s.module_id join public.courses c on c.id=m.course_id where s.id=l.section_id and s.status='published' and m.status='published' and c.status='published') then perform app_private.fail('Prévia não registra conclusão.');end if;
 insert into public.lesson_progress(user_id,lesson_id,position_seconds,completed_at) values(u,l.id,least(p_position_seconds,l.duration_seconds),case when p_complete then now() end)
 on conflict(user_id,lesson_id) do update set position_seconds=greatest(public.lesson_progress.position_seconds,excluded.position_seconds),completed_at=coalesce(public.lesson_progress.completed_at,excluded.completed_at),updated_at=now() returning * into p;
 select m.course_id into cid from public.sections s join public.modules m on m.id=s.module_id where s.id=l.section_id;
 if p_complete then cert:=app_private.issue_certificate(u,cid);end if;
 return jsonb_build_object('completed',p.completed_at is not null,'position_seconds',p.position_seconds,'course_progress_percent',app_private.course_json(u,cid)->'progress_percent','certificate_code',cert,'certificate_reason',case when p_complete and cert is null then 'Certificado indisponível: confira conclusão, vigência e configuração do responsável.' end);
end $$;
revoke execute on function public.app_admin_list(text,text,integer),public.app_admin_save(text,uuid,jsonb),public.app_progress(uuid,numeric,boolean) from public,anon;
grant execute on function public.app_admin_list(text,text,integer),public.app_admin_save(text,uuid,jsonb),public.app_progress(uuid,numeric,boolean) to authenticated;
revoke execute on function public.app_upload_context(uuid,uuid) from public,anon,authenticated;
grant execute on function public.app_upload_context(uuid,uuid) to service_role;
revoke execute on function app_private.actor(boolean),app_private.link_attachment(),app_private.ticket_json(uuid,uuid,boolean),app_private.post_json(uuid,uuid),app_private.reply_json(uuid,uuid) from public,anon,authenticated;
notify pgrst, 'reload schema';
commit;
