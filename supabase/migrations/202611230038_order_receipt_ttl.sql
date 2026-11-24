begin;

create or replace function public.app_order_status(p_order_id uuid,p_actor_id uuid,p_receipt_hash text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare o record;
begin
 if p_actor_id is not null then perform app_private.service_actor(p_actor_id); end if;
 select id,status,amount_cents,finalized_at into o from public.orders where id=p_order_id and (
  (p_actor_id is not null and user_id=p_actor_id)
  or (receipt_hash=p_receipt_hash and created_at>now()-interval '2 hours')
 );
 if not found then perform app_private.fail('Pedido indisponível.'); end if;
 return jsonb_build_object('order_id',o.id,'status',o.status,'amount_cents',o.amount_cents,'access_granted',o.status='paid' and o.finalized_at is not null);
end $$;

revoke execute on function public.app_order_status(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.app_order_status(uuid,uuid,text) to service_role;

commit;
