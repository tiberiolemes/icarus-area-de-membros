begin;

drop function public.app_admin_log_csv_export(text,text,text,text,text);

create function public.app_admin_log_csv_export(
 p_entity text,p_search_filled boolean default false,p_role text default null,p_plan text default null,p_status text default null
)
returns void language plpgsql security definer set search_path='' as $$
declare actor_id uuid:=app_private.require_role(array['admin']);
begin
 if p_entity is null or p_entity not in ('profiles','orders') or p_search_filled is null
    or (p_entity='profiles' and (
     (p_role is not null and p_role not in ('admin','instructor','moderator','support','member','staff'))
     or (p_plan is not null and p_plan<>'none' and p_plan !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$')
     or (p_status is not null and p_status not in ('active','suspended'))))
    or (p_entity='orders' and (p_role is not null or p_plan is not null
     or (p_status is not null and p_status not in ('paid','pending','refunded','chargeback','expired','cancelled')))) then
  perform app_private.fail('Filtros de exportação inválidos.');
 end if;
 perform app_private.throttle(actor_id,'admin_csv_export',10);
 perform app_private.audit(actor_id,'export:csv',
  case p_entity when 'profiles' then 'member_csv' else 'order_csv' end,null,
  jsonb_strip_nulls(jsonb_build_object('busca_preenchida',p_search_filled,'papel',p_role,'plano',p_plan,'situacao',p_status))::text);
end $$;

revoke execute on function public.app_admin_log_csv_export(text,boolean,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.app_admin_log_csv_export(text,boolean,text,text,text) to authenticated;

notify pgrst,'reload schema';
commit;
