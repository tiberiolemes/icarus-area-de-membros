begin;

-- Editing a post uses the authenticated member session, not a service caller.
revoke execute on function public.app_save_post(uuid,uuid,text,text,text)
  from public,anon,service_role;
grant execute on function public.app_save_post(uuid,uuid,text,text,text) to authenticated;

notify pgrst,'reload schema';
commit;
