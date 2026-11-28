\set ON_ERROR_STOP on
begin;

create temporary table content_delete_checks(name text primary key);
grant insert on content_delete_checks to anon,authenticated,service_role;
create function pg_temp.ok(condition boolean, label text) returns void language plpgsql as $$
begin
 if condition is distinct from true then raise exception 'FAIL: %', label; end if;
 insert into content_delete_checks values(label);
end $$;
create function pg_temp.forbidden(statement text, label text) returns void language plpgsql as $$
declare denied boolean:=false;
begin
 begin execute statement;
 exception when insufficient_privilege then denied:=true;
 end;
 perform pg_temp.ok(denied,label);
end $$;
create function pg_temp.fails(statement text, message text, label text) returns void language plpgsql as $$
declare got text;
begin
 begin execute statement;
 exception when sqlstate 'P0001' then got:=sqlerrm;
 end;
 perform pg_temp.ok(got=message,label||' (recebido: '||coalesce(got,'sem erro')||')');
end $$;
create function pg_temp.id(n integer) returns uuid language sql immutable as $$
 select ('de1e7e00-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;
create function pg_temp.file(kind text, resource integer, upload integer, ext text) returns text language sql immutable as $$
 select kind||'/'||pg_temp.id(resource)||'/'||pg_temp.id(upload)||'.'||ext
$$;
create function pg_temp.login(n integer) returns void language sql as $$
 select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.id(n),'role','authenticated',
  'aal','aal1','session_id',pg_temp.id(40+n))::text,true)
$$;
create function pg_temp.service(n integer) returns void language sql as $$
 select set_config('request.headers',jsonb_build_object('x-icarus-session-id',pg_temp.id(40+n),'x-icarus-aal','aal1')::text,true)
$$;
create function pg_temp.paths(result jsonb) returns text[] language sql immutable as $$
 select array(select x from jsonb_array_elements_text(result->'paths') x order by x)
$$;
create function pg_temp.preview(sections integer, lessons integer, materials integer, folders integer, students integer,
 comments integer, linked integer, orphaned integer) returns jsonb language sql immutable as $$
 select jsonb_build_object('sections',sections,'lessons',lessons,'materials',materials,'folders',folders,'students',students,
  'comments',comments,'linked_materials',linked,'orphaned_materials',orphaned)
$$;

-- 1 admin, 2 instrutor, 3 moderador, 4 e 5 alunos.
insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
select pg_temp.id(n),'content-delete-'||n||'@example.test',now(),'{"icarus_server_created":true}',
 jsonb_build_object('full_name','Pessoa fictícia '||n) from generate_series(1,5)n;
set constraints all immediate;
update public.profiles set role=case id when pg_temp.id(1) then 'admin' when pg_temp.id(2) then 'instructor' when pg_temp.id(3) then 'moderator' else 'member' end
 where id in (select pg_temp.id(n) from generate_series(1,5)n);
insert into auth.sessions(id,user_id,created_at,updated_at,aal)
select pg_temp.id(40+n),pg_temp.id(n),now(),now(),'aal1' from generate_series(1,5)n;

-- Curso com certificado: S (seção nomeada) com L1 e L2, S2 com L3.
insert into public.courses(id,slug,title,status,access_mode,certificate_enabled,signer_name,signer_title)
 values(pg_temp.id(100),'curso-exclusao','Curso com exclusão','published','members',true,'Pessoa responsável','Coordenação');
insert into public.modules(id,course_id,slug,title,status) values(pg_temp.id(101),pg_temp.id(100),'modulo-exclusao','Módulo com exclusão','published');
insert into public.sections(id,module_id,title,status,order_index) values
 (pg_temp.id(102),pg_temp.id(101),'Seção nomeada','published',0),(pg_temp.id(103),pg_temp.id(101),'Seção extra','published',1);
insert into public.lessons(id,section_id,slug,title,status,type,duration_seconds,storage_path,order_index) values
 (pg_temp.id(104),pg_temp.id(102),'aula-um','Aula um','published','video',600,pg_temp.file('lesson',104,500,'mp4'),0),
 (pg_temp.id(105),pg_temp.id(102),'aula-dois','Aula dois','published','text',300,null,1),
 (pg_temp.id(106),pg_temp.id(103),'aula-tres','Aula três','published','text',300,pg_temp.file('avatar',4,900,'png'),0);
-- Mx só em L1, My em L1 e L2, Mz (dentro de P2, subpasta de P) em L2.
insert into public.material_folders(id,parent_id,name,status) values
 (pg_temp.id(300),null,'Pasta P','published'),(pg_temp.id(301),pg_temp.id(300),'Pasta P2','published');
insert into public.materials(id,folder_id,name,status,access_mode,storage_path) values
 (pg_temp.id(200),null,'Material X','published','members',null),
 (pg_temp.id(201),null,'Material Y','published','members',pg_temp.file('material',201,503,'pdf')),
 (pg_temp.id(202),pg_temp.id(301),'Material Z','published','members',pg_temp.file('material',202,502,'pdf')),
 -- Linha antiga com caminho escolhido à mão: aponta para o anexo de um chamado.
 (pg_temp.id(203),null,'Material forjado','draft','members',pg_temp.file('ticket-attachment',901,902,'pdf'));
insert into public.material_lessons(material_id,lesson_id) values
 (pg_temp.id(200),pg_temp.id(104)),(pg_temp.id(201),pg_temp.id(104)),(pg_temp.id(201),pg_temp.id(105)),(pg_temp.id(202),pg_temp.id(105));

-- Tudo o que L1 carrega.
insert into public.lesson_progress(user_id,lesson_id,position_seconds,completed_at) values
 (pg_temp.id(4),pg_temp.id(104),600,now()),(pg_temp.id(5),pg_temp.id(104),600,now());
insert into public.lesson_favorites(user_id,lesson_id) values(pg_temp.id(4),pg_temp.id(104));
insert into public.lesson_notes(user_id,lesson_id,body) values(pg_temp.id(4),pg_temp.id(104),'Nota fictícia');
insert into public.lesson_comments(id,lesson_id,author_id,parent_id,body,is_instructor) values
 (pg_temp.id(400),pg_temp.id(104),pg_temp.id(4),null,'Comentário fictício',false),
 (pg_temp.id(401),pg_temp.id(104),pg_temp.id(5),pg_temp.id(400),'Resposta fictícia',false);
-- A aprovação grava a notificação que aponta para o comentário.
update public.lesson_comments set status='approved' where id=pg_temp.id(400);
insert into public.lesson_presentations(lesson_id,presentation) values(pg_temp.id(104),'{"checklist":[{"id":"passo-1","label":"Passo fictício"}]}');
insert into public.lesson_checklist_items(user_id,lesson_id,item_id) values(pg_temp.id(4),pg_temp.id(104),'passo-1');
insert into public.uploads(id,actor_id,kind,resource_id,lesson_id,material_id,path,file_name,content_type,size_bytes,state) values
 (pg_temp.id(500),pg_temp.id(1),'lesson',pg_temp.id(104),pg_temp.id(104),null,pg_temp.file('lesson',104,500,'mp4'),'aula.mp4','video/mp4',1000,'ready'),
 (pg_temp.id(501),pg_temp.id(1),'lesson',pg_temp.id(104),pg_temp.id(104),null,pg_temp.file('lesson',104,501,'mp4'),'aula-nova.mp4','video/mp4',1000,'pending'),
 (pg_temp.id(502),pg_temp.id(1),'material',pg_temp.id(202),null,pg_temp.id(202),pg_temp.file('material',202,502,'pdf'),'z.pdf','application/pdf',1000,'ready'),
 (pg_temp.id(503),pg_temp.id(1),'material',pg_temp.id(201),null,pg_temp.id(201),pg_temp.file('material',201,503,'pdf'),'y.pdf','application/pdf',1000,'ready');
insert into public.certificates(id,user_id,course_id,curriculum_version,student_name,course_title,duration_minutes,lesson_ids)
select pg_temp.id(700),pg_temp.id(4),c.id,c.curriculum_version,'Pessoa fictícia 4',c.title,20,c.required_lesson_ids from public.courses c where c.id=pg_temp.id(100);
insert into app_private.catalog_launches(id,module_id,title,summary,enabled) values(pg_temp.id(600),pg_temp.id(101),'Lançamento fictício','Resumo fictício',true);
insert into app_private.catalog_launch_signups(launch_id,user_id) values(pg_temp.id(600),pg_temp.id(4));
insert into public.notifications(user_id,event_key,source_id) values(pg_temp.id(4),'catalog_launch',pg_temp.id(600));
-- Outro curso com um módulo cujas aulas ficam só na seção automática, escondida no painel.
insert into public.courses(id,slug,title,status,access_mode) values(pg_temp.id(110),'curso-secao-automatica','Curso com seção automática','draft','members');
insert into public.modules(id,course_id,slug,title,status) values(pg_temp.id(111),pg_temp.id(110),'modulo-sem-secao','Módulo sem seção','published');
insert into public.sections(id,module_id,title,status,order_index,is_default) values(pg_temp.id(112),pg_temp.id(111),'Aulas do módulo','published',-1,true);
insert into public.lessons(id,section_id,slug,title,status) values
 (pg_temp.id(113),pg_temp.id(112),'aula-solta-um','Aula solta um','published'),(pg_temp.id(114),pg_temp.id(112),'aula-solta-dois','Aula solta dois','published');
create temporary table before_delete as
 select (select to_jsonb(x) from public.certificates x where x.id=pg_temp.id(700)) certificate,
  (select curriculum_version from public.courses where id=pg_temp.id(100)) version;
select code as cert_code from public.certificates where id=pg_temp.id(700) \gset

select pg_temp.ok((select required_lesson_ids from public.courses where id=pg_temp.id(100))=array[pg_temp.id(104),pg_temp.id(105),pg_temp.id(106)],
 'as três aulas começam obrigatórias');
select pg_temp.ok((select count(*)=2 from app_private.ranking_events where kind='lesson' and source_id=pg_temp.id(104))
 and exists(select 1 from public.notifications where event_key='lesson_comment_approved' and source_id=pg_temp.id(400)),
 'a aula começa com pontos de ranking e aviso de comentário');

set local role authenticated;
select pg_temp.login(4);
select public.app_touch_session(false);
select pg_temp.login(3);
select public.app_touch_session(false);
select pg_temp.login(2);
select public.app_touch_session(false);
select pg_temp.login(1);
select public.app_touch_session(false);
select pg_temp.ok(public.app_admin_delete_preview('lessons',pg_temp.id(104))=pg_temp.preview(0,1,0,0,2,2,0,1),
 'prévia da aula conta alunos, comentários e o material que fica sem aula');
select pg_temp.fails(format('select public.app_admin_delete_preview(%L,%L)','courses',pg_temp.id(100)),'Esta entidade não pode ser excluída.',
 'curso não entra na exclusão');
select pg_temp.fails(format('select public.app_admin_delete_preview(%L,%L)','lessons',pg_temp.id(999)),'Registro indisponível.',
 'prévia de aula inexistente');
select pg_temp.login(3);
select pg_temp.fails(format('select public.app_admin_delete_preview(%L,%L)','lessons',pg_temp.id(104)),'Operação não permitida.','moderador não vê a prévia');
select pg_temp.login(4);
select pg_temp.fails(format('select public.app_admin_delete_preview(%L,%L)','lessons',pg_temp.id(104)),'Operação não permitida.','membro não vê a prévia');
select pg_temp.forbidden(format('select public.app_admin_delete(%L,%L,%L)',pg_temp.id(4),'lessons',pg_temp.id(104)),'sessão logada não chama a exclusão');
reset role;
select pg_temp.ok(has_function_privilege('service_role','public.app_admin_delete(uuid,text,uuid)','execute')
 and not has_function_privilege('authenticated','public.app_admin_delete(uuid,text,uuid)','execute')
 and not has_function_privilege('anon','public.app_admin_delete(uuid,text,uuid)','execute'),'exclusão só pela função de serviço');
select pg_temp.ok(has_function_privilege('authenticated','public.app_admin_delete_preview(text,uuid)','execute')
 and not has_function_privilege('anon','public.app_admin_delete_preview(text,uuid)','execute')
 and not has_function_privilege('service_role','public.app_admin_delete_preview(text,uuid)','execute'),'prévia só para a sessão logada');

-- Aula: some o que depende dela; certificado e auditoria ficam.
set local role service_role;
select pg_temp.service(3);
select pg_temp.fails(format('select public.app_admin_delete(%L,%L,%L)',pg_temp.id(3),'lessons',pg_temp.id(104)),'Operação não permitida.','moderador não exclui');
select pg_temp.service(4);
select pg_temp.fails(format('select public.app_admin_delete(%L,%L,%L)',pg_temp.id(4),'lessons',pg_temp.id(104)),'Operação não permitida.','membro não exclui');
select pg_temp.service(1);
select pg_temp.fails(format('select public.app_admin_delete(%L,%L,%L)',pg_temp.id(1),'courses',pg_temp.id(100)),'Esta entidade não pode ser excluída.',
 'curso não é excluído');
select public.app_admin_delete(pg_temp.id(1),'lessons',pg_temp.id(104)) as deleted_lesson \gset
select pg_temp.fails(format('select public.app_admin_delete(%L,%L,%L)',pg_temp.id(1),'lessons',pg_temp.id(104)),'Registro indisponível.',
 'segunda exclusão da mesma aula');
reset role;
select pg_temp.ok((:'deleted_lesson'::jsonb)->>'id'=pg_temp.id(104)::text
 and pg_temp.paths(:'deleted_lesson')=array[pg_temp.file('lesson',104,500,'mp4'),pg_temp.file('lesson',104,501,'mp4')],
 'exclusão da aula devolve os arquivos dela, sem repetir');
select pg_temp.ok(not exists(select 1 from public.lessons where id=pg_temp.id(104))
 and not exists(select 1 from public.lesson_progress where lesson_id=pg_temp.id(104))
 and not exists(select 1 from public.lesson_favorites where lesson_id=pg_temp.id(104))
 and not exists(select 1 from public.lesson_notes where lesson_id=pg_temp.id(104))
 and not exists(select 1 from public.lesson_comments where lesson_id=pg_temp.id(104))
 and not exists(select 1 from public.lesson_presentations where lesson_id=pg_temp.id(104))
 and not exists(select 1 from public.lesson_checklist_items where lesson_id=pg_temp.id(104))
 and not exists(select 1 from public.uploads where lesson_id=pg_temp.id(104)),
 'some progresso, favorito, nota, comentários, apresentação, checklist e uploads da aula');
select pg_temp.ok(not exists(select 1 from app_private.ranking_events where kind='lesson' and source_id=pg_temp.id(104))
 and not exists(select 1 from public.notifications where source_id in (pg_temp.id(400),pg_temp.id(401))),
 'pontos de ranking e aviso do comentário somem com a aula');
select pg_temp.ok((select status from public.materials where id=pg_temp.id(200))='draft'
 and (select status from public.materials where id=pg_temp.id(201))='published'
 and array(select lesson_id from public.material_lessons where material_id=pg_temp.id(201))=array[pg_temp.id(105)],
 'material só da aula volta para rascunho e o outro continua na aula dois');
select pg_temp.ok((select required_lesson_ids=array[pg_temp.id(105),pg_temp.id(106)] and curriculum_version=(select version from before_delete)
 from public.courses where id=pg_temp.id(100)),'obrigatórias perdem a aula sem mudar a versão do currículo');
select pg_temp.ok((select to_jsonb(x) from public.certificates x where x.id=pg_temp.id(700))=(select certificate from before_delete),
 'certificado emitido continua igual');
select pg_temp.ok(exists(select 1 from public.audit_events where actor_id=pg_temp.id(1) and action='delete' and target_type='lessons'
 and target_id=pg_temp.id(104) and reason='Aula um'),'auditoria guarda a exclusão com o nome da aula');
set local role anon;
select pg_temp.ok(public.app_certificate(:'cert_code')->>'id'=pg_temp.id(700)::text,'verificação pública continua com a aula apagada');
reset role;
insert into public.audit_events(actor_id,action,target_type,target_id) values(pg_temp.id(1),'unlink','materials',pg_temp.id(201));
set local role authenticated;
select pg_temp.login(1);
select pg_temp.ok(exists(select 1 from jsonb_array_elements(public.app_admin_audit('Aula um')->'items') x
 where x->>'action_label'='Exclusão definitiva' and x->>'target_label'='Aula' and x->>'reason'='Aula um'),'lista de auditoria mostra a exclusão legível');
select pg_temp.ok(exists(select 1 from jsonb_array_elements(public.app_admin_audit('desvinculado')->'items') x
 where x->>'action_label'='Material desvinculado da aula'),'lista de auditoria mostra o desvínculo legível');

-- Pasta: o instrutor apaga a pasta, a subpasta e o material de dentro.
select pg_temp.login(2);
select pg_temp.ok(public.app_admin_delete_preview('material_folders',pg_temp.id(300))=pg_temp.preview(0,0,1,1,0,0,1,0),
 'prévia da pasta conta a subpasta e o material que está em aula');
reset role;
set local role service_role;
select pg_temp.service(2);
select public.app_admin_delete(pg_temp.id(2),'material_folders',pg_temp.id(300)) as deleted_folder \gset
reset role;
select pg_temp.ok(pg_temp.paths(:'deleted_folder')=array[pg_temp.file('material',202,502,'pdf')],'exclusão da pasta devolve o arquivo do material');
select pg_temp.ok(not exists(select 1 from public.material_folders where id in (pg_temp.id(300),pg_temp.id(301)))
 and not exists(select 1 from public.materials where id=pg_temp.id(202))
 and not exists(select 1 from public.material_lessons where material_id=pg_temp.id(202))
 and not exists(select 1 from public.uploads where material_id=pg_temp.id(202)),'instrutor apaga a pasta, a subpasta e o material');

-- Seção: leva a aula dois e devolve o material Y para rascunho.
set local role authenticated;
select pg_temp.login(1);
select pg_temp.ok(public.app_admin_delete_preview('sections',pg_temp.id(102))=pg_temp.preview(1,1,0,0,0,0,0,1),'prévia da seção');
reset role;
set local role service_role;
select pg_temp.service(1);
select public.app_admin_delete(pg_temp.id(1),'sections',pg_temp.id(102)) as deleted_section \gset
reset role;
select pg_temp.ok(pg_temp.paths(:'deleted_section')='{}' and not exists(select 1 from public.sections where id=pg_temp.id(102))
 and not exists(select 1 from public.lessons where id=pg_temp.id(105)),'excluir a seção apaga as aulas dela');
select pg_temp.ok((select status from public.materials where id=pg_temp.id(201))='draft','material sem nenhuma aula volta para rascunho');

-- Módulo: leva a seção que sobrou, a aula três e o lançamento com as inscrições.
set local role authenticated;
select pg_temp.login(2);
select pg_temp.ok(public.app_admin_delete_preview('modules',pg_temp.id(101))=pg_temp.preview(1,1,0,0,0,0,0,0),'prévia do módulo');
reset role;
set local role service_role;
select pg_temp.service(2);
select public.app_admin_delete(pg_temp.id(2),'modules',pg_temp.id(101)) as deleted_module \gset
reset role;
select pg_temp.ok(not exists(select 1 from public.modules where id=pg_temp.id(101)) and not exists(select 1 from public.sections where id=pg_temp.id(103))
 and not exists(select 1 from public.lessons where id=pg_temp.id(106)),'excluir o módulo apaga as seções e aulas dele');
select pg_temp.ok(not exists(select 1 from app_private.catalog_launches where id=pg_temp.id(600))
 and not exists(select 1 from app_private.catalog_launch_signups where launch_id=pg_temp.id(600))
 and not exists(select 1 from public.notifications where event_key='catalog_launch' and source_id=pg_temp.id(600)),
 'excluir o módulo apaga o lançamento, as inscrições e o aviso de lançamento');
select pg_temp.ok(pg_temp.paths(:'deleted_module')='{}','caminho gravado à mão na aula não volta para o Storage');
select pg_temp.ok((select required_lesson_ids='{}' and curriculum_version=(select version from before_delete) from public.courses where id=pg_temp.id(100))
 and (select to_jsonb(x) from public.certificates x where x.id=pg_temp.id(700))=(select certificate from before_delete),
 'curso fica sem obrigatórias, com a mesma versão e o certificado intacto');

-- Módulo só com a seção automática: a prévia não conta a seção escondida, mas a exclusão leva a seção e as aulas.
set local role authenticated;
select pg_temp.login(1);
select pg_temp.ok(public.app_admin_delete_preview('modules',pg_temp.id(111))=pg_temp.preview(0,2,0,0,0,0,0,0),
 'prévia do módulo não conta a seção automática');
reset role;
set local role service_role;
select pg_temp.service(1);
select public.app_admin_delete(pg_temp.id(1),'modules',pg_temp.id(111)) as deleted_default_module \gset
reset role;
select pg_temp.ok(not exists(select 1 from public.modules where id=pg_temp.id(111)) and not exists(select 1 from public.sections where id=pg_temp.id(112))
 and not exists(select 1 from public.lessons where id in (pg_temp.id(113),pg_temp.id(114))),'excluir o módulo leva a seção automática e as aulas dela');

-- Material avulso.
set local role authenticated;
select pg_temp.login(1);
select pg_temp.ok(public.app_admin_delete_preview('materials',pg_temp.id(201))=pg_temp.preview(0,0,1,0,0,0,0,0),'prévia do material');
reset role;
set local role service_role;
select pg_temp.service(1);
select public.app_admin_delete(pg_temp.id(1),'materials',pg_temp.id(201)) as deleted_material \gset
reset role;
select pg_temp.ok(pg_temp.paths(:'deleted_material')=array[pg_temp.file('material',201,503,'pdf')]
 and not exists(select 1 from public.materials where id=pg_temp.id(201)) and not exists(select 1 from public.uploads where id=pg_temp.id(503)),
 'excluir o material apaga o registro, o upload e devolve o arquivo');
set local role service_role;
select pg_temp.service(1);
select public.app_admin_delete(pg_temp.id(1),'materials',pg_temp.id(203)) as deleted_forged \gset
reset role;
select pg_temp.ok(pg_temp.paths(:'deleted_forged')='{}' and not exists(select 1 from public.materials where id=pg_temp.id(203)),
 'material com caminho de outro arquivo é excluído sem apagar aquele arquivo');
set local role authenticated;
select pg_temp.login(2);
select pg_temp.fails(format('select public.app_admin_save(%L,%L,%L)','materials',null,
 jsonb_build_object('name','Material novo','storage_path',pg_temp.file('ticket-attachment',901,902,'pdf'))),'Campos não permitidos.',
 'salvar material com caminho de arquivo é recusado');
select pg_temp.fails(format('select public.app_admin_save(%L,%L,%L)','lessons',pg_temp.id(113),
 jsonb_build_object('storage_path',pg_temp.file('avatar',4,900,'png'))),'Campos não permitidos.',
 'salvar aula com caminho de arquivo é recusado');
reset role;
select pg_temp.ok((select count(*)=5 from public.audit_events where action='delete' and target_id in
 (pg_temp.id(104),pg_temp.id(300),pg_temp.id(102),pg_temp.id(101),pg_temp.id(201)))
 and exists(select 1 from public.rate_limits where actor_id=pg_temp.id(1) and bucket='content_delete'),'cada exclusão entra na auditoria e no limite');

-- Arquivar deixa de pedir senha.
set local role authenticated;
select pg_temp.login(1);
select pg_temp.ok(public.app_admin_archive('courses',pg_temp.id(100),true)=jsonb_build_object('id',pg_temp.id(100),'archived',true),'admin arquiva sem senha');
select pg_temp.login(4);
select pg_temp.fails(format('select public.app_admin_archive(%L,%L,%L)','courses',pg_temp.id(100),false),'Operação não permitida.','membro não arquiva');
reset role;
select pg_temp.ok((select status='archived' and previous_status='published' from public.courses where id=pg_temp.id(100))
 and exists(select 1 from public.rate_limits where actor_id=pg_temp.id(1) and bucket='archive')
 and exists(select 1 from public.audit_events where actor_id=pg_temp.id(1) and action='archive' and target_id=pg_temp.id(100)),
 'arquivar guarda o estado anterior, conta no limite e audita');
select pg_temp.ok(to_regprocedure('public.app_admin_archive(text,uuid,boolean,text)') is null
 and has_function_privilege('authenticated','public.app_admin_archive(text,uuid,boolean)','execute')
 and not has_function_privilege('anon','public.app_admin_archive(text,uuid,boolean)','execute'),'arquivar com senha saiu');

select count(*) as content_delete_assertions from content_delete_checks;
rollback;
