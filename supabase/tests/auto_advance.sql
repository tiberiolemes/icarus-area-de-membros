\set ON_ERROR_STOP on
begin;

create temporary table auto_advance_checks(name text primary key);
grant insert on auto_advance_checks to authenticated,service_role;
create function pg_temp.ok(condition boolean, label text) returns void language plpgsql as $$
begin
 if condition is distinct from true then raise exception 'FAIL: %', label; end if;
 insert into auto_advance_checks values(label);
end $$;
create function pg_temp.denied(statement text, label text) returns void language plpgsql as $$
declare denied boolean:=false;
begin
 begin execute statement;
 exception when insufficient_privilege or sqlstate 'P0001' or invalid_text_representation then denied:=true;
 end;
 perform pg_temp.ok(denied,label);
end $$;
create function pg_temp.id(n integer) returns uuid language sql immutable as $$
 select ('a0a00000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;

insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
values(pg_temp.id(1),'auto-advance@example.test',now(),'{"icarus_server_created":true}','{"full_name":"Aluno fictício"}');
set constraints all immediate;
insert into auth.sessions(id,user_id,created_at,updated_at,aal) values(pg_temp.id(41),pg_temp.id(1),now(),now(),'aal1');

select pg_temp.ok((select auto_advance=false from public.profiles where id=pg_temp.id(1)),'perfil novo nasce com o avanço automático desligado');

select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.id(1),'role','authenticated','aal','aal1','session_id',pg_temp.id(41))::text,true);
set local role authenticated;
select pg_temp.ok(public.app_profile('{}')->'auto_advance'='false'::jsonb,'perfil devolve auto_advance');
select pg_temp.ok(public.app_profile('{"auto_advance":true}')->'auto_advance'='true'::jsonb,'aluno liga o avanço automático');
select pg_temp.denied($q$select public.app_profile('{"auto_advance":"sim"}')$q$,'texto no lugar de booleano é recusado');
select pg_temp.denied($q$select public.app_profile('{"auto_advance":null}')$q$,'nulo no lugar de booleano é recusado');
select pg_temp.ok(public.app_profile('{"auto_advance":false}')->'auto_advance'='false'::jsonb,'aluno desliga o avanço automático');
reset role;
select pg_temp.ok((select auto_advance=false from public.profiles where id=pg_temp.id(1)),'preferência fica gravada no perfil');

select count(*) as auto_advance_assertions from auto_advance_checks;
rollback;
