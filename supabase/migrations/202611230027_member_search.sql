begin;

create function public.app_member_search(p_query text default '',p_page integer default 1)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 actor_id uuid := ica_private.actor();
 term text;
 can_view_unpublished boolean;
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
 can_view_unpublished := ica_private.is_staff(actor_id,array['admin','instructor']);

 with matches as (
  select 'course' as kind,c.title,'/app/cursos/'||c.slug as path
  from public.ica_courses c
  where c.status='published' and strpos(lower(c.title),term)>0
   and ica_private.course_access(actor_id,c.id)
  union all
  select 'module',m.title,'/app/cursos/'||c.slug||'/'||m.slug
  from public.ica_modules m join public.ica_courses c on c.id=m.course_id
  where m.status='published' and c.status='published' and strpos(lower(m.title),term)>0
   and ica_private.course_access(actor_id,c.id)
   and (m.access_mode='inherit' or ica_private.entitled(actor_id,m.access_mode,m.plan_ids))
  union all
  select 'lesson',l.title,'/app/cursos/'||c.slug||'/'||m.slug||'/'||l.slug
  from public.ica_lessons l
  join public.ica_sections s on s.id=l.section_id
  join public.ica_modules m on m.id=s.module_id
  join public.ica_courses c on c.id=m.course_id
  where l.status='published' and s.status='published' and m.status='published' and c.status='published'
   and strpos(lower(l.title),term)>0 and ica_private.lesson_access(actor_id,l.id)
   -- LessonPage resolves repeated slugs to the first visible section in curriculum order.
   and not exists (
    select 1 from public.ica_sections prior
    join public.ica_lessons other on other.section_id=prior.id and other.slug=l.slug
    where prior.module_id=m.id and (prior.order_index,prior.id)<(s.order_index,s.id)
     and ((prior.status='published' and other.status='published') or can_view_unpublished)
   )
 ), page_items as (
  select kind,title,path,lower(title) as sort_title,
   case when lower(title)=term then 0 when strpos(lower(title),term)=1 then 1 else 2 end as rank
  from matches
  order by rank,sort_title,path
  limit 20 offset (p_page-1)*20
 )
 select jsonb_build_object(
  'items',coalesce(jsonb_agg(jsonb_build_object('kind',kind,'title',title,'path',path)
   order by rank,sort_title,path),'[]'::jsonb),
  'total',(select count(*) from matches),'page',p_page,'page_size',20
 ) into result from page_items;
 return result;
end $$;

revoke execute on function public.app_member_search(text,integer) from public,anon,service_role;
grant execute on function public.app_member_search(text,integer) to authenticated;
notify pgrst,'reload schema';
commit;
