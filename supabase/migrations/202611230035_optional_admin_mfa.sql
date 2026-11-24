begin;

-- The shared actor checks the role and session, including MFA when a factor is verified.
create or replace function ica_private.admin_reporting_actor()
returns uuid language sql security definer set search_path='' as $$
  select ica_private.require_role(array['admin'])
$$;

create or replace function ica_private.feedback_admin()
returns uuid language sql security definer set search_path='' as $$
  select ica_private.require_role(array['admin'])
$$;

create or replace function public.app_feedback_screenshot_access(p_actor_id uuid,p_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare object_path text;
begin
  perform ica_private.service_actor(p_actor_id);
  select x.path into object_path from public.ica_feedbacks f join public.ica_uploads x on x.id=f.screenshot_id
  where x.id=p_id and x.kind='feedback-screenshot' and x.state='ready' and x.actor_id=f.author_id
    and (f.author_id=p_actor_id or ica_private.is_staff(p_actor_id,array['admin']));
  if not found then raise insufficient_privilege using message='Print indisponível.'; end if;
  return jsonb_build_object('storage_path',object_path,'can_access',true);
end $$;

drop function ica_private.feedback_aal2(uuid,uuid,text);
revoke execute on function ica_private.admin_reporting_actor(),ica_private.feedback_admin()
  from public,anon,authenticated,service_role;
revoke execute on function public.app_feedback_screenshot_access(uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.app_feedback_screenshot_access(uuid,uuid) to service_role;

notify pgrst,'reload schema';
commit;
