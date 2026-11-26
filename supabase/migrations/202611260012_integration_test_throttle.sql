begin;

create function public.app_admin_integration_test_throttle(p_actor_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare
 headers jsonb:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
begin
 perform app_private.authorize_integration(p_actor_id,null,false);
 if headers->>'x-icarus-aal' is distinct from 'aal2' or not app_private.requires_aal2(p_actor_id) then
  raise insufficient_privilege using message='Confirme o segundo fator para testar a integração.';
 end if;
 begin
  perform app_private.throttle(p_actor_id,'integration_test',10);
 exception when sqlstate 'P0001' then
  raise sqlstate 'PT429' using message='Muitas tentativas. Aguarde um minuto e tente novamente.';
 end;
end $$;

revoke execute on function public.app_admin_integration_test_throttle(uuid) from public,anon,authenticated,service_role;
grant execute on function public.app_admin_integration_test_throttle(uuid) to service_role;

commit;
