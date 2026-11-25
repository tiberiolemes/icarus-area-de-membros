\set ON_ERROR_STOP on
begin;

create temporary table engagement_checks(name text primary key);
create temporary table engagement_ids(name text primary key,id uuid not null);
grant insert on engagement_checks,engagement_ids to authenticated,anon;
grant select on engagement_ids to authenticated;

create function pg_temp.ok(p_ok boolean,p_name text) returns void language plpgsql as $$
begin
 if p_ok is distinct from true then raise exception 'FAIL: %',p_name; end if;
 insert into engagement_checks values (p_name);
end $$;
create function pg_temp.denied(p_statement text,p_name text,p_expected text) returns void language plpgsql as $$
declare actual text;
begin
 begin execute p_statement;
 exception when insufficient_privilege then actual := 'permission';
 when sqlstate 'P0001' then actual := sqlerrm;
 end;
 perform pg_temp.ok(actual=p_expected,p_name);
end $$;
create function pg_temp.id(n integer) returns uuid language sql immutable as $$
 select ('cc240000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;
create function pg_temp.saved(p_name text) returns uuid language sql stable as $$
 select id from pg_temp.engagement_ids where name=p_name
$$;
create function pg_temp.login(n integer,p_aal text default 'aal2') returns void language sql as $$
 select set_config('request.jwt.claims',jsonb_build_object(
  'sub',pg_temp.id(n),'role','authenticated','aal',p_aal,'session_id',pg_temp.id(10+n),
  'app_metadata',jsonb_build_object('role','instructor')
 )::text,true)
$$;

insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
select pg_temp.id(n),'engagement-'||n||'@example.test',now(),'{"icarus_server_created":true}',
 jsonb_build_object('full_name','Ator '||n) from generate_series(1,6) n;
set constraints all immediate;
insert into auth.sessions(id,user_id,created_at,updated_at,aal)
select pg_temp.id(10+n),pg_temp.id(n),now(),now(),'aal2' from generate_series(1,6) n;
update public.profiles set role=case id when pg_temp.id(3) then 'instructor'
 when pg_temp.id(4) then 'moderator' when pg_temp.id(5) then 'support' else 'admin' end
where id in (pg_temp.id(3),pg_temp.id(4),pg_temp.id(5),pg_temp.id(6));

insert into public.courses(id,slug,title,status,access_mode) values
 (pg_temp.id(100),'engagement-open','Curso disponível','published','members'),
 (pg_temp.id(101),'engagement-locked','Curso por assinatura','published','subscribers'),
 (pg_temp.id(102),'engagement-draft','Curso em rascunho','draft','members');
insert into public.modules(id,course_id,slug,title,status)
select pg_temp.id(110+n),pg_temp.id(100+n),'modulo','Módulo','published' from generate_series(0,2) n;
insert into public.sections(id,module_id,title,status)
select pg_temp.id(120+n),pg_temp.id(110+n),'Seção','published' from generate_series(0,2) n;
insert into public.lessons(id,section_id,slug,title,type,duration_seconds,status,is_preview) values
 (pg_temp.id(130),pg_temp.id(120),'first','Aula principal','video',600,'published',false),
 (pg_temp.id(131),pg_temp.id(120),'second','Outra aula','text',0,'published',false),
 (pg_temp.id(132),pg_temp.id(121),'locked','Aula por assinatura','video',600,'published',false),
 (pg_temp.id(133),pg_temp.id(121),'preview','Aula de prévia','video',60,'published',true),
 (pg_temp.id(134),pg_temp.id(122),'draft','Aula em rascunho','text',0,'draft',false);
insert into public.plans(id,name,slug,price_cents,access_months)
values (pg_temp.id(140),'Plano teste','engagement-test',0,1);
insert into public.subscriptions(user_id,plan_id,ends_at,source)
values (pg_temp.id(1),pg_temp.id(140),now()+interval '1 day','courtesy');
insert into public.spaces(id,name,status,access_mode)
values (pg_temp.id(159),'Espaço para teste de exportação','published','members');
insert into public.posts(id,space_id,author_id,title,body,status,previous_status,archived_by,archive_source)
values
 (pg_temp.id(160),pg_temp.id(159),pg_temp.id(1),'Arquivado pela equipe','Texto autoral',
  'archived','approved',pg_temp.id(6),'admin'),
 (pg_temp.id(161),pg_temp.id(159),pg_temp.id(1),'Arquivado pelo titular','Outro texto autoral',
  'archived','pending',pg_temp.id(1),'author'),
 (pg_temp.id(162),pg_temp.id(159),pg_temp.id(2),'Post do colega','Texto do colega',
  'approved',null,null,null);

select pg_temp.ok((select count(*)=8 and bool_and(
 has_function_privilege('authenticated',signature,'EXECUTE')
 and not has_function_privilege('anon',signature,'EXECUTE')
 and not has_function_privilege('service_role',signature,'EXECUTE')
) from unnest(array[
 'public.app_lesson_favorite(uuid,boolean)','public.app_lesson_engagement(uuid)',
 'public.app_lesson_notes(uuid,integer)','public.app_save_lesson_note(uuid,uuid,text,numeric)',
 'public.app_delete_lesson_note(uuid,uuid)','public.app_lesson_comments(uuid,integer,boolean)',
 'public.app_save_lesson_comment(uuid,uuid,text)','public.app_moderate_lesson_comment(uuid,uuid,text,text)'
]) signature),'RPCs executáveis só por authenticated');
select pg_temp.ok((select count(*)=3 and bool_and(
 relrowsecurity and not has_table_privilege('anon',oid,'SELECT,INSERT,UPDATE,DELETE')
 and not has_table_privilege('authenticated',oid,'SELECT,INSERT,UPDATE,DELETE')
 and not has_table_privilege('service_role',oid,'SELECT,INSERT,UPDATE,DELETE')
) from pg_class where oid in ('public.lesson_favorites'::regclass,'public.lesson_notes'::regclass,
 'public.lesson_comments'::regclass)),'RLS ativa e ACL direta fechada');
select pg_temp.ok(not has_function_privilege('authenticated',
 'app_private.lesson_engagement_actor(uuid,boolean)','EXECUTE'),'helper privado sem grant');
select pg_temp.ok(has_function_privilege('authenticated','public.app_export_data()','EXECUTE')
 and not has_function_privilege('anon','public.app_export_data()','EXECUTE'),'export preserva ACL do titular');

set local role anon;
select pg_temp.denied('select public.app_lesson_engagement(pg_temp.id(130))','anon sem EXECUTE','permission');
reset role;
set local role authenticated;
select pg_temp.denied('select public.app_lesson_engagement(pg_temp.id(130))','JWT ausente negado','Sessão inválida. Entre novamente.');
select pg_temp.login(1);
select pg_temp.ok(public.app_lesson_engagement(pg_temp.id(130))=
 '{"saved":false,"notes_count":0,"comments_count":0}','resumo inicial personalizável');
select pg_temp.ok(public.app_lesson_favorite(pg_temp.id(130),true)='{"saved":true}','favoritar');
select pg_temp.ok(public.app_lesson_favorite(pg_temp.id(130),true)='{"saved":true}','favoritar novamente');
select pg_temp.ok(public.app_lesson_favorite(pg_temp.id(130),false)='{"saved":false}','desfavoritar');
select pg_temp.ok(public.app_lesson_favorite(pg_temp.id(130),false)='{"saved":false}','desfavoritar novamente');
reset role;
select pg_temp.ok(not exists(select from public.lesson_favorites
 where user_id=pg_temp.id(1) and lesson_id=pg_temp.id(130)),'desfavoritar repetido remove vínculo da tabela');
set local role authenticated;
select pg_temp.ok(public.app_lesson_favorite(pg_temp.id(130),true)='{"saved":true}','favorito final');
select pg_temp.denied('select public.app_lesson_favorite(pg_temp.id(130),null)','favorito exige booleano','Informe se a aula deve ser favoritada.');

insert into engagement_ids select 'note',(public.app_save_lesson_note(pg_temp.id(130),null,U&'\00A0Minha\00A0 nota\3000',12.5)->>'id')::uuid;
insert into engagement_ids select 'other_lesson_note',(public.app_save_lesson_note(pg_temp.id(131),null,'Nota sem tempo')->>'id')::uuid;
select pg_temp.ok((public.app_lesson_notes(pg_temp.id(130))->'items'->0)-'updated_at'=
 jsonb_build_object('id',pg_temp.saved('note'),'body',U&'Minha\00A0 nota','position_seconds',12.5),
 'nota com tempo decimal apara bordas Unicode e preserva espaços internos');
select pg_temp.ok(public.app_lesson_notes(pg_temp.id(131))->'items'->0->'position_seconds'='null',
 'é possível anotar sem tempo');
select pg_temp.denied('select public.app_save_lesson_note(pg_temp.id(131),pg_temp.saved(''note''),''Mover'')',
 'nota vinculada à aula','Anotação indisponível.');
select pg_temp.denied('select public.app_delete_lesson_note(pg_temp.id(131),pg_temp.saved(''note''))',
 'exclusão vinculada à aula','Anotação indisponível.');
reset role;
update public.lesson_notes set updated_at='2000-01-01 UTC' where id=pg_temp.saved('note');
set local role authenticated;
select pg_temp.ok(public.app_save_lesson_note(pg_temp.id(130),pg_temp.saved('note'),'Atualizada',72)=
 jsonb_build_object('id',pg_temp.saved('note')),'edição mantém ID');
reset role;
select pg_temp.ok((select body='Atualizada' and position_seconds=72 and updated_at>'2000-01-01 UTC'
 from public.lesson_notes where id=pg_temp.saved('note')),'edição persiste corpo, tempo e timestamp novo');
select updated_at as edited_at from public.lesson_notes where id=pg_temp.saved('note') \gset
set local role authenticated;
select public.app_save_lesson_note(pg_temp.id(130),pg_temp.saved('note'),U&'\202FAtualizada\00A0',72);
reset role;
select pg_temp.ok((select body='Atualizada' and position_seconds=72 and updated_at=:'edited_at'::timestamptz
 from public.lesson_notes where id=pg_temp.saved('note')),'repetir edição normalizada preserva estado e timestamp');
set local role authenticated;
select pg_temp.denied('select public.app_lesson_notes(pg_temp.id(130),null)','página nula negada','Página inválida.');
select pg_temp.denied('select public.app_lesson_notes(pg_temp.id(130),2147483647)','página gigante negada','Página inválida.');
select pg_temp.denied($q$select public.app_save_lesson_note(pg_temp.id(130),null,E' \n\t')$q$,
 'nota só com espaços negada','Informe uma anotação de até 2000 caracteres.');
select pg_temp.denied($q$select public.app_save_lesson_note(pg_temp.id(130),null,U&'\00A0\202F\3000')$q$,
 'nota vazia após normalização Unicode negada','Informe uma anotação de até 2000 caracteres.');
select pg_temp.denied($q$select public.app_save_lesson_note(pg_temp.id(130),null,repeat('a',2001))$q$,
 'nota longa negada','Informe uma anotação de até 2000 caracteres.');
select pg_temp.denied($q$select public.app_save_lesson_note(pg_temp.id(130),null,repeat('a',2000)||U&'\00A0')$q$,
 'nota acima do limite bruto negada mesmo quando aparada caberia','Informe uma anotação de até 2000 caracteres.');
select pg_temp.ok(public.app_delete_lesson_note(pg_temp.id(131),
 (public.app_save_lesson_note(pg_temp.id(131),null,repeat('a',2000))->>'id')::uuid)->>'id' is not null,
 'nota com comprimento bruto e normalizado máximos aceita');
do $$ declare invalid_time numeric;
begin
 foreach invalid_time in array array['NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric,-1,86401] loop
  perform pg_temp.denied(format('select public.app_save_lesson_note(pg_temp.id(130),null,''Nota'',%L::numeric)',invalid_time),
   'tempo inválido '||invalid_time,'Posição inválida.');
 end loop;
end $$;
select pg_temp.ok(public.app_lesson_engagement(pg_temp.id(132))->>'saved'='false','assinante acessa o curso restrito');
select pg_temp.ok(public.app_delete_lesson_note(pg_temp.id(131),pg_temp.saved('other_lesson_note'))=
 jsonb_build_object('id',pg_temp.saved('other_lesson_note')),'titular pode excluir');
select pg_temp.denied('select public.app_delete_lesson_note(pg_temp.id(131),pg_temp.saved(''other_lesson_note''))',
 'exclusão repetida não encontra nota','Anotação indisponível.');
select pg_temp.denied('select * from public.lesson_notes','authenticated sem leitura direta de notas','permission');
select pg_temp.denied('select * from public.lesson_favorites','authenticated sem leitura direta de favoritos','permission');
select pg_temp.denied('select * from public.lesson_comments','authenticated sem leitura direta de comentários','permission');

insert into engagement_ids
select 'root',(created->>'id')::uuid
from public.app_save_lesson_comment(pg_temp.id(130),null,U&'\0085Dúvida\2009de aula\2028') created
where created->>'status'='pending';
select pg_temp.ok((public.app_lesson_comments(pg_temp.id(130))->'items'->0)-'created_at'=
 jsonb_build_object('id',pg_temp.saved('root'),'author_name','Ator 1','body',U&'Dúvida\2009de aula',
  'parent_id',null::uuid,'status','pending','is_instructor',false),
 'autor vê pendente com DTO mínimo e claim de instrutor ignorada');
select pg_temp.ok(public.app_lesson_engagement(pg_temp.id(130))=
 '{"saved":true,"notes_count":1,"comments_count":1}','resumo conta apenas conteúdo visível');
select pg_temp.denied('select public.app_lesson_comments(pg_temp.id(130),1,true)',
 'claim forjada não concede fila','Operação não permitida.');
select pg_temp.denied($q$select public.app_moderate_lesson_comment(pg_temp.id(130),pg_temp.saved('root'),'approve','Motivo humano')$q$,
 'membro não aprova','Operação não permitida.');
select pg_temp.denied($q$select public.app_save_lesson_comment(pg_temp.id(130),pg_temp.saved('root'),'Resposta antes da aprovação')$q$,
 'autor não responde a pai pendente','Comentário indisponível para resposta.');
select pg_temp.denied($q$select public.app_save_lesson_comment(pg_temp.id(130),null,repeat('c',10001))$q$,
 'comentário longo negado','Informe um comentário de até 10000 caracteres.');
select pg_temp.denied($q$select public.app_save_lesson_comment(pg_temp.id(130),null,U&'\FEFF\00A0\2007')$q$,
 'comentário vazio após normalização Unicode negado','Informe um comentário de até 10000 caracteres.');
select pg_temp.denied($q$select public.app_save_lesson_comment(pg_temp.id(130),null,repeat('c',10000)||U&'\00A0')$q$,
 'comentário acima do limite bruto negado mesmo quando aparado caberia','Informe um comentário de até 10000 caracteres.');
select pg_temp.ok(public.app_save_lesson_comment(pg_temp.id(131),null,repeat('c',10000))->>'status'='pending',
 'comentário com comprimento bruto e normalizado máximos aceito');
select pg_temp.denied('select public.app_save_lesson_comment(pg_temp.id(130),null,null)',
 'comentário nulo negado','Informe um comentário de até 10000 caracteres.');

select pg_temp.login(2);
select pg_temp.ok(public.app_lesson_engagement(pg_temp.id(130))=
 '{"saved":false,"notes_count":0,"comments_count":0}','colega não vê o favorito, a nota ou o pendente');
select pg_temp.ok(public.app_lesson_notes(pg_temp.id(130))->'items'='[]','lista do colega omite nota');
select pg_temp.ok(public.app_lesson_comments(pg_temp.id(130))->'items'='[]','lista do colega omite pendente');
select pg_temp.denied('select public.app_save_lesson_note(pg_temp.id(130),pg_temp.saved(''note''),''Tentativa'')',
 'colega não edita anotação alheia','Anotação indisponível.');
select pg_temp.denied('select public.app_delete_lesson_note(pg_temp.id(130),pg_temp.saved(''note''))',
 'colega não exclui anotação alheia','Anotação indisponível.');
select pg_temp.ok(public.app_lesson_engagement(pg_temp.id(133))->>'notes_count'='0','membro conserva acesso à prévia');
select pg_temp.denied('select public.app_lesson_engagement(pg_temp.id(134))','membro não lê rascunho','Aula indisponível para seu acesso.');
do $$
declare statement text;
begin
 foreach statement in array array[
  'public.app_lesson_engagement(pg_temp.id(132))',
  'public.app_lesson_favorite(pg_temp.id(132),true)',
  'public.app_lesson_notes(pg_temp.id(132))',
  'public.app_save_lesson_note(pg_temp.id(132),null,''Nota'')',
  'public.app_delete_lesson_note(pg_temp.id(132),pg_temp.saved(''note''))',
  'public.app_lesson_comments(pg_temp.id(132))',
  'public.app_save_lesson_comment(pg_temp.id(132),null,''Comentário'')'
 ] loop
  perform pg_temp.denied('select '||statement,'sem plano: '||statement,'Aula indisponível para seu acesso.');
 end loop;
end $$;

select pg_temp.login(3);
select pg_temp.ok(public.app_lesson_engagement(pg_temp.id(134))->>'comments_count'='0','instrutor conserva acesso legado ao rascunho');
select pg_temp.denied('select public.app_lesson_comments(pg_temp.id(130),1,true)',
 'instrutor sem fila de moderação','Operação não permitida.');
select pg_temp.denied($q$select public.app_save_lesson_comment(pg_temp.id(130),pg_temp.saved('root'),'Resposta do instrutor')$q$,
 'instrutor não contorna pai pendente','Comentário indisponível para resposta.');

select pg_temp.login(5);
select pg_temp.denied('select public.app_lesson_comments(pg_temp.id(130),1,true)',
 'suporte sem fila de moderação','Operação não permitida.');
select pg_temp.denied($q$select public.app_moderate_lesson_comment(pg_temp.id(130),pg_temp.saved('root'),'approve','Motivo humano')$q$,
 'suporte não modera','Operação não permitida.');

select pg_temp.login(4);
select pg_temp.ok(public.app_lesson_engagement(pg_temp.id(130))=
 '{"saved":false,"notes_count":0,"comments_count":0}','moderador em leitura comum só vê conteúdo publicado');
select pg_temp.ok(public.app_lesson_comments(pg_temp.id(130),1,true)->>'total'='1','moderador habilitado vê a fila');
select pg_temp.denied('select public.app_lesson_comments(pg_temp.id(132),1,true)',
 'moderador sem plano não abre a revisão no fluxo da aula','Aula indisponível para seu acesso.');
select pg_temp.denied($q$select public.app_moderate_lesson_comment(pg_temp.id(132),pg_temp.saved('root'),'approve','Motivo humano')$q$,
 'moderador não modera comentário associado à aula paga errada','Comentário indisponível.');
select pg_temp.denied($q$select public.app_moderate_lesson_comment(pg_temp.id(131),pg_temp.saved('root'),'approve','Motivo humano')$q$,
 'moderação rejeita comentário de outra aula','Comentário indisponível.');
select pg_temp.denied($q$select public.app_moderate_lesson_comment(pg_temp.id(130),pg_temp.saved('root'),'hide','Motivo humano')$q$,
 'decisão fora do contrato negada','Decisão inválida.');
select pg_temp.denied($q$select public.app_moderate_lesson_comment(pg_temp.id(130),pg_temp.saved('root'),'approve',null)$q$,
 'decisão exige motivo','Informe o motivo da decisão.');
select pg_temp.denied($q$select public.app_moderate_lesson_comment(pg_temp.id(130),pg_temp.saved('root'),'approve',U&'\00A0\2003\202F')$q$,
 'motivo vazio após normalização Unicode negado','Informe o motivo da decisão.');
select pg_temp.denied($q$select public.app_moderate_lesson_comment(pg_temp.id(130),pg_temp.saved('root'),'approve',U&'\202Fok\00A0')$q$,
 'motivo aparado abaixo do mínimo negado','Informe o motivo da decisão.');
select pg_temp.denied($q$select public.app_moderate_lesson_comment(pg_temp.id(130),pg_temp.saved('root'),'approve',repeat('m',2000)||U&'\00A0')$q$,
 'motivo acima do limite bruto negado mesmo quando aparado caberia','Informe o motivo da decisão.');
select pg_temp.ok(public.app_moderate_lesson_comment(pg_temp.id(130),pg_temp.saved('root'),'approve',U&'\00A0Motivo\202Fhumano\3000')->>'status'=
 'approved','moderador aprova manualmente');
select pg_temp.ok(public.app_moderate_lesson_comment(pg_temp.id(130),pg_temp.saved('root'),'approve','Repetição da decisão')->>'status'=
 'approved','repetir aprovação é idempotente');
select pg_temp.denied($q$select public.app_moderate_lesson_comment(pg_temp.id(130),pg_temp.saved('root'),'reject','Decisão conflitante')$q$,
 'decisão posterior divergente negada','Este comentário já foi revisado.');
select pg_temp.ok(public.app_lesson_comments(pg_temp.id(130),1,true)->>'total'='0','aprovado sai da fila');

select pg_temp.login(3);
select pg_temp.denied($q$select public.app_save_lesson_comment(pg_temp.id(131),pg_temp.saved('root'),'Resposta indevida')$q$,
 'resposta de outra aula negada','Comentário indisponível para resposta.');
insert into engagement_ids
select 'reply',(created->>'id')::uuid
from public.app_save_lesson_comment(pg_temp.id(130),pg_temp.saved('root'),'Resposta do instrutor') created
where created->>'status'='pending';
select pg_temp.ok((public.app_lesson_comments(pg_temp.id(130))->'items'->1)-'created_at'=
 jsonb_build_object('id',pg_temp.saved('reply'),'author_name','Ator 3','body','Resposta do instrutor',
  'parent_id',pg_temp.saved('root'),'status','pending','is_instructor',true),
 'resposta do instrutor vem marcada pelo servidor e começa pendente');
select pg_temp.login(2);
select pg_temp.ok(public.app_lesson_comments(pg_temp.id(130))->>'total'='1','colega vê raiz aprovada e não a resposta pendente');
insert into engagement_ids select 'rejected',(public.app_save_lesson_comment(pg_temp.id(130),null,'Dúvida reprovada')->>'id')::uuid;

select pg_temp.login(6);
select pg_temp.ok(public.app_lesson_engagement(pg_temp.id(130))=
 '{"saved":false,"notes_count":0,"comments_count":1}','admin não vê favorito ou nota de terceiros');
select pg_temp.denied('select public.app_delete_lesson_note(pg_temp.id(130),pg_temp.saved(''note''))',
 'admin não exclui anotação de terceiros','Anotação indisponível.');
select pg_temp.ok(public.app_lesson_comments(pg_temp.id(130),1,true)->>'total'='2','admin vê pendentes na fila autorizada');
select pg_temp.ok(public.app_moderate_lesson_comment(pg_temp.id(130),pg_temp.saved('reply'),'approve','Resposta aprovada')->>'status'=
 'approved','admin aprova resposta do instrutor');
select pg_temp.ok(public.app_moderate_lesson_comment(pg_temp.id(130),pg_temp.saved('rejected'),'reject',repeat('m',2000))->>'status'=
 'rejected','admin rejeita manualmente');
select pg_temp.login(1);
select pg_temp.ok(public.app_lesson_engagement(pg_temp.id(130))->>'comments_count'='2',
 'leitura pública do aluno vê raiz e resposta aprovadas, sem rejeição alheia');
select pg_temp.denied($q$select public.app_save_lesson_comment(pg_temp.id(130),pg_temp.saved('reply'),'Resposta de resposta')$q$,
 'respostas só apontam para raiz','Comentário indisponível para resposta.');
select pg_temp.denied($q$select public.app_save_lesson_comment(pg_temp.id(130),pg_temp.saved('rejected'),'Resposta a rejeitado')$q$,
 'raiz rejeitada não admite respostas','Comentário indisponível para resposta.');
select pg_temp.login(2);
select pg_temp.ok(public.app_lesson_comments(pg_temp.id(130))->'items'->2->>'status'='rejected','autor vê a própria decisão');
reset role;

select pg_temp.ok((select count(*)=1 and bool_and(actor_id=pg_temp.id(4) and decision='approve' and reason=U&'Motivo\202Fhumano')
 from public.moderation_events where target_type='lesson_comment' and target_id=pg_temp.saved('root')),
 'repetir moderação mantém um único registro para a decisão final');
select pg_temp.ok((select count(*)=1 and bool_and(action='moderate:approve' and actor_id=pg_temp.id(4) and reason=U&'Motivo\202Fhumano')
 from public.audit_events where target_type='lesson_comment' and target_id=pg_temp.saved('root')),
 'autor, decisão e motivo auditados');
do $$ begin
 begin
  insert into public.lesson_comments(lesson_id,author_id,parent_id,body,is_instructor)
  values (pg_temp.id(131),pg_temp.id(2),pg_temp.saved('root'),'Resposta indevida',false);
  raise exception 'FAIL: FK aceitou pai de outra aula';
 exception when foreign_key_violation then
  perform pg_temp.ok(true,'FK veda pai de outra aula');
 end;
end $$;

grant select on public.lesson_favorites,public.lesson_notes,public.lesson_comments to authenticated;
set local role authenticated;
select pg_temp.ok(not exists(select from public.lesson_notes)
 and not exists(select from public.lesson_favorites)
 and not exists(select from public.lesson_comments),'RLS protege tabelas mesmo diante de grant de leitura');
reset role;
revoke select on public.lesson_favorites,public.lesson_notes,public.lesson_comments from authenticated;

create function pg_temp.fail_audit() returns trigger language plpgsql as $$
begin
 if new.target_type='lesson_comment' then raise exception 'Falha de auditoria de teste'; end if;
 return new;
end $$;
create trigger engagement_test_audit before insert on public.audit_events
 for each row execute function pg_temp.fail_audit();
set local role authenticated;
insert into engagement_ids
select 'audit_rollback',(public.app_save_lesson_comment(pg_temp.id(130),null,'Dúvida para testar rollback')->>'id')::uuid;
select pg_temp.login(4);
select pg_temp.denied($q$select public.app_moderate_lesson_comment(pg_temp.id(130),pg_temp.saved('audit_rollback'),'approve','Motivo humano')$q$,
 'falha na auditoria reverte a decisão','Falha de auditoria de teste');
select pg_temp.ok(public.app_lesson_comments(pg_temp.id(130),1,true)->'items'->0->>'id'=
 pg_temp.saved('audit_rollback')::text,'comentário continua na fila');
reset role;
select pg_temp.ok(not exists(select from public.moderation_events where target_id=pg_temp.saved('audit_rollback')),
 'falha também reverte o registro de moderação');
drop trigger engagement_test_audit on public.audit_events;

insert into public.lesson_notes(user_id,lesson_id,body,updated_at)
select pg_temp.id(1),pg_temp.id(130),'Página nota '||n,now()+n*interval '1 day' from generate_series(1,21) n;
insert into public.lesson_comments(lesson_id,author_id,body,status,is_instructor,created_at)
select pg_temp.id(130),pg_temp.id(3),'Página comentário '||n,'approved',true,now()+n*interval '1 day'
from generate_series(1,21) n;
set local role authenticated;
select pg_temp.login(1);
select pg_temp.ok(jsonb_array_length(public.app_lesson_notes(pg_temp.id(130))->'items')=20
 and public.app_lesson_notes(pg_temp.id(130),2)->>'total'='22'
 and public.app_lesson_notes(pg_temp.id(130),2)->>'page'='2'
 and public.app_lesson_notes(pg_temp.id(130),2)->>'page_size'='20'
 and public.app_lesson_notes(pg_temp.id(130),2)->'items'->0->>'body'='Página nota 1',
 'notas paginadas por atualização antes do limite');
select pg_temp.ok(jsonb_array_length(public.app_lesson_comments(pg_temp.id(130))->'items')=20
 and public.app_lesson_comments(pg_temp.id(130),2)->>'total'='23'
 and public.app_lesson_comments(pg_temp.id(130),2)->'items'->0->>'body'='Página comentário 19',
 'comentários paginados depois do filtro de visibilidade');
select pg_temp.denied('select public.app_lesson_comments(pg_temp.id(130),0)','página de comentário inválida','Página inválida.');
select pg_temp.denied('select public.app_lesson_comments(pg_temp.id(130),1,null)','modo de revisão nulo negado','Modo de revisão inválido.');
select pg_temp.login(5);
do $$ begin
 for n in 1..12 loop
  perform public.app_save_lesson_comment(pg_temp.id(131),null,'Comentário de teste '||n);
 end loop;
 perform pg_temp.denied($q$select public.app_save_lesson_comment(pg_temp.id(131),null,'Acima do limite')$q$,
  'limite de envio de comentários é aplicado no servidor','Muitas solicitações. Aguarde um minuto.');
end $$;
reset role;

set local role authenticated;
select pg_temp.login(1);
select public.app_lesson_favorite(pg_temp.id(132),true);
insert into engagement_ids select 'locked_note',
 (public.app_save_lesson_note(pg_temp.id(132),null,'Nota do titular sobre aula restrita',18.75)->>'id')::uuid;
insert into engagement_ids select 'locked_comment',
 (public.app_save_lesson_comment(pg_temp.id(132),null,'Comentário do titular em aula restrita')->>'id')::uuid;
insert into engagement_ids select 'own_reply',
 (public.app_save_lesson_comment(pg_temp.id(130),pg_temp.saved('root'),'Resposta do titular')->>'id')::uuid;
select pg_temp.ok(public.app_privacy_request('deletion')->>'status'='pending','exclusão solicitada fica pendente');
select pg_temp.login(2);
select public.app_lesson_favorite(pg_temp.id(131),true);
insert into engagement_ids select 'peer_note',
 (public.app_save_lesson_note(pg_temp.id(131),null,'Nota que só o colega pode exportar')->>'id')::uuid;
insert into engagement_ids select 'peer_reply',
 (public.app_save_lesson_comment(pg_temp.id(130),pg_temp.saved('root'),'Resposta que só o colega pode exportar')->>'id')::uuid;
select public.app_export_data() as peer_export \gset
select pg_temp.ok(:'peer_export'::jsonb->'lesson_favorites'=jsonb_build_array(jsonb_build_object('lesson_id',pg_temp.id(131)))
 and jsonb_array_length(:'peer_export'::jsonb->'lesson_notes')=1
 and :'peer_export'::jsonb->'lesson_notes'->0->>'id'=pg_temp.saved('peer_note')::text,
 'colega exporta exclusivamente os próprios favoritos e notas');
select pg_temp.ok((select jsonb_array_length(:'peer_export'::jsonb->'lesson_comments')=3 and count(*)=1
 from jsonb_array_elements(:'peer_export'::jsonb->'lesson_comments') as e
 where e->>'id'=pg_temp.saved('peer_reply')::text
   and e->'parent_id'='null' and e->>'body'='Resposta que só o colega pode exportar'),
 'colega exporta resposta sem identificar comentário pai de terceiro');
reset role;

update public.subscriptions set revoked_at=now() where user_id=pg_temp.id(1) and plan_id=pg_temp.id(140);
set local role authenticated;
select pg_temp.login(1);
select pg_temp.denied('select public.app_lesson_engagement(pg_temp.id(132))',
 'revogar plano corta acesso','Aula indisponível para seu acesso.');
select public.app_export_data() as owner_export \gset
select pg_temp.ok((select count(*)=1 from jsonb_array_elements(:'owner_export'::jsonb->'posts') as e
 where e @> jsonb_build_object('id',pg_temp.id(160),'space_id',pg_temp.id(159),'author_id',pg_temp.id(1),
  'title','Arquivado pela equipe','body','Texto autoral','status','archived','previous_status','approved',
  'archive_source','admin') and e ?& array['created_at','updated_at']),
 'export conserva post arquivado pela equipe, autoria, conteúdo, status e histórico');
select pg_temp.ok((select count(*)=2 and bool_and(e->>'author_id'=pg_temp.id(1)::text)
 and count(*) filter (where e->>'id'=pg_temp.id(161)::text and e->>'archive_source'='author'
  and e->>'previous_status'='pending')=1 from jsonb_array_elements(:'owner_export'::jsonb->'posts') as e)
 and strpos(:'owner_export',pg_temp.id(162)::text)=0,'export exclui post de outro titular');
select pg_temp.ok(not exists(select from jsonb_array_elements(:'owner_export'::jsonb->'posts') as e
 where e ? 'archived_by') and strpos(:'owner_export',pg_temp.id(6)::text)=0,
 'export omite archived_by em todos os posts e o UUID do arquivador administrativo');
select pg_temp.ok(:'owner_export'::jsonb ?& array['profile','subscriptions','progress','certificates','posts','replies',
 'ticket_messages','orders','legal_acceptances','privacy_requests','lesson_favorites','lesson_notes','lesson_comments']
 and :'owner_export'::jsonb->'profile'->>'id'=pg_temp.id(1)::text
 and :'owner_export'::jsonb->'subscriptions'->0->>'plan_id'=pg_temp.id(140)::text
 and :'owner_export'::jsonb->'privacy_requests'->0->>'status'='pending',
 'export mantém campos legados e solicitação pendente');
select pg_temp.ok(:'owner_export'::jsonb->'lesson_favorites'=jsonb_build_array(
 jsonb_build_object('lesson_id',pg_temp.id(130)),jsonb_build_object('lesson_id',pg_temp.id(132)))
 and (select jsonb_array_length(:'owner_export'::jsonb->'lesson_notes')=23 and count(*)=1
  from jsonb_array_elements(:'owner_export'::jsonb->'lesson_notes') as e
  where e->>'id'=pg_temp.saved('locked_note')::text and e->>'lesson_id'=pg_temp.id(132)::text
   and e->'position_seconds'='18.75' and e->>'body'='Nota do titular sobre aula restrita'
   and e ? 'updated_at' and not e ? 'user_id'),
 'fav e nota do titular de aula sem acesso saem no export, com projeção mínima');
select pg_temp.ok((select jsonb_array_length(:'owner_export'::jsonb->'lesson_comments')=4 and count(*)=2
 from jsonb_array_elements(:'owner_export'::jsonb->'lesson_comments') as e
 where (e->>'id'=pg_temp.saved('locked_comment')::text and e->>'lesson_id'=pg_temp.id(132)::text
    and e->>'body'='Comentário do titular em aula restrita' and e->>'status'='pending')
   or (e->>'id'=pg_temp.saved('own_reply')::text and e->>'parent_id'=pg_temp.saved('root')::text))
 and not exists(select from jsonb_array_elements(:'owner_export'::jsonb->'lesson_comments') as e
  where e ?| array['author_id','author_name','reason','moderator_id']
     or e->>'id' in (pg_temp.saved('peer_reply')::text,pg_temp.saved('reply')::text)),
 'export mantém comentários próprios sem acesso, referência própria e exclui terceiros e razão interna');
select pg_temp.login(6);
select public.app_export_data() as admin_export \gset
select pg_temp.ok(:'admin_export'::jsonb->'lesson_favorites'='[]'
 and :'admin_export'::jsonb->'lesson_notes'='[]'
 and :'admin_export'::jsonb->'lesson_comments'='[]','admin sem interações próprias recebe listas vazias');
reset role;
update public.app_sessions set revoked_at=now() where id=pg_temp.id(11);
set local role authenticated;
select pg_temp.login(1);
select pg_temp.denied('select public.app_lesson_engagement(pg_temp.id(130))',
 'sessão revogada corta novas interações','Sessão expirada. Entre novamente.');
reset role;
update public.profiles set suspended=true where id=pg_temp.id(2);
set local role authenticated;
select pg_temp.login(2);
select pg_temp.denied('select public.app_lesson_comments(pg_temp.id(130))',
 'conta suspensa corta novas interações','Acesso indisponível.');
reset role;
insert into auth.mfa_factors(id,user_id,friendly_name,factor_type,status,created_at,updated_at)
values (pg_temp.id(150),pg_temp.id(4),'Fator de teste','totp','verified',now(),now());
set local role authenticated;
select pg_temp.login(4,'aal1');
select pg_temp.denied('select public.app_lesson_comments(pg_temp.id(130),1,true)',
 'moderação respeita segundo fator verificado','Confirme o segundo fator para continuar.');
reset role;

select count(*) as lesson_engagement_assertions_passed from engagement_checks;
rollback;
