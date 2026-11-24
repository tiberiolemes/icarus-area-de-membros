begin;
-- Only service-role RPCs reach this helper. Edge derives these headers from a verified JWT.
create or replace function ica_private.service_actor(p_actor uuid) returns void language plpgsql stable security definer set search_path='' as $$
declare headers jsonb:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;sid uuid;session_aal text;begin
 begin sid:=nullif(headers->>'x-icarus-session-id','')::uuid;exception when invalid_text_representation then perform ica_private.fail('Sessão inválida.');end;
 session_aal:=headers->>'x-icarus-aal';
 if p_actor is null or sid is null or session_aal is null or session_aal not in ('aal1','aal2') or not exists(
  select 1 from public.ica_profiles p join public.ica_app_sessions a on a.user_id=p.id join auth.sessions s on s.id=a.id and s.user_id=p.id
  where p.id=p_actor and not p.suspended and a.id=sid and a.revoked_at is null and a.expires_at>now()
  and a.last_activity_at+case when p.role='member' then interval '2 hours' else interval '30 minutes' end>now()
  and (s.not_after is null or s.not_after>now()) and (p.role='member' or (session_aal='aal2' and s.aal='aal2'))
 ) then perform ica_private.fail('Sessão inválida ou expirada. Entre novamente.');end if;
end $$;
revoke execute on function ica_private.service_actor(uuid) from public,anon,authenticated;
create or replace function public.app_confirm_reauth(p_actor_id uuid,p_session_id uuid,p_token_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
declare expires timestamptz:=now()+interval '5 minutes';begin
 perform ica_private.service_actor(p_actor_id);
 if p_session_id is distinct from ((current_setting('request.headers',true)::jsonb)->>'x-icarus-session-id')::uuid then perform ica_private.fail('Sessão inválida.');end if;
 insert into public.ica_reauth_nonces(token_hash,actor_id,session_id,expires_at) values(p_token_hash,p_actor_id,p_session_id,expires);
 return jsonb_build_object('expires_at',expires);
end $$;
revoke execute on function public.app_confirm_reauth(uuid,uuid,text) from public,anon,authenticated;grant execute on function public.app_confirm_reauth(uuid,uuid,text) to service_role;
commit;
