begin;

create function ica_private.lesson_path(p_course_slug text,p_module_slug text,p_lesson_id uuid)
returns text language sql immutable strict set search_path='' as $$
 select '/app/cursos/'||p_course_slug||'/'||p_module_slug||'/~'||p_lesson_id
$$;
revoke execute on function ica_private.lesson_path(text,text,uuid) from public,anon,authenticated,service_role;

create or replace function public.app_member_search(p_query text default '',p_page integer default 1)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 actor_id uuid := ica_private.actor();
 term text;
 result jsonb;
begin
 if p_query is null or length(p_query)>200 or p_page is null or p_page not between 1 and 100000 then
  perform ica_private.fail('Busca inválida.');
 end if;
 term := lower(ica_private.trim_lesson_engagement_text(p_query));
 if length(term)<2 then
  return jsonb_build_object('items','[]'::jsonb,'total',0,'page',p_page,'page_size',20);
 end if;
 perform ica_private.throttle(actor_id,'member_search',60);

 with matches as (
  select 'course' as kind,c.title,'/app/cursos/'||c.slug as path, '/app/cursos/'||c.slug as sort_path
  from public.ica_courses c
  where c.status='published' and strpos(lower(c.title),term)>0
   and ica_private.course_access(actor_id,c.id)
  union all
  select 'module',m.title,'/app/cursos/'||c.slug||'/'||m.slug, '/app/cursos/'||c.slug||'/'||m.slug
  from public.ica_modules m join public.ica_courses c on c.id=m.course_id
  where m.status='published' and c.status='published' and strpos(lower(m.title),term)>0
   and ica_private.course_access(actor_id,c.id)
   and (m.access_mode='inherit' or ica_private.entitled(actor_id,m.access_mode,m.plan_ids))
  union all
  select 'lesson',l.title,ica_private.lesson_path(c.slug,m.slug,l.id), '/app/cursos/'||c.slug||'/'||m.slug||'/'||l.slug
  from public.ica_lessons l
  join public.ica_sections s on s.id=l.section_id
  join public.ica_modules m on m.id=s.module_id
  join public.ica_courses c on c.id=m.course_id
  where l.status='published' and s.status='published' and m.status='published' and c.status='published'
   and strpos(lower(l.title),term)>0 and ica_private.lesson_access(actor_id,l.id)
 ), page_items as (
  select kind,title,path,sort_path,lower(title) as sort_title,
   case when lower(title)=term then 0 when strpos(lower(title),term)=1 then 1 else 2 end as rank
  from matches
  order by rank,sort_title,sort_path,path
  limit 20 offset (p_page-1)*20
 )
 select jsonb_build_object(
  'items',coalesce(jsonb_agg(jsonb_build_object('kind',kind,'title',title,'path',path)
   order by rank,sort_title,sort_path,path),'[]'::jsonb),
  'total',(select count(*) from matches),'page',p_page,'page_size',20
 ) into result from page_items;
 return result;
end $$;

revoke execute on function public.app_member_search(text,integer) from public,anon,service_role;
grant execute on function public.app_member_search(text,integer) to authenticated;

create or replace function ica_private.notification_item_v026(p_item public.ica_notifications)
returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',p_item.id,'event_key',p_item.event_key,
  'created_at',p_item.created_at,'read_at',p_item.read_at,
  'title',case when p_item.event_key='certificate_issued' then 'Certificado emitido'
   else 'Comentário aprovado' end,
  'subtitle',case when p_item.event_key='certificate_issued' then (
    select left(c.course_title,200) from public.ica_certificates c
    where c.id=p_item.source_id and c.user_id=p_item.user_id
   ) else 'Seu comentário foi aprovado na aula.' end,
  'action_path',case when p_item.event_key='certificate_issued' then '/app/certificados'
   else (
    select ica_private.lesson_path(c.slug,m.slug,l.id)
    from public.ica_lesson_comments lc
    join public.ica_lessons l on l.id=lc.lesson_id
    join public.ica_sections s on s.id=l.section_id
    join public.ica_modules m on m.id=s.module_id
    join public.ica_courses c on c.id=m.course_id
    where lc.id=p_item.source_id and lc.author_id=p_item.user_id
     and ica_private.lesson_access(p_item.user_id,l.id)
   ) end)
$$;

notify pgrst,'reload schema';
commit;
