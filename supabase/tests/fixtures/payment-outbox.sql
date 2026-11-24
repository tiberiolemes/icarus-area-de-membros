-- LOCAL ONLY. Caller asserts project icarus-courses-local/DB58522 and enables
-- ica_private.local_demo_guard by privileged SQL, disabling it in finally.
-- psql -v fixture_email=<synthetic>@example.test -f this-file
\set ON_ERROR_STOP on
\if :{?fixture_email}
\else
\warn 'fixture_email é obrigatório e deve usar example.test'
\quit 2
\endif
begin;
select set_config('icarus.fixture_email',:'fixture_email',true) as fixture_configured \gset
do $$
declare buyer_email text:=current_setting('icarus.fixture_email');oid uuid:=gen_random_uuid();gateway uuid:=gen_random_uuid();p public.ica_plans;begin
 if not exists(select 1 from ica_private.local_demo_guard where singleton and enabled) then perform ica_private.fail('Fixture local desabilitada.');end if;
 if buyer_email !~ '^[A-Za-z0-9._+-]+@example\.test$' or length(buyer_email)>200 then perform ica_private.fail('Use somente email sintético example.test.');end if;
 select * into p from public.ica_plans where id='d0000000-0000-4000-8000-000000000009' and slug='demonstracao-local' and name like 'DEMONSTRAÇÃO%' and price_cents>0;
 if not found then perform ica_private.fail('Execute o bootstrap de demonstração antes da fixture.');end if;
 insert into public.ica_orders(id,plan_id,attempt_key,amount_cents,access_months,method,installments,buyer_data,receipt_hash,gateway_id)
 values(oid,p.id,'local-outbox-fixture-'||oid::text,p.price_cents,p.access_months,'PIX',1,jsonb_build_object('name','DEMONSTRAÇÃO outbox local','email',lower(buyer_email),'document','00000000000'),encode(extensions.gen_random_bytes(32),'hex'),gateway::text);
 perform set_config('icarus.fixture_order_id',oid::text,true);
end $$;
select id as order_id,gateway_id,amount_cents,amount_cents/100.0 as value,method from public.ica_orders where id=current_setting('icarus.fixture_order_id')::uuid;
commit;
-- This is a pending synthetic order, not a charge or accepted legal policy.
-- Normal webhook/app_process_payment is responsible for paid + durable outbox.
