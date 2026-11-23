\set ON_ERROR_STOP on
begin;
create temporary table auth_test_results(name text primary key);
grant all on auth_test_results to authenticated,service_role;
create function pg_temp.assert(ok boolean,name text) returns void language plpgsql as $$ begin
 if ok is distinct from true then raise exception 'FAIL: %',name;end if;insert into auth_test_results values(name);
end $$;
update app_private.local_demo_guard set enabled=false;
do $$
declare rejected boolean:=false;begin
 begin
  insert into auth.users(id,email,raw_user_meta_data) values('a0000000-0000-4000-8000-000000000099','forged-local@example.test','{"icarus_server_created":true,"icarus_local_demo":true,"role":"admin"}');
  set constraints all immediate;
 exception when sqlstate 'P0001' then rejected:=true;end;
 perform pg_temp.assert(rejected,'user_metadata forgery rejected at constraint execution');
 perform pg_temp.assert(not exists(select 1 from public.profiles where id='a0000000-0000-4000-8000-000000000099'),'deferred rejection rolls profile back');
end $$;
set constraints all deferred;
-- Native order: INSERT with empty app metadata, followed by Admin metadata UPDATE, then commit validation.
insert into auth.users(id,email,raw_user_meta_data) values('a0000000-0000-4000-8000-000000000001','server-created@example.test','{"role":"admin","icarus_password_setup_required":false,"full_name":"DEMONSTRAÇÃO"}');
select pg_temp.assert(exists(select 1 from public.profiles where id='a0000000-0000-4000-8000-000000000001' and role='member'),'immediate profile defaults to member');
select pg_temp.assert(not exists(select 1 from auth.users where id='a0000000-0000-4000-8000-000000000001' and email_confirmed_at is not null),'profile creation does not confirm email');
update auth.users set raw_app_meta_data='{"icarus_server_created":true,"icarus_password_setup_required":true}',email_confirmed_at=now() where id='a0000000-0000-4000-8000-000000000001';
set constraints all immediate;
select pg_temp.assert(exists(select 1 from public.profiles where id='a0000000-0000-4000-8000-000000000001' and password_setup_required),'constraint reselects final app metadata');
select pg_temp.assert(not exists(select 1 from public.subscriptions where user_id='a0000000-0000-4000-8000-000000000001'),'server marker never grants a plan');
set constraints all deferred;
do $$
declare rejected boolean:=false;begin
 begin
  insert into auth.users(id,email,raw_app_meta_data) values('a0000000-0000-4000-8000-000000000002','guarded-demo@example.test','{"icarus_server_created":true,"icarus_local_demo":true}');
  set constraints all immediate;
 exception when sqlstate 'P0001' then rejected:=true;end;
 perform pg_temp.assert(rejected,'demo marker requires privileged guard at final validation');
end $$;
set constraints all deferred;
update app_private.local_demo_guard set enabled=true;
insert into auth.users(id,email,raw_app_meta_data) values('a0000000-0000-4000-8000-000000000002','guarded-demo@example.test','{"icarus_server_created":true,"icarus_local_demo":true}');
set constraints all immediate;
select pg_temp.assert(exists(select 1 from public.profiles where id='a0000000-0000-4000-8000-000000000002' and role='member'),'guarded demo member validated');
update app_private.local_demo_guard set enabled=false;
insert into auth.sessions(id,user_id,created_at,updated_at,aal) values('a1000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001',now(),now(),'aal1');
select set_config('request.jwt.claims','{"sub":"a0000000-0000-4000-8000-000000000001","session_id":"a1000000-0000-4000-8000-000000000001","aal":"aal1","role":"authenticated"}',true);
set local role authenticated;
select pg_temp.assert((public.app_bootstrap()->'profile'->>'password_setup_required')::boolean,'bootstrap exposes authoritative setup flag');
select pg_temp.assert(public.app_touch_session(false)?'expires_at','setup allows session touch');
do $$ declare denied boolean:=false;begin
 begin perform public.app_catalog();exception when sqlstate 'P0001' then denied:=true;end;
 perform pg_temp.assert(denied,'delivery blocked while password setup pending');
 denied:=false;
 begin perform public.app_profile('{"password_setup_required":false}');exception when sqlstate 'P0001' then denied:=true;end;
 perform pg_temp.assert(denied,'profile cannot clear setup flag');
 denied:=false;
 begin perform public.app_complete_password_setup('a0000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001');exception when insufficient_privilege then denied:=true;end;
 perform pg_temp.assert(denied,'browser cannot complete password setup directly');
end $$;
reset role;
select set_config('request.headers','{"x-icarus-session-id":"a1000000-0000-4000-8000-000000000001","x-icarus-aal":"aal1"}',true);
set local role service_role;
do $$ declare denied boolean:=false;begin
 begin perform public.app_complete_password_setup('a0000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000002');exception when sqlstate 'P0001' then denied:=true;end;
 perform pg_temp.assert(denied,'setup completion binds exact native session');
end $$;
-- Native password update success belongs to Edge/GoTrue acceptance, not a SQL hash assertion.
select pg_temp.assert(not (public.app_complete_password_setup('a0000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001')->>'password_setup_required')::boolean,'service completion clears private flag');
reset role;
set local role authenticated;
select pg_temp.assert(not (public.app_bootstrap()->'profile'->>'password_setup_required')::boolean,'bootstrap does not reapply stale JWT/app flag');
select pg_temp.assert(public.app_catalog()?'items','delivery restored after setup complete');
reset role;
select count(*) as auth_password_assertions from auth_test_results;
rollback;
