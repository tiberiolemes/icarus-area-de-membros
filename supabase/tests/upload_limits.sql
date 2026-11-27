\set ON_ERROR_STOP on
begin;

create temporary table upload_limit_checks(name text primary key);
grant insert on upload_limit_checks to authenticated,service_role;
create function pg_temp.ok(condition boolean, label text) returns void language plpgsql as $$
begin
 if condition is distinct from true then raise exception 'FAIL: %', label; end if;
 insert into upload_limit_checks values(label);
end $$;
create function pg_temp.denied(statement text, label text) returns void language plpgsql as $$
declare denied boolean:=false;
begin
 begin execute statement;
 exception when insufficient_privilege or sqlstate 'P0001' or check_violation then denied:=true;
 end;
 perform pg_temp.ok(denied,label);
end $$;
create function pg_temp.id(n integer) returns uuid language sql immutable as $$
 select ('11a00000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;
create function pg_temp.login(n integer) returns void language sql as $$
 select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.id(n),'role','authenticated',
  'aal','aal1','session_id',pg_temp.id(40+n))::text,true)
$$;
create function pg_temp.as_service(n integer) returns void language sql as $$
 select set_config('request.headers',jsonb_build_object('x-icarus-session-id',pg_temp.id(40+n),'x-icarus-aal','aal1')::text,true)
$$;
create function pg_temp.reserve(n integer,kind text,resource uuid,name text,mime text,size bigint) returns text language sql as $$
 select format('select public.app_upload_access(%L,%L,%L,%L,%L,%s)',pg_temp.id(n),kind,resource,name,mime,size)
$$;

insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
select pg_temp.id(n),'upload-limit-'||n||'@example.test',now(),'{"icarus_server_created":true}',
 jsonb_build_object('full_name','Envio fictício '||n) from generate_series(1,2)n;
set constraints all immediate;
update public.profiles set role=case id when pg_temp.id(1) then 'admin' else 'member' end
 where id in (select pg_temp.id(n) from generate_series(1,2)n);
insert into auth.sessions(id,user_id,created_at,updated_at,aal)
select pg_temp.id(40+n),pg_temp.id(n),now(),now(),'aal1' from generate_series(1,2)n;
insert into public.courses(id,slug,title,status,access_mode) values(pg_temp.id(100),'limite-envio','Curso de limite','draft','members');
insert into public.materials(id,name) values(pg_temp.id(101),'Material de limite');
insert into public.tickets(id,user_id,subject,priority) values(pg_temp.id(102),pg_temp.id(2),'Chamado de limite','normal');

select pg_temp.ok(not has_function_privilege('authenticated','public.app_upload_access(uuid,text,uuid,text,text,bigint)','execute')
 and not has_function_privilege('anon','public.app_upload_access(uuid,text,uuid,text,text,bigint)','execute')
 and has_function_privilege('service_role','public.app_upload_access(uuid,text,uuid,text,text,bigint)','execute'),
 'a reserva de envio continua só do servidor');

set local role authenticated;
select pg_temp.login(1);
select public.app_touch_session(false);
select pg_temp.login(2);
select public.app_touch_session(false);
reset role;

set local role service_role;
select pg_temp.as_service(1);
select pg_temp.ok(public.app_upload_access(pg_temp.id(1),'course-cover',pg_temp.id(100),'capa.jpg','image/jpeg',512000)->>'status'='pending',
 'capa de 500 KB é reservada');
select pg_temp.denied(pg_temp.reserve(1,'course-cover',pg_temp.id(100),'capa.jpg','image/jpeg',512001),'capa acima de 500 KB é recusada');
select pg_temp.ok(public.app_upload_access(pg_temp.id(1),'material',pg_temp.id(101),'apostila.pdf','application/pdf',5242880)->>'status'='pending',
 'PDF de material de 5 MB é reservado');
select pg_temp.denied(pg_temp.reserve(1,'material',pg_temp.id(101),'apostila.pdf','application/pdf',5242881),'PDF de material acima de 5 MB é recusado');
select pg_temp.denied(pg_temp.reserve(1,'material',pg_temp.id(101),'apostila.pdf','application/pdf',524288000),'PDF de 500 MB nunca é aceito');
select pg_temp.denied(pg_temp.reserve(1,'material',pg_temp.id(101),'imagem.webp','image/webp',512001),'imagem de material acima de 500 KB é recusada');
select pg_temp.ok(public.app_upload_access(pg_temp.id(1),'material',pg_temp.id(101),'pacote.zip','application/zip',104857600)->>'status'='pending',
 'ZIP de material segue com o limite anterior');
select pg_temp.as_service(2);
select pg_temp.ok(public.app_upload_access(pg_temp.id(2),'ticket-attachment',pg_temp.id(102),'print.png','image/png',512000)->>'status'='pending',
 'imagem de 500 KB no chamado é reservada');
select pg_temp.denied(pg_temp.reserve(2,'ticket-attachment',pg_temp.id(102),'print.png','image/png',512001),'imagem acima de 500 KB no chamado é recusada');
select pg_temp.denied(pg_temp.reserve(2,'ticket-attachment',pg_temp.id(102),'doc.pdf','application/pdf',5242881),'PDF acima de 5 MB no chamado é recusado');
select pg_temp.denied(pg_temp.reserve(2,'material',pg_temp.id(101),'apostila.pdf','application/pdf',1024),'membro continua sem enviar material');
reset role;

select count(*) as upload_limit_assertions from upload_limit_checks;
rollback;
