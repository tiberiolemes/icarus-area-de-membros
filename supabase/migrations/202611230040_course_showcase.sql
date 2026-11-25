begin;

-- Catálogo do aluno: filtrar/ordenar antes da paginação e resolver o destino pelo titular.
create function public.app_catalog_showcase(p_query text default '', p_page integer default 1,
  p_filter text default 'all', p_sort text default 'recent') returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  member_id uuid := app_private.actor();
  result jsonb;
begin
  if p_query is null or length(p_query)>200 or p_page is null or p_page not between 1 and 100000
    or p_filter is null or p_filter not in ('all','ongoing','completed','restricted')
    or p_sort is null or p_sort not in ('recent','progress','title','duration') then
    perform app_private.fail('Filtro de cursos inválido.');
  end if;

  with courses as materialized (
    select c.id,c.slug,c.title,c.description,(c.cover_url is not null) as has_cover,c.created_at,
      app_private.course_access(member_id,c.id) as can_access,
      stats.*,
      case when stats.total_lessons=0 then 0
        else round(100.0*stats.completed_lessons/stats.total_lessons) end as progress_percent
    from public.courses c cross join lateral (
      select count(distinct m.id) as module_count,count(l.id) as total_lessons,
        coalesce(sum(l.duration_seconds),0) as duration_seconds,
        count(p.completed_at) as completed_lessons,
        max(p.updated_at) filter(where (p.position_seconds>0 or p.completed_at is not null)
          and app_private.lesson_access(member_id,l.id)) as last_activity
      from public.modules m
      left join public.sections s on s.module_id=m.id and s.status='published'
      left join public.lessons l on l.section_id=s.id and l.status='published'
      left join public.lesson_progress p on p.lesson_id=l.id and p.user_id=member_id
      where m.course_id=c.id and m.status='published'
    ) stats where c.status='published'
  ), classified as materialized (
    select c.*,case when not can_access then 'restricted'
      when total_lessons>0 and completed_lessons=total_lessons then 'completed'
      when last_activity is not null then 'ongoing' else 'available' end as state
    from courses c
  ), searched as materialized (
    select * from classified where p_query='' or strpos(lower(title),lower(p_query))>0
      or strpos(lower(description),lower(p_query))>0
  ), filtered as (
    select * from searched where p_filter='all' or state=p_filter
  ), page_rows as (
    select id,row_number() over(order by
      case when p_sort='recent' then created_at end desc,
      case when p_sort='progress' then progress_percent end desc,
      case when p_sort='duration' then duration_seconds end desc,
      lower(title),id) as rank
    from filtered order by rank limit 20 offset (p_page-1)*20
  ), latest as (
    select id from classified where state='ongoing'
      and exists (
        select 1 from public.modules m join public.sections s on s.module_id=m.id
        join public.lessons l on l.section_id=s.id
        left join public.lesson_progress p on p.lesson_id=l.id and p.user_id=member_id
        where m.course_id=classified.id and m.status='published' and s.status='published' and l.status='published'
          and p.completed_at is null and app_private.lesson_access(member_id,l.id)
      )
    order by last_activity desc,id limit 1
  ), cards as materialized (
    select c.id,(to_jsonb(c)-'last_activity'-'created_at') || jsonb_build_object('target',lesson.target) as card
    from classified c left join lateral (
      select jsonb_build_object('id',l.id,'title',l.title,'module_slug',m.slug,'module_title',m.title,
        'position_seconds',coalesce(p.position_seconds,0)) as target
      from public.modules m join public.sections s on s.module_id=m.id join public.lessons l on l.section_id=s.id
      left join public.lesson_progress p on p.lesson_id=l.id and p.user_id=member_id
      where c.can_access and m.course_id=c.id and m.status='published' and s.status='published'
        and l.status='published' and app_private.lesson_access(member_id,l.id)
        and (c.state='completed' or p.completed_at is null)
      order by case when c.state='ongoing' and p.position_seconds>0 then p.updated_at end desc nulls last,
        m.order_index,m.id,s.order_index,s.id,l.order_index,l.id limit 1
    ) lesson on true where c.id in (select id from page_rows union select id from latest)
  )
  select jsonb_build_object('resume',(select card from cards join latest using(id)),
    'counts',(select jsonb_build_object('all',count(*),'ongoing',count(*) filter(where state='ongoing'),
      'completed',count(*) filter(where state='completed'),'restricted',count(*) filter(where state='restricted')) from searched),
    'items',coalesce((select jsonb_agg(card order by rank) from cards join page_rows using(id)),'[]'::jsonb),
    'total',(select count(*) from filtered),'page',p_page,'page_size',20) into result;
  return result;
end $$;
revoke all on function public.app_catalog_showcase(text,integer,text,text) from public,anon,authenticated,service_role;
grant execute on function public.app_catalog_showcase(text,integer,text,text) to authenticated;

commit;
