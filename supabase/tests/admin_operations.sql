\set ON_ERROR_STOP on
begin;

create temporary table operations_checks(name text primary key);
grant insert on operations_checks to authenticated;
create function pg_temp.ok(condition boolean, label text) returns void language plpgsql as $$
begin
 if condition is distinct from true then raise exception 'FAIL: %', label; end if;
 insert into operations_checks values(label);
end $$;
create function pg_temp.denied(statement text, label text) returns void language plpgsql as $$
declare denied boolean:=false;
begin
 begin execute statement;
 exception when insufficient_privilege or sqlstate 'P0001' then denied:=true;
 end;
 perform pg_temp.ok(denied,label);
end $$;
create function pg_temp.id(n integer) returns uuid language sql immutable as $$
 select ('e6000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;
create function pg_temp.login(n integer) returns void language sql as $$
 select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.id(n),'role','authenticated',
  'aal','aal1','session_id',pg_temp.id(40+n))::text,true)
$$;

insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
select pg_temp.id(n),'admin-operations-'||n||'@example.test',now(),'{"icarus_server_created":true}',
 jsonb_build_object('full_name','Operação fictícia '||n) from generate_series(1,28)n;
set constraints all immediate;
update public.profiles set role=case id when pg_temp.id(1) then 'admin' when pg_temp.id(2) then 'moderator'
 when pg_temp.id(3) then 'support' when pg_temp.id(4) then 'instructor' else 'member' end,
 suspended=id=pg_temp.id(28) where id in (select pg_temp.id(n) from generate_series(1,28)n);
insert into auth.sessions(id,user_id,created_at,updated_at,aal)
select pg_temp.id(40+n),pg_temp.id(n),now(),now(),'aal1' from generate_series(1,7)n;

insert into public.plans(id,name,slug,price_cents,access_months,active)
values(pg_temp.id(100),'Operação fictícia','admin-operations-plan',9900,12,true);
insert into public.subscriptions(user_id,plan_id,starts_at,ends_at,source)
values(pg_temp.id(5),pg_temp.id(100),now()-interval '1 day',now()+interval '1 day','courtesy');
insert into public.orders(id,user_id,plan_id,attempt_key,amount_cents,access_months,method,installments,buyer_data,receipt_hash,status)
select pg_temp.id(n),pg_temp.id(5),pg_temp.id(100),'operations-attempt-'||n,123450,12,'PIX',1,
 '{"email":"buyer-private@example.test"}',repeat('b',64),'paid' from generate_series(101,121)n;

insert into public.tickets(id,user_id,subject,status,priority,created_at)
select pg_temp.id(n),pg_temp.id(5),'Operação fictícia de suporte '||n,
 case when n=221 then 'waiting_member' else 'open' end,'normal',now()-interval '3 minutes'
from generate_series(201,221)n;
insert into public.ticket_messages(ticket_id,author_id,body,created_at)
values(pg_temp.id(221),pg_temp.id(3),'Resposta fictícia',now()-interval '2 minutes');
insert into public.courses(id,slug,title,status,access_mode,plan_ids)
values(pg_temp.id(300),'operacao-ficticia','Curso fictício','published','plans',array[pg_temp.id(100)]);
insert into public.modules(id,course_id,slug,title,status) values(pg_temp.id(301),pg_temp.id(300),'modulo-teste','Módulo fictício','published');
insert into public.sections(id,module_id,title,status) values(pg_temp.id(302),pg_temp.id(301),'Seção fictícia','published');
insert into public.lessons(id,section_id,slug,title,status,body)
values(pg_temp.id(303),pg_temp.id(302),'aula-ficticia','Aula fictícia','published','Conteúdo pago fictício.');
insert into public.lesson_comments(id,lesson_id,author_id,body,is_instructor) values(pg_temp.id(304),pg_temp.id(303),pg_temp.id(5),'Comentário fictício.',false);
insert into public.spaces(id,name,status,access_mode) values(pg_temp.id(400),'Espaço fictício','published','members');
insert into public.posts(id,space_id,author_id,title,body,status) values
 (pg_temp.id(401),pg_temp.id(400),pg_temp.id(5),'Publicação fictícia','Aguardando decisão.','pending'),
 (pg_temp.id(402),pg_temp.id(400),pg_temp.id(5),'Publicação fictícia','Publicada.','approved');
select app_private.audit(pg_temp.id(1),'create','posts',pg_temp.id(401));
insert into public.audit_events(id,actor_id,action,target_type,target_id,created_at)
select pg_temp.id(n),pg_temp.id(1),'update','profiles',pg_temp.id(5),now()+interval '1 minute'
from generate_series(600,624)n;
insert into public.podcast_episodes(id,youtube_id,kind,title,description,published_at,status,is_featured)
values(pg_temp.id(500),'qaOpExample','podcast','Episódio fictício','Exemplo de QA',now(),'published',true);

set local role authenticated;
select pg_temp.login(1);
select pg_temp.ok(public.app_admin_commercial('profiles','admin-operations-5@example.test')->'items'->0->>'email'
 ='admin-operations-5@example.test','admin recebe o e-mail no diretório');
select pg_temp.ok(public.app_admin_member_detail(pg_temp.id(5))->'profile'->>'email'
 ='admin-operations-5@example.test','admin recebe o e-mail na ficha');
select pg_temp.ok(public.app_admin_commercial('profiles','Operação fictícia',2)->'metrics'
 @> '{"active":27,"suspended":1,"with_plan":1}','indicadores cobrem a busca em todas as páginas');
select pg_temp.ok(public.app_admin_commercial('profiles','Operação fictícia',1,'staff')->>'total'='4','filtro por equipe');
select pg_temp.ok(public.app_admin_commercial('profiles','Operação fictícia',1,null,pg_temp.id(100)::text)->>'total'='1','filtro por plano vigente');
select pg_temp.ok(public.app_admin_commercial('profiles','Operação fictícia',1,null,null,'suspended')->>'total'='1','filtro por suspensão');
select pg_temp.ok(public.app_admin_commercial('orders','R$ 1.234,50',2,null,null,'paid') @>
 '{"total":21,"metrics":{"paid":21,"revenue_cents":2592450}}','pedidos filtram por reais e totalizam todas as páginas');
select pg_temp.ok(not (public.app_admin_commercial('orders','1.234,50')->'items'->0 ?| array['buyer_data','receipt_hash','attempt_key']),'pedidos não retornam dados internos do comprador');
select pg_temp.ok(public.app_admin_audit('',1)->'items'->0->>'id'=pg_temp.id(600)::text
 and jsonb_array_length(public.app_admin_audit('',1)->'items')=20,'auditoria sem busca é ordenada por data e id');
select pg_temp.ok(public.app_admin_audit('',2)->'items'->0->>'id'=pg_temp.id(620)::text
 and (public.app_admin_audit('',2)->>'total')::int>=26,'auditoria sem busca preserva a segunda página e o total');
select pg_temp.ok(public.app_admin_audit('   ',2)=public.app_admin_audit('',2),'busca vazia ignora espaços');
select pg_temp.ok(public.app_admin_audit('Publicação fictícia')->'items'->0 @>
 '{"actor_name":"Operação fictícia 1","action_label":"Criação","target_name":"Publicação fictícia","target_label":"Publicação"}','auditoria localiza o nome e a ação');
select public.app_admin_log_csv_export('profiles',true,'staff',pg_temp.id(100)::text,'suspended');
select public.app_admin_log_csv_export('orders',false,null,null,'paid');
select pg_temp.ok(public.app_admin_audit('Exportação CSV Membros')->'items'->0 @>
 '{"actor_name":"Operação fictícia 1","action_label":"Exportação CSV","target_label":"Membros"}','exportação de membros aparece na auditoria');
select pg_temp.ok(public.app_admin_audit('Exportação CSV Pedidos')->'items'->0 @>
 '{"actor_name":"Operação fictícia 1","action_label":"Exportação CSV","target_label":"Pedidos"}','exportação de pedidos aparece na auditoria');
select pg_temp.denied($q$select public.app_admin_log_csv_export('orders',true,'admin')$q$,'exportação rejeita papel como filtro de pedidos');
select pg_temp.denied($q$select public.app_admin_log_csv_export('courses')$q$,'exportação rejeita tipo fora do contrato');
select pg_temp.ok(public.app_admin_lesson_context(pg_temp.id(300),pg_temp.id(303))->>'lesson_title'='Aula fictícia','editor identifica a aula pelo currículo');
select pg_temp.denied('select public.app_admin_lesson_context(pg_temp.id(399),pg_temp.id(303))','editor rejeita aula de outro curso');
select pg_temp.ok(public.app_admin_archive_podcast(pg_temp.id(500),true)->>'status'='archived','admin arquiva episódio');
select pg_temp.ok(public.app_podcast(pg_temp.id(500),true)->>'is_featured'='false','arquivar retira o destaque');

select pg_temp.login(2);
select pg_temp.denied('select public.app_admin_commercial(''profiles'')','moderador sem diretório ou e-mail');
select pg_temp.denied('select public.app_admin_member_detail(pg_temp.id(5))','moderador sem ficha ou e-mail');
select pg_temp.denied('select public.app_admin_list(''profiles'')','moderador sem diretório legado');
select pg_temp.denied($q$select public.app_admin_log_csv_export('profiles')$q$,'moderador não registra exportações');
select pg_temp.ok(public.app_lesson(pg_temp.id(303)) @> '{"can_access":false}'
 and not (public.app_lesson(pg_temp.id(303))->'lesson' ?| array['body','video_id','storage_path']),
 'moderador sem plano não recebe o conteúdo da aula paga');
select pg_temp.ok(public.app_admin_moderation_queue('posts','Publicação fictícia','pending') @> '{"total":1,"pending":1}',
 'moderação inicia com pendências do filtro');
select pg_temp.ok(exists(select 1 from jsonb_array_elements(public.app_admin_lesson_comment_queue()->'items') r
 where r->>'id'=pg_temp.id(304)::text and r->>'course_title'='Curso fictício' and r->>'lesson_title'='Aula fictícia'
   and r->>'can_open_lesson'='false' and not (r ?| array['video_id','storage_path'])),
 'moderador sem plano vê o comentário pago na fila');
select pg_temp.ok(public.app_moderate_lesson_comment(pg_temp.id(303),pg_temp.id(304),'approve','Aprovação manual.')->>'status'='approved','moderador sem plano aprova comentário pago');

select pg_temp.login(3);
select pg_temp.denied('select public.app_admin_commercial(''profiles'')','suporte sem diretório ou e-mail');
select pg_temp.denied('select public.app_admin_member_detail(pg_temp.id(5))','suporte sem ficha ou e-mail');
select pg_temp.denied('select public.app_admin_list(''profiles'')','suporte sem diretório legado');
select pg_temp.denied($q$select public.app_admin_log_csv_export('orders')$q$,'suporte não registra exportações');
select pg_temp.ok(public.app_admin_ticket_queue('Operação fictícia de suporte','waiting_member','normal') @>
 '{"total":1,"counts":{"open":20,"waiting_member":1},"first_response_seconds":60}',
 'suporte filtra e conta por situação no servidor');
select pg_temp.denied('select public.app_admin_archive_podcast(pg_temp.id(500),false)','suporte não restaura episódio');

select pg_temp.login(4);
select pg_temp.denied('select public.app_admin_commercial(''profiles'')','instrutor sem diretório ou e-mail');
select pg_temp.denied('select public.app_admin_member_detail(pg_temp.id(5))','instrutor sem ficha ou e-mail');
select pg_temp.login(5);
select pg_temp.denied('select public.app_podcast(pg_temp.id(500),false)','aluno não recebe episódio arquivado');
select pg_temp.denied('select public.app_admin_ticket_queue()','aluno sem acesso à fila administrativa');
select pg_temp.denied('select public.app_admin_lesson_comment_queue()','aluno sem acesso à fila de moderação');

select pg_temp.login(6);
select pg_temp.denied('select public.app_admin_lesson_comment_queue()','aluno sem plano não vê comentários da fila');
select pg_temp.denied($q$select public.app_lesson_comments(pg_temp.id(303))$q$,'aluno sem plano não recebe comentário pago pela RPC da aula');
select pg_temp.denied($q$select public.app_moderate_lesson_comment(pg_temp.id(303),pg_temp.id(304),'approve','Motivo fictício')$q$,
 'aluno sem plano não modera comentário pago');
select pg_temp.denied($q$select public.app_admin_log_csv_export('profiles')$q$,'aluno não registra exportações');

select pg_temp.login(1);
select pg_temp.ok(public.app_admin_archive_podcast(pg_temp.id(500),false)->>'status'='draft','restauração preserva o episódio como rascunho');
reset role;
select pg_temp.ok(exists(select 1 from public.audit_events
 where action='export:csv' and target_type='member_csv' and actor_id=pg_temp.id(1) and created_at between now() and clock_timestamp()
 and reason::jsonb=jsonb_build_object('busca_preenchida',true,'papel','staff','plano',pg_temp.id(100)::text,'situacao','suspended')),
 'exportação de membros grava ator, data, tipo, filtros e apenas o marcador de busca preenchida');
select pg_temp.ok(exists(select 1 from public.audit_events
 where action='export:csv' and target_type='order_csv' and actor_id=pg_temp.id(1) and created_at between now() and clock_timestamp()
 and reason::jsonb='{"busca_preenchida":false,"situacao":"paid"}'),
 'exportação de pedidos grava ator, data, tipo, filtros e o marcador de busca vazia');
select pg_temp.ok((select count(*) from public.audit_events where action='export:csv' and actor_id=pg_temp.id(1))=2,
 'cada exportação válida grava um evento e filtros inválidos não gravam');
select pg_temp.ok(to_regprocedure('public.app_admin_log_csv_export(text,text,text,text,text)') is null,
 'assinatura que recebia texto da busca foi removida');
update public.profiles set role='admin' where id=pg_temp.id(7);
set local role authenticated;
select pg_temp.login(1);
select public.app_admin_log_csv_export('profiles') from generate_series(1,8);
do $$
declare limited boolean:=false;
begin
 begin
  perform public.app_admin_log_csv_export('orders');
 exception when sqlstate 'P0001' then
  limited:=sqlerrm='Muitas solicitações. Aguarde um minuto.';
 end;
 perform pg_temp.ok(limited,'décima primeira exportação na janela é recusada inclusive ao trocar o tipo');
end $$;
select pg_temp.login(7);
select public.app_admin_log_csv_export('orders');
reset role;
select pg_temp.ok((select count(*) from public.audit_events where action='export:csv' and actor_id=pg_temp.id(1))=10,
 'requisição acima do limite não grava evento');
select pg_temp.ok((select count(*) from public.audit_events where action='export:csv' and actor_id=pg_temp.id(7))=1,
 'outro administrador tem sua própria cota');
select pg_temp.ok(not exists (
 select 1 from unnest(array['app_admin_commercial(text,text,integer,text,text,text)','app_admin_ticket_queue(text,text,text,integer)',
 'app_admin_lesson_comment_queue(integer)','app_admin_archive_podcast(uuid,boolean)','app_admin_audit(text,integer)',
 'app_admin_lesson_context(uuid,uuid)','app_admin_moderation_queue(text,text,text,integer)',
 'app_admin_log_csv_export(text,boolean,text,text,text)']) signature
 where has_function_privilege('anon','public.'||signature,'execute')
),'nenhuma RPC nova aceita anon');
select count(*) as admin_operations_assertions from operations_checks;
rollback;
