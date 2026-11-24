\set ON_ERROR_STOP on
begin;
create temporary table logout_results(name text primary key);
grant all on logout_results to authenticated;
create function pg_temp.assert(ok boolean,name text) returns void language plpgsql as $$ begin
 if ok is distinct from true then raise exception 'FAIL: %',name;end if;insert into logout_results values(name);
end $$;
create function pg_temp.denied(sql_text text,name text) returns void language plpgsql as $$ declare rejected boolean:=false;begin
 begin execute sql_text;exception when insufficient_privilege then rejected:=true;end;
 perform pg_temp.assert(rejected,name);
end $$;
create function pg_temp.id(n integer) returns uuid language sql immutable as $$ select ('f0000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data) values(pg_temp.id(1),'logout-fixture-a@example.test',now(),'{"icarus_server_created":true}'),(pg_temp.id(2),'logout-fixture-b@example.test',now(),'{"icarus_server_created":true}');
set constraints all immediate;
insert into auth.sessions(id,user_id,created_at,updated_at,aal) values(pg_temp.id(11),pg_temp.id(1),now(),now(),'aal1'),(pg_temp.id(12),pg_temp.id(1),now(),now(),'aal1'),(pg_temp.id(21),pg_temp.id(2),now(),now(),'aal1');
insert into public.ica_app_sessions(id,user_id,expires_at) values(pg_temp.id(11),pg_temp.id(1),now()+interval '2 hours'),(pg_temp.id(12),pg_temp.id(1),now()+interval '2 hours'),(pg_temp.id(21),pg_temp.id(2),now()+interval '2 hours');
insert into public.ica_reauth_nonces(token_hash,actor_id,session_id,expires_at,consumed_at) values(repeat('1',64),pg_temp.id(1),pg_temp.id(11),now()+interval '5 minutes',null),(repeat('2',64),pg_temp.id(1),pg_temp.id(12),now()+interval '5 minutes',now()),(repeat('3',64),pg_temp.id(2),pg_temp.id(21),now()+interval '5 minutes',null);
insert into public.ica_audit_events(id,actor_id,action,target_type,target_id) values(pg_temp.id(31),pg_temp.id(1),'DEMONSTRAÇÃO reauth pending','app_sessions',pg_temp.id(11)),(pg_temp.id(32),pg_temp.id(1),'DEMONSTRAÇÃO reauth consumed','app_sessions',pg_temp.id(12)),(pg_temp.id(33),pg_temp.id(2),'DEMONSTRAÇÃO third party','app_sessions',pg_temp.id(21));
select pg_temp.assert((select confdeltype='c' from pg_constraint where conrelid='public.ica_reauth_nonces'::regclass and conname='ica_reauth_nonces_session_id_fkey'),'nonce FK is ON DELETE CASCADE');
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.id(1),'session_id',pg_temp.id(11),'role','authenticated','aal','aal1')::text,true) as scoped_claims \gset
set local role authenticated;
select pg_temp.denied('delete from auth.sessions where user_id=pg_temp.id(1)','browser cannot bypass native logout by deleting Auth sessions');
select pg_temp.denied('delete from public.ica_app_sessions where user_id=pg_temp.id(2)','browser cannot delete third party app sessions');
select pg_temp.denied('delete from public.ica_reauth_nonces where actor_id=pg_temp.id(2)','browser cannot delete third party nonce');
reset role;
-- Database cascade is tested here; actual global AuthSDK logout belongs to the native test.
delete from auth.sessions where id=pg_temp.id(11);
select pg_temp.assert(not exists(select 1 from public.ica_app_sessions where id=pg_temp.id(11)),'native-session delete cascades app session');
select pg_temp.assert(not exists(select 1 from public.ica_reauth_nonces where session_id=pg_temp.id(11)),'pending nonce discarded with its session');
select pg_temp.assert(exists(select 1 from public.ica_reauth_nonces where session_id=pg_temp.id(12) and consumed_at is not null),'other own session consumed nonce still present');
select pg_temp.assert(exists(select 1 from public.ica_audit_events where id=pg_temp.id(31)),'pending nonce session audit preserved');
delete from auth.sessions where user_id=pg_temp.id(1);
select pg_temp.assert(not exists(select 1 from public.ica_app_sessions where user_id=pg_temp.id(1)),'all own app sessions cascade on global session delete');
select pg_temp.assert(not exists(select 1 from public.ica_reauth_nonces where actor_id=pg_temp.id(1)),'consumed nonce also discarded');
select pg_temp.assert((select count(*)=2 from public.ica_audit_events where actor_id=pg_temp.id(1)),'own audit history preserved after global session delete');
select pg_temp.assert(exists(select 1 from auth.sessions where id=pg_temp.id(21) and user_id=pg_temp.id(2)),'third party Auth session preserved');
select pg_temp.assert(exists(select 1 from public.ica_app_sessions where id=pg_temp.id(21) and user_id=pg_temp.id(2)),'third party app session preserved');
select pg_temp.assert(exists(select 1 from public.ica_reauth_nonces where session_id=pg_temp.id(21) and actor_id=pg_temp.id(2)),'third party nonce preserved');
select pg_temp.assert(exists(select 1 from public.ica_audit_events where id=pg_temp.id(33)),'third party audit preserved');
select pg_temp.assert(not has_table_privilege('authenticated','public.ica_reauth_nonces','DELETE'),'nonce DELETE grant remains closed');
select count(*) as logout_assertions from logout_results;
rollback;
