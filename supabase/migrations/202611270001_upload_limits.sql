begin;

-- Imagem até 500 KB e PDF até 5 MB em qualquer envio; a tela otimiza antes de subir. O avatar mantém a mensagem própria; o print do feedback usa app_feedback_screenshot_reserve.
create or replace function public.app_upload_access(p_actor_id uuid,p_kind text,p_resource_id uuid,p_file_name text,p_content_type text,p_size_bytes bigint) returns jsonb language plpgsql security definer set search_path='' as $$
declare id_out uuid:=gen_random_uuid();path_out text;ext text;deadline timestamptz:=now()+interval '15 minutes';begin
 perform app_private.service_actor(p_actor_id);perform app_private.throttle(p_actor_id,'upload',12);
 if p_file_name is null or length(p_file_name) not between 1 and 200 or p_file_name ~ '[/\\[:cntrl:]]' or p_size_bytes is null or p_size_bytes not between 1 and 524288000 then perform app_private.fail('Arquivo inválido ou maior que 500 MB.');end if;
 ext:=lower(substring(p_file_name from '\.([A-Za-z0-9]+)$'));
 if ext is null or p_content_type is null or not ((p_content_type='application/pdf' and ext='pdf') or (p_content_type='application/zip' and ext='zip') or (p_content_type='text/plain' and ext in ('txt','md','skill')) or (p_content_type='image/jpeg' and ext in ('jpg','jpeg')) or (p_content_type='image/png' and ext='png') or (p_content_type='image/webp' and ext='webp') or (p_content_type='video/mp4' and ext='mp4') or (p_content_type='audio/mpeg' and ext='mp3')) then perform app_private.fail('Tipo de arquivo não permitido.');end if;
 if (p_kind<>'avatar' and p_content_type in ('image/jpeg','image/png','image/webp') and p_size_bytes>512000) or (p_content_type='application/pdf' and p_size_bytes>5242880) then perform app_private.fail('Imagens aceitam até 500 KB e PDFs até 5 MB.');end if;
 if p_kind='ticket-attachment' then
  if p_size_bytes>52428800 or not app_private.ticket_access(p_actor_id,p_resource_id) then perform app_private.fail();end if;
 elsif p_kind='post-image' then
  perform 1 from public.posts where id=p_resource_id for share;
  if p_content_type not in ('image/jpeg','image/png','image/webp') or not exists(select 1 from public.posts where id=p_resource_id and author_id=p_actor_id and status not in ('removed','archived') and app_private.space_access(p_actor_id,space_id)) then perform app_private.fail();end if;
 elsif p_kind='avatar' then
  if p_resource_id is distinct from p_actor_id then perform app_private.fail();end if;
  if p_content_type not in ('image/jpeg','image/png') or p_size_bytes>512000 then
   perform app_private.fail('A foto precisa ser JPG ou PNG de até 500 KB.');
  end if;
 elsif p_kind in ('lesson','material','course-cover') then
  if not app_private.is_staff(p_actor_id,array['admin','instructor']) then perform app_private.fail();end if;
  if (p_kind='lesson' and not exists(select 1 from public.lessons where id=p_resource_id)) or (p_kind='material' and not exists(select 1 from public.materials where id=p_resource_id)) or (p_kind='course-cover' and (p_content_type not in ('image/jpeg','image/png','image/webp') or not exists(select 1 from public.courses where id=p_resource_id))) then perform app_private.fail();end if;
 else perform app_private.fail('Destino de upload inválido.');end if;
 path_out:=p_kind||'/'||p_resource_id::text||'/'||id_out::text||'.'||ext;
 insert into public.uploads(id,actor_id,kind,resource_id,ticket_id,post_id,lesson_id,material_id,course_id,profile_id,path,file_name,content_type,size_bytes,expires_at) values(id_out,p_actor_id,p_kind,p_resource_id,case when p_kind='ticket-attachment' then p_resource_id end,case when p_kind='post-image' then p_resource_id end,case when p_kind='lesson' then p_resource_id end,case when p_kind='material' then p_resource_id end,case when p_kind='course-cover' then p_resource_id end,case when p_kind='avatar' then p_resource_id end,path_out,p_file_name,p_content_type,p_size_bytes,deadline);
 return jsonb_build_object('id',id_out,'bucket','icarus-private','path',path_out,'storage_path',path_out,'content_type',p_content_type,'size_bytes',p_size_bytes,'status','pending','expires_at',deadline);
end $$;

revoke execute on function public.app_upload_access(uuid,text,uuid,text,text,bigint) from public,anon,authenticated,service_role;
grant execute on function public.app_upload_access(uuid,text,uuid,text,text,bigint) to service_role;

commit;
