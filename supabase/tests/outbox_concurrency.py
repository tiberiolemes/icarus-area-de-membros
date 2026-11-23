"""Finite Icarus local/isolated-QA race check; cleans its own synthetic order/plan."""
from concurrent.futures import ThreadPoolExecutor
import os
import subprocess
import threading
import uuid

db_container = os.environ.get("ICARUS_DB_CONTAINER", "supabase_db_icarus-courses-local")
if db_container not in ("supabase_db_icarus-courses-local", "supabase_db_icarus-courses-install-qa"):
    raise SystemExit("Only the exact Icarus local or isolated-QA database container is allowed")


def sql(statement):
    result = subprocess.run(
        ["docker", "exec", "-i", db_container, "psql", "-X", "-qAt", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"],
        input=statement, text=True, capture_output=True, timeout=15,
    )
    if result.returncode:
        raise RuntimeError(f"Local SQL test failed (exit {result.returncode}); no credentials printed")
    return [line for line in result.stdout.splitlines() if line]


plan, order, gateway = (str(uuid.uuid4()) for _ in range(3))
claims = [str(uuid.uuid4()), str(uuid.uuid4())]
barrier = threading.Barrier(2)
created = False
try:
    assert sql("select exists(select 1 from pg_namespace where nspname='app_private')") == ["t"]
    sql(f"""begin;
      insert into public.plans(id,name,slug,price_cents,access_months)
      values('{plan}','DEMONSTRAÇÃO corrida outbox','demo-race-{plan}',10000,12);
      insert into public.orders(id,plan_id,attempt_key,amount_cents,access_months,method,installments,buyer_data,receipt_hash,gateway_id,status,paid_at)
      values('{order}','{plan}','demo-outbox-race-{order}',10000,12,'PIX',1,
      jsonb_build_object('name','DEMONSTRAÇÃO corrida','email','outbox-race-{order}@example.test'),repeat('a',64),'{gateway}','paid',now());
      insert into public.invitation_outbox(order_id) values('{order}');
      commit;""")
    created = True

    def compete(claim):
        barrier.wait(timeout=5)
        lines = sql(f"""begin;
          set local role service_role;
          select public.app_claim_payment_invite('{order}','{claim}')->>'claimed';
          select pg_sleep(0.3);
          commit;""")
        return claim, lines[0]

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(compete, claims))
    assert sorted(result for _, result in results) == ["false", "true"], "Exactly one transaction may claim"
    winner = next(claim for claim, result in results if result == "true")
    assert sql(f"set role service_role; select public.app_finish_payment_invite('{order}','{winner}',true)->>'status'") == ["sent"]
    assert sql(f"set role service_role; select public.app_claim_payment_invite('{order}','{uuid.uuid4()}')->>'claimed'") == ["false"]
    assert sql(f"select status='paid' and finalized_at is null and not exists(select 1 from public.subscriptions where order_id='{order}') from public.orders where id='{order}'") == ["t"]
    print("outbox_concurrency: 4 assertions passed across two concurrent database sessions")
finally:
    if created:
        sql(f"""begin;
          delete from public.audit_events where target_type='orders' and target_id='{order}';
          delete from public.invitation_outbox where order_id='{order}';
          delete from public.orders where id='{order}' and attempt_key='demo-outbox-race-{order}';
          delete from public.plans where id='{plan}' and slug='demo-race-{plan}';
          commit;""")
