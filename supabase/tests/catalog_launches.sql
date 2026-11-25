\set ON_ERROR_STOP on
begin;

create temporary table launch_checks(name text primary key);
create temporary table launch_keys(label text primary key, key uuid);
grant insert on launch_checks to authenticated,anon;
grant select on launch_keys to authenticated;

create function pg_temp.ok(p_value boolean,p_name text) returns void language plpgsql as $$
begin
 if p_value is distinct from true then raise exception 'FAIL: %',p_name; end if;
 insert into launch_checks values (p_name);
end $$;
create function pg_temp.denied(p_statement text,p_name text) returns void language plpgsql as $$
begin
 begin execute p_statement;
 exception when insufficient_privilege or sqlstate 'P0001' then
  perform pg_temp.ok(true,p_name); return;
 end;
 raise exception 'FAIL (autorizou): %',p_name;
end $$;
create function pg_temp.id(n integer) returns uuid language sql immutable as $$
 select ('02900000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;
create function pg_temp.login(n integer) returns void language sql as $$
 select set_config('request.jwt.claims',jsonb_build_object(
  'sub',pg_temp.id(n),'role','authenticated','aal','aal2','session_id',pg_temp.id(10+n)
 )::text,true)
$$;
create function pg_temp.key(p_label text) returns uuid language sql stable as $$
 select key from launch_keys where label=p_label
$$;

insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
select pg_temp.id(n),'launch-'||n||'@example.test',now(),'{"icarus_server_created":true}',
 jsonb_build_object('full_name','Ator '||n) from generate_series(1,6) n;
set constraints all immediate;
insert into auth.sessions(id,user_id,created_at,updated_at,aal)
select pg_temp.id(10+n),pg_temp.id(n),now(),now(),'aal2' from generate_series(1,6) n;
update public.profiles set role='instructor' where id=pg_temp.id(3);
update public.profiles set role='support' where id=pg_temp.id(4);
update public.profiles set role='admin' where id=pg_temp.id(5);
insert into public.plans(id,slug,name,price_cents,access_months)
values(pg_temp.id(50),'launch-pro','Pro',0,12);
insert into public.subscriptions(user_id,plan_id,ends_at,source)
values(pg_temp.id(1),pg_temp.id(50),now()+interval '1 day','courtesy'),
 (pg_temp.id(2),pg_temp.id(50),now()+interval '1 day','courtesy'),
 (pg_temp.id(6),pg_temp.id(50),now()+interval '1 day','courtesy');
insert into public.courses(id,slug,title,description,status,access_mode)
values
 (pg_temp.id(101),'launch-test-course','TÍTULO PRIVADO','CORPO PRIVADO','draft','plans'),
 (pg_temp.id(102),'launch-test-parent','Curso pai','', 'published','members'),
 (pg_temp.id(103),'launch-test-staged','Curso pai rascunho','', 'draft','members'),
 (pg_temp.id(104),'launch-test-hidden','Rascunho sem anúncio','', 'draft','members');
update public.courses set plan_ids=array[pg_temp.id(50)] where id=pg_temp.id(101);
insert into public.modules(id,course_id,slug,title,status,access_mode,plan_ids)
values
 (pg_temp.id(201),pg_temp.id(102),'launch-test-module','Módulo privado','draft','plans',array[pg_temp.id(50)]),
 (pg_temp.id(202),pg_temp.id(103),'launch-test-child','Módulo em preparação','draft','inherit','{}');

select pg_temp.ok(not exists (
 select from unnest(array['app_catalog_launches(text)','app_subscribe_catalog_launch(uuid)',
  'app_admin_catalog_launch(text,uuid)','app_admin_save_catalog_launch(text,uuid,text,text,date,boolean)','app_export_data()']) sig
 where has_function_privilege('anon','public.'||sig,'EXECUTE')
  or has_function_privilege('service_role','public.'||sig,'EXECUTE')
  or not has_function_privilege('authenticated','public.'||sig,'EXECUTE')
),'ACL de RPCs somente para authenticated');
select pg_temp.ok(not exists(
 select from pg_class c cross join unnest(array['anon','authenticated','service_role']) r(role_name)
 where c.oid in ('app_private.catalog_launches'::regclass,'app_private.catalog_launch_signups'::regclass)
 and (not c.relrowsecurity or has_table_privilege(r.role_name,c.oid,'SELECT, INSERT, UPDATE, DELETE'))
),'RLS e grants negam tabelas privadas');

set local role anon;
select pg_temp.denied('select public.app_catalog_launches()','anon sem leitura');
reset role;
set local role authenticated;
select pg_temp.denied('select public.app_catalog_launches()','authenticated sem JWT');
select pg_temp.login(1);
select pg_temp.denied(format('select public.app_admin_catalog_launch(%L,%L)','courses',pg_temp.id(101)),
 'membro sem editor');
select pg_temp.denied(format('select public.app_admin_save_catalog_launch(%L,%L,%L,%L,null,true)',
 'courses',pg_temp.id(101),'Título','Resumo'),'membro sem escrita editorial');
select pg_temp.login(4);
select pg_temp.denied(format('select public.app_admin_catalog_launch(%L,%L)','courses',pg_temp.id(101)),
 'suporte sem editor');
select pg_temp.login(3);
select public.app_admin_save_catalog_launch('courses',pg_temp.id(101),'Curso futuro','Resumo editorial','2027-01-01',true);
select public.app_admin_save_catalog_launch('modules',pg_temp.id(201),'Módulo futuro','Resumo módulo',null,true);
select public.app_admin_save_catalog_launch('modules',pg_temp.id(202),'Módulo do curso futuro','Resumo aprovado',null,true);
select pg_temp.ok(public.app_admin_catalog_launch('courses',pg_temp.id(101)) =
 '{"title":"Curso futuro","summary":"Resumo editorial","planned_on":"2027-01-01","enabled":true}',
 'instrutor grava e recebe só campos aprovados');
select pg_temp.denied(format('select public.app_admin_save_catalog_launch(%L,%L,%L,%L,null,true)',
 'courses',pg_temp.id(102),'Título','Resumo'),'editor não anuncia conteúdo já publicado');
select pg_temp.login(5);
select public.app_admin_save_catalog_launch('courses',pg_temp.id(101),'Curso futuro','Resumo aprovado',null,true);
savepoint editorial_rollback;
select public.app_admin_save_catalog_launch('modules',pg_temp.id(201),'Módulo futuro','Resumo módulo',null,false);
select pg_temp.ok(public.app_admin_catalog_launch('modules',pg_temp.id(201))->>'enabled'='false',
 'editor desabilita anúncio existente');
reset role;
select pg_temp.ok(exists(select from public.audit_events where actor_id=pg_temp.id(5)
 and action='catalog_launch_update' and target_type='modules' and target_id=pg_temp.id(201)
 and reason is null),'desabilitar grava ator e alvo sem o conteúdo editorial');
rollback to savepoint editorial_rollback;
select pg_temp.ok(public.app_admin_catalog_launch('modules',pg_temp.id(201))->>'enabled'='true',
 'rollback restaura visibilidade do anúncio');
reset role;
select pg_temp.ok((select count(*)=4 and bool_and(reason is null) from public.audit_events
 where action in ('catalog_launch_create','catalog_launch_update')),
 'somente quatro escritas autorizadas geram auditoria, sem payload editorial ou evento do rollback');
select pg_temp.ok((select count(*)=2 from public.audit_events where actor_id=pg_temp.id(3)
 and action='catalog_launch_create' and
 ((target_type='courses' and target_id=pg_temp.id(101))
  or (target_type='modules' and target_id=pg_temp.id(201)))),
 'criação registra instrutor e IDs reais de curso e módulo');
select pg_temp.ok(exists(select from public.audit_events where actor_id=pg_temp.id(5)
 and action='catalog_launch_update' and target_type='courses' and target_id=pg_temp.id(101)),
 'alteração registra admin e curso alvo');
select pg_temp.ok(not exists(select from public.audit_events
 where action in ('catalog_launch_create','catalog_launch_update')
 and (actor_id in (pg_temp.id(1),pg_temp.id(4)) or target_id=pg_temp.id(102))),
 'negativa por papel ou curso já publicado não gera auditoria');
insert into launch_keys select 'course',id from app_private.catalog_launches where course_id=pg_temp.id(101);
insert into launch_keys select 'module',id from app_private.catalog_launches where module_id=pg_temp.id(201);
insert into launch_keys select 'staged',id from app_private.catalog_launches where module_id=pg_temp.id(202);
set local role authenticated;
select pg_temp.login(1);
select pg_temp.ok(public.app_catalog_launches() = jsonb_build_array(jsonb_build_object(
 'key',pg_temp.key('course'),'title','Curso futuro','summary','Resumo aprovado','planned_on',null,'subscribed',false
)),'listagem mínima usa chave editorial, sem rascunhos não anunciados nem IDs do conteúdo');
select pg_temp.ok(jsonb_array_length(public.app_catalog('Curso pai')->'items')=1
 and public.app_catalog('PRIVADO')->'items'='[]','catálogo normal só retorna publicados');
select pg_temp.ok(public.app_catalog_launches('launch-test-staged')='[]','pai rascunho oculta anúncio de módulo');
select pg_temp.denied(format('select public.app_subscribe_catalog_launch(%L)',pg_temp.key('staged')),
 'pai rascunho barra inscrição por chave conhecida');
select pg_temp.ok(jsonb_array_length(public.app_catalog_launches('launch-test-parent'))=1,'plano elegível vê próximo módulo');
select pg_temp.ok(public.app_subscribe_catalog_launch(pg_temp.key('course'))='{"subscribed":true}',
 'inscrição a curso confirmada');
select pg_temp.ok(public.app_subscribe_catalog_launch(pg_temp.key('course'))='{"subscribed":true}',
 'retry da inscrição é idempotente');
select public.app_subscribe_catalog_launch(pg_temp.key('module'));
select pg_temp.ok(jsonb_array_length(public.app_export_data()->'catalog_launch_signups')=2,
 'export inclui as duas inscrições próprias, sem duplicar');
select pg_temp.login(2);
select pg_temp.ok(public.app_catalog_launches()->0->>'subscribed'='false','inscrição alheia invisível');
select pg_temp.ok(public.app_export_data()->'catalog_launch_signups'='[]','export não inclui inscrição alheia');
select public.app_subscribe_catalog_launch(pg_temp.key('course'));
select public.app_subscribe_catalog_launch(pg_temp.key('module'));
select public.app_set_notification_preference('catalog_launch',false);
select pg_temp.login(6);
select public.app_subscribe_catalog_launch(pg_temp.key('course'));
select public.app_subscribe_catalog_launch(pg_temp.key('module'));
reset role;
update public.subscriptions set revoked_at=now() where user_id=pg_temp.id(6);
set local role authenticated;
select pg_temp.login(6);
select pg_temp.ok(public.app_catalog_launches()->0->>'subscribed'='true',
 'curso em rascunho continua anunciado ao membro sem plano');
select pg_temp.ok(public.app_subscribe_catalog_launch(pg_temp.key('course'))='{"subscribed":true}',
 'inscrição editorial de curso em rascunho segue disponível sem plano');
select pg_temp.ok(public.app_catalog_launches('launch-test-parent')='[]','perda de plano oculta o anúncio');
select pg_temp.denied(format('select public.app_subscribe_catalog_launch(%L)',pg_temp.key('module')),
 'perda de plano recusa retry por chave conhecida');
select pg_temp.login(3);
savepoint pending_publication;
select public.app_admin_save('courses',pg_temp.id(101),'{"status":"published"}');
select pg_temp.login(1);
select pg_temp.ok(public.app_notifications()->>'total'='1','publicação gera aviso na transação');
rollback to savepoint pending_publication;
select pg_temp.login(1);
select pg_temp.ok(public.app_catalog_launches()->0->>'subscribed'='true','rollback preserva anúncio e inscrição');
select pg_temp.ok(public.app_notifications()->>'total'='0','rollback desfaz aviso');
select pg_temp.login(3);
select public.app_admin_save('courses',pg_temp.id(101),'{"status":"published"}');
select public.app_admin_save('courses',pg_temp.id(101),'{"status":"published"}');
select public.app_admin_save('modules',pg_temp.id(201),'{"status":"published"}');
select public.app_admin_save('modules',pg_temp.id(202),'{"status":"published"}');
reset role;
select pg_temp.ok((select released_at is null from app_private.catalog_launches where id=pg_temp.key('staged')),
 'publicar módulo antes do pai ainda não lança');
set local role authenticated;
select pg_temp.login(3);
select public.app_admin_save('courses',pg_temp.id(103),'{"status":"published"}');
reset role;
select pg_temp.ok((select released_at is not null from app_private.catalog_launches where id=pg_temp.key('staged')),
 'publicação posterior do pai conclui lançamento do módulo');
select pg_temp.ok((select count(*)=2 from public.notifications where user_id=pg_temp.id(1) and event_key='catalog_launch'),
 'somente um aviso por inscrição e lançamento');
select pg_temp.ok((select count(*)=0 from public.notifications where user_id=pg_temp.id(2) and event_key='catalog_launch'),
 'opt-out bloqueia inclusive o aviso do curso elegível');
select pg_temp.ok((select count(*)=0 from public.notifications where user_id=pg_temp.id(6) and event_key='catalog_launch'),
 'revalidação de plano bloqueia o aviso mesmo com preferência ativa');
set local role authenticated;
select pg_temp.login(1);
select pg_temp.ok(public.app_catalog_launches()='[]','publicação retira o anúncio da lista');
select pg_temp.denied(format('select public.app_subscribe_catalog_launch(%L)',pg_temp.key('course')),
 'inscrição após publicação é negada');
select pg_temp.ok(exists(select from jsonb_array_elements(public.app_notifications()->'items') x
 where x->>'action_path'='/app/cursos/launch-test-parent/launch-test-module' and not x?'source_id'),
 'sino usa rota publicada e não devolve IDs internos');
select pg_temp.ok(exists(select from jsonb_array_elements(public.app_notifications()->'items') x
 where x->>'action_path'='/app/cursos/launch-test-course' and x->>'subtitle'='Curso futuro' and not x?'source_id'),
 'curso restrito publicado tem destino e título para o titular elegível');
reset role;
update public.subscriptions set revoked_at=now() where user_id=pg_temp.id(1);
set local role authenticated;
select pg_temp.login(1);
select pg_temp.ok((select count(*)=2 from jsonb_array_elements(public.app_notifications()->'items') x
 where x->>'event_key'='catalog_launch' and x->'action_path'='null' and x->'subtitle'='null'),
 'perda posterior de acesso oculta link e título tanto de curso quanto de módulo');
select pg_temp.ok((
 select data->'catalog_launch_signups' @> jsonb_build_array(jsonb_build_object('launch_key',pg_temp.key('course')))
 and (select count(*)=2 from jsonb_array_elements(data->'notifications') x
  where x->>'event_key'='catalog_launch' and x->'action_path'='null' and x->'subtitle'='null')
 from (select public.app_export_data() data) exported
),'export preserva inscrição própria e oculta detalhes dos avisos após revogação');

select pg_temp.login(3);
select public.app_admin_save_catalog_launch('courses',pg_temp.id(104),'Curso para membros','Resumo aprovado para membros',null,true);
select pg_temp.login(6);
select public.app_subscribe_catalog_launch((public.app_catalog_launches()->0->>'key')::uuid);
select pg_temp.login(3);
select public.app_admin_save('courses',pg_temp.id(104),'{"status":"published"}');
select pg_temp.login(6);
select pg_temp.ok(jsonb_array_length(public.app_notifications()->'items')=1
 and public.app_notifications()->'items'->0->>'action_path'='/app/cursos/launch-test-hidden'
 and public.app_notifications()->'items'->0->>'subtitle'='Curso para membros',
 'curso members entrega exatamente um aviso com destino ao titular sem plano pago');
reset role;

select count(*) from launch_checks;
rollback;
