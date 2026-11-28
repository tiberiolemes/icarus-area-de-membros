begin;
-- 2.13.0: um material pode ficar em várias aulas. O vínculo sai de materials.lesson_id para material_lessons.
create table public.material_lessons(
 material_id uuid not null references public.materials(id) on delete cascade,
 lesson_id uuid not null references public.lessons(id) on delete cascade,
 primary key(material_id,lesson_id)
);
create index material_lessons_lesson on public.material_lessons(lesson_id);
alter table public.material_lessons enable row level security;
revoke all on table public.material_lessons from public, anon, authenticated, service_role;
insert into public.material_lessons(material_id,lesson_id) select id,lesson_id from public.materials where lesson_id is not null;
-- O drop da coluna leva junto o índice materials_parent(folder_id,lesson_id) e a chave estrangeira.
alter table public.materials drop column lesson_id;
create index materials_parent on public.materials(folder_id);

-- Material sem aula segue a regra da biblioteca; com aulas, basta acessar uma delas.
create or replace function app_private.material_access(p_actor uuid,p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.materials m where m.id=p_id and (app_private.is_staff(p_actor,array['admin','instructor']) or (m.status='published' and app_private.folder_access(p_actor,m.folder_id) and app_private.entitled(p_actor,m.access_mode,m.plan_ids) and case when exists(select 1 from public.material_lessons ml where ml.material_id=m.id) then exists(select 1 from public.material_lessons ml where ml.material_id=m.id and app_private.lesson_access(p_actor,ml.lesson_id)) else app_private.module_enabled('materials') end)))
$$;
create or replace function app_private.material_json(p_actor uuid,p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$ select jsonb_build_object('id',m.id,'name',m.name,'description',m.description,'file_type',m.file_type,'size_bytes',m.size_bytes,'folder_id',m.folder_id,'lesson_ids',array(select ml.lesson_id from public.material_lessons ml where ml.material_id=m.id order by ml.lesson_id),'can_access',app_private.material_access(p_actor,m.id)) from public.materials m where id=p_id $$;
revoke execute on function app_private.material_access(uuid,uuid),app_private.material_json(uuid,uuid) from public, anon, authenticated, service_role;

create or replace function public.app_lesson(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.actor(); l public.lessons;c public.courses;m public.modules;access boolean;prev uuid;nxt uuid;begin
 select x.* into l from public.lessons x join public.sections s on s.id=x.section_id join public.modules mo on mo.id=s.module_id join public.courses co on co.id=mo.course_id where x.id=p_id and ((x.status='published' and s.status='published' and mo.status='published' and co.status='published') or app_private.is_staff(u,array['admin','instructor']));
 if not found then perform app_private.fail('Aula indisponível.');end if;
 select mo.* into m from public.modules mo join public.sections s on s.module_id=mo.id where s.id=l.section_id;select * into c from public.courses where id=m.course_id;
 access:=app_private.lesson_access(u,l.id);
 with ordered as(select x.id,lag(x.id) over(order by mo.order_index,mo.id,s.order_index,s.id,x.order_index,x.id) previous,lead(x.id) over(order by mo.order_index,mo.id,s.order_index,s.id,x.order_index,x.id) next from public.lessons x join public.sections s on s.id=x.section_id join public.modules mo on mo.id=s.module_id where mo.course_id=c.id and x.status='published' and s.status='published' and mo.status='published') select previous,next into prev,nxt from ordered where id=l.id;
 return jsonb_build_object('lesson',app_private.lesson_summary(u,l.id)||case when access then jsonb_build_object('body',l.body,'video_id',l.video_id,'storage_path',l.storage_path) else '{}'::jsonb end,'course',app_private.course_json(u,c.id),'module',jsonb_build_object('id',m.id,'slug',m.slug,'title',m.title),'materials',case when access then coalesce((select jsonb_agg(app_private.material_json(u,x.id) order by x.name,x.id) from public.materials x join public.material_lessons ml on ml.material_id=x.id and ml.lesson_id=l.id where (x.status='published' or app_private.is_staff(u,array['admin','instructor']))),'[]'::jsonb) else '[]'::jsonb end,'position_seconds',coalesce((select position_seconds from public.lesson_progress where user_id=u and lesson_id=l.id),0),'completed',exists(select 1 from public.lesson_progress where user_id=u and lesson_id=l.id and completed_at is not null),'previous_id',prev,'next_id',nxt,'can_access',access,'reason',case when access then null else 'Seu plano não permite acessar esta aula.' end);
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
  select jsonb_build_object('items',coalesce((select jsonb_agg(x.dto order by x.seq) from(select to_jsonb(t)||jsonb_build_object('lesson_ids',array(select ml.lesson_id from public.material_lessons ml where ml.material_id=t.id order by ml.lesson_id)) dto,row_number() over(order by t.id) seq from public.materials t where to_jsonb(t)::text ilike '%'||p_query||'%' order by t.id limit 20 offset (p_page-1)*20)x),'[]'::jsonb),'total',(select count(*) from public.materials t where to_jsonb(t)::text ilike '%'||p_query||'%'),'page',p_page,'page_size',20) into result;
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
  perform app_private.validate_keys(p_data,array['name','description','folder_id','lesson_id','lesson_ids','file_type','size_bytes','storage_path','status','access_mode','plan_ids']);
  if p_id is not null then select to_jsonb(t) into old_data from public.materials t where id=p_id for update;if old_data is null then perform app_private.fail('Registro indisponível.');end if;end if;
  if p_data->>'status'='archived' or old_data->>'status'='archived' then perform app_private.fail('Use arquivar ou restaurar com confirmação.');end if;
  if p_id is null then
   insert into public.materials(id,name,description,folder_id,file_type,size_bytes,storage_path,status,access_mode,plan_ids) values(id_out,coalesce((p_data->>'name')::text,''),coalesce((p_data->>'description')::text,''),coalesce((p_data->>'folder_id')::uuid,null),coalesce((p_data->>'file_type')::text,'application/pdf'),coalesce((p_data->>'size_bytes')::bigint,0),coalesce((p_data->>'storage_path')::text,null),coalesce((p_data->>'status')::text,'draft'),coalesce((p_data->>'access_mode')::text,'subscribers'),coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(p_data->'plan_ids') x),'{}'::uuid[]));
  else
   update public.materials set name=case when p_data?'name' then (p_data->>'name')::text else name end,description=case when p_data?'description' then (p_data->>'description')::text else description end,folder_id=case when p_data?'folder_id' then (p_data->>'folder_id')::uuid else folder_id end,file_type=case when p_data?'file_type' then (p_data->>'file_type')::text else file_type end,size_bytes=case when p_data?'size_bytes' then (p_data->>'size_bytes')::bigint else size_bytes end,storage_path=case when p_data?'storage_path' then (p_data->>'storage_path')::text else storage_path end,status=case when p_data?'status' then (p_data->>'status')::text else status end,access_mode=case when p_data?'access_mode' then (p_data->>'access_mode')::text else access_mode end,plan_ids=case when p_data?'plan_ids' then coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(p_data->'plan_ids') x),'{}'::uuid[]) else plan_ids end where id=id_out;
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
 if p_entity='courses' and exists(select 1 from public.courses c where c.id=id_out and c.status='published' and c.certificate_enabled and (cardinality(c.required_lesson_ids)=0 or not exists(select 1 from public.lessons l where l.id=any(c.required_lesson_ids) and not l.is_preview) or coalesce((select sum(l.duration_seconds) from public.lessons l where l.id=any(c.required_lesson_ids)),0)<=0)) then perform app_private.fail('Configure aulas obrigatórias e carga horária antes de publicar o certificado.');end if;
 perform app_private.audit(u,case when p_id is null then 'create' else 'update' end,p_entity,id_out);
 return jsonb_build_object('id',id_out);
end $$;

create or replace function public.app_local_demo(p_accounts jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare a uuid;key text;role_out text;pro uuid;u uuid;meta jsonb;
 cid uuid:='d0000000-0000-4000-8000-000000000001';mid uuid:='d0000000-0000-4000-8000-000000000002';sid uuid:='d0000000-0000-4000-8000-000000000003';lid uuid:='d0000000-0000-4000-8000-000000000004';preview uuid:='d0000000-0000-4000-8000-000000000005';material uuid:='d0000000-0000-4000-8000-000000000006';folder uuid:='d0000000-0000-4000-8000-000000000007';space uuid:='d0000000-0000-4000-8000-000000000008';plan uuid:='d0000000-0000-4000-8000-000000000009';upload_l uuid:='d0000000-0000-4000-8000-000000000010';upload_m uuid:='d0000000-0000-4000-8000-000000000011';
begin
 if not exists(select 1 from app_private.local_demo_guard where singleton and enabled) then perform app_private.fail('Demonstração local desabilitada.');end if;
 perform app_private.validate_keys(p_accounts,array['admin','member','pro','moderator','support']);
 foreach key in array array['admin','member','pro','moderator','support'] loop
  u:=(p_accounts->>key)::uuid;
  if u is null or not exists(select 1 from auth.users where id=u and email_confirmed_at is not null) then perform app_private.fail('Crie as contas Auth locais confirmadas antes da demonstração.');end if;
  role_out:=case when key='pro' then 'member' else key end;
  update public.profiles set role=role_out,demo=true where id=u;
 end loop;
 a:=(p_accounts->>'admin')::uuid;pro:=(p_accounts->>'pro')::uuid;
 insert into public.plans(id,name,slug,price_cents,access_months,benefits,active) values(plan,'DEMONSTRAÇÃO local','demonstracao-local',9900,12,'["Conteúdo sintético local, sem oferta comercial"]',true) on conflict(id) do nothing;
 if not exists(select 1 from public.subscriptions where user_id=pro and plan_id=plan and source='courtesy') then insert into public.subscriptions(user_id,plan_id,ends_at,source) values(pro,plan,now()+interval '1 year','courtesy');end if;
 insert into public.courses(id,slug,title,description,status,access_mode,plan_ids,certificate_enabled,signer_name,signer_title) values(cid,'demonstracao-local','DEMONSTRAÇÃO • Curso local','Fixture sintética para validar entrega e controles. Não representa curso ou cliente real.','published','plans',array[plan],true,'DEMONSTRAÇÃO responsável','Instrutor de demonstração') on conflict(id) do nothing;
 insert into public.modules(id,course_id,slug,title,status) values(mid,cid,'demonstracao','DEMONSTRAÇÃO • Módulo','published') on conflict(id) do nothing;
 insert into public.sections(id,module_id,title,status) values(sid,mid,'DEMONSTRAÇÃO • Seção','published') on conflict(id) do nothing;
 insert into public.lessons(id,section_id,slug,title,body,type,duration_seconds,is_preview,order_index,status) values(preview,sid,'previa','DEMONSTRAÇÃO • Prévia','Aula de texto demonstrativa.','text',60,true,0,'published'),(lid,sid,'video-local','DEMONSTRAÇÃO • Vídeo privado','Vídeo sintético de oito segundos para testar Storage privado; não é integração Bunny.','video',8,false,1,'published') on conflict(id) do nothing;
 insert into public.material_folders(id,name,status,access_mode,plan_ids) values(folder,'DEMONSTRAÇÃO • Materiais','published','plans',array[plan]) on conflict(id) do nothing;
 insert into public.materials(id,folder_id,name,description,file_type,status,access_mode,plan_ids) values(material,folder,'DEMONSTRAÇÃO • Material.txt','Arquivo sintético local, sem conteúdo de clientes.','text/plain','published','plans',array[plan]) on conflict(id) do nothing;
 insert into public.material_lessons(material_id,lesson_id) values(material,lid) on conflict do nothing;
 insert into public.spaces(id,name,description,status,access_mode) values(space,'DEMONSTRAÇÃO • Comunidade','Conteúdo sintético com aprovação manual.','published','members') on conflict(id) do nothing;
 insert into public.legal_versions(kind,version,title,body,demo,published) values('terms','demo-local','DEMONSTRAÇÃO • Termos locais','FIXTURE LOCAL. Texto exclusivamente demonstrativo, sem validade como política jurídica ou oferta comercial.',true,not exists(select 1 from public.legal_versions where kind='terms' and published)),('privacy','demo-local','DEMONSTRAÇÃO • Privacidade local','FIXTURE LOCAL. Texto exclusivamente demonstrativo; não habilita cadastro público nem checkout de produção.',true,not exists(select 1 from public.legal_versions where kind='privacy' and published)) on conflict(kind,version) do nothing;
 -- A second call after service uploads registers actual metadata; nothing is ready before an object exists.
 select metadata into meta from storage.objects where bucket_id='icarus-private' and name='demo/aula.mp4';
 if meta is not null and meta->>'mimetype'='video/mp4' and (meta->>'size')::bigint between 1 and 524288000 then
  insert into public.uploads(id,actor_id,kind,resource_id,lesson_id,path,file_name,content_type,size_bytes,state) values(upload_l,a,'lesson',lid,lid,'demo/aula.mp4','aula.mp4','video/mp4',(meta->>'size')::bigint,'ready') on conflict(id) do nothing;
  update public.lessons set storage_path='demo/aula.mp4' where id=lid and storage_path is null;
 end if;
 select metadata into meta from storage.objects where bucket_id='icarus-private' and name='demo/material.txt';
 if meta is not null and meta->>'mimetype'='text/plain' and (meta->>'size')::bigint between 1 and 524288000 then
  insert into public.uploads(id,actor_id,kind,resource_id,material_id,path,file_name,content_type,size_bytes,state) values(upload_m,a,'material',material,material,'demo/material.txt','material.txt','text/plain',(meta->>'size')::bigint,'ready') on conflict(id) do nothing;
  update public.materials set storage_path='demo/material.txt',size_bytes=(meta->>'size')::bigint where id=material and storage_path is null;
 end if;
 return jsonb_build_object('course_id',cid,'module_id',mid,'section_id',sid,'lesson_id',lid,'preview_lesson_id',preview,'material_id',material,'folder_id',folder,'space_id',space,'plan_id',plan,'lesson_path','demo/aula.mp4','material_path','demo/material.txt','bucket','icarus-private');
end $$;

revoke execute on function public.app_lesson(uuid),public.app_admin_list(text,text,integer),public.app_admin_save(text,uuid,jsonb) from public, anon, authenticated, service_role;
grant execute on function public.app_lesson(uuid),public.app_admin_list(text,text,integer),public.app_admin_save(text,uuid,jsonb) to authenticated;
revoke execute on function public.app_local_demo(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.app_local_demo(jsonb) to service_role;

-- Desvincular a última aula devolve o material para rascunho, para não abrir para qualquer conta.
create function public.app_admin_unlink_material(p_material_id uuid,p_lesson_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.require_role(app_private.entity_roles('materials'));m public.materials;begin
 perform app_private.throttle(u,'material_unlink',60);
 select * into m from public.materials where id=p_material_id for update;
 if not found then perform app_private.fail('Registro indisponível.');end if;
 delete from public.material_lessons where material_id=m.id and lesson_id=p_lesson_id;
 if not found then perform app_private.fail('Registro indisponível.');end if;
 -- Arquivado continua arquivado, mas restaura como rascunho.
 if not exists(select 1 from public.material_lessons where material_id=m.id) then
  update public.materials set status=case when status='archived' then status else 'draft' end,previous_status=case when status='archived' then 'draft' else previous_status end where id=m.id returning * into m;
 end if;
 perform app_private.audit(u,'unlink','materials',m.id);
 return jsonb_build_object('id',m.id,'status',m.status);
end $$;
revoke execute on function public.app_admin_unlink_material(uuid,uuid) from public, anon, authenticated, service_role;
grant execute on function public.app_admin_unlink_material(uuid,uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
