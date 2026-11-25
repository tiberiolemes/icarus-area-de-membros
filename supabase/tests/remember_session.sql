\set ON_ERROR_STOP on
begin;
create temporary table remember_results(name text primary key);
grant all on remember_results to anon,authenticated,service_role;
create function pg_temp.assert(ok boolean,name text) returns void language plpgsql as $$ begin
 if ok is distinct from true then raise exception 'FAIL: %',name;end if;insert into remember_results values(name);
end $$;
create function pg_temp.denied(sql_text text,name text) returns void language plpgsql as $$ declare rejected boolean:=false;begin
 begin execute sql_text;exception when insufficient_privilege or sqlstate 'P0001' then rejected:=true;end;
 perform pg_temp.assert(rejected,name);
end $$;
create function pg_temp.id(n integer) returns uuid language sql immutable as $$ select ('e8000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
create function pg_temp.sid(n integer) returns uuid language sql immutable as $$ select ('e8100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
create function pg_temp.login(n integer,aal text default 'aal2') returns void language plpgsql as $$ begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.id(n),'role','authenticated','aal',aal,'session_id',pg_temp.sid(n))::text,true);
end $$;
create function pg_temp.headers(n integer,aal text default 'aal2') returns void language plpgsql as $$ begin
 perform set_config('request.headers',jsonb_build_object('x-icarus-session-id',pg_temp.sid(n),'x-icarus-aal',aal)::text,true);
end $$;

-- 1 membro e 3 admin acabaram de passar pelo código; 2 só pela senha; 4 sem fator; 5 com o código há 6 min; 6 com sessão de 16 dias.
insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data) select pg_temp.id(n),'remember-'||n||'@example.test',now(),'{"icarus_server_created":true}',jsonb_build_object('full_name','DEMONSTRAÇÃO lembrar '||n) from generate_series(1,6)n;
set constraints all immediate;
update public.profiles set role='admin' where id=pg_temp.id(3);
insert into auth.mfa_factors(id,user_id,friendly_name,factor_type,status,created_at,updated_at) select pg_temp.id(10+n),pg_temp.id(n),'DEMONSTRAÇÃO '||n,'totp','verified',now(),now() from unnest(array[1,2,3,5,6])n;
insert into auth.sessions(id,user_id,created_at,updated_at,aal) select pg_temp.sid(n),pg_temp.id(n),case n when 6 then now()-interval '16 days' else now()-interval '1 minute' end,now(),case when n in (2,4) then 'aal1' else 'aal2' end::auth.aal_level from generate_series(1,6)n;
insert into auth.mfa_amr_claims(id,session_id,created_at,updated_at,authentication_method) select pg_temp.id(20+n),pg_temp.sid(n),now(),case n when 5 then now()-interval '6 minutes' else now() end,'totp' from unnest(array[1,3,5,6])n;
insert into auth.mfa_amr_claims(id,session_id,created_at,updated_at,authentication_method) select pg_temp.id(30+n),pg_temp.sid(n),now(),now(),'password' from generate_series(1,6)n;

select pg_temp.assert(not has_function_privilege('anon','public.app_remember_session()','EXECUTE') and has_function_privilege('authenticated','public.app_remember_session()','EXECUTE'),'remember RPC closed to anon, open to authenticated');
select pg_temp.assert(not has_table_privilege('authenticated','public.app_sessions','SELECT,INSERT,UPDATE,DELETE') and not has_table_privilege('anon','public.app_sessions','SELECT,INSERT,UPDATE,DELETE'),'app_sessions still closed to the browser');

-- Sem o código recente, não marca.
select pg_temp.login(2,'aal1');
set local role authenticated;
select pg_temp.denied('select public.app_remember_session()','password-only session cannot remember');
reset role;
select pg_temp.login(4,'aal1');
set local role authenticated;
select pg_temp.assert(public.app_bootstrap()?'profile','member without factor still enters');
select pg_temp.denied('select public.app_remember_session()','member without factor cannot remember');
reset role;
select pg_temp.login(5);
set local role authenticated;
select pg_temp.denied('select public.app_remember_session()','code older than five minutes cannot remember');
reset role;
select pg_temp.login(6);
set local role authenticated;
select pg_temp.denied('select public.app_remember_session()','session older than fifteen days cannot remember');
reset role;
select pg_temp.assert((select count(*)=0 from public.app_sessions where remember_until is not null),'refused calls left no remembered session');

-- Com o código recente, lembra por 15 dias contados do login, sem prolongar.
select pg_temp.login(1);
set local role authenticated;
select public.app_remember_session()->>'expires_at' as first_limit \gset
select public.app_remember_session()->>'expires_at' as second_limit \gset
reset role;
select pg_temp.assert(:'first_limit'::timestamptz=(select created_at+interval '15 days' from auth.sessions where id=pg_temp.sid(1)),'member remembered for fifteen days from login');
select pg_temp.assert(:'second_limit'::timestamptz=:'first_limit'::timestamptz,'second call does not extend');
select pg_temp.assert((select expires_at=remember_until and remember_until=:'first_limit'::timestamptz from public.app_sessions where id=pg_temp.sid(1)),'session expiry follows the fixed limit');
update auth.mfa_amr_claims set updated_at=now() where session_id=pg_temp.sid(1);
update public.app_sessions set remember_until=remember_until-interval '1 day',expires_at=expires_at-interval '1 day' where id=pg_temp.sid(1);
select pg_temp.login(1);
set local role authenticated;
select public.app_remember_session()->>'expires_at' as third_limit \gset
reset role;
select pg_temp.assert(:'third_limit'::timestamptz=(select created_at+interval '14 days' from auth.sessions where id=pg_temp.sid(1)),'new code does not restart the fifteen days');
select pg_temp.login(3);
set local role authenticated;
select pg_temp.assert(public.app_remember_session()?'expires_at','admin remembered too');
reset role;

-- Parada além da inatividade: lembrada continua; sem lembrar, cai como hoje.
update public.app_sessions set last_activity_at=now()-interval '3 hours' where id in (pg_temp.sid(1),pg_temp.sid(3));
insert into auth.sessions(id,user_id,created_at,updated_at,aal) values(pg_temp.sid(7),pg_temp.id(1),now(),now(),'aal2'),(pg_temp.sid(8),pg_temp.id(3),now(),now(),'aal2');
insert into public.app_sessions(id,user_id,last_activity_at,expires_at) values(pg_temp.sid(7),pg_temp.id(1),now()-interval '121 minutes',now()+interval '1 hour'),(pg_temp.sid(8),pg_temp.id(3),now()-interval '31 minutes',now()+interval '1 hour');
select pg_temp.login(1);
set local role authenticated;
select pg_temp.assert(public.app_catalog()?'items','remembered member survives two hours idle');
select public.app_touch_session(true)->>'expires_at' as touched_limit \gset
select pg_temp.assert((public.app_touch_session(false)->>'remembered')::boolean,'touch reports remembered session');
reset role;
select pg_temp.assert(:'touched_limit'::timestamptz=(select remember_until from public.app_sessions where id=pg_temp.sid(1)),'activity keeps the fixed limit');
select pg_temp.login(3);
set local role authenticated;
select pg_temp.assert(public.app_bootstrap()?'profile' and public.app_catalog()?'items','remembered admin survives thirty minutes idle');
reset role;
set local role service_role;
select pg_temp.headers(3);
select pg_temp.assert(public.app_confirm_reauth(pg_temp.id(3),pg_temp.sid(3),repeat('a',64))?'expires_at','edge accepts remembered admin');
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.id(1),'role','authenticated','aal','aal2','session_id',pg_temp.sid(7))::text,true);
set local role authenticated;
select pg_temp.denied('select public.app_catalog()','unremembered member still expires after two hours');
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.id(3),'role','authenticated','aal','aal2','session_id',pg_temp.sid(8))::text,true);
set local role authenticated;
select pg_temp.denied('select public.app_bootstrap()','unremembered admin still expires after thirty minutes');
reset role;
set local role service_role;
select set_config('request.headers',jsonb_build_object('x-icarus-session-id',pg_temp.sid(8),'x-icarus-aal','aal2')::text,true);
select pg_temp.denied(format('select public.app_confirm_reauth(%L,%L,%L)',pg_temp.id(3),pg_temp.sid(8),repeat('b',64)),'edge refuses idle unremembered admin');
reset role;

-- AAL2 continua obrigatório, mesmo com a marca gravada à força numa sessão só com senha.
update public.app_sessions set remember_until=now()+interval '1 day',expires_at=now()+interval '1 day' where id=pg_temp.sid(2);
insert into public.app_sessions(id,user_id,expires_at,remember_until) select pg_temp.sid(2),pg_temp.id(2),now()+interval '1 day',now()+interval '1 day' where not exists(select 1 from public.app_sessions where id=pg_temp.sid(2));
select pg_temp.login(2,'aal1');
set local role authenticated;
select pg_temp.denied('select public.app_catalog()','remembered row does not replace AAL2 in SQL');
reset role;
set local role service_role;
select pg_temp.headers(2,'aal1');
select pg_temp.denied(format('select public.app_confirm_reauth(%L,%L,%L)',pg_temp.id(2),pg_temp.sid(2),repeat('c',64)),'remembered row does not replace AAL2 at the edge');
reset role;

-- Depois dos 15 dias, o login volta.
update public.app_sessions set remember_until=remember_until-interval '15 days',expires_at=expires_at-interval '15 days' where id=pg_temp.sid(1);
select pg_temp.login(1);
set local role authenticated;
select pg_temp.denied('select public.app_catalog()','fifteen days later the session ends');
select pg_temp.denied('select public.app_touch_session(true)','activity cannot revive the ended session');
reset role;

-- Sair remove a sessão nativa, e a lembrada vai junto.
delete from auth.sessions where id=pg_temp.sid(3);
select pg_temp.assert(not exists(select 1 from public.app_sessions where id=pg_temp.sid(3)),'sign out removes the remembered session');
select pg_temp.login(3);
set local role authenticated;
select pg_temp.denied('select public.app_bootstrap()','signed out admin cannot return');
reset role;

select count(*) as remember_assertions from remember_results;
rollback;
