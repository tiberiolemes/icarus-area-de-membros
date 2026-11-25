begin;
-- "Lembrar por 15 dias": a sessão marcada logo depois do código deixa de cair por inatividade
-- e termina em remember_until, fixado 15 dias após o login. O AAL2 continua exigido como antes.
alter table public.app_sessions add column remember_until timestamptz;

create or replace function app_private.actor(p_allow_aal1 boolean default false) returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();sid uuid;p public.profiles;s public.app_sessions;idle interval;needs_aal2 boolean;begin
 if u is null then perform app_private.fail('Sessão inválida. Entre novamente.');end if;
 sid:=nullif(auth.jwt()->>'session_id','')::uuid;
 select * into p from public.profiles where id=u;
 if not found or p.suspended then perform app_private.fail('Acesso indisponível.');end if;
 if p.password_setup_required and not p_allow_aal1 then perform app_private.fail('Defina sua senha para acessar o conteúdo.');end if;
 needs_aal2:=app_private.requires_aal2(u);
 if sid is null or not exists(select 1 from auth.sessions where id=sid and user_id=u and (not_after is null or not_after>now()) and (p_allow_aal1 or not needs_aal2 or auth.sessions.aal='aal2')) then perform app_private.fail('Sessão inválida ou segundo fator pendente.');end if;
 idle:=case when p.role='member' then interval '2 hours' else interval '30 minutes' end;
 insert into public.app_sessions(id,user_id,expires_at) values(sid,u,now()+idle) on conflict(id) do nothing;
 select * into s from public.app_sessions where id=sid and user_id=u for update;
 if not found or s.revoked_at is not null or least(s.expires_at,coalesce(s.remember_until,s.last_activity_at+idle))<=now() then perform app_private.fail('Sessão expirada. Entre novamente.');end if;
 if needs_aal2 and not p_allow_aal1 and coalesce(auth.jwt()->>'aal','aal1')<>'aal2' then perform app_private.fail('Confirme o segundo fator para continuar.');end if;
 return u;
end $$;

create or replace function app_private.service_session(p_actor uuid,p_allow_setup boolean default false) returns void language plpgsql stable security definer set search_path='' as $$
declare headers jsonb:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;sid uuid;session_aal text;needs_aal2 boolean;begin
 begin sid:=nullif(headers->>'x-icarus-session-id','')::uuid;exception when invalid_text_representation then perform app_private.fail('Sessão inválida.');end;
 session_aal:=headers->>'x-icarus-aal';needs_aal2:=app_private.requires_aal2(p_actor);
 if p_actor is null or sid is null or session_aal is null or session_aal not in ('aal1','aal2') or not exists(
  select 1 from public.profiles p join public.app_sessions a on a.user_id=p.id join auth.sessions s on s.id=a.id and s.user_id=p.id
  where p.id=p_actor and not p.suspended and (p_allow_setup or not p.password_setup_required) and a.id=sid and a.revoked_at is null and a.expires_at>now()
  and coalesce(a.remember_until,a.last_activity_at+case when p.role='member' then interval '2 hours' else interval '30 minutes' end)>now()
  and (s.not_after is null or s.not_after>now()) and (p_allow_setup or not needs_aal2 or (session_aal='aal2' and s.aal='aal2'))
 ) then perform app_private.fail('Sessão inválida, segundo fator ou configuração de senha pendente.');end if;
end $$;
revoke execute on function app_private.actor(boolean),app_private.service_session(uuid,boolean) from public,anon,authenticated;

create or replace function public.app_touch_session(p_activity boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.actor(true);sid uuid:=(auth.jwt()->>'session_id')::uuid;s public.app_sessions;begin
 if p_activity then update public.app_sessions set last_activity_at=now(),expires_at=coalesce(remember_until,now()+case when (select role from public.profiles where id=u)='member' then interval '2 hours' else interval '30 minutes' end) where id=sid and expires_at>now() and revoked_at is null;end if;
 select * into s from public.app_sessions where id=sid;
 return jsonb_build_object('expires_at',s.expires_at,'warning_seconds',60,'remembered',s.remember_until is not null);
end $$;
revoke execute on function public.app_touch_session(boolean) from public,anon;grant execute on function public.app_touch_session(boolean) to authenticated;

create function public.app_remember_session() returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.actor();sid uuid:=(auth.jwt()->>'session_id')::uuid;until timestamptz;begin
 -- Só logo depois do código: sessão AAL2 com a prova TOTP desta sessão gravada pelo Auth há menos de 5 minutos.
 if coalesce(auth.jwt()->>'aal','aal1')<>'aal2' or not exists(select 1 from auth.sessions s join auth.mfa_amr_claims c on c.session_id=s.id
  where s.id=sid and s.user_id=u and s.aal='aal2' and c.authentication_method='totp' and c.updated_at>now()-interval '5 minutes')
 then perform app_private.fail('Confirme o código do autenticador para manter este navegador conectado.');end if;
 -- O limite conta do login e não é refeito: um código novo na mesma sessão não prolonga.
 update public.app_sessions a set remember_until=s.created_at+interval '15 days',expires_at=s.created_at+interval '15 days'
  from auth.sessions s where a.id=sid and a.user_id=u and s.id=a.id and a.remember_until is null and s.created_at+interval '15 days'>now();
 select remember_until into until from public.app_sessions where id=sid and user_id=u;
 if until is null then perform app_private.fail('Entre novamente para manter este navegador conectado.');end if;
 return jsonb_build_object('expires_at',until);
end $$;
revoke execute on function public.app_remember_session() from public,anon;grant execute on function public.app_remember_session() to authenticated;
notify pgrst,'reload schema';
commit;
