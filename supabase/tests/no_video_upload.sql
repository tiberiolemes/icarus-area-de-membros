\set ON_ERROR_STOP on
begin;

create temporary table no_video_checks(name text primary key);
grant insert on no_video_checks to authenticated,service_role;
create function pg_temp.ok(condition boolean, label text) returns void language plpgsql as $$
begin
 if condition is distinct from true then raise exception 'FAIL: %', label; end if;
 insert into no_video_checks values(label);
end $$;
create function pg_temp.refused(statement text, label text) returns void language plpgsql as $$
declare got text;
begin
 begin execute statement;
 exception when sqlstate 'P0001' then got:=sqlerrm;
 end;
 perform pg_temp.ok(got='A plataforma não recebe vídeo. Use o Bunny Stream ou o YouTube.',label);
end $$;
create function pg_temp.id(n integer) returns uuid language sql immutable as $$
 select ('11b00000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;
create function pg_temp.login(n integer) returns void language sql as $$
 select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.id(n),'role','authenticated',
  'aal','aal1','session_id',pg_temp.id(40+n))::text,true)
$$;
create function pg_temp.as_service(n integer) returns void language sql as $$
 select set_config('request.headers',jsonb_build_object('x-icarus-session-id',pg_temp.id(40+n),'x-icarus-aal','aal1')::text,true)
$$;
create function pg_temp.reserve(n integer,kind text,resource uuid,name text,mime text,size bigint) returns text language sql as $$
 select format('select public.app_upload_access(%L,%L,%L,%L,%L,%s)',pg_temp.id(n),kind,resource,name,mime,size)
$$;

insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
select pg_temp.id(n),'no-video-'||n||'@example.test',now(),'{"icarus_server_created":true}',
 jsonb_build_object('full_name','Envio fictício '||n) from generate_series(1,2)n;
set constraints all immediate;
update public.profiles set role=case id when pg_temp.id(1) then 'admin' else 'member' end
 where id in (select pg_temp.id(n) from generate_series(1,2)n);
insert into auth.sessions(id,user_id,created_at,updated_at,aal)
select pg_temp.id(40+n),pg_temp.id(n),now(),now(),'aal1' from generate_series(1,2)n;
insert into public.courses(id,slug,title,status,access_mode) values(pg_temp.id(100),'sem-video','Curso sem vídeo','published','members');
insert into public.modules(id,course_id,slug,title,status) values(pg_temp.id(101),pg_temp.id(100),'modulo-sem-video','Módulo','published');
insert into public.sections(id,module_id,title,status) values(pg_temp.id(102),pg_temp.id(101),'Seção','published');
-- Aula com MP4 enviado antes da 2.13.0: o arquivo pronto continua no Storage.
insert into public.lessons(id,section_id,slug,title,status,type,storage_path) values
 (pg_temp.id(103),pg_temp.id(102),'aula-antiga','Aula com vídeo antigo','published','video','lesson/'||pg_temp.id(103)||'/'||pg_temp.id(500)||'.mp4');
insert into public.uploads(id,actor_id,kind,resource_id,lesson_id,path,file_name,content_type,size_bytes,state) values
 (pg_temp.id(500),pg_temp.id(1),'lesson',pg_temp.id(103),pg_temp.id(103),'lesson/'||pg_temp.id(103)||'/'||pg_temp.id(500)||'.mp4','aula.mp4','video/mp4',1000,'ready');
insert into public.materials(id,name) values(pg_temp.id(104),'Material sem vídeo');
insert into public.tickets(id,user_id,subject,priority) values(pg_temp.id(105),pg_temp.id(2),'Chamado sem vídeo','normal');

set local role authenticated;
select pg_temp.login(1);
select public.app_touch_session(false);
select pg_temp.login(2);
select public.app_touch_session(false);
reset role;

set local role service_role;
select pg_temp.as_service(1);
select pg_temp.refused(pg_temp.reserve(1,'lesson',pg_temp.id(103),'roteiro.pdf','application/pdf',1024),'aula não recebe mais arquivo');
select pg_temp.refused(pg_temp.reserve(1,'lesson',pg_temp.id(103),'aula.mp4','video/mp4',1024),'aula não recebe MP4');
select pg_temp.refused(pg_temp.reserve(1,'material',pg_temp.id(104),'aula.mp4','video/mp4',1024),'MP4 como material é recusado');
select pg_temp.refused(pg_temp.reserve(1,'material',pg_temp.id(104),'aula.mp4','video/mp4',1073741824),'MP4 grande recebe a mesma frase, não a do tamanho');
select pg_temp.refused(pg_temp.reserve(1,'material',pg_temp.id(104),'aula.mov','video/quicktime',1024),'outro formato de vídeo recebe a mesma frase');
select pg_temp.ok(public.app_upload_access(pg_temp.id(1),'material',pg_temp.id(104),'pacote.zip','application/zip',104857600)->>'status'='pending',
 'ZIP como material continua aceito');
select pg_temp.as_service(2);
select pg_temp.refused(pg_temp.reserve(2,'ticket-attachment',pg_temp.id(105),'tela.mp4','video/mp4',1024),'MP4 no chamado é recusado');
select pg_temp.ok(public.app_media_access(pg_temp.id(2),'lesson',pg_temp.id(103)) @> jsonb_build_object('provider','supabase','can_access',true,
 'storage_path','lesson/'||pg_temp.id(103)||'/'||pg_temp.id(500)||'.mp4'),'aula com MP4 já enviado continua tocando');
reset role;

select pg_temp.ok(not has_function_privilege('authenticated','public.app_upload_access(uuid,text,uuid,text,text,bigint)','execute')
 and not has_function_privilege('anon','public.app_upload_access(uuid,text,uuid,text,text,bigint)','execute')
 and not has_function_privilege('public','public.app_upload_access(uuid,text,uuid,text,text,bigint)','execute')
 and has_function_privilege('service_role','public.app_upload_access(uuid,text,uuid,text,text,bigint)','execute'),
 'a reserva de envio continua só do servidor');

select count(*) as no_video_assertions from no_video_checks;
rollback;
