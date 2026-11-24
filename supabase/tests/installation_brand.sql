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
from unnest(array['admin', 'admin_b', 'member', 'support', 'moderator', 'instructor']) as role;
grant select on actors to authenticated;
insert into auth.users(id, email, email_confirmed_at, aud, role, raw_app_meta_data)
select actor_id, actor_id || '@example.test', now(), 'authenticated', 'authenticated', '{"icarus_server_created":true}' from actors;
update public.profiles p set role = case a.role when 'admin_b' then 'admin' else a.role end from actors a where p.id = a.actor_id;
insert into auth.sessions(id, user_id, created_at, updated_at, aal)
select session_id, actor_id, now(), now(), 'aal2' from actors;
insert into auth.mfa_factors(id, user_id, friendly_name, factor_type, status, created_at, updated_at)
select gen_random_uuid(), actor_id, 'Demonstração', 'totp', 'verified', now(), now() from actors where role in ('admin', 'admin_b');
create function pg_temp.login(actor_role text, aal text) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub',actor_id,'session_id',session_id,'aal',aal,'role','authenticated')::text,true)
  from actors where role = actor_role
$$;

select pg_temp.ok(not has_table_privilege('authenticated', 'app_private.installation_brand', 'SELECT,UPDATE'), 'Tabela fechada para autenticados');
select pg_temp.ok(not has_table_privilege('anon', 'app_private.installation_brand', 'SELECT,UPDATE'), 'Tabela fechada para anônimos');
select pg_temp.ok(not has_table_privilege('service_role', 'app_private.installation_brand', 'SELECT,UPDATE'), 'Tabela fechada para serviço');
select pg_temp.ok(not has_function_privilege('service_role', 'public.app_admin_save_installation_name(text,integer)', 'EXECUTE'), 'Escrita sem grant de serviço');

set local role anon;
select pg_temp.ok(public.app_public_context()->>'name' = 'Icarus', 'Nome padrão no contexto anônimo');
select pg_temp.denied($q$select public.app_admin_save_installation_name('Recusado', 0)$q$, '42501', 'Anônimo não altera');
reset role;

set local role authenticated;
do $$
declare actor_role text;
begin
  foreach actor_role in array array['member', 'support', 'moderator', 'instructor'] loop
    perform pg_temp.login(actor_role, 'aal2');
    perform pg_temp.denied($q$select public.app_admin_save_installation_name('Recusado', 0)$q$, 'P0001', actor_role || ' não altera');
  end loop;
end $$;
select pg_temp.login('admin', 'aal1');
select pg_temp.denied($q$select public.app_admin_save_installation_name('Recusado', 0)$q$, 'P0001', 'Admin com MFA verificado precisa de AAL2');
select pg_temp.login('admin', 'aal2');
select pg_temp.ok(public.app_bootstrap() #>> '{settings,name}' = 'Icarus', 'Nome padrão no bootstrap');
select pg_temp.ok(public.app_bootstrap() #>> '{settings,name_revision}' = '0', 'Revisão inicial no bootstrap');
select pg_temp.denied($q$select public.app_admin_save_installation_name('   ', 0)$q$, 'P0001', 'Nome vazio recusado');
select pg_temp.denied($q$select public.app_admin_save_installation_name(U&'\034F', 0)$q$, 'P0001', 'CGJ isolado recusado');
select pg_temp.denied($q$select public.app_admin_save_installation_name(U&'\00A0', 0)$q$, 'P0001', 'NBSP isolado recusado');
select pg_temp.denied($q$select public.app_admin_save_installation_name(U&' \034F\00A0\200D\2800 ', 0)$q$, 'P0001', 'Combinação invisível recusada');
select pg_temp.denied($q$select public.app_admin_save_installation_name(repeat('x', 81), 0)$q$, 'P0001', 'Limite de tamanho');
select pg_temp.denied($q$select public.app_admin_save_installation_name(repeat('😀', 81), 0)$q$, 'P0001', 'Limite mede pontos de código e não unidades UTF-16');
select pg_temp.denied($q$select public.app_admin_save_installation_name(E'A\nB', 0)$q$, 'P0001', 'Caractere de controle recusado');
select pg_temp.denied($q$select public.app_admin_save_installation_name(U&'A\202EB', 0)$q$, 'P0001', 'Sobrescrita de direção recusada');

select pg_temp.login('admin_b', 'aal2');
select pg_temp.ok(public.app_admin_save_installation_name('Nome intermediário', 0) = '{"name":"Nome intermediário","revision":1,"saved":true}', 'Segunda sessão altera o nome');
select pg_temp.ok(public.app_admin_save_installation_name('Icarus', 1) = '{"name":"Icarus","revision":2,"saved":true}', 'Segunda sessão volta ao nome inicial');
select pg_temp.login('admin', 'aal2');
select pg_temp.ok(public.app_admin_save_installation_name('Outro nome', 0) = '{"name":"Icarus","revision":2,"saved":false}', 'Rascunho anterior às duas mudanças retorna conflito');
select pg_temp.ok(public.app_admin_save_installation_name(' Icarus ', 0) = '{"name":"Icarus","revision":2,"saved":true}', 'Nome desejado já publicado tem sucesso idempotente');
select pg_temp.ok(public.app_admin_save_installation_name('Rascunho legado', null) = '{"name":"Icarus","revision":2,"saved":false}', 'Rascunho sem revisão exige confirmação');
select pg_temp.ok(public.app_admin_save_installation_name(U&'\00A0 ' || repeat('x', 80) || U&' \00A0', 2) = jsonb_build_object('name', repeat('x', 80), 'revision', 3, 'saved', true), 'Oitenta letras com espaços marginais');
select pg_temp.ok(public.app_admin_save_installation_name(U&'\00A0 ' || repeat('😀', 80) || ' ', 3) = jsonb_build_object('name', repeat('😀', 80), 'revision', 4, 'saved', true), 'Oitenta emojis com espaços marginais');
select pg_temp.ok(public.app_admin_save_installation_name('  Academia São José & Cursos 👩‍💻  ', 4) = '{"name":"Academia São José & Cursos 👩‍💻","revision":5,"saved":true}', 'Nome visível com emoji composto');
select pg_temp.ok(public.app_bootstrap()->'settings' @> '{"name":"Academia São José & Cursos 👩‍💻","name_revision":5}', 'Readback autenticado reflete nome e revisão');
reset role;

set local role anon;
select pg_temp.ok(public.app_public_context()->>'name' = 'Academia São José & Cursos 👩‍💻', 'Readback anônimo reflete a alteração');
select pg_temp.ok(not public.app_public_context() ?| array['installation_brand', 'name_revision'], 'Contexto público mantém DTO mínimo');
reset role;
select pg_temp.ok((select count(*) = 5 and count(*) filter (where actor_id = (select actor_id from actors where role = 'admin_b')) = 2 and count(*) filter (where actor_id = (select actor_id from actors where role = 'admin')) = 3 and bool_and(action = 'save' and target_id is null and reason is null) from public.audit_events where target_type = 'installation_brand'), 'Exatamente uma auditoria por alteração efetiva e seu ator');
select count(*) from results;
rollback;
