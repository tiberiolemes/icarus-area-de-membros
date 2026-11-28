begin;

-- Busca na biblioteca do Bunny por quem edita aula. Só a Edge (service_role) chama, antes de usar a chave do Stream.
create function public.app_staff_bunny_search_throttle(p_actor_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 perform app_private.service_actor(p_actor_id);
 if not app_private.is_staff(p_actor_id,array['admin','instructor']) then
  raise insufficient_privilege using message='Somente administradores e instrutores podem buscar vídeos do Bunny.';
 end if;
 begin
  perform app_private.throttle(p_actor_id,'bunny_search',30);
 exception when sqlstate 'P0001' then
  raise sqlstate 'PT429' using message='Muitas tentativas. Aguarde um minuto e tente novamente.';
 end;
end $$;

revoke execute on function public.app_staff_bunny_search_throttle(uuid) from public,anon,authenticated,service_role;
grant execute on function public.app_staff_bunny_search_throttle(uuid) to service_role;

commit;
