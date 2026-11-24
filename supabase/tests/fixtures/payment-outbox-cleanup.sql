-- Deletes only the exact local SQL fixture and its financial relations.
-- Native Auth accounts are preserved; this script never deletes users or sessions.
\set ON_ERROR_STOP on
\if :{?fixture_order_id}
\else
\warn 'fixture_order_id é obrigatório'
\quit 2
\endif
begin;
select set_config('icarus.fixture_order_id',:'fixture_order_id',true) as fixture_configured \gset
do $$
declare oid uuid:=current_setting('icarus.fixture_order_id')::uuid;begin
 if not exists(select 1 from ica_private.local_demo_guard where singleton and enabled) then perform ica_private.fail('Limpeza local desabilitada.');end if;
 perform 1 from public.ica_orders where id=oid and attempt_key='local-outbox-fixture-'||oid::text and plan_id='d0000000-0000-4000-8000-000000000009' and buyer_data->>'name'='DEMONSTRAÇÃO outbox local' and buyer_data->>'email' like '%@example.test' for update;
 if not found then perform ica_private.fail('Pedido não é a fixture local esperada.');end if;
 delete from public.ica_subscriptions where order_id=oid;
 delete from public.ica_legal_acceptances where order_id=oid;
 delete from public.ica_payment_events where order_id=oid;
 delete from public.ica_invitation_outbox where order_id=oid;
 delete from public.ica_audit_events where target_type='orders' and target_id=oid;
 delete from public.ica_orders where id=oid;
end $$;
commit;
