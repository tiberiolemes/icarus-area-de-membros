begin;
-- A text-only edit keeps the current image while this UPDATE holds the row lock.
create or replace function public.app_save_post(p_id uuid,p_space_id uuid,p_title text,p_body text,p_image_path text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=ica_private.actor();id_out uuid;begin
 perform ica_private.throttle(u,'post',6);
 if not ica_private.space_access(u,p_space_id) then perform ica_private.fail('Espaço indisponível.');end if;
 if p_image_path is not null and not exists(select 1 from public.ica_uploads where path=p_image_path and actor_id=u and post_id=p_id and kind='post-image') then perform ica_private.fail('Imagem não autorizada.');end if;
 if p_id is null then
  insert into public.ica_posts(author_id,space_id,title,body,image_path) values(u,p_space_id,trim(p_title),trim(p_body),p_image_path) returning id into id_out;
 else
  update public.ica_posts set space_id=p_space_id,title=trim(p_title),body=trim(p_body),image_path=coalesce(p_image_path,image_path),status='pending',updated_at=now() where id=p_id and author_id=u and status not in ('removed','archived') returning id into id_out;
  if id_out is null then perform ica_private.fail('Publicação indisponível.');end if;
  perform ica_private.audit(u,'resubmit','posts',id_out);
 end if;
 return jsonb_build_object('id',id_out,'status','pending');
end $$;
revoke execute on function public.app_save_post(uuid,uuid,text,text,text) from public,anon;grant execute on function public.app_save_post(uuid,uuid,text,text,text) to authenticated;
notify pgrst,'reload schema';
commit;
