\set ON_ERROR_STOP on
begin;

create temporary table cover_focus_checks(name text primary key);
grant insert on cover_focus_checks to authenticated,service_role;
create function pg_temp.ok(condition boolean, label text) returns void language plpgsql as $$
begin
 if condition is distinct from true then raise exception 'FAIL: %', label; end if;
 insert into cover_focus_checks values(label);
end $$;
create function pg_temp.denied(statement text, label text) returns void language plpgsql as $$
declare denied boolean:=false;
begin
 begin execute statement;
 exception when insufficient_privilege or sqlstate 'P0001' or check_violation then denied:=true;
 end;
 perform pg_temp.ok(denied,label);
end $$;
create function pg_temp.id(n integer) returns uuid language sql immutable as $$
 select ('c0f00000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;
create function pg_temp.login(n integer) returns void language sql as $$
 select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.id(n),'role','authenticated',
  'aal','aal1','session_id',pg_temp.id(40+n))::text,true)
$$;
create function pg_temp.focus(n integer) returns text language sql as $$
 select cover_focus from public.courses where id=pg_temp.id(n)
$$;

insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
select pg_temp.id(n),'cover-focus-'||n||'@example.test',now(),'{"icarus_server_created":true}',
 jsonb_build_object('full_name','Capa fictícia '||n) from generate_series(1,4)n;
set constraints all immediate;
update public.profiles set role=case id when pg_temp.id(1) then 'admin' when pg_temp.id(2) then 'instructor'
 when pg_temp.id(3) then 'moderator' else 'member' end where id in (select pg_temp.id(n) from generate_series(1,4)n);
insert into auth.sessions(id,user_id,created_at,updated_at,aal)
select pg_temp.id(40+n),pg_temp.id(n),now(),now(),'aal1' from generate_series(1,4)n;

insert into public.courses(id,slug,title,status,access_mode) values
 (pg_temp.id(100),'capa-ficticia','Curso com capa','published','members'),
 (pg_temp.id(101),'capa-arquivada','Curso arquivado','draft','members');
update public.courses set status='archived',previous_status='draft' where id=pg_temp.id(101);
update public.courses set cover_url='course-cover/'||pg_temp.id(100)||'/'||pg_temp.id(200)||'.jpg' where id=pg_temp.id(100);
insert into public.uploads(id,actor_id,kind,resource_id,course_id,path,file_name,content_type,size_bytes,state)
values(pg_temp.id(200),pg_temp.id(1),'course-cover',pg_temp.id(100),pg_temp.id(100),
 'course-cover/'||pg_temp.id(100)||'/'||pg_temp.id(200)||'.jpg','capa.jpg','image/jpeg',1000,'ready');
-- Um curso em rascunho com capa pronta e um publicado com o envio ainda pendente: nenhum dos dois sai para o aluno.
insert into public.courses(id,slug,title,status,access_mode) values
 (pg_temp.id(102),'capa-rascunho','Curso em rascunho','draft','members'),
 (pg_temp.id(103),'capa-pendente','Curso com envio pendente','published','members');
update public.courses set cover_url='course-cover/'||id||'/'||pg_temp.id(202)||'.jpg' where id=pg_temp.id(102);
update public.courses set cover_url='course-cover/'||id||'/'||pg_temp.id(203)||'.jpg' where id=pg_temp.id(103);
insert into public.uploads(id,actor_id,kind,resource_id,course_id,path,file_name,content_type,size_bytes,state) values
 (pg_temp.id(202),pg_temp.id(1),'course-cover',pg_temp.id(102),pg_temp.id(102),'course-cover/'||pg_temp.id(102)||'/'||pg_temp.id(202)||'.jpg','capa.jpg','image/jpeg',1000,'ready'),
 (pg_temp.id(203),pg_temp.id(1),'course-cover',pg_temp.id(103),pg_temp.id(103),'course-cover/'||pg_temp.id(103)||'/'||pg_temp.id(203)||'.jpg','capa.jpg','image/jpeg',1000,'pending');

select pg_temp.ok(pg_temp.focus(100)='50% 50%','a capa nasce com o foco no centro');
select pg_temp.ok(has_function_privilege('authenticated','public.app_admin_course_cover_focus(uuid,text)','execute')
 and not has_function_privilege('anon','public.app_admin_course_cover_focus(uuid,text)','execute')
 and not has_function_privilege('service_role','public.app_admin_course_cover_focus(uuid,text)','execute'),
 'só a sessão logada chama a RPC do foco');
select pg_temp.ok(has_function_privilege('service_role','public.app_media_access(uuid,text,uuid)','execute')
 and not has_function_privilege('anon','public.app_media_access(uuid,text,uuid)','execute')
 and not has_function_privilege('authenticated','public.app_media_access(uuid,text,uuid)','execute'),
 'a liberação de mídia continua só do servidor');

set local role authenticated;
select pg_temp.login(4);
select pg_temp.denied(format('select public.app_admin_course_cover_focus(%L,%L)',pg_temp.id(100),'10% 10%'),'membro não muda o foco');
select pg_temp.login(3);
select pg_temp.denied(format('select public.app_admin_course_cover_focus(%L,%L)',pg_temp.id(100),'10% 10%'),'moderador não muda o foco');
select pg_temp.login(2);
select pg_temp.ok(public.app_admin_course_cover_focus(pg_temp.id(100),'20% 70%')
 =jsonb_build_object('id',pg_temp.id(100),'cover_focus','20% 70%'),'instrutor salva o foco e recebe o valor gravado');
reset role;
select pg_temp.ok(pg_temp.focus(100)='20% 70%','o foco fica gravado no curso');
select pg_temp.ok((select count(*)=1 from public.audit_events where actor_id=pg_temp.id(2) and action='update'
 and target_type='courses' and target_id=pg_temp.id(100)),'a mudança do foco entra na auditoria');

set local role authenticated;
select public.app_admin_course_cover_focus(pg_temp.id(100),'20% 70%');
reset role;
select pg_temp.ok((select count(*)=1 from public.audit_events where target_type='courses' and target_id=pg_temp.id(100)),
 'salvar o mesmo foco não gera novo registro');

set local role authenticated;
select pg_temp.login(1);
select public.app_admin_course_cover_focus(pg_temp.id(100),'0% 100%');
select pg_temp.ok(public.app_admin_list('courses','capa-ficticia')->'items'->0->>'cover_focus'='0% 100%',
 'administrador salva os extremos e o editor recebe o foco');
select pg_temp.denied(format('select public.app_admin_course_cover_focus(%L,%L)',pg_temp.id(100),bad),'foco inválido recusado: '||bad)
from unnest(array['101% 50%','50%','left top','50% 50%;','-1% 50%','50%  50%','5.5% 50%','50% 50% 50%','100%100%','','050% 50%']) bad;
select pg_temp.denied(format('select public.app_admin_course_cover_focus(%L,null)',pg_temp.id(100)),'foco vazio recusado');
select pg_temp.denied('select public.app_admin_course_cover_focus(null,''50% 50%'')','curso vazio recusado');
select pg_temp.denied(format('select public.app_admin_course_cover_focus(%L,%L)',pg_temp.id(999),'50% 50%'),'curso inexistente recusado');
select pg_temp.denied(format('select public.app_admin_course_cover_focus(%L,%L)',pg_temp.id(101),'50% 50%'),'curso arquivado não muda o foco');
reset role;
select pg_temp.ok(pg_temp.focus(100)='0% 100%' and pg_temp.focus(101)='50% 50%','tentativas recusadas não alteram nada');
select pg_temp.denied(format('update public.courses set cover_focus=%L where id=%L','center',pg_temp.id(100)),
 'a tabela recusa foco fora do formato mesmo sem passar pela RPC');

set local role authenticated;
select pg_temp.login(4);
select public.app_touch_session(false);
reset role;
set local role service_role;
select set_config('request.headers',jsonb_build_object('x-icarus-session-id',pg_temp.id(44),'x-icarus-aal','aal1')::text,true);
select pg_temp.ok(public.app_media_access(pg_temp.id(4),'course-cover',pg_temp.id(100))
 @> jsonb_build_object('can_access',true,'provider','supabase','bucket','icarus-private','focus','0% 100%',
  'storage_path','course-cover/'||pg_temp.id(100)||'/'||pg_temp.id(200)||'.jpg'),
 'a liberação da capa entrega o caminho e o foco');
select pg_temp.denied(format('select public.app_media_access(%L,%L,%L)',pg_temp.id(4),'course-cover',pg_temp.id(101)),
 'curso sem capa continua sem arquivo para liberar');
select pg_temp.denied(format('select public.app_media_access(%L,%L,%L)',pg_temp.id(4),'course-cover',pg_temp.id(102)),
 'capa de curso em rascunho não sai para o aluno');
select pg_temp.denied(format('select public.app_media_access(%L,%L,%L)',pg_temp.id(4),'course-cover',pg_temp.id(103)),
 'capa com envio ainda pendente continua indisponível');
reset role;

select count(*) as course_cover_focus_assertions from cover_focus_checks;
rollback;
