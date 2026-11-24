begin;
create table ica_private.local_demo_guard(singleton boolean primary key default true check(singleton),enabled boolean not null default false);
insert into ica_private.local_demo_guard default values;
revoke all on ica_private.local_demo_guard from public,anon,authenticated,service_role;
create function public.app_local_demo(p_accounts jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare a uuid;key text;role_out text;pro uuid;u uuid;meta jsonb;
 cid uuid:='d0000000-0000-4000-8000-000000000001';mid uuid:='d0000000-0000-4000-8000-000000000002';sid uuid:='d0000000-0000-4000-8000-000000000003';lid uuid:='d0000000-0000-4000-8000-000000000004';preview uuid:='d0000000-0000-4000-8000-000000000005';material uuid:='d0000000-0000-4000-8000-000000000006';folder uuid:='d0000000-0000-4000-8000-000000000007';space uuid:='d0000000-0000-4000-8000-000000000008';plan uuid:='d0000000-0000-4000-8000-000000000009';upload_l uuid:='d0000000-0000-4000-8000-000000000010';upload_m uuid:='d0000000-0000-4000-8000-000000000011';
begin
 if not exists(select 1 from ica_private.local_demo_guard where singleton and enabled) then perform ica_private.fail('Demonstração local desabilitada.');end if;
 perform ica_private.validate_keys(p_accounts,array['admin','member','pro','moderator','support']);
 foreach key in array array['admin','member','pro','moderator','support'] loop
  u:=(p_accounts->>key)::uuid;
  if u is null or not exists(select 1 from auth.users where id=u and email_confirmed_at is not null) then perform ica_private.fail('Crie as contas Auth locais confirmadas antes da demonstração.');end if;
  role_out:=case when key='pro' then 'member' else key end;
  update public.ica_profiles set role=role_out,demo=true where id=u;
 end loop;
 a:=(p_accounts->>'admin')::uuid;pro:=(p_accounts->>'pro')::uuid;
 insert into public.ica_plans(id,name,slug,price_cents,access_months,benefits,active) values(plan,'DEMONSTRAÇÃO local','demonstracao-local',9900,12,'["Conteúdo sintético local, sem oferta comercial"]',true) on conflict(id) do nothing;
 if not exists(select 1 from public.ica_subscriptions where user_id=pro and plan_id=plan and source='courtesy') then insert into public.ica_subscriptions(user_id,plan_id,ends_at,source) values(pro,plan,now()+interval '1 year','courtesy');end if;
 insert into public.ica_courses(id,slug,title,description,status,access_mode,plan_ids,certificate_enabled,signer_name,signer_title) values(cid,'demonstracao-local','DEMONSTRAÇÃO • Curso local','Fixture sintética para validar entrega e controles. Não representa curso ou cliente real.','published','plans',array[plan],true,'DEMONSTRAÇÃO responsável','Instrutor de demonstração') on conflict(id) do nothing;
 insert into public.ica_modules(id,course_id,slug,title,status) values(mid,cid,'demonstracao','DEMONSTRAÇÃO • Módulo','published') on conflict(id) do nothing;
 insert into public.ica_sections(id,module_id,title,status) values(sid,mid,'DEMONSTRAÇÃO • Seção','published') on conflict(id) do nothing;
 insert into public.ica_lessons(id,section_id,slug,title,body,type,duration_seconds,is_preview,order_index,status) values(preview,sid,'previa','DEMONSTRAÇÃO • Prévia','Aula de texto demonstrativa.','text',60,true,0,'published'),(lid,sid,'video-local','DEMONSTRAÇÃO • Vídeo privado','Vídeo sintético de oito segundos para testar Storage privado; não é integração Bunny.','video',8,false,1,'published') on conflict(id) do nothing;
 insert into public.ica_material_folders(id,name,status,access_mode,plan_ids) values(folder,'DEMONSTRAÇÃO • Materiais','published','plans',array[plan]) on conflict(id) do nothing;
 insert into public.ica_materials(id,folder_id,lesson_id,name,description,file_type,status,access_mode,plan_ids) values(material,folder,lid,'DEMONSTRAÇÃO • Material.txt','Arquivo sintético local, sem conteúdo de clientes.','text/plain','published','plans',array[plan]) on conflict(id) do nothing;
 insert into public.ica_spaces(id,name,description,status,access_mode) values(space,'DEMONSTRAÇÃO • Comunidade','Conteúdo sintético com aprovação manual.','published','members') on conflict(id) do nothing;
 insert into public.ica_legal_versions(kind,version,title,body,demo,published) values('terms','demo-local','DEMONSTRAÇÃO • Termos locais','FIXTURE LOCAL. Texto exclusivamente demonstrativo, sem validade como política jurídica ou oferta comercial.',true,not exists(select 1 from public.ica_legal_versions where kind='terms' and published)),('privacy','demo-local','DEMONSTRAÇÃO • Privacidade local','FIXTURE LOCAL. Texto exclusivamente demonstrativo; não habilita cadastro público nem checkout de produção.',true,not exists(select 1 from public.ica_legal_versions where kind='privacy' and published)) on conflict(kind,version) do nothing;
 -- A second call after service uploads registers actual metadata; nothing is ready before an object exists.
 select metadata into meta from storage.objects where bucket_id='icarus-private' and name='demo/aula.mp4';
 if meta is not null and meta->>'mimetype'='video/mp4' and (meta->>'size')::bigint between 1 and 524288000 then
  insert into public.ica_uploads(id,actor_id,kind,resource_id,lesson_id,path,file_name,content_type,size_bytes,state) values(upload_l,a,'lesson',lid,lid,'demo/aula.mp4','aula.mp4','video/mp4',(meta->>'size')::bigint,'ready') on conflict(id) do nothing;
  update public.ica_lessons set storage_path='demo/aula.mp4' where id=lid and storage_path is null;
 end if;
 select metadata into meta from storage.objects where bucket_id='icarus-private' and name='demo/material.txt';
 if meta is not null and meta->>'mimetype'='text/plain' and (meta->>'size')::bigint between 1 and 524288000 then
  insert into public.ica_uploads(id,actor_id,kind,resource_id,material_id,path,file_name,content_type,size_bytes,state) values(upload_m,a,'material',material,material,'demo/material.txt','material.txt','text/plain',(meta->>'size')::bigint,'ready') on conflict(id) do nothing;
  update public.ica_materials set storage_path='demo/material.txt',size_bytes=(meta->>'size')::bigint where id=material and storage_path is null;
 end if;
 return jsonb_build_object('course_id',cid,'module_id',mid,'section_id',sid,'lesson_id',lid,'preview_lesson_id',preview,'material_id',material,'folder_id',folder,'space_id',space,'plan_id',plan,'lesson_path','demo/aula.mp4','material_path','demo/material.txt','bucket','icarus-private');
end $$;
revoke execute on function public.app_local_demo(jsonb) from public,anon,authenticated;grant execute on function public.app_local_demo(jsonb) to service_role;
commit;
