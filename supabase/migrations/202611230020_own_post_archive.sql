begin;
-- Keep the actor and operation origin: an administrator may also be the author.
alter table public.posts add column archived_by uuid references public.profiles(id),
 add column archive_source text check(archive_source in ('author','admin'));

create function public.app_archive_post(p_id uuid,p_archived boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.actor();p public.posts;begin
 if p_id is null or p_archived is null then perform app_private.fail('Operação inválida.');end if;
 -- Suspension locks profile before sessions; never wait on its inverse lock order.
 begin
  perform 1 from public.profiles where id=u for key share nowait;
 exception when lock_not_available then
  perform app_private.fail('Sua conta está sendo atualizada. Tente novamente em instantes.');
 end;
 select * into p from public.posts where id=p_id and author_id=u for update;
 if not found or not app_private.space_access(u,p.space_id) then perform app_private.fail('Publicação indisponível.');end if;
 if p_archived then
  if p.status='archived' and p.archived_by=u and p.archive_source='author' and p.previous_status in ('pending','approved','rejected') then
   return jsonb_build_object('id',p.id,'status',p.status,'archived',true);
  end if;
  if p.status not in ('pending','approved','rejected') then perform app_private.fail('Publicação indisponível.');end if;
  update public.posts set previous_status=p.status,status='archived',archived_by=u,archive_source='author',updated_at=now() where id=p.id;
 else
  if p.archived_by is distinct from u or p.archive_source is distinct from 'author' or p.previous_status is null or p.previous_status not in ('pending','approved','rejected') then perform app_private.fail('Publicação indisponível.');end if;
  if p.status=p.previous_status then return jsonb_build_object('id',p.id,'status',p.status,'archived',false);end if;
  if p.status<>'archived' then perform app_private.fail('Publicação indisponível.');end if;
  update public.posts set status=p.previous_status,updated_at=now() where id=p.id;
 end if;
 perform app_private.audit(u,case when p_archived then 'archive' else 'restore' end,'posts',p.id);
 return jsonb_build_object('id',p.id,'status',case when p_archived then 'archived' else p.previous_status end,'archived',p_archived);
end $$;
revoke execute on function public.app_archive_post(uuid,boolean) from public,anon,service_role;
grant execute on function public.app_archive_post(uuid,boolean) to authenticated;

-- Both post and reply interactions require a currently approved parent.
create or replace function app_private.visible_target(p_actor uuid,p_type text,p_id uuid) returns boolean
language plpgsql volatile security definer set search_path='' as $$
declare parent_id uuid;begin
 if p_type='post' then parent_id:=p_id;
 elsif p_type='reply' then select post_id into parent_id from public.replies where id=p_id and status='approved';
 else return false;end if;
 perform 1 from public.posts where id=parent_id for share;
 return exists(select 1 from public.posts where id=parent_id and status='approved' and app_private.post_access(p_actor,id))
  and (p_type='post' or exists(select 1 from public.replies where id=p_id and status='approved' and post_id=parent_id));
end $$;
revoke execute on function app_private.visible_target(uuid,text,uuid),app_private.post_json(uuid,uuid) from public,anon,authenticated;

create or replace function app_private.post_json(p_actor uuid,p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',p.id,'space_id',p.space_id,'author_name',a.full_name,'author_id',a.id,'author_role',a.role,'avatar_id',a.avatar_id,'plan_name',(select pl.name from public.subscriptions s join public.plans pl on pl.id=s.plan_id where s.user_id=a.id and s.starts_at<=now() and s.ends_at>now() and s.revoked_at is null order by s.ends_at desc limit 1),'title',p.title,'body',p.body,'status',p.status,'created_at',p.created_at,'updated_at',p.updated_at,'image_id',(select id from public.uploads where post_id=p.id and path=p.image_path),'vote_count',(select count(*) from public.votes where post_id=p.id),'voted',exists(select 1 from public.votes where post_id=p.id and actor_id=p_actor),'reply_count',(select count(*) from public.replies r where r.post_id=p.id and (r.status='approved' or r.author_id=p_actor or app_private.is_staff(p_actor,array['admin','moderator']))),'can_edit',p.author_id=p_actor and p.status not in ('archived','removed'),'can_archive',p.author_id=p_actor and app_private.space_access(p_actor,p.space_id) and p.status in ('pending','approved','rejected'),'can_restore',coalesce(p.author_id=p_actor and app_private.space_access(p_actor,p.space_id) and p.status='archived' and p.archived_by=p_actor and p.archive_source='author' and p.previous_status in ('pending','approved','rejected'),false))
 from public.posts p join public.profiles a on a.id=p.author_id where p.id=p_id
$$;

create or replace function public.app_admin_archive(p_entity text,p_id uuid,p_archived boolean,p_reauth_token text) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.require_role(app_private.entity_roles(p_entity));begin
 perform app_private.consume_reauth(p_reauth_token,u);
 case p_entity
 when 'courses' then update public.courses set previous_status=case when p_archived and status<>'archived' then status else previous_status end,status=case when p_archived then 'archived' when status='archived' then coalesce(previous_status,'draft') else status end where id=p_id;
 when 'modules' then update public.modules set previous_status=case when p_archived and status<>'archived' then status else previous_status end,status=case when p_archived then 'archived' when status='archived' then coalesce(previous_status,'draft') else status end where id=p_id;
 when 'sections' then update public.sections set previous_status=case when p_archived and status<>'archived' then status else previous_status end,status=case when p_archived then 'archived' when status='archived' then coalesce(previous_status,'draft') else status end where id=p_id;
 when 'lessons' then update public.lessons set previous_status=case when p_archived and status<>'archived' then status else previous_status end,status=case when p_archived then 'archived' when status='archived' then coalesce(previous_status,'draft') else status end where id=p_id;
 when 'material_folders' then update public.material_folders set previous_status=case when p_archived and status<>'archived' then status else previous_status end,status=case when p_archived then 'archived' when status='archived' then coalesce(previous_status,'draft') else status end where id=p_id;
 when 'materials' then update public.materials set previous_status=case when p_archived and status<>'archived' then status else previous_status end,status=case when p_archived then 'archived' when status='archived' then coalesce(previous_status,'draft') else status end where id=p_id;
 when 'spaces' then update public.spaces set previous_status=case when p_archived and status<>'archived' then status else previous_status end,status=case when p_archived then 'archived' when status='archived' then coalesce(previous_status,'draft') else status end where id=p_id;
 when 'posts' then
  if p_archived is null then perform app_private.fail('Operação inválida.');end if;
  update public.posts set archived_by=case when p_archived then u end,archive_source=case when p_archived then 'admin' end,previous_status=case when p_archived and status<>'archived' then status else previous_status end,status=case when p_archived then 'archived' when status='archived' then coalesce(previous_status,'draft') else status end where id=p_id;
 when 'replies' then update public.replies set previous_status=case when p_archived and status<>'archived' then status else previous_status end,status=case when p_archived then 'archived' when status='archived' then coalesce(previous_status,'draft') else status end where id=p_id;
 else perform app_private.fail('Esta entidade não pode ser arquivada.');end case;
 if not found then perform app_private.fail('Registro indisponível.');end if;
 perform app_private.audit(u,case when p_archived then 'archive' else 'restore' end,p_entity,p_id);
 return jsonb_build_object('id',p_id,'archived',p_archived);
end $$;
revoke execute on function public.app_admin_archive(text,uuid,boolean,text) from public,anon;grant execute on function public.app_admin_archive(text,uuid,boolean,text) to authenticated;


-- Serialize new interactions and image finalization with post archiving.
create or replace function public.app_reply(p_post_id uuid,p_body text) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.actor();id_out uuid;begin
 perform app_private.throttle(u,'reply',12);
 perform 1 from public.posts where id=p_post_id for share;
 if not app_private.post_access(u,p_post_id) or not exists(select 1 from public.posts where id=p_post_id and status='approved') then perform app_private.fail('Publicação indisponível para respostas.');end if;
 insert into public.replies(post_id,author_id,body) values(p_post_id,u,trim(p_body)) returning id into id_out;return jsonb_build_object('id',id_out,'status','pending');
end $$;
revoke execute on function public.app_reply(uuid,text) from public,anon;grant execute on function public.app_reply(uuid,text) to authenticated;
create or replace function public.app_upload_access(p_actor_id uuid,p_kind text,p_resource_id uuid,p_file_name text,p_content_type text,p_size_bytes bigint) returns jsonb language plpgsql security definer set search_path='' as $$
declare id_out uuid:=gen_random_uuid();path_out text;ext text;deadline timestamptz:=now()+interval '15 minutes';begin
 perform app_private.service_actor(p_actor_id);perform app_private.throttle(p_actor_id,'upload',12);
 if p_file_name is null or length(p_file_name) not between 1 and 200 or p_file_name ~ '[/\\[:cntrl:]]' or p_size_bytes is null or p_size_bytes not between 1 and 524288000 then perform app_private.fail('Arquivo inválido ou maior que 500 MB.');end if;
 ext:=lower(substring(p_file_name from '\.([A-Za-z0-9]+)$'));
 if ext is null or p_content_type is null or not ((p_content_type='application/pdf' and ext='pdf') or (p_content_type='application/zip' and ext='zip') or (p_content_type='text/plain' and ext in ('txt','md','skill')) or (p_content_type='image/jpeg' and ext in ('jpg','jpeg')) or (p_content_type='image/png' and ext='png') or (p_content_type='image/webp' and ext='webp') or (p_content_type='video/mp4' and ext='mp4') or (p_content_type='audio/mpeg' and ext='mp3')) then perform app_private.fail('Tipo de arquivo não permitido.');end if;
 if p_kind='ticket-attachment' then
  if p_size_bytes>52428800 or not app_private.ticket_access(p_actor_id,p_resource_id) then perform app_private.fail();end if;
 elsif p_kind='post-image' then
  perform 1 from public.posts where id=p_resource_id for share;
  if p_content_type not in ('image/jpeg','image/png','image/webp') or p_size_bytes>10485760 or not exists(select 1 from public.posts where id=p_resource_id and author_id=p_actor_id and status not in ('removed','archived') and app_private.space_access(p_actor_id,space_id)) then perform app_private.fail();end if;
 elsif p_kind='avatar' then
  if p_resource_id<>p_actor_id or p_content_type not in ('image/jpeg','image/png','image/webp') or p_size_bytes>5242880 then perform app_private.fail();end if;
 elsif p_kind in ('lesson','material','course-cover') then
  if not app_private.is_staff(p_actor_id,array['admin','instructor']) then perform app_private.fail();end if;
  if (p_kind='lesson' and not exists(select 1 from public.lessons where id=p_resource_id)) or (p_kind='material' and not exists(select 1 from public.materials where id=p_resource_id)) or (p_kind='course-cover' and (p_size_bytes>10485760 or p_content_type not in ('image/jpeg','image/png','image/webp') or not exists(select 1 from public.courses where id=p_resource_id))) then perform app_private.fail();end if;
 else perform app_private.fail('Destino de upload inválido.');end if;
 path_out:=p_kind||'/'||p_resource_id::text||'/'||id_out::text||'.'||ext;
 insert into public.uploads(id,actor_id,kind,resource_id,ticket_id,post_id,lesson_id,material_id,course_id,profile_id,path,file_name,content_type,size_bytes,expires_at) values(id_out,p_actor_id,p_kind,p_resource_id,case when p_kind='ticket-attachment' then p_resource_id end,case when p_kind='post-image' then p_resource_id end,case when p_kind='lesson' then p_resource_id end,case when p_kind='material' then p_resource_id end,case when p_kind='course-cover' then p_resource_id end,case when p_kind='avatar' then p_resource_id end,path_out,p_file_name,p_content_type,p_size_bytes,deadline);
 return jsonb_build_object('id',id_out,'bucket','icarus-private','path',path_out,'storage_path',path_out,'content_type',p_content_type,'size_bytes',p_size_bytes,'status','pending','expires_at',deadline);
end $$;
revoke execute on function public.app_upload_access(uuid,text,uuid,text,text,bigint) from public,anon,authenticated;grant execute on function public.app_upload_access(uuid,text,uuid,text,text,bigint) to service_role;
create or replace function public.app_upload_finalize(p_actor_id uuid,p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare x public.uploads;meta jsonb;begin
 perform app_private.service_actor(p_actor_id);
 select * into x from public.uploads where id=p_id and actor_id=p_actor_id for update;
 if not found then perform app_private.fail('Upload indisponível ou expirado.');end if;
 if x.kind='post-image' then perform 1 from public.posts where id=x.post_id for update;end if;
 if not app_private.upload_gate(p_actor_id,p_id) or (x.state='pending' and x.expires_at<=now()) then perform app_private.fail('Upload indisponível ou expirado.');end if;
 select metadata into meta from storage.objects where bucket_id='icarus-private' and name=x.path;
 if meta is null or (meta->>'size')::bigint is distinct from x.size_bytes or meta->>'mimetype' is distinct from x.content_type then perform app_private.fail('O arquivo recebido não corresponde à reserva.');end if;
 if x.state='ready' then return jsonb_build_object('id',x.id,'path',x.path,'state','ready');end if;
 if x.kind='post-image' then update public.posts set image_path=x.path,status='pending',updated_at=now() where id=x.post_id;
 elsif x.kind='material' then update public.materials set storage_path=x.path,file_type=x.content_type,size_bytes=x.size_bytes where id=x.material_id;
 elsif x.kind='lesson' then update public.lessons set storage_path=x.path where id=x.lesson_id;
 elsif x.kind='course-cover' then update public.courses set cover_url=x.path where id=x.course_id;
 elsif x.kind='avatar' then update public.profiles set avatar_id=x.id where id=p_actor_id;
 end if;
 update public.uploads set state='ready' where id=x.id;return jsonb_build_object('id',x.id,'path',x.path,'state','ready');
end $$;
revoke execute on function public.app_upload_finalize(uuid,uuid) from public,anon,authenticated;grant execute on function public.app_upload_finalize(uuid,uuid) to service_role;


notify pgrst,'reload schema';
commit;
