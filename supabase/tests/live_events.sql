\set ON_ERROR_STOP on
begin;

create temporary table results(name text primary key);
grant insert,select on results to anon,authenticated;
create function pg_temp.assert(ok boolean,name text) returns void language plpgsql as $$
begin
 if ok is distinct from true then raise exception 'FAIL: %',name;end if;
 insert into results values(name);
end $$;
create function pg_temp.denied(statement text,name text,expected text) returns void language plpgsql as $$
declare rejected boolean:=false;
begin
 begin execute statement;
 exception when insufficient_privilege then rejected:=expected='permission';
 when sqlstate 'P0001' then rejected:=sqlerrm=expected;
 end;
 perform pg_temp.assert(rejected,name);
end $$;
create function pg_temp.id(n integer) returns uuid language sql immutable as $$
 select ('bebe2300-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;
create function pg_temp.login(n integer) returns void language plpgsql as $$
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.id(n),'role','authenticated',
  'aal','aal2','session_id',pg_temp.id(100+n))::text,true);
end $$;

insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
 select pg_temp.id(n),'event-test-'||n||'@example.test',now(),'{"icarus_server_created":true}',
 jsonb_build_object('full_name','DEMONSTRAÇÃO RSVP '||n) from generate_series(1,4)n;
set constraints all immediate;
update public.ica_profiles set role='admin' where id=pg_temp.id(1);
update public.ica_profiles set role='instructor' where id=pg_temp.id(4);
insert into auth.sessions(id,user_id,created_at,updated_at,aal)
 select pg_temp.id(100+n),pg_temp.id(n),now(),now(),'aal2' from generate_series(1,4)n;
insert into public.ica_plans(id,name,slug,price_cents,access_months,active)
 values(pg_temp.id(10),'DEMONSTRAÇÃO plano liberado','event-allow',0,1,true),
 (pg_temp.id(11),'DEMONSTRAÇÃO outro plano','event-deny',0,1,true);
insert into public.ica_subscriptions(user_id,plan_id,starts_at,ends_at,source)
 values(pg_temp.id(2),pg_temp.id(10),now()-interval '1 day',now()+interval '1 day','courtesy'),
 (pg_temp.id(3),pg_temp.id(11),now()-interval '1 day',now()+interval '1 day','courtesy');

create function pg_temp.save(n integer,rev integer,status text,starts timestamptz,
 meeting text default 'https://meet.google.com/aab-bbcd-eee', plans uuid[] default array[pg_temp.id(10)])
returns integer language sql as $$
 select public.app_admin_save_live_event(pg_temp.id(n),rev,'Título privado','Convidado privado','Descrição privada',
  starts at time zone 'America/Sao_Paulo',60,meeting,'https://recordings.example.test/private.mp4','plans',plans,status)
$$;

select pg_temp.assert(not exists(
 select 1 from pg_proc p where p.proname in ('app_live_events','app_live_event_link','app_live_event_rsvp','app_admin_live_events',
  'app_admin_live_event_rsvps','app_admin_save_live_event') and
  (has_function_privilege('anon',p.oid,'execute') or has_function_privilege('service_role',p.oid,'execute')
   or not has_function_privilege('authenticated',p.oid,'execute'))
),'grants efetivos das seis RPCs');
select pg_temp.assert((select count(*)=2 and bool_and(relrowsecurity) from pg_class
 where oid in ('public.ica_live_events'::regclass,'public.ica_live_event_rsvps'::regclass)),'RLS ativa nas duas tabelas');

set local role anon;
select pg_temp.denied('select public.app_live_events()','anon sem RPC','permission');
select pg_temp.denied('select * from public.ica_live_events','anon sem tabela','permission');

set local role authenticated;
select pg_temp.login(1);
select pg_temp.assert(pg_temp.save(20,0,'published',now()+interval '1 day')=1,'admin publica encontro');
select pg_temp.assert(pg_temp.save(21,0,'published',now()-interval '1 day')=1,'admin anexa gravação');
select pg_temp.assert(pg_temp.save(22,0,'draft',now()+interval '2 days')=1,'admin cria rascunho');
select pg_temp.denied($q$select public.app_admin_save_live_event(
 pg_temp.id(23),0,'Teste','Teste','','2018-11-04 00:30',60,'https://meet.google.com/aab-bbcd-eee',null,
 'members','{}','draft')$q$,'hora inexistente por mudança de fuso rejeitada','Confira a data e o horário de Brasília.');
select pg_temp.denied($q$select pg_temp.save(23,0,'published',now(),'https://meet.google.com@malicious.example.test/room')$q$,
 'host da sala validado','Confira os campos obrigatórios, a duração, o acesso e os links HTTPS.');
select pg_temp.denied($q$select pg_temp.save(23,0,'published',now(),plans=>array[pg_temp.id(99)])$q$,
 'plano inexistente rejeitado','Confira os planos e os dados do encontro.');
select pg_temp.denied($q$select pg_temp.save(20,0,'published',now())$q$,
 'reenvio da criação não duplica','O encontro foi atualizado. Abra o cadastro novamente para editar.');

select pg_temp.login(3);
select pg_temp.assert(public.app_live_events()->'items' = jsonb_build_array(
 jsonb_build_object('id',pg_temp.id(20),'starts_at',now()+interval '1 day','can_access',false)),
 'DTO bloqueado só informa agenda e acesso');
select pg_temp.assert(public.app_live_events(true)->'items' = jsonb_build_array(
 jsonb_build_object('id',pg_temp.id(21),'starts_at',now()-interval '1 day','can_access',false)),
 'DTO de gravação bloqueada não expõe conteúdo');
select pg_temp.denied('select public.app_live_event_link(pg_temp.id(20),false)','link direto bloqueado','Link indisponível para este encontro.');
select pg_temp.denied('select public.app_live_event_link(pg_temp.id(21),true)','gravação direta bloqueada','Link indisponível para este encontro.');
select pg_temp.denied('select public.app_live_event_rsvp(pg_temp.id(20),true)','RSVP exige plano','Confirmação indisponível para este encontro.');
select pg_temp.denied('select pg_temp.save(20,1,''archived'',now())','membro não edita','Operação não permitida.');
select pg_temp.denied('select * from public.ica_live_events','membro sem acesso direto a eventos','permission');
select pg_temp.denied('select * from public.ica_live_event_rsvps','membro sem acesso direto a RSVPs','permission');

select pg_temp.login(4);
select pg_temp.denied('select public.app_admin_live_event_rsvps(pg_temp.id(20))','instrutor sem lista de RSVPs','Operação não permitida.');

select pg_temp.login(2);
select pg_temp.assert(public.app_live_events()->'items'->0->>'title'='Título privado'
 and not (public.app_live_events()->'items'->0 ? 'meeting_url'),'DTO autorizado não carrega URL');
select pg_temp.assert(public.app_live_event_link(pg_temp.id(20),false)='https://meet.google.com/aab-bbcd-eee','membro autorizado recebe link da sala');
select pg_temp.assert(public.app_live_event_link(pg_temp.id(21),true)='https://recordings.example.test/private.mp4','membro autorizado recebe gravação');
select pg_temp.denied('select public.app_live_event_link(pg_temp.id(20),true)','gravação futura indisponível','Link indisponível para este encontro.');
select pg_temp.denied('select public.app_live_event_link(pg_temp.id(22),false)','rascunho indisponível','Link indisponível para este encontro.');
select pg_temp.denied('select public.app_live_event_rsvp(pg_temp.id(21),true)','RSVP passado indisponível','Confirmação indisponível para este encontro.');
select pg_temp.assert(public.app_live_event_rsvp(pg_temp.id(20),true),'RSVP confirmado');
select pg_temp.assert(public.app_live_event_rsvp(pg_temp.id(20),true),'confirmação repetida retorna o mesmo estado');

select pg_temp.login(1);
select pg_temp.assert(public.app_admin_live_event_rsvps(pg_temp.id(20))->>'total'='1','admin vê somente um RSVP');
select pg_temp.assert(public.app_admin_live_event_rsvps(pg_temp.id(20))->'items'->0->>'full_name'='DEMONSTRAÇÃO RSVP 2','admin identifica membro');
select pg_temp.assert(public.app_admin_live_events()->>'total'='3','admin lista agenda e rascunho');

select pg_temp.login(2);
select pg_temp.assert(not public.app_live_event_rsvp(pg_temp.id(20),false),'cancelamento confirmado');
select pg_temp.assert(not public.app_live_event_rsvp(pg_temp.id(20),false),'cancelamento idempotente');

select pg_temp.login(1);
select pg_temp.assert(public.app_admin_live_event_rsvps(pg_temp.id(20))->>'total'='0','admin vê cancelamento');
select pg_temp.assert(pg_temp.save(20,1,'archived',now()+interval '1 day')=2,'admin arquiva');
select pg_temp.denied($q$select pg_temp.save(20,1,'published',now()+interval '1 day')$q$,
 'revisão antiga não sobrescreve','O encontro foi atualizado. Abra o cadastro novamente para editar.');

select pg_temp.login(2);
select pg_temp.assert(jsonb_array_length(public.app_live_events()->'items')=0,'arquivado e rascunho fora da agenda');
select pg_temp.denied('select public.app_live_event_link(pg_temp.id(20),false)','arquivado revoga link','Link indisponível para este encontro.');

reset role;
update public.ica_subscriptions set revoked_at=now() where user_id=pg_temp.id(2);
set local role authenticated;
select pg_temp.denied('select public.app_live_event_link(pg_temp.id(21),true)','revogação retira link da gravação','Link indisponível para este encontro.');
reset role;
update public.ica_app_sessions set revoked_at=now() where id=pg_temp.id(102);
set local role authenticated;
select pg_temp.denied('select public.app_live_events()','sessão revogada perde a agenda','Sessão expirada. Entre novamente.');
reset role;

select count(*) from results;
rollback;
