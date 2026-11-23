begin;
alter table public.invitation_outbox drop constraint invitation_outbox_status_check;
alter table public.invitation_outbox add constraint invitation_outbox_status_check check(status in ('pending','sending','sent','uncertain','completed'));
alter table public.invitation_outbox add column attempts integer not null default 0 check(attempts>=0),add column next_attempt_at timestamptz not null default now(),add column claim_id uuid,add column claimed_until timestamptz,add column sent_at timestamptz;
create index invitation_outbox_due on public.invitation_outbox(next_attempt_at,created_at) where status='pending';

create or replace function public.app_payment_outbox(p_order_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('invite_pending',o.status='paid' and o.finalized_at is null and x.status='pending' and x.next_attempt_at<=now(),
 'invite_email',case when o.status='paid' and o.finalized_at is null and x.status in ('pending','sending','uncertain') then o.buyer_data->>'email' end,
 'status',x.status,'claim_id',x.claim_id,'attempts',x.attempts,'retry_at',case when x.status='pending' then x.next_attempt_at end,'claimed_until',x.claimed_until,'sent_at',x.sent_at,'reconciliation_required',x.status='uncertain')
 from public.orders o left join public.invitation_outbox x on x.order_id=o.id where o.id=p_order_id
$$;
revoke execute on function public.app_payment_outbox(uuid) from public,anon,authenticated;
grant execute on function public.app_payment_outbox(uuid) to service_role;

create function public.app_claim_payment_invite(p_order_id uuid,p_claim_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.orders;x public.invitation_outbox;finalized jsonb;native_invited_at timestamptz;begin
 if p_claim_id is null then perform app_private.fail('Identificador de tentativa inválido.');end if;
 select * into o from public.orders where id=p_order_id for update;
 if not found then perform app_private.fail('Pedido indisponível.');end if;
 if o.status<>'paid' or o.finalized_at is not null then
  update public.invitation_outbox set status='completed',completed_at=coalesce(completed_at,now()) where order_id=o.id;
  return jsonb_build_object('claimed',false,'order_id',o.id,'status','completed','reason','payment_not_eligible');
 end if;
 finalized:=app_private.finalize_order(o.id);
 if (finalized->>'finalized')::boolean then return jsonb_build_object('claimed',false,'order_id',o.id,'status','completed','reason','already_finalized');end if;
 insert into public.invitation_outbox(order_id) values(o.id) on conflict do nothing;
 select * into x from public.invitation_outbox where order_id=o.id for update;
 if x.status in ('completed','sent') then return jsonb_build_object('claimed',false,'order_id',o.id,'status',x.status,'reason','already_processed');end if;
 if x.status='sending' and x.claimed_until>now() then return jsonb_build_object('claimed',false,'order_id',o.id,'status',x.status,'reason','in_progress');end if;
 -- A persisted native invitation is proof to reuse its flow, never a reason to resend.
 select max(invited_at) into native_invited_at from auth.users where lower(email)=lower(o.buyer_data->>'email') and invited_at is not null;
 if native_invited_at is not null then
  update public.invitation_outbox set status='sent',sent_at=coalesce(sent_at,native_invited_at),claimed_until=null where order_id=o.id;
  return jsonb_build_object('claimed',false,'order_id',o.id,'status','sent','reason','native_invite_exists');
 end if;
 -- An expired send lease is ambiguous: automatically resending can duplicate an email.
 if x.status in ('sending','uncertain') then
  update public.invitation_outbox set status='uncertain',claimed_until=null where order_id=o.id;
  return jsonb_build_object('claimed',false,'order_id',o.id,'status','uncertain','reason','reconciliation_required');
 end if;
 if x.next_attempt_at>now() then return jsonb_build_object('claimed',false,'order_id',o.id,'status','pending','reason','retry_not_due');end if;
 update public.invitation_outbox set status='sending',attempts=attempts+1,claim_id=p_claim_id,claimed_until=now()+interval '5 minutes' where order_id=o.id returning * into x;
 return jsonb_build_object('claimed',true,'claim_id',x.claim_id,'order_id',o.id,'invite_email',o.buyer_data->>'email','attempts',x.attempts,'status','sending','claimed_until',x.claimed_until);
end $$;
revoke execute on function public.app_claim_payment_invite(uuid,uuid) from public,anon,authenticated;
grant execute on function public.app_claim_payment_invite(uuid,uuid) to service_role;

create function public.app_finish_payment_invite(p_order_id uuid,p_claim_id uuid,p_success boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.orders;x public.invitation_outbox;retry_at timestamptz;state text;begin
 select * into o from public.orders where id=p_order_id for update;
 if not found then perform app_private.fail('Pedido indisponível.');end if;
 select * into x from public.invitation_outbox where order_id=o.id for update;
 if not found or p_claim_id is null or x.claim_id is distinct from p_claim_id then perform app_private.fail('Tentativa de convite inválida.');end if;
 if x.status='completed' or o.status<>'paid' or o.finalized_at is not null then
  update public.invitation_outbox set status='completed',completed_at=coalesce(completed_at,now()) where order_id=o.id;
  return jsonb_build_object('status','completed','retry_at',null);
 end if;
 if x.status='sent' then return jsonb_build_object('status','sent','retry_at',null);end if;
 if x.status not in ('sending','uncertain') then perform app_private.fail('Tentativa de convite já encerrada.');end if;
 if p_success is true then
  state:='sent';update public.invitation_outbox set status=state,sent_at=coalesce(sent_at,now()),claimed_until=null where order_id=o.id;
 elsif p_success is false then
  state:='pending';retry_at:=now()+make_interval(secs=>least(3600,30*power(2,least(greatest(x.attempts-1,0),7)))::integer);
  update public.invitation_outbox set status=state,next_attempt_at=retry_at,claim_id=null,claimed_until=null where order_id=o.id;
 else
  state:='uncertain';update public.invitation_outbox set status=state,claimed_until=null where order_id=o.id;
 end if;
 perform app_private.audit(null,'invite:'||state,'orders',o.id);
 return jsonb_build_object('status',state,'retry_at',retry_at,'reconciliation_required',state='uncertain');
end $$;
revoke execute on function public.app_finish_payment_invite(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.app_finish_payment_invite(uuid,uuid,boolean) to service_role;

create function public.app_payment_invites_due(p_limit integer default 20) returns jsonb language plpgsql stable security definer set search_path='' as $$ begin
 if p_limit is null or p_limit not between 1 and 20 then perform app_private.fail('Limite de convites inválido.');end if;
 return jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object('order_id',q.order_id) order by q.created_at,q.order_id) from(
  select x.order_id,x.created_at from public.invitation_outbox x join public.orders o on o.id=x.order_id where o.status='paid' and o.finalized_at is null and ((x.status='pending' and x.next_attempt_at<=now()) or (x.status='sending' and x.claimed_until<=now())) order by x.created_at,x.order_id limit p_limit)q),'[]'::jsonb));
end $$;
revoke execute on function public.app_payment_invites_due(integer) from public,anon,authenticated;
grant execute on function public.app_payment_invites_due(integer) to service_role;
create or replace function public.app_process_payment(p_event jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.orders;eid text:=p_event->>'id';kind text:=p_event->>'type';old_event public.payment_events;final jsonb;begin
 perform app_private.validate_keys(p_event,array['id','type','order_id','gateway_id','amount_cents','method']);
 if eid is null or length(eid) not between 3 and 200 or kind is null or kind not in ('paid','refunded','chargeback','expired','cancelled') or not(p_event ?& array['order_id','gateway_id','amount_cents','method']) then perform app_private.fail('Evento de pagamento inválido.');end if;
 select * into o from public.orders where id=(p_event->>'order_id')::uuid for update;
 if not found or o.gateway_id is null or o.gateway_id is distinct from p_event->>'gateway_id' or o.amount_cents is distinct from (p_event->>'amount_cents')::integer or o.method is distinct from p_event->>'method' then perform app_private.fail('Evento não corresponde ao pedido.');end if;
 select * into old_event from public.payment_events where id=eid;
 if found then
  if old_event.order_id<>o.id or old_event.event_type<>kind then perform app_private.fail('Evento já utilizado.');end if;
  return jsonb_build_object('order_id',o.id,'status',o.status,'duplicate',true,'invite_pending',false);
 end if;
 insert into public.payment_events(id,order_id,event_type) values(eid,o.id,kind);
 if kind='paid' and o.status in ('pending','paid') then
  update public.orders set status='paid',paid_at=coalesce(paid_at,now()) where id=o.id;
  insert into public.invitation_outbox(order_id) values(o.id) on conflict do nothing;
  final:=app_private.finalize_order(o.id,o.user_id);
 elsif kind in ('refunded','chargeback') then
  update public.orders set status=case when status='chargeback' then status else kind end where id=o.id;
  update public.subscriptions set revoked_at=coalesce(revoked_at,now()) where order_id=o.id;
  update public.invitation_outbox set status='completed',completed_at=now() where order_id=o.id;
 elsif kind in ('expired','cancelled') and o.status='pending' then update public.orders set status=kind where id=o.id;
 end if;
 perform app_private.audit(null,'payment:'||kind,'orders',o.id);
 select * into o from public.orders where id=o.id;
 return jsonb_build_object('order_id',o.id,'status',o.status,'duplicate',false,'invite_pending',coalesce((public.app_payment_outbox(o.id)->>'invite_pending')::boolean,false),'invite_email',public.app_payment_outbox(o.id)->>'invite_email');
end $$;
revoke execute on function public.app_process_payment(jsonb) from public,anon,authenticated;
grant execute on function public.app_process_payment(jsonb) to service_role;
notify pgrst,'reload schema';
commit;
