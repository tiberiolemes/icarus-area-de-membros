\set ON_ERROR_STOP on
begin;

create temp table feedback_checks(name text primary key);
create temp table feedback_values(label text primary key, value jsonb);
grant insert on feedback_checks to anon,authenticated,service_role;
grant select,insert on feedback_values to authenticated,service_role;

create function pg_temp.ok(condition boolean,label text) returns void language plpgsql as $$
begin
 if condition is distinct from true then raise exception 'FAIL: %',label; end if;
 insert into feedback_checks values(label);
end $$;
create function pg_temp.denied(statement text,label text) returns void language plpgsql as $$
begin
 begin execute statement;
 exception when insufficient_privilege or sqlstate 'P0001' then perform pg_temp.ok(true,label); return;
 end;
 raise exception 'FAIL (autorizou): %',label;
end $$;
create function pg_temp.id(n integer) returns uuid language sql immutable as $$
 select ('03100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;
create function pg_temp.login(n integer, aal text default 'aal1') returns void language sql as $$
 select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.id(n),'role','authenticated',
  'aal',aal,'session_id',pg_temp.id(10+n))::text,true)
$$;
create function pg_temp.edge_session(n integer, aal text default 'aal1') returns void language sql as $$
 select set_config('request.headers',jsonb_build_object('x-icarus-session-id',pg_temp.id(10+n),'x-icarus-aal',aal)::text,true)
$$;
create function pg_temp.field(p_label text,p_field text) returns text language sql stable as $$
 select value->>p_field from feedback_values where label=p_label
$$;
create function pg_temp.key(p_label text) returns uuid language sql stable as $$
 select pg_temp.field(p_label,'id')::uuid
$$;

insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
select pg_temp.id(n),'feedback-'||n||'@example.test',now(),'{"icarus_server_created":true}',
 jsonb_build_object('full_name','Ator '||n) from generate_series(1,7) n;
set constraints all immediate;
insert into auth.sessions(id,user_id,created_at,updated_at,aal)
select pg_temp.id(10+n),pg_temp.id(n),now(),now(),case when n between 3 and 6 then 'aal2'::auth.aal_level else 'aal1'::auth.aal_level end
from generate_series(1,7) n;
insert into public.app_sessions(id,user_id,expires_at) select pg_temp.id(10+n),pg_temp.id(n),now()+interval '20 minutes'
 from generate_series(1,7) n;
update public.profiles set role='support' where id=pg_temp.id(3);
update public.profiles set role='moderator' where id=pg_temp.id(4);
update public.profiles set role='admin' where id in (pg_temp.id(5),pg_temp.id(7));
update public.profiles set role='instructor' where id=pg_temp.id(6);
insert into auth.mfa_factors(id,user_id,friendly_name,factor_type,status,created_at,updated_at)
values(pg_temp.id(51),pg_temp.id(5),'Teste de MFA','totp','verified',now(),now());

select pg_temp.ok((select relrowsecurity from pg_class where oid='public.feedbacks'::regclass)
 and not exists(select from unnest(array['anon','authenticated','service_role']) r where
  has_table_privilege(r,'public.feedbacks','SELECT, INSERT, UPDATE, DELETE, TRUNCATE')),'RLS e ACL da tabela');
select pg_temp.ok(not exists(select from unnest(array['app_submit_feedback(uuid,text,text,uuid,text,text)',
 'app_admin_feedbacks(text,text,integer)','app_admin_feedback(uuid)','app_admin_feedback_status(uuid,text,integer)','app_export_data()']) sig
 where has_function_privilege('anon','public.'||sig,'EXECUTE') or has_function_privilege('service_role','public.'||sig,'EXECUTE')
  or not has_function_privilege('authenticated','public.'||sig,'EXECUTE')),'ACL RPCs autenticadas');
select pg_temp.ok(not exists(select from unnest(array['app_feedback_screenshot_reserve(uuid,uuid,text,bigint)',
 'app_feedback_screenshot_access(uuid,uuid)']) sig where has_function_privilege('anon','public.'||sig,'EXECUTE')
 or has_function_privilege('authenticated','public.'||sig,'EXECUTE') or not has_function_privilege('service_role','public.'||sig,'EXECUTE')),
 'ACL RPCs somente serviço');
select pg_temp.ok(not (select public from storage.buckets where id='icarus-private'),'bucket privado');

set local role anon;
select pg_temp.denied('select public.app_admin_feedbacks()','anon sem acesso à fila');
select pg_temp.denied('select public.app_submit_feedback(null,null,null)','anon sem envio');
reset role;
set local role authenticated;
select pg_temp.denied('select public.app_submit_feedback(null,null,null)','sem sessão sem envio');
select pg_temp.login(1);
select pg_temp.denied('select * from public.feedbacks','membro sem leitura direta');
select pg_temp.denied('update public.feedbacks set status=''done''','membro sem escrita direta');
select pg_temp.denied('select public.app_admin_feedbacks()','membro sem fila');
select pg_temp.denied('select public.app_feedback_screenshot_access(null,null)','membro sem RPC de assinatura');
select pg_temp.denied($$select public.app_submit_feedback(pg_temp.id(100),'bug','   ' || chr(10))$$,'descrição vazia');
select pg_temp.denied($$select public.app_submit_feedback(pg_temp.id(100),'bug',repeat('a',4001))$$,'descrição longa');
select pg_temp.denied($$select public.app_submit_feedback(pg_temp.id(100),'planned','texto')$$,'tipo fora da lista');
select pg_temp.denied($$select public.app_submit_feedback(pg_temp.id(100),'bug','texto',null,'/app/cursos?token=sintetico#identificador')$$,'query e hash rejeitados');
select pg_temp.denied($$select public.app_submit_feedback(pg_temp.id(100),'bug','texto',null,'/app/suporte/chamado-especifico')$$,'valor de rota dinâmica rejeitado');
select pg_temp.denied($$select public.app_submit_feedback(pg_temp.id(100),'bug','texto',null,null,'Chrome/202.3; detalhe')$$,'user agent integral rejeitado');
reset role;

set local role service_role;
select pg_temp.edge_session(1);
select pg_temp.denied($$select public.app_feedback_screenshot_reserve(pg_temp.id(2),pg_temp.id(201),'image/png',16)$$,'sessão Edge não troca o autor');
select pg_temp.denied($$select public.app_feedback_screenshot_reserve(pg_temp.id(1),pg_temp.id(201),'application/pdf',16)$$,'tipo inválido no serviço');
select pg_temp.denied($$select public.app_feedback_screenshot_reserve(pg_temp.id(1),pg_temp.id(201),'image/png',5242881)$$,'tamanho inválido no serviço');
insert into feedback_values values('print',public.app_feedback_screenshot_reserve(pg_temp.id(1),pg_temp.id(201),'image/png',16));
select pg_temp.ok((public.app_feedback_screenshot_reserve(pg_temp.id(1),pg_temp.id(201),'image/png',16)->>'id')::uuid=pg_temp.key('print'),'repetição mantém a reserva');
select pg_temp.denied($$select public.app_feedback_screenshot_reserve(pg_temp.id(1),pg_temp.id(201),'image/png',17)$$,'mesma reserva recusa outros metadados');
select pg_temp.denied($$select public.app_upload_finalize(pg_temp.id(1),pg_temp.key('print'))$$,'finalização aguarda Storage');
reset role;

set local role authenticated;
select pg_temp.login(1);
select pg_temp.denied($$insert into storage.objects(bucket_id,name) values('icarus-private',pg_temp.field('print','path'))$$,'Storage nega gravação direta do autor na reserva');
select pg_temp.denied($$select public.app_submit_feedback(pg_temp.id(101),'bug','relato legítimo',pg_temp.key('print'))$$,'print pendente não vincula');
reset role;
insert into storage.objects(bucket_id,name,metadata) values('icarus-private',pg_temp.field('print','path'),'{"mimetype":"image/png","size":16}');
set local role service_role;
select pg_temp.edge_session(2);
select pg_temp.denied($$select public.app_upload_finalize(pg_temp.id(2),pg_temp.key('print'))$$,'outro membro não finaliza');
select pg_temp.edge_session(1);
select pg_temp.ok(public.app_upload_finalize(pg_temp.id(1),pg_temp.key('print'))->>'state'='ready','autor confirma Storage com metadados corretos');
select pg_temp.denied($$select public.app_feedback_screenshot_access(pg_temp.id(1),pg_temp.key('print'))$$,'armazenado sem feedback não pode ser assinado');
reset role;

set local role authenticated;
select pg_temp.login(2);
select pg_temp.denied($$select public.app_submit_feedback(pg_temp.id(101),'bug','relato de terceiro',pg_temp.key('print'))$$,'outro membro não vincula print');
insert into feedback_values values('outro',public.app_submit_feedback(pg_temp.id(101),'other','relato de outro autor'));
select pg_temp.login(1);
insert into feedback_values values('relato',public.app_submit_feedback(pg_temp.id(101),'bug',E' relato legítimo\n',pg_temp.key('print'),'/app/cursos/:curso/:modulo/:aula','Firefox'));
select pg_temp.ok((public.app_submit_feedback(pg_temp.id(101),'bug','relato legítimo',pg_temp.key('print'),'/app/cursos/:curso/:modulo/:aula','Firefox')->>'id')::uuid=pg_temp.key('relato'),'envio repetido retorna ID do titular');
select pg_temp.denied($$select public.app_submit_feedback(pg_temp.id(101),'suggestion','relato legítimo',pg_temp.key('print'),'/app/cursos/:curso/:modulo/:aula','Firefox')$$,'mesma tentativa recusa outro tipo');
select pg_temp.denied($$select public.app_submit_feedback(pg_temp.id(101),'bug','relato alterado',pg_temp.key('print'),'/app/cursos/:curso/:modulo/:aula','Firefox')$$,'mesma tentativa recusa outra descrição');
select pg_temp.denied($$select public.app_submit_feedback(pg_temp.id(101),'bug','relato legítimo',null,'/app/cursos/:curso/:modulo/:aula','Firefox')$$,'mesma tentativa recusa a retirada do print');
select pg_temp.denied($$select public.app_submit_feedback(pg_temp.id(101),'bug','relato legítimo',pg_temp.key('print'),'/app/suporte','Firefox')$$,'mesma tentativa recusa outra origem');
select pg_temp.denied($$select public.app_submit_feedback(pg_temp.id(101),'bug','relato legítimo',pg_temp.key('print'),'/app/cursos/:curso/:modulo/:aula','Safari')$$,'mesma tentativa recusa outro navegador');
select pg_temp.denied($$select public.app_submit_feedback(pg_temp.id(102),'bug','relato duplicado',pg_temp.key('print'))$$,'print não vincula duas vezes');
select pg_temp.ok((select count(*) from storage.objects where bucket_id='icarus-private' and name=pg_temp.field('print','path'))=0,'Storage nega leitura direta do autor');
with changed as (update storage.objects set metadata='{}' where bucket_id='icarus-private' and name=pg_temp.field('print','path') returning id)
select pg_temp.ok(not exists(select from changed),'Storage nega atualização direta do autor');
select pg_temp.denied($$delete from storage.objects where bucket_id='icarus-private' and name=pg_temp.field('print','path')$$,
 'Storage bloqueia exclusão SQL direta');
with data as materialized (select public.app_export_data()->'feedbacks' as feedbacks)
select pg_temp.ok((feedbacks->0)->>'body'='relato legítimo' and jsonb_array_length(feedbacks)=1
 and not (feedbacks->0 ?| array['attempt_key','storage_path','author_id','email']),'export de um titular sem metadados privados') from data;
select pg_temp.denied($$select public.app_admin_feedback(pg_temp.key('relato'))$$,'membro sem detalhe administrativo');
select pg_temp.login(3,'aal2');
select pg_temp.denied('select public.app_admin_feedbacks()','suporte AAL2 sem fila');
select pg_temp.login(4,'aal2');
select pg_temp.denied($$select public.app_admin_feedback_status(pg_temp.key('relato'),'done',1)$$,'moderador AAL2 sem transição');
select pg_temp.login(6,'aal2');
select pg_temp.denied($$select public.app_admin_feedback(pg_temp.key('relato'))$$,'instrutor AAL2 sem detalhe');
select pg_temp.login(5);
select pg_temp.denied('select public.app_admin_feedbacks()','JWT AAL1 sem fila mesmo com sessão Auth AAL2');
select pg_temp.login(7);
select pg_temp.ok(public.app_admin_feedbacks('bug','new')->>'total'='1','admin sem fator consulta a fila com AAL1');
select pg_temp.ok(public.app_admin_feedback(pg_temp.key('relato'))->>'screenshot_id'=pg_temp.key('print')::text,
 'admin sem fator consulta detalhe com AAL1');
select pg_temp.ok(public.app_admin_feedback_status(pg_temp.key('relato'),'new',1)->>'revision'='1',
 'admin sem fator chama transição idempotente com AAL1');
select pg_temp.login(5,'aal2');
select pg_temp.ok(public.app_admin_feedbacks('bug','new')->>'total'='1' and
 public.app_admin_feedbacks('bug','new')->'counts'->>'new'='1' and
 not (public.app_admin_feedbacks('bug','new')->'items'->0 ?| array['screenshot_id','storage_path','browser_family','body','email']),
 'admin AAL2 filtra no servidor e recebe resumo mínimo');
select pg_temp.ok(public.app_admin_feedback(pg_temp.key('relato'))->>'author_name'='Ator 1' and
 public.app_admin_feedback(pg_temp.key('relato'))->>'screenshot_id'=pg_temp.key('print')::text,'admin AAL2 vê autor real e referência do print');
select pg_temp.ok(public.app_admin_feedback_status(pg_temp.key('relato'),'reviewing',1)->>'revision'='2','transição para em análise');
select pg_temp.denied($$select public.app_admin_feedback_status(pg_temp.key('relato'),'done',1)$$,'revisão antiga não sobrescreve');
select pg_temp.ok(public.app_admin_feedback_status(pg_temp.key('relato'),'planned',2)->>'revision'='3','transição para planejado');
select pg_temp.ok(public.app_admin_feedback_status(pg_temp.key('relato'),'done',3)->>'revision'='4','transição para feito');
select pg_temp.ok(public.app_admin_feedback_status(pg_temp.key('relato'),'done',3)->>'revision'='4','retry idempotente da transição concluída');
select pg_temp.ok(public.app_admin_feedback_status(pg_temp.key('relato'),'new',4)->>'revision'='5','correção para novo');
select pg_temp.ok(jsonb_array_length(public.app_export_data()->'feedbacks')=0,'export do admin não contém relatos de terceiros');
reset role;
select pg_temp.ok((select count(*) from public.audit_events where action='feedback.status' and target_type='feedback'
 and target_id=pg_temp.key('relato') and actor_id=pg_temp.id(5) and reason in ('new -> reviewing','reviewing -> planned','planned -> done','done -> new'))=4,
 'transições auditadas uma vez com ator, origem e destino');

insert into public.feedbacks(author_id,attempt_key,kind,body,created_at)
 select pg_temp.id(2),pg_temp.id(300+n),'bug','Relato numerado '||n,now()-n*interval '1 second'
 from generate_series(1,22) n;
set local role authenticated;
select pg_temp.login(5,'aal2');
with pages as materialized (select public.app_admin_feedbacks('bug','new',1) at_first,
 public.app_admin_feedbacks('bug','new',2) at_second)
select pg_temp.ok((at_first->>'total')::int=23 and jsonb_array_length(at_first->'items')=20
 and jsonb_array_length(at_second->'items')=3 and at_first->'items'->0->>'id'=pg_temp.key('relato')::text,
 'páginas de vinte itens com filtro e ordem definidos antes do limite') from pages;
reset role;

set local role service_role;
select pg_temp.edge_session(2);
select pg_temp.denied($$select public.app_feedback_screenshot_access(pg_temp.id(2),pg_temp.key('print'))$$,'outro membro não assina print');
select pg_temp.edge_session(3,'aal2');
select pg_temp.denied($$select public.app_feedback_screenshot_access(pg_temp.id(3),pg_temp.key('print'))$$,'suporte AAL2 não assina print de terceiro');
select pg_temp.edge_session(7);
select pg_temp.ok(public.app_feedback_screenshot_access(pg_temp.id(7),pg_temp.key('print'))->>'can_access'='true',
 'admin sem fator autoriza mídia com AAL1');
select pg_temp.edge_session(5);
select pg_temp.denied($$select public.app_feedback_screenshot_access(pg_temp.id(5),pg_temp.key('print'))$$,
 'admin com fator e AAL1 não assina print');
select pg_temp.edge_session(5,'aal2');
select pg_temp.ok(public.app_feedback_screenshot_access(pg_temp.id(5),pg_temp.key('print'))->>'can_access'='true','admin AAL2 autoriza mídia');
select pg_temp.edge_session(1);
select pg_temp.ok(public.app_feedback_screenshot_access(pg_temp.id(1),pg_temp.key('print'))->>'can_access'='true','titular autoriza mídia');
reset role;
update public.app_sessions set revoked_at=now() where id=pg_temp.id(11);
set local role service_role;
select pg_temp.denied($$select public.app_feedback_screenshot_access(pg_temp.id(1),pg_temp.key('print'))$$,'sessão revogada não assina print');
reset role;
select count(*) from feedback_checks;
rollback;
