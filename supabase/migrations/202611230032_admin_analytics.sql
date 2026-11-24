begin;

create function app_private.admin_reporting_actor()
returns uuid language plpgsql security definer set search_path='' as $$
declare actor_id uuid := app_private.require_role(array['admin']);
begin
  -- Reporting requires AAL2 even when account MFA is optional.
  if (auth.jwt()->>'aal') is distinct from 'aal2' or not exists (
    select from auth.sessions where id=(auth.jwt()->>'session_id')::uuid
      and user_id=actor_id and aal='aal2'
  ) then
    perform app_private.fail('Confirme o segundo fator para continuar.');
  end if;
  return actor_id;
end $$;

create function public.app_admin_dashboard(p_period text default '30d')
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor_id uuid := app_private.admin_reporting_actor();
  observed_at timestamptz := now();
  today date := (observed_at at time zone 'America/Sao_Paulo')::date;
  from_day date;
  from_at timestamptz;
  result jsonb;
begin
  case p_period
    when '30d' then from_day := today - 29;
    when '90d' then from_day := today - 89;
    when 'year' then from_day := date_trunc('year', today::timestamp)::date;
    else perform app_private.fail('Período inválido.');
  end case;
  perform app_private.throttle(actor_id, 'admin_dashboard', 20);
  from_at := from_day::timestamp at time zone 'America/Sao_Paulo';

  with new_members as (
    select created_at as happened_at from public.profiles
    where role='member' and not demo and created_at >= from_at and created_at < observed_at
  ), paid_orders as (
    select o.method, o.amount_cents from public.orders o
    left join public.profiles p on p.id=o.user_id
    where o.status='paid' and o.paid_at >= from_at and o.paid_at < observed_at and not coalesce(p.demo,false)
  ), first_activations as (
    select min(greatest(o.finalized_at,s.starts_at)) as happened_at
    from public.subscriptions s
    join public.orders o on o.id=s.order_id and o.user_id=s.user_id
    join public.profiles p on p.id=s.user_id
    where s.source='order' and o.finalized_at is not null and o.paid_at is not null
      and p.role='member' and not p.demo
      and greatest(o.finalized_at,s.starts_at) < least(s.ends_at,coalesce(s.revoked_at,s.ends_at))
    group by s.user_id
    having min(greatest(o.finalized_at,s.starts_at)) >= from_at
       and min(greatest(o.finalized_at,s.starts_at)) < observed_at
  ), access_terms as (
    select s.user_id, s.starts_at, s.ends_at, o.amount_cents, o.access_months
    from public.subscriptions s
    join public.orders o on o.id=s.order_id and o.user_id=s.user_id and o.status='paid'
    join public.profiles p on p.id=s.user_id
    where s.source='order' and s.revoked_at is null and s.ends_at > observed_at
      and o.paid_at is not null and o.paid_at < observed_at
      and o.finalized_at is not null and o.finalized_at < observed_at
      and p.role='member' and not p.demo and not p.suspended
  ), current_terms as (
    select user_id, ends_at, amount_cents, access_months from access_terms where starts_at <= observed_at
  ), last_end as (
    select user_id, max(ends_at) as ends_at from current_terms group by user_id
  ), due_access as (
    select count(*) n from last_end e
    where e.ends_at <= ((observed_at at time zone 'America/Sao_Paulo') + interval '30 days') at time zone 'America/Sao_Paulo'
      and not exists (
        select from access_terms t where t.user_id=e.user_id and t.starts_at <= e.ends_at and t.ends_at > e.ends_at
      )
  ), buckets as (
    select d::date as starts_on, lead(d::date,1,today+1) over(order by d) as ends_before
    from generate_series(from_day::timestamp, today::timestamp,
      case when p_period='year' then interval '1 month' else interval '7 days' end) d
  ), acquisition as (
    select happened_at, true as is_new from new_members
    union all select happened_at, false from first_activations
  ), series as (
    select b.starts_on, b.ends_before,
      count(a.happened_at) filter (where a.is_new) as new_members,
      count(a.happened_at) filter (where not a.is_new) as first_activations
    from buckets b left join acquisition a
      on a.happened_at >= (b.starts_on::timestamp at time zone 'America/Sao_Paulo')
     and a.happened_at < (b.ends_before::timestamp at time zone 'America/Sao_Paulo')
    group by b.starts_on,b.ends_before
  ), completions as (
    select count(*) filter (where lp.completed_at >= from_at) as total,
      count(distinct lp.user_id) filter (where lp.completed_at >= ((today-6)::timestamp at time zone 'America/Sao_Paulo')) as members_7d,
      count(distinct lp.user_id) filter (where lp.completed_at >= ((today-29)::timestamp at time zone 'America/Sao_Paulo')) as members_30d
    from public.lesson_progress lp join public.profiles p on p.id=lp.user_id
    where p.role='member' and not p.demo and lp.completed_at < observed_at
      and lp.completed_at >= least(from_at, (today-29)::timestamp at time zone 'America/Sao_Paulo')
  ), posts as (
    select count(*) filter (where x.created_at >= from_at) as created,
      count(*) filter (where x.status='pending') as pending
    from public.posts x join public.profiles p on p.id=x.author_id
    where not p.demo and x.created_at < observed_at and (x.created_at >= from_at or x.status='pending')
  ), tickets as (
    select t.id,t.user_id,t.created_at,t.status
    from public.tickets t join public.profiles p on p.id=t.user_id
    where not p.demo and t.created_at < observed_at and (t.created_at >= from_at or t.status<>'resolved')
  ), ticket_counts as (
    select count(*) filter (where created_at >= from_at) as created,
      count(*) filter (where status<>'resolved') as open_now from tickets
  ), responses as (
    select count(r.first_at) as answered, round(avg(extract(epoch from r.first_at-t.created_at))) as average_seconds
    from tickets t
    cross join lateral (
      select min(m.created_at) as first_at from public.ticket_messages m
      join public.profiles author on author.id=m.author_id and not author.demo
      where m.ticket_id=t.id and m.author_id<>t.user_id and m.created_at>=t.created_at and m.created_at<observed_at
    ) r
    where t.created_at >= from_at
  ), payment_methods as (
    select method, count(*) as orders, sum(amount_cents) as amount_cents from paid_orders group by method
  )
  select jsonb_build_object(
    'from_day',from_day,'through_day',today,'observed_at',observed_at,
    'new_members',(select count(*) from new_members),
    'first_activations',(select count(*) from first_activations),
    'revenue_cents',coalesce((select sum(amount_cents) from paid_orders),0),
    'mrr_cents',coalesce((select round(sum(amount_cents::numeric/access_months)) from current_terms),0),
    'renewals_due',(select n from due_access),
    'completions',(select total from completions),
    'completing_members_7d',(select members_7d from completions),
    'completing_members_30d',(select members_30d from completions),
    'posts',(select created from posts),
    'pending_posts',(select pending from posts),
    'new_tickets',(select created from ticket_counts),
    'open_tickets',(select open_now from ticket_counts),
    'answered_tickets',(select answered from responses),
    'first_response_seconds',(select average_seconds from responses),
    'acquisition',coalesce((select jsonb_agg(jsonb_build_object('starts_on',starts_on,'ends_before',ends_before,
      'new_members',new_members,'first_activations',first_activations) order by starts_on) from series),'[]'::jsonb),
    'payments',coalesce((select jsonb_agg(jsonb_build_object('method',method,'orders',orders,'amount_cents',amount_cents)
      order by method) from payment_methods),'[]'::jsonb)
  ) into result;
  return result;
end $$;

create function public.app_admin_analytics_courses(p_page integer default 1)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor_id uuid := app_private.admin_reporting_actor();
  result jsonb;
begin
  if p_page is null or p_page not between 1 and 100000 then
    perform app_private.fail('Página inválida.');
  end if;
  perform app_private.throttle(actor_id, 'admin_analytics_courses', 20);

  with items as (
    select id,title from public.courses where status='published'
    order by title,id limit 20 offset (p_page-1)*20
  )
  select jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object('id',id,'title',title) order by title,id) from items),'[]'::jsonb),
    'total',(select count(*) from public.courses where status='published'),'page',p_page,'page_size',20)
  into result;
  return result;
end $$;

create function public.app_admin_course_analytics(p_course_id uuid,p_page integer default 1)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor_id uuid := app_private.admin_reporting_actor();
  result jsonb;
begin
  if p_course_id is null then perform app_private.fail('Curso indisponível.'); end if;
  if p_page is null or p_page not between 1 and 100000 then
    perform app_private.fail('Página inválida.');
  end if;
  perform app_private.throttle(actor_id, 'admin_course_analytics', 20);

  with course as (
    select id,required_lesson_ids from public.courses where id=p_course_id and status='published'
  ), first_module as (
    select m.id,m.title from public.modules m join course c on c.id=m.course_id
    where m.status='published' order by m.order_index,m.id limit 1
  ), curriculum as (
    select l.id,l.title,l.duration_seconds,m.title as module_title,m.id as module_id,
      l.id=any(c.required_lesson_ids) as required,
      row_number() over(order by m.order_index,m.id,s.order_index,s.id,l.order_index,l.id) as ord
    from course c join public.modules m on m.course_id=c.id join public.sections s on s.module_id=m.id
    join public.lessons l on l.section_id=s.id
    where m.status='published' and s.status='published' and l.status='published'
  ), rules as (
    select count(*) filter (where required and module_id=(select id from first_module)) as module_required,
      count(*) filter (where required) as course_required
    from curriculum
  ), progress as (
    select lp.user_id,lp.lesson_id,lp.completed_at is not null as complete,c.required,c.module_id
    from curriculum c join public.lesson_progress lp on lp.lesson_id=c.id
    join public.profiles p on p.id=lp.user_id
    where p.role='member' and not p.demo
  ), per_member as (
    select count(*) filter (where complete and required and module_id=(select id from first_module)) as module_done,
      count(*) filter (where complete and required) as course_done
    from progress group by user_id
  ), funnel as (
    select count(m.module_done) as started,
      case when r.module_required>0 then count(*) filter (where m.module_done=r.module_required) end as module_completed,
      case when r.course_required>0 and r.course_required=(select cardinality(required_lesson_ids) from course)
        then count(*) filter (where m.course_done=r.course_required) end as course_completed
    from rules r left join per_member m on true
    group by r.module_required,r.course_required
  ), lesson_page as (
    select id,title,duration_seconds,module_title,ord from curriculum
    order by ord limit 20 offset (p_page-1)*20
  ), lesson_metrics as (
    select c.id,c.title,c.duration_seconds,c.module_title,c.ord,
      count(p.lesson_id) as registered,count(p.lesson_id) filter (where p.complete) as completed
    from lesson_page c left join progress p on p.lesson_id=c.id
    group by c.id,c.title,c.duration_seconds,c.module_title,c.ord
  )
  select jsonb_build_object(
    'started',f.started,'module_title',(select title from first_module),
    'module_completed',f.module_completed,'course_completed',f.course_completed,
    'lessons',jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object(
      'id',id,'title',title,'duration_seconds',duration_seconds,'module_title',module_title,
      'registered',registered,'completed',completed) order by ord) from lesson_metrics),'[]'::jsonb),
      'total',(select count(*) from curriculum),'page',p_page,'page_size',20)
  ) into result from funnel f where exists(select from course);

  if result is null then perform app_private.fail('Curso indisponível.'); end if;
  return result;
end $$;

revoke execute on function app_private.admin_reporting_actor() from public, anon, authenticated, service_role;
revoke execute on function public.app_admin_dashboard(text), public.app_admin_analytics_courses(integer),
  public.app_admin_course_analytics(uuid,integer) from public, anon, authenticated, service_role;
grant execute on function public.app_admin_dashboard(text), public.app_admin_analytics_courses(integer),
  public.app_admin_course_analytics(uuid,integer) to authenticated;

notify pgrst,'reload schema';
commit;
