begin;

alter function public.app_export_data() set schema ica_private;
alter function ica_private.app_export_data() rename to export_data_v029;
revoke execute on function ica_private.export_data_v029() from public,anon,authenticated,service_role;

create function public.app_export_data() returns jsonb language plpgsql security definer set search_path='' as $$
declare data jsonb := ica_private.export_data_v029();
begin
 return data||jsonb_build_object('podcast_watches',coalesce((
  select jsonb_agg(jsonb_build_object('episode_id',w.episode_id) order by w.episode_id)
  from public.ica_podcast_watches w where w.user_id=auth.uid()
 ),'[]'::jsonb));
end $$;

revoke execute on function public.app_export_data() from public,anon,authenticated,service_role;
grant execute on function public.app_export_data() to authenticated;

notify pgrst,'reload schema';
commit;
