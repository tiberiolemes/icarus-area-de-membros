\set ON_ERROR_STOP on
begin;

create temporary table bunny_search_checks(name text primary key);
grant insert on bunny_search_checks to service_role;
create function pg_temp.ok(condition boolean, label text) returns void language plpgsql as $$
begin
 if condition is distinct from true then raise exception 'FAIL: %', label; end if;
 insert into bunny_search_checks values(label);
end $$;
create function pg_temp.refused(statement text, label text, expected text) returns void language plpgsql as $$
declare got text;
begin
 begin execute statement;
 exception when others then got:=sqlstate;
 end;
 perform pg_temp.ok(got=expected,label);
end $$;
create function pg_temp.id(n integer) returns uuid language sql immutable as $$
 select ('b5000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;
create function pg_temp.as_service(n integer) returns void language sql as $$
 select set_config('request.headers',jsonb_build_object('x-icarus-session-id',pg_temp.id(40+n),'x-icarus-aal','aal1')::text,true)
$$;
create function pg_temp.search(n integer) returns text language sql as $$
 select format('select public.app_staff_bunny_search_throttle(%L)',pg_temp.id(n))
$$;

insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
select pg_temp.id(n),'bunny-search-'||n||'@example.test',now(),'{"icarus_server_created":true}',
 jsonb_build_object('full_name','Busca fictícia '||n) from generate_series(1,2)n;
set constraints all immediate;
update public.profiles set role=case id when pg_temp.id(1) then 'instructor' else 'member' end
 where id in (select pg_temp.id(n) from generate_series(1,2)n);
insert into auth.sessions(id,user_id,created_at,updated_at,aal)
select pg_temp.id(40+n),pg_temp.id(n),now(),now(),'aal1' from generate_series(1,2)n;
insert into public.app_sessions(id,user_id,expires_at)
select pg_temp.id(40+n),pg_temp.id(n),now()+interval '15 minutes' from generate_series(1,2)n;

set local role service_role;
select pg_temp.as_service(2);
select pg_temp.refused(pg_temp.search(2),'membro não busca vídeos do Bunny','42501');
select pg_temp.refused(pg_temp.search(1),'sessão de outra pessoa não vale para o instrutor','P0001');
select pg_temp.as_service(1);
do $$ begin for i in 1..30 loop perform public.app_staff_bunny_search_throttle(pg_temp.id(1)); end loop; end $$;
select pg_temp.ok(true,'instrutor busca 30 vezes no mesmo minuto');
select pg_temp.refused(pg_temp.search(1),'a 31ª busca do minuto é recusada','PT429');
reset role;

select pg_temp.ok(not has_function_privilege('authenticated','public.app_staff_bunny_search_throttle(uuid)','execute')
 and not has_function_privilege('anon','public.app_staff_bunny_search_throttle(uuid)','execute')
 and not has_function_privilege('public','public.app_staff_bunny_search_throttle(uuid)','execute')
 and has_function_privilege('service_role','public.app_staff_bunny_search_throttle(uuid)','execute'),
 'só o servidor chama o limite da busca no Bunny');

select count(*) as bunny_search_assertions from bunny_search_checks;
rollback;
