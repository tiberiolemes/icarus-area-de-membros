\set ON_ERROR_STOP on
begin;
set local statement_timeout='15s';

create temporary table analytics_checks(name text primary key);
create temporary table analytics_results(name text primary key, data jsonb not null);
grant insert on analytics_checks to anon, authenticated, service_role;
grant select, insert on analytics_results to authenticated;

create function pg_temp.ok(condition boolean, label text) returns void language plpgsql as $$
begin
  if condition is distinct from true then raise exception 'FAIL: %',label; end if;
  insert into analytics_checks values(label);
end $$;

create function pg_temp.denied(statement text, expected text, label text) returns void language plpgsql as $$
declare actual text;
begin
  begin execute statement;
  exception when insufficient_privilege then actual := 'permission';
  when sqlstate 'P0001' then actual := sqlerrm;
  end;
  perform pg_temp.ok(actual=expected,label||' ('||coalesce(actual,'sem erro')||')');
end $$;

create function pg_temp.id(n integer) returns uuid language sql immutable as $$
  select ('ad320000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;

create function pg_temp.login(n integer, jwt_aal text default 'aal2', sid integer default null) returns void language sql as $$
  select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.id(n),'aal',jwt_aal,
    'session_id',pg_temp.id(coalesce(sid,10+n)), 'app_metadata',jsonb_build_object('role','admin'))::text,true)
$$;

create function pg_temp.result(k text) returns jsonb language sql stable as $$
  select data from analytics_results where name=k
$$;

create function pg_temp.from_30d() returns timestamptz language sql stable as $$
  select (((now() at time zone 'America/Sao_Paulo')::date-29)::timestamp at time zone 'America/Sao_Paulo')
$$;

insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
select pg_temp.id(n),'analytics-'||n||'@example.test',now(),'{"icarus_server_created":true}',
  jsonb_build_object('full_name','Membro Privado '||n) from generate_series(1,9) n;
set constraints all immediate;
update public.profiles set role=case
  when id in (pg_temp.id(1),pg_temp.id(9)) then 'admin'
  when id=pg_temp.id(5) then 'support' when id=pg_temp.id(6) then 'moderator'
  when id=pg_temp.id(7) then 'instructor' else 'member' end,
  demo=id=pg_temp.id(4), suspended=id=pg_temp.id(9), created_at=now()-interval '1 day'
where id in (select pg_temp.id(n) from generate_series(1,9) n);
update public.profiles set created_at=pg_temp.from_30d() where id=pg_temp.id(2);
update public.profiles set created_at=pg_temp.from_30d()-interval '1 microsecond' where id=pg_temp.id(3);

insert into auth.sessions(id,user_id,created_at,updated_at,aal,not_after)
select pg_temp.id(10+n),pg_temp.id(n),now(),now(),'aal2',null from generate_series(1,9) n;
insert into auth.sessions(id,user_id,created_at,updated_at,aal,not_after)
values (pg_temp.id(21),pg_temp.id(1),now(),now(),'aal1',null),
  (pg_temp.id(22),pg_temp.id(1),now(),now(),'aal2',null),
  (pg_temp.id(23),pg_temp.id(1),now(),now(),'aal2',now()-interval '1 second');
insert into public.app_sessions(id,user_id,expires_at,revoked_at)
values(pg_temp.id(22),pg_temp.id(1),now()+interval '10 minutes',now());

set local role authenticated;
select pg_temp.login(1);
select pg_temp.ok(public.app_admin_dashboard() @> '{"first_activations":0,"revenue_cents":0,"mrr_cents":0,"renewals_due":0,"completions":0,"posts":0,"new_tickets":0,"first_response_seconds":null,"payments":[]}',
  'banco sem atividade devolve zero onde medido e nulo para média sem amostra');
select pg_temp.ok(public.app_admin_analytics_courses() @> '{"items":[],"total":0,"page":1,"page_size":20}',
  'catálogo vazio tem envelope paginado');
select set_config('request.jwt.claims','{}',true);
reset role;

insert into public.plans(id,name,slug,price_cents,access_months)
values(pg_temp.id(90),'Plano financeiro teste','analytics-test-plan',999999,13);
insert into public.orders(id,user_id,plan_id,attempt_key,amount_cents,access_months,method,installments,buyer_data,receipt_hash,status,paid_at,finalized_at)
select pg_temp.id(n),case when member_id is not null then pg_temp.id(member_id) end,pg_temp.id(90),
  'analytics-attempt-'||n,amount,months,method,1,'{"email":"private-buyer@example.test"}',repeat('a',64),
  status,paid_at,case when member_id is not null then paid_at end
from (values
  (201,2,120000,12,'PIX','paid',now()-interval '2 days'),
  (202,2,60000,6,'CREDIT_CARD','paid',now()-interval '1 day'),
  (203,3,18000,3,'PIX','paid',now()-interval '40 days'),
  (204,4,8000,1,'PIX','paid',now()-interval '1 day'),
  (205,3,9000,1,'PIX','refunded',now()-interval '1 day'),
  (206,null,3000,1,'PIX','paid',pg_temp.from_30d()),
  (207,8,10000,1,'PIX','paid',now()-interval '4 days'),
  (208,8,20000,2,'CREDIT_CARD','paid',now()-interval '1 day'),
  (209,null,1234,1,'PIX','paid',pg_temp.from_30d()-interval '1 microsecond'),
  (210,null,7000,1,'PIX','pending',null),
  (211,null,1000,1,'PIX','paid',now())
) x(n,member_id,amount,months,method,status,paid_at);
insert into public.subscriptions(user_id,plan_id,starts_at,ends_at,source,order_id,revoked_at)
select o.user_id,o.plan_id,
  case when n=208 then now()+interval '6 days' else o.paid_at end,
  case when n=203 then ((now() at time zone 'America/Sao_Paulo') + interval '30 days') at time zone 'America/Sao_Paulo'
       else now()+make_interval(days=>ends_days) end,
  'order',o.id,case when n=205 then now()-interval '1 hour' end
from (values (201,10),(202,60),(203,30),(204,1),(205,2),(207,6),(208,60)) x(n,ends_days)
join public.orders o on o.id=pg_temp.id(n);
insert into public.subscriptions(user_id,plan_id,starts_at,ends_at,source)
values(pg_temp.id(8),pg_temp.id(90),now()-interval '1 day',now()+interval '1 day','courtesy');

insert into public.spaces(id,name,status,access_mode) values(pg_temp.id(95),'Comunidade teste','published','members');
insert into public.posts(space_id,author_id,title,body,status,created_at)
select pg_temp.id(95),pg_temp.id(n),'Post privado marcador','Corpo privado marcador',status,created_at
from (values (2,'approved',pg_temp.from_30d()),(3,'pending',pg_temp.from_30d()-interval '1 day'),
  (2,'archived',now()-interval '1 day'),(4,'pending',now()-interval '1 day')) x(n,status,created_at);

insert into public.tickets(id,user_id,subject,priority,status,created_at)
select pg_temp.id(n),pg_temp.id(member_id),'Assunto privado marcador','normal',status,created_at
from (values (301,2,'open',now()-interval '1 day'),(302,3,'resolved',now()-interval '2 days'),
  (303,2,'in_progress',now()-interval '1 day'),(304,3,'waiting_member',pg_temp.from_30d()-interval '1 day'),
  (305,4,'open',now()-interval '1 day')) x(n,member_id,status,created_at);
insert into public.ticket_messages(ticket_id,author_id,body,created_at)
select t.id,pg_temp.id(author),'Mensagem privada marcador',t.created_at+make_interval(mins=>elapsed)
from (values (301,2,0),(301,2,5),(301,5,60),(301,5,180),(302,4,30),(302,5,120),(303,2,10)) x(n,author,elapsed)
join public.tickets t on t.id=pg_temp.id(n);

insert into public.courses(id,slug,title,status,access_mode)
values(pg_temp.id(100),'analytics-published','A · Curso publicado','published','members'),
  (pg_temp.id(101),'analytics-empty','B · Curso vazio','published','members'),
  (pg_temp.id(102),'analytics-draft','Curso privado marcador','draft','members'),
  (pg_temp.id(103),'analytics-archived','Curso arquivado marcador','archived','members');
insert into public.courses(id,slug,title,status,access_mode)
select pg_temp.id(500+n),'analytics-catalog-'||n,'Z · Curso '||lpad(n::text,2,'0'),'published','members'
from generate_series(1,20) n;
insert into public.modules(id,course_id,slug,title,status,order_index)
values(pg_temp.id(110),pg_temp.id(100),'primeiro','Primeiro módulo','published',1),
  (pg_temp.id(111),pg_temp.id(100),'segundo','Segundo módulo','published',2),
  (pg_temp.id(112),pg_temp.id(100),'rascunho','Módulo privado marcador','draft',0);
insert into public.sections(id,module_id,title,status) values
  (pg_temp.id(120),pg_temp.id(110),'Seção 1','published'),(pg_temp.id(121),pg_temp.id(111),'Seção 2','published'),
  (pg_temp.id(122),pg_temp.id(112),'Seção privada marcador','published');
insert into public.lessons(id,section_id,slug,title,status,type,body,duration_seconds,video_id,is_required)
values (pg_temp.id(130),pg_temp.id(120),'primeira','Primeira aula','published','video','Corpo privado marcador',300,'ad320000-0000-4000-8000-0000000000fe',true),
  (pg_temp.id(131),pg_temp.id(121),'segunda','Segunda aula','published','video','Corpo privado marcador',300,'ad320000-0000-4000-8000-0000000000fe',true),
  (pg_temp.id(132),pg_temp.id(121),'opcional','Aula opcional','published','text','',0,null,false),
  (pg_temp.id(133),pg_temp.id(122),'rascunho','Aula privada marcador','published','text','',0,null,false);
insert into public.lessons(id,section_id,slug,title,status,is_required,order_index)
select pg_temp.id(600+n),pg_temp.id(121),'opcional-'||n,'Opcional '||n,'published',false,n
from generate_series(1,20) n;
insert into public.lesson_progress(user_id,lesson_id,position_seconds,completed_at,updated_at)
select pg_temp.id(member_id),pg_temp.id(lesson_id),position_seconds,completed,now()
from (values
  (2,130,0,now()-interval '3 days'),(2,131,300,pg_temp.from_30d()),
  (3,130,50,now()-interval '15 days'),(3,131,300,null),(8,132,0,null),
  (4,130,300,now()-interval '1 day'),(5,130,300,now()-interval '1 day'),
  (2,133,300,pg_temp.from_30d()-interval '1 microsecond')
) x(member_id,lesson_id,position_seconds,completed);

select pg_temp.ok((select count(*)=5 and bool_and(
 has_function_privilege('authenticated',signature,'EXECUTE')
 and not has_function_privilege('anon',signature,'EXECUTE')
 and not has_function_privilege('service_role',signature,'EXECUTE')
) from unnest(array['public.app_admin_dashboard(text)','public.app_admin_dashboard(text,date,date)','public.app_ranking(text,integer,date,date)','public.app_admin_analytics_courses(integer)',
 'public.app_admin_course_analytics(uuid,integer)']) signature), 'ACL exclusiva de authenticated');

select pg_temp.ok((select bool_and(upper(span)-lower(span)=n)
  from (values('today',1),('yesterday',1),('7d',7),('14d',14),('30d',30),('90d',90)) preset(id,n)
  cross join lateral (select app_private.report_days(id,null,null) span) d), 'atalhos contam dias civis incluindo ambas as pontas');
select pg_temp.ok(not exists (
  select from unnest(array['anon','authenticated','service_role']) role_name
  where has_function_privilege(role_name,'app_private.admin_reporting_actor()','EXECUTE')
    or has_function_privilege(role_name,'app_private.report_days(text,date,date)','EXECUTE')
), 'helper privado sem execução explícita ou herdada');
set local role anon;
select pg_temp.denied('select public.app_admin_dashboard()','permission','anon recusado pelo dashboard');
select pg_temp.denied('select public.app_admin_analytics_courses()','permission','anon recusado pelo seletor');
select pg_temp.denied('select public.app_admin_course_analytics(null)','permission','anon recusado pelo funil');
set local role service_role;
select pg_temp.denied('select public.app_admin_dashboard()','permission','service role sem execução direta');
set local role authenticated;
select pg_temp.denied('select public.app_admin_dashboard()','Sessão inválida. Entre novamente.','authenticated sem credencial');
select pg_temp.login(2);
select pg_temp.denied('select public.app_admin_dashboard()','Operação não permitida.','membro com metadado admin recusado');
select pg_temp.denied('select public.app_admin_analytics_courses()','Operação não permitida.','membro sem lista');
select pg_temp.denied('select public.app_admin_course_analytics(pg_temp.id(100))','Operação não permitida.','membro sem funil');
select pg_temp.login(5);
select pg_temp.denied('select public.app_admin_dashboard()','Operação não permitida.','suporte AAL2 sem dashboard');
select pg_temp.login(6);
select pg_temp.denied('select public.app_admin_analytics_courses()','Operação não permitida.','moderador AAL2 sem lista');
select pg_temp.login(7);
select pg_temp.denied('select public.app_admin_course_analytics(pg_temp.id(100))','Operação não permitida.','instrutor AAL2 sem funil');
select pg_temp.login(1,'aal1',21);
select pg_temp.ok(public.app_admin_dashboard() ? 'revenue_cents','admin sem fator usa dashboard com AAL1');
select pg_temp.ok(public.app_admin_analytics_courses() ? 'items','admin sem fator usa seletor com AAL1');
select pg_temp.ok(public.app_admin_course_analytics(pg_temp.id(100)) ? 'lessons','admin sem fator usa funil com AAL1');
reset role;
insert into auth.mfa_factors(id,user_id,friendly_name,factor_type,status,created_at,updated_at)
values(pg_temp.id(31),pg_temp.id(1),'Teste de MFA','totp','verified',now(),now());
set local role authenticated;
select pg_temp.login(1,'aal1');
select pg_temp.denied('select public.app_admin_dashboard()','Confirme o segundo fator para continuar.','admin com fator e JWT AAL1 recusado');
select pg_temp.login(1,'aal2',21);
select pg_temp.denied('select public.app_admin_analytics_courses()','Sessão inválida ou segundo fator pendente.','fator ativo exige sessão nativa AAL2');
select pg_temp.login(1,'aal2',22);
select pg_temp.denied('select public.app_admin_course_analytics(pg_temp.id(100))','Sessão expirada. Entre novamente.','sessão revogada recusada');
select pg_temp.login(1,'aal2',23);
select pg_temp.denied('select public.app_admin_dashboard()','Sessão inválida ou segundo fator pendente.','sessão nativa expirada recusada');
select pg_temp.login(9);
select pg_temp.denied('select public.app_admin_dashboard()','Acesso indisponível.','admin suspenso recusado');
select pg_temp.login(1);
select pg_temp.denied('select buyer_data from public.orders','permission','nem admin lê tabelas por privilégio direto');
select pg_temp.denied('select public.app_admin_dashboard(null)','Período inválido.','período nulo');
select pg_temp.denied('select public.app_admin_dashboard(repeat(''x'',1000))','Período inválido.','período arbitrário');
select pg_temp.denied('select public.app_admin_analytics_courses(100001)','Página inválida.','limite de página de curso');
select pg_temp.denied('select public.app_admin_course_analytics(pg_temp.id(100),0)','Página inválida.','limite de página de aula');
select pg_temp.denied('select public.app_admin_course_analytics(null)','Curso indisponível.','curso nulo');
select pg_temp.denied('select public.app_admin_course_analytics(pg_temp.id(102))','Curso indisponível.','curso rascunho não exposto');
select pg_temp.denied('select public.app_admin_course_analytics(pg_temp.id(103))','Curso indisponível.','curso arquivado não exposto');
select pg_temp.denied('select public.app_admin_course_analytics(pg_temp.id(999))','Curso indisponível.','curso inexistente não distinguível');

insert into analytics_results values ('30d',public.app_admin_dashboard()),
  ('90d',public.app_admin_dashboard('90d')),('year',public.app_admin_dashboard('year')),
  ('courses',public.app_admin_analytics_courses()),('courses2',public.app_admin_analytics_courses(2)),
  ('first',public.app_admin_course_analytics(pg_temp.id(100))),
  ('second',public.app_admin_course_analytics(pg_temp.id(100),2)),
  ('empty',public.app_admin_course_analytics(pg_temp.id(101)));
-- The day just before the 30-day window contains events one microsecond before midnight in Brasília.
insert into analytics_results values ('single_day',public.app_admin_dashboard('custom',
  (pg_temp.from_30d() at time zone 'America/Sao_Paulo')::date-1,
  (pg_temp.from_30d() at time zone 'America/Sao_Paulo')::date-1));
select pg_temp.ok(pg_temp.result('single_day') @> '{"new_members":1,"completions":1,"acquisition":[{"new_members":1}]}'
  and pg_temp.result('single_day')->'from_day'=pg_temp.result('single_day')->'through_day'
  and (pg_temp.result('single_day')->>'revenue_cents')::int = 1234,
  'janela histórica inclui o último microssegundo e exclui a meia-noite seguinte');
select pg_temp.ok(public.app_admin_dashboard('current')->>'from_day'=to_char(now() at time zone 'America/Sao_Paulo','YYYY-MM-01'),
  'mês atual desde o primeiro dia civil');
select pg_temp.denied('select public.app_admin_dashboard(''custom'',''2024-02-02'',''2024-02-01'')','Período inválido.','datas invertidas');
select pg_temp.denied('select public.app_admin_dashboard(''custom'',''2024-01-01'',null)','Período inválido.','data final ausente');
select pg_temp.denied('select public.app_admin_dashboard(''custom'',''2024-01-01'',''infinity'')','Período inválido.','data futura');
select pg_temp.denied('select public.app_admin_dashboard(''30d'',''2024-01-01'',''2024-01-31'')','Período inválido.','atalho não aceita datas externas');
select pg_temp.ok(pg_temp.result('30d') @> '{"new_members":2,"first_activations":2,"revenue_cents":213000,"mrr_cents":36000,"renewals_due":1}',
  'vendas, bordas da janela, exclusões, sobreposição e antecipação');
select pg_temp.ok(pg_temp.result('90d') @> '{"new_members":3,"first_activations":3,"revenue_cents":232234,"mrr_cents":36000,"renewals_due":1}',
  'janela de 90 dias e métricas de posição independentes');
select pg_temp.ok(pg_temp.result('year')->>'from_day'=to_char(now() at time zone 'America/Sao_Paulo','YYYY"-01-01"')
  and jsonb_array_length(pg_temp.result('year')->'acquisition') between 1 and 12,'faixas mensais e início do ano');
select pg_temp.ok(pg_temp.result('30d')->'payments' @> '[{"method":"PIX","orders":3,"amount_cents":133000},{"method":"CREDIT_CARD","orders":2,"amount_cents":80000}]',
  'métodos reconciliam com o total pago');
select pg_temp.ok((select sum((x->>'new_members')::int)=2 and sum((x->>'first_activations')::int)=2
  and count(*)=5 from jsonb_array_elements(pg_temp.result('30d')->'acquisition') x), 'séries reconciliam com cartões');
select pg_temp.ok(pg_temp.result('30d') @> '{"completions":3,"completing_members_7d":1,"completing_members_30d":2,"posts":2,"pending_posts":1}',
  'conclusões, membros distintos e moderação');
select pg_temp.ok(pg_temp.result('30d') @> '{"new_tickets":3,"open_tickets":3,"answered_tickets":2,"first_response_seconds":5400}',
  'primeira resposta exclui autor titular, demonstração e respostas seguintes');
select pg_temp.ok(jsonb_array_length(pg_temp.result('courses')->'items')=20 and pg_temp.result('courses2') @> '{"total":22,"page":2,"page_size":20}'
  and jsonb_array_length(pg_temp.result('courses2')->'items')=2,'paginação estável de cursos publicados');
select pg_temp.ok(pg_temp.result('first') @> '{"started":3,"module_title":"Primeiro módulo","module_completed":2,"course_completed":1}',
  'funil exclui equipe, demo e conteúdo fora da hierarquia publicada');
select pg_temp.ok((pg_temp.result('first')->'lessons'->'items'->1) @> '{"title":"Segunda aula","registered":2,"completed":1,"duration_seconds":300}',
  'avanço até a duração salva não equivale a conclusão');
select pg_temp.ok((pg_temp.result('first')->'lessons') @> '{"total":23,"page_size":20,"page":1}'
  and jsonb_array_length(pg_temp.result('first')->'lessons'->'items')=20
  and jsonb_array_length(pg_temp.result('second')->'lessons'->'items')=3
  and (pg_temp.result('second')->>'started')::int=3,'paginação restringe só a tabela');
select pg_temp.ok(pg_temp.result('empty') @> '{"started":0,"module_title":null,"module_completed":null,"course_completed":null,"lessons":{"items":[]}}',
  'curso vazio distingue zero de etapa indisponível');
select pg_temp.ok(not exists(select from analytics_results where data::text ~*
  'example.test|privado marcador|privada marcador|arquivado marcador|"position_seconds"|"user_id"|"order_id"|"buyer_data"|ad320000-0000-4000-8000-000000000002|ad320000-0000-4000-8000-0000000000fe'),
  'resposta agregada não contém PII, posições, conteúdo privado ou identificador de membro');
reset role;
update public.lessons set status='archived' where id=pg_temp.id(131);
set local role authenticated;
select pg_temp.ok(public.app_admin_course_analytics(pg_temp.id(100)) @> '{"started":3,"module_completed":2,"course_completed":null,"lessons":{"total":22}}',
  'obrigatória arquivada impede afirmar conclusão atual');
reset role;
insert into public.orders(id,user_id,plan_id,attempt_key,amount_cents,access_months,method,installments,
  buyer_data,receipt_hash,status,paid_at,finalized_at)
values
  (pg_temp.id(212),pg_temp.id(2),pg_temp.id(90),'analytics-attempt-212',10000,1,'PIX',1,'{}',repeat('a',64),
    'paid',now()-interval '90 days',pg_temp.from_30d()+interval '1 day'),
  (pg_temp.id(213),pg_temp.id(2),pg_temp.id(90),'analytics-attempt-213',10000,1,'PIX',1,'{}',repeat('a',64),
    'refunded',pg_temp.from_30d(),pg_temp.from_30d()+interval '2 days');
insert into public.subscriptions(user_id,plan_id,starts_at,ends_at,source,order_id,revoked_at)
select user_id,plan_id,paid_at,paid_at+make_interval(months=>access_months),'order',id,
  case when status='refunded' then finalized_at end
from public.orders where id in (pg_temp.id(212),pg_temp.id(213));
set local role authenticated;
select pg_temp.ok(public.app_admin_dashboard()->'acquisition'=pg_temp.result('30d')->'acquisition',
  'acesso vinculado após vencimento ou revogado no vínculo não antecipa a primeira ativação válida');
reset role;
update public.orders set status='refunded' where id in (pg_temp.id(201),pg_temp.id(202));
update public.subscriptions set revoked_at=now() where order_id in (pg_temp.id(201),pg_temp.id(202));
set local role authenticated;
select pg_temp.ok(public.app_admin_dashboard()->'acquisition'=pg_temp.result('30d')->'acquisition',
  'reembolso posterior preserva a primeira ativação do acesso que esteve vigente');
reset role;
insert into public.rate_limits(actor_id,bucket,window_start,count)
values(pg_temp.id(1),'admin_dashboard',date_trunc('minute',now()),20),
  (pg_temp.id(1),'admin_analytics_courses',date_trunc('minute',now()),20),
  (pg_temp.id(1),'admin_course_analytics',date_trunc('minute',now()),20)
on conflict(actor_id,bucket,window_start) do update set count=excluded.count;
set local role authenticated;
select pg_temp.denied('select public.app_admin_dashboard()','Muitas solicitações. Aguarde um minuto.','limite por ator no dashboard');
select pg_temp.denied('select public.app_admin_analytics_courses()','Muitas solicitações. Aguarde um minuto.','limite por ator no seletor');
select pg_temp.denied('select public.app_admin_course_analytics(pg_temp.id(100))','Muitas solicitações. Aguarde um minuto.','limite por ator no funil');
reset role;

select count(*) from analytics_checks;
rollback;
