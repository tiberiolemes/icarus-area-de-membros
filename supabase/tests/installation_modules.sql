\set ON_ERROR_STOP on
begin;

create temporary table results (name text primary key);
grant all on results to anon, authenticated, service_role;
create function pg_temp.ok(condition boolean, name text) returns void language plpgsql as $$
begin
  if condition is distinct from true then raise exception 'Falhou: %', name; end if;
  insert into results values (name);
end $$;
-- Recusa com o código esperado e, para P0001, com a mensagem esperada.
create function pg_temp.denied(statement text, code text, name text, message text default null) returns void language plpgsql as $$
begin
  begin
    execute statement;
  exception when others then
    perform pg_temp.ok(sqlstate = code and (message is null or sqlerrm = message), name || ' (' || sqlstate || ': ' || sqlerrm || ')');
    return;
  end;
  raise exception 'Operação permitida: %', name;
end $$;
create function pg_temp.off(statement text, name text) returns void language sql as $$
  select pg_temp.denied(statement, 'P0001', name, 'Este recurso está desativado nesta plataforma.')
$$;

create temporary table actors as
select role, gen_random_uuid() as actor_id, gen_random_uuid() as session_id
from unnest(array['admin', 'member', 'moderator', 'support', 'instructor']) as role;
grant select on actors to anon, authenticated, service_role;
insert into auth.users(id, email, email_confirmed_at, aud, role, raw_app_meta_data, raw_user_meta_data)
select actor_id, actor_id || '@example.test', now(), 'authenticated', 'authenticated', '{"icarus_server_created":true}', jsonb_build_object('full_name', 'DEMONSTRAÇÃO ' || role) from actors;
update public.profiles p set role = a.role, onboarding_complete = true from actors a where p.id = a.actor_id;
insert into auth.sessions(id, user_id, created_at, updated_at, aal) select session_id, actor_id, now(), now(), 'aal2' from actors;
insert into public.app_sessions(id, user_id, expires_at) select session_id, actor_id, now() + interval '1 hour' from actors;
insert into auth.mfa_factors(id, user_id, friendly_name, factor_type, status, created_at, updated_at)
select gen_random_uuid(), actor_id, 'Demonstração', 'totp', 'verified', now(), now() from actors where role = 'admin';
create function pg_temp.id(actor_role text) returns uuid language sql as $$ select actor_id from actors where role = actor_role $$;
create function pg_temp.login(actor_role text, aal text default 'aal2') returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', actor_id, 'session_id', session_id, 'aal', aal, 'role', 'authenticated')::text, true)
  from actors where role = actor_role
$$;
create function pg_temp.service(actor_role text) returns void language sql as $$
  select set_config('request.headers', jsonb_build_object('x-icarus-session-id', session_id, 'x-icarus-aal', 'aal2')::text, true) from actors where role = actor_role
$$;

-- Um conteúdo de cada módulo, todos acessíveis ao aluno com o módulo ligado.
create temporary table fixture as select gen_random_uuid() plan, gen_random_uuid() course, gen_random_uuid() lesson, gen_random_uuid() space, gen_random_uuid() post,
  gen_random_uuid() folder, gen_random_uuid() library_material, gen_random_uuid() lesson_material, gen_random_uuid() episode, gen_random_uuid() live_event;
grant select on fixture to anon, authenticated, service_role;
insert into public.plans(id, name, slug, price_cents, access_months, active) select plan, 'DEMONSTRAÇÃO módulos', 'demo-modulos', 10000, 12, true from fixture;
insert into public.subscriptions(user_id, plan_id, starts_at, ends_at, source) select pg_temp.id('member'), plan, now() - interval '1 day', now() + interval '1 month', 'courtesy' from fixture;
insert into public.courses(id, slug, title, status, access_mode, certificate_enabled, signer_name, signer_title)
select course, 'modulos-curso', 'DEMONSTRAÇÃO módulos', 'published', 'subscribers', true, 'DEMONSTRAÇÃO responsável', 'Coordenação' from fixture;
insert into public.modules(id, course_id, slug, title, status) select gen_random_uuid(), course, 'modulo', 'Módulo', 'published' from fixture;
insert into public.sections(id, module_id, title, status) select gen_random_uuid(), m.id, 'Seção', 'published' from public.modules m join fixture f on m.course_id = f.course;
insert into public.lessons(id, section_id, slug, title, duration_seconds, status) select f.lesson, s.id, 'aula', 'Aula', 60, 'published' from public.sections s join public.modules m on m.id = s.module_id join fixture f on m.course_id = f.course;
insert into public.lesson_progress(user_id, lesson_id, position_seconds, completed_at) select pg_temp.id('member'), lesson, 60, now() from fixture;
insert into public.spaces(id, name, status, access_mode) select space, 'DEMONSTRAÇÃO espaço', 'published', 'members' from fixture;
insert into public.posts(id, space_id, author_id, title, body, status) select post, space, pg_temp.id('member'), 'DEMONSTRAÇÃO publicação', 'Corpo', 'approved' from fixture;
insert into public.material_folders(id, name, status, access_mode) select folder, 'DEMONSTRAÇÃO pasta', 'published', 'members' from fixture;
insert into public.materials(id, folder_id, name, status, access_mode) select library_material, folder, 'DEMONSTRAÇÃO material', 'published', 'members' from fixture;
insert into public.materials(id, name, status, access_mode) select lesson_material, 'DEMONSTRAÇÃO anexo da aula', 'published', 'members' from fixture;
insert into public.material_lessons(material_id, lesson_id) select lesson_material, lesson from fixture;
insert into public.podcast_episodes(id, youtube_id, kind, title, description, published_at, status) select episode, 'abcdefghijk', 'podcast', 'DEMONSTRAÇÃO episódio', '', now() - interval '1 day', 'published' from fixture;
insert into public.live_events(id, title, guest, starts_at, duration_minutes, meeting_url, access_mode, status)
select live_event, 'DEMONSTRAÇÃO encontro', 'Convidado', now() + interval '1 day', 60, 'https://meet.google.com/aab-bbcd-eee', 'members', 'published' from fixture;

-- Grants e tabela fechada.
select pg_temp.ok(not has_table_privilege(r, 'app_private.installation_modules', 'SELECT,INSERT,UPDATE,DELETE'), 'Tabela de módulos fechada para ' || r) from unnest(array['anon', 'authenticated', 'service_role']) r;
select pg_temp.ok(has_function_privilege('authenticated', 'public.app_admin_set_module(text,boolean)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.app_admin_set_module(text,boolean)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.app_admin_set_module(text,boolean)', 'EXECUTE'), 'Só autenticado executa a troca de módulo');
select pg_temp.ok(not has_function_privilege(r, f, 'EXECUTE'), 'Helper ' || f || ' fechado para ' || r)
from unnest(array['anon', 'authenticated', 'service_role']) r,
  unnest(array['app_private.module_enabled(text)', 'app_private.module_open(uuid,text)', 'app_private.require_module(uuid,text)', 'app_private.modules_json()']) f;

-- Padrão: tudo ligado, exposto só como booleanos.
set local role anon;
select pg_temp.ok(public.app_public_context()->'modules' = '{"community":true,"materials":true,"podcasts":true,"ranking":true,"live_events":true,"support":true,"help":true,"feedback":true}', 'Contexto público com os oito módulos ligados');
select pg_temp.denied($q$select public.app_admin_set_module('ranking', false)$q$, '42501', 'Anônimo não troca módulo');
reset role;

set local role authenticated;
select pg_temp.login('member');
select pg_temp.ok(public.app_bootstrap() #> '{settings,modules}' = public.app_public_context()->'modules', 'Bootstrap traz os mesmos booleanos');
select pg_temp.ok((select bool_and(jsonb_typeof(value) = 'boolean') from jsonb_each(public.app_bootstrap() #> '{settings,modules}')), 'Só booleanos no bootstrap');
do $$
declare actor_role text;
begin
  foreach actor_role in array array['member', 'moderator', 'support', 'instructor'] loop
    perform pg_temp.login(actor_role);
    perform pg_temp.denied($q$select public.app_admin_set_module('ranking', false)$q$, 'P0001', actor_role || ' não troca módulo');
  end loop;
end $$;
select pg_temp.login('admin', 'aal1');
select pg_temp.denied($q$select public.app_admin_set_module('ranking', false)$q$, 'P0001', 'Admin com 2FA precisa de AAL2');
select pg_temp.login('admin');
select pg_temp.denied($q$select public.app_admin_set_module('courses', false)$q$, 'P0001', 'Cursos não é desligável', 'Módulo indisponível.');
select pg_temp.denied($q$select public.app_admin_set_module('certificates', false)$q$, 'P0001', 'Certificados é núcleo e não é desligável', 'Módulo indisponível.');
select pg_temp.denied($q$select public.app_admin_set_module('ranking', null)$q$, 'P0001', 'Estado obrigatório');

-- O aluno usa todos os módulos antes de desligar.
select pg_temp.login('member');
select pg_temp.ok((public.app_feed()->>'total')::int = 1, 'Feed com a publicação');
select public.app_create_ticket('Chamado de módulos', 'normal', 'Mensagem')->>'id' as ticket \gset
select pg_temp.ok(:'ticket' is not null, 'Aluno abre ticket');
select pg_temp.ok((public.app_tickets()->>'total')::int = 1, 'Aluno vê o ticket');
select pg_temp.ok(public.app_materials(null, '', 1)->'folders' <> '[]', 'Biblioteca com a pasta');
select pg_temp.ok((public.app_podcasts()->>'total')::int = 1, 'Acervo com o episódio');
select pg_temp.ok(jsonb_array_length(public.app_live_events()->'items') = 1, 'Agenda com o encontro');
select pg_temp.ok(public.app_ranking() ? 'items', 'Ranking responde');
select pg_temp.ok(jsonb_array_length(public.app_certificates()->'courses') = 1, 'Certificados respondem');
select pg_temp.ok(public.app_help_feedback('/ajuda/cursos', 'rate', true)->>'ok' = 'true', 'Artigo de ajuda recebe avaliação');
reset role;
select pg_temp.ok(app_private.material_access(pg_temp.id('member'), (select library_material from fixture)), 'Material da biblioteca liberado');
select pg_temp.ok(exists(select 1 from app_private.notification_preference_items(pg_temp.id('member')) i where i->>'event_key' = 'certificate_issued'), 'Preferência de certificado listada');
select count(*) as audit_before from public.audit_events \gset

-- Admin desliga os oito; a auditoria registra cada troca e repetir não duplica.
set local role authenticated;
select pg_temp.login('admin');
select pg_temp.ok(public.app_admin_set_module(k, false) ->> k = 'false', 'Admin desliga ' || k)
from unnest(array['community', 'materials', 'podcasts', 'ranking', 'live_events', 'support', 'help', 'feedback']) k;
select pg_temp.ok(public.app_admin_set_module('ranking', false) ->> 'ranking' = 'false', 'Desligar de novo é idempotente');
reset role;
select pg_temp.ok((select count(*) from public.audit_events) = :audit_before + 8, 'Oito trocas auditadas');
select pg_temp.ok(exists(select 1 from public.audit_events where actor_id = pg_temp.id('admin') and action = 'disable' and target_type = 'module_community'), 'Auditoria com ação e módulo');
set local role anon;
select pg_temp.ok((select bool_and(not value::boolean) from jsonb_each_text(public.app_public_context()->'modules')), 'Contexto público com tudo desligado');
reset role;

-- Aluno: cada RPC do módulo desligado recusa no servidor.
set local role authenticated;
select pg_temp.login('member');
select pg_temp.off($q$select public.app_feed()$q$, 'Comunidade: feed');
select pg_temp.denied(format('select public.app_post(%L)', (select post from fixture)), 'P0001', 'Comunidade: publicação');
select pg_temp.denied(format('select public.app_save_post(null, %L, %L, %L)', (select space from fixture), 'Título', 'Corpo'), 'P0001', 'Comunidade: publicar');
select pg_temp.denied(format('select public.app_reply(%L, %L)', (select post from fixture), 'Resposta'), 'P0001', 'Comunidade: responder');
select pg_temp.denied(format('select public.app_vote(%L, %L)', 'post', (select post from fixture)), 'P0001', 'Comunidade: curtir');
select pg_temp.denied(format('select public.app_report(%L, %L, %L)', 'post', (select post from fixture), 'Motivo'), 'P0001', 'Comunidade: denunciar');
select pg_temp.off($q$select public.app_materials(null, '', 1)$q$, 'Materiais: biblioteca');
select pg_temp.off($q$select public.app_podcasts()$q$, 'Podcasts: acervo');
select pg_temp.off(format('select public.app_podcast(%L)', (select episode from fixture)), 'Podcasts: episódio');
select pg_temp.off(format('select public.app_podcast_watch(%L, true)', (select episode from fixture)), 'Podcasts: marcar assistido');
-- Certificados é núcleo: lista e emissão seguem com todos os módulos desligados.
select pg_temp.ok(jsonb_array_length(public.app_certificates()->'courses') = 1, 'Certificados seguem com tudo desligado');
select pg_temp.off($q$select public.app_ranking()$q$, 'Ranking: classificação');
select pg_temp.off($q$select public.app_ranking('custom', 1, current_date - 7, current_date)$q$, 'Ranking: período personalizado');
select pg_temp.off($q$select public.app_live_events()$q$, 'Encontros: agenda');
select pg_temp.off(format('select public.app_live_event_rsvp(%L, true)', (select live_event from fixture)), 'Encontros: presença');
select pg_temp.off(format('select public.app_live_event_link(%L, false)', (select live_event from fixture)), 'Encontros: link da sala');
select pg_temp.off($q$select public.app_tickets()$q$, 'Suporte: lista');
select pg_temp.off($q$select public.app_create_ticket('Outro chamado', 'normal', 'Mensagem')$q$, 'Suporte: abrir ticket');
select pg_temp.denied(format('select public.app_ticket(%L)', :'ticket'), 'P0001', 'Suporte: ticket');
select pg_temp.denied(format('select public.app_ticket_reply(%L, %L)', :'ticket', 'Resposta'), 'P0001', 'Suporte: responder');
select pg_temp.off($q$select public.app_help_feedback('/ajuda/cursos', 'rate', true)$q$, 'Ajuda: avaliar artigo');
select pg_temp.ok(public.app_help_feedback('/app/cursos', 'start')->>'ok' = 'true', 'Guia da tela continua registrando');
select pg_temp.off(format('select public.app_submit_feedback(%L, %L, %L)', gen_random_uuid(), 'suggestion', 'Sugestão'), 'Feedback: enviar');
select pg_temp.ok((select jsonb_array_length(e->'posts') = 1 and jsonb_array_length(e->'ticket_messages') = 1 from (select public.app_export_data() e) x), 'Exportação LGPD mantém posts e tickets');
reset role;
select pg_temp.ok(not app_private.material_access(pg_temp.id('member'), (select library_material from fixture)), 'Materiais: download da biblioteca bloqueado');
select pg_temp.ok(app_private.material_access(pg_temp.id('member'), (select lesson_material from fixture)), 'Anexo da aula continua com Cursos');
select pg_temp.ok(exists(select 1 from app_private.notification_preference_items(pg_temp.id('member')) i where i->>'event_key' = 'certificate_issued'), 'Preferência de certificado continua');

-- Edges: as RPCs de serviço recusam pelo mesmo bloqueio.
set local role service_role;
select pg_temp.service('member');
select pg_temp.denied(format('select public.app_upload_access(%L, %L, %L, %L, %L, 1024)', pg_temp.id('member'), 'ticket-attachment', :'ticket', 'anexo.pdf', 'application/pdf'), 'P0001', 'Edge upload: anexo de ticket');
select pg_temp.denied(format('select public.app_upload_access(%L, %L, %L, %L, %L, 1024)', pg_temp.id('member'), 'post-image', (select post from fixture), 'foto.png', 'image/png'), 'P0001', 'Edge upload: imagem do post');
select pg_temp.denied(format('select public.app_media_access(%L, %L, %L)', pg_temp.id('member'), 'material', (select library_material from fixture)), 'P0001', 'Edge media: material da biblioteca', 'Arquivo indisponível.');
select pg_temp.off(format('select public.app_feedback_screenshot_reserve(%L, %L, %L, 1024)', pg_temp.id('member'), gen_random_uuid(), 'image/png'), 'Edge upload: print do feedback');
reset role;

-- A emissão não depende dos módulos, e o certificado emitido continua verificável.
select pg_temp.ok(app_private.issue_certificate(pg_temp.id('member'), (select course from fixture)) is not null, 'Emissão segue com tudo desligado');
select code from public.certificates where user_id = pg_temp.id('member') \gset
set local role anon;
select pg_temp.ok(public.app_certificate(:'code')->>'code' = :'code', 'Verificação pública com tudo desligado');
reset role;

-- A equipe do módulo segue usando o painel.
set local role authenticated;
select pg_temp.login('moderator');
select pg_temp.ok((public.app_feed()->>'total')::int = 1, 'Moderador vê o feed');
select pg_temp.ok((public.app_post((select post from fixture))->'post'->>'id')::uuid = (select post from fixture), 'Moderador abre a publicação');
select pg_temp.login('support');
select pg_temp.ok((public.app_tickets()->>'total')::int = 1, 'Suporte vê o ticket do aluno');
select pg_temp.ok((public.app_ticket(:'ticket')->>'id')::uuid = :'ticket', 'Suporte abre o ticket');
select pg_temp.login('instructor');
select pg_temp.ok(public.app_materials(null, '', 1)->'folders' <> '[]', 'Instrutor vê a biblioteca');
select pg_temp.login('admin');
select pg_temp.ok((public.app_podcasts(1, '', true)->>'total')::int = 1, 'Admin vê o acervo no painel');
select pg_temp.ok(public.app_ranking() ? 'items', 'Admin consulta o ranking');
select pg_temp.ok(public.app_help_feedback('/ajuda/administracao', 'rate', true)->>'ok' = 'true', 'Equipe avalia a ajuda da administração');
reset role;

-- O Ranking desligado continua registrando pontos.
delete from app_private.ranking_events where recipient_id = pg_temp.id('member') and kind = 'lesson';
update public.lesson_progress set completed_at = null where user_id = pg_temp.id('member');
update public.lesson_progress set completed_at = now() where user_id = pg_temp.id('member');
select pg_temp.ok((select count(*) from app_private.ranking_events where recipient_id = pg_temp.id('member') and kind = 'lesson') = 1, 'Pontos registrados com Ranking desligado');

-- Religar devolve tudo, com os dados intactos.
set local role authenticated;
select pg_temp.login('admin');
select pg_temp.ok(public.app_admin_set_module(k, true) ->> k = 'true', 'Admin religa ' || k)
from unnest(array['community', 'materials', 'podcasts', 'ranking', 'live_events', 'support', 'help', 'feedback']) k;
select pg_temp.login('member');
select pg_temp.ok((public.app_feed()->>'total')::int = 1, 'Feed volta com a publicação');
select pg_temp.ok((public.app_tickets()->>'total')::int = 1, 'Ticket volta');
select pg_temp.ok(jsonb_array_length(public.app_ticket(:'ticket')->'messages') = 1, 'Mensagem do ticket preservada');
select pg_temp.ok((public.app_podcasts()->>'total')::int = 1, 'Acervo volta');
select pg_temp.ok(public.app_materials(null, '', 1)->'folders' <> '[]', 'Biblioteca volta');
select pg_temp.ok(jsonb_array_length(public.app_live_events()->'items') = 1, 'Agenda volta');
select pg_temp.ok(public.app_ranking() ? 'items', 'Ranking volta');
select pg_temp.ok(public.app_issue_certificate((select course from fixture))->>'certificate_code' = :'code', 'Certificado emitido continua na conta');
reset role;
select pg_temp.ok(exists(select 1 from public.audit_events where action = 'enable' and target_type = 'module_support'), 'Religar auditado');
select pg_temp.ok(app_private.material_access(pg_temp.id('member'), (select library_material from fixture)), 'Material volta');

select count(*) from results;
rollback;
