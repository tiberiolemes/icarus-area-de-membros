begin;

create table public.podcast_episodes (
  id uuid primary key default gen_random_uuid(),
  youtube_id text not null unique check (youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
  kind text not null check (kind in ('podcast', 'masterclass')),
  title text not null check (length(btrim(title)) between 1 and 160),
  description text not null check (length(description) <= 5000),
  published_at timestamptz not null check (isfinite(published_at)),
  status text not null default 'draft' check (status in ('draft', 'published')),
  is_featured boolean not null default false check (not is_featured or status = 'published'),
  chapters jsonb not null default '[]',
  spotify_url text check (spotify_url ~ '^https://open[.]spotify[.]com/episode/[A-Za-z0-9]{22}$')
);
create unique index podcast_one_featured on public.podcast_episodes (is_featured) where is_featured;
create index podcast_episode_order on public.podcast_episodes (published_at desc, id);

create table public.podcast_watches (
  user_id uuid not null references public.profiles(id) on delete cascade,
  episode_id uuid not null references public.podcast_episodes(id) on delete cascade,
  primary key (user_id, episode_id)
);
alter table public.podcast_episodes enable row level security;
alter table public.podcast_watches enable row level security;
revoke all on public.podcast_episodes, public.podcast_watches from public, anon, authenticated, service_role;

create function app_private.podcast_admin(p_actor uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app_private.is_staff(p_actor, array['admin']) then
    perform app_private.fail('Acesso administrativo indisponível.');
  end if;
end $$;

create function app_private.podcast_write_lock(p_actor uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  -- actor() já travou a sessão. A suspensão trava primeiro o perfil.
  perform 1 from public.profiles where id = p_actor and not suspended for key share nowait;
  if not found then perform app_private.fail('Acesso indisponível.'); end if;
exception when lock_not_available then
  perform app_private.fail('Sua conta está sendo atualizada. Tente novamente em instantes.');
end $$;
revoke execute on function app_private.podcast_admin(uuid), app_private.podcast_write_lock(uuid)
  from public, anon, authenticated, service_role;

create function public.app_podcasts(p_page integer default 1, p_query text default '', p_admin boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := app_private.actor();
  result jsonb;
  featured_id uuid;
begin
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

create function public.app_podcast(p_id uuid, p_admin boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := app_private.actor();
  result jsonb;
begin
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

create function public.app_podcast_watch(p_id uuid, p_watched boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor_id uuid := app_private.actor();
begin
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

create function public.app_admin_save_podcast(
  p_id uuid, p_youtube_id text, p_kind text, p_title text, p_description text,
  p_published_at timestamptz, p_status text, p_is_featured boolean,
  p_chapters jsonb, p_spotify_url text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := app_private.actor();
  chapter jsonb;
  chapter_seconds integer;
  previous_seconds integer := -1;
  saved_id uuid;
  conflict_name text;
begin
  perform app_private.podcast_write_lock(actor_id);
  perform app_private.podcast_admin(actor_id);
  if p_youtube_id is null or p_youtube_id !~ '^[A-Za-z0-9_-]{11}$' then
    perform app_private.fail('Informe um vídeo válido do YouTube.');
  end if;
  if p_kind is null or p_kind not in ('podcast', 'masterclass')
     or p_title is null or length(btrim(p_title)) not between 1 and 160
     or p_description is null or length(p_description) > 5000
     or p_published_at is null or not isfinite(p_published_at)
     or p_published_at < '1900-01-01'::timestamptz or p_published_at >= '2101-01-01'::timestamptz
     or p_status is null or p_status not in ('draft', 'published')
     or p_is_featured is null or (p_is_featured and p_status <> 'published') then
    perform app_private.fail('Confira os dados do episódio. Somente episódios publicados podem ficar em destaque.');
  end if;
  if p_spotify_url is not null and p_spotify_url !~ '^https://open[.]spotify[.]com/episode/[A-Za-z0-9]{22}$' then
    perform app_private.fail('Informe o link de um episódio em open.spotify.com.');
  end if;
  if jsonb_typeof(p_chapters) is distinct from 'array' then
    perform app_private.fail('Informe capítulos válidos.');
  end if;
  if jsonb_array_length(p_chapters) > 40 then
    perform app_private.fail('Informe até 40 capítulos.');
  end if;
  for chapter in select value from jsonb_array_elements(p_chapters) loop
    if jsonb_typeof(chapter) <> 'object'
       or jsonb_typeof(chapter->'seconds') is distinct from 'number'
       or jsonb_typeof(chapter->'title') is distinct from 'string'
       or chapter - array['seconds', 'title'] <> '{}'::jsonb
       or chapter->>'seconds' !~ '^[0-9]{1,5}$'
       or length(btrim(chapter->>'title')) not between 1 and 160 then
      perform app_private.fail('Informe capítulos válidos.');
    end if;
    chapter_seconds := (chapter->>'seconds')::integer;
    if chapter_seconds <= previous_seconds or chapter_seconds > 86399 then
      perform app_private.fail('Informe capítulos em ordem crescente até 23:59:59.');
    end if;
    previous_seconds := chapter_seconds;
  end loop;

  perform app_private.throttle(actor_id, 'podcast_save', 20);
  -- Serializa a troca do destaque com outras edições e evita dois episódios fixados.
  perform pg_advisory_xact_lock(20261123, 22);
  if p_id is not null and not exists (
    select 1 from public.podcast_episodes where id = p_id and youtube_id = p_youtube_id
  ) then
    perform app_private.fail('Episódio indisponível ou vídeo alterado. Cadastre outro episódio para usar um novo vídeo.');
  end if;
  if p_is_featured then
    update public.podcast_episodes set is_featured = false where is_featured and id is distinct from p_id;
  end if;

  if p_id is null then
    insert into public.podcast_episodes (youtube_id, kind, title, description, published_at, status, is_featured, chapters, spotify_url)
    values (p_youtube_id, p_kind, btrim(p_title), p_description, p_published_at, p_status, p_is_featured, p_chapters, p_spotify_url)
    returning id into saved_id;
  else
    update public.podcast_episodes set kind = p_kind, title = btrim(p_title), description = p_description,
      published_at = p_published_at, status = p_status, is_featured = p_is_featured, chapters = p_chapters, spotify_url = p_spotify_url
    where id = p_id returning id into saved_id;
  end if;
  perform app_private.audit(actor_id, case when p_id is null then 'create' else 'update' end, 'podcast_episodes', saved_id);
  return jsonb_build_object('id', saved_id);
exception when unique_violation then
  get stacked diagnostics conflict_name = CONSTRAINT_NAME;
  if conflict_name <> 'podcast_episodes_youtube_id_key' then raise; end if;
  perform app_private.fail('Este vídeo já está cadastrado.');
  return null;
end $$;

revoke execute on function public.app_podcasts(integer, text, boolean), public.app_podcast(uuid, boolean),
  public.app_podcast_watch(uuid, boolean),
  public.app_admin_save_podcast(uuid, text, text, text, text, timestamptz, text, boolean, jsonb, text)
  from public, anon, authenticated, service_role;
grant execute on function public.app_podcasts(integer, text, boolean), public.app_podcast(uuid, boolean),
  public.app_podcast_watch(uuid, boolean),
  public.app_admin_save_podcast(uuid, text, text, text, text, timestamptz, text, boolean, jsonb, text)
  to authenticated;

commit;
