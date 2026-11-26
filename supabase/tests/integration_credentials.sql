\set ON_ERROR_STOP on
begin;
create temporary table integration_results(name text primary key);
grant insert on integration_results to anon,authenticated,service_role;
create function pg_temp.assert(ok boolean,name text) returns void language plpgsql as $$
begin
 if ok is distinct from true then raise exception 'FAIL: %',name; end if;
 insert into integration_results values(name);
end $$;
create function pg_temp.denied(statement text,name text,expected text default null) returns void language plpgsql as $$
declare rejected boolean:=false;
begin
 begin execute statement;
 exception when insufficient_privilege or sqlstate 'P0001' or sqlstate 'PT429' or sqlstate 'PT503' then
  rejected:=expected is null or sqlstate=expected;
 end;
 perform pg_temp.assert(rejected,name);
end $$;
create function pg_temp.actor(n integer) returns uuid language sql as $$
 select ('cb200000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
$$;
create function pg_temp.sid(n integer) returns uuid language sql as $$
 select ('cb210000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
$$;
create function pg_temp.login(n integer,aal text) returns void language plpgsql as $$
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.actor(n),'session_id',pg_temp.sid(n),'role','authenticated','aal',aal)::text,true);
 perform set_config('request.headers',jsonb_build_object('x-icarus-session-id',pg_temp.sid(n),'x-icarus-aal',aal)::text,true);
end $$;
create function pg_temp.confirm(n integer,token text) returns void language plpgsql as $$
begin
 perform public.app_confirm_reauth(pg_temp.actor(n),pg_temp.sid(n),encode(extensions.digest(token,'sha256'),'hex'));
end $$;

insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
select pg_temp.actor(n),'integra-'||n||'@example.test',now(),'{"icarus_server_created":true}',jsonb_build_object('full_name','DEMONSTRAÇÃO Integrações '||n)
from generate_series(1,3) n;
set constraints all immediate;
set constraints all deferred;
update public.profiles set role='admin' where id in (pg_temp.actor(2),pg_temp.actor(3));
insert into auth.sessions(id,user_id,aal,created_at,updated_at) values
 (pg_temp.sid(1),pg_temp.actor(1),'aal1',now(),now()),
 (pg_temp.sid(2),pg_temp.actor(2),'aal2',now(),now()),
 (pg_temp.sid(3),pg_temp.actor(3),'aal1',now(),now());
insert into auth.mfa_factors(id,user_id,friendly_name,factor_type,status,created_at,updated_at)
values(pg_temp.sid(12),pg_temp.actor(2),'DEMONSTRAÇÃO MFA','totp','verified',now(),now());
insert into public.app_sessions(id,user_id,expires_at)
select pg_temp.sid(n),pg_temp.actor(n),now()+interval '15 minutes' from generate_series(1,3) n;

-- Os pedidos e o limite são testados sem IP, identidades reais ou chamadas externas.
update public.legal_versions set published=false where published;
insert into public.legal_versions(id,kind,version,title,body,published,demo) values
 (pg_temp.sid(21),'terms','integration-fixture','Termos de teste','CONTEÚDO SINTÉTICO PARA O ENSAIO DE CHECKOUT',true,false),
 (pg_temp.sid(22),'privacy','integration-fixture','Privacidade de teste','CONTEÚDO SINTÉTICO PARA O ENSAIO DE CHECKOUT',true,false);
insert into public.plans(id,slug,name,price_cents,access_months,active)
values(pg_temp.sid(23),'integration-fixture','Plano sintético',1200,1,true);
create function pg_temp.reserve(n integer,p_mode text default 'sandbox',p_fingerprint text default null) returns jsonb language sql as $$
 select public.app_checkout_begin(null,pg_temp.sid(23),'integration-fixture-'||n,'PIX',1,
  jsonb_build_object('name','Comprador de teste','email','integration-'||n||'@example.test','document','00000000000'),
  array[pg_temp.sid(21),pg_temp.sid(22)],false,repeat('a',64),p_mode,p_fingerprint);
$$;

set local role anon;
select pg_temp.denied($q$select public.app_integration_credentials('asaas')$q$,'anon não lê', '42501');
select pg_temp.denied($q$select public.app_admin_save_integration(null,'bunny','{}',null)$q$,'anon não grava', '42501');
reset role;
set local role authenticated;
select pg_temp.login(1,'aal1');
select pg_temp.denied($q$select public.app_integration_credentials('asaas')$q$,'membro não lê', '42501');
select pg_temp.denied($q$select public.app_admin_save_integration(pg_temp.actor(1),'bunny','{"api_key":"fake-bunny"}',null)$q$,
 'membro não grava', '42501');
select pg_temp.login(2,'aal2');
select pg_temp.denied($q$select public.app_integration_credentials('asaas')$q$,'admin não lê a credencial', '42501');
select pg_temp.denied($q$select decrypted_secret from vault.decrypted_secrets$q$,'admin não lê a visão do Vault', '42501');
select pg_temp.denied($q$select public.app_admin_asaas_production(pg_temp.actor(2),'test',repeat('a',64),null)$q$,
 'admin não cria aprovação pelo PostgREST', '42501');
reset role;

set local role service_role;
select pg_temp.login(1,'aal1');
select pg_temp.denied($q$select public.app_admin_save_integration(pg_temp.actor(1),'bunny','{"api_key":"fake-bunny"}',null)$q$,
 'a Edge não grava em nome do membro', '42501');
select pg_temp.login(3,'aal1');
select pg_temp.confirm(3,'fake-admin-without-mfa');
select pg_temp.denied($q$select public.app_admin_save_integration(pg_temp.actor(3),'bunny','{"api_key":"fake-bunny"}','fake-admin-without-mfa')$q$,
 'admin sem MFA não grava mesmo com nonce', '42501');
select pg_temp.login(2,'aal1');
select pg_temp.denied($q$select public.app_admin_save_integration(pg_temp.actor(2),'bunny','{"api_key":"fake-bunny"}',null)$q$,
 'AAL1 rejeitado quando há 2FA');
select pg_temp.login(2,'aal2');
select pg_temp.denied($q$select public.app_admin_save_integration(pg_temp.actor(2),'bunny','{"api_key":"fake-bunny"}','fake-invalid-nonce')$q$,
 'admin AAL2 sem reautenticação não grava');
select pg_temp.confirm(2,'fake-bunny-write');
select pg_temp.denied($q$select public.app_admin_save_integration(pg_temp.actor(2),'bunny','{"cdn_host":"https://example.test/path"}','fake-bunny-write')$q$,
 'hostname aceita somente domínio');
select public.app_admin_save_integration(pg_temp.actor(2),'bunny',
 '{"library_id":"1234","api_key":"fake-stream-value","cdn_host":"vz-fixture.b-cdn.net","token_key":"fake-player-value"}','fake-bunny-write');
select pg_temp.assert(public.app_integration_credentials('bunny')->>'token_key'='fake-player-value'
 and public.app_integration_credentials('bunny')->>'_updated_by' = pg_temp.actor(2)::text
 and public.app_integration_credentials('bunny')?'_updated_at','serviço lê segredo e metadados');
select pg_temp.denied($q$select public.app_admin_save_integration(pg_temp.actor(2),'bunny','{"api_key":"fake-other-bunny"}','fake-bunny-write')$q$,'nonce de uso único');

select pg_temp.confirm(2,'fake-asaas-write');
select public.app_admin_save_integration(pg_temp.actor(2),'asaas',
 jsonb_build_object('env','production','api_key','fake-production-key'),'fake-asaas-write');
select pg_temp.assert(not (public.app_integration_credentials('asaas')?'_production_active_hash'),
 'salvar Produção não libera cobrança');
select pg_temp.confirm(2,'fake-enable');
select pg_temp.denied($q$select public.app_admin_asaas_production(pg_temp.actor(2),'enable',repeat('b',64),'fake-enable')$q$,
 'não pode ligar sem teste aprovado');
select public.app_admin_asaas_production(pg_temp.actor(2),'test',repeat('b',64));
select pg_temp.denied($q$select public.app_admin_asaas_production(pg_temp.actor(2),'enable',repeat('c',64),'fake-enable')$q$,
 'não pode ligar com teste de outras credenciais');
reset role;
select vault.update_secret(v.id,(v.decrypted_secret::jsonb||jsonb_build_object('_production_tested_at',now()-interval '25 hours'))::text)
from vault.decrypted_secrets v where v.name='icarus_integration_asaas';
set local role service_role;
select pg_temp.denied($q$select public.app_admin_asaas_production(pg_temp.actor(2),'enable',repeat('b',64),'fake-enable')$q$,
 'não pode ligar com aprovação expirada');
select public.app_admin_asaas_production(pg_temp.actor(2),'test',repeat('b',64));
select public.app_admin_asaas_production(pg_temp.actor(2),'enable',repeat('b',64),'fake-enable');
select pg_temp.assert(public.app_integration_credentials('asaas')->>'_production_active_hash'=repeat('b',64),
 'teste recente com credenciais atuais permite ligar');
select pg_temp.reserve(0,'production',repeat('b',64)) as production_order \gset
select pg_temp.assert(:'production_order'::jsonb->>'asaas_environment'='production'
 and public.app_payment_context((:'production_order'::jsonb->>'order_id')::uuid)->>'asaas_environment'='production',
 'reserva e conciliação preservam o ambiente de Produção');
select pg_temp.confirm(2,'fake-provision-key');
select public.app_admin_save_integration(pg_temp.actor(2),'asaas','{"env":"production","api_key":"fake-rotated-production"}','fake-provision-key');
select pg_temp.assert(not (public.app_integration_credentials('asaas') ?| array['_production_active_hash','_production_test_hash']),
 'trocar chave desliga e exige novo teste');
select pg_temp.confirm(2,'fake-disable');
select public.app_admin_asaas_production(pg_temp.actor(2),'disable',null,'fake-disable');
select pg_temp.confirm(2,'fake-throttled-attempt');
select pg_temp.denied($q$select public.app_admin_save_integration(pg_temp.actor(2),'bunny','{"api_key":"fake-other-bunny"}','fake-throttled-attempt')$q$,
 'sexta alteração recusa com 429', 'PT429');
reset role;
select pg_temp.assert(
 (select count(*)=6 and not bool_or(to_jsonb(a)::text ~ 'fake-stream-value|fake-player-value|fake-production-key|fake-rotated-production')
 from public.audit_events a where actor_id=pg_temp.actor(2) and target_type in ('asaas','bunny')),
 'escritas e interruptor auditados sem valores');
set local role authenticated;
select pg_temp.login(2,'aal2');
select pg_temp.assert(public.app_bootstrap()::text !~ 'fake-stream-value|fake-player-value|fake-rotated-production'
 and public.app_public_context()::text !~ 'fake-stream-value|fake-player-value|fake-rotated-production','contextos de navegador sem segredos');
reset role;

set local role service_role;
select pg_temp.denied($q$select pg_temp.reserve(0,'production',repeat('b',64))$q$,
 'Produção desativada recusa na reserva com 503','PT503');
select pg_temp.assert((select count(*)=59 from generate_series(1,59)n
 where (pg_temp.reserve(n)->>'create_gateway')::boolean),'59 pedidos de Sandbox completam a cota com o de Produção');
select pg_temp.denied('select pg_temp.reserve(60)','61º pedido recusado globalmente sem IP','PT429');
select pg_temp.assert((select not (pg_temp.reserve(1)->>'create_gateway')::boolean)
 and pg_temp.reserve(1)->>'asaas_environment'='sandbox','reatentativa preserva ambiente e não ocupa a cota');
reset role;
select pg_temp.assert((select count(*)=60 from public.orders where plan_id=pg_temp.sid(23)),
 'nenhum pedido parcial criado após o 429');
select count(*) from integration_results;
rollback;
