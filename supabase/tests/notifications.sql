\set ON_ERROR_STOP on
begin;

create temporary table notification_checks(name text primary key);
create temporary table notification_results(name text primary key,data jsonb not null);
grant insert on notification_checks to authenticated,anon;
grant select,insert on notification_results to authenticated;

create function pg_temp.ok(p_value boolean,p_name text) returns void language plpgsql as $$
begin
 if p_value is distinct from true then raise exception 'FAIL: %',p_name; end if;
 insert into notification_checks values (p_name);
end $$;
create function pg_temp.denied(p_statement text,p_expected text,p_name text) returns void language plpgsql as $$
declare actual text;
begin
 begin execute p_statement;
 exception when insufficient_privilege then actual := 'permission';
 when sqlstate 'P0001' then actual := sqlerrm;
 end;
 perform pg_temp.ok(actual=p_expected,p_name);
end $$;
create function pg_temp.id(n integer) returns uuid language sql immutable as $$
 select ('02600000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;
create function pg_temp.login(n integer) returns void language sql as $$
 select set_config('request.jwt.claims',jsonb_build_object(
  'sub',pg_temp.id(n),'role','authenticated','aal','aal2','session_id',pg_temp.id(10+n)
 )::text,true)
$$;
create function pg_temp.result(p_name text) returns jsonb language sql stable as $$
 select data from pg_temp.notification_results where name=p_name
$$;
create function pg_temp.result_id(p_name text) returns uuid language sql stable as $$
 select (pg_temp.result(p_name)->>'id')::uuid
$$;

insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
select pg_temp.id(n),'notification-'||n||'@example.test',now(),'{"icarus_server_created":true}',
 jsonb_build_object('full_name','Ator '||n) from generate_series(1,4) n;
set constraints all immediate;
insert into auth.sessions(id,user_id,created_at,updated_at,aal)
select pg_temp.id(10+n),pg_temp.id(n),now(),now(),'aal2' from generate_series(1,4) n;
update public.profiles set role='moderator' where id=pg_temp.id(3);
insert into public.courses(id,slug,title,status,access_mode,certificate_enabled,signer_name,signer_title)
values (pg_temp.id(101),'notificacoes-teste','Curso de teste','published','members',true,'Pessoa Responsável','Instrutora');
insert into public.modules(id,course_id,slug,title,status)
values (pg_temp.id(102),pg_temp.id(101),'modulo','Módulo','published');
insert into public.sections(id,module_id,title,status)
values (pg_temp.id(103),pg_temp.id(102),'Seção','published');
insert into public.lessons(id,section_id,slug,title,duration_seconds,status)
values (pg_temp.id(104),pg_temp.id(103),'aula','Aula teste',600,'published');

select pg_temp.ok((select count(*)=5 and bool_and(
 has_function_privilege('authenticated',signature,'EXECUTE')
 and not has_function_privilege('anon',signature,'EXECUTE')
 and not has_function_privilege('service_role',signature,'EXECUTE')
) from unnest(array['public.app_notifications(integer)','public.app_notifications_read(uuid)',
 'public.app_notification_preferences()','public.app_set_notification_preference(text,boolean)',
 'public.app_export_data()']) signature),'RPCs e export têm ACL exclusiva de authenticated');
select pg_temp.ok((select count(*)=2 and bool_and(relrowsecurity and not exists (
 select from unnest(array['anon','authenticated','service_role']) role_name
 where has_table_privilege(role_name,oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
)) from pg_class where oid in ('public.notifications'::regclass,'public.notification_preferences'::regclass)),
 'RLS e ACL negam acesso direto a ambas as tabelas');
select pg_temp.ok(not exists (
 select from pg_proc p cross join unnest(array['anon','authenticated','service_role']) role_name
 where p.pronamespace='app_private'::regnamespace
 and p.proname in ('notify_learning_event','notification_item','notification_item_v026','notification_preference_items','lesson_path')
 and has_function_privilege(role_name,p.oid,'EXECUTE')
),'helpers privados sem EXECUTE direto');

set local role anon;
select pg_temp.denied('select public.app_notifications()','permission','anon sem acesso ao sino');
select pg_temp.denied('select public.app_notifications_read()','permission','anon sem ACK');
select pg_temp.denied('select public.app_notification_preferences()','permission','anon sem acesso a preferências');
select pg_temp.denied('select public.app_set_notification_preference(''certificate_issued'',false)',
 'permission','anon sem atualização de preferências');
reset role;
set local role authenticated;
select pg_temp.denied('select public.app_notifications()','Sessão inválida. Entre novamente.','sem JWT');
select pg_temp.login(1);
select pg_temp.denied('select from public.notifications','permission','membro sem acesso direto à caixa');
select pg_temp.denied('update public.notification_preferences set in_app=false',
 'permission','membro sem escrita direta em preferências');
select pg_temp.ok(public.app_notifications()='{"items":[],"total":0,"page":1,"page_size":20,"unread_count":0}',
 'caixa vazia tem DTO completo');
insert into notification_results values ('defaults',public.app_notification_preferences());
select pg_temp.ok(pg_temp.result('defaults')=jsonb_build_object('items',jsonb_build_array(
 jsonb_build_object('event_key','catalog_launch','group','Conteúdo','label','Lançamentos inscritos',
  'in_app',true,'email',false,'email_available',false),
 jsonb_build_object('event_key','certificate_issued','group','Progresso','label','Certificado emitido',
  'in_app',true,'email',false,'email_available',false),
 jsonb_build_object('event_key','lesson_comment_approved','group','Conteúdo','label','Comentário de aula aprovado',
  'in_app',true,'email',false,'email_available',false)
)),'eventos opcionais com canal disponível');
select pg_temp.denied('select public.app_set_notification_preference(''password_reset'',false)',
 'Informe um evento de notificação disponível e sua preferência.','reset crítico fora do opt-out');
select pg_temp.denied('select public.app_set_notification_preference(''certificate_issued'',null)',
 'Informe um evento de notificação disponível e sua preferência.','estado nulo inválido');

select pg_temp.ok(public.app_progress(pg_temp.id(104),59,false)->>'certificate_code' is null,
 'reprodução sem emissão');
select pg_temp.ok(public.app_notifications()->>'total'='0','reprodução não produz notificação');
select pg_temp.ok(public.app_progress(pg_temp.id(104),600,true)->>'certificate_code' is not null,
 'conclusão emite certificado pela RPC real');
select pg_temp.ok(public.app_issue_certificate(pg_temp.id(101))->>'certificate_code' is not null,
 'repetição retorna certificado existente');
insert into notification_results select 'owned_certificate',public.app_notifications()->'items'->0;
select pg_temp.ok(pg_temp.result('owned_certificate')-'id'-'created_at'=
 '{"event_key":"certificate_issued","title":"Certificado emitido","subtitle":"Curso de teste",
   "action_path":"/app/certificados","read_at":null}', 'DTO mínimo do certificado sem código público ou IDs de origem');
select pg_temp.ok(public.app_notifications()->>'unread_count'='1','emissão e repetição deixam uma só notificação');
insert into notification_results values ('owner_comment',public.app_save_lesson_comment(pg_temp.id(104),null,'Comentário privado até aprovar'));
insert into notification_results values ('owner_rejected',public.app_save_lesson_comment(pg_temp.id(104),null,'Comentário rejeitado'));
select pg_temp.ok(public.app_notifications()->>'unread_count'='1','comentário pendente não dispara notificação');
select pg_temp.denied('select public.app_moderate_lesson_comment(pg_temp.id(104),pg_temp.result_id(''owner_comment''),''approve'',''Motivo'')',
 'Operação não permitida.','membro não fabrica aprovação');

select pg_temp.login(2);
select pg_temp.ok(public.app_set_notification_preference('certificate_issued',false)=
 ((pg_temp.result('defaults')->'items'->1)||'{"in_app":false}'),'setter devolve item atualizado');
select pg_temp.ok(public.app_set_notification_preference('lesson_comment_approved',false)->'in_app'='false',
 'opt-out do segundo evento');
select pg_temp.ok(public.app_set_notification_preference('lesson_comment_approved',false)->'in_app'='false',
 'opt-out repetido mantém estado');
select pg_temp.ok(public.app_progress(pg_temp.id(104),600,true)->>'certificate_code' is not null,
 'opt-out não interfere na emissão');
insert into notification_results values ('peer_optout_comment',public.app_save_lesson_comment(pg_temp.id(104),null,'Sem aviso'));
insert into notification_results values ('peer_comment',public.app_save_lesson_comment(pg_temp.id(104),null,'Aviso após optar por receber'));

select pg_temp.login(3);
select pg_temp.ok(public.app_moderate_lesson_comment(pg_temp.id(104),pg_temp.result_id('owner_comment'),'approve','Motivo')->>'status'='approved',
 'moderação real aprova comentário');
select pg_temp.ok(public.app_moderate_lesson_comment(pg_temp.id(104),pg_temp.result_id('owner_comment'),'approve','Motivo')->>'status'='approved',
 'retry da aprovação é aceito');
select pg_temp.ok(public.app_moderate_lesson_comment(pg_temp.id(104),pg_temp.result_id('owner_rejected'),'reject','Motivo')->>'status'='rejected',
 'rejeição mantém fluxo original');
select pg_temp.ok(public.app_moderate_lesson_comment(pg_temp.id(104),pg_temp.result_id('peer_optout_comment'),'approve','Motivo')->>'status'='approved',
 'moderador aprova com destinatário opt-out');
select pg_temp.ok(public.app_notifications()->>'total'='0','moderador não recebe notificações de terceiros');

select pg_temp.login(2);
select pg_temp.ok(public.app_notifications()->>'total'='0','opt-out suprimiu ambos os eventos');
select pg_temp.ok(public.app_notification_preferences()->'items'->2->'in_app'='false','opt-out continua persistido');
select pg_temp.ok(public.app_set_notification_preference('lesson_comment_approved',true)->'in_app'='true',
 'titular reativa canal in-app');
select pg_temp.ok(public.app_notifications()->>'total'='0','reativar não gera eventos retroativos');
select pg_temp.login(3);
select pg_temp.ok(public.app_moderate_lesson_comment(pg_temp.id(104),pg_temp.result_id('peer_comment'),'approve','Motivo')->>'status'='approved',
 'novo evento após reativar');
select pg_temp.login(2);
insert into notification_results select 'peer_notice',public.app_notifications()->'items'->0;
select pg_temp.ok(public.app_notifications()->>'total'='1','reativação afeta somente eventos novos');

select pg_temp.login(1);
insert into notification_results select 'owned_comment_notice',public.app_notifications()->'items'->0;
select pg_temp.ok(public.app_notification_preferences()=pg_temp.result('defaults'),'preferências de outro ator são isoladas');
select pg_temp.ok(pg_temp.result('owned_comment_notice')-'id'-'created_at'=
 '{"event_key":"lesson_comment_approved","title":"Comentário aprovado","subtitle":"Seu comentário foi aprovado na aula.",
   "action_path":"/app/cursos/notificacoes-teste/modulo/~02600000-0000-4000-8000-000000000104","read_at":null}',
 'DTO de aprovação e rota interna montada pelo servidor');
select pg_temp.ok(public.app_notifications_read(pg_temp.result_id('peer_notice'))='{"unread_count":2}'
 and public.app_notifications_read(pg_temp.id(999))='{"unread_count":2}','ACK alheio e inexistente são indistinguíveis');
select pg_temp.ok(public.app_notifications_read(pg_temp.result_id('owned_comment_notice'))='{"unread_count":1}',
 'ACK unitário devolve o saldo');
insert into notification_results select 'first_ack',public.app_notifications()->'items'->0;
select pg_temp.ok(public.app_notifications_read(pg_temp.result_id('owned_comment_notice'))='{"unread_count":1}',
 'retry de ACK não altera o saldo');
select pg_temp.ok(public.app_notifications()->'items'->0=pg_temp.result('first_ack')
 and pg_temp.result('first_ack')->>'read_at' is not null,'ACK preserva timestamp no retry');
select pg_temp.ok(public.app_notifications_read()='{"unread_count":0}'
 and public.app_notifications_read(null)='{"unread_count":0}','ACK em lote idempotente');
select pg_temp.login(2);
select pg_temp.ok(public.app_notifications()->>'unread_count'='1','ACK em lote não altera a caixa de outro membro');
reset role;

update public.lessons set slug='nova-aula' where id=pg_temp.id(104);
set local role authenticated;
select pg_temp.login(1);
select pg_temp.ok(public.app_notifications()->'items'->0->>'action_path'=pg_temp.result('owned_comment_notice')->>'action_path',
 'link mantém o destino após alterar o slug da aula');
reset role;
insert into public.sections(id,module_id,title,status)
values (pg_temp.id(105),pg_temp.id(102),'Outra seção','published');
update public.sections set order_index=1 where id=pg_temp.id(103);
insert into public.lessons(id,section_id,slug,title,status,is_required)
values (pg_temp.id(106),pg_temp.id(105),'nova-aula','Outra aula','published',false);
set local role authenticated;
select pg_temp.ok(public.app_notifications()->'items'->0->>'action_path'=pg_temp.result('owned_comment_notice')->>'action_path',
 'colisão na seção anterior conserva o endereço da aula vinculada');
reset role;
update public.courses set access_mode='subscribers' where id=pg_temp.id(101);
set local role authenticated;
select pg_temp.ok(public.app_notifications()->'items'->0->'action_path'='null','perda de acesso oculta o link e mantém histórico');
insert into notification_results values ('small_export',public.app_export_data());
select pg_temp.ok(pg_temp.result('small_export')->'notifications'=public.app_notifications()->'items'
 and pg_temp.result('small_export')->'notification_preferences'=pg_temp.result('defaults')->'items'
 and pg_temp.result('small_export')->'notifications_truncated'='false',
 'exporta caixa e preferências próprias com aviso de truncamento');
select pg_temp.ok((pg_temp.result('small_export')-'notifications'-'notification_preferences'-'notifications_truncated')
 ?& array['profile','subscriptions','progress','certificates','posts','replies','ticket_messages','orders',
 'legal_acceptances','privacy_requests','lesson_favorites','lesson_notes','lesson_checklist_items','lesson_comments']
 and not pg_temp.result('small_export')::text like '%'||pg_temp.result_id('peer_notice')||'%',
 'export preserva chaves da migration 025 e exclui identificadores alheios');
reset role;

insert into public.notifications(id,user_id,event_key,source_id,created_at)
select pg_temp.id(n),pg_temp.id(1),'certificate_issued',pg_temp.id(n),'2000-01-01 UTC'
from generate_series(1000,1998) n;
set local role authenticated;
insert into notification_results values ('page1',public.app_notifications(1)),('page2',public.app_notifications(2));
select pg_temp.ok(pg_temp.result('page1')->>'total'='1001'
 and pg_temp.result('page2')->>'unread_count'='999'
 and jsonb_array_length(pg_temp.result('page1')->'items')=20
 and pg_temp.result('page1')->'items'->19->>'id'=pg_temp.id(1981)::text
 and pg_temp.result('page2')->'items'->0->>'id'=pg_temp.id(1980)::text,
 'páginas de 20 com desempate determinístico por ID e contagens de toda a caixa');
select pg_temp.ok(public.app_notifications(2147483647)->'items'='[]'
 and public.app_notifications(-1)->>'page'='1' and public.app_notifications(null)->>'page'='1',
 'página extrema não transborda e páginas inválidas usam primeira');
insert into notification_results values ('large_export',public.app_export_data());
select pg_temp.ok(pg_temp.result('large_export')->'notifications_truncated'='true'
 and jsonb_array_length(pg_temp.result('large_export')->'notifications')=1000
 and pg_temp.result('large_export')->'notifications'->999->>'id'=pg_temp.id(1001)::text,
 'export sinaliza truncamento e conserva prefixo ordenado dos mil itens recentes');
select pg_temp.denied('select public.app_export_data()','Muitas solicitações. Aguarde um minuto.','export mantém limite existente');
reset role;

update public.app_sessions set revoked_at=now() where id=pg_temp.id(11);
set local role authenticated;
select pg_temp.denied('select public.app_notifications_read()','Sessão expirada. Entre novamente.','sessão revogada não altera estado');
reset role;
update public.profiles set suspended=true where id=pg_temp.id(1);
set local role authenticated;
select pg_temp.denied('select public.app_notification_preferences()','Acesso indisponível.','perfil suspenso não lê preferências');
reset role;

update public.courses set access_mode='members' where id=pg_temp.id(101);
set local role authenticated;
select pg_temp.login(4);
insert into notification_results values ('atomic_comment',public.app_save_lesson_comment(pg_temp.id(104),null,'Prova de atomicidade'));
reset role;
create function pg_temp.fail_moderation() returns trigger language plpgsql as $$
begin
 if new.target_id=pg_temp.result_id('atomic_comment') then raise exception 'Falha simulada na auditoria'; end if;
 return new;
end $$;
create trigger notifications_test_fail_moderation before insert on public.moderation_events
 for each row execute function pg_temp.fail_moderation();
set local role authenticated;
select pg_temp.login(3);
select pg_temp.denied(
 'select public.app_moderate_lesson_comment(pg_temp.id(104),pg_temp.result_id(''atomic_comment''),''approve'',''Motivo'')',
 'Falha simulada na auditoria','falha depois do trigger aborta moderação');
reset role;
select pg_temp.ok((select status='pending' from public.lesson_comments where id=pg_temp.result_id('atomic_comment'))
 and not exists(select from public.notifications where source_id=pg_temp.result_id('atomic_comment')),
 'falha depois do trigger reverte tanto comentário quanto notificação');

savepoint before_certificate;
set local role authenticated;
select pg_temp.login(4);
select pg_temp.ok(public.app_progress(pg_temp.id(104),600,true)->>'certificate_code' is not null,
 'emite certificado para validar rollback');
select pg_temp.ok(public.app_notifications()->>'total'='1','caixa vê certificado da mesma transação');
reset role;
rollback to before_certificate;
select pg_temp.ok(not exists(select from public.certificates where user_id=pg_temp.id(4))
 and not exists(select from public.notifications where user_id=pg_temp.id(4)),
 'rollback remove o certificado e a notificação da mesma transação');

select count(*) from notification_checks;
rollback;
