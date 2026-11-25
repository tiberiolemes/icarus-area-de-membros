begin;

-- Módulos opcionais da instalação. Cursos e Certificados são o núcleo e não entram aqui. Desligar esconde e bloqueia
-- para o aluno; nenhum dado é apagado, e religar devolve tudo. Instalações novas e atualizadas começam com tudo ligado.
-- Nenhuma exportação depende dos módulos: a do membro (LGPD) e as do painel continuam completas.
create table app_private.installation_modules (
  key text primary key check (key in ('community', 'materials', 'podcasts', 'ranking', 'live_events', 'support', 'help', 'feedback')),
  enabled boolean not null default true
);
alter table app_private.installation_modules enable row level security;
revoke all on table app_private.installation_modules from public, anon, authenticated, service_role;
insert into app_private.installation_modules(key)
values ('community'), ('materials'), ('podcasts'), ('ranking'), ('live_events'), ('support'), ('help'), ('feedback');

-- Chave desconhecida conta como desligada, para um erro de digitação nunca liberar acesso.
create function app_private.module_enabled(p_key text) returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select enabled from app_private.installation_modules where key = p_key), false)
$$;
-- A equipe responsável pelo módulo segue usando o painel com ele desligado.
create function app_private.module_open(p_actor uuid, p_key text) returns boolean language sql stable security definer set search_path = '' as $$
  select app_private.module_enabled(p_key) or app_private.is_staff(p_actor, case p_key
    when 'community' then array['admin', 'moderator']
    when 'materials' then array['admin', 'instructor']
    when 'support' then array['admin', 'support']
    when 'help' then array['admin', 'instructor', 'moderator', 'support']
    else array['admin'] end)
$$;
create function app_private.require_module(p_actor uuid, p_key text) returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not app_private.module_open(p_actor, p_key) then perform app_private.fail('Este recurso está desativado nesta plataforma.'); end if;
end $$;
create function app_private.modules_json() returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_object_agg(key, enabled) from app_private.installation_modules
$$;
revoke execute on function app_private.module_enabled(text), app_private.module_open(uuid, text), app_private.require_module(uuid, text), app_private.modules_json()
  from public, anon, authenticated, service_role;

create function public.app_admin_set_module(p_key text, p_enabled boolean) returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor_id uuid := app_private.require_role(array['admin']);
begin
  if p_enabled is null then perform app_private.fail('Escolha ligar ou desligar o módulo.'); end if;
  perform 1 from app_private.installation_modules where key = p_key for update;
  if not found then perform app_private.fail('Módulo indisponível.'); end if;
  update app_private.installation_modules set enabled = p_enabled where key = p_key and enabled <> p_enabled;
  if found then perform app_private.audit(actor_id, case when p_enabled then 'enable' else 'disable' end, 'module_' || p_key, null); end if;
  return app_private.modules_json();
end $$;
revoke execute on function public.app_admin_set_module(text, boolean) from public, anon, authenticated, service_role;
grant execute on function public.app_admin_set_module(text, boolean) to authenticated;

-- Comunidade: o acesso ao espaço cobre publicação, resposta, curtida, denúncia, arquivo e a imagem nas Edges.
create or replace function app_private.space_access(p_actor uuid,p_id uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.spaces s where id=p_id and (app_private.is_staff(p_actor,array['admin','moderator']) or (status='published' and app_private.entitled(p_actor,access_mode,plan_ids)))) and app_private.module_open(p_actor,'community') $$;

create or replace function public.app_feed(p_space_id uuid default null,p_query text default '',p_page integer default 1) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.actor();begin
 perform app_private.require_module(u,'community');
 if p_page<1 or p_page>100000 or length(p_query)>200 then perform app_private.fail('Busca inválida.');end if;
 if p_space_id is not null and not app_private.space_access(u,p_space_id) then perform app_private.fail('Espaço indisponível.');end if;
 return jsonb_build_object('spaces',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'description',s.description,'can_access',true) order by order_index,id) from public.spaces s where app_private.space_access(u,s.id)),'[]'::jsonb),'items',coalesce((select jsonb_agg(app_private.post_json(u,x.id)) from(select id from public.posts where (p_space_id is null or space_id=p_space_id) and app_private.post_access(u,id) and (title ilike '%'||p_query||'%' or body ilike '%'||p_query||'%') order by created_at desc,id limit 20 offset (p_page-1)*20)x),'[]'::jsonb),'total',(select count(*) from public.posts where (p_space_id is null or space_id=p_space_id) and app_private.post_access(u,id) and (title ilike '%'||p_query||'%' or body ilike '%'||p_query||'%')),'page',p_page,'page_size',20);
end $$;

-- Materiais: só a biblioteca. O anexo de aula segue com Cursos.
create or replace function app_private.material_access(p_actor uuid,p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.materials m where m.id=p_id and (app_private.is_staff(p_actor,array['admin','instructor']) or (m.status='published' and app_private.folder_access(p_actor,m.folder_id) and app_private.entitled(p_actor,m.access_mode,m.plan_ids) and (m.lesson_id is null or app_private.lesson_access(p_actor,m.lesson_id)) and (m.lesson_id is not null or app_private.module_enabled('materials')))))
$$;

create or replace function public.app_materials(p_folder_id uuid default null,p_query text default '',p_page integer default 1) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.actor();begin
 perform app_private.require_module(u,'materials');
 if p_page<1 or p_page>100000 or length(p_query)>200 then perform app_private.fail('Busca inválida.');end if;
 if not app_private.folder_access(u,p_folder_id) then perform app_private.fail('Pasta indisponível.');end if;
 return jsonb_build_object('folders',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'parent_id',parent_id)) from public.material_folders where parent_id is not distinct from p_folder_id and app_private.folder_access(u,id)),'[]'::jsonb),'items',coalesce((select jsonb_agg(app_private.material_json(u,x.id)) from(select id from public.materials where folder_id is not distinct from p_folder_id and status='published' and name ilike '%'||p_query||'%' order by name,id limit 20 offset (p_page-1)*20)x),'[]'::jsonb),'total',(select count(*) from public.materials where folder_id is not distinct from p_folder_id and status='published' and name ilike '%'||p_query||'%'),'page',p_page,'page_size',20);
end $$;

-- Suporte: o acesso ao ticket cobre resposta, anexo e download nas Edges.
create or replace function app_private.ticket_access(p_actor uuid,p_id uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.tickets where id=p_id and (user_id=p_actor or app_private.is_staff(p_actor,array['admin','support']))) and app_private.module_open(p_actor,'support') $$;

create or replace function public.app_tickets(p_page integer default 1) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.actor();begin
 perform app_private.require_module(u,'support');
 if p_page<1 or p_page>100000 then perform app_private.fail('Página inválida.');end if;
 return jsonb_build_object('items',coalesce((select jsonb_agg(app_private.ticket_json(u,x.id)) from(select id from public.tickets where app_private.ticket_access(u,id) order by created_at desc,id limit 20 offset (p_page-1)*20)x),'[]'::jsonb),'total',(select count(*) from public.tickets where app_private.ticket_access(u,id)),'page',p_page,'page_size',20);
end $$;

create or replace function public.app_create_ticket(p_subject text,p_priority text,p_body text) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.actor();id_out uuid;begin
 perform app_private.require_module(u,'support');
 perform app_private.throttle(u,'ticket',4);
 if p_priority is null or p_priority not in ('low','normal','high','urgent') then perform app_private.fail('Selecione uma prioridade válida.');end if;
 insert into public.tickets(user_id,subject,priority) values(u,trim(p_subject),p_priority) returning id into id_out;
 insert into public.ticket_messages(ticket_id,author_id,body) values(id_out,u,trim(p_body));return jsonb_build_object('id',id_out);
end $$;

-- Podcasts e masterclasses.
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

create or replace function public.app_podcast(p_id uuid, p_admin boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := app_private.actor();
  result jsonb;
begin
  perform app_private.require_module(actor_id, 'podcasts');
  if p_admin then perform app_private.podcast_admin(actor_id); end if;
  select jsonb_build_object(
    'id', e.id, 'youtube_id', e.youtube_id, 'kind', e.kind, 'title', e.title,
    'published_at', e.published_at, 'status', e.status, 'is_featured', e.is_featured,
    'description', e.description, 'chapters', e.chapters, 'spotify_url', e.spotify_url,
    'watched', exists (select 1 from public.podcast_watches w where w.user_id = actor_id and w.episode_id = e.id)
  ) into result
  from public.podcast_episodes e where e.id = p_id and (p_admin or e.status = 'published');
  if result is null then perform app_private.fail('Episódio indisponível.'); end if;
  return result;
end $$;

create or replace function public.app_podcast_watch(p_id uuid, p_watched boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor_id uuid := app_private.actor();
begin
  perform app_private.require_module(actor_id, 'podcasts');
  if p_watched is null then perform app_private.fail('Informe se o episódio foi assistido.'); end if;
  perform app_private.podcast_write_lock(actor_id);
  perform 1 from public.podcast_episodes where id = p_id and status = 'published' for share;
  if not found then perform app_private.fail('Episódio indisponível.'); end if;
  perform app_private.throttle(actor_id, 'podcast_watch', 30);
  if p_watched then
    insert into public.podcast_watches (user_id, episode_id) values (actor_id, p_id) on conflict do nothing;
  else
    delete from public.podcast_watches where user_id = actor_id and episode_id = p_id;
  end if;
  return jsonb_build_object('watched', p_watched);
end $$;

-- Encontros ao vivo.
create or replace function public.app_live_events(p_recordings boolean default false,p_page integer default 1)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.actor(); result jsonb;
begin
 perform app_private.require_module(u,'live_events');
 if p_recordings is null or p_page is null or p_page not between 1 and 10000 then
  perform app_private.fail('Página inválida.');
 end if;
 select jsonb_build_object('items', coalesce(jsonb_agg(
  jsonb_build_object('id',e.id,'starts_at',e.starts_at,'can_access',e.allowed)
  || case when e.allowed then jsonb_build_object('title',e.title,'guest',e.guest,
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

create or replace function public.app_live_event_link(p_id uuid,p_recording boolean)
returns text language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.actor(); link text;
begin
 perform app_private.require_module(u,'live_events');
 select case when p_recording then recording_url when p_recording=false then meeting_url end into link
 from public.live_events where id=p_id and status='published'
  and app_private.entitled(u,access_mode,plan_ids)
  and (p_recording = (starts_at + make_interval(mins=>duration_minutes)<=now()));
 if link is null then perform app_private.fail('Link indisponível para este encontro.');end if;
 return link;
end $$;

create or replace function public.app_live_event_rsvp(p_id uuid,p_confirmed boolean)
returns boolean language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.actor();
begin
 perform app_private.require_module(u,'live_events');
 begin
  perform 1 from public.profiles where id=u for key share nowait;
 exception when lock_not_available then
  perform app_private.fail('Sua conta está sendo atualizada. Tente novamente em instantes.');
 end;
 perform 1 from public.live_events where id=p_id and status='published' and starts_at>clock_timestamp()
  and app_private.entitled(u,access_mode,plan_ids) for share;
 if not found or p_confirmed is null then perform app_private.fail('Confirmação indisponível para este encontro.');end if;
 if p_confirmed then
  insert into public.live_event_rsvps(event_id,user_id) values(p_id,u) on conflict do nothing;
 else
  delete from public.live_event_rsvps where event_id=p_id and user_id=u;
 end if;
 return p_confirmed;
end $$;

-- Ranking. Os pontos continuam registrados com o módulo desligado.
create or replace function public.app_ranking(p_period text, p_page integer, p_from date, p_through date)
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
  perform app_private.require_module(viewer, 'ranking');
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

-- Central de ajuda.
create or replace function public.app_help_feedback(p_page text,p_action text,p_rating boolean default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.actor();begin
 -- O guia de cada tela usa a mesma RPC e continua; só a avaliação dos artigos da Central é recusada.
 if p_page ~ '^/ajuda(/|$)' then perform app_private.require_module(u,'help');end if;
 insert into public.help_feedback(user_id,page,action,rating) values(u,p_page,p_action,p_rating) on conflict(user_id,page) do update set action=excluded.action,rating=excluded.rating,updated_at=now();return jsonb_build_object('ok',true);
end $$;

-- Feedback dos alunos. A triagem do admin não muda.
create or replace function public.app_feedback_screenshot_reserve(p_actor_id uuid,p_attempt_key uuid,p_content_type text,p_size_bytes bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare x public.uploads; file_id uuid := gen_random_uuid(); ext text;
begin
 perform app_private.service_actor(p_actor_id);
 perform app_private.require_module(p_actor_id,'feedback');
 ext := case p_content_type when 'image/png' then 'png' when 'image/jpeg' then 'jpg' when 'image/webp' then 'webp' end;
 if p_attempt_key is null or ext is null or p_size_bytes is null or p_size_bytes not between 1 and 5242880 then
  perform app_private.fail('Envie uma imagem PNG, JPG ou WebP de até 5 MiB.');
 end if;
 perform app_private.throttle(p_actor_id,'upload',12);
 insert into public.uploads(id,actor_id,kind,resource_id,path,file_name,content_type,size_bytes)
 values(file_id,p_actor_id,'feedback-screenshot',p_attempt_key,
  'feedback-screenshot/'||file_id||'.'||ext,'print.'||ext,p_content_type,p_size_bytes)
 on conflict (actor_id,resource_id) where kind='feedback-screenshot' do nothing;
 select * into x from public.uploads where actor_id=p_actor_id and resource_id=p_attempt_key and kind='feedback-screenshot' for update;
 if x.content_type is distinct from p_content_type or x.size_bytes is distinct from p_size_bytes then
  perform app_private.fail('A imagem não corresponde ao envio reservado.');
 end if;
 if x.state='pending' and x.expires_at<=now() then
  update public.uploads set expires_at=now()+interval '15 minutes' where id=x.id;
 end if;
 return jsonb_build_object('id',x.id,'bucket','icarus-private','path',x.path,'status',x.state);
end $$;

create or replace function public.app_submit_feedback(p_attempt_key uuid,p_kind text,p_body text,p_screenshot_id uuid default null,
 p_page_path text default null,p_browser_family text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid := app_private.actor(); f public.feedbacks; body_text text := regexp_replace(p_body,'^[[:space:]]+|[[:space:]]+$','','g');
begin
 perform app_private.require_module(u,'feedback');
 if p_attempt_key is null or p_kind is null or body_text is null then
  perform app_private.fail('Confira o tipo, a descrição e o contexto do feedback.');
 end if;
 perform pg_advisory_xact_lock(hashtextextended('icarus.feedback/'||u||'/'||p_attempt_key,0));
 select * into f from public.feedbacks where author_id=u and attempt_key=p_attempt_key;
 if found then
  if (f.kind,f.body,f.screenshot_id,f.page_path,f.browser_family) is distinct from
   (p_kind,body_text,p_screenshot_id,p_page_path,p_browser_family) then
   perform app_private.fail('Esta tentativa corresponde ao envio anterior. Envie o rascunho alterado como novo feedback.');
  end if;
  return jsonb_build_object('id',f.id);
 end if;
 perform app_private.throttle(u,'feedback',6);
 if p_screenshot_id is not null then
  perform 1 from public.uploads where id=p_screenshot_id and actor_id=u and kind='feedback-screenshot' and state='ready' for update;
  if not found then perform app_private.fail('Print indisponível para este envio.'); end if;
  if exists(select 1 from public.feedbacks where screenshot_id=p_screenshot_id) then
   perform app_private.fail('Print indisponível para este envio.');
  end if;
 end if;
 insert into public.feedbacks(author_id,attempt_key,kind,body,screenshot_id,page_path,browser_family)
 values(u,p_attempt_key,p_kind,body_text,p_screenshot_id,p_page_path,p_browser_family)
 returning * into f;
 return jsonb_build_object('id',f.id);
exception when check_violation then
 perform app_private.fail('Confira o tipo, a descrição e o contexto do feedback.');
end $$;

-- O estado dos módulos sai como booleanos no contexto público e no bootstrap.
create or replace function public.app_public_context() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('modules',app_private.modules_json(),'name',(select name from app_private.installation_brand where singleton),'logo_light',(select logo_light from app_private.installation_brand where singleton),'logo_dark',(select logo_dark from app_private.installation_brand where singleton),'icon',(select icon from app_private.installation_brand where singleton),'legal_ready',(select count(distinct kind)=2 from public.legal_versions where published and not demo),'registration_enabled',(select count(distinct kind)=2 from public.legal_versions where published and not demo),
 'legal_versions',coalesce((select jsonb_agg(jsonb_build_object('id',id,'kind',kind,'version',version,'title',title,'body',body,'demo',demo)) from public.legal_versions where published),'[]'::jsonb),'plans',coalesce((select jsonb_agg(to_jsonb(p)-'created_at') from public.plans p where active),'[]'::jsonb),'onboarding_questions',coalesce((select jsonb_agg(to_jsonb(q) order by order_index,id) from public.onboarding_questions q where active),'[]'::jsonb))
$$;

create or replace function public.app_bootstrap() returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.actor(true);oid uuid;begin
 for oid in select o.id from public.orders o join auth.users a on a.id=u and a.email_confirmed_at is not null and lower(a.email)=lower(o.buyer_data->>'email') where o.status='paid' and o.finalized_at is null and (o.user_id is null or o.user_id=u) loop perform app_private.finalize_order(oid,u);end loop;
 return jsonb_build_object('profile',app_private.profile_json(u),'plans',coalesce((select jsonb_agg(to_jsonb(p)-'created_at') from public.plans p where active),'[]'::jsonb),'settings',jsonb_build_object('modules',app_private.modules_json(),'name',(select name from app_private.installation_brand where singleton),'name_revision',(select revision from app_private.installation_brand where singleton),'logo_light',(select logo_light from app_private.installation_brand where singleton),'logo_dark',(select logo_dark from app_private.installation_brand where singleton),'icon',(select icon from app_private.installation_brand where singleton),'terms_url','/termos','privacy_url','/privacidade','onboarding',(select to_jsonb(o)-'singleton' from public.onboarding o limit 1),'onboarding_questions',coalesce((select jsonb_agg(to_jsonb(q) order by order_index,id) from public.onboarding_questions q where active),'[]'::jsonb),'capabilities',jsonb_build_object('checkout',false,'bunny',false)),
 'orders',coalesce((select jsonb_agg(jsonb_build_object('id',id,'plan_id',plan_id,'status',status,'amount_cents',amount_cents,'created_at',created_at,'checkout_url',checkout_url) order by created_at desc) from public.orders where user_id=u),'[]'::jsonb));
end $$;

revoke execute on function app_private.space_access(uuid, uuid), app_private.material_access(uuid, uuid), app_private.ticket_access(uuid, uuid)
  from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';
commit;
