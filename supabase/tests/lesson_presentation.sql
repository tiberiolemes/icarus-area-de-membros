\set ON_ERROR_STOP on
begin;
set local statement_timeout='15s';

create temporary table presentation_checks(name text primary key);
grant insert on presentation_checks to anon,authenticated;

create function pg_temp.ok(p_ok boolean,p_name text)
returns void language plpgsql as $$
begin
 if p_ok is distinct from true then raise exception 'FAIL: %',p_name; end if;
 insert into presentation_checks values(p_name);
end $$;

create function pg_temp.denied(p_statement text,p_name text,p_expected text default 'Operação não permitida.')
returns void language plpgsql as $$
declare actual text;
begin
 begin execute p_statement;
 exception when insufficient_privilege then actual := 'permission';
 when sqlstate 'P0001' then actual := sqlerrm;
 end;
 if actual is distinct from p_expected then
  raise exception 'FAIL: % (esperado %, retornou %)',p_name,p_expected,actual;
 end if;
 perform pg_temp.ok(true,p_name);
end $$;

create function pg_temp.id(n integer) returns uuid language sql immutable as $$
 select ('cc250000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;

create function pg_temp.login(n integer)
returns void language sql as $$
 select set_config('request.jwt.claims',jsonb_build_object(
  'sub',pg_temp.id(n),'role','authenticated','aal','aal2','session_id',pg_temp.id(10+n),
  'app_metadata',jsonb_build_object('role','admin')
 )::text,true)
$$;

create function pg_temp.presentation()
returns jsonb language sql immutable as $$
 select '{
  "subtitle":"Subtítulo editorial",
  "chapters":[{"title":"Abertura","start_seconds":0,"duration_seconds":6.5},{"title":"Exemplo","start_seconds":6.5}],
  "takeaways":[{"icon":"tune","title":"Primeiro destaque","body":"Texto"},{"icon":"layers","title":"Segundo destaque","body":"Texto"}],
  "formula":{"label":"Fórmula","reference":"Artigo","expression":"a + b", "description":"Exemplo"},
  "checklist":[{"id":"z-1","label":"Etapa 1"},{"id":"a_2","label":"Etapa 2"}],
  "cta":{"label":"Bônus","context":"Comunidade","title":"Grupo privado","body":"Participe","button":"Entrar",
   "url":"https://chat.whatsapp.com/FIXTUREOnly?mode=invite"}
 }'::jsonb
$$;

insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
select pg_temp.id(n),'presentation-'||n||'@example.test',now(),'{"icarus_server_created":true}',
 jsonb_build_object('full_name','Pessoa '||n) from generate_series(1,5) n;
set constraints all immediate;
insert into auth.sessions(id,user_id,created_at,updated_at,aal)
select pg_temp.id(10+n),pg_temp.id(n),now(),now(),'aal2' from generate_series(1,5) n;
update public.ica_profiles set role=case id when pg_temp.id(3) then 'instructor'
 when pg_temp.id(4) then 'moderator' else 'admin' end
where id in (pg_temp.id(3),pg_temp.id(4),pg_temp.id(5));

insert into public.ica_courses(id,slug,title,status,access_mode) values
 (pg_temp.id(100),'presentation-open','Curso disponível','published','members'),
 (pg_temp.id(101),'presentation-locked','Curso por assinatura','published','subscribers');
insert into public.ica_modules(id,course_id,slug,title,status)
select pg_temp.id(110+n),pg_temp.id(100+n),'modulo','Módulo','published' from generate_series(0,1) n;
insert into public.ica_sections(id,module_id,title,status)
select pg_temp.id(120+n),pg_temp.id(110+n),'Seção','published' from generate_series(0,1) n;
insert into public.ica_lessons(id,section_id,slug,title,type,body,duration_seconds,status) values
 (pg_temp.id(130),pg_temp.id(120),'principal','Aula principal','video','<p>Objetivo original</p>',600,'published'),
 (pg_temp.id(131),pg_temp.id(120),'legado','Aula legada','text','',0,'published'),
 (pg_temp.id(132),pg_temp.id(121),'bloqueada','Aula por assinatura','video','',600,'published'),
 (pg_temp.id(133),pg_temp.id(120),'rascunho','Aula em rascunho','video','',600,'draft');
insert into public.ica_plans(id,name,slug,price_cents,access_months)
values (pg_temp.id(140),'Plano teste','presentation-test',0,1);
insert into public.ica_subscriptions(user_id,plan_id,ends_at,source)
values (pg_temp.id(1),pg_temp.id(140),now()+interval '1 day','courtesy');

select pg_temp.ok((select bool_and(
 has_function_privilege('authenticated',signature,'EXECUTE')
 and not has_function_privilege('anon',signature,'EXECUTE')
 and not has_function_privilege('service_role',signature,'EXECUTE')
) from unnest(array[
 'public.app_lesson_presentation(uuid,boolean)','public.app_admin_save_lesson_presentation(uuid,jsonb)',
 'public.app_lesson_checklist_item(uuid,text,boolean)','public.app_export_data()'
]) signature),'RPCs executáveis só por authenticated');
select pg_temp.ok((select count(*)=2 and bool_and(
 relrowsecurity and not has_table_privilege('anon',oid,'SELECT,INSERT,UPDATE,DELETE')
 and not has_table_privilege('authenticated',oid,'SELECT,INSERT,UPDATE,DELETE')
 and not has_table_privilege('service_role',oid,'SELECT,INSERT,UPDATE,DELETE')
) from pg_class where oid in ('public.ica_lesson_presentations'::regclass,'public.ica_lesson_checklist_items'::regclass)),
 'RLS ativa e ACL direta fechada');

set local role anon;
select pg_temp.denied('select public.app_lesson_presentation(pg_temp.id(130))','anon sem EXECUTE','permission');
reset role;
set local role authenticated;
select pg_temp.denied('select public.app_lesson_presentation(pg_temp.id(130))','sem sessão','Sessão inválida. Entre novamente.');
select pg_temp.login(1);
select pg_temp.ok(public.app_lesson_presentation(pg_temp.id(131))='{"presentation":null,"checked_ids":[]}',
 'aula legada sem apresentação');
select pg_temp.denied('select public.app_lesson_presentation(pg_temp.id(130),null)','modo inválido','Modo editorial inválido.');
select pg_temp.denied('select public.app_lesson_presentation(pg_temp.id(130),true)','membro sem modo editor');
select pg_temp.denied('select public.app_admin_save_lesson_presentation(pg_temp.id(130),pg_temp.presentation())',
 'membro sem escrita editorial mesmo com claim de admin');
select pg_temp.denied('select * from public.ica_lesson_checklist_items','checklist sem SELECT direto','permission');
select pg_temp.denied('select * from public.ica_lesson_presentations','apresentação sem SELECT direto','permission');

select pg_temp.login(4);
select pg_temp.denied('select public.app_lesson_presentation(pg_temp.id(133),true)','moderador sem modo editor');
select pg_temp.denied('select public.app_admin_save_lesson_presentation(pg_temp.id(130),pg_temp.presentation())',
 'moderador sem escrita editorial');

select pg_temp.login(3);
select pg_temp.ok(public.app_lesson_presentation(pg_temp.id(133),true)='{"presentation":null,"checked_ids":[]}',
 'instrutor pode abrir rascunho para editar');
select pg_temp.ok(public.app_admin_save_lesson_presentation(pg_temp.id(133),'{"subtitle":"Rascunho"}')
 =jsonb_build_object('lesson_id',pg_temp.id(133)),'instrutor escreve rascunho');
select pg_temp.ok(public.app_admin_save_lesson_presentation(pg_temp.id(130),pg_temp.presentation())
 =jsonb_build_object('lesson_id',pg_temp.id(130)),'instrutor configura os seis blocos');
select pg_temp.ok(public.app_admin_save_lesson_presentation(pg_temp.id(132),pg_temp.presentation())
 =jsonb_build_object('lesson_id',pg_temp.id(132)),'instrutor configura aula por assinatura');
select pg_temp.denied('select public.app_admin_save_lesson_presentation(pg_temp.id(999),null)',
 'edição da aula inexistente','Aula indisponível para seu acesso.');

select pg_temp.login(5);
select pg_temp.denied(format('select public.app_admin_save_lesson_presentation(pg_temp.id(130),%L::jsonb)',payload),
 name,message)
from (values
 ('[1]'::jsonb,'apresentação escalar ou lista','Campos não permitidos.'),
 ('{"body":"objetivo alterado"}','campo fora do contrato','Campos não permitidos.'),
 ('{"subtitle":1}','subtítulo numérico','Subtítulo inválido.'),
 (jsonb_build_object('subtitle',U&'\00A0'),'subtítulo só com espaço Unicode','Subtítulo inválido.'),
 (jsonb_build_object('subtitle',repeat('x',201)),'limite de subtítulo','Subtítulo inválido.'),
 ('{"chapters":null}','lista nula','Lista editorial inválida.'),
 (jsonb_build_object('chapters',(select jsonb_agg('{}'::jsonb) from generate_series(1,41))),
  'limite de capítulos','A lista excede o limite de itens.'),
 (jsonb_build_object('takeaways',(select jsonb_agg('{}'::jsonb) from generate_series(1,21))),
  'limite de destaques','A lista excede o limite de itens.'),
 (jsonb_build_object('checklist',(select jsonb_agg('{}'::jsonb) from generate_series(1,41))),
  'limite de checklist','A lista excede o limite de itens.'),
 (jsonb_build_object('subtitle',repeat('x',65536)),'limite total','A apresentação excede o limite de 64 KiB.'),
 ('{"chapters":[{"start_seconds":2}]}','título obrigatório','Capítulo inválido.'),
 ('{"chapters":[{"title":"Capítulo","start_seconds":"1"}]}','tempo como texto','Capítulo inválido.'),
 ('{"chapters":[{"title":"Capítulo","start_seconds":"NaN"}]}','tempo não finito','Capítulo inválido.'),
 ('{"chapters":[{"title":"Capítulo","start_seconds":0,"duration_seconds":null}]}','duração nula','Capítulo inválido.'),
 ('{"chapters":[{"title":"Capítulo","start_seconds":-0.1}]}','tempo negativo',
  'Informe capítulos em ordem crescente, sem sobreposição e dentro de 24 horas.'),
 ('{"chapters":[{"title":"Capítulo","start_seconds":1e50}]}','tempo excessivo',
  'Informe capítulos em ordem crescente, sem sobreposição e dentro de 24 horas.'),
 ('{"chapters":[{"title":"Capítulo","start_seconds":86399,"duration_seconds":2}]}','fim além do limite',
  'Informe capítulos em ordem crescente, sem sobreposição e dentro de 24 horas.'),
 ('{"chapters":[{"title":"Capítulo","start_seconds":0,"duration_seconds":0}]}','duração zero',
  'Informe capítulos em ordem crescente, sem sobreposição e dentro de 24 horas.'),
 ('{"chapters":[{"title":"A","start_seconds":6},{"title":"B","start_seconds":3}]}','capítulos fora de ordem',
  'Informe capítulos em ordem crescente, sem sobreposição e dentro de 24 horas.'),
 ('{"chapters":[{"title":"A","start_seconds":3},{"title":"B","start_seconds":3}]}','tempos iguais',
  'Informe capítulos em ordem crescente, sem sobreposição e dentro de 24 horas.'),
 ('{"chapters":[{"title":"A","start_seconds":0,"duration_seconds":6},{"title":"B","start_seconds":3}]}','sobreposição',
  'Informe capítulos em ordem crescente, sem sobreposição e dentro de 24 horas.'),
 ('{"takeaways":[{"icon":"other","title":"A","body":"B"}]}','ícone fora da lista','Destaque inválido.'),
 ('{"formula":{"label":"A","expression":"B","reference":null}}','referência nula','Fórmula inválida.'),
 ('{"formula":{"label":"A"}}','expressão obrigatória','Fórmula inválida.'),
 ('{"checklist":[{"id":"same","label":"A"},{"id":"same","label":"B"}]}','ID duplicado','Item de checklist inválido ou duplicado.'),
 ('{"checklist":[{"id":123,"label":"A"}]}','ID numérico','Item de checklist inválido ou duplicado.'),
 ('{"checklist":[{"id":"a/b","label":"A"}]}','ID fora do formato','Item de checklist inválido ou duplicado.'),
 ('{"checklist":[{"id":"a"}]}','rótulo obrigatório','Item de checklist inválido ou duplicado.'),
 ('{"cta":{"title":"A","body":"B","url":"https://wa.me/123"}}','botão obrigatório','Texto do banner inválido.')
) as invalid(payload,name,message);

select pg_temp.denied(format('select public.app_admin_save_lesson_presentation(pg_temp.id(130),%L::jsonb)',
 jsonb_set(pg_temp.presentation(),'{cta,url}',to_jsonb(url))), 'URL recusada: '||label,
 'Informe um link HTTPS oficial do WhatsApp.')
from (values
 ('http://wa.me/123','HTTP'),('//wa.me/123','relativa'),('javascript:alert(1)','protocolo ativo'),
 ('https://api.whatsapp.com.evil.test/send','sufixo de terceiro'),
 ('https://wa.me@evil.test/','domínio no usuário'),('https://usr:pw@wa.me/','credenciais'),
 ('https://example.test/wa.me','domínio no caminho'),('https://wa.me:8443/','porta'),
 ('https://nonexistent.whatsapp.com/','subdomínio fora da lista'),
 (E'https://wa.me\\@evil.test','barra invertida'),
 (E'https://wa.me\t.evil.test/','controle invisível'),
 ('https://wa.me/%99%zz','escape inválido')
) as invalid(url,label);
select pg_temp.ok(public.app_admin_save_lesson_presentation(pg_temp.id(132),
 jsonb_set(pg_temp.presentation(),'{cta,url}','"https://wa.me/123?text=Exemplo%20literal"'))
 =jsonb_build_object('lesson_id',pg_temp.id(132)),'link de conversa com escape aceito');
select pg_temp.ok(public.app_lesson_presentation(pg_temp.id(130),true)
 =jsonb_build_object('presentation',pg_temp.presentation(),'checked_ids','[]'::jsonb),
 'entrada inválida deixa definição anterior intacta');
select pg_temp.ok(public.app_lesson(pg_temp.id(130))#>>'{lesson,body}'='<p>Objetivo original</p>',
 'objetivo original continua no detalhe da aula');

select pg_temp.login(1);
select pg_temp.ok(public.app_lesson_presentation(pg_temp.id(130))
 =jsonb_build_object('presentation',pg_temp.presentation(),'checked_ids','[]'::jsonb),'composição completa para membro');
select pg_temp.ok(public.app_lesson_checklist_item(pg_temp.id(130),'a_2',true)='{"checked":true}','marcar segundo item');
select pg_temp.ok(public.app_lesson_checklist_item(pg_temp.id(130),'z-1',true)='{"checked":true}','marcar primeiro item');
select pg_temp.ok(public.app_lesson_checklist_item(pg_temp.id(130),'z-1',true)='{"checked":true}','repetir marcação');
select pg_temp.ok(public.app_lesson_presentation(pg_temp.id(130))->'checked_ids'='["z-1","a_2"]',
 'ordem das marcações acompanha a definição');
select pg_temp.ok(public.app_lesson_checklist_item(pg_temp.id(132),'z-1',true)='{"checked":true}',
 'assinante marca na aula protegida');
select pg_temp.ok(public.app_lesson_checklist_item(pg_temp.id(132),'a_2',true)='{"checked":true}',
 'assinante marca o segundo ID também na aula protegida');
select pg_temp.ok(public.app_lesson_checklist_item(pg_temp.id(130),'z-1',false)='{"checked":false}',
 'titular desmarca ID na primeira aula');
select pg_temp.ok(public.app_lesson_presentation(pg_temp.id(130))->'checked_ids'='["a_2"]',
 'desmarcação atualiza apenas o item na primeira aula');
select pg_temp.ok(public.app_lesson_presentation(pg_temp.id(132))->'checked_ids'='["z-1","a_2"]',
 'desmarcação preserva os mesmos IDs do titular na outra aula');
select pg_temp.ok(public.app_lesson_checklist_item(pg_temp.id(130),'z-1',true)='{"checked":true}',
 'titular repõe marcação na primeira aula');
select pg_temp.denied('select public.app_lesson_checklist_item(pg_temp.id(131),''z-1'',true)',
 'ID da outra aula indisponível','Item de checklist indisponível.');
select pg_temp.denied('select public.app_lesson_checklist_item(pg_temp.id(130),''z-1'',null)',
 'estado booleano obrigatório','Informe a marcação de um item válido.');
select pg_temp.denied('select public.app_lesson_presentation(pg_temp.id(133))','membro sem leitura de rascunho',
 'Aula indisponível para seu acesso.');

select pg_temp.login(2);
select pg_temp.ok(public.app_lesson_presentation(pg_temp.id(130))->'checked_ids'='[]','outro membro vê só as suas');
select pg_temp.ok(public.app_lesson_checklist_item(pg_temp.id(130),'z-1',true)='{"checked":true}','outro membro marca');
select pg_temp.ok(public.app_lesson_checklist_item(pg_temp.id(130),'z-1',false)='{"checked":false}','desmarcar');
select pg_temp.ok(public.app_lesson_checklist_item(pg_temp.id(130),'z-1',false)='{"checked":false}','repetir desmarcação');
select pg_temp.ok(public.app_lesson_checklist_item(pg_temp.id(130),'a_2',true)='{"checked":true}','outro membro marca outro item');
select pg_temp.denied('select public.app_lesson_presentation(pg_temp.id(132))','membro sem leitura do CTA pago',
 'Aula indisponível para seu acesso.');
select pg_temp.denied('select public.app_lesson_checklist_item(pg_temp.id(132),''z-1'',true)',
 'membro sem escrita na aula bloqueada','Aula indisponível para seu acesso.');

select pg_temp.login(5);
select pg_temp.ok(public.app_lesson_presentation(pg_temp.id(130),true)->'checked_ids'='[]',
 'editor sem marcações dos membros');
select pg_temp.ok(public.app_export_data()->'lesson_checklist_items'='[]','admin sem exportação de terceiros');
select pg_temp.ok(public.app_admin_save_lesson_presentation(pg_temp.id(130),
 jsonb_set(pg_temp.presentation(),'{checklist}','[{"id":"z-1","label":"Etapa renomeada"}]'))
 =jsonb_build_object('lesson_id',pg_temp.id(130)),'editor mantém ID renomeado e remove item');

select pg_temp.login(1);
select pg_temp.ok(public.app_lesson_presentation(pg_temp.id(130))->'checked_ids'='["z-1"]',
 'retido pelo mesmo ID e removido pela definição');
select pg_temp.denied('select public.app_lesson_checklist_item(pg_temp.id(130),''a_2'',false)',
 'item removido indisponível','Item de checklist indisponível.');
select pg_temp.ok(public.app_lesson_presentation(pg_temp.id(132))->'checked_ids'='["z-1","a_2"]',
 'alterar a definição da primeira aula preserva o mesmo ID na outra');

reset role;
select pg_temp.ok(not exists(select from public.ica_lesson_checklist_items
 where lesson_id=pg_temp.id(130) and item_id='a_2'),'remoção limpa dados dos dois membros');
update public.ica_subscriptions set revoked_at=now() where user_id=pg_temp.id(1);
set local role authenticated;
select pg_temp.login(1);
select pg_temp.denied('select public.app_lesson_presentation(pg_temp.id(132))','assinatura revogada bloqueia leitura',
 'Aula indisponível para seu acesso.');
select pg_temp.ok(public.app_export_data()->'lesson_checklist_items'=jsonb_build_array(
 jsonb_build_object('lesson_id',pg_temp.id(130),'item_id','z-1'),
 jsonb_build_object('lesson_id',pg_temp.id(132),'item_id','a_2'),
 jsonb_build_object('lesson_id',pg_temp.id(132),'item_id','z-1')
),'titular exporta marcações sem conteúdo de terceiros, inclusive após revogação');
select pg_temp.login(2);
select pg_temp.ok(public.app_export_data()->'lesson_checklist_items'='[]','segundo titular exporta somente suas marcas ativas');

select pg_temp.login(5);
select pg_temp.ok(public.app_admin_save_lesson_presentation(pg_temp.id(130),null)
 =jsonb_build_object('lesson_id',pg_temp.id(130)),'SQL null limpa apresentação');
select pg_temp.ok(public.app_lesson_presentation(pg_temp.id(130),true)='{"presentation":null,"checked_ids":[]}',
 'aula volta ao estado sem apresentação');
select pg_temp.login(1);
select pg_temp.ok(public.app_export_data()->'lesson_checklist_items'=jsonb_build_array(
 jsonb_build_object('lesson_id',pg_temp.id(132),'item_id','a_2'),
 jsonb_build_object('lesson_id',pg_temp.id(132),'item_id','z-1')
),'limpar a primeira aula preserva as duas marcas do mesmo titular na outra');

select pg_temp.login(5);
select pg_temp.ok(public.app_admin_save_lesson_presentation(pg_temp.id(130),pg_temp.presentation())
 =jsonb_build_object('lesson_id',pg_temp.id(130)),'editor pode recriar com os mesmos IDs');
select pg_temp.login(1);
select pg_temp.ok(public.app_lesson_presentation(pg_temp.id(130))->'checked_ids'='[]',
 'recriar checklist não restaura marcas descartadas');
select pg_temp.ok(public.app_lesson_checklist_item(pg_temp.id(130),'z-1',true)='{"checked":true}',
 'titular marca item antes de limpar com JSON null');
select pg_temp.ok(public.app_lesson_presentation(pg_temp.id(130))
 =jsonb_build_object('presentation',pg_temp.presentation(),'checked_ids','["z-1"]'::jsonb),
 'apresentação e marcação persistidas antes de JSON null');
select pg_temp.login(5);
select pg_temp.ok(public.app_admin_save_lesson_presentation(pg_temp.id(130),'null'::jsonb)
 =jsonb_build_object('lesson_id',pg_temp.id(130)),'JSON null limpa apresentação');
reset role;
select pg_temp.ok(not exists(select from public.ica_lesson_presentations where lesson_id=pg_temp.id(130))
 and not exists(select from public.ica_lesson_checklist_items where lesson_id=pg_temp.id(130)),
 'JSON null remove imediatamente a apresentação e as marcações');

set local role authenticated;
select pg_temp.login(5);
select pg_temp.ok(public.app_admin_save_lesson_presentation(pg_temp.id(130),pg_temp.presentation())
 =jsonb_build_object('lesson_id',pg_temp.id(130)),'editor repõe apresentação antes de limpar com objeto vazio');
select pg_temp.login(1);
select pg_temp.ok(public.app_lesson_checklist_item(pg_temp.id(130),'a_2',true)='{"checked":true}',
 'titular marca item antes de limpar com objeto vazio');
select pg_temp.ok(public.app_lesson_presentation(pg_temp.id(130))
 =jsonb_build_object('presentation',pg_temp.presentation(),'checked_ids','["a_2"]'::jsonb),
 'apresentação e marcação persistidas antes de objeto vazio');
select pg_temp.login(5);
select pg_temp.ok(public.app_admin_save_lesson_presentation(pg_temp.id(130),'{}'::jsonb)
 =jsonb_build_object('lesson_id',pg_temp.id(130)),'objeto vazio equivale a limpar');
reset role;
select pg_temp.ok(not exists(select from public.ica_lesson_presentations where lesson_id=pg_temp.id(130))
 and not exists(select from public.ica_lesson_checklist_items where lesson_id=pg_temp.id(130)),
 'objeto vazio remove imediatamente a apresentação e as marcações');

update public.ica_lessons set status='archived' where id=pg_temp.id(133);
update public.ica_app_sessions set revoked_at=now() where id=pg_temp.id(11);
set local role authenticated;
select pg_temp.login(3);
select pg_temp.denied('select public.app_admin_save_lesson_presentation(pg_temp.id(133),pg_temp.presentation())',
 'edição de arquivada bloqueada','Restaure a aula antes de editar a apresentação.');
select pg_temp.login(1);
select pg_temp.denied('select public.app_lesson_checklist_item(pg_temp.id(130),''a_2'',true)',
 'sessão revogada sem escrita','Sessão expirada. Entre novamente.');

reset role;
select count(*) from presentation_checks;
rollback;
