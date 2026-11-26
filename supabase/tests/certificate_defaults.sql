\set ON_ERROR_STOP on
begin;

create temporary table results (name text primary key);
grant all on results to anon, authenticated, service_role;
create function pg_temp.ok(condition boolean, name text) returns void language plpgsql as $$
begin
  if condition is distinct from true then raise exception 'Falhou: %', name; end if;
  insert into results values (name);
end $$;
create function pg_temp.denied(statement text, code text, name text) returns void language plpgsql as $$
begin
  begin
    execute statement;
  exception when others then
    perform pg_temp.ok(sqlstate = code, name || ' (' || sqlstate || ')');
    return;
  end;
  raise exception 'Operação permitida: %', name;
end $$;

create temporary table actors as
select role, gen_random_uuid() as actor_id, gen_random_uuid() as session_id
from unnest(array['admin', 'instructor', 'member', 'student']) as role;
grant select on actors to anon, authenticated, service_role;
insert into auth.users(id, email, email_confirmed_at, aud, role, raw_app_meta_data, raw_user_meta_data)
select actor_id, actor_id || '@example.test', now(), 'authenticated', 'authenticated', '{"icarus_server_created":true}', jsonb_build_object('full_name', 'DEMONSTRAÇÃO ' || role) from actors;
update public.profiles p set role = case a.role when 'student' then 'member' else a.role end from actors a where p.id = a.actor_id;
insert into auth.sessions(id, user_id, created_at, updated_at, aal) select session_id, actor_id, now(), now(), 'aal2' from actors;
insert into public.app_sessions(id, user_id, expires_at) select session_id, actor_id, now() + interval '1 hour' from actors;
create function pg_temp.id(actor_role text) returns uuid language sql as $$ select actor_id from actors where role = actor_role $$;
create function pg_temp.login(actor_role text) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', actor_id, 'session_id', session_id, 'aal', 'aal2', 'role', 'authenticated')::text, true) from actors where role = actor_role
$$;
create function pg_temp.service(actor_role text) returns void language sql as $$
  select set_config('request.headers', jsonb_build_object('x-icarus-session-id', session_id, 'x-icarus-aal', 'aal2')::text, true) from actors where role = actor_role
$$;

create temporary table fixture as select gen_random_uuid() plan,
  'signature/' || gen_random_uuid() || '.png' global1, 'signature/' || gen_random_uuid() || '.png' global2,
  'signature/' || gen_random_uuid() || '.png' global3, 'signature/' || gen_random_uuid() || '.png' own;
grant select on fixture to service_role, authenticated, anon;
insert into storage.objects(bucket_id, name, metadata) select 'icarus-brand', unnest(array[global1, global2, global3, own]), '{"size":2048,"mimetype":"image/png"}' from fixture;
insert into public.plans(id, name, slug, price_cents, access_months, active) select plan, 'DEMONSTRAÇÃO modelo', 'demo-modelo-certificado', 10000, 12, true from fixture;
insert into public.subscriptions(user_id, plan_id, starts_at, ends_at, source)
select a.actor_id, f.plan, now() - interval '1 day', now() + interval '1 month', 'courtesy' from actors a, fixture f where a.role in ('member', 'student');
-- O modelo global começa vazio em toda instalação.
update app_private.installation_brand set certificate_signer_name = '', certificate_signer_title = '', certificate_signature_path = null where singleton;

select pg_temp.ok(has_function_privilege('authenticated', 'public.app_admin_certificate_defaults()', 'execute')
  and not has_function_privilege('anon', 'public.app_admin_certificate_defaults()', 'execute')
  and not has_function_privilege('service_role', 'public.app_admin_certificate_defaults()', 'execute'), 'Só a sessão logada lê o modelo');
select pg_temp.ok(has_function_privilege('authenticated', 'public.app_admin_save_certificate_defaults(text,text)', 'execute')
  and not has_function_privilege('anon', 'public.app_admin_save_certificate_defaults(text,text)', 'execute')
  and not has_function_privilege('service_role', 'public.app_admin_save_certificate_defaults(text,text)', 'execute'), 'Só a sessão logada salva o modelo');

set local role authenticated;
select pg_temp.login('admin');
select pg_temp.ok(public.app_admin_certificate_defaults() = jsonb_build_object('signer_name', '', 'signer_title', '', 'signature_path', null), 'Modelo nasce vazio');

-- Curso novo, sem responsável próprio, usa o modelo global; com responsável próprio, fica personalizado.
select (public.app_admin_save('courses', null, '{"slug":"modelo-global","title":"DEMONSTRAÇÃO global","status":"draft","access_mode":"subscribers","certificate_enabled":true}')->>'id') as global_course \gset
select (public.app_admin_save('courses', null, '{"slug":"modelo-proprio","title":"DEMONSTRAÇÃO próprio","status":"draft","access_mode":"subscribers","certificate_enabled":true,"signer_name":"Responsável próprio","signer_title":"Direção"}')->>'id') as own_course \gset
reset role;
select pg_temp.ok((select signer_name is null and signer_title is null from public.courses where id = :'global_course'), 'Curso novo usa o modelo global');
select pg_temp.ok((select signer_name = 'Responsável próprio' from public.courses where id = :'own_course'), 'Curso com responsável próprio fica personalizado');
select pg_temp.denied(format('update public.courses set signer_name = null where id = %L', :'own_course'), '23514', 'Nome e cargo herdam juntos');

-- Currículo publicado nos dois cursos e um aluno que concluiu a aula obrigatória de cada um.
insert into public.modules(id, course_id, slug, title, status) select gen_random_uuid(), c, 'modulo', 'Módulo', 'published' from unnest(array[:'global_course'::uuid, :'own_course'::uuid]) c;
insert into public.sections(id, module_id, title, status) select gen_random_uuid(), m.id, 'Seção', 'published' from public.modules m where m.course_id in (:'global_course', :'own_course');
insert into public.lessons(id, section_id, slug, title, duration_seconds, status) select gen_random_uuid(), s.id, 'aula', 'Aula', 60, 'published' from public.sections s join public.modules m on m.id = s.module_id where m.course_id in (:'global_course', :'own_course');
insert into public.lesson_progress(user_id, lesson_id, position_seconds, completed_at)
select a.actor_id, l.id, 60, now() from public.lessons l join public.sections s on s.id = l.section_id join public.modules m on m.id = s.module_id cross join actors a
where m.course_id in (:'global_course', :'own_course') and a.role in ('member', 'student');

set local role authenticated;
select pg_temp.login('instructor');
select pg_temp.denied(format('select public.app_admin_save(%L, %L, %L)', 'courses', :'global_course', '{"status":"published"}'), 'P0001', 'Modelo vazio impede publicar curso que usa o global');
select pg_temp.ok(public.app_admin_certificate_defaults() ? 'signer_name', 'Instrutor lê o modelo para o curso');
select pg_temp.denied($q$select public.app_admin_save_certificate_defaults('Pessoa do instrutor', 'Cargo')$q$, 'P0001', 'Instrutor não altera o modelo');
select pg_temp.login('member');
select pg_temp.denied('select public.app_admin_certificate_defaults()', 'P0001', 'Membro não lê o modelo');
select pg_temp.denied($q$select public.app_admin_save_certificate_defaults('Pessoa do membro', 'Cargo')$q$, 'P0001', 'Membro não altera o modelo');
select pg_temp.login('admin');
select pg_temp.denied($q$select public.app_admin_save_certificate_defaults('Ab', 'Direção')$q$, 'P0001', 'Nome curto recusado');
select pg_temp.denied($q$select public.app_admin_save_certificate_defaults('Ana Souza', ' ')$q$, 'P0001', 'Cargo vazio recusado');
select pg_temp.denied(format('select public.app_admin_save_certificate_defaults(%L, %L)', repeat('a', 161), 'Direção'), 'P0001', 'Nome longo recusado');
select pg_temp.ok(public.app_admin_save_certificate_defaults('  Ana Souza ', 'Coordenação pedagógica') = jsonb_build_object('signer_name', 'Ana Souza', 'signer_title', 'Coordenação pedagógica', 'signature_path', null), 'Admin salva o modelo');
select pg_temp.ok(public.app_admin_save('courses', :'global_course', '{"status":"published"}') ? 'id', 'Com o modelo preenchido, o curso global publica');
select pg_temp.ok(public.app_admin_save('courses', :'own_course', '{"status":"published"}') ? 'id', 'Curso personalizado publica com o próprio responsável');
reset role;
select pg_temp.ok((select count(*) = 1 from public.audit_events where actor_id = pg_temp.id('admin') and action = 'save' and target_type = 'certificate_defaults'), 'Salvar o modelo entra na auditoria');

-- Assinatura global: mesmo envio da assinatura do curso, sem curso.
set local role service_role;
select pg_temp.service('admin');
select pg_temp.ok(public.app_brand_asset_commit(pg_temp.id('admin'), 'signature', (select global1 from fixture), null) = jsonb_build_object('signature_path', (select global1 from fixture), 'previous', null), 'Admin grava a assinatura do modelo');
select pg_temp.denied(format('select public.app_brand_asset_commit(%L, %L, %L, %L)', pg_temp.id('admin'), 'signature', (select global1 from fixture), :'own_course'), 'P0001', 'Assinatura do modelo não vira assinatura de curso');
select pg_temp.ok(public.app_brand_asset_commit(pg_temp.id('admin'), 'signature', (select own from fixture), :'own_course') ->> 'signature_path' = (select own from fixture), 'Curso personalizado mantém a própria assinatura');
select pg_temp.service('instructor');
select pg_temp.denied(format('select public.app_brand_asset_commit(%L, %L, %L, null)', pg_temp.id('instructor'), 'signature', (select global2 from fixture)), 'P0001', 'Instrutor não grava a assinatura do modelo');
reset role;
select pg_temp.ok((select certificate_signature_path from app_private.installation_brand where singleton) = (select global1 from fixture), 'Modelo guarda a assinatura');

-- A emissão usa o modelo no curso global e o próprio responsável no curso personalizado.
select pg_temp.ok(app_private.issue_certificate(pg_temp.id('member'), :'global_course') is not null, 'Certificado do curso global emitido');
select pg_temp.ok(app_private.issue_certificate(pg_temp.id('member'), :'own_course') is not null, 'Certificado do curso personalizado emitido');
select pg_temp.ok((select signer_name = 'Ana Souza' and signer_title = 'Coordenação pedagógica' and signature_path = f.global1 from public.certificates, fixture f where user_id = pg_temp.id('member') and course_id = :'global_course'), 'Emissão copia o modelo global');
select pg_temp.ok((select signer_name = 'Responsável próprio' and signer_title = 'Direção' and signature_path = f.own from public.certificates, fixture f where user_id = pg_temp.id('member') and course_id = :'own_course'), 'Emissão copia o responsável do curso');

-- Mudar o modelo vale para os próximos; os emitidos guardam o da emissão e o arquivo usado continua no Storage.
set local role authenticated;
select pg_temp.login('admin');
select pg_temp.ok(public.app_admin_save_certificate_defaults('Bruno Lima', 'Direção acadêmica') ->> 'signature_path' = (select global1 from fixture), 'Trocar o texto mantém a assinatura');
reset role;
set local role service_role;
select pg_temp.service('admin');
select pg_temp.ok(public.app_brand_asset_commit(pg_temp.id('admin'), 'signature', (select global2 from fixture), null) = jsonb_build_object('signature_path', (select global2 from fixture), 'previous', null), 'Troca preserva o arquivo usado por certificado emitido');
select pg_temp.ok(public.app_brand_asset_commit(pg_temp.id('admin'), 'signature', (select global3 from fixture), null) = jsonb_build_object('signature_path', (select global3 from fixture), 'previous', (select global2 from fixture)), 'Troca devolve o arquivo que nenhum certificado usa');
reset role;
select pg_temp.ok(app_private.issue_certificate(pg_temp.id('student'), :'global_course') is not null, 'Próximo certificado emitido');
select pg_temp.ok((select signer_name = 'Bruno Lima' and signature_path = f.global3 from public.certificates, fixture f where user_id = pg_temp.id('student') and course_id = :'global_course'), 'Próximo certificado usa o modelo novo');
select pg_temp.ok((select signer_name = 'Ana Souza' and signature_path = f.global1 from public.certificates, fixture f where user_id = pg_temp.id('member') and course_id = :'global_course'), 'Certificado emitido mantém o modelo da emissão');
select pg_temp.ok((select count(*) = 5 from public.audit_events where target_type = 'certificate_defaults'), 'Cada mudança do modelo entra na auditoria');

-- Trocar de modo: personalizar grava os campos do curso; voltar ao global limpa os dois.
set local role authenticated;
select pg_temp.login('instructor');
select pg_temp.ok(public.app_admin_save('courses', :'global_course', '{"signer_name":"Carla Dias","signer_title":"Tutoria"}') ? 'id', 'Instrutor personaliza o curso');
select pg_temp.ok(public.app_admin_save('courses', :'own_course', '{"signer_name":null,"signer_title":null}') ? 'id', 'Instrutor volta o curso ao modelo global');
reset role;
select pg_temp.ok((select signer_name = 'Carla Dias' from public.courses where id = :'global_course') and (select signer_name is null from public.courses where id = :'own_course'), 'Modo de cada curso gravado');
select pg_temp.denied(format('update public.courses set signer_name = %L where id = %L', 'Só nome', :'own_course'), '23514', 'Personalizar exige nome e cargo juntos');

select count(*) from results;
rollback;
