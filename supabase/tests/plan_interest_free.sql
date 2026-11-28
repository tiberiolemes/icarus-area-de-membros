\set ON_ERROR_STOP on
begin;

create temporary table interest_free_checks(name text primary key);
grant insert on interest_free_checks to authenticated,service_role;
create function pg_temp.ok(condition boolean, label text) returns void language plpgsql as $$
begin
 if condition is distinct from true then raise exception 'FAIL: %', label; end if;
 insert into interest_free_checks values(label);
end $$;
create function pg_temp.denied(statement text, label text) returns void language plpgsql as $$
declare denied boolean:=false;
begin
 begin execute statement;
 exception when insufficient_privilege or sqlstate 'P0001' or invalid_text_representation then denied:=true;
 end;
 perform pg_temp.ok(denied,label);
end $$;
create function pg_temp.id(n integer) returns uuid language sql immutable as $$
 select ('b1a40000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;
create function pg_temp.login(n integer) returns void language sql as $$
 select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.id(n),'role','authenticated',
  'aal','aal1','session_id',pg_temp.id(40+n))::text,true)
$$;

-- 1 admin, 2 membro.
insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
select pg_temp.id(n),'plan-interest-'||n||'@example.test',now(),'{"icarus_server_created":true}',
 jsonb_build_object('full_name','Pessoa fictícia '||n) from generate_series(1,2)n;
set constraints all immediate;
update public.profiles set role='admin' where id=pg_temp.id(1);
insert into auth.sessions(id,user_id,created_at,updated_at,aal)
select pg_temp.id(40+n),pg_temp.id(n),now(),now(),'aal1' from generate_series(1,2)n;

insert into public.plans(id,name,slug,price_cents,access_months,active) values(pg_temp.id(10),'Plano direto','plano-direto-juros',58800,12,true);
select pg_temp.ok((select interest_free=false from public.plans where id=pg_temp.id(10)),'plano novo nasce sem a marcação de sem juros');

select pg_temp.login(1);
set local role authenticated;
select pg_temp.ok((public.app_admin_save('plans',null,'{"name":"Plano novo","slug":"plano-novo-juros","price_cents":10000,"access_months":12,"benefits":[],"active":true}')->>'id') is not null,'admin cria plano sem informar a marcação');
select pg_temp.ok(public.app_admin_save('plans',pg_temp.id(10),'{"interest_free":true}') is not null,'admin marca parcelamento sem juros');
select pg_temp.denied(format('select public.app_admin_save(%L,%L,%L)','plans',pg_temp.id(10),'{"interest_free":"sim"}'),'texto no lugar de booleano é recusado');
reset role;
select pg_temp.ok((select interest_free from public.plans where id=pg_temp.id(10)),'marcação gravada no plano');
select pg_temp.ok((select interest_free=false from public.plans where slug='plano-novo-juros'),'plano criado pelo painel nasce sem juros desligado');

select pg_temp.login(2);
set local role authenticated;
select pg_temp.denied(format('select public.app_admin_save(%L,%L,%L)','plans',pg_temp.id(10),'{"interest_free":false}'),'membro não grava a marcação');
select pg_temp.ok((select bool_or(p->>'id'=pg_temp.id(10)::text and (p->'interest_free')='true'::jsonb) from jsonb_array_elements(public.app_bootstrap()->'plans') p),'bootstrap devolve a marcação do plano');
reset role;
select pg_temp.ok((select interest_free from public.plans where id=pg_temp.id(10)),'tentativa do membro não muda a marcação');

select count(*) as plan_interest_free_assertions from interest_free_checks;
rollback;
