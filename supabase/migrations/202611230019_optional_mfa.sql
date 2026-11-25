begin;
-- MFA is chosen in account settings; a verified factor remains mandatory for every role.
create or replace function app_private.requires_aal2(p_actor uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.mfa_factors where user_id=p_actor and status='verified')
$$;
revoke execute on function app_private.requires_aal2(uuid) from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
