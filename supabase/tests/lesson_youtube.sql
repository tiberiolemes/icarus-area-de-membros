\set ON_ERROR_STOP on
begin;

create temporary table youtube_checks(name text primary key);
grant insert on youtube_checks to authenticated,service_role;
create function pg_temp.ok(condition boolean, label text) returns void language plpgsql as $$
begin
 if condition is distinct from true then raise exception 'FAIL: %', label; end if;
 insert into youtube_checks values(label);
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
 select ('d0f00000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;

insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
values(pg_temp.id(1),'youtube-member@example.test',now(),'{"icarus_server_created":true}','{"full_name":"Aluno fictício"}');
set constraints all immediate;
insert into auth.sessions(id,user_id,created_at,updated_at,aal) values(pg_temp.id(41),pg_temp.id(1),now(),now(),'aal1');

insert into public.courses(id,slug,title,status,access_mode) values(pg_temp.id(100),'curso-youtube','Curso com YouTube','published','members');
insert into public.modules(id,course_id,slug,title,status) values(pg_temp.id(101),pg_temp.id(100),'modulo-youtube','Módulo','published');
insert into public.sections(id,module_id,title,status) values(pg_temp.id(102),pg_temp.id(101),'Seção','published');
insert into public.lessons(id,section_id,slug,title,status,type,video_id) values
 (pg_temp.id(103),pg_temp.id(102),'aula-youtube','Aula no YouTube','published','video','dQw4w9WgXcQ'),
 (pg_temp.id(104),pg_temp.id(102),'aula-bunny','Aula no Bunny','published','video','0b1c2d3e-4f50-4a61-8b72-9c8d7e6f5a4b');

select pg_temp.denied(format('update public.lessons set video_id=%L where id=%L','javascript:alert(1)',pg_temp.id(103)),'vídeo fora dos formatos do Bunny e do YouTube é recusado');
select pg_temp.denied(format('update public.lessons set video_id=%L where id=%L','https://youtu.be/dQw4w9WgXcQ',pg_temp.id(103)),'o link inteiro não vai para o banco, só o ID');

select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.id(1),'role','authenticated','aal','aal1','session_id',pg_temp.id(41))::text,true);
set local role authenticated;
select public.app_touch_session(false);
reset role;
set local role service_role;
select set_config('request.headers',jsonb_build_object('x-icarus-session-id',pg_temp.id(41),'x-icarus-aal','aal1')::text,true);
select pg_temp.ok(public.app_media_access(pg_temp.id(1),'lesson',pg_temp.id(103)) @> '{"provider":"youtube","video_id":"dQw4w9WgXcQ","can_access":true}','aula do YouTube sai marcada como youtube');
select pg_temp.ok(public.app_media_access(pg_temp.id(1),'lesson',pg_temp.id(104)) @> '{"provider":"bunny"}','aula do Bunny continua marcada como bunny');
reset role;

select count(*) as lesson_youtube_assertions from youtube_checks;
rollback;
