\set ON_ERROR_STOP on
begin;

create temporary table default_section_checks(name text primary key);
grant insert on default_section_checks to authenticated,service_role;
create function pg_temp.ok(condition boolean, label text) returns void language plpgsql as $$
begin
 if condition is distinct from true then raise exception 'FAIL: %', label; end if;
 insert into default_section_checks values(label);
end $$;
create function pg_temp.denied(statement text, label text) returns void language plpgsql as $$
declare denied boolean:=false;
begin
 begin execute statement;
 exception when insufficient_privilege or sqlstate 'P0001' or check_violation or unique_violation then denied:=true;
 end;
 perform pg_temp.ok(denied,label);
end $$;
create function pg_temp.id(n integer) returns uuid language sql immutable as $$
 select ('defa0000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;
create function pg_temp.login(n integer) returns void language sql as $$
 select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.id(n),'role','authenticated',
  'aal','aal1','session_id',pg_temp.id(40+n))::text,true)
$$;

insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
select pg_temp.id(n),'default-section-'||n||'@example.test',now(),'{"icarus_server_created":true}',
 jsonb_build_object('full_name','Seção fictícia '||n) from generate_series(1,4)n;
set constraints all immediate;
update public.profiles set role=case id when pg_temp.id(1) then 'admin' when pg_temp.id(2) then 'instructor'
 when pg_temp.id(3) then 'moderator' else 'member' end where id in (select pg_temp.id(n) from generate_series(1,4)n);
insert into auth.sessions(id,user_id,created_at,updated_at,aal)
select pg_temp.id(40+n),pg_temp.id(n),now(),now(),'aal1' from generate_series(1,4)n;

insert into public.courses(id,slug,title,status,access_mode) values
 (pg_temp.id(100),'secao-automatica','Curso sem seções','published','members');
insert into public.modules(id,course_id,slug,title,status,order_index) values
 (pg_temp.id(200),pg_temp.id(100),'basico','Módulo básico','published',0),
 (pg_temp.id(201),pg_temp.id(100),'agrupado','Módulo agrupado','published',1),
 (pg_temp.id(202),pg_temp.id(100),'arquivado','Módulo arquivado','draft',2);
update public.modules set status='archived',previous_status='draft' where id=pg_temp.id(202);
insert into public.sections(id,module_id,title,status,order_index) values
 (pg_temp.id(300),pg_temp.id(201),'Seção existente','published',0);

select pg_temp.ok(has_function_privilege('authenticated','public.app_admin_default_section(uuid)','execute')
 and not has_function_privilege('anon','public.app_admin_default_section(uuid)','execute')
 and not has_function_privilege('service_role','public.app_admin_default_section(uuid)','execute'),
 'só a sessão logada chama a RPC da seção automática');
select pg_temp.ok((select not is_default from public.sections where id=pg_temp.id(300)),
 'seções existentes continuam como estão');

set local role authenticated;
select pg_temp.login(4);
select pg_temp.denied(format('select public.app_admin_default_section(%L)',pg_temp.id(200)),'membro não cria a seção automática');
select pg_temp.login(3);
select pg_temp.denied(format('select public.app_admin_default_section(%L)',pg_temp.id(200)),'moderador não cria a seção automática');
select pg_temp.login(2);
create temporary table created as select public.app_admin_default_section(pg_temp.id(200)) id;
select pg_temp.ok(public.app_admin_default_section(pg_temp.id(200))=(select id from created),
 'chamar de novo devolve a mesma seção');
select pg_temp.denied(format('select public.app_admin_default_section(%L)',pg_temp.id(202)),'módulo arquivado não recebe aulas');
select pg_temp.denied('select public.app_admin_default_section(null)','módulo vazio recusado');
select pg_temp.denied(format('select public.app_admin_default_section(%L)',pg_temp.id(999)),'módulo inexistente recusado');
reset role;

select pg_temp.ok((select is_default and status='published' and not is_bonus and order_index=-1
  and module_id=pg_temp.id(200) and length(title) between 1 and 200
 from public.sections where id=(select id from created)),
 'a seção automática nasce publicada, sem bônus e antes das demais');
select pg_temp.ok((select count(*)=1 from public.sections where module_id=pg_temp.id(200)),'o módulo ganha uma seção só');
select pg_temp.ok((select count(*)=1 from public.audit_events where actor_id=pg_temp.id(2) and action='create'
 and target_type='sections' and target_id=(select id from created)),'a criação entra uma vez na auditoria');

set local role authenticated;
select pg_temp.login(1);
create temporary table grouped as select public.app_admin_default_section(pg_temp.id(201)) id;
select pg_temp.ok((select id from grouped) is distinct from pg_temp.id(300),
 'módulo com seções ganha a sua seção automática à parte');
select public.app_admin_save('lessons',null,jsonb_build_object('section_id',(select id from created),
 'slug','primeira','title','Primeira aula','duration_seconds',60,'status','published'));
select public.app_admin_save('lessons',null,jsonb_build_object('section_id',pg_temp.id(300),
 'slug','agrupada','title','Aula agrupada','duration_seconds',60,'status','published'));
select public.app_admin_save('lessons',null,jsonb_build_object('section_id',(select id from grouped),
 'slug','solta','title','Aula solta','duration_seconds',60,'status','published'));
select pg_temp.denied(format('select public.app_admin_save(%L,%L,%L)','sections',(select id from created),'{"status":"draft"}'),
 'a seção automática não vira rascunho');
select pg_temp.denied(format('select public.app_admin_save(%L,%L,%L)','sections',(select id from created),'{"is_bonus":true}'),
 'a seção automática não vira bônus');
select pg_temp.denied(format('select public.app_admin_save(%L,%L,%L)','sections',(select id from created),'{"order_index":0}'),
 'a seção automática não sai do topo');
select pg_temp.denied(format('select public.app_admin_save(%L,%L,%L)','sections',(select id from created),'{"is_default":false}'),
 'a marca automática não muda pelo editor');
select pg_temp.denied(format('select public.app_admin_save(%L,null,%L)','sections',
 jsonb_build_object('module_id',pg_temp.id(201),'title','Antes','order_index',-1,'status','published')),
 'seção comum não passa à frente da automática');
reset role;

select pg_temp.denied(format('update public.sections set status=%L,previous_status=%L where id=%L','archived','published',(select id from created)),
 'a tabela recusa arquivar a seção automática');
select pg_temp.denied(format('insert into public.sections(module_id,title,status,order_index,is_default) values(%L,%L,%L,-1,true)',
 pg_temp.id(200),'Outra','published'),'a tabela recusa duas seções automáticas no mesmo módulo');

set local role authenticated;
select pg_temp.login(4);
create temporary table outline as select public.app_course('secao-automatica') detail;
reset role;
select pg_temp.ok((select jsonb_path_query_array(detail,'$.modules[*].sections[*].is_default')
 ='[true,true,false]'::jsonb from outline),'o aluno recebe a marca e a seção automática vem primeiro');
select pg_temp.ok((select jsonb_path_query_array(detail,'$.modules[*].sections[*].lessons[*].title')
 ='["Primeira aula","Aula solta","Aula agrupada"]'::jsonb from outline),'o aluno vê as aulas soltas antes das agrupadas');
select pg_temp.ok((select cardinality(required_lesson_ids)=3 from public.courses where id=pg_temp.id(100)),
 'as aulas soltas contam para o certificado');

select count(*) as default_section_assertions from default_section_checks;
rollback;
