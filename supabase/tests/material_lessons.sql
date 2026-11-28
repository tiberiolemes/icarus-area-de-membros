\set ON_ERROR_STOP on
begin;

create temporary table material_lesson_checks(name text primary key);
grant insert on material_lesson_checks to authenticated,service_role;
create function pg_temp.ok(condition boolean, label text) returns void language plpgsql as $$
begin
 if condition is distinct from true then raise exception 'FAIL: %', label; end if;
 insert into material_lesson_checks values(label);
end $$;
create function pg_temp.denied(statement text, label text) returns void language plpgsql as $$
declare denied boolean:=false;
begin
 begin execute statement;
 exception when insufficient_privilege or sqlstate 'P0001' or check_violation then denied:=true;
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
 select ('a7e1a000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;
create function pg_temp.login(n integer) returns void language sql as $$
 select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.id(n),'role','authenticated',
  'aal','aal1','session_id',pg_temp.id(40+n))::text,true)
$$;
create function pg_temp.links(material integer) returns uuid[] language sql as $$
 select array(select lesson_id from public.material_lessons where material_id=pg_temp.id(material) order by lesson_id)
$$;

-- 1 admin, 2 membro sem plano.
insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
select pg_temp.id(n),'material-lessons-'||n||'@example.test',now(),'{"icarus_server_created":true}',
 jsonb_build_object('full_name','Pessoa fictícia '||n) from generate_series(1,2)n;
set constraints all immediate;
update public.profiles set role='admin' where id=pg_temp.id(1);
insert into auth.sessions(id,user_id,created_at,updated_at,aal)
select pg_temp.id(40+n),pg_temp.id(n),now(),now(),'aal1' from generate_series(1,2)n;

-- Aula A liberada para o membro; aula B restrita a um plano que ele não tem.
insert into public.plans(id,name,slug,price_cents,access_months,active) values(pg_temp.id(10),'Plano restrito','plano-restrito-materiais',10000,12,true);
insert into public.courses(id,slug,title,status,access_mode) values(pg_temp.id(100),'curso-materiais','Curso com materiais','published','members');
insert into public.modules(id,course_id,slug,title,status,access_mode,plan_ids,order_index) values
 (pg_temp.id(101),pg_temp.id(100),'livre','Módulo livre','published','inherit','{}',0),
 (pg_temp.id(102),pg_temp.id(100),'restrito','Módulo restrito','published','plans',array[pg_temp.id(10)],1);
insert into public.sections(id,module_id,title,status) values
 (pg_temp.id(103),pg_temp.id(101),'Seção livre','published'),(pg_temp.id(104),pg_temp.id(102),'Seção restrita','published');
insert into public.lessons(id,section_id,slug,title,status) values
 (pg_temp.id(105),pg_temp.id(103),'aula-a','Aula A','published'),(pg_temp.id(106),pg_temp.id(104),'aula-b','Aula B','published');
-- M em A e B, N só em B, O na biblioteca sem aula.
insert into public.materials(id,name,status,access_mode) values
 (pg_temp.id(200),'Material M','published','members'),(pg_temp.id(201),'Material N','published','members'),
 (pg_temp.id(202),'Material O','published','members');
insert into public.material_lessons(material_id,lesson_id) values
 (pg_temp.id(200),pg_temp.id(105)),(pg_temp.id(200),pg_temp.id(106)),(pg_temp.id(201),pg_temp.id(106));

select pg_temp.ok(not has_table_privilege(r,'public.material_lessons','SELECT,INSERT,UPDATE,DELETE'),'vínculos fechados para '||r)
 from unnest(array['anon','authenticated','service_role']) r;
select pg_temp.ok((select relrowsecurity from pg_class where oid='public.material_lessons'::regclass),'RLS ligado nos vínculos');
select pg_temp.ok(has_function_privilege('authenticated','public.app_admin_unlink_material(uuid,uuid)','execute')
 and not has_function_privilege('anon','public.app_admin_unlink_material(uuid,uuid)','execute')
 and not has_function_privilege('service_role','public.app_admin_unlink_material(uuid,uuid)','execute'),
 'só a sessão logada chama o desvínculo');
select pg_temp.ok(not exists(select 1 from information_schema.columns where table_schema='public' and table_name='materials' and column_name='lesson_id'),
 'materials.lesson_id saiu');

select pg_temp.ok(app_private.material_access(pg_temp.id(2),pg_temp.id(200)),'material em duas aulas abre para quem acessa uma delas');
select pg_temp.ok(not app_private.material_access(pg_temp.id(2),pg_temp.id(201)),'material só em aula restrita continua fechado');
select pg_temp.ok(app_private.material_access(pg_temp.id(2),pg_temp.id(202)),'material sem aula segue a regra da biblioteca');

set local role authenticated;
select pg_temp.login(2);
select public.app_touch_session(false);
select pg_temp.ok((select jsonb_agg(x->>'id') from jsonb_array_elements(public.app_lesson(pg_temp.id(105))->'materials') x)
 =jsonb_build_array(pg_temp.id(200)),'aula A lista M');
select pg_temp.ok((select x->'lesson_ids'=jsonb_build_array(pg_temp.id(105),pg_temp.id(106)) and not x?'lesson_id'
 from jsonb_array_elements(public.app_lesson(pg_temp.id(105))->'materials') x),'material da aula traz lesson_ids ordenado e sem lesson_id');
select pg_temp.denied(format('select public.app_admin_unlink_material(%L,%L)',pg_temp.id(200),pg_temp.id(105)),'membro não desvincula material');
select pg_temp.login(1);
select public.app_touch_session(false);
select pg_temp.ok((select jsonb_agg(x->>'id') from jsonb_array_elements(public.app_lesson(pg_temp.id(106))->'materials') x)
 =jsonb_build_array(pg_temp.id(200),pg_temp.id(201)),'aula B lista M e N para o admin');
select pg_temp.ok((select x->'lesson_ids'=jsonb_build_array(pg_temp.id(105),pg_temp.id(106)) and not x?'lesson_id'
 from jsonb_array_elements(public.app_admin_list('materials','Material M',1)->'items') x),'lista do admin traz lesson_ids sem lesson_id');
select pg_temp.ok((select x->'lesson_ids'='[]'::jsonb from jsonb_array_elements(public.app_admin_list('materials','Material O',1)->'items') x),
 'material sem aula sai com lesson_ids vazio');

select pg_temp.ok(public.app_admin_unlink_material(pg_temp.id(200),pg_temp.id(106))=jsonb_build_object('id',pg_temp.id(200),'status','published'),
 'desvincular com outra aula restante mantém publicado');
select pg_temp.ok(public.app_admin_unlink_material(pg_temp.id(201),pg_temp.id(106))=jsonb_build_object('id',pg_temp.id(201),'status','draft'),
 'desvincular a última aula volta para rascunho');
select pg_temp.fails(format('select public.app_admin_unlink_material(%L,%L)',pg_temp.id(202),pg_temp.id(105)),'Registro indisponível.',
 'desvincular aula que não está vinculada é recusado');
reset role;
select pg_temp.ok(pg_temp.links(200)=array[pg_temp.id(105)] and pg_temp.links(201)='{}','desvínculo apaga só o par pedido');
select pg_temp.ok((select status from public.materials where id=pg_temp.id(201))='draft'
 and (select status from public.materials where id=pg_temp.id(202))='published','só o material que ficou sem aula vira rascunho');
select pg_temp.ok((select count(*)=2 from public.audit_events where actor_id=pg_temp.id(1) and action='unlink' and target_type='materials'),
 'cada desvínculo entra na auditoria');

set local role authenticated;
select pg_temp.login(1);
select public.app_admin_save('materials',pg_temp.id(200),jsonb_build_object('lesson_ids',jsonb_build_array(pg_temp.id(106))));
reset role;
select pg_temp.ok(pg_temp.links(200)=array[pg_temp.id(106)],'lesson_ids substitui o conjunto inteiro');

set local role authenticated;
select pg_temp.login(1);
select public.app_admin_save('materials',pg_temp.id(200),jsonb_build_object('name','Material M revisto','lesson_id',pg_temp.id(105)));
select pg_temp.fails(format('select public.app_admin_save(%L,%L,%L)','materials',pg_temp.id(200),jsonb_build_object('lesson_ids',jsonb_build_array(pg_temp.id(105),pg_temp.id(999)))),
 'Aula indisponível.','aula inexistente é recusada');
select pg_temp.fails(format('select public.app_admin_save(%L,%L,%L)','materials',pg_temp.id(200),
 jsonb_build_object('lesson_ids',(select jsonb_agg(gen_random_uuid()) from generate_series(1,201)))),
 'Vincule no máximo 200 aulas.','mais de 200 aulas é recusado');
create temporary table created as select (public.app_admin_save('materials',null,jsonb_build_object('name','Material novo','lesson_ids',jsonb_build_array(pg_temp.id(105),pg_temp.id(105))))->>'id')::uuid id;
reset role;
select pg_temp.ok(pg_temp.links(200)=array[pg_temp.id(106)] and (select name from public.materials where id=pg_temp.id(200))='Material M revisto',
 'sem lesson_ids o vínculo fica e lesson_id é ignorado');
select pg_temp.ok(array(select lesson_id from public.material_lessons where material_id=(select id from created))=array[pg_temp.id(105)],
 'material novo nasce com as aulas pedidas, sem repetir');

delete from public.lessons where id=pg_temp.id(106);
select pg_temp.ok(not exists(select 1 from public.material_lessons where lesson_id=pg_temp.id(106)),'apagar a aula apaga os vínculos dela');

select count(*) as material_lessons_assertions from material_lesson_checks;
rollback;
