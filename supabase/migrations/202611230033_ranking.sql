begin;

-- As referências do ranking travam somente esta tabela. A exclusão física
-- do perfil expurga os dois vínculos pelos cascades, inclusive sob concorrência.
create table app_private.ranking_subjects (
  profile_id uuid primary key references public.profiles(id) on delete cascade
);
alter table app_private.ranking_subjects enable row level security;
revoke all on app_private.ranking_subjects from public, anon, authenticated, service_role;

create function app_private.register_ranking_subject()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into app_private.ranking_subjects(profile_id) values (new.id);
  return new;
end $$;
revoke all on function app_private.register_ranking_subject() from public, anon, authenticated, service_role;
create trigger ranking_profile_created after insert on public.profiles
for each row execute function app_private.register_ranking_subject();
insert into app_private.ranking_subjects(profile_id) select id from public.profiles;

-- O primeiro evento observado mantém a data mesmo quando uma curtida é refeita
-- ou um conteúdo volta a ser aprovado. Nenhum dado anterior é importado.
create table app_private.ranking_events (
  kind text not null check (kind in ('post', 'reply', 'like', 'lesson', 'certificate')),
  recipient_id uuid not null references app_private.ranking_subjects(profile_id) on delete cascade,
  source_id uuid not null,
  actor_id uuid not null references app_private.ranking_subjects(profile_id) on delete cascade,
  occurred_at timestamptz not null default now(),
  primary key (kind, recipient_id, source_id, actor_id),
  check ((kind = 'like') = (recipient_id <> actor_id))
);
create index ranking_events_period on app_private.ranking_events(occurred_at);
create index ranking_events_recipient on app_private.ranking_events(recipient_id);
create index ranking_events_actor on app_private.ranking_events(actor_id);
alter table app_private.ranking_events enable row level security;
revoke all on app_private.ranking_events from public, anon, authenticated, service_role;

create function app_private.record_ranking_event()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  action_kind text := tg_argv[0];
  recipient uuid;
  source uuid;
  event_actor uuid;
begin
  case action_kind
    when 'post', 'reply' then
      recipient := new.author_id;
      source := new.id;
    when 'like' then
      select p.author_id into recipient from public.posts p
      where p.id = new.post_id and p.status = 'approved';
      source := new.post_id;
      event_actor := new.actor_id;
      if recipient is null or event_actor = recipient then return new; end if;
    when 'lesson' then
      recipient := new.user_id;
      source := new.lesson_id;
    when 'certificate' then
      recipient := new.user_id;
      source := new.id;
  end case;
  insert into app_private.ranking_events(kind, recipient_id, source_id, actor_id)
  select action_kind, member.id, source, author.id
  from public.profiles member
  join public.profiles author on author.id = coalesce(event_actor, recipient)
  where member.id = recipient and member.role = 'member' and author.role = 'member'
    and not member.suspended and not author.suspended and member.demo = author.demo
  on conflict do nothing;
  return new;
end $$;
revoke all on function app_private.record_ranking_event() from public, anon, authenticated, service_role;

create trigger ranking_post_approval after update of status on public.posts
for each row when (new.status = 'approved' and old.status not in ('approved', 'archived'))
execute function app_private.record_ranking_event('post');
create trigger ranking_reply_approval after update of status on public.replies
for each row when (new.status = 'approved' and old.status not in ('approved', 'archived'))
execute function app_private.record_ranking_event('reply');
create trigger ranking_post_like after insert on public.votes
for each row when (new.post_id is not null)
execute function app_private.record_ranking_event('like');
create trigger ranking_lesson_first_insert after insert on public.lesson_progress
for each row when (new.completed_at is not null)
execute function app_private.record_ranking_event('lesson');
create trigger ranking_lesson_first_completion after update of completed_at on public.lesson_progress
for each row when (old.completed_at is null and new.completed_at is not null)
execute function app_private.record_ranking_event('lesson');
create trigger ranking_certificate_issued after insert on public.certificates
for each row when (new.revoked_at is null)
execute function app_private.record_ranking_event('certificate');

create function public.app_ranking(p_period text default 'current', p_page integer default 1)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  viewer uuid := app_private.actor();
  viewer_role text;
  viewer_demo boolean;
  zone constant text := 'America/Sao_Paulo';
  month_start timestamp := date_trunc('month', now() at time zone zone);
  period_start timestamptz;
  period_end timestamptz;
begin
  if p_period is null or p_period not in ('current', 'previous', 'overall')
    or p_page is null or p_page not between 1 and 100000 then
    perform app_private.fail('Período ou página inválidos.');
  end if;
  perform app_private.throttle(viewer, 'ranking', 60);
  select role, demo into viewer_role, viewer_demo from public.profiles where id = viewer;
  if p_period = 'current' then
    period_start := month_start at time zone zone;
    period_end := (month_start + interval '1 month') at time zone zone;
  elsif p_period = 'previous' then
    period_start := (month_start - interval '1 month') at time zone zone;
    period_end := month_start at time zone zone;
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

revoke all on function public.app_ranking(text, integer) from public, anon, authenticated, service_role;
grant execute on function public.app_ranking(text, integer) to authenticated;

alter function public.app_export_data() set schema app_private;
alter function app_private.app_export_data() rename to export_data_before_ranking;
revoke execute on function app_private.export_data_before_ranking() from public, anon, authenticated, service_role;

create function public.app_export_data() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  data jsonb := app_private.export_data_before_ranking();
  viewer uuid := auth.uid();
begin
  return data || jsonb_build_object('ranking_events', coalesce((
    select jsonb_agg(jsonb_build_object('kind', e.kind, 'occurred_at', e.occurred_at,
      'relation', case when e.recipient_id = viewer then 'recipient' else 'actor' end)
      order by e.occurred_at, e.kind, e.recipient_id = viewer desc)
    from app_private.ranking_events e where e.recipient_id = viewer or e.actor_id = viewer
  ), '[]'::jsonb));
end $$;
revoke execute on function public.app_export_data() from public, anon, authenticated, service_role;
grant execute on function public.app_export_data() to authenticated;

notify pgrst, 'reload schema';

commit;
