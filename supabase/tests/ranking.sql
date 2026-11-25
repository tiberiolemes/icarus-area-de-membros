\set ON_ERROR_STOP on
begin;

create temporary table ranking_checks(name text primary key);
create temporary table ranking_sources(name text primary key, id uuid);
create temporary table previous_export(data jsonb);
grant insert on ranking_checks to authenticated, anon, service_role;
grant select, insert on ranking_sources to authenticated;
grant select on previous_export to authenticated;

create function pg_temp.ok(value boolean, name text) returns void language plpgsql as $$
begin
  if value is distinct from true then raise exception 'FAIL: %', name; end if;
  insert into ranking_checks values (name);
end $$;
create function pg_temp.denied(statement text, name text, code text) returns void language plpgsql as $$
begin
  begin
    execute statement;
  exception when others then
    if sqlstate <> code then raise; end if;
    perform pg_temp.ok(true, name);
    return;
  end;
  raise exception 'FAIL (autorizou): %', name;
end $$;
create function pg_temp.id(n integer) returns uuid language sql immutable as $$
  select ('03300000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;
create function pg_temp.source(label text) returns uuid language sql stable as $$
  select id from ranking_sources where name = label
$$;
create function pg_temp.login(n integer, session_owner integer default null) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object(
    'sub', pg_temp.id(n), 'role', 'authenticated', 'aal', 'aal2',
    'session_id', pg_temp.id(100 + coalesce(session_owner, n))
  )::text, true)
$$;

insert into auth.users(id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
select pg_temp.id(n), 'ranking-' || n || '@example.test', now(), '{"icarus_server_created":true}',
  jsonb_build_object('full_name', 'Membro ' || n)
from generate_series(1, 9) n;
set constraints all immediate;
insert into auth.sessions(id, user_id, created_at, updated_at, aal)
select pg_temp.id(100 + n), pg_temp.id(n), now(), now(), 'aal2' from generate_series(1, 9) n;
update public.profiles set phone = 'telefone sigiloso', bio = 'biografia privada',
  company = '{"name":"empresa privada"}' where id = pg_temp.id(1);
update public.profiles set role = 'admin' where id = pg_temp.id(4);
update public.profiles set role = 'moderator' where id = pg_temp.id(5);
update public.profiles set role = 'instructor' where id = pg_temp.id(6);
update public.profiles set role = 'support' where id = pg_temp.id(7);
update public.profiles set suspended = true where id = pg_temp.id(8);
update public.profiles set demo = true where id = pg_temp.id(9);
insert into public.plans(id, slug, name, price_cents, access_months)
values (pg_temp.id(199), 'ranking-fixture', 'Plano da fixture', 0, 12);
insert into public.subscriptions(user_id, plan_id, ends_at, source)
values (pg_temp.id(1), pg_temp.id(199), now() + interval '1 day', 'courtesy');

insert into public.spaces(id, name, status, access_mode) values (pg_temp.id(200), 'Fórum diagnóstico', 'published', 'members');
insert into public.courses(id, slug, title, status, access_mode, certificate_enabled, signer_name, signer_title)
values (pg_temp.id(300), 'ranking-diagnostico', 'Curso da fixture', 'published', 'members', true, 'Equipe da fixture', 'Instrutor');
insert into public.modules(id, course_id, slug, title, status)
values (pg_temp.id(301), pg_temp.id(300), 'base', 'Módulo da fixture', 'published');
insert into public.sections(id, module_id, title, status)
values (pg_temp.id(302), pg_temp.id(301), 'Seção da fixture', 'published');
insert into public.lessons(id, section_id, slug, title, status, type, duration_seconds)
values (pg_temp.id(303), pg_temp.id(302), 'primeira', 'Primeira', 'published', 'text', 120),
  (pg_temp.id(304), pg_temp.id(302), 'segunda', 'Segunda', 'published', 'text', 120);

select pg_temp.ok(not exists (select from pg_class
  where oid in ('app_private.ranking_events'::regclass, 'app_private.ranking_subjects'::regclass) and not relrowsecurity)
  and not exists (
    select from unnest(array['anon', 'authenticated', 'service_role']) r(role_name)
    where has_table_privilege(r.role_name, 'app_private.ranking_events', 'SELECT, INSERT, UPDATE, DELETE')
      or has_table_privilege(r.role_name, 'app_private.ranking_subjects', 'SELECT, INSERT, UPDATE, DELETE')
      or has_function_privilege(r.role_name, 'app_private.record_ranking_event()', 'EXECUTE')
      or has_function_privilege(r.role_name, 'app_private.register_ranking_subject()', 'EXECUTE')
      or has_function_privilege(r.role_name, 'app_private.export_data_before_ranking()', 'EXECUTE')
  ), 'RLS e ACL da trilha privada');

set local role anon;
select pg_temp.denied('select public.app_ranking()', 'anon não lê ranking', '42501');
select pg_temp.denied('select public.app_export_data()', 'anon não exporta eventos', '42501');
reset role;
set local role service_role;
select pg_temp.denied('select public.app_ranking()', 'service_role sem RPC de membro', '42501');
select pg_temp.denied('select public.app_export_data()', 'service_role não exporta eventos', '42501');
reset role;
set local role authenticated;
select pg_temp.denied('select public.app_ranking()', 'authenticated sem JWT', 'P0001');
select pg_temp.login(1, 2);
select pg_temp.denied('select public.app_ranking()', 'sessão do outro titular não autoriza', 'P0001');
select pg_temp.denied('select public.app_export_data()', 'sessão alheia não exporta eventos', 'P0001');
select pg_temp.login(8);
select pg_temp.denied('select public.app_ranking()', 'membro suspenso não lê ranking', 'P0001');
select pg_temp.login(1);
select pg_temp.denied('select public.app_ranking(null, 1)', 'período obrigatório', 'P0001');
select pg_temp.denied('select public.app_ranking(''futuro'', 1)', 'período fora da enumeração', 'P0001');
select pg_temp.denied('select public.app_ranking(''current'', 2147483647)', 'paginação limitada', 'P0001');
select pg_temp.denied('select * from app_private.ranking_events', 'membro não lê fontes ou identidades', '42501');
select pg_temp.denied('delete from app_private.ranking_events', 'membro não altera pontos', '42501');
select pg_temp.ok((select j->'prizes' = 'null' and j->'podium' = '[]'
    and j->'own' = '{"status":"unranked"}'
    and j->'rules' = '{"post":5,"reply":3,"like":1,"lesson":8,"certificate":15}'
  from (select public.app_ranking() j) s), 'vazio, sem premiação ou pontos fabricados e regras do PRD');
reset role;
update public.app_sessions set revoked_at = now() where id = pg_temp.id(101);
set local role authenticated;
select pg_temp.denied('select public.app_ranking()', 'sessão revogada não lê ranking', 'P0001');
select pg_temp.denied('select public.app_export_data()', 'sessão revogada não exporta eventos', 'P0001');
reset role;
update public.app_sessions set revoked_at = null where id = pg_temp.id(101);
set local role authenticated;

insert into ranking_sources
select 'post', (public.app_save_post(null, pg_temp.id(200), 'Post da fixture', 'Conteúdo reservado')->>'id')::uuid;
select pg_temp.ok(public.app_ranking()->'own'->>'status' = 'unranked', 'post pendente não pontua');
select pg_temp.denied(format('select public.app_moderate(''post'', %L, ''approve'', ''aprovação'')', pg_temp.source('post')),
  'membro não aprova conteúdo', 'P0001');
select pg_temp.login(5);
select public.app_moderate('post', pg_temp.source('post'), 'approve', 'aprovação');
select public.app_moderate('post', pg_temp.source('post'), 'approve', 'repetição');
select public.app_vote('post', pg_temp.source('post'));
select pg_temp.ok(public.app_ranking()->'own'->>'status' = 'excluded', 'moderador leitor sem colocação');
select pg_temp.login(4);
insert into ranking_sources
select 'staff_post', (public.app_save_post(null, pg_temp.id(200), 'Post da equipe', 'Ação da equipe')->>'id')::uuid;
select public.app_moderate('post', pg_temp.source('staff_post'), 'approve', 'aprovação');
select pg_temp.ok(public.app_ranking()->'own'->>'status' = 'excluded', 'admin autor fora do ranking');
select pg_temp.login(6);
select public.app_progress(pg_temp.id(303), 120, true);
select pg_temp.ok(public.app_ranking()->'own'->>'status' = 'excluded', 'instrutor concluinte fora do ranking');
select pg_temp.login(7);
select pg_temp.ok(public.app_ranking()->'own'->>'status' = 'excluded', 'suporte fora do ranking');

select pg_temp.login(1);
select public.app_vote('post', pg_temp.source('post'));
select pg_temp.ok(public.app_ranking()->'own'->>'points' = '5', 'aprovação repetida, curtida da equipe e autocurtida');
select pg_temp.login(9);
select public.app_vote('post', pg_temp.source('post'));
select public.app_progress(pg_temp.id(303), 120, true);
select pg_temp.ok(jsonb_array_length(public.app_ranking()->'podium') = 1, 'demonstração só vê o próprio grupo');
select pg_temp.login(2);
insert into ranking_sources select 'reply', (public.app_reply(pg_temp.source('post'), 'Resposta da fixture')->>'id')::uuid;
select public.app_vote('post', pg_temp.source('post'));
select public.app_vote('post', pg_temp.source('post'));
select pg_temp.login(1);
select pg_temp.ok(public.app_ranking()->'own'->>'points' = '5', 'retirar curtida estorna');
select pg_temp.login(2);
select public.app_vote('post', pg_temp.source('post'));
select pg_temp.login(5);
select public.app_moderate('reply', pg_temp.source('reply'), 'approve', 'aprovação');
select public.app_moderate('reply', pg_temp.source('reply'), 'approve', 'repetição');
select pg_temp.login(1);
select public.app_vote('reply', pg_temp.source('reply'));
select public.app_progress(pg_temp.id(303), 60, false);
select pg_temp.ok(public.app_ranking()->'own'->>'points' = '6', 'reativar curtida concede um ponto; progresso parcial não pontua');
select public.app_progress(pg_temp.id(303), 120, true);
select public.app_progress(pg_temp.id(303), 120, true);
select pg_temp.ok(public.app_ranking()->'own'->>'points' = '14', 'primeira conclusão via UPDATE pontua uma vez');
select public.app_progress(pg_temp.id(304), 120, true);
select public.app_issue_certificate(pg_temp.id(300));
select pg_temp.ok(public.app_ranking()->'own'->>'points' = '37', 'conclusão via INSERT e emissão de certificado pontuam uma vez');
select pg_temp.login(3);
select public.app_progress(pg_temp.id(303), 120, true);
select pg_temp.ok((select j->'podium' =
  '[{"position":1,"points":37,"tied":false,"is_self":false},
    {"position":2,"points":8,"tied":false,"is_self":true},
    {"position":3,"points":3,"tied":false,"is_self":false}]'
  and j->'own' = '{"status":"ranked","position":2,"points":8,"tied":false}'
  from (select public.app_ranking() j) s), 'pódio, própria posição e projeção mínima conferidos no JSON');
select pg_temp.login(5);
select public.app_moderate('post', pg_temp.source('post'), 'remove', 'remoção');
select pg_temp.login(1);
select pg_temp.ok(public.app_ranking()->'own'->>'points' = '31', 'remoção estorna post e curtida');
select pg_temp.login(2);
select pg_temp.ok(public.app_ranking()->'own'->>'status' = 'unranked', 'remoção do pai estorna resposta');
select pg_temp.login(5);
select public.app_moderate('post', pg_temp.source('post'), 'approve', 'restauração');
select pg_temp.login(1);
select public.app_archive_post(pg_temp.source('post'), true);
select pg_temp.ok(public.app_ranking()->'own'->>'points' = '31', 'arquivar tira post e curtida');
select public.app_archive_post(pg_temp.source('post'), false);

savepoint export_scope;
select pg_temp.login(2);
select public.app_vote('post', pg_temp.source('post'));
select pg_temp.ok(public.app_export_data()->'ranking_events' = jsonb_build_array(
  jsonb_build_object('kind','like','occurred_at',now(),'relation','actor'),
  jsonb_build_object('kind','reply','occurred_at',now(),'relation','recipient')
), 'titular exporta curtida própria desfeita e resposta, sem identidades ou fontes de terceiros');
select pg_temp.login(4);
select pg_temp.ok(public.app_export_data()->'ranking_events' = '[]', 'administrador não exporta eventos alheios');
reset role;
select pg_temp.login(1);
insert into previous_export select app_private.export_data_before_ranking();
set local role authenticated;
with exported as materialized (select public.app_export_data() data)
select pg_temp.ok(data - 'ranking_events' = (select data from previous_export)
  and data ? 'podcast_watches' and (to_regclass('public.feedbacks') is null or data ? 'feedbacks'),
  'export conserva integralmente o contrato anterior'),
  pg_temp.ok(data->'ranking_events' = (
    select jsonb_agg(jsonb_build_object('kind', kind, 'occurred_at', now(), 'relation', 'recipient') order by n)
    from unnest(array['certificate','lesson','lesson','like','post']) with ordinality as items(kind,n)
  ), 'destinatário exporta as ocorrências próprias, inclusive a curtida retirada, sem identificar quem curtiu')
from exported;
rollback to savepoint export_scope;

reset role;
select pg_temp.ok((select count(*) = 7 from app_private.ranking_events where recipient_id <> pg_temp.id(9)),
 'aprovações, curtida reativada, conclusão e emissão deixam uma linha por ocorrência');
update public.certificates set revoked_at = now() where user_id = pg_temp.id(1);
update app_private.ranking_events
set occurred_at = (date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo') - interval '1 microsecond'
where kind = 'like';
update app_private.ranking_events
set occurred_at = date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'
where kind = 'post';

set local role authenticated;
select pg_temp.login(1);
select pg_temp.ok((select j->'own'->>'points' = '21' and j->>'time_zone' = 'America/Sao_Paulo'
  from (select public.app_ranking('current') j) s), 'virada inclui início do mês e revogação estorna certificado');
select pg_temp.ok(public.app_ranking('previous')->'own'->>'points' = '1', 'virada deixa a curtida anterior no mês anterior');
select pg_temp.ok(public.app_ranking('overall')->'own'->>'points' = '22', 'geral agrega sem duplicar entre meses');
select pg_temp.login(2);
select public.app_progress(pg_temp.id(303), 120, true);
select pg_temp.login(3);
select public.app_progress(pg_temp.id(304), 120, true);
-- Uma amostra adicional de empate é criada sem sobrescrever eventos de negócio.
reset role;
update app_private.ranking_events set occurred_at = now() - interval '2 months' where
  (kind in ('post', 'reply', 'certificate')) or (kind = 'lesson' and source_id = pg_temp.id(304));
insert into auth.users(id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
select pg_temp.id(n), 'ranking-' || n || '@example.test', now(), '{"icarus_server_created":true}',
  jsonb_build_object('full_name', 'Membro ' || n) from generate_series(10, 27) n;
insert into public.lesson_progress(user_id, lesson_id, completed_at)
select pg_temp.id(n), pg_temp.id(303), now() from generate_series(10, 27) n;
set local role authenticated;
select pg_temp.login(2);
select pg_temp.ok((select j->'own' = '{"status":"ranked","position":1,"points":8,"tied":true}'
  and j->'podium' = '[]' and jsonb_array_length(j->'items') = 20 and j->>'total' = '21'
  from (select public.app_ranking('current') j) s where j->'items' @> '[{"position":1,"tied":true}]'),
  'empates preservam posição compartilhada e não decidem pódio');
select pg_temp.ok((select jsonb_array_length(j->'items') = 1 and j->>'page' = '2' and j->>'total' = '21'
  and j->'items'->0 = '{"position":1,"points":8,"tied":true,"is_self":false}'
  and j->'own'->>'position' = '1'
  from (select public.app_ranking('current', 2) j) s), 'paginação estável e colocação própria fora da página');
select pg_temp.ok((select j->'own'->>'points' = '8' and j->>'page' = '2'
  from (select public.app_ranking('custom',2,(now() at time zone 'America/Sao_Paulo')::date,
    (now() at time zone 'America/Sao_Paulo')::date) j) s), 'intervalo personalizado preserva pontos e paginação');
select pg_temp.ok((public.app_ranking('custom',1,date '2001-01-01',date '2001-01-01')->'own'->>'status') = 'unranked',
  'intervalo histórico exclui pontos recentes');
reset role;

insert into auth.users(id, email, email_confirmed_at, raw_app_meta_data)
select pg_temp.id(n), 'ranking-' || n || '@example.test', now(), '{"icarus_server_created":true}'
from generate_series(28, 30) n;
insert into public.posts(id, space_id, author_id, title, body)
values (pg_temp.id(202), pg_temp.id(200), pg_temp.id(28), 'Post para expurgo', 'Fixture');
update public.posts set status = 'approved' where id = pg_temp.id(202);
insert into public.votes(actor_id, post_id)
values (pg_temp.id(29), pg_temp.id(202)), (pg_temp.id(30), pg_temp.id(202));
delete from public.votes where actor_id = pg_temp.id(29);
select pg_temp.ok(exists (select from app_private.ranking_events where actor_id = pg_temp.id(29)),
 'a trilha permanece após apagar o voto de origem');
delete from public.profiles where id = pg_temp.id(29);
delete from auth.users where id = pg_temp.id(29);
select pg_temp.ok(not exists (select from app_private.ranking_events where actor_id = pg_temp.id(29))
  and (select count(*) = 2 from app_private.ranking_events where recipient_id = pg_temp.id(28)),
  'excluir o autor da curtida expurga apenas seu vínculo mesmo com o destinatário ativo');
delete from public.votes where post_id = pg_temp.id(202);
delete from public.posts where id = pg_temp.id(202);
delete from public.profiles where id = pg_temp.id(28);
delete from auth.users where id = pg_temp.id(28);
select pg_temp.ok(not exists (select from app_private.ranking_events
  where recipient_id in (pg_temp.id(28), pg_temp.id(29)) or actor_id in (pg_temp.id(28), pg_temp.id(29)))
  and not exists (select from app_private.ranking_subjects where profile_id in (pg_temp.id(28), pg_temp.id(29)))
  and exists (select from public.profiles where id = pg_temp.id(30))
  and exists (select from app_private.ranking_events where recipient_id = pg_temp.id(1)),
  'excluir o destinatário expurga o post e a curtida recebida e preserva os demais titulares');

select count(*) from ranking_checks;
rollback;
