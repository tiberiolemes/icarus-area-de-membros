\set ON_ERROR_STOP on
begin;

create temporary table showcase_checks(label text primary key);
grant insert,select on showcase_checks to authenticated;
create function pg_temp.check_showcase(ok boolean, label text) returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'Vitrine: %',label; end if;
  insert into showcase_checks values(label);
end $$;
create function pg_temp.sid(n integer) returns uuid language sql immutable as $$
  select ('ca570000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;
create function pg_temp.login(n integer) returns void language sql as $$
  select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.sid(n),'role','authenticated',
    'aal','aal1','session_id',pg_temp.sid(n+10))::text,true)
$$;

insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
select pg_temp.sid(n),'vitrine-'||n||'@example.test',now(),'{"icarus_server_created":true}',
  jsonb_build_object('full_name','Aluno '||n) from generate_series(1,2) n;
set constraints all immediate;
insert into auth.sessions(id,user_id,created_at,updated_at,aal)
select pg_temp.sid(10+n),pg_temp.sid(n),now(),now(),'aal1' from generate_series(1,2) n;
insert into public.courses(id,slug,title,status,access_mode,created_at)
select pg_temp.sid(i),'vitrine-'||i,'QA vitrine '||i,
 case when i=128 then 'draft' else 'published' end,case when i=125 then 'subscribers' else 'members' end,now()+i*interval '1 minute'
from generate_series(100,128) i;
insert into public.modules(id,course_id,slug,title,status)
select pg_temp.sid(i+100),pg_temp.sid(i),'modulo','Módulo','published' from generate_series(100,128) i;
insert into public.sections(id,module_id,title,status)
select pg_temp.sid(i+200),pg_temp.sid(i+100),'Seção','published' from generate_series(100,128) i;
insert into public.lessons(id,section_id,slug,title,duration_seconds,status,order_index)
select pg_temp.sid(i+300),pg_temp.sid(i+200),'aula','Aula '||i,i,'published',1 from generate_series(100,128) i;
insert into public.lessons(id,section_id,slug,title,status,order_index)
values (pg_temp.sid(500),pg_temp.sid(300),'retomada','Retomada','published',2),
 (pg_temp.sid(501),pg_temp.sid(300),'rascunho','Rascunho','draft',0);
insert into public.lesson_progress(user_id,lesson_id,position_seconds,completed_at,updated_at) values
 (pg_temp.sid(1),pg_temp.sid(500),14,null,now()),
 (pg_temp.sid(1),pg_temp.sid(401),40,now(),now()-interval '1 minute'),
 (pg_temp.sid(1),pg_temp.sid(402),9,null,now()-interval '1 day'),
 (pg_temp.sid(1),pg_temp.sid(425),2,null,now()+interval '1 day'),
 (pg_temp.sid(2),pg_temp.sid(403),7,null,now());

select pg_temp.check_showcase(has_function_privilege('authenticated','public.app_catalog_showcase(text,integer,text,text)','EXECUTE')
 and not has_function_privilege('anon','public.app_catalog_showcase(text,integer,text,text)','EXECUTE')
 and not has_function_privilege('service_role','public.app_catalog_showcase(text,integer,text,text)','EXECUTE'),'ACL por papel');
set local role authenticated;
select pg_temp.login(1);
select pg_temp.check_showcase((public.app_bootstrap()->'profile'->>'id')::uuid=pg_temp.sid(1),'sessão própria');
select pg_temp.check_showcase(d->'counts'='{"all":28,"ongoing":2,"completed":1,"restricted":1}' and d->>'total'='28'
 and jsonb_array_length(d->'items')=20
 and not ((d#>'{items,0}') ? 'cover_url') and d#>>'{items,0,has_cover}'='false'
 and d#>>'{items,0,slug}'='vitrine-127' and d#>>'{resume,slug}'='vitrine-100'
 and d#>>'{resume,target,id}'=pg_temp.sid(500)::text and d#>>'{resume,target,position_seconds}'='14',
 'contagens antes da paginação, mais recente por padrão e retomada global após a página 1')
from public.app_catalog_showcase('QA vitrine') d;
select pg_temp.check_showcase(jsonb_array_length(d->'items')=8 and d#>>'{items,7,slug}'='vitrine-100','segunda página')
from public.app_catalog_showcase('QA vitrine',2) d;
select pg_temp.check_showcase(d->>'total'='1' and d#>>'{items,0,slug}'='vitrine-125' and d#>'{items,0,target}'='null'::jsonb,
 'curso restrito visível sem destino nem posição') from public.app_catalog_showcase('QA vitrine',1,'restricted') d;
select pg_temp.check_showcase(d->>'total'='2' and d#>>'{items,0,slug}'='vitrine-100', 'andamento pela posição salva, ordem alfabética')
from public.app_catalog_showcase('QA vitrine',1,'ongoing','title') d;
select pg_temp.check_showcase(d#>>'{items,0,slug}'='vitrine-101' and d#>>'{items,0,state}'='completed'
 and d#>>'{items,0,target,id}'=pg_temp.sid(401)::text, 'revisão da primeira aula e maior progresso')
from public.app_catalog_showcase('QA vitrine',1,'all','progress') d;
select pg_temp.check_showcase(d#>>'{items,0,target,id}'=pg_temp.sid(403)::text and d#>>'{items,0,target,position_seconds}'='0',
 'primeira aula na conta sem progresso próprio') from public.app_catalog_showcase('QA vitrine 103') d;
select pg_temp.login(2);
select pg_temp.check_showcase((public.app_bootstrap()->'profile'->>'id')::uuid=pg_temp.sid(2),'segunda sessão própria');
select pg_temp.check_showcase(d#>>'{resume,slug}'='vitrine-103' and d#>>'{items,0,target,id}'=pg_temp.sid(400)::text
 and d#>>'{items,0,total_lessons}'='2', 'aula publicada por ordem e isolamento do progresso entre alunos')
from public.app_catalog_showcase('QA vitrine 100') d;
select count(*) from showcase_checks;
rollback;
