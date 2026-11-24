\set ON_ERROR_STOP on
begin;
-- Synthetic claims/metadata only: no native login, stored bytes or magic-byte proof.
create temporary table post_edit_image_results(name text primary key);
grant all on post_edit_image_results to anon,authenticated,service_role;
create function pg_temp.assert(ok boolean,name text) returns void language plpgsql as $$ begin
 if ok is distinct from true then raise exception 'FAIL: %',name;end if;
 insert into post_edit_image_results values(name);
end $$;
create function pg_temp.denied(statement text,name text,expected text) returns void language plpgsql as $$ declare rejected boolean:=false;begin
 begin execute statement;
 exception when insufficient_privilege then rejected:=expected='permission';
 when sqlstate 'P0001' then rejected:=sqlerrm=expected;
 end;
 perform pg_temp.assert(rejected,name);
end $$;
create function pg_temp.id(n integer) returns uuid language sql immutable as $$ select ('ed220000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
create function pg_temp.sid(n integer) returns uuid language sql immutable as $$ select ('ed230000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
create function pg_temp.login(n integer,aal text default 'aal2') returns void language plpgsql as $$ begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.id(n),'role','authenticated','aal',aal,'session_id',pg_temp.sid(n))::text,true);
end $$;
insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
 select pg_temp.id(n),'post-image-'||n||'@example.test',now(),'{"icarus_server_created":true}',jsonb_build_object('full_name','DEMONSTRAÇÃO imagem '||n) from generate_series(1,2)n;
set constraints all immediate;
insert into auth.sessions(id,user_id,created_at,updated_at,aal) select pg_temp.sid(n),pg_temp.id(n),now(),now(),'aal2' from generate_series(1,2)n;
insert into public.ica_app_sessions(id,user_id,expires_at) select pg_temp.sid(n),pg_temp.id(n),now()+interval '1 hour' from generate_series(1,2)n;
insert into public.ica_spaces(id,name,status,access_mode) values(pg_temp.id(10),'DEMONSTRAÇÃO imagem','published','members'),(pg_temp.id(11),'DEMONSTRAÇÃO restrito','draft','members');
insert into public.ica_posts(id,space_id,author_id,title,body,status)
 select pg_temp.id(20+n::integer),pg_temp.id(10),pg_temp.id(1),'DEMONSTRAÇÃO '||state,'Texto original '||state,state
 from unnest(array['approved','archived','removed','approved']) with ordinality s(state,n);
insert into public.ica_posts(id,space_id,author_id,title,body,status) values(pg_temp.id(25),pg_temp.id(10),pg_temp.id(2),'DEMONSTRAÇÃO outro autor','Texto alheio','approved');
insert into public.ica_uploads(id,actor_id,kind,resource_id,post_id,path,file_name,content_type,size_bytes,state)
 select pg_temp.id(n),pg_temp.id(case when n=43 then 2 else 1 end),'post-image',pg_temp.id(case n when 42 then 24 when 43 then 25 else 21 end),pg_temp.id(case n when 42 then 24 when 43 then 25 else 21 end),
 'post-image/'||pg_temp.id(case n when 42 then 24 when 43 then 25 else 21 end)||'/'||pg_temp.id(n)||'.png','DEMONSTRACAO.png','image/png',100,'ready' from generate_series(40,43)n;
update public.ica_posts set image_path=(select path from public.ica_uploads where id=pg_temp.id(40)) where id=pg_temp.id(21);
insert into public.ica_replies(id,post_id,author_id,body,status) values(pg_temp.id(30),pg_temp.id(21),pg_temp.id(2),'Resposta preservada','approved');
insert into public.ica_votes(actor_id,post_id) values(pg_temp.id(2),pg_temp.id(21));
insert into public.ica_votes(actor_id,reply_id) values(pg_temp.id(1),pg_temp.id(30));
insert into public.ica_moderation_events(id,actor_id,target_type,target_id,decision,reason) values(pg_temp.id(50),pg_temp.id(2),'post',pg_temp.id(21),'approve','Histórico sintético preservado');
create temporary table post_image_original as select to_jsonb(p)-array['title','body','status','updated_at'] as data from public.ica_posts p where id=pg_temp.id(21);
create temporary table post_image_links as
 select 'uploads' as kind,to_jsonb(x) as data from public.ica_uploads x where actor_id in (pg_temp.id(1),pg_temp.id(2))
 union all select 'replies',to_jsonb(x) from public.ica_replies x where post_id=pg_temp.id(21)
 union all select 'votes',to_jsonb(x) from public.ica_votes x where post_id=pg_temp.id(21) or reply_id=pg_temp.id(30)
 union all select 'moderation',to_jsonb(x) from public.ica_moderation_events x where target_id=pg_temp.id(21);

select pg_temp.assert(not has_function_privilege('anon','public.app_save_post(uuid,uuid,text,text,text)','EXECUTE'),'anon grant closed');
select pg_temp.assert(not has_function_privilege('service_role','public.app_save_post(uuid,uuid,text,text,text)','EXECUTE'),'service grant unchanged closed');
select pg_temp.assert(has_function_privilege('authenticated','public.app_save_post(uuid,uuid,text,text,text)','EXECUTE'),'authenticated grant allowed');
select pg_temp.assert(not has_table_privilege('authenticated','public.ica_posts','UPDATE'),'direct post update closed');
select pg_temp.assert(not has_function_privilege('authenticated','public.app_upload_finalize(uuid,uuid)','EXECUTE') and not has_function_privilege('anon','public.app_upload_finalize(uuid,uuid)','EXECUTE'),'finalize grants unchanged closed');
select pg_temp.assert((select prosecdef and proconfig=array['search_path=""'] from pg_proc where oid='public.app_save_post(uuid,uuid,text,text,text)'::regprocedure),'definer and empty search path retained');
select pg_temp.login(1);
set local role anon;
select pg_temp.denied($q$select public.app_save_post(pg_temp.id(21),pg_temp.id(10),'Alterado','Alterado',null)$q$,'anon denied with valid synthetic claims','permission');
reset role;
set local role service_role;
select pg_temp.denied($q$select public.app_save_post(pg_temp.id(21),pg_temp.id(10),'Alterado','Alterado',null)$q$,'service role denied','permission');
reset role;
select pg_temp.login(2);
set local role authenticated;
select pg_temp.denied($q$select public.app_save_post(pg_temp.id(21),pg_temp.id(10),'Alterado','Alterado',null)$q$,'other actor denied','Publicação indisponível.');
reset role;
select pg_temp.login(1);
set local role authenticated;
select pg_temp.assert(public.app_save_post(pg_temp.id(21),pg_temp.id(10),'Título editado','Texto editado',null)=jsonb_build_object('id',pg_temp.id(21),'status','pending'),'null edit keeps ID and requeues');
select pg_temp.assert(public.app_post(pg_temp.id(21))->'post'->>'image_id'=pg_temp.id(40)::text,'null edit preserves image_id');
select pg_temp.assert(not (public.app_post(pg_temp.id(21))->'post') ?| array['image_path','storage_path'],'DTO exposes no storage path');
reset role;
select pg_temp.assert((select to_jsonb(p)-array['title','body','status','updated_at']=(select data from post_image_original) and title='Título editado' and body='Texto editado' and status='pending' from public.ica_posts p where id=pg_temp.id(21)),'text edit preserves current path identity and creation');
select pg_temp.assert((select count(*)=1 from public.ica_audit_events where target_id=pg_temp.id(21) and actor_id=pg_temp.id(1) and action='resubmit' and target_type='posts'),'resubmit audit recorded once');
-- Omitted optional argument has the same contract, including a rejected post.
update public.ica_posts set status='rejected' where id=pg_temp.id(21);
set local role authenticated;
select pg_temp.assert(public.app_save_post(pg_temp.id(21),pg_temp.id(10),'Título sem argumento','Texto sem argumento')->>'status'='pending','omission requeues rejected post');
select pg_temp.assert(public.app_post(pg_temp.id(21))->'post'->>'image_id'=pg_temp.id(40)::text,'omission preserves image_id');
select pg_temp.assert(public.app_save_post(null,pg_temp.id(10),'Novo com null','Criação sem imagem',null)->>'status'='pending','create explicit null allowed');
select pg_temp.assert(public.app_save_post(null,pg_temp.id(10),'Novo sem argumento','Criação sem imagem')->>'status'='pending','create omitted argument allowed');
reset role;
select pg_temp.assert((select count(*)=2 and bool_and(image_path is null and status='pending') from public.ica_posts where author_id=pg_temp.id(1) and title in ('Novo com null','Novo sem argumento')),'new posts remain without image');
select pg_temp.assert((select image_path=(select path from public.ica_uploads where id=pg_temp.id(40)) from public.ica_posts where id=pg_temp.id(21)),'omission preserves path');
set local role authenticated;
select pg_temp.denied($q$select public.app_save_post(pg_temp.id(21),pg_temp.id(10),'Alterado','Alterado',(select 'post-image/'||pg_temp.id(24)||'/'||pg_temp.id(42)||'.png'))$q$,'same author other post image denied','Imagem não autorizada.');
select pg_temp.denied($q$select public.app_save_post(pg_temp.id(21),pg_temp.id(10),'Alterado','Alterado',(select 'post-image/'||pg_temp.id(25)||'/'||pg_temp.id(43)||'.png'))$q$,'other author image denied','Imagem não autorizada.');
select pg_temp.denied($q$select public.app_save_post(pg_temp.id(21),pg_temp.id(10),'Alterado','Alterado','')$q$,'empty path denied','Imagem não autorizada.');
select pg_temp.denied($q$select public.app_save_post(pg_temp.id(22),pg_temp.id(10),'Alterado','Alterado',null)$q$,'archived edit denied','Publicação indisponível.');
select pg_temp.denied($q$select public.app_save_post(pg_temp.id(23),pg_temp.id(10),'Alterado','Alterado',null)$q$,'removed edit denied','Publicação indisponível.');
select pg_temp.denied($q$select public.app_save_post(pg_temp.id(21),pg_temp.id(11),'Alterado','Alterado',null)$q$,'unavailable space denied','Espaço indisponível.');
select pg_temp.denied($q$select public.app_moderate('post',pg_temp.id(21),'approve','Tentativa sintética')$q$,'member cannot approve','Operação não permitida.');
reset role;

update public.ica_app_sessions set revoked_at=now() where id=pg_temp.sid(1);
set local role authenticated;
select pg_temp.denied($q$select public.app_save_post(pg_temp.id(21),pg_temp.id(10),'Alterado','Alterado',null)$q$,'revoked session denied','Sessão expirada. Entre novamente.');
reset role;
update public.ica_app_sessions set revoked_at=null,expires_at=now()-interval '1 second' where id=pg_temp.sid(1);
set local role authenticated;
select pg_temp.denied($q$select public.app_save_post(pg_temp.id(21),pg_temp.id(10),'Alterado','Alterado',null)$q$,'expired session denied','Sessão expirada. Entre novamente.');
reset role;
update public.ica_app_sessions set expires_at=now()+interval '1 hour' where id=pg_temp.sid(1);
update public.ica_profiles set suspended=true where id=pg_temp.id(1);
set local role authenticated;
select pg_temp.denied($q$select public.app_save_post(pg_temp.id(21),pg_temp.id(10),'Alterado','Alterado',null)$q$,'suspended actor denied','Acesso indisponível.');
reset role;
update public.ica_profiles set suspended=false,password_setup_required=true where id=pg_temp.id(1);
set local role authenticated;
select pg_temp.denied($q$select public.app_save_post(pg_temp.id(21),pg_temp.id(10),'Alterado','Alterado',null)$q$,'password setup gate retained','Defina sua senha para acessar o conteúdo.');
reset role;
update public.ica_profiles set password_setup_required=false where id=pg_temp.id(1);
insert into auth.mfa_factors(id,user_id,friendly_name,factor_type,status,created_at,updated_at) values(pg_temp.id(60),pg_temp.id(1),'DEMONSTRAÇÃO','totp','verified',now(),now());
select pg_temp.login(1,'aal1');
set local role authenticated;
select pg_temp.denied($q$select public.app_save_post(pg_temp.id(21),pg_temp.id(10),'Alterado','Alterado',null)$q$,'verified MFA claim aal1 denied','Confirme o segundo fator para continuar.');
reset role;
select pg_temp.login(1);
update auth.sessions set aal='aal1' where id=pg_temp.sid(1);
set local role authenticated;
select pg_temp.denied($q$select public.app_save_post(pg_temp.id(21),pg_temp.id(10),'Alterado','Alterado',null)$q$,'verified MFA native aal1 denied','Sessão inválida ou segundo fator pendente.');
reset role;
update auth.sessions set aal='aal2' where id=pg_temp.sid(1);

-- Audit and edit remain one atomic operation even after the image expression changes.
create function pg_temp.reject_edit_audit() returns trigger language plpgsql as $$ begin
 if new.target_id=pg_temp.id(21) and new.action='resubmit' then raise exception 'Synthetic audit failure';end if;return new;
end $$;
create trigger post_image_test_audit before insert on public.ica_audit_events for each row execute function pg_temp.reject_edit_audit();
set local role authenticated;
select pg_temp.denied($q$select public.app_save_post(pg_temp.id(21),pg_temp.id(10),'Não persistir','Não persistir','post-image/'||pg_temp.id(21)||'/'||pg_temp.id(41)||'.png')$q$,'audit failure denies replacement','Synthetic audit failure');
reset role;
select pg_temp.assert((select title='Título sem argumento' and image_path=(select path from public.ica_uploads where id=pg_temp.id(40)) from public.ica_posts where id=pg_temp.id(21)),'audit failure rolls back text and image');
drop trigger post_image_test_audit on public.ica_audit_events;
-- Existing non-null contract allows only the same actor/upload/post binding.
set local role authenticated;
select pg_temp.assert(public.app_save_post(pg_temp.id(21),pg_temp.id(10),'Substituição legítima','Nova imagem vinculada','post-image/'||pg_temp.id(21)||'/'||pg_temp.id(41)||'.png')->>'status'='pending','legitimate replacement requeues with MFA');
select pg_temp.assert(public.app_post(pg_temp.id(21))->'post'->>'image_id'=pg_temp.id(41)::text,'replacement image_id returned');
select pg_temp.assert(public.app_save_post(pg_temp.id(21),pg_temp.id(10),'Mesma imagem','Reenvio pendente','post-image/'||pg_temp.id(21)||'/'||pg_temp.id(41)||'.png')->>'status'='pending','same linked image accepted on pending');
reset role;
select pg_temp.assert((select count(*)=4 and bool_and(action='resubmit' and target_type='posts' and actor_id=pg_temp.id(1)) from public.ica_audit_events where target_id=pg_temp.id(21)),'successful edits audited failures add none');
select pg_temp.assert((select status='archived' from public.ica_posts where id=pg_temp.id(22)) and (select status='removed' from public.ica_posts where id=pg_temp.id(23)),'blocked states unchanged');
select pg_temp.assert((select status='pending' and image_path=(select path from public.ica_uploads where id=pg_temp.id(41)) from public.ica_posts where id=pg_temp.id(21)),'edit never self approves');
select pg_temp.assert(not exists(
 (select * from post_image_links except select 'uploads',to_jsonb(x) from public.ica_uploads x where actor_id in (pg_temp.id(1),pg_temp.id(2))
 except select 'replies',to_jsonb(x) from public.ica_replies x where post_id=pg_temp.id(21)
 except select 'votes',to_jsonb(x) from public.ica_votes x where post_id=pg_temp.id(21) or reply_id=pg_temp.id(30)
 except select 'moderation',to_jsonb(x) from public.ica_moderation_events x where target_id=pg_temp.id(21))
 ),'upload reply vote and moderation records preserved');
select count(*) as post_edit_image_assertions_passed from post_edit_image_results;
rollback;
