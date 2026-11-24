-- Shared civil-date semantics for report periods. All public consumers keep their own actor and throttle.
create function app_private.report_days(p_period text, p_from date, p_through date)
returns daterange language plpgsql stable set search_path='' as $$
declare
  today date := (now() at time zone 'America/Sao_Paulo')::date;
  first_day date;
  last_day date := today;
begin
  if p_period is distinct from 'custom' and (p_from is not null or p_through is not null) then
    perform app_private.fail('Período inválido.');
  end if;
  case p_period
    when 'today' then first_day := today;
    when 'yesterday' then first_day := today - 1; last_day := first_day;
    when '7d' then first_day := today - 6;
    when '14d' then first_day := today - 13;
    when '30d' then first_day := today - 29;
    when '90d' then first_day := today - 89;
    when 'current' then first_day := date_trunc('month', today::timestamp)::date;
    when 'previous' then
      last_day := date_trunc('month', today::timestamp)::date - 1;
      first_day := date_trunc('month', last_day::timestamp)::date;
    when 'year' then first_day := date_trunc('year', today::timestamp)::date;
    when 'last_year' then
      last_day := date_trunc('year', today::timestamp)::date - 1;
      first_day := date_trunc('year', last_day::timestamp)::date;
    when 'custom' then
      if p_from is null or p_through is null or p_from < date '0001-01-01'
         or p_through > today or p_from > p_through then
        perform app_private.fail('Período inválido.');
      end if;
      first_day := p_from; last_day := p_through;
    else perform app_private.fail('Período inválido.');
  end case;
  return daterange(first_day,last_day,'[]');
end $$;
revoke all on function app_private.report_days(text,date,date) from public, anon, authenticated, service_role;

create function public.app_admin_dashboard(p_period text, p_from date, p_through date)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor_id uuid := app_private.admin_reporting_actor();
  observed_at timestamptz := now();
  days daterange := app_private.report_days(p_period,p_from,p_through);
  from_day date := lower(days);
  through_day date := upper(days)-1;
  until_at timestamptz := least(observed_at, upper(days)::timestamp at time zone 'America/Sao_Paulo');
  from_at timestamptz;
  result jsonb;
begin
  perform app_private.throttle(actor_id, 'admin_dashboard', 20);
  from_at := from_day::timestamp at time zone 'America/Sao_Paulo';

  with new_members as (
    select created_at as happened_at from public.profiles
    where role='member' and not demo and created_at >= from_at and created_at < until_at
  ), paid_orders as (
    select o.method, o.amount_cents from public.orders o
    left join public.profiles p on p.id=o.user_id
    where o.status='paid' and o.paid_at >= from_at and o.paid_at < until_at and not coalesce(p.demo,false)
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
       and min(greatest(o.finalized_at,s.starts_at)) < until_at
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
    select d::date as starts_on, lead(d::date,1,through_day+1) over(order by d) as ends_before
    from generate_series(from_day::timestamp, through_day::timestamp,
      case when p_period in ('year','last_year') then interval '1 month'
        when through_day-from_day < 14 then interval '1 day'
        else make_interval(days => greatest(7,ceil((through_day-from_day+1)/52.0)::int)) end) d
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
      count(distinct lp.user_id) filter (where lp.completed_at >= ((through_day-6)::timestamp at time zone 'America/Sao_Paulo')) as members_7d,
      count(distinct lp.user_id) filter (where lp.completed_at >= ((through_day-29)::timestamp at time zone 'America/Sao_Paulo')) as members_30d
    from public.lesson_progress lp join public.profiles p on p.id=lp.user_id
    where p.role='member' and not p.demo and lp.completed_at < until_at
      and lp.completed_at >= least(from_at, (through_day-29)::timestamp at time zone 'America/Sao_Paulo')
  ), posts as (
    select count(*) filter (where x.created_at >= from_at and x.created_at < until_at) as created,
      count(*) filter (where x.status='pending') as pending
    from public.posts x join public.profiles p on p.id=x.author_id
    where not p.demo and x.created_at < observed_at and ((x.created_at >= from_at and x.created_at < until_at) or x.status='pending')
  ), tickets as (
    select t.id,t.user_id,t.created_at,t.status
    from public.tickets t join public.profiles p on p.id=t.user_id
    where not p.demo and t.created_at < observed_at and ((t.created_at >= from_at and t.created_at < until_at) or t.status<>'resolved')
  ), ticket_counts as (
    select count(*) filter (where created_at >= from_at and created_at < until_at) as created,
      count(*) filter (where status<>'resolved') as open_now from tickets
  ), responses as (
    select count(r.first_at) as answered, round(avg(extract(epoch from r.first_at-t.created_at))) as average_seconds
    from tickets t
    cross join lateral (
      select min(m.created_at) as first_at from public.ticket_messages m
      join public.profiles author on author.id=m.author_id and not author.demo
      where m.ticket_id=t.id and m.author_id<>t.user_id and m.created_at>=t.created_at and m.created_at<until_at
    ) r
    where t.created_at >= from_at and t.created_at < until_at
  ), payment_methods as (
    select method, count(*) as orders, sum(amount_cents) as amount_cents from paid_orders group by method
  )
  select jsonb_build_object(
    'from_day',from_day,'through_day',through_day,'observed_at',observed_at,
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

create function public.app_ranking(p_period text, p_page integer, p_from date, p_through date)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  viewer uuid := app_private.actor();
  viewer_role text;
  viewer_demo boolean;
  zone constant text := 'America/Sao_Paulo';
  days daterange;
  period_start timestamptz;
  period_end timestamptz;
begin
  if p_period is null or p_period not in ('current','previous','overall','today','yesterday','7d','14d','30d','90d','year','last_year','custom')
    or (p_period='overall' and (p_from is not null or p_through is not null))
    or p_page is null or p_page not between 1 and 100000 then
    perform app_private.fail('Período ou página inválidos.');
  end if;
  perform app_private.throttle(viewer, 'ranking', 60);
  select role, demo into viewer_role, viewer_demo from public.profiles where id = viewer;
  if p_period is distinct from 'overall' then
    days := app_private.report_days(p_period,p_from,p_through);
    period_start := lower(days)::timestamp at time zone zone;
    -- Current competition closes on the first of next month; the event query still stops at now().
    period_end := (case when p_period='current' then lower(days)::timestamp + interval '1 month'
                    else upper(days)::timestamp end) at time zone zone;
  end if;

  return (
    with rules(kind, points, sort) as (values
      ('post', 5, 1), ('reply', 3, 2), ('like', 1, 3), ('lesson', 8, 4), ('certificate', 15, 5)
    ), totals as (
      select e.recipient_id, sum(rules.points) as points
      from app_private.ranking_events e
      join rules using (kind)
      join public.profiles member on member.id = e.recipient_id
        and member.role = 'member' and not member.suspended and member.demo = viewer_demo
      where e.occurred_at <= now()
        and (period_start is null or e.occurred_at >= period_start)
        and (period_end is null or e.occurred_at < period_end)
        and case e.kind
          when 'post' then exists (
            select from public.posts p join public.spaces s on s.id = p.space_id
            where p.id = e.source_id and p.author_id = e.recipient_id
              and p.status = 'approved' and s.status = 'published'
          )
          when 'reply' then exists (
            select from public.replies r join public.posts p on p.id = r.post_id
            join public.spaces s on s.id = p.space_id
            where r.id = e.source_id and r.author_id = e.recipient_id
              and r.status = 'approved' and p.status = 'approved' and s.status = 'published'
          )
          when 'like' then exists (
            select from public.votes v join public.posts p on p.id = v.post_id
            join public.spaces s on s.id = p.space_id
            join public.profiles a on a.id = v.actor_id
            where v.post_id = e.source_id and v.actor_id = e.actor_id and p.author_id = e.recipient_id
              and p.status = 'approved' and s.status = 'published'
              and a.role = 'member' and not a.suspended and a.demo = viewer_demo
          )
          when 'lesson' then exists (
            select from public.lesson_progress l where l.lesson_id = e.source_id
              and l.user_id = e.recipient_id and l.completed_at is not null
          )
          when 'certificate' then exists (
            select from public.certificates c where c.id = e.source_id
              and c.user_id = e.recipient_id and c.revoked_at is null
          )
        end
      group by e.recipient_id
    ), positions as (
      select *, rank() over (order by points desc) as position,
        count(*) over (partition by points) > 1 as tied
      from totals
    ), entries as (
      select t.*, (position <= 3 and not tied) as on_podium,
        jsonb_build_object('position', position, 'points', points, 'tied', tied,
          'is_self', recipient_id = viewer) as entry
      from positions t
    ), page_rows as (
      select recipient_id, position, entry from entries where not on_podium
      order by position, recipient_id limit 20 offset (p_page - 1) * 20
    )
    select jsonb_build_object(
      'starts_at', period_start, 'ends_at', period_end, 'time_zone', zone,
      'prizes', null,
      'rules', (select jsonb_object_agg(kind, points order by sort) from rules),
      'podium', coalesce((select jsonb_agg(entry order by position) from entries where on_podium), '[]'::jsonb),
      'own', case when viewer_role <> 'member' then jsonb_build_object('status', 'excluded')
        else coalesce((select jsonb_build_object('status', 'ranked', 'position', position,
          'points', points, 'tied', tied) from entries where recipient_id = viewer),
          jsonb_build_object('status', 'unranked')) end,
      'items', coalesce((select jsonb_agg(entry order by position, recipient_id) from page_rows), '[]'::jsonb),
      'page', p_page, 'total', (select count(*) from entries where not on_podium)
    )
  );
end $$;

create or replace function public.app_admin_dashboard(p_period text default '30d')
returns jsonb language sql security definer set search_path='' as $$
  select public.app_admin_dashboard(p_period,null::date,null::date)
$$;
create or replace function public.app_ranking(p_period text default 'current', p_page integer default 1)
returns jsonb language sql security definer set search_path='' as $$
  select public.app_ranking(p_period,p_page,null::date,null::date)
$$;

revoke all on function public.app_admin_dashboard(text,date,date), public.app_ranking(text,integer,date,date)
  from public, anon, authenticated, service_role;
grant execute on function public.app_admin_dashboard(text,date,date), public.app_ranking(text,integer,date,date)
  to authenticated;
