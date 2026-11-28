begin;

-- Consulta ao Gravatar com resposta definitiva (foto guardada ou 404); profile_json já devolve a coluna por to_jsonb(p).
alter table public.profiles add column gravatar_checked_at timestamptz;

-- Só a Edge Function chama: diz se vale consultar e com qual email.
create function public.app_gravatar_context(p_actor_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.profiles;mail text;begin
 perform app_private.service_actor(p_actor_id);perform app_private.throttle(p_actor_id,'gravatar',3);
 select * into p from public.profiles where id=p_actor_id;
 if p.avatar_id is not null or p.gravatar_checked_at is not null then return jsonb_build_object('check',false,'email',null);end if;
 select email into mail from auth.users where id=p_actor_id;
 return jsonb_build_object('check',mail is not null,'email',mail);
end $$;
revoke execute on function public.app_gravatar_context(uuid) from public,anon,authenticated,service_role;
grant execute on function public.app_gravatar_context(uuid) to service_role;

-- Perfil travado antes de finalizar: uma foto enviada no meio da consulta nunca é trocada pela do Gravatar.
create function public.app_gravatar_done(p_actor_id uuid,p_upload_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare avatar uuid;begin
 perform app_private.service_actor(p_actor_id);
 select avatar_id into avatar from public.profiles where id=p_actor_id for update;
 if p_upload_id is not null then
  if not exists(select 1 from public.uploads where id=p_upload_id and actor_id=p_actor_id and profile_id=p_actor_id and kind='avatar') then perform app_private.fail('Upload indisponível ou expirado.');end if;
  if avatar is null then perform public.app_upload_finalize(p_actor_id,p_upload_id);avatar:=p_upload_id;end if;
 end if;
 update public.profiles set gravatar_checked_at=now() where id=p_actor_id;
 return jsonb_build_object('avatar_id',avatar);
end $$;
revoke execute on function public.app_gravatar_done(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.app_gravatar_done(uuid,uuid) to service_role;

commit;
