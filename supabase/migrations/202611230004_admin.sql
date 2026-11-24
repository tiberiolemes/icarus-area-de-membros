begin;
alter table public.ica_courses add column signer_name text not null default '' check(length(signer_name)<=160), add column signer_title text not null default '' check(length(signer_title)<=160),add column signature_url text;
alter table public.ica_certificates add column signer_name text not null default '',add column signer_title text not null default '',add column signature_url text;
create table public.ica_onboarding_questions(id uuid primary key default gen_random_uuid(),key text not null unique check(key in ('name','segment','role','size','stage','revenue_range','acquisition','product_description')),label text not null check(length(label) between 1 and 200),type text not null default 'text' check(type in ('text','select','textarea')),options jsonb not null default '[]' check(jsonb_typeof(options)='array'),required boolean not null default false,active boolean not null default true,order_index integer not null default 0 check(order_index>=0));
alter table public.ica_onboarding_questions enable row level security;
revoke all on public.ica_onboarding_questions from public,anon,authenticated;
grant all on public.ica_onboarding_questions to service_role;
create function ica_private.entity_roles(p_entity text) returns text[] language sql immutable set search_path='' as $$ select case p_entity
 when 'courses' then array['admin','instructor']
 when 'modules' then array['admin','instructor']
 when 'sections' then array['admin','instructor']
 when 'lessons' then array['admin','instructor']
 when 'material_folders' then array['admin','instructor']
 when 'materials' then array['admin','instructor']
 when 'plans' then array['admin']
 when 'spaces' then array['admin','moderator']
 when 'legal_versions' then array['admin']
 when 'onboarding' then array['admin']
 when 'onboarding_questions' then array['admin']
 when 'profiles' then array['admin']
 when 'orders' then array['admin']
 when 'posts' then array['admin','moderator']
 when 'replies' then array['admin','moderator']
 when 'reports' then array['admin','moderator']
 when 'tickets' then array['admin','support']
 when 'audit_events' then array['admin']
 when 'privacy_requests' then array['admin']
 else '{}'::text[] end $$;
create function public.app_admin_list(p_entity text,p_query text default '',p_page integer default 1) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=ica_private.require_role(ica_private.entity_roles(p_entity));rows jsonb;begin
 if p_page<1 or p_page>100000 or length(p_query)>200 then perform ica_private.fail('Busca inválida.');end if;
 case p_entity
 when 'courses' then select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]'::jsonb) into rows from public.ica_courses t;
 when 'modules' then select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]'::jsonb) into rows from public.ica_modules t;
 when 'sections' then select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]'::jsonb) into rows from public.ica_sections t;
 when 'lessons' then select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]'::jsonb) into rows from public.ica_lessons t;
 when 'material_folders' then select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]'::jsonb) into rows from public.ica_material_folders t;
 when 'materials' then select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]'::jsonb) into rows from public.ica_materials t;
 when 'plans' then select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]'::jsonb) into rows from public.ica_plans t;
 when 'spaces' then select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]'::jsonb) into rows from public.ica_spaces t;
 when 'legal_versions' then select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]'::jsonb) into rows from public.ica_legal_versions t;
 when 'onboarding' then select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]'::jsonb) into rows from public.ica_onboarding t;
 when 'onboarding_questions' then select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]'::jsonb) into rows from public.ica_onboarding_questions t;
 when 'profiles' then select coalesce(jsonb_agg(ica_private.profile_json(t.id) order by t.id),'[]'::jsonb) into rows from public.ica_profiles t;
 when 'orders' then select coalesce(jsonb_agg(to_jsonb(t)-'receipt_hash'-'buyer_data'-'attempt_key' order by t.created_at desc,t.id),'[]'::jsonb) into rows from public.ica_orders t;
 when 'posts' then select coalesce(jsonb_agg(ica_private.post_json(u,t.id) order by t.created_at desc,t.id),'[]'::jsonb) into rows from public.ica_posts t;
 when 'replies' then select coalesce(jsonb_agg(ica_private.reply_json(u,t.id) order by t.created_at desc,t.id),'[]'::jsonb) into rows from public.ica_replies t;
 when 'reports' then select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc,t.id),'[]'::jsonb) into rows from public.ica_reports t;
 when 'tickets' then select coalesce(jsonb_agg(ica_private.ticket_json(u,t.id) order by t.created_at desc,t.id),'[]'::jsonb) into rows from public.ica_tickets t;
 when 'audit_events' then select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc,t.id),'[]'::jsonb) into rows from public.ica_audit_events t;
 when 'privacy_requests' then select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc,t.id),'[]'::jsonb) into rows from public.ica_privacy_requests t;
 else perform ica_private.fail();end case;
 return (select jsonb_build_object('items',coalesce((select jsonb_agg(value order by ord) from (select value,ord from jsonb_array_elements(rows) with ordinality x(value,ord) where value::text ilike '%'||p_query||'%' order by ord limit 20 offset (p_page-1)*20)s),'[]'::jsonb),'total',(select count(*) from jsonb_array_elements(rows) x where x::text ilike '%'||p_query||'%'),'page',p_page,'page_size',20));
end $$;
revoke execute on function public.app_admin_list(text,text,integer) from public,anon;grant execute on function public.app_admin_list(text,text,integer) to authenticated;

create function public.app_admin_save(p_entity text,p_id uuid,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
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
   select coalesce(array_agg(l.id order by m.order_index,m.id,s.order_index,s.id,l.order_index,l.id),'{}') into ids from public.ica_lessons l join public.ica_sections s on s.id=l.section_id join public.ica_modules m on m.id=s.module_id where m.course_id=id_out and l.is_required and not s.is_bonus and l.status='published' and s.status='published' and m.status='published';
   update public.ica_courses set curriculum_version=curriculum_version+case when required_lesson_ids<>ids then 1 else 0 end,required_lesson_ids=ids,updated_at=now() where id=id_out;
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
 perform ica_private.audit(u,case when p_id is null then 'create' else 'update' end,p_entity,id_out);
 return jsonb_build_object('id',id_out);
end $$;
revoke execute on function public.app_admin_save(text,uuid,jsonb) from public,anon;grant execute on function public.app_admin_save(text,uuid,jsonb) to authenticated;

create function public.app_admin_archive(p_entity text,p_id uuid,p_archived boolean,p_reauth_token text) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=ica_private.require_role(ica_private.entity_roles(p_entity));begin
 perform ica_private.consume_reauth(p_reauth_token,u);
 case p_entity
 when 'courses' then update public.ica_courses set previous_status=case when p_archived and status<>'archived' then status else previous_status end,status=case when p_archived then 'archived' when status='archived' then coalesce(previous_status,'draft') else status end where id=p_id;
 when 'modules' then update public.ica_modules set previous_status=case when p_archived and status<>'archived' then status else previous_status end,status=case when p_archived then 'archived' when status='archived' then coalesce(previous_status,'draft') else status end where id=p_id;
 when 'sections' then update public.ica_sections set previous_status=case when p_archived and status<>'archived' then status else previous_status end,status=case when p_archived then 'archived' when status='archived' then coalesce(previous_status,'draft') else status end where id=p_id;
 when 'lessons' then update public.ica_lessons set previous_status=case when p_archived and status<>'archived' then status else previous_status end,status=case when p_archived then 'archived' when status='archived' then coalesce(previous_status,'draft') else status end where id=p_id;
 when 'material_folders' then update public.ica_material_folders set previous_status=case when p_archived and status<>'archived' then status else previous_status end,status=case when p_archived then 'archived' when status='archived' then coalesce(previous_status,'draft') else status end where id=p_id;
 when 'materials' then update public.ica_materials set previous_status=case when p_archived and status<>'archived' then status else previous_status end,status=case when p_archived then 'archived' when status='archived' then coalesce(previous_status,'draft') else status end where id=p_id;
 when 'spaces' then update public.ica_spaces set previous_status=case when p_archived and status<>'archived' then status else previous_status end,status=case when p_archived then 'archived' when status='archived' then coalesce(previous_status,'draft') else status end where id=p_id;
 when 'posts' then update public.ica_posts set previous_status=case when p_archived and status<>'archived' then status else previous_status end,status=case when p_archived then 'archived' when status='archived' then coalesce(previous_status,'draft') else status end where id=p_id;
 when 'replies' then update public.ica_replies set previous_status=case when p_archived and status<>'archived' then status else previous_status end,status=case when p_archived then 'archived' when status='archived' then coalesce(previous_status,'draft') else status end where id=p_id;
 else perform ica_private.fail('Esta entidade não pode ser arquivada.');end case;
 if not found then perform ica_private.fail('Registro indisponível.');end if;
 perform ica_private.audit(u,case when p_archived then 'archive' else 'restore' end,p_entity,p_id);
 return jsonb_build_object('id',p_id,'archived',p_archived);
end $$;
revoke execute on function public.app_admin_archive(text,uuid,boolean,text) from public,anon;grant execute on function public.app_admin_archive(text,uuid,boolean,text) to authenticated;

create function public.app_admin_member(p_id uuid,p_data jsonb,p_reason text,p_reauth_token text) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=ica_private.require_role(array['admin']);end_at timestamptz;begin
 perform ica_private.validate_keys(p_data,array['role','suspended','plan_id','access_ends_at','revoke_access','full_name']);
 if length(trim(p_reason))<3 or length(p_reason)>2000 then perform ica_private.fail('Informe um motivo.');end if;
 perform ica_private.consume_reauth(p_reauth_token,u);
 perform 1 from public.ica_profiles where id=p_id for update;if not found then perform ica_private.fail('Membro indisponível.');end if;
 if p_id=u and ((p_data?'role' and p_data->>'role'<>'admin') or coalesce((p_data->>'suspended')::boolean,false)) then perform ica_private.fail('Não remova seu próprio acesso administrativo.');end if;
 update public.ica_profiles set role=coalesce(p_data->>'role',role),suspended=coalesce((p_data->>'suspended')::boolean,suspended),full_name=coalesce(p_data->>'full_name',full_name) where id=p_id;
 if p_data?'role' or coalesce((p_data->>'suspended')::boolean,false) then update public.ica_app_sessions set revoked_at=now() where user_id=p_id and user_id<>u;end if;
 if coalesce((p_data->>'revoke_access')::boolean,false) then update public.ica_subscriptions set revoked_at=now() where user_id=p_id and revoked_at is null;end if;
 if p_data?'plan_id' then
  end_at:=(p_data->>'access_ends_at')::timestamptz;
  if end_at is null or end_at<=now() or end_at>now()+interval '10 years' then perform ica_private.fail('Informe uma vigência futura válida.');end if;
  if not exists(select 1 from public.ica_plans where id=(p_data->>'plan_id')::uuid and active) then perform ica_private.fail('Plano indisponível.');end if;
  insert into public.ica_subscriptions(user_id,plan_id,ends_at,source) values(p_id,(p_data->>'plan_id')::uuid,end_at,'courtesy');
 elsif p_data?'access_ends_at' then perform ica_private.fail('Selecione o plano para conceder cortesia.');end if;
 perform ica_private.audit(u,'member-change','profiles',p_id,trim(p_reason));return ica_private.profile_json(p_id);
end $$;
revoke execute on function public.app_admin_member(uuid,jsonb,text,text) from public,anon;grant execute on function public.app_admin_member(uuid,jsonb,text,text) to authenticated;
revoke all on all functions in schema ica_private from public,anon,authenticated;
commit;
