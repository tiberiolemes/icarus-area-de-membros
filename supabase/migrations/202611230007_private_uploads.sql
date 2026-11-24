begin;
alter table public.ica_uploads add column expires_at timestamptz not null default now()+interval '15 minutes',add column profile_id uuid references public.ica_profiles(id);
alter table public.ica_uploads drop constraint ica_uploads_check;
alter table public.ica_uploads add constraint ica_uploads_resource_check check(num_nonnulls(ticket_id,post_id,lesson_id,material_id,course_id,profile_id)=1);
alter table public.ica_uploads drop constraint ica_uploads_size_bytes_check;
alter table public.ica_uploads add constraint ica_uploads_size_bytes_check check(size_bytes between 1 and 524288000);
alter table public.ica_materials drop constraint ica_materials_size_bytes_check;
alter table public.ica_materials add constraint ica_materials_size_bytes_check check(size_bytes between 0 and 524288000);
alter table public.ica_profiles add column avatar_id uuid references public.ica_uploads(id);
update storage.buckets set file_size_limit=524288000 where id='icarus-private';

create or replace function public.app_upload_access(p_actor_id uuid,p_kind text,p_resource_id uuid,p_file_name text,p_content_type text,p_size_bytes bigint) returns jsonb language plpgsql security definer set search_path='' as $$
declare id_out uuid:=gen_random_uuid();path_out text;ext text;deadline timestamptz:=now()+interval '15 minutes';begin
 perform ica_private.service_actor(p_actor_id);perform ica_private.throttle(p_actor_id,'upload',12);
 if p_file_name is null or length(p_file_name) not between 1 and 200 or p_file_name ~ '[/\\[:cntrl:]]' or p_size_bytes is null or p_size_bytes not between 1 and 524288000 then perform ica_private.fail('Arquivo inválido ou maior que 500 MB.');end if;
 ext:=lower(substring(p_file_name from '\.([A-Za-z0-9]+)$'));
 if ext is null or p_content_type is null or not ((p_content_type='application/pdf' and ext='pdf') or (p_content_type='application/zip' and ext='zip') or (p_content_type='text/plain' and ext in ('txt','md','skill')) or (p_content_type='image/jpeg' and ext in ('jpg','jpeg')) or (p_content_type='image/png' and ext='png') or (p_content_type='image/webp' and ext='webp') or (p_content_type='video/mp4' and ext='mp4') or (p_content_type='audio/mpeg' and ext='mp3')) then perform ica_private.fail('Tipo de arquivo não permitido.');end if;
 if p_kind='ticket-attachment' then
  if p_size_bytes>52428800 or not ica_private.ticket_access(p_actor_id,p_resource_id) then perform ica_private.fail();end if;
 elsif p_kind='post-image' then
  if p_content_type not in ('image/jpeg','image/png','image/webp') or p_size_bytes>10485760 or not exists(select 1 from public.ica_posts where id=p_resource_id and author_id=p_actor_id and status not in ('removed','archived') and ica_private.space_access(p_actor_id,space_id)) then perform ica_private.fail();end if;
 elsif p_kind='avatar' then
  if p_resource_id<>p_actor_id or p_content_type not in ('image/jpeg','image/png','image/webp') or p_size_bytes>5242880 then perform ica_private.fail();end if;
 elsif p_kind in ('lesson','material','course-cover') then
  if not ica_private.is_staff(p_actor_id,array['admin','instructor']) then perform ica_private.fail();end if;
  if (p_kind='lesson' and not exists(select 1 from public.ica_lessons where id=p_resource_id)) or (p_kind='material' and not exists(select 1 from public.ica_materials where id=p_resource_id)) or (p_kind='course-cover' and (p_size_bytes>10485760 or p_content_type not in ('image/jpeg','image/png','image/webp') or not exists(select 1 from public.ica_courses where id=p_resource_id))) then perform ica_private.fail();end if;
 else perform ica_private.fail('Destino de upload inválido.');end if;
 path_out:=p_kind||'/'||p_resource_id::text||'/'||id_out::text||'.'||ext;
 insert into public.ica_uploads(id,actor_id,kind,resource_id,ticket_id,post_id,lesson_id,material_id,course_id,profile_id,path,file_name,content_type,size_bytes,expires_at) values(id_out,p_actor_id,p_kind,p_resource_id,case when p_kind='ticket-attachment' then p_resource_id end,case when p_kind='post-image' then p_resource_id end,case when p_kind='lesson' then p_resource_id end,case when p_kind='material' then p_resource_id end,case when p_kind='course-cover' then p_resource_id end,case when p_kind='avatar' then p_resource_id end,path_out,p_file_name,p_content_type,p_size_bytes,deadline);
 return jsonb_build_object('id',id_out,'bucket','icarus-private','path',path_out,'storage_path',path_out,'content_type',p_content_type,'size_bytes',p_size_bytes,'status','pending','expires_at',deadline);
end $$;
revoke execute on function public.app_upload_access(uuid,text,uuid,text,text,bigint) from public,anon,authenticated;grant execute on function public.app_upload_access(uuid,text,uuid,text,text,bigint) to service_role;
create function public.app_upload_context(p_actor_id uuid,p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;begin
 perform ica_private.service_actor(p_actor_id);
 select jsonb_build_object('id',id,'bucket','icarus-private','path',path,'size_bytes',size_bytes,'content_type',content_type,'status',state,'expires_at',expires_at) into result from public.ica_uploads where id=p_id and actor_id=p_actor_id;
 if result is null then perform ica_private.fail('Upload indisponível.');end if;return result;
end $$;
revoke execute on function public.app_upload_context(uuid,uuid) from public,anon,authenticated;grant execute on function public.app_upload_context(uuid,uuid) to service_role;

create function ica_private.upload_gate(p_actor uuid,p_upload uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.ica_uploads x where x.id=p_upload and x.actor_id=p_actor and
 case x.kind
 when 'ticket-attachment' then ica_private.ticket_access(p_actor,x.ticket_id)
 when 'post-image' then exists(select 1 from public.ica_posts p where p.id=x.post_id and p.author_id=p_actor and p.status not in ('removed','archived') and ica_private.space_access(p_actor,p.space_id))
 when 'avatar' then x.profile_id=p_actor
 when 'lesson' then ica_private.is_staff(p_actor,array['admin','instructor'])
 when 'material' then ica_private.is_staff(p_actor,array['admin','instructor'])
 when 'course-cover' then ica_private.is_staff(p_actor,array['admin','instructor'])
 else false end)
$$;
create function ica_private.storage_insert_allowed(p_path text) returns boolean language plpgsql security definer set search_path='' as $$
declare u uuid:=ica_private.actor();begin
 return exists(select 1 from public.ica_uploads x where x.path=p_path and x.actor_id=u and x.state='pending' and x.expires_at>now() and ica_private.upload_gate(u,x.id));
end $$;
revoke execute on function ica_private.storage_insert_allowed(text) from public,anon,authenticated;
grant usage on schema ica_private to authenticated;
grant execute on function ica_private.storage_insert_allowed(text) to authenticated;
create policy icarus_reserved_upload on storage.objects for insert to authenticated with check(bucket_id='icarus-private' and ica_private.storage_insert_allowed(name));

create or replace function public.app_upload_finalize(p_actor_id uuid,p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare x public.ica_uploads;meta jsonb;begin
 perform ica_private.service_actor(p_actor_id);
 select * into x from public.ica_uploads where id=p_id and actor_id=p_actor_id for update;
 if not found or not ica_private.upload_gate(p_actor_id,p_id) or (x.state='pending' and x.expires_at<=now()) then perform ica_private.fail('Upload indisponível ou expirado.');end if;
 select metadata into meta from storage.objects where bucket_id='icarus-private' and name=x.path;
 if meta is null or (meta->>'size')::bigint is distinct from x.size_bytes or meta->>'mimetype' is distinct from x.content_type then perform ica_private.fail('O arquivo recebido não corresponde à reserva.');end if;
 if x.state='ready' then return jsonb_build_object('id',x.id,'path',x.path,'state','ready');end if;
 if x.kind='post-image' then update public.ica_posts set image_path=x.path,status='pending',updated_at=now() where id=x.post_id;
 elsif x.kind='material' then update public.ica_materials set storage_path=x.path,file_type=x.content_type,size_bytes=x.size_bytes where id=x.material_id;
 elsif x.kind='lesson' then update public.ica_lessons set storage_path=x.path where id=x.lesson_id;
 elsif x.kind='course-cover' then update public.ica_courses set cover_url=x.path where id=x.course_id;
 elsif x.kind='avatar' then update public.ica_profiles set avatar_id=x.id where id=p_actor_id;
 end if;
 update public.ica_uploads set state='ready' where id=x.id;return jsonb_build_object('id',x.id,'path',x.path,'state','ready');
end $$;
revoke execute on function public.app_upload_finalize(uuid,uuid) from public,anon,authenticated;grant execute on function public.app_upload_finalize(uuid,uuid) to service_role;

create or replace function public.app_media_access(p_actor_id uuid,p_kind text,p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare path_out text;video text;begin
 perform ica_private.service_actor(p_actor_id);
 if p_kind='lesson' and ica_private.lesson_access(p_actor_id,p_id) then select l.storage_path,l.video_id into path_out,video from public.ica_lessons l where id=p_id and (storage_path is null or exists(select 1 from public.ica_uploads where lesson_id=l.id and path=l.storage_path and state='ready'));
 elsif p_kind='material' and ica_private.material_access(p_actor_id,p_id) then select m.storage_path into path_out from public.ica_materials m where id=p_id and exists(select 1 from public.ica_uploads where material_id=m.id and path=m.storage_path and state='ready');
 elsif p_kind='ticket-attachment' then select path into path_out from public.ica_uploads where id=p_id and state='ready' and ticket_id is not null and ica_private.ticket_access(p_actor_id,ticket_id);
 elsif p_kind='post-image' then select x.path into path_out from public.ica_uploads x join public.ica_posts p on p.id=x.post_id where x.id=p_id and x.state='ready' and p.image_path=x.path and ica_private.post_access(p_actor_id,p.id);
 elsif p_kind='course-cover' then select c.cover_url into path_out from public.ica_courses c where id=p_id and (status='published' or ica_private.is_staff(p_actor_id,array['admin','instructor'])) and exists(select 1 from public.ica_uploads where course_id=c.id and path=c.cover_url and state='ready');
 elsif p_kind='avatar' then
  select x.path into path_out from public.ica_uploads x join public.ica_profiles p on p.avatar_id=x.id where x.id=p_id and x.state='ready' and x.profile_id=p.id and (p.id=p_actor_id or ica_private.is_staff(p_actor_id,array['admin','support']) or exists(select 1 from public.ica_posts po where po.author_id=p.id and ica_private.post_access(p_actor_id,po.id)) or exists(select 1 from public.ica_replies r where r.author_id=p.id and r.status='approved' and ica_private.post_access(p_actor_id,r.post_id)) or exists(select 1 from public.ica_ticket_messages m where m.author_id=p.id and ica_private.ticket_access(p_actor_id,m.ticket_id)));
 else perform ica_private.fail('Arquivo indisponível.');end if;
 if path_out is null and video is null then perform ica_private.fail('Arquivo não configurado ou upload pendente.');end if;
 return jsonb_build_object('storage_path',path_out,'video_id',video,'provider',case when video is not null then 'bunny' else 'supabase' end,'bucket','icarus-private','can_access',true);
end $$;
revoke execute on function public.app_media_access(uuid,text,uuid) from public,anon,authenticated;grant execute on function public.app_media_access(uuid,text,uuid) to service_role;

create or replace function public.app_profile(p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=ica_private.actor();p public.ica_profiles;begin
 perform ica_private.validate_keys(p_data,array['full_name','phone','bio','company','theme','onboarding_complete','avatar_id']);
 select * into p from public.ica_profiles where id=u for update;
 perform ica_private.validate_company(coalesce(p_data->'company',p.company),coalesce((p_data->>'onboarding_complete')::boolean,p.onboarding_complete));
 if p_data?'avatar_id' and p_data->>'avatar_id' is not null and not exists(select 1 from public.ica_uploads where id=(p_data->>'avatar_id')::uuid and profile_id=u and actor_id=u and kind='avatar' and state='ready') then perform ica_private.fail('Foto de perfil inválida.');end if;
 update public.ica_profiles set full_name=case when p_data?'full_name' then trim(p_data->>'full_name') else full_name end,phone=coalesce(p_data->>'phone',phone),bio=coalesce(p_data->>'bio',bio),company=coalesce(p_data->'company',company),theme=coalesce(p_data->>'theme',theme),onboarding_complete=coalesce((p_data->>'onboarding_complete')::boolean,onboarding_complete),avatar_id=case when p_data?'avatar_id' then (p_data->>'avatar_id')::uuid else avatar_id end where id=u;
 if exists(select 1 from public.ica_profiles x cross join public.ica_onboarding o where x.id=u and x.onboarding_complete and (length(trim(x.full_name))<3 or (o.company_required and length(trim(coalesce(x.company->>'name','')))<1))) then perform ica_private.fail('Preencha seu nome e os dados obrigatórios da empresa.');end if;
 return ica_private.profile_json(u);
end $$;
revoke execute on function public.app_profile(jsonb) from public,anon;grant execute on function public.app_profile(jsonb) to authenticated;
commit;
