begin;

-- O fluxo autenticado bloqueia a sessão antes de gravar no limitador.
lock table public.app_sessions in share row exclusive mode;
create index rate_limits_window_start on public.rate_limits (window_start);
create index reauth_nonces_expires_at on public.reauth_nonces (expires_at);
create index reauth_nonces_session_id on public.reauth_nonces (session_id);
create index app_sessions_expires_at on public.app_sessions (expires_at);
alter table public.reauth_nonces drop constraint reauth_nonces_session_id_fkey,
 add constraint reauth_nonces_session_id_fkey foreign key (session_id) references public.app_sessions(id) on delete cascade;

-- Um ID sem perfil nem dados de atividade impede recriar uma sessão Icarus vencida.
-- O Auth remove o marcador em cascata quando remove a própria sessão.
create table app_private.retired_sessions (
 id uuid primary key references auth.sessions(id) on delete cascade
);
alter table app_private.retired_sessions enable row level security;
revoke all on app_private.retired_sessions from public,anon,authenticated,service_role;

create function app_private.reap_security_state(p_batch integer) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not pg_try_advisory_xact_lock(hashtextextended('icarus-security-retention',0)) then return;end if;

 delete from public.rate_limits
 where (actor_id,bucket,window_start) in (
  select actor_id,bucket,window_start from public.rate_limits
  where window_start<now()-interval '2 days' order by window_start limit p_batch for update skip locked
 );
 delete from public.reauth_nonces
 where token_hash in (
  select token_hash from public.reauth_nonces
  where expires_at<=now() order by expires_at limit p_batch for update skip locked
 );
 with expired as (
  delete from public.app_sessions where id in (
   select a.id from auth.sessions s join public.app_sessions a on a.id=s.id
   where a.expires_at<now()-interval '1 day' order by a.expires_at limit p_batch
   for key share of s skip locked for update of a skip locked
  ) returning id
 )
 insert into app_private.retired_sessions (id) select id from expired;
end $$;
revoke execute on function app_private.reap_security_state(integer) from public,anon,authenticated,service_role;

do $$
begin
 if exists(select 1 from pg_extension where extname='pg_cron') then
  perform cron.schedule('icarus-security-retention','35 3 * * *','select app_private.reap_security_state(5000)');
 end if;
end $$;


create or replace function app_private.actor(p_allow_aal1 boolean default false) returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();sid uuid;p public.profiles;s public.app_sessions;idle interval;needs_aal2 boolean;begin
 if u is null then perform app_private.fail('Sessão inválida. Entre novamente.');end if;
 sid:=nullif(auth.jwt()->>'session_id','')::uuid;
 select * into p from public.profiles where id=u;
 if not found or p.suspended then perform app_private.fail('Acesso indisponível.');end if;
 if p.password_setup_required and not p_allow_aal1 then perform app_private.fail('Defina sua senha para acessar o conteúdo.');end if;
 needs_aal2:=app_private.requires_aal2(u);
 if sid is null or not exists(select 1 from auth.sessions where id=sid and user_id=u and (not_after is null or not_after>now()) and (p_allow_aal1 or not needs_aal2 or auth.sessions.aal='aal2')) then perform app_private.fail('Sessão inválida ou segundo fator pendente.');end if;
 idle:=case when p.role='member' then interval '2 hours' else interval '30 minutes' end;
 select * into s from public.app_sessions where id=sid and user_id=u for update;
 if not found then
  if exists(select 1 from app_private.retired_sessions where id=sid) then perform app_private.fail('Sessão expirada. Entre novamente.');end if;
  insert into public.app_sessions(id,user_id,expires_at) values(sid,u,now()+idle) on conflict(id) do nothing;
  select * into s from public.app_sessions where id=sid and user_id=u for update;
 end if;
 if not found or s.revoked_at is not null or least(s.expires_at,coalesce(s.remember_until,s.last_activity_at+idle))<=now() then perform app_private.fail('Sessão expirada. Entre novamente.');end if;
 if needs_aal2 and not p_allow_aal1 and coalesce(auth.jwt()->>'aal','aal1')<>'aal2' then perform app_private.fail('Confirme o segundo fator para continuar.');end if;
 return u;
end $$;

revoke execute on function app_private.actor(boolean) from public,anon,authenticated,service_role;

create or replace function app_private.throttle(p_actor uuid,p_bucket text,p_limit integer) returns void language plpgsql security definer set search_path='' as $$
declare n integer;begin
 insert into public.rate_limits values(p_actor,p_bucket,date_trunc('minute',now()),1) on conflict(actor_id,bucket,window_start) do update set count=public.rate_limits.count+1 returning count into n;
 if n>p_limit then perform app_private.fail('Muitas solicitações. Aguarde um minuto.');end if;
 -- Em instalações sem cron, a amostragem e o lote curto evitam varrer tabelas em toda chamada.
 if random()<0.01 and not exists(select 1 from pg_extension where extname='pg_cron') then
  begin
   perform app_private.reap_security_state(200);
  exception when deadlock_detected or lock_not_available then null;
  end;
 end if;
end $$;

revoke execute on function app_private.throttle(uuid,text,integer) from public,anon,authenticated,service_role;

create or replace function public.app_reauth_throttle(p_actor_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare n integer;begin
 if p_actor_id is null then perform app_private.fail();end if;
 perform app_private.throttle(p_actor_id,'reauth',5);
 insert into public.rate_limits(actor_id,bucket,window_start,count)
 values(p_actor_id,'reauth_hour',date_trunc('hour',now()),1)
 on conflict(actor_id,bucket,window_start) do update set count=public.rate_limits.count+1 returning count into n;
 if n>20 then perform app_private.fail('Muitas solicitações. Aguarde até a próxima hora.');end if;
end $$;

revoke execute on function public.app_reauth_throttle(uuid) from public,anon,authenticated,service_role;
grant execute on function public.app_reauth_throttle(uuid) to service_role;

create or replace function public.app_feed(p_space_id uuid default null,p_query text default '',p_page integer default 1) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.actor();begin
 perform app_private.require_module(u,'community');
 if p_page<1 or p_page>100000 or length(p_query)>200 then perform app_private.fail('Busca inválida.');end if;
 if p_space_id is not null and not app_private.space_access(u,p_space_id) then perform app_private.fail('Espaço indisponível.');end if;
 perform app_private.throttle(u,'feed',60);
 return jsonb_build_object('spaces',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'description',s.description,'can_access',true) order by order_index,id) from public.spaces s where app_private.space_access(u,s.id)),'[]'::jsonb),'items',coalesce((select jsonb_agg(app_private.post_json(u,x.id)) from(select id from public.posts where (p_space_id is null or space_id=p_space_id) and app_private.post_access(u,id) and (title ilike '%'||p_query||'%' or body ilike '%'||p_query||'%') order by created_at desc,id limit 20 offset (p_page-1)*20)x),'[]'::jsonb),'total',(select count(*) from public.posts where (p_space_id is null or space_id=p_space_id) and app_private.post_access(u,id) and (title ilike '%'||p_query||'%' or body ilike '%'||p_query||'%')),'page',p_page,'page_size',20);
end $$;

revoke execute on function public.app_feed(uuid,text,integer) from public,anon,authenticated,service_role;
grant execute on function public.app_feed(uuid,text,integer) to authenticated;

create or replace function public.app_materials(p_folder_id uuid default null,p_query text default '',p_page integer default 1) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.actor();begin
 perform app_private.require_module(u,'materials');
 if p_page<1 or p_page>100000 or length(p_query)>200 then perform app_private.fail('Busca inválida.');end if;
 if not app_private.folder_access(u,p_folder_id) then perform app_private.fail('Pasta indisponível.');end if;
 perform app_private.throttle(u,'materials',60);
 return jsonb_build_object(
  'current_folder',(select jsonb_build_object('id',id,'name',name,'parent_id',parent_id) from public.material_folders where id=p_folder_id),
  'folders',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'parent_id',parent_id)) from public.material_folders where parent_id is not distinct from p_folder_id and app_private.folder_access(u,id)),'[]'::jsonb),'items',coalesce((select jsonb_agg(app_private.material_json(u,x.id)) from(select id from public.materials where folder_id is not distinct from p_folder_id and status='published' and name ilike '%'||p_query||'%' order by name,id limit 20 offset (p_page-1)*20)x),'[]'::jsonb),'total',(select count(*) from public.materials where folder_id is not distinct from p_folder_id and status='published' and name ilike '%'||p_query||'%'),'page',p_page,'page_size',20);
end $$;

revoke execute on function public.app_materials(uuid,text,integer) from public,anon,authenticated,service_role;
grant execute on function public.app_materials(uuid,text,integer) to authenticated;

create or replace function public.app_podcasts(p_page integer default 1, p_query text default '', p_admin boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := app_private.actor();
  result jsonb;
  featured_id uuid;
begin
  perform app_private.require_module(actor_id, 'podcasts');
  if p_admin then perform app_private.podcast_admin(actor_id); end if;
  if p_admin is null or p_page is null or p_page not between 1 and 10000 or p_query is null or length(p_query) > 120 then
    perform app_private.fail('Confira a página ou o termo de busca.');
  end if;

 perform app_private.throttle(actor_id,'podcasts',60);
  if not p_admin then
    select id into featured_id from public.podcast_episodes where is_featured and status = 'published';
  end if;

  with eligible as (
    select e.id, e.youtube_id, e.kind, e.title, e.published_at, e.status, e.is_featured,
           (w.episode_id is not null) as watched
    from public.podcast_episodes e
    left join public.podcast_watches w on w.episode_id = e.id and w.user_id = actor_id
    where (p_admin or e.status = 'published')
      and strpos(lower(e.title), lower(btrim(p_query))) > 0
  ), page_rows as (
    select * from eligible order by published_at desc, id limit 20 offset (p_page - 1) * 20
  )
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(to_jsonb(r) order by r.published_at desc, r.id) from page_rows r), '[]'::jsonb),
    'total', (select count(*) from eligible), 'page', p_page, 'page_size', 20, 'featured_id', featured_id
  ) into result;
  return result;
end $$;

revoke execute on function public.app_podcasts(integer,text,boolean) from public,anon,authenticated,service_role;
grant execute on function public.app_podcasts(integer,text,boolean) to authenticated;

create or replace function public.app_live_events(p_recordings boolean default false,p_page integer default 1)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.actor(); result jsonb;
begin
 perform app_private.require_module(u,'live_events');
 if p_recordings is null or p_page is null or p_page not between 1 and 10000 then
  perform app_private.fail('Página inválida.');
 end if;
 perform app_private.throttle(u,'live_events',60);
 select jsonb_build_object('items', coalesce(jsonb_agg(
  jsonb_build_object('id',e.id,'starts_at',e.starts_at,'can_access',e.allowed,'title',e.title,'guest',e.guest)
  || case when e.allowed then jsonb_build_object(
     'description',e.description,'duration_minutes',e.duration_minutes,
     'confirmed',not p_recordings and exists(select 1 from public.live_event_rsvps r where r.event_id=e.id and r.user_id=u),
     'can_rsvp',e.starts_at>now()) else '{}'::jsonb end
  order by e.position) filter (where e.position <= 12),'[]'::jsonb),
  'has_more', count(*)>12) into result
 from (
  select page.*,row_number() over (order by
    case when p_recordings then page.starts_at end desc,page.starts_at,page.id) as position,
    app_private.entitled(u,page.access_mode,page.plan_ids) as allowed
  from (
   select id, starts_at, title, guest, description, duration_minutes, access_mode, plan_ids
   from public.live_events
   where status='published' and case when p_recordings then
    recording_url is not null and starts_at + make_interval(mins=>duration_minutes)<=now()
    else starts_at + make_interval(mins=>duration_minutes)>now() end
   order by case when p_recordings then starts_at end desc, starts_at,id
   limit 13 offset (p_page-1)*12
  ) page
 ) e;
 return result;
end $$;

revoke execute on function public.app_live_events(boolean,integer) from public,anon,authenticated,service_role;
grant execute on function public.app_live_events(boolean,integer) to authenticated;

create or replace function public.app_upload_access(p_actor_id uuid,p_kind text,p_resource_id uuid,p_file_name text,p_content_type text,p_size_bytes bigint) returns jsonb language plpgsql security definer set search_path='' as $$
declare id_out uuid:=gen_random_uuid();path_out text;ext text;deadline timestamptz:=now()+interval '15 minutes';begin
 perform app_private.service_actor(p_actor_id);perform app_private.throttle(p_actor_id,'upload',12);
 if p_file_name is null or length(p_file_name) not between 1 and 200 or p_file_name ~ '[/\\[:cntrl:]]' or p_size_bytes is null or p_size_bytes not between 1 and 524288000 then perform app_private.fail('Arquivo inválido ou maior que 500 MB.');end if;
 ext:=lower(substring(p_file_name from '\.([A-Za-z0-9]+)$'));
 if ext is null or p_content_type is null or not ((p_content_type='application/pdf' and ext='pdf') or (p_content_type='application/zip' and ext='zip') or (p_content_type='text/plain' and ext in ('txt','md','skill')) or (p_content_type='image/jpeg' and ext in ('jpg','jpeg')) or (p_content_type='image/png' and ext='png') or (p_content_type='image/webp' and ext='webp') or (p_content_type='video/mp4' and ext='mp4') or (p_content_type='audio/mpeg' and ext='mp3')) then perform app_private.fail('Tipo de arquivo não permitido.');end if;
 if p_kind='ticket-attachment' then
  if p_size_bytes>52428800 or not app_private.ticket_access(p_actor_id,p_resource_id) then perform app_private.fail();end if;
 elsif p_kind='post-image' then
  perform 1 from public.posts where id=p_resource_id for share;
  if p_content_type not in ('image/jpeg','image/png','image/webp') or p_size_bytes>10485760 or not exists(select 1 from public.posts where id=p_resource_id and author_id=p_actor_id and status not in ('removed','archived') and app_private.space_access(p_actor_id,space_id)) then perform app_private.fail();end if;
 elsif p_kind='avatar' then
  if p_resource_id is distinct from p_actor_id then perform app_private.fail();end if;
  if p_content_type not in ('image/jpeg','image/png') or p_size_bytes>512000 then
   perform app_private.fail('A foto precisa ser JPG ou PNG de até 500 KB.');
  end if;
 elsif p_kind in ('lesson','material','course-cover') then
  if not app_private.is_staff(p_actor_id,array['admin','instructor']) then perform app_private.fail();end if;
  if (p_kind='lesson' and not exists(select 1 from public.lessons where id=p_resource_id)) or (p_kind='material' and not exists(select 1 from public.materials where id=p_resource_id)) or (p_kind='course-cover' and (p_size_bytes>10485760 or p_content_type not in ('image/jpeg','image/png','image/webp') or not exists(select 1 from public.courses where id=p_resource_id))) then perform app_private.fail();end if;
 else perform app_private.fail('Destino de upload inválido.');end if;
 path_out:=p_kind||'/'||p_resource_id::text||'/'||id_out::text||'.'||ext;
 insert into public.uploads(id,actor_id,kind,resource_id,ticket_id,post_id,lesson_id,material_id,course_id,profile_id,path,file_name,content_type,size_bytes,expires_at) values(id_out,p_actor_id,p_kind,p_resource_id,case when p_kind='ticket-attachment' then p_resource_id end,case when p_kind='post-image' then p_resource_id end,case when p_kind='lesson' then p_resource_id end,case when p_kind='material' then p_resource_id end,case when p_kind='course-cover' then p_resource_id end,case when p_kind='avatar' then p_resource_id end,path_out,p_file_name,p_content_type,p_size_bytes,deadline);
 return jsonb_build_object('id',id_out,'bucket','icarus-private','path',path_out,'storage_path',path_out,'content_type',p_content_type,'size_bytes',p_size_bytes,'status','pending','expires_at',deadline);
end $$;

revoke execute on function public.app_upload_access(uuid,text,uuid,text,text,bigint) from public,anon,authenticated,service_role;
grant execute on function public.app_upload_access(uuid,text,uuid,text,text,bigint) to service_role;

create or replace function public.app_certificate(p_code text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;begin
 if p_code is null or length(p_code)<>48 then perform app_private.fail('Certificado indisponível.');end if;
 select jsonb_build_object('id',id,'code',code,'student_name',student_name,'course_title',course_title,'duration_minutes',duration_minutes,'issued_at',issued_at,'revoked_at',revoked_at,'demo',demo,'signer_name',signer_name,'signer_title',signer_title,'signature_path',signature_path) into result from public.certificates where code=p_code;
 if result is null then perform app_private.fail('Certificado indisponível.');end if;return result;
end $$;

revoke execute on function public.app_certificate(text) from public,anon,authenticated,service_role;
grant execute on function public.app_certificate(text) to anon,authenticated;
comment on function public.app_certificate(text) is 'anon-ok: código opaco, emissão sem email/CPF ou listagem, assinatura só do armazenamento oficial';
notify pgrst,'reload schema';
commit;
