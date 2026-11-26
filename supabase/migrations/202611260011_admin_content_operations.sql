begin;

create or replace function public.app_admin_save_podcast(
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
    select 1 from public.podcast_episodes where id = p_id
  ) then
    perform app_private.fail('Episódio indisponível.');
  end if;
  if exists (select 1 from public.podcast_episodes where id=p_id and status='archived') then
    perform app_private.fail('Restaure o episódio antes de editar.');
  end if;
  if p_is_featured then
    update public.podcast_episodes set is_featured = false where is_featured and id is distinct from p_id;
  end if;

  if p_id is null then
    insert into public.podcast_episodes (youtube_id, kind, title, description, published_at, status, is_featured, chapters, spotify_url)
    values (p_youtube_id, p_kind, btrim(p_title), p_description, p_published_at, p_status, p_is_featured, p_chapters, p_spotify_url)
    returning id into saved_id;
  else
    update public.podcast_episodes set youtube_id = p_youtube_id, kind = p_kind, title = btrim(p_title), description = p_description,
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

revoke execute on function public.app_admin_save_podcast(uuid,text,text,text,text,timestamptz,text,boolean,jsonb,text) from public,anon,authenticated,service_role;
grant execute on function public.app_admin_save_podcast(uuid,text,text,text,text,timestamptz,text,boolean,jsonb,text) to authenticated;

create function public.app_admin_move_setting(p_collection text,p_id uuid,p_direction integer) returns boolean
language plpgsql security definer set search_path='' as $$
declare
 actor_id uuid;
 target_table regclass;
 changed integer;
begin
 if p_collection='spaces' then
  actor_id:=app_private.require_role(array['admin','moderator']);
  target_table:='public.spaces'::regclass;
 elsif p_collection='onboarding_questions' then
  actor_id:=app_private.require_role(array['admin']);
  target_table:='public.onboarding_questions'::regclass;
 else
  perform app_private.fail('Lista fora do cadastro.');
 end if;
 if p_id is null or p_direction is null or p_direction not in (-1,1) then
  perform app_private.fail('Informe o item e a direção da mudança.');
 end if;
 perform app_private.throttle(actor_id,'settings_order',30);
 -- A lista é curta e a mudança também precisa serializar com edições e novos registros.
 execute format('lock table %s in share row exclusive mode',target_table);
 execute format($order$
  with ranks as (
   select id,row_number() over(order by order_index,id) position from %1$s
  ), choice as (
   select current_item.position picked from ranks current_item join ranks neighbor
   on neighbor.position=current_item.position+$2 where current_item.id=$1
  ), new_ranks as (
   select id,case position when picked then position+$2-1
    when picked+$2 then position-$2-1 else position-1 end as position
   from ranks cross join choice
  )
  update %1$s as target set order_index=new_ranks.position from new_ranks
   where target.id=new_ranks.id and target.order_index is distinct from new_ranks.position
 $order$,target_table) using p_id,p_direction;
 get diagnostics changed=row_count;
 if changed>0 then perform app_private.audit(actor_id,'reorder',p_collection,p_id);end if;
 return changed>0;
end $$;
revoke execute on function public.app_admin_move_setting(text,uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.app_admin_move_setting(text,uuid,integer) to authenticated;
notify pgrst,'reload schema';

commit;
