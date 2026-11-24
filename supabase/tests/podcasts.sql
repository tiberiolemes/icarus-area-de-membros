\set ON_ERROR_STOP on
begin;

create temporary table podcast_results (name text primary key);
create temporary table podcast_ids (label text primary key, id uuid not null);
grant all on podcast_results, podcast_ids to authenticated;
create function pg_temp.assert(ok boolean, name text) returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'FAIL: %', name; end if;
  insert into podcast_results values (name);
end $$;
create function pg_temp.denied(statement text, expected text, name text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when sqlstate 'P0001' then
    perform pg_temp.assert(sqlerrm = expected, name);
    return;
  end;
  raise exception 'FAIL: %', name;
end $$;
create function pg_temp.uid(n integer) returns uuid language sql as $$
  select ('22000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;
create function pg_temp.login(n integer, aal text default 'aal2') returns void language sql as $$
  select set_config('request.jwt.claims',
    jsonb_build_object('sub', pg_temp.uid(n), 'role', 'authenticated', 'aal', aal, 'session_id', pg_temp.uid(n+10))::text,
    true)
$$;
create function pg_temp.save(video text, state text, featured boolean default false, chapters jsonb default '[]',
  spotify text default null, existing uuid default null) returns uuid language sql as $$
  select (public.app_admin_save_podcast(existing, video, 'podcast', 'Demonstração ' || video, 'Descrição',
    '2026-11-24T00:00:00-03:00', state, featured, chapters, spotify)->>'id')::uuid
$$;
create function pg_temp.episode(label text) returns uuid language sql as $$
  select id from podcast_ids where podcast_ids.label = $1
$$;

insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
select pg_temp.uid(n), 'podcast-test-' || n || '@example.test', now(), '{"icarus_server_created":true}',
  jsonb_build_object('full_name','Demonstração ' || n) from generate_series(1,4) n;
set constraints all immediate;
update public.ica_profiles set role = 'admin' where id = pg_temp.uid(1);
update public.ica_profiles set role = 'instructor' where id = pg_temp.uid(4);
insert into auth.mfa_factors(id,user_id,friendly_name,factor_type,status,created_at,updated_at)
values(pg_temp.uid(21),pg_temp.uid(1),'Demonstração','totp','verified',now(),now());
insert into auth.sessions(id,user_id,created_at,updated_at,aal)
select pg_temp.uid(n+10), pg_temp.uid(n), now(), now(), 'aal2' from generate_series(1,4) n;

select pg_temp.assert((
  select count(*) = 4 and bool_and(not has_function_privilege('anon', oid, 'EXECUTE')
    and not has_function_privilege('service_role', oid, 'EXECUTE')
    and has_function_privilege('authenticated', oid, 'EXECUTE')
    and prosecdef and proconfig = array['search_path=""'])
  from pg_proc where pronamespace='public'::regnamespace
    and proname in ('app_podcasts','app_podcast','app_podcast_watch','app_admin_save_podcast')
), 'RPCs: ACL mínimo e search_path vazio');
select pg_temp.assert((
  select count(*) = 2 and bool_and(relrowsecurity
    and not has_table_privilege('authenticated', oid, 'SELECT, INSERT, UPDATE, DELETE')
    and not has_table_privilege('anon', oid, 'SELECT, INSERT, UPDATE, DELETE')
    and not has_table_privilege('service_role', oid, 'SELECT, INSERT, UPDATE, DELETE'))
  from pg_class where relnamespace='public'::regnamespace and relname in ('ica_podcast_episodes','ica_podcast_watches')
), 'tabelas: RLS e acesso direto fechado');

select pg_temp.login(1);
set local role authenticated;
insert into podcast_ids values ('draft', pg_temp.save('00000000001','draft'));
insert into podcast_ids values ('first', pg_temp.save('00000000002','published',true,
  '[{"seconds":0,"title":"Abertura"},{"seconds":540,"title":"Capítulo"}]',
  'https://open.spotify.com/episode/0000000000000000000001'));
select pg_temp.assert(public.app_podcasts()->>'featured_id' = pg_temp.episode('first')::text, 'destaque publicado');
select pg_temp.denied($q$select pg_temp.save('00000000002','published',true)$q$, 'Este vídeo já está cadastrado.', 'vídeo único');
select pg_temp.assert(public.app_podcasts()->>'featured_id' = pg_temp.episode('first')::text, 'falha preserva destaque');
select pg_temp.denied($q$select pg_temp.save('x"><iframe','published')$q$, 'Informe um vídeo válido do YouTube.', 'vídeo inválido');
select pg_temp.denied($q$select pg_temp.save('00000000004','draft',true)$q$,
  'Confira os dados do episódio. Somente episódios publicados podem ficar em destaque.', 'destaque de rascunho');
select pg_temp.denied($q$select pg_temp.save('00000000004','published',false,'[{"seconds":3,"title":"A"},{"seconds":1,"title":"B"}]')$q$,
  'Informe capítulos em ordem crescente até 23:59:59.', 'capítulos fora de ordem');
select pg_temp.denied($q$select pg_temp.save('00000000004','published',false,'[{"seconds":3,"title":"A","html":"x"}]')$q$,
  'Informe capítulos válidos.', 'campos de capítulo limitados');
select pg_temp.denied($q$select pg_temp.save('00000000004','published',false,'[]','https://open.spotify.com.evil.test/episode/0000000000000000000001')$q$,
  'Informe o link de um episódio em open.spotify.com.', 'origem do Spotify exata');
insert into podcast_ids values ('second', pg_temp.save('00000000003','published',true));
select pg_temp.assert(public.app_podcasts()->>'featured_id' = pg_temp.episode('second')::text, 'troca de destaque');
select pg_temp.assert((public.app_podcast(pg_temp.episode('first'))->>'is_featured')::boolean = false, 'destaque anterior removido');
select pg_temp.assert(public.app_podcast(pg_temp.episode('draft'),true)->>'status' = 'draft', 'admin abre rascunho');
select pg_temp.assert((public.app_podcasts(p_admin=>true)->>'total')::int = 3, 'listagem administrativa inclui rascunho');
select pg_temp.denied($q$select pg_temp.save('00000000004','published',false,'[]',null,pg_temp.episode('first'))$q$,
  'Episódio indisponível ou vídeo alterado. Cadastre outro episódio para usar um novo vídeo.', 'ID do vídeo imutável');
reset role;

insert into public.ica_podcast_episodes (youtube_id, kind, title, description, published_at, status)
select 'paged_' || lpad(n::text,5,'0'), 'masterclass', 'Masterclass paginada ' || n, '', '2026-12-01T00:00:00Z'::timestamptz + make_interval(days=>n), 'published'
from generate_series(1,21) n;

select pg_temp.login(2);
set local role authenticated;
select pg_temp.assert(jsonb_array_length(public.app_podcasts()->'items') = 20, 'limite de 20');
select pg_temp.assert((public.app_podcasts(2)->>'total')::integer = 23
  and jsonb_array_length(public.app_podcasts(2)->'items') = 3
  and public.app_podcasts()->'items'->0->>'title' = 'Masterclass paginada 21', 'página 2 e ordem por data');
select pg_temp.assert((public.app_podcasts(p_query=>'00000000002')->>'total')::integer = 1, 'busca antes do limite');
select pg_temp.denied('select public.app_podcasts(10001)', 'Confira a página ou o termo de busca.', 'limite de offset');
select pg_temp.denied('select public.app_podcasts(p_admin=>true)', 'Acesso administrativo indisponível.', 'membro não lista rascunhos');
select pg_temp.denied($q$select public.app_podcast(pg_temp.episode('draft'),true)$q$, 'Acesso administrativo indisponível.', 'membro não abre detalhe admin');
select pg_temp.denied($q$select public.app_podcast(pg_temp.episode('draft'))$q$, 'Episódio indisponível.', 'rascunho invisível');
select pg_temp.denied($q$select public.app_podcast_watch(pg_temp.episode('draft'),true)$q$, 'Episódio indisponível.', 'rascunho não recebe marcação');
select pg_temp.assert((public.app_podcast(pg_temp.episode('first'))->'chapters'->1->>'seconds')::integer = 540, 'detalhe entrega capítulos');
select pg_temp.assert((public.app_podcast_watch(pg_temp.episode('first'),true)->>'watched')::boolean, 'marca assistido');
select pg_temp.assert((public.app_podcast_watch(pg_temp.episode('first'),true)->>'watched')::boolean, 'repetição idempotente');
select pg_temp.assert((public.app_podcast(pg_temp.episode('first'))->>'watched')::boolean, 'detalhe mantém marcação');
select pg_temp.login(3);
select pg_temp.assert(not (public.app_podcast(pg_temp.episode('first'))->>'watched')::boolean, 'segundo membro tem progresso próprio');
select pg_temp.assert(not (public.app_podcast_watch(pg_temp.episode('first'),false)->>'watched')::boolean, 'outro membro não remove marcação alheia');
select pg_temp.login(2);
select pg_temp.assert((public.app_podcast(pg_temp.episode('first'))->>'watched')::boolean, 'marcação do titular preservada');
select pg_temp.login(1);
select pg_temp.save('00000000002','draft',false,'[]',null,pg_temp.episode('first'));
select pg_temp.login(2);
select pg_temp.denied($q$select public.app_podcast(pg_temp.episode('first'))$q$, 'Episódio indisponível.', 'despublicação retira episódio');
select pg_temp.login(1);
select pg_temp.save('00000000002','published',false,'[]',null,pg_temp.episode('first'));
select pg_temp.login(2);
select pg_temp.assert((public.app_podcast(pg_temp.episode('first'))->>'watched')::boolean, 'republicação preserva marcação');
select pg_temp.assert(not (public.app_podcast_watch(pg_temp.episode('first'),false)->>'watched')::boolean, 'desmarca assistido');
select pg_temp.login(4);
select pg_temp.denied($q$select pg_temp.save('00000000004','published')$q$, 'Acesso administrativo indisponível.', 'instrutor não publica');
select pg_temp.login(1, 'aal1');
select pg_temp.denied('select public.app_podcasts(p_admin=>true)', 'Confirme o segundo fator para continuar.', 'admin sem segundo fator negado');
reset role;

update public.ica_app_sessions set revoked_at = now() where id = pg_temp.uid(12);
select pg_temp.login(2);
set local role authenticated;
select pg_temp.denied('select public.app_podcasts()', 'Sessão expirada. Entre novamente.', 'sessão revogada negada');
reset role;

select count(*) from podcast_results;
rollback;
