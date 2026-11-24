begin;
create function ica_private.profile_json(p_actor uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select to_jsonb(p)-'created_at' || jsonb_build_object('email',u.email,'plan_name',s.plan_name,'access_ends_at',s.ends_at)
 from public.ica_profiles p join auth.users u on u.id=p.id left join lateral(
 select pl.name plan_name,x.ends_at from public.ica_subscriptions x join public.ica_plans pl on pl.id=x.plan_id where x.user_id=p.id and x.revoked_at is null and x.starts_at<=now() and x.ends_at>now() order by x.ends_at desc limit 1
 )s on true where p.id=p_actor
$$;
create function ica_private.course_json(p_actor uuid,p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',c.id,'slug',c.slug,'title',c.title,'description',c.description,'cover_url',c.cover_url,'status',c.status,'access_mode',c.access_mode,'plan_ids',c.plan_ids,'certificate_enabled',c.certificate_enabled,
 'required_lessons',cardinality(c.required_lesson_ids),'total_lessons',q.total,'completed_lessons',q.done,'progress_percent',case when cardinality(c.required_lesson_ids)>0 then round(100.0*q.required_done/cardinality(c.required_lesson_ids)) else 0 end,'duration_seconds',q.duration,'can_access',ica_private.course_access(p_actor,c.id))
 from public.ica_courses c cross join lateral(select count(*) total,count(*) filter(where lp.completed_at is not null) done,count(*) filter(where lp.completed_at is not null and l.id=any(c.required_lesson_ids)) required_done,coalesce(sum(l.duration_seconds),0) duration from public.ica_lessons l join public.ica_sections s on s.id=l.section_id join public.ica_modules m on m.id=s.module_id left join public.ica_lesson_progress lp on lp.lesson_id=l.id and lp.user_id=p_actor where m.course_id=c.id and l.status='published' and s.status='published' and m.status='published')q where c.id=p_id
$$;
create function ica_private.lesson_summary(p_actor uuid,p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',l.id,'slug',l.slug,'title',l.title,'duration_seconds',l.duration_seconds,'type',l.type,'order_index',l.order_index,'can_access',ica_private.lesson_access(p_actor,l.id),'completed',p.completed_at is not null,'is_preview',l.is_preview,'is_required',l.is_required) from public.ica_lessons l left join public.ica_lesson_progress p on p.lesson_id=l.id and p.user_id=p_actor where l.id=p_id
$$;
create function ica_private.material_json(p_actor uuid,p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$ select jsonb_build_object('id',m.id,'name',m.name,'description',m.description,'file_type',m.file_type,'size_bytes',m.size_bytes,'folder_id',m.folder_id,'lesson_id',m.lesson_id,'can_access',ica_private.material_access(p_actor,m.id)) from public.ica_materials m where id=p_id $$;
create function ica_private.issue_certificate(p_actor uuid,p_course uuid) returns text language plpgsql security definer set search_path='' as $$
declare c public.ica_courses; code_out text; ids uuid[]; name text;begin
 select * into c from public.ica_courses where id=p_course for update;
 if not c.certificate_enabled or c.status<>'published' or cardinality(c.required_lesson_ids)=0 or not ica_private.course_access(p_actor,p_course) then return null;end if;
 if exists(select 1 from unnest(c.required_lesson_ids) x where not ica_private.lesson_access(p_actor,x) or not exists(select 1 from public.ica_lesson_progress p where p.user_id=p_actor and p.lesson_id=x and p.completed_at is not null)) then return null;end if;
 select full_name into name from public.ica_profiles where id=p_actor;
 if length(trim(name))<3 then return null;end if;
 insert into public.ica_certificates(user_id,course_id,curriculum_version,student_name,course_title,duration_minutes,lesson_ids,demo)
 values(p_actor,c.id,c.curriculum_version,name,c.title,(select ceil(sum(duration_seconds)/60.0) from public.ica_lessons where id=any(c.required_lesson_ids)),c.required_lesson_ids,(select demo from public.ica_profiles where id=p_actor))
 on conflict(user_id,course_id,curriculum_version) do nothing;
 select code into code_out from public.ica_certificates where user_id=p_actor and course_id=c.id and curriculum_version=c.curriculum_version and revoked_at is null;
 return code_out;
end $$;
create function public.app_public_context() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('name','Icarus','legal_ready',(select count(distinct kind)=2 from public.ica_legal_versions where published and not demo),'registration_enabled',(select count(distinct kind)=2 from public.ica_legal_versions where published and not demo),
 'legal_versions',coalesce((select jsonb_agg(jsonb_build_object('id',id,'kind',kind,'version',version,'title',title,'body',body,'demo',demo)) from public.ica_legal_versions where published),'[]'::jsonb),'plans',coalesce((select jsonb_agg(to_jsonb(p)-'created_at') from public.ica_plans p where active),'[]'::jsonb))
$$;
revoke execute on function public.app_public_context() from public,anon,authenticated;
grant execute on function public.app_public_context() to anon,authenticated;
comment on function public.app_public_context() is 'anon-ok: configuração pública, ofertas ativas e textos legais publicados sem credenciais';

create function public.app_bootstrap() returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=ica_private.actor(true);begin
 return jsonb_build_object('profile',ica_private.profile_json(u),'plans',coalesce((select jsonb_agg(to_jsonb(p)-'created_at') from public.ica_plans p where active),'[]'::jsonb),'settings',jsonb_build_object('name','Icarus','terms_url','/termos','privacy_url','/privacidade','onboarding',(select to_jsonb(o)-'singleton' from public.ica_onboarding o limit 1),'capabilities',jsonb_build_object('checkout',false,'bunny',false)));
end $$;
revoke execute on function public.app_bootstrap() from public,anon;grant execute on function public.app_bootstrap() to authenticated;

create function public.app_touch_session(p_activity boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=ica_private.actor(true);sid uuid:=(auth.jwt()->>'session_id')::uuid;expires timestamptz;begin
 if p_activity then update public.ica_app_sessions set last_activity_at=now(),expires_at=now()+case when (select role from public.ica_profiles where id=u)='member' then interval '2 hours' else interval '30 minutes' end where id=sid and expires_at>now() and revoked_at is null;end if;
 select expires_at into expires from public.ica_app_sessions where id=sid;
 return jsonb_build_object('expires_at',expires,'warning_seconds',60);
end $$;
revoke execute on function public.app_touch_session(boolean) from public,anon;grant execute on function public.app_touch_session(boolean) to authenticated;

create function public.app_catalog(p_query text default '',p_page integer default 1) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=ica_private.actor();result jsonb;begin
 if p_page<1 or p_page>100000 or length(p_query)>200 then perform ica_private.fail('Busca inválida.');end if;
 select jsonb_build_object('items',coalesce((select jsonb_agg(ica_private.course_json(u,x.id)) from (select id from public.ica_courses where status='published' and (title ilike '%'||p_query||'%' or description ilike '%'||p_query||'%') order by title,id limit 20 offset (p_page-1)*20)x),'[]'::jsonb),'total',(select count(*) from public.ica_courses where status='published' and (title ilike '%'||p_query||'%' or description ilike '%'||p_query||'%')),'page',p_page,'page_size',20) into result;
 return result;
end $$;
revoke execute on function public.app_catalog(text,integer) from public,anon;grant execute on function public.app_catalog(text,integer) to authenticated;

create function public.app_course(p_slug text) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=ica_private.actor();c public.ica_courses;staff boolean:=ica_private.is_staff(u,array['admin','instructor']);begin
 select * into c from public.ica_courses where slug=p_slug and (status='published' or staff);
 if not found then perform ica_private.fail('Curso indisponível.');end if;
 return jsonb_build_object('course',ica_private.course_json(u,c.id),'modules',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'slug',m.slug,'title',m.title,'order_index',m.order_index,'can_access',ica_private.course_access(u,c.id) and (m.access_mode='inherit' or ica_private.entitled(u,m.access_mode,m.plan_ids)),'sections',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'title',s.title,'order_index',s.order_index,'is_bonus',s.is_bonus,'lessons',coalesce((select jsonb_agg(ica_private.lesson_summary(u,l.id) order by l.order_index,l.id) from public.ica_lessons l where l.section_id=s.id and (l.status='published' or staff)),'[]'::jsonb)) order by s.order_index,s.id) from public.ica_sections s where s.module_id=m.id and (s.status='published' or staff)),'[]'::jsonb)) order by m.order_index,m.id) from public.ica_modules m where m.course_id=c.id and (m.status='published' or staff)),'[]'::jsonb));
end $$;
revoke execute on function public.app_course(text) from public,anon;grant execute on function public.app_course(text) to authenticated;

create function public.app_lesson(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=ica_private.actor(); l public.ica_lessons;c public.ica_courses;m public.ica_modules;access boolean;prev uuid;nxt uuid;begin
 select x.* into l from public.ica_lessons x join public.ica_sections s on s.id=x.section_id join public.ica_modules mo on mo.id=s.module_id join public.ica_courses co on co.id=mo.course_id where x.id=p_id and ((x.status='published' and s.status='published' and mo.status='published' and co.status='published') or ica_private.is_staff(u,array['admin','instructor']));
 if not found then perform ica_private.fail('Aula indisponível.');end if;
 select mo.* into m from public.ica_modules mo join public.ica_sections s on s.module_id=mo.id where s.id=l.section_id;select * into c from public.ica_courses where id=m.course_id;
 access:=ica_private.lesson_access(u,l.id);
 with ordered as(select x.id,lag(x.id) over(order by mo.order_index,mo.id,s.order_index,s.id,x.order_index,x.id) previous,lead(x.id) over(order by mo.order_index,mo.id,s.order_index,s.id,x.order_index,x.id) next from public.ica_lessons x join public.ica_sections s on s.id=x.section_id join public.ica_modules mo on mo.id=s.module_id where mo.course_id=c.id and x.status='published' and s.status='published' and mo.status='published') select previous,next into prev,nxt from ordered where id=l.id;
 return jsonb_build_object('lesson',ica_private.lesson_summary(u,l.id)||case when access then jsonb_build_object('body',l.body,'video_id',l.video_id,'storage_path',l.storage_path) else '{}'::jsonb end,'course',ica_private.course_json(u,c.id),'module',jsonb_build_object('id',m.id,'slug',m.slug,'title',m.title),'materials',case when access then coalesce((select jsonb_agg(ica_private.material_json(u,x.id) order by x.name,x.id) from public.ica_materials x where x.lesson_id=l.id and (x.status='published' or ica_private.is_staff(u,array['admin','instructor']))),'[]'::jsonb) else '[]'::jsonb end,'position_seconds',coalesce((select position_seconds from public.ica_lesson_progress where user_id=u and lesson_id=l.id),0),'completed',exists(select 1 from public.ica_lesson_progress where user_id=u and lesson_id=l.id and completed_at is not null),'previous_id',prev,'next_id',nxt,'can_access',access,'reason',case when access then null else 'Seu plano não permite acessar esta aula.' end);
end $$;
revoke execute on function public.app_lesson(uuid) from public,anon;grant execute on function public.app_lesson(uuid) to authenticated;

create function public.app_progress(p_lesson_id uuid,p_position_seconds numeric default 0,p_complete boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=ica_private.actor();l public.ica_lessons;cid uuid;p public.ica_lesson_progress;cert text;begin
 if not ica_private.lesson_access(u,p_lesson_id) then perform ica_private.fail('Aula indisponível para seu acesso.');end if;
 if p_position_seconds is null or p_position_seconds<0 or p_position_seconds='NaN'::numeric or p_position_seconds>86400 then perform ica_private.fail('Posição inválida.');end if;
 select * into l from public.ica_lessons where id=p_lesson_id;
 -- Staff preview of drafts cannot count as member curriculum completion.
 if l.status<>'published' or not exists(select 1 from public.ica_sections s join public.ica_modules m on m.id=s.module_id join public.ica_courses c on c.id=m.course_id where s.id=l.section_id and s.status='published' and m.status='published' and c.status='published') then perform ica_private.fail('Prévia não registra conclusão.');end if;
 insert into public.ica_lesson_progress(user_id,lesson_id,position_seconds,completed_at) values(u,l.id,least(p_position_seconds,l.duration_seconds),case when p_complete then now() end)
 on conflict(user_id,lesson_id) do update set position_seconds=greatest(public.ica_lesson_progress.position_seconds,excluded.position_seconds),completed_at=coalesce(public.ica_lesson_progress.completed_at,excluded.completed_at),updated_at=now() returning * into p;
 select m.course_id into cid from public.ica_sections s join public.ica_modules m on m.id=s.module_id where s.id=l.section_id;
 if p_complete then cert:=ica_private.issue_certificate(u,cid);end if;
 return jsonb_build_object('completed',p.completed_at is not null,'position_seconds',p.position_seconds,'course_progress_percent',ica_private.course_json(u,cid)->'progress_percent','certificate_code',cert);
end $$;
revoke execute on function public.app_progress(uuid,numeric,boolean) from public,anon;grant execute on function public.app_progress(uuid,numeric,boolean) to authenticated;

create function public.app_materials(p_folder_id uuid default null,p_query text default '',p_page integer default 1) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=ica_private.actor();begin
 if p_page<1 or p_page>100000 or length(p_query)>200 then perform ica_private.fail('Busca inválida.');end if;
 if not ica_private.folder_access(u,p_folder_id) then perform ica_private.fail('Pasta indisponível.');end if;
 return jsonb_build_object('folders',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'parent_id',parent_id)) from public.ica_material_folders where parent_id is not distinct from p_folder_id and ica_private.folder_access(u,id)),'[]'::jsonb),'items',coalesce((select jsonb_agg(ica_private.material_json(u,x.id)) from(select id from public.ica_materials where folder_id is not distinct from p_folder_id and status='published' and name ilike '%'||p_query||'%' order by name,id limit 20 offset (p_page-1)*20)x),'[]'::jsonb),'total',(select count(*) from public.ica_materials where folder_id is not distinct from p_folder_id and status='published' and name ilike '%'||p_query||'%'),'page',p_page,'page_size',20);
end $$;
revoke execute on function public.app_materials(uuid,text,integer) from public,anon;grant execute on function public.app_materials(uuid,text,integer) to authenticated;

create function public.app_certificates() returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=ica_private.actor();begin return jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(c)-'user_id'-'lesson_ids' order by issued_at desc) from public.ica_certificates c where user_id=u),'[]'::jsonb),'courses',coalesce((select jsonb_agg(ica_private.course_json(u,c.id) order by c.title,c.id) from public.ica_courses c where status='published' and certificate_enabled),'[]'::jsonb));end $$;
revoke execute on function public.app_certificates() from public,anon;grant execute on function public.app_certificates() to authenticated;
create function public.app_certificate(p_code text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;begin
 if length(p_code)<>48 then perform ica_private.fail('Certificado indisponível.');end if;
 select jsonb_build_object('id',id,'code',code,'student_name',student_name,'course_title',course_title,'duration_minutes',duration_minutes,'issued_at',issued_at,'revoked_at',revoked_at,'demo',demo) into result from public.ica_certificates where code=p_code;
 if result is null then perform ica_private.fail('Certificado indisponível.');end if;return result;
end $$;
revoke execute on function public.app_certificate(text) from public,anon,authenticated;grant execute on function public.app_certificate(text) to anon,authenticated;
comment on function public.app_certificate(text) is 'anon-ok: verificação pontual por código aleatório de 192 bits, sem email ou CPF, sem listagem';

create function ica_private.validate_keys(p_data jsonb,p_keys text[]) returns void language plpgsql set search_path='' as $$ begin
 if jsonb_typeof(p_data) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_data) k where not k=any(p_keys)) then perform ica_private.fail('Campos não permitidos.');end if;
end $$;
create function public.app_profile(p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=ica_private.actor();c jsonb;begin
 perform ica_private.validate_keys(p_data,array['full_name','phone','bio','company','theme','onboarding_complete']);
 if p_data?'company' then
  perform ica_private.validate_keys(p_data->'company',array['name','segment','role','size']);
  if exists(select 1 from jsonb_each(p_data->'company') x where jsonb_typeof(x.value)<>'string' or length(x.value#>>'{}')>300) then perform ica_private.fail('Dados da empresa inválidos.');end if;
 end if;
 update public.ica_profiles set full_name=case when p_data?'full_name' then trim(p_data->>'full_name') else full_name end,phone=coalesce(p_data->>'phone',phone),bio=coalesce(p_data->>'bio',bio),company=coalesce(p_data->'company',company),theme=coalesce(p_data->>'theme',theme),onboarding_complete=coalesce((p_data->>'onboarding_complete')::boolean,onboarding_complete) where id=u;
 if exists(select 1 from public.ica_profiles p cross join public.ica_onboarding o where p.id=u and p.onboarding_complete and (length(trim(p.full_name))<3 or (o.company_required and length(trim(coalesce(p.company->>'name','')))<1))) then perform ica_private.fail('Preencha seu nome e os dados obrigatórios da empresa.');end if;
 return ica_private.profile_json(u);
end $$;
revoke execute on function public.app_profile(jsonb) from public,anon;grant execute on function public.app_profile(jsonb) to authenticated;
create function public.app_help_feedback(p_page text,p_action text,p_rating boolean default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=ica_private.actor();begin
 insert into public.ica_help_feedback(user_id,page,action,rating) values(u,p_page,p_action,p_rating) on conflict(user_id,page) do update set action=excluded.action,rating=excluded.rating,updated_at=now();return jsonb_build_object('ok',true);
end $$;
revoke execute on function public.app_help_feedback(text,text,boolean) from public,anon;grant execute on function public.app_help_feedback(text,text,boolean) to authenticated;
create function public.app_privacy_request(p_kind text) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=ica_private.actor();result jsonb;begin
 perform ica_private.throttle(u,'privacy',3);
 insert into public.ica_privacy_requests(user_id,kind) values(u,p_kind) on conflict(user_id,kind) where status in ('pending','processing') do update set user_id=excluded.user_id returning jsonb_build_object('id',id,'status',status) into result;
 return result;
end $$;
revoke execute on function public.app_privacy_request(text) from public,anon;grant execute on function public.app_privacy_request(text) to authenticated;
create function public.app_export_data() returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=ica_private.actor();begin
 perform ica_private.throttle(u,'export',2);
 return jsonb_build_object('profile',ica_private.profile_json(u),'subscriptions',coalesce((select jsonb_agg(to_jsonb(s)-'order_id') from public.ica_subscriptions s where user_id=u),'[]'::jsonb),'progress',coalesce((select jsonb_agg(to_jsonb(p)) from public.ica_lesson_progress p where user_id=u),'[]'::jsonb),'certificates',coalesce((select jsonb_agg(to_jsonb(c)) from public.ica_certificates c where user_id=u),'[]'::jsonb),'posts',coalesce((select jsonb_agg(to_jsonb(p)) from public.ica_posts p where author_id=u),'[]'::jsonb),'replies',coalesce((select jsonb_agg(to_jsonb(r)) from public.ica_replies r where author_id=u),'[]'::jsonb),'ticket_messages',coalesce((select jsonb_agg(to_jsonb(m)) from public.ica_ticket_messages m where author_id=u),'[]'::jsonb),'orders',coalesce((select jsonb_agg(jsonb_build_object('id',id,'amount_cents',amount_cents,'status',status,'created_at',created_at)) from public.ica_orders where user_id=u),'[]'::jsonb),'legal_acceptances',coalesce((select jsonb_agg(to_jsonb(a)) from public.ica_legal_acceptances a where user_id=u),'[]'::jsonb),'privacy_requests',coalesce((select jsonb_agg(to_jsonb(p)) from public.ica_privacy_requests p where user_id=u),'[]'::jsonb));
end $$;
revoke execute on function public.app_export_data() from public,anon;grant execute on function public.app_export_data() to authenticated;
revoke all on all functions in schema ica_private from public,anon,authenticated;
commit;
