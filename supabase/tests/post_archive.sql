\set ON_ERROR_STOP on
begin;
create temporary table post_archive_results(name text primary key);
grant all on post_archive_results to anon,authenticated,service_role;
create function pg_temp.assert(ok boolean,name text) returns void language plpgsql as $$ begin
 if ok is distinct from true then raise exception 'FAIL: %',name;end if;
 insert into post_archive_results values(name);
end $$;
create function pg_temp.denied(statement text,name text) returns void language plpgsql as $$ declare rejected boolean:=false;begin
 begin execute statement;exception when insufficient_privilege or sqlstate 'P0001' or invalid_text_representation then rejected:=true;end;
 perform pg_temp.assert(rejected,name);
end $$;
create function pg_temp.id(n integer) returns uuid language sql immutable as $$ select ('ed200000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
create function pg_temp.sid(n integer) returns uuid language sql immutable as $$ select ('ed210000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
create function pg_temp.login(n integer) returns void language plpgsql as $$ begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.id(n),'role','authenticated','aal','aal2','session_id',pg_temp.sid(n))::text,true);
 perform set_config('request.headers',jsonb_build_object('x-icarus-session-id',pg_temp.sid(n),'x-icarus-aal','aal2')::text,true);
end $$;
insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
 select pg_temp.id(n),'archive-'||n||'@example.test',now(),'{"icarus_server_created":true}',jsonb_build_object('full_name','DEMONSTRAÇÃO arquivo '||n) from generate_series(1,3)n;
set constraints all immediate;
update public.profiles set role='admin' where id=pg_temp.id(3);
insert into auth.sessions(id,user_id,created_at,updated_at,aal) select pg_temp.sid(n),pg_temp.id(n),now(),now(),'aal2' from generate_series(1,3)n;
insert into public.app_sessions(id,user_id,expires_at) select pg_temp.sid(n),pg_temp.id(n),now()+interval '1 hour' from generate_series(1,3)n;
insert into public.spaces(id,name,status,access_mode) values(pg_temp.id(10),'DEMONSTRAÇÃO arquivo','published','members');
insert into public.posts(id,space_id,author_id,title,body,status)
 select pg_temp.id(20+n::integer),pg_temp.id(10),pg_temp.id(1),'DEMONSTRAÇÃO '||state,'Texto preservado '||state,state
 from unnest(array['pending','approved','rejected','hidden','removed','archived']) with ordinality s(state,n);
insert into public.posts(id,space_id,author_id,title,body,status) values(pg_temp.id(29),pg_temp.id(10),pg_temp.id(3),'DEMONSTRAÇÃO admin autor','Mesmo ator, outra operação','approved');
insert into public.replies(id,post_id,author_id,body,status) values(pg_temp.id(30),pg_temp.id(22),pg_temp.id(2),'Resposta preservada','approved');
insert into public.votes(actor_id,post_id) values(pg_temp.id(2),pg_temp.id(22));
insert into public.votes(actor_id,reply_id) values(pg_temp.id(1),pg_temp.id(30));
insert into public.uploads(id,actor_id,kind,resource_id,post_id,path,file_name,content_type,size_bytes,state)
 values(pg_temp.id(40),pg_temp.id(1),'post-image',pg_temp.id(22),pg_temp.id(22),'post-image/'||pg_temp.id(22)||'/'||pg_temp.id(40)||'.png','DEMONSTRACAO.png','image/png',100,'ready'),
 (pg_temp.id(41),pg_temp.id(1),'post-image',pg_temp.id(22),pg_temp.id(22),'post-image/'||pg_temp.id(22)||'/'||pg_temp.id(41)||'.png','DEMONSTRACAO.png','image/png',100,'pending');
insert into storage.objects(bucket_id,name,metadata) select 'icarus-private',path,'{"size":100,"mimetype":"image/png"}' from public.uploads where id in (pg_temp.id(40),pg_temp.id(41));
update public.posts set image_path=(select path from public.uploads where id=pg_temp.id(40)) where id=pg_temp.id(22);
create temporary table archive_original as select to_jsonb(p)-array['status','previous_status','archived_by','archive_source','updated_at'] as data from public.posts p where id=pg_temp.id(22);

select pg_temp.assert(not has_function_privilege('anon','public.app_archive_post(uuid,boolean)','EXECUTE'),'anon grant closed');
select pg_temp.assert(not has_function_privilege('service_role','public.app_archive_post(uuid,boolean)','EXECUTE'),'service grant closed');
select pg_temp.assert(has_function_privilege('authenticated','public.app_archive_post(uuid,boolean)','EXECUTE'),'authenticated grant allowed');
select pg_temp.assert(not has_function_privilege('authenticated','app_private.post_json(uuid,uuid)','EXECUTE') and not has_function_privilege('anon','app_private.visible_target(uuid,text,uuid)','EXECUTE'),'private helpers closed');
select pg_temp.assert(not has_table_privilege('authenticated','public.posts','UPDATE'),'direct post update closed');
set local role anon;
select pg_temp.denied('select public.app_archive_post(pg_temp.id(22),true)','anon direct call denied');
reset role;
select pg_temp.login(2);
set local role authenticated;
select pg_temp.denied('select public.app_archive_post(pg_temp.id(22),true)','other author archive denied');
select pg_temp.assert((public.app_post(pg_temp.id(22))->'post'->>'can_archive')='false','other author capability false');
reset role;
select pg_temp.login(1);
set local role authenticated;
select pg_temp.denied('select public.app_archive_post(null,true)','null id denied');
select pg_temp.denied('select public.app_archive_post(pg_temp.id(22),null)','null operation denied');
select pg_temp.denied($q$select public.app_archive_post('invalid',true)$q$,'malformed id denied');
select pg_temp.denied('select public.app_archive_post(pg_temp.id(999),true)','missing post denied');
select pg_temp.denied('select public.app_archive_post(pg_temp.id(24),true)','hidden archive denied');
select pg_temp.denied('select public.app_archive_post(pg_temp.id(25),true)','removed archive denied');
select pg_temp.denied('select public.app_archive_post(pg_temp.id(26),false)','legacy restore denied');
select pg_temp.assert(public.app_post(pg_temp.id(25))->'post'->>'can_edit'='false','removed cannot edit');
select pg_temp.denied('select public.app_archive_post(pg_temp.id(22),false)','unarchived without provenance restore denied');
do $$ declare n integer;expected text;result jsonb;begin
 for n in 21..23 loop
  expected:=case n when 21 then 'pending' when 22 then 'approved' else 'rejected' end;
  perform pg_temp.assert(public.app_post(pg_temp.id(n))->'post'->>'can_archive'='true','archive capability '||expected);
  result:=public.app_archive_post(pg_temp.id(n),true);
  perform pg_temp.assert(result=jsonb_build_object('id',pg_temp.id(n),'status','archived','archived',true),'archive result '||expected);
  perform pg_temp.assert(public.app_post(pg_temp.id(n))->'post'->>'can_restore'='true','restore capability '||expected);
  perform pg_temp.assert(public.app_post(pg_temp.id(n))->'post'->>'can_edit'='false','archived cannot edit '||expected);
  perform pg_temp.assert(public.app_archive_post(pg_temp.id(n),true)=result,'archive retry '||expected);
  result:=public.app_archive_post(pg_temp.id(n),false);
  perform pg_temp.assert(result->>'status'=expected and result->>'archived'='false','restored original state '||expected);
  perform pg_temp.assert(public.app_archive_post(pg_temp.id(n),false)=result,'restore retry '||expected);
 end loop;
end $$;
reset role;
select pg_temp.assert((select count(*)=6 from public.audit_events where actor_id=pg_temp.id(1) and target_type='posts' and target_id in (pg_temp.id(21),pg_temp.id(22),pg_temp.id(23))),'retries do not duplicate audits');
select pg_temp.assert((select to_jsonb(p)-array['status','previous_status','archived_by','archive_source','updated_at']=(select data from archive_original) from public.posts p where id=pg_temp.id(22)),'content id creation image preserved');
select pg_temp.assert((select count(*)=1 from public.replies where post_id=pg_temp.id(22)) and (select count(*)=2 from public.votes where post_id=pg_temp.id(22) or reply_id=pg_temp.id(30)),'reply and votes preserved');
select pg_temp.login(1);
set local role authenticated;
select pg_temp.assert(public.app_archive_post(pg_temp.id(22),true)->>'status'='archived','archive interaction fixture');
select pg_temp.assert((public.app_post(pg_temp.id(22))->'post') ?& array['avatar_id','image_id','vote_count','voted','reply_count'],'DTO fields preserved');
select pg_temp.assert(exists(select 1 from jsonb_array_elements(public.app_feed()->'items') p where p->>'id'=pg_temp.id(22)::text),'owner feed retains archive');
select pg_temp.denied('select public.app_reply(pg_temp.id(22),''Nova resposta'')','reply on archived denied');
select pg_temp.denied('select public.app_vote(''post'',pg_temp.id(22))','post vote on archived denied');
select pg_temp.denied('select public.app_vote(''reply'',pg_temp.id(30))','reply vote on archived denied');
select pg_temp.denied('select public.app_report(''reply'',pg_temp.id(30),''Denúncia sintética'')','reply report on archived denied');
select pg_temp.denied('select public.app_report(''post'',pg_temp.id(22),''Denúncia sintética'')','post report on archived denied');
select pg_temp.denied('select public.app_save_post(pg_temp.id(22),pg_temp.id(10),''Alterado'',''Alterado'',null)','archived edit denied');
reset role;
set local role service_role;
select pg_temp.denied('select public.app_upload_access(pg_temp.id(1),''post-image'',pg_temp.id(22),''foto.png'',''image/png'',100)','archived upload reservation denied');
select pg_temp.denied('select public.app_upload_context(pg_temp.id(1),pg_temp.id(41))','archived pending upload context denied');
select pg_temp.denied('select public.app_upload_finalize(pg_temp.id(1),pg_temp.id(41))','archived pending upload finalization denied');
select pg_temp.assert(public.app_media_access(pg_temp.id(1),'post-image',pg_temp.id(40))->>'can_access'='true','archived existing image readable');
reset role;
select pg_temp.assert((select status='archived' and image_path=(select path from public.uploads where id=pg_temp.id(40)) from public.posts where id=pg_temp.id(22)) and (select state='pending' from public.uploads where id=pg_temp.id(41)),'pending upload cannot reopen or replace archive');
select pg_temp.login(2);
set local role authenticated;
select pg_temp.denied('select public.app_post(pg_temp.id(22))','archive unreadable to other member');
select pg_temp.denied('select public.app_archive_post(pg_temp.id(22),false)','other author restore denied');
select pg_temp.assert(not exists(select 1 from jsonb_array_elements(public.app_feed()->'items') p where p->>'id'=pg_temp.id(22)::text),'archive absent from other member feed');
reset role;

-- Access and session changes are checked again on every retry.
select pg_temp.login(1);
update public.profiles set suspended=true where id=pg_temp.id(1);
set local role authenticated;
select pg_temp.denied('select public.app_archive_post(pg_temp.id(22),false)','suspended restore denied');
reset role;
update public.profiles set suspended=false where id=pg_temp.id(1);
update public.spaces set access_mode='subscribers' where id=pg_temp.id(10);
set local role authenticated;
select pg_temp.denied('select public.app_archive_post(pg_temp.id(22),false)','expired entitlement restore denied');
reset role;
update public.spaces set access_mode='members',status='archived' where id=pg_temp.id(10);
set local role authenticated;
select pg_temp.denied('select public.app_archive_post(pg_temp.id(22),false)','archived space restore denied');
reset role;
update public.spaces set status='published' where id=pg_temp.id(10);
update public.app_sessions set revoked_at=now() where id=pg_temp.sid(1);
set local role authenticated;
select pg_temp.denied('select public.app_archive_post(pg_temp.id(22),false)','revoked app session denied');
reset role;
update public.app_sessions set revoked_at=null where id=pg_temp.sid(1);
update auth.sessions set not_after=now()-interval '1 second' where id=pg_temp.sid(1);
set local role authenticated;
select pg_temp.denied('select public.app_archive_post(pg_temp.id(22),false)','expired native session denied');
reset role;
update auth.sessions set not_after=null where id=pg_temp.sid(1);

-- Administrative re-archiving overrides author provenance, including admin=author.
select pg_temp.login(3);
set local role authenticated;
select pg_temp.assert(public.app_post(pg_temp.id(22))->'post'->>'status'='archived','staff historical read');
select pg_temp.denied('select public.app_admin_member(pg_temp.id(1),''{}'',''Conferência da reautenticação'',null)','admin member change still requires reauth');
select pg_temp.assert(public.app_archive_post(pg_temp.id(29),true)->>'archived'='true','admin author own archive');
select pg_temp.assert(public.app_admin_archive('posts',pg_temp.id(22),true)->>'archived'='true','admin overlap archive');
select pg_temp.assert(public.app_admin_archive('posts',pg_temp.id(29),true)->>'archived'='true','admin author administrative overlap');
select pg_temp.denied('select public.app_archive_post(pg_temp.id(29),false)','admin author cannot own restore admin operation');
reset role;
select pg_temp.assert((select archived_by=pg_temp.id(3) and archive_source='admin' and previous_status='approved' from public.posts where id=pg_temp.id(22)),'admin marker durable prior state preserved');
select pg_temp.login(1);
set local role authenticated;
select pg_temp.denied('select public.app_archive_post(pg_temp.id(22),false)','owner cannot restore admin overlap');
select pg_temp.assert(public.app_post(pg_temp.id(22))->'post'->>'can_restore'='false','admin overlap restore capability false');
reset role;
select pg_temp.login(3);
set local role authenticated;
select pg_temp.assert(public.app_admin_archive('posts',pg_temp.id(22),false)->>'archived'='false','admin restore unchanged');
reset role;
select pg_temp.assert((select status='approved' and archived_by is null and archive_source is null from public.posts where id=pg_temp.id(22)),'admin restores prior state clears marker');

-- The shared guards still allow real interactions on an approved parent.
select pg_temp.login(2);
set local role authenticated;
select pg_temp.assert(public.app_vote('reply',pg_temp.id(30))->>'voted'='true','approved parent reply vote allowed');
select pg_temp.assert(public.app_report('reply',pg_temp.id(30),'Denúncia sintética após restauração')?'id','approved parent reply report allowed');
select pg_temp.assert(public.app_reply(pg_temp.id(22),'Resposta sintética após restauração')->>'status'='pending','approved parent reply allowed');
reset role;
select pg_temp.login(1);
set local role service_role;
select pg_temp.assert(public.app_upload_context(pg_temp.id(1),pg_temp.id(41))->>'status'='pending','restored pending upload context allowed');
select pg_temp.assert(public.app_upload_finalize(pg_temp.id(1),pg_temp.id(41))->>'state'='ready','restored upload finalization allowed');
reset role;
select pg_temp.assert((select status='pending' and image_path=(select path from public.uploads where id=pg_temp.id(41)) from public.posts where id=pg_temp.id(22)),'image change still requires review');
update public.posts set status='hidden' where id=pg_temp.id(23);
set local role authenticated;
select pg_temp.denied('select public.app_archive_post(pg_temp.id(23),false)','later moderation cannot be undone by own restore');
reset role;
update public.posts set status='archived',previous_status='hidden' where id=pg_temp.id(23);
set local role authenticated;
select pg_temp.denied('select public.app_archive_post(pg_temp.id(23),false)','invalid previous state denied');
select pg_temp.assert(public.app_post(pg_temp.id(23))->'post'->>'can_restore'='false','invalid previous state capability false');
reset role;

-- An audit failure must roll the state transition back atomically.
create function pg_temp.reject_archive_audit() returns trigger language plpgsql as $$ begin
 if new.target_id=pg_temp.id(21) and new.action='archive' then raise exception 'Synthetic audit failure';end if;return new;
end $$;
create trigger archive_test_audit before insert on public.audit_events for each row execute function pg_temp.reject_archive_audit();
select pg_temp.login(1);
set local role authenticated;
select pg_temp.denied('select public.app_archive_post(pg_temp.id(21),true)','audit failure denies transition');
reset role;
select pg_temp.assert((select status='pending' from public.posts where id=pg_temp.id(21)),'audit failure state rolled back');
select pg_temp.assert((select count(*)=2 from public.audit_events where target_id=pg_temp.id(21)),'audit failure adds no audit');
drop trigger archive_test_audit on public.audit_events;
select count(*) as post_archive_assertions_passed from post_archive_results;
rollback;
