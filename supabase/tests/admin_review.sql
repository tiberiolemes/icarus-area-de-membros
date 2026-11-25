\set ON_ERROR_STOP on
begin;
create temporary table admin_review_results(name text primary key);
grant all on admin_review_results to anon,authenticated,service_role;
create function pg_temp.assert(ok boolean,name text) returns void language plpgsql as $$ begin
 if ok is distinct from true then raise exception 'FAIL: %',name;end if;insert into admin_review_results values(name);
end $$;
create function pg_temp.denied(sql_text text,name text) returns void language plpgsql as $$ declare rejected boolean:=false;begin
 begin execute sql_text;exception when insufficient_privilege or sqlstate 'P0001' then rejected:=true;end;
 perform pg_temp.assert(rejected,name);
end $$;
create function pg_temp.id(n integer) returns uuid language sql immutable as $$ select ('e5000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
create function pg_temp.login(n integer) returns void language plpgsql as $$ begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.id(n),'role','authenticated','aal','aal1','session_id',('e5100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid)::text,true);
end $$;
-- 1 admin, 2 moderador, 3 autor, 4 quem denuncia e pede dados
insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data) select pg_temp.id(n),'admin-review-'||n||'@example.test',now(),'{"icarus_server_created":true}',jsonb_build_object('full_name','DEMONSTRAÇÃO Revisão '||n) from generate_series(1,4)n;
set constraints all immediate;
update public.profiles set role='admin' where id=pg_temp.id(1);
update public.profiles set role='moderator' where id=pg_temp.id(2);
insert into auth.sessions(id,user_id,created_at,updated_at,aal) select ('e5100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,pg_temp.id(n),now(),now(),'aal1' from generate_series(1,4)n;
insert into public.spaces(id,name,status,access_mode) values(pg_temp.id(10),'DEMONSTRAÇÃO espaço','published','members');
insert into public.posts(id,space_id,author_id,title,body,status) values
 (pg_temp.id(20),pg_temp.id(10),pg_temp.id(3),'Rotina de estudos','Corpo da publicação denunciada, com texto suficiente para o trecho.','approved'),
 (pg_temp.id(21),pg_temp.id(10),pg_temp.id(3),'Publicação removida','Texto que a moderação removeu.','removed');
insert into public.replies(id,post_id,author_id,body,status) values(pg_temp.id(30),pg_temp.id(20),pg_temp.id(3),'Resposta com QA-LINK suspeito.','approved');
insert into public.reports(id,actor_id,post_id,reply_id,reason,status,created_at) values
 (pg_temp.id(40),pg_temp.id(4),pg_temp.id(21),null,'QA-REVISAO conteúdo antigo','resolved',now()-interval '2 days'),
 (pg_temp.id(41),pg_temp.id(4),pg_temp.id(20),null,'QA-REVISAO fora do tema','pending',now()-interval '1 day'),
 (pg_temp.id(42),pg_temp.id(4),null,pg_temp.id(30),'QA-REVISAO link suspeito','pending',now());
insert into public.privacy_requests(id,user_id,kind,status) values(pg_temp.id(50),pg_temp.id(4),'export','pending'),(pg_temp.id(51),pg_temp.id(3),'deletion','completed');

-- Moderador vê o conteúdo denunciado; só o admin vê quem denunciou.
select pg_temp.login(2);
set local role authenticated;
create temporary table r as select public.app_admin_reports('QA-REVISAO',1) v;
select pg_temp.assert((select (v->>'total')::int from r)=3,'moderador lista as 3 denúncias');
select pg_temp.assert((select v->'items'->0->>'id' from r)=pg_temp.id(42)::text and (select v->'items'->1->>'id' from r)=pg_temp.id(41)::text,'pendentes primeiro, mais recentes antes');
select pg_temp.assert((select v->'items'->2->>'status' from r)='resolved','resolvida por último');
select pg_temp.assert((select v->'items'->0->>'target_type' from r)='reply' and (select v->'items'->0->>'post_id' from r)=pg_temp.id(20)::text,'resposta aponta o post onde está');
select pg_temp.assert((select v->'items'->0->>'title' from r)='Rotina de estudos' and (select v->'items'->0->>'excerpt' from r)='Resposta com QA-LINK suspeito.','resposta traz título do post e trecho');
select pg_temp.assert((select v->'items'->1->>'author_name' from r)='DEMONSTRAÇÃO Revisão 3' and (select v->'items'->1->>'author_id' from r)=pg_temp.id(3)::text,'autor do conteúdo');
select pg_temp.assert(not exists(select 1 from r,jsonb_array_elements(v->'items') x where x->'reporter_name' is distinct from 'null'::jsonb),'moderador recebe nome de quem denunciou como nulo');
select pg_temp.denied($q$select public.app_admin_list('reports')$q$,'moderador sem acesso ao identificador na lista genérica');
select pg_temp.assert((select v->'items'->2->>'target_status' from r)='removed' and (select v->'items'->2->>'title' from r)='Publicação removida','alvo removido continua legível');
select pg_temp.assert((public.app_admin_reports('QA-LINK',1)->>'total')::int=1,'busca no conteúdo denunciado');
select pg_temp.denied('select public.app_admin_privacy_requests()','moderador sem pedidos LGPD');
select pg_temp.denied($q$select public.app_admin_set_privacy_request(pg_temp.id(50),'processing','Análise iniciada.')$q$,'moderador não registra atendimento');
reset role;
select pg_temp.login(4);
set local role authenticated;
select pg_temp.denied('select public.app_admin_reports()','membro sem denúncias');
select pg_temp.denied('select public.app_admin_privacy_requests()','membro sem pedidos LGPD');
reset role;

-- Admin vê quem denunciou e registra o atendimento auditado dos pedidos LGPD.
select pg_temp.login(1);
set local role authenticated;
select pg_temp.assert((public.app_admin_reports('QA-REVISAO',1)->'items'->1->>'reporter_name')='DEMONSTRAÇÃO Revisão 4','admin vê o nome de quem denunciou');
create temporary table p as select public.app_admin_privacy_requests('Revisão',1) v;
select pg_temp.assert((select (v->>'total')::int from p)=2,'admin lista os pedidos');
select pg_temp.assert((select x->>'full_name' from p,jsonb_array_elements(v->'items') x where x->>'id'=pg_temp.id(50)::text)='DEMONSTRAÇÃO Revisão 4','titular do pedido');
select pg_temp.assert((select x->>'user_id' from p,jsonb_array_elements(v->'items') x where x->>'id'=pg_temp.id(50)::text)=pg_temp.id(4)::text,'id do titular para a ficha');
select pg_temp.assert(exists(select 1 from jsonb_array_elements(public.app_admin_privacy_requests('Exportação de dados',1)->'items') x where x->>'id'=pg_temp.id(50)::text),'busca pelo rótulo da tela');
select pg_temp.assert(public.app_admin_set_privacy_request(pg_temp.id(50),'processing','Análise iniciada.')->>'status'='processing','pendente para em análise');
select pg_temp.assert(public.app_admin_set_privacy_request(pg_temp.id(50),'completed','Exportação enviada ao titular.')->>'status'='completed','em análise para concluído');
select pg_temp.denied($q$select public.app_admin_set_privacy_request(pg_temp.id(50),'rejected','Tentativa após encerrar.')$q$,'pedido encerrado não muda');
select pg_temp.denied($q$select public.app_admin_set_privacy_request(pg_temp.id(51),'processing','Reabrir concluído.')$q$,'pedido concluído não reabre');
select pg_temp.denied($q$select public.app_admin_set_privacy_request(pg_temp.id(50),'pending','Voltar.')$q$,'status inválido');
reset role;
select pg_temp.assert((select status from public.privacy_requests where id=pg_temp.id(50))='completed','estado gravado');
select pg_temp.assert((select count(*) from public.audit_events where target_type='privacy_request' and target_id=pg_temp.id(50))=2,'duas decisões auditadas');
select pg_temp.assert(exists(select 1 from public.audit_events where target_id=pg_temp.id(50) and action='privacy:completed' and actor_id=pg_temp.id(1) and reason='Exportação enviada ao titular.'),'auditoria com ator, ação e motivo');
insert into public.privacy_requests(id,user_id,kind,status) values(pg_temp.id(52),pg_temp.id(4),'deletion','pending');
select pg_temp.login(1);
set local role authenticated;
select pg_temp.denied($q$select public.app_admin_set_privacy_request(pg_temp.id(52),'rejected','Oi')$q$,'motivo curto recusado');
select pg_temp.denied($q$select public.app_admin_set_privacy_request(pg_temp.id(99),'rejected','Pedido inexistente.')$q$,'pedido inexistente recusado');
reset role;

-- Privilégios: anon não executa, authenticated executa
select pg_temp.assert(not has_function_privilege('anon','public.app_admin_reports(text,integer)','execute'),'anon sem denúncias');
select pg_temp.assert(not has_function_privilege('anon','public.app_admin_privacy_requests(text,integer)','execute'),'anon sem pedidos');
select pg_temp.assert(not has_function_privilege('anon','public.app_admin_set_privacy_request(uuid,text,text)','execute'),'anon sem atendimento');
select pg_temp.assert(has_function_privilege('authenticated','public.app_admin_set_privacy_request(uuid,text,text)','execute'),'authenticated executa e o papel é conferido dentro');
select count(*) as admin_review_assertions from admin_review_results;
rollback;
