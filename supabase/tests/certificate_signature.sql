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
from unnest(array['admin', 'instructor', 'member']) as role;
grant select on actors to anon, authenticated, service_role;
insert into auth.users(id, email, email_confirmed_at, aud, role, raw_app_meta_data, raw_user_meta_data)
select actor_id, actor_id || '@example.test', now(), 'authenticated', 'authenticated', '{"icarus_server_created":true}', jsonb_build_object('full_name', 'DEMONSTRAÇÃO ' || role) from actors;
update public.profiles p set role = a.role from actors a where p.id = a.actor_id;
insert into auth.sessions(id, user_id, created_at, updated_at, aal) select session_id, actor_id, now(), now(), 'aal2' from actors;
insert into public.app_sessions(id, user_id, expires_at) select session_id, actor_id, now() + interval '1 hour' from actors;
create function pg_temp.service(actor_role text) returns void language sql as $$
  select set_config('request.headers', jsonb_build_object('x-icarus-session-id', session_id, 'x-icarus-aal', 'aal2')::text, true) from actors where role = actor_role
$$;
create function pg_temp.id(actor_role text) returns uuid language sql as $$ select actor_id from actors where role = actor_role $$;

-- Curso com certificado e um aluno que concluiu a única aula obrigatória.
create temporary table fixture as select gen_random_uuid() course, gen_random_uuid() other, gen_random_uuid() plan,
  'signature/' || gen_random_uuid() || '.png' sig1, 'signature/' || gen_random_uuid() || '.png' sig2, 'signature/' || gen_random_uuid() || '.png' sig3;
grant select on fixture to service_role, authenticated, anon;
insert into public.plans(id, name, slug, price_cents, access_months, active) select plan, 'DEMONSTRAÇÃO assinatura', 'demo-assinatura', 10000, 12, true from fixture;
insert into public.subscriptions(user_id, plan_id, starts_at, ends_at, source) select pg_temp.id('member'), plan, now() - interval '1 day', now() + interval '1 month', 'courtesy' from fixture;
insert into public.courses(id, slug, title, status, access_mode, certificate_enabled, signer_name, signer_title)
select course, 'assinatura-curso', 'DEMONSTRAÇÃO assinatura', 'published', 'subscribers', true, 'DEMONSTRAÇÃO responsável', 'Coordenação' from fixture;
insert into public.courses(id, slug, title) select other, 'assinatura-outro', 'DEMONSTRAÇÃO outro' from fixture;
insert into public.modules(id, course_id, slug, title, status) select gen_random_uuid(), course, 'modulo', 'Módulo', 'published' from fixture;
insert into public.sections(id, module_id, title, status) select gen_random_uuid(), m.id, 'Seção', 'published' from public.modules m join fixture f on m.course_id = f.course;
insert into public.lessons(id, section_id, slug, title, duration_seconds, status) select gen_random_uuid(), s.id, 'aula', 'Aula', 60, 'published' from public.sections s join public.modules m on m.id = s.module_id join fixture f on m.course_id = f.course;
insert into public.lesson_progress(user_id, lesson_id, position_seconds, completed_at) select pg_temp.id('member'), l.id, 60, now() from public.lessons l join public.sections s on s.id = l.section_id join public.modules m on m.id = s.module_id join fixture f on m.course_id = f.course;
insert into storage.objects(bucket_id, name, metadata) select 'icarus-brand', unnest(array[sig1, sig2, sig3]), '{"size":2048,"mimetype":"image/png"}' from fixture;

set local role service_role;
select pg_temp.service('admin');
select pg_temp.ok(public.app_brand_asset_begin(pg_temp.id('admin'), 'signature', 'image/png') ~ '^signature/[0-9a-f-]{36}\.png$', 'Caminho da assinatura gerado no servidor');
select pg_temp.denied(format('select public.app_brand_asset_begin(%L, %L, %L)', pg_temp.id('admin'), 'signature', 'image/webp'), 'P0001', 'Assinatura só em PNG');
select pg_temp.denied(format('select public.app_brand_asset_commit(%L, %L, %L, null)', pg_temp.id('admin'), 'signature', (select sig1 from fixture)), 'P0001', 'Assinatura exige o curso');
select pg_temp.denied(format('select public.app_brand_asset_commit(%L, %L, %L, %L)', pg_temp.id('admin'), 'signature', (select sig1 from fixture), gen_random_uuid()), 'P0001', 'Curso inexistente');
select pg_temp.denied(format('select public.app_brand_asset_commit(%L, %L, %L, %L)', pg_temp.id('admin'), 'signature', 'signature/' || gen_random_uuid() || '.png', (select course from fixture)), 'P0001', 'Objeto inexistente');
select pg_temp.denied(format('select public.app_brand_asset_commit(%L, %L, %L, %L)', pg_temp.id('admin'), 'light', 'logo/light-' || gen_random_uuid() || '.png', (select course from fixture)), 'P0001', 'Curso só vale para a assinatura');
select pg_temp.ok(public.app_brand_asset_commit(pg_temp.id('admin'), 'signature', (select sig1 from fixture), (select course from fixture)) = jsonb_build_object('signature_path', (select sig1 from fixture), 'previous', null), 'Primeira assinatura');
select pg_temp.ok((select signature_path = f.sig1 and signature_url is null from public.courses c, fixture f where c.id = f.course), 'Curso guarda só o caminho da assinatura');
reset role;
do $$
declare actor_role text;
begin
  foreach actor_role in array array['instructor', 'member'] loop
    perform pg_temp.service(actor_role);
    perform pg_temp.denied(format('select public.app_brand_asset_begin(%L, %L, %L)', pg_temp.id(actor_role), 'signature', 'image/png'), 'P0001', actor_role || ' não envia assinatura');
    perform pg_temp.denied(format('select public.app_brand_asset_commit(%L, %L, %L, %L)', pg_temp.id(actor_role), 'signature', (select sig2 from fixture), (select course from fixture)), 'P0001', actor_role || ' não grava assinatura');
  end loop;
end $$;

-- A URL livre da assinatura deixou de ser gravável, pela RPC de admin ou direto na tabela.
create function pg_temp.login(actor_role text) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', actor_id, 'session_id', session_id, 'aal', 'aal2', 'role', 'authenticated')::text, true) from actors where role = actor_role
$$;
set local role authenticated;
do $$
declare actor_role text;
begin
  foreach actor_role in array array['admin', 'instructor'] loop
    perform pg_temp.login(actor_role);
    perform pg_temp.denied(format('select public.app_admin_save(%L, %L, %L)', 'courses', (select course from fixture), '{"signature_url":"https://atacante.example/rubrica.png"}'), 'P0001', actor_role || ' não grava URL de assinatura pela RPC');
  end loop;
end $$;
select pg_temp.login('instructor');
select pg_temp.ok(public.app_admin_save('courses', (select course from fixture), '{"signer_title":"Coordenação pedagógica"}') ? 'id', 'Instrutor continua editando o curso');
select pg_temp.ok(public.app_admin_save('courses', (select course from fixture), '{"signature_url":null}') ? 'id', 'URL nula continua aceita pela RPC');
reset role;
select pg_temp.denied(format('update public.courses set signature_url = %L where id = %L', 'https://atacante.example/rubrica.png', (select course from fixture)), 'P0001', 'Tabela recusa URL de assinatura');
select pg_temp.denied(format('insert into public.courses(slug, title, signature_url) values (%L, %L, %L)', 'assinatura-url', 'URL', 'https://atacante.example/rubrica.png'), 'P0001', 'Curso novo não nasce com URL de assinatura');

-- O certificado guarda a assinatura da emissão.
select pg_temp.ok(app_private.issue_certificate(pg_temp.id('member'), (select course from fixture)) is not null, 'Certificado emitido');
select code from public.certificates where user_id = pg_temp.id('member') \gset
select pg_temp.ok((select signature_path = f.sig1 and signature_url is null from public.certificates c, fixture f where c.code = :'code'), 'Certificado guarda o caminho e nenhuma URL');
set local role anon;
select pg_temp.ok(public.app_certificate(:'code')->>'signature_path' = (select sig1 from fixture), 'Verificação pública expõe a assinatura da emissão');
reset role;

set local role service_role;
select pg_temp.service('admin');
select pg_temp.ok(public.app_brand_asset_commit(pg_temp.id('admin'), 'signature', (select sig2 from fixture), (select course from fixture)) = jsonb_build_object('signature_path', (select sig2 from fixture), 'previous', null), 'Troca preserva o arquivo usado por certificado emitido');
select pg_temp.ok(public.app_brand_asset_commit(pg_temp.id('admin'), 'signature', (select sig3 from fixture), (select course from fixture)) = jsonb_build_object('signature_path', (select sig3 from fixture), 'previous', (select sig2 from fixture)), 'Troca devolve o arquivo que nenhum certificado usa');
select pg_temp.ok(public.app_brand_asset_commit(pg_temp.id('admin'), 'signature', null, (select course from fixture)) = jsonb_build_object('signature_path', null, 'previous', (select sig3 from fixture)), 'Remoção volta ao padrão');
select pg_temp.denied(format('select public.app_brand_asset_commit(%L, %L, %L, %L)', pg_temp.id('admin'), 'signature', (select sig1 from fixture), (select other from fixture)), 'P0001', 'Arquivo de outro curso recusado');
reset role;
select pg_temp.ok((select signature_path from public.certificates where code = :'code') = (select sig1 from fixture), 'Certificado emitido mantém a assinatura original');
select pg_temp.ok((select count(*) = 4 and bool_and(action in ('save', 'remove') and target_id = (select course from fixture)) from public.audit_events where target_type = 'course_signature'), 'Uma auditoria por mudança de assinatura');
select pg_temp.denied($q$update public.courses set signature_path = 'signature/x.png'$q$, '23514', 'Coluna recusa caminho fora do formato');

select count(*) from results;
rollback;
