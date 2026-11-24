begin;
create function ica_private.requires_aal2(p_actor uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.ica_profiles where id=p_actor and role<>'member') or exists(select 1 from auth.mfa_factors where user_id=p_actor and status='verified')
$$;
create or replace function ica_private.actor(p_allow_aal1 boolean default false) returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();sid uuid;p public.ica_profiles;s public.ica_app_sessions;idle interval;needs_aal2 boolean;begin
 if u is null then perform ica_private.fail('Sessão inválida. Entre novamente.');end if;
 sid:=nullif(auth.jwt()->>'session_id','')::uuid;
 select * into p from public.ica_profiles where id=u;
 if not found or p.suspended then perform ica_private.fail('Acesso indisponível.');end if;
 if p.password_setup_required and not p_allow_aal1 then perform ica_private.fail('Defina sua senha para acessar o conteúdo.');end if;
 needs_aal2:=ica_private.requires_aal2(u);
 if sid is null or not exists(select 1 from auth.sessions where id=sid and user_id=u and (not_after is null or not_after>now()) and (p_allow_aal1 or not needs_aal2 or auth.sessions.aal='aal2')) then perform ica_private.fail('Sessão inválida ou segundo fator pendente.');end if;
 idle:=case when p.role='member' then interval '2 hours' else interval '30 minutes' end;
 insert into public.ica_app_sessions(id,user_id,expires_at) values(sid,u,now()+idle) on conflict(id) do nothing;
 select * into s from public.ica_app_sessions where id=sid and user_id=u for update;
 if not found or s.revoked_at is not null or least(s.expires_at,s.last_activity_at+idle)<=now() then perform ica_private.fail('Sessão expirada. Entre novamente.');end if;
 if needs_aal2 and not p_allow_aal1 and coalesce(auth.jwt()->>'aal','aal1')<>'aal2' then perform ica_private.fail('Confirme o segundo fator para continuar.');end if;
 return u;
end $$;
create or replace function ica_private.service_session(p_actor uuid,p_allow_setup boolean default false) returns void language plpgsql stable security definer set search_path='' as $$
declare headers jsonb:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;sid uuid;session_aal text;needs_aal2 boolean;begin
 begin sid:=nullif(headers->>'x-icarus-session-id','')::uuid;exception when invalid_text_representation then perform ica_private.fail('Sessão inválida.');end;
 session_aal:=headers->>'x-icarus-aal';needs_aal2:=ica_private.requires_aal2(p_actor);
 if p_actor is null or sid is null or session_aal is null or session_aal not in ('aal1','aal2') or not exists(
  select 1 from public.ica_profiles p join public.ica_app_sessions a on a.user_id=p.id join auth.sessions s on s.id=a.id and s.user_id=p.id
  where p.id=p_actor and not p.suspended and (p_allow_setup or not p.password_setup_required) and a.id=sid and a.revoked_at is null and a.expires_at>now()
  and a.last_activity_at+case when p.role='member' then interval '2 hours' else interval '30 minutes' end>now()
  and (s.not_after is null or s.not_after>now()) and (p_allow_setup or not needs_aal2 or (session_aal='aal2' and s.aal='aal2'))
 ) then perform ica_private.fail('Sessão inválida, segundo fator ou configuração de senha pendente.');end if;
end $$;
revoke execute on function ica_private.requires_aal2(uuid),ica_private.actor(boolean),ica_private.service_session(uuid,boolean) from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
