\set ON_ERROR_STOP on
begin;

create temporary table export_checks (name text primary key);
create temporary table export_v029 (data jsonb not null);
grant insert on export_checks to authenticated,anon;
grant select on export_v029 to authenticated;

create function pg_temp.ok(p_value boolean,p_name text) returns void language plpgsql as $$
begin
 if p_value is distinct from true then raise exception 'FAIL: %',p_name; end if;
 insert into export_checks values (p_name);
end $$;

create function pg_temp.denied(p_statement text,p_code text,p_message text,p_name text)
returns void language plpgsql as $$
begin
 begin execute p_statement;
 exception when others then
  if sqlstate <> p_code or (p_message is not null and sqlerrm <> p_message) then raise; end if;
  perform pg_temp.ok(true,p_name);
  return;
 end;
 raise exception 'FAIL (autorizou): %',p_name;
end $$;

create function pg_temp.id(n integer) returns uuid language sql immutable as $$
 select ('03000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;

create function pg_temp.login(n integer,p_session integer default null) returns void language sql as $$
 select set_config('request.jwt.claims',jsonb_build_object(
  'sub',pg_temp.id(n),'role','authenticated','aal','aal2','session_id',pg_temp.id(coalesce(p_session,10+n))
 )::text,true)
$$;

insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
select pg_temp.id(n),'podcast-export-'||n||'@example.test',now(),'{"icarus_server_created":true}',
 jsonb_build_object('full_name','Ator de teste '||n) from generate_series(1,3) n;
set constraints all immediate;
insert into auth.sessions(id,user_id,created_at,updated_at,aal)
select pg_temp.id(10+n),pg_temp.id(n),now(),now(),'aal2' from generate_series(1,3) n;
update public.profiles set role='admin' where id=pg_temp.id(3);

insert into public.podcast_episodes(id,youtube_id,kind,title,description,published_at,status)
select pg_temp.id(20+n),'qa_export_'||n,'podcast','Episódio sintético '||n,'Descrição sintética',now(),'published'
from generate_series(1,3) n;
insert into public.courses(id,slug,title,description,status,access_mode)
values (pg_temp.id(30),'qa-podcast-export','Curso sintético','','draft','members');
insert into app_private.catalog_launches(id,course_id,title,summary,enabled)
values (pg_temp.id(31),pg_temp.id(30),'Anúncio sintético','Resumo sintético',true);
insert into app_private.catalog_launch_signups(launch_id,user_id,subscribed_at)
values (pg_temp.id(31),pg_temp.id(1),'2026-11-24T12:00:00Z');

insert into public.plans(id,name,slug,price_cents,access_months,active)
values (pg_temp.id(32),'Plano sintético','qa-podcast-export',1,1,true);
insert into public.subscriptions(id,user_id,plan_id,ends_at,source)
values (pg_temp.id(33),pg_temp.id(1),pg_temp.id(32),now()+interval '1 month','courtesy');

select pg_temp.ok((select prosecdef and proconfig=array['search_path=""']
 from pg_proc where oid='public.app_export_data()'::regprocedure), 'RPC com SECURITY DEFINER e search_path vazio');
select pg_temp.ok(
 has_function_privilege('authenticated','public.app_export_data()','EXECUTE')
 and not has_function_privilege('anon','public.app_export_data()','EXECUTE')
 and not has_function_privilege('service_role','public.app_export_data()','EXECUTE'), 'ACL pública só para authenticated');
select pg_temp.ok(not exists (
 select from unnest(array['anon','authenticated','service_role']) r(role_name)
 where has_function_privilege(r.role_name,'app_private.export_data_v029()','EXECUTE')
  or has_table_privilege(r.role_name,'public.podcast_watches','SELECT, INSERT, UPDATE, DELETE')
), 'função privada e tabela de marcações continuam fechadas');

set local role anon;
select pg_temp.denied('select public.app_export_data()','42501',null,'anon não chama o export');
reset role;
set local role authenticated;
select pg_temp.denied('select public.app_export_data()','P0001','Sessão inválida. Entre novamente.','JWT ausente não exporta');
select pg_temp.login(1,12);
select pg_temp.denied('select public.app_export_data()','P0001',
 'Sessão inválida ou segundo fator pendente.','sub com sessão de outro titular não exporta');
select pg_temp.login(1);
select public.app_podcast_watch(pg_temp.id(22),true);
select public.app_podcast_watch(pg_temp.id(21),true);
select pg_temp.login(2);
select public.app_podcast_watch(pg_temp.id(23),true);
select pg_temp.login(3);
select public.app_admin_save_podcast(pg_temp.id(21),'qa_export_1','podcast','Episódio voltou a rascunho',
 'Descrição restrita','2026-11-24T12:00:00Z','draft',false,'[]',null);
select pg_temp.ok(public.app_export_data()->'podcast_watches'='[]'::jsonb,'admin sem marcação recebe lista vazia');
reset role;

update public.subscriptions set revoked_at=now() where id=pg_temp.id(33);
select pg_temp.login(1);
insert into export_v029 select app_private.export_data_v029();
set local role authenticated;
select pg_temp.denied('select public.app_podcast(pg_temp.id(21))','P0001','Episódio indisponível.',
 'detalhe do episódio voltou a ser restrito');
with exported as materialized (select public.app_export_data() data)
select pg_temp.ok(data->'podcast_watches'=jsonb_build_array(
 jsonb_build_object('episode_id',pg_temp.id(21)),jsonb_build_object('episode_id',pg_temp.id(22))
), 'export titular só projeta IDs próprios em ordem e conserva o rascunho'),
pg_temp.ok(data->'subscriptions'->0->>'revoked_at' is not null
 and jsonb_array_length(data->'podcast_watches')=2, 'revogar assinatura conserva as marcações próprias'),
pg_temp.ok(data-array['podcast_watches','feedbacks','ranking_events']=(select data from export_v029)
 and data->'catalog_launch_signups'=jsonb_build_array(jsonb_build_object(
  'launch_key',pg_temp.id(31),'subscribed_at','2026-11-24T12:00:00Z'::timestamptz
 )), 'payload 029 preservado com inscrição própria') from exported;
select pg_temp.denied('select public.app_export_data()','P0001','Muitas solicitações. Aguarde um minuto.',
 'limite de exportações da 029 continua ativo');

select pg_temp.login(2);
select pg_temp.ok(public.app_export_data()->'podcast_watches'=jsonb_build_array(jsonb_build_object('episode_id',pg_temp.id(23))),
 'outro titular recebe apenas a própria marcação');
select public.app_podcast_watch(pg_temp.id(23),false);
select pg_temp.ok(public.app_export_data()->'podcast_watches'='[]'::jsonb,'desmarcar remove o item do export');
reset role;

update public.app_sessions set revoked_at=now() where id=pg_temp.id(11);
set local role authenticated;
select pg_temp.login(1);
select pg_temp.denied('select public.app_export_data()','P0001',
 'Sessão expirada. Entre novamente.','JWT da sessão revogada não exporta');
reset role;

select count(*) from export_checks;
rollback;
