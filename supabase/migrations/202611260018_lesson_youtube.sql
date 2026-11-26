begin;

-- A aula aceita vídeo do YouTube no mesmo campo do Bunny. O formato diz qual é qual:
-- o ID do Bunny é um GUID de 36 caracteres e o do YouTube tem 11.
alter table public.lessons add constraint lessons_video_id_format check (
  video_id is null
  or video_id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  or video_id ~ '^[A-Za-z0-9_-]{11}$'
);

-- A liberação passa a informar o provedor youtube. O restante da função é o da 202611260014.
create or replace function public.app_media_access(p_actor_id uuid,p_kind text,p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare path_out text;video text;focus text;begin
 perform app_private.service_actor(p_actor_id);
 if p_kind='lesson' and app_private.lesson_access(p_actor_id,p_id) then select l.storage_path,l.video_id into path_out,video from public.lessons l where id=p_id and (storage_path is null or exists(select 1 from public.uploads where lesson_id=l.id and path=l.storage_path and state='ready'));
 elsif p_kind='material' and app_private.material_access(p_actor_id,p_id) then select m.storage_path into path_out from public.materials m where id=p_id and exists(select 1 from public.uploads where material_id=m.id and path=m.storage_path and state='ready');
 elsif p_kind='ticket-attachment' then select path into path_out from public.uploads where id=p_id and state='ready' and ticket_id is not null and app_private.ticket_access(p_actor_id,ticket_id);
 elsif p_kind='post-image' then select x.path into path_out from public.uploads x join public.posts p on p.id=x.post_id where x.id=p_id and x.state='ready' and p.image_path=x.path and app_private.post_access(p_actor_id,p.id);
 elsif p_kind='course-cover' then select c.cover_url,c.cover_focus into path_out,focus from public.courses c where id=p_id and (status='published' or app_private.is_staff(p_actor_id,array['admin','instructor'])) and exists(select 1 from public.uploads where course_id=c.id and path=c.cover_url and state='ready');
 elsif p_kind='avatar' then
  select x.path into path_out from public.uploads x join public.profiles p on p.avatar_id=x.id where x.id=p_id and x.state='ready' and x.profile_id=p.id and (p.id=p_actor_id or app_private.is_staff(p_actor_id,array['admin','support']) or exists(select 1 from public.posts po where po.author_id=p.id and app_private.post_access(p_actor_id,po.id)) or exists(select 1 from public.replies r where r.author_id=p.id and r.status='approved' and app_private.post_access(p_actor_id,r.post_id)) or exists(select 1 from public.ticket_messages m where m.author_id=p.id and app_private.ticket_access(p_actor_id,m.ticket_id)));
 else perform app_private.fail('Arquivo indisponível.');end if;
 if path_out is null and video is null then perform app_private.fail('Arquivo não configurado ou upload pendente.');end if;
 return jsonb_build_object('storage_path',path_out,'video_id',video,'provider',case when video ~ '^[A-Za-z0-9_-]{11}$' then 'youtube' when video is not null then 'bunny' else 'supabase' end,'bucket','icarus-private','can_access',true,'focus',focus);
end $$;
revoke execute on function public.app_media_access(uuid,text,uuid) from public,anon,authenticated;grant execute on function public.app_media_access(uuid,text,uuid) to service_role;

notify pgrst, 'reload schema';
commit;
