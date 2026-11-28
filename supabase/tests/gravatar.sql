\set ON_ERROR_STOP on
begin;

create temporary table gravatar_checks(name text primary key);
grant insert on gravatar_checks to authenticated,service_role;
create function pg_temp.ok(condition boolean, label text) returns void language plpgsql as $$
begin
 if condition is distinct from true then raise exception 'FAIL: %', label; end if;
 insert into gravatar_checks values(label);
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
 select ('9a7a0000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;
-- Sessão de serviço da pessoa n, como a Edge Function faz.
create function pg_temp.serve(n integer) returns void language plpgsql as $$
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.id(n),'role','authenticated','aal','aal1','session_id',pg_temp.id(40+n))::text,true);
 perform set_config('request.headers',jsonb_build_object('x-icarus-session-id',pg_temp.id(40+n),'x-icarus-aal','aal1')::text,true);
end $$;

-- 1 sem foto, 2 com foto enviada, 3 já conferido, 4 sem foto para a corrida.
insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
select pg_temp.id(n),' Gravatar'||n||'@Example.Test ',now(),'{"icarus_server_created":true}',jsonb_build_object('full_name','Pessoa fictícia '||n) from generate_series(1,4)n;
set constraints all immediate;
insert into auth.sessions(id,user_id,created_at,updated_at,aal) select pg_temp.id(40+n),pg_temp.id(n),now(),now(),'aal1' from generate_series(1,4)n;
update public.profiles set gravatar_checked_at=now()-interval '1 day' where id=pg_temp.id(3);

select pg_temp.ok((select gravatar_checked_at is null from public.profiles where id=pg_temp.id(1)),'perfil novo nasce sem consulta ao Gravatar');
select pg_temp.ok(not has_function_privilege(r,'public.app_gravatar_context(uuid)','execute') and not has_function_privilege(r,'public.app_gravatar_done(uuid,uuid)','execute'),'sem execute para '||r)
 from unnest(array['anon','authenticated']) r;
select pg_temp.ok(has_function_privilege('service_role','public.app_gravatar_context(uuid)','execute') and has_function_privilege('service_role','public.app_gravatar_done(uuid,uuid)','execute'),'só a Edge Function chama as duas');

-- A sessão precisa existir em app_sessions; o toque do aluno a cria.
do $$ begin for n in 1..4 loop
 perform pg_temp.serve(n);
 set local role authenticated; perform public.app_touch_session(false); reset role;
end loop; end $$;

-- Pessoa 2 envia a própria foto.
select pg_temp.serve(2);
set local role service_role;
select public.app_upload_access(pg_temp.id(2),'avatar',pg_temp.id(2),'foto.png','image/png',64)->>'id' as own_upload \gset
reset role;
insert into storage.objects(bucket_id,name,metadata) select 'icarus-private',path,'{"size":64,"mimetype":"image/png"}' from public.uploads where id=:'own_upload';
set local role service_role;
select public.app_upload_finalize(pg_temp.id(2),:'own_upload');

select pg_temp.serve(1);
select pg_temp.ok(public.app_gravatar_context(pg_temp.id(1))='{"check":true,"email":" Gravatar1@Example.Test "}'::jsonb,'sem foto e sem consulta pede o Gravatar com o email');
select pg_temp.serve(2);
select pg_temp.ok(public.app_gravatar_context(pg_temp.id(2))->'check'='false'::jsonb,'quem tem foto não consulta');
select pg_temp.ok(public.app_gravatar_context(pg_temp.id(2))->'email'='null'::jsonb,'sem consulta o email não sai');
select pg_temp.serve(3);
select pg_temp.ok(public.app_gravatar_context(pg_temp.id(3))->'check'='false'::jsonb,'quem já foi conferido não consulta de novo');
select public.app_gravatar_context(pg_temp.id(3)),public.app_gravatar_context(pg_temp.id(3));
select pg_temp.denied(format('select public.app_gravatar_context(%L)',pg_temp.id(3)),'limite de três consultas por minuto');
select pg_temp.serve(1);
select pg_temp.denied(format('select public.app_gravatar_context(%L)',pg_temp.id(2)),'sessão de outra pessoa não consulta');

-- 404: marca como conferido sem foto.
select pg_temp.ok(public.app_gravatar_done(pg_temp.id(1),null)='{"avatar_id":null}'::jsonb,'404 devolve sem foto');
reset role;
select pg_temp.ok((select gravatar_checked_at is not null and avatar_id is null from public.profiles where id=pg_temp.id(1)),'404 marca a consulta');

-- Pessoa 4: foto do Gravatar guardada vira o avatar.
select pg_temp.serve(4);
set local role service_role;
select public.app_upload_access(pg_temp.id(4),'avatar',pg_temp.id(4),'gravatar.png','image/png',64)->>'id' as gravatar_upload \gset
reset role;
insert into storage.objects(bucket_id,name,metadata) select 'icarus-private',path,'{"size":64,"mimetype":"image/png"}' from public.uploads where id=:'gravatar_upload';
set local role service_role;
select pg_temp.ok(public.app_gravatar_done(pg_temp.id(4),:'gravatar_upload')=jsonb_build_object('avatar_id',:'gravatar_upload'::uuid),'foto do Gravatar vira o avatar');
reset role;
select pg_temp.ok((select avatar_id=:'gravatar_upload'::uuid and gravatar_checked_at is not null from public.profiles where id=pg_temp.id(4)),'avatar e consulta gravados');
select pg_temp.ok((select state='ready' from public.uploads where id=:'gravatar_upload'),'envio do Gravatar finalizado');

-- Pessoa 2: a foto enviada por ela não é trocada pela do Gravatar.
select pg_temp.serve(2);
set local role service_role;
select public.app_upload_access(pg_temp.id(2),'avatar',pg_temp.id(2),'gravatar.png','image/png',64)->>'id' as late_upload \gset
reset role;
insert into storage.objects(bucket_id,name,metadata) select 'icarus-private',path,'{"size":64,"mimetype":"image/png"}' from public.uploads where id=:'late_upload';
set local role service_role;
select pg_temp.ok(public.app_gravatar_done(pg_temp.id(2),:'late_upload')=jsonb_build_object('avatar_id',:'own_upload'::uuid),'app_gravatar_done não sobrescreve avatar_id existente');
select pg_temp.denied(format('select public.app_gravatar_done(%L,%L)',pg_temp.id(2),pg_temp.id(999)),'envio que não é avatar da pessoa é recusado');
reset role;
select pg_temp.ok((select avatar_id=:'own_upload'::uuid from public.profiles where id=pg_temp.id(2)),'foto enviada continua soberana');
select pg_temp.ok((select state='pending' from public.uploads where id=:'late_upload'),'envio do Gravatar descartado fica pendente');

-- O perfil devolve a data da consulta.
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.id(4),'role','authenticated','aal','aal1','session_id',pg_temp.id(44))::text,true);
set local role authenticated;
select pg_temp.ok(public.app_profile('{}') ? 'gravatar_checked_at','perfil devolve gravatar_checked_at');
reset role;

select count(*) as gravatar_assertions from gravatar_checks;
rollback;
