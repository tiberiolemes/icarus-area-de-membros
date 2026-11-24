begin;

create table public.ica_live_events (
 id uuid primary key,
 title text not null check (length(btrim(title)) between 1 and 160),
 guest text not null check (length(btrim(guest)) between 1 and 160),
 description text not null default '' check (length(description) <= 4000),
 starts_at timestamptz not null check (starts_at >= '2000-01-01' and starts_at < '2100-01-01'),
 duration_minutes integer not null check (duration_minutes between 1 and 720),
 meeting_url text not null check (length(meeting_url) <= 2048 and
   meeting_url ~ '^https://(([a-z0-9-]+\.)*zoom\.us/(j|my)/[A-Za-z0-9._-]+|meet\.google\.com/[a-zA-Z0-9-]+)([?][^[:space:]\\]*)?$'),
 recording_url text check (length(recording_url) <= 2048 and
   recording_url ~ '^https://([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,63}([/?#][^[:space:]\\]*)?$'),
 access_mode text not null check (access_mode in ('members','subscribers','plans')),
 plan_ids uuid[] not null default '{}',
 status text not null default 'draft' check (status in ('draft','published','archived')),
 revision integer not null default 1,
 check ((access_mode = 'plans') = (cardinality(plan_ids) > 0))
);
create index ica_live_events_schedule on public.ica_live_events (starts_at,id) where status='published';

create table public.ica_live_event_rsvps (
 event_id uuid not null references public.ica_live_events(id),
 user_id uuid not null references public.ica_profiles(id),
 created_at timestamptz not null default now(),
 primary key(event_id,user_id)
);
alter table public.ica_live_events enable row level security;
alter table public.ica_live_event_rsvps enable row level security;
revoke all on public.ica_live_events, public.ica_live_event_rsvps from public,anon,authenticated,service_role;

create function public.app_live_events(p_recordings boolean default false,p_page integer default 1)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=ica_private.actor(); result jsonb;
begin
 if p_recordings is null or p_page is null or p_page not between 1 and 10000 then
  perform ica_private.fail('Página inválida.');
 end if;
 select jsonb_build_object('items', coalesce(jsonb_agg(
  jsonb_build_object('id',e.id,'starts_at',e.starts_at,'can_access',e.allowed)
  || case when e.allowed then jsonb_build_object('title',e.title,'guest',e.guest,
     'description',e.description,'duration_minutes',e.duration_minutes,
     'confirmed',not p_recordings and exists(select 1 from public.ica_live_event_rsvps r where r.event_id=e.id and r.user_id=u),
     'can_rsvp',e.starts_at>now()) else '{}'::jsonb end
  order by e.position) filter (where e.position <= 12),'[]'::jsonb),
  'has_more', count(*)>12) into result
 from (
  select page.*,row_number() over (order by
    case when p_recordings then page.starts_at end desc,page.starts_at,page.id) as position,
    ica_private.entitled(u,page.access_mode,page.plan_ids) as allowed
  from (
   select id, starts_at, title, guest, description, duration_minutes, access_mode, plan_ids
   from public.ica_live_events
   where status='published' and case when p_recordings then
    recording_url is not null and starts_at + make_interval(mins=>duration_minutes)<=now()
    else starts_at + make_interval(mins=>duration_minutes)>now() end
   order by case when p_recordings then starts_at end desc, starts_at,id
   limit 13 offset (p_page-1)*12
  ) page
 ) e;
 return result;
end $$;

create function public.app_live_event_link(p_id uuid,p_recording boolean)
returns text language plpgsql security definer set search_path='' as $$
declare u uuid:=ica_private.actor(); link text;
begin
 select case when p_recording then recording_url when p_recording=false then meeting_url end into link
 from public.ica_live_events where id=p_id and status='published'
  and ica_private.entitled(u,access_mode,plan_ids)
  and (p_recording = (starts_at + make_interval(mins=>duration_minutes)<=now()));
 if link is null then perform ica_private.fail('Link indisponível para este encontro.');end if;
 return link;
end $$;

create function public.app_live_event_rsvp(p_id uuid,p_confirmed boolean)
returns boolean language plpgsql security definer set search_path='' as $$
declare u uuid:=ica_private.actor();
begin
 begin
  perform 1 from public.ica_profiles where id=u for key share nowait;
 exception when lock_not_available then
  perform ica_private.fail('Sua conta está sendo atualizada. Tente novamente em instantes.');
 end;
 perform 1 from public.ica_live_events where id=p_id and status='published' and starts_at>clock_timestamp()
  and ica_private.entitled(u,access_mode,plan_ids) for share;
 if not found or p_confirmed is null then perform ica_private.fail('Confirmação indisponível para este encontro.');end if;
 if p_confirmed then
  insert into public.ica_live_event_rsvps(event_id,user_id) values(p_id,u) on conflict do nothing;
 else
  delete from public.ica_live_event_rsvps where event_id=p_id and user_id=u;
 end if;
 return p_confirmed;
end $$;

create function public.app_admin_live_events(p_page integer default 1)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform ica_private.require_role(array['admin']);
 if p_page is null or p_page not between 1 and 10000 then perform ica_private.fail('Página inválida.');end if;
 select jsonb_build_object('items',coalesce(jsonb_agg(to_jsonb(e) order by e.starts_at desc,e.id),'[]'::jsonb),
  'total',(select count(*) from public.ica_live_events),
  'plans',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) order by name,id),'[]'::jsonb) from public.ica_plans))
 into result from (
  select id,title,guest,description,starts_at,duration_minutes,meeting_url,recording_url,access_mode,plan_ids,status,revision
  from public.ica_live_events order by starts_at desc,id limit 20 offset (p_page-1)*20
 ) e;
 return result;
end $$;

create function public.app_admin_live_event_rsvps(p_id uuid,p_page integer default 1)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform ica_private.require_role(array['admin']);
 if p_page is null or p_page not between 1 and 10000 then perform ica_private.fail('Página inválida.');end if;
 select jsonb_build_object('items',coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc,r.id),'[]'::jsonb),
  'total',(select count(*) from public.ica_live_event_rsvps where event_id=p_id))
 into result from (
  select p.id,p.full_name,r.created_at from public.ica_live_event_rsvps r join public.ica_profiles p on p.id=r.user_id
  where r.event_id=p_id order by r.created_at desc,p.id limit 20 offset (p_page-1)*20
 ) r;
 return result;
end $$;

create function public.app_admin_save_live_event(p_id uuid,p_revision integer,p_title text,p_guest text,
 p_description text,p_starts_at timestamp,p_duration_minutes integer,p_meeting_url text,p_recording_url text,
 p_access_mode text,p_plan_ids uuid[],p_status text)
returns integer language plpgsql security definer set search_path='' as $$
declare u uuid:=ica_private.require_role(array['admin']); saved_revision integer;
 starts_utc timestamptz:=p_starts_at at time zone 'America/Sao_Paulo';
begin
 if p_starts_at is null or not isfinite(p_starts_at)
  or (starts_utc at time zone 'America/Sao_Paulo')<>p_starts_at then
  perform ica_private.fail('Confira a data e o horário de Brasília.');
 end if;
 if p_id is null or p_revision is null or p_revision<0 or p_plan_ids is null or cardinality(p_plan_ids)>100
  or cardinality(p_plan_ids)<>(select count(*) from public.ica_plans where id=any(p_plan_ids)) then
  perform ica_private.fail('Confira os planos e os dados do encontro.');
 end if;
 begin
  perform 1 from public.ica_profiles where id=u for key share nowait;
 exception when lock_not_available then
  perform ica_private.fail('Sua conta está sendo atualizada. Tente novamente em instantes.');
 end;
 begin
  if p_revision=0 then
   insert into public.ica_live_events(id,title,guest,description,starts_at,duration_minutes,meeting_url,recording_url,access_mode,plan_ids,status)
   values(p_id,btrim(p_title),btrim(p_guest),btrim(p_description),starts_utc,p_duration_minutes,btrim(p_meeting_url),
     nullif(btrim(p_recording_url),''),p_access_mode,p_plan_ids,p_status)
   on conflict (id) do nothing returning revision into saved_revision;
  else
   update public.ica_live_events set title=btrim(p_title),guest=btrim(p_guest),description=btrim(p_description),
    starts_at=starts_utc,duration_minutes=p_duration_minutes,meeting_url=btrim(p_meeting_url),
    recording_url=nullif(btrim(p_recording_url),''),access_mode=p_access_mode,plan_ids=p_plan_ids,status=p_status,revision=revision+1
   where id=p_id and revision=p_revision returning revision into saved_revision;
  end if;
 exception when check_violation or not_null_violation then
  perform ica_private.fail('Confira os campos obrigatórios, a duração, o acesso e os links HTTPS.');
 end;
 if saved_revision is null then perform ica_private.fail('O encontro foi atualizado. Abra o cadastro novamente para editar.');end if;
 perform ica_private.audit(u,case when p_revision=0 then 'create' else 'update' end,'live_events',p_id);
 return saved_revision;
end $$;

revoke execute on function public.app_live_events(boolean,integer),public.app_live_event_link(uuid,boolean),
 public.app_live_event_rsvp(uuid,boolean),public.app_admin_live_events(integer),public.app_admin_live_event_rsvps(uuid,integer),
 public.app_admin_save_live_event(uuid,integer,text,text,text,timestamp,integer,text,text,text,uuid[],text)
 from public,anon,authenticated,service_role;
grant execute on function public.app_live_events(boolean,integer),public.app_live_event_link(uuid,boolean),
 public.app_live_event_rsvp(uuid,boolean),public.app_admin_live_events(integer),public.app_admin_live_event_rsvps(uuid,integer),
 public.app_admin_save_live_event(uuid,integer,text,text,text,timestamp,integer,text,text,text,uuid[],text)
 to authenticated;

commit;
