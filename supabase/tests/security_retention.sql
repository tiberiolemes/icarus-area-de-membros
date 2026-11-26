\set ON_ERROR_STOP on
begin;

create function pg_temp.expect(p_ok boolean, p_label text) returns void language plpgsql as $$
begin
 if p_ok is distinct from true then raise exception 'FAIL: %', p_label; end if;
end $$;
create function pg_temp.denied(p_statement text, p_prefix text) returns void language plpgsql as $$
begin
 begin
  execute p_statement;
 exception when sqlstate 'P0001' then
  perform pg_temp.expect(starts_with(sqlerrm,p_prefix),p_prefix);
  return;
 end;
 raise exception 'FAIL (autorizou): %',p_prefix;
end $$;
create function pg_temp.uid(n integer) returns uuid language sql immutable as $$
 select ('a2800000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;
create function pg_temp.login(n integer) returns void language sql as $$
 select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.uid(n),'role','authenticated','aal','aal1','session_id',pg_temp.uid(n+10))::text,true)::text
$$;

insert into auth.users (id,email,email_confirmed_at,raw_app_meta_data)
 select pg_temp.uid(n),'security-retention-'||n||'@example.test',now(),'{"icarus_server_created":true}'
 from generate_series(1,2) n;
set constraints all immediate;
insert into auth.sessions (id,user_id,aal,created_at,updated_at)
 select pg_temp.uid(n+10),pg_temp.uid(n),'aal1',now(),now() from generate_series(1,2) n;
insert into public.app_sessions(id,user_id,expires_at) values
 (pg_temp.uid(11),pg_temp.uid(1),now()+interval '2 hours'),
 (pg_temp.uid(12),pg_temp.uid(2),now()-interval '2 days');

insert into public.rate_limits(actor_id,bucket,window_start,count) values
 (pg_temp.uid(1),'reauth_hour',date_trunc('hour',now()),20),
 (pg_temp.uid(2),'expired_fixture',now()-interval '3 days',1);
set local role service_role;
select pg_temp.denied('select public.app_reauth_throttle(pg_temp.uid(1))','Muitas solicitações');
reset role;

select pg_temp.login(1);
insert into public.rate_limits(actor_id,bucket,window_start,count)
 select pg_temp.uid(1),bucket,date_trunc('minute',now()),60
 from unnest(array['feed','materials','podcasts','live_events']) bucket;
set local role authenticated;
select pg_temp.denied('select public.app_feed()', 'Muitas solicitações');
select pg_temp.denied('select public.app_materials()', 'Muitas solicitações');
select pg_temp.denied('select public.app_podcasts()', 'Muitas solicitações');
select pg_temp.denied('select public.app_live_events()', 'Muitas solicitações');
reset role;

select set_config('request.headers',jsonb_build_object('x-icarus-session-id',pg_temp.uid(11),'x-icarus-aal','aal1')::text,true);
set local role service_role;
select pg_temp.expect(public.app_upload_access(pg_temp.uid(1),'avatar',pg_temp.uid(1),'foto.jpg','image/jpeg',512000)?'path','JPG de 500 KiB permitido');
select pg_temp.expect(public.app_upload_access(pg_temp.uid(1),'avatar',pg_temp.uid(1),'foto.png','image/png',512000)?'path','PNG de 500 KiB permitido');
select pg_temp.denied($$select public.app_upload_access(pg_temp.uid(1),'avatar',pg_temp.uid(1),'foto.jpg','image/jpeg',512001)$$,'A foto precisa');
select pg_temp.denied($$select public.app_upload_access(pg_temp.uid(1),'avatar',pg_temp.uid(1),'foto.webp','image/webp',10)$$,'A foto precisa');
reset role;

insert into public.reauth_nonces(token_hash,actor_id,session_id,expires_at) values
 (repeat('a',64),pg_temp.uid(1),pg_temp.uid(11),now()-interval '1 minute'),
 (repeat('b',64),pg_temp.uid(1),pg_temp.uid(11),now()+interval '5 minutes'),
 (repeat('c',64),pg_temp.uid(2),pg_temp.uid(12),now()+interval '5 minutes');
insert into public.audit_events(id,action,target_type,created_at)
 values(pg_temp.uid(20),'retention-test','fixture',now()-interval '500 days');

select app_private.reap_security_state(500);
select pg_temp.expect(not exists(select 1 from public.rate_limits where bucket='expired_fixture'),'limite vencido removido');
select pg_temp.expect(exists(select 1 from public.rate_limits where actor_id=pg_temp.uid(1) and bucket='reauth_hour'),'janela atual preservada');
select pg_temp.expect(not exists(select 1 from public.reauth_nonces where token_hash in (repeat('a',64),repeat('c',64))),'nonces vencidos ou da sessão encerrada removidos');
select pg_temp.expect(exists(select 1 from public.reauth_nonces where token_hash=repeat('b',64)),'nonce válido preservado');
select pg_temp.expect(not exists(select 1 from public.app_sessions where id=pg_temp.uid(12)),'sessão Icarus vencida removida');
select pg_temp.expect(exists(select 1 from public.audit_events where id=pg_temp.uid(20)),'auditoria preservada');
select pg_temp.expect(not has_function_privilege('anon','app_private.reap_security_state(integer)','EXECUTE')
 and not has_function_privilege('authenticated','app_private.reap_security_state(integer)','EXECUTE'), 'manutenção inacessível ao navegador');
select pg_temp.login(2);
set local role authenticated;
select pg_temp.denied('select public.app_bootstrap()', 'Sessão expirada');
reset role;
delete from auth.sessions where id=pg_temp.uid(12);
select pg_temp.expect(not exists(select 1 from app_private.retired_sessions where id=pg_temp.uid(12)),'marcador removido junto com a sessão Auth');
select 18;
rollback;
