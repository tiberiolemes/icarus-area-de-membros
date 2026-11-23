import { createClient } from "npm:@supabase/supabase-js@2.119.2";
import { deliverPaidInvite } from "../../supabase/functions/_shared/payment.ts";
function assert(value: unknown, message: string): asserts value { if (!value) throw Error(message); }
const url = Deno.env.get("SUPABASE_URL")!, service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const secret = Deno.env.get("ASAAS_WEBHOOK_TOKEN"), destination = Deno.env.get("ICARUS_LOCAL_WORKDIR")!;
if (url !== "http://127.0.0.1:58521" || Deno.env.get("ICARUS_MODE") !== "local" || !secret || !destination) throw Error("Ambiente HTTP local explícito necessário.");
const options = { auth: { persistSession: false, autoRefreshToken: false } }, admin = createClient(url, service, options);
async function sql(source: string, variables: string[] = []) {
  const child = new Deno.Command("docker", { args: ["exec", "-i", "supabase_db_icarus-courses-local", "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres", ...variables.flatMap((v) => ["-v", v])], stdin: "piped", stdout: "piped", stderr: "piped" }).spawn();
  const writer = child.stdin.getWriter(); await writer.write(new TextEncoder().encode(source)); await writer.close();
  const result = await child.output(); assert(result.success, "Fixture SQL local não concluiu; saída privada omitida."); return new TextDecoder().decode(result.stdout);
}
async function fixture(email: string) {
  await sql("update app_private.local_demo_guard set enabled=true where singleton;");
  try {
    const source = await Deno.readTextFile(new URL("../../supabase/tests/fixtures/payment-outbox.sql", import.meta.url));
    const line = (await sql(source, [`fixture_email=${email}`])).split("\n").find((v) => /^[a-f0-9-]{36}\|/.test(v)); assert(line, "Fixture não retornou pedido.");
    const [order_id, gateway_id, amount, value, method] = line.split("|"); return { order_id, gateway_id, amount_cents: Number(amount), value: Number(value), method };
  } finally { await sql("update app_private.local_demo_guard set enabled=false where singleton;"); }
}
async function cleanup(order: string) {
  await sql("update app_private.local_demo_guard set enabled=true where singleton;");
  try { await sql(await Deno.readTextFile(new URL("../../supabase/tests/fixtures/payment-outbox-cleanup.sql", import.meta.url)), [`fixture_order_id=${order}`]); }
  finally { await sql("update app_private.local_demo_guard set enabled=false where singleton;"); }
}
async function mailboxCount(email: string) {
  const response = await fetch("http://127.0.0.1:58524/api/v1/messages?limit=100"); assert(response.ok, "Mailpit indisponível.");
  const data = await response.json(); return data.messages.filter((m: { To: { Address: string }[] }) => m.To.some((to) => to.Address === email)).length;
}
async function state(order_id: string) { const result = await admin.rpc("app_payment_outbox", { p_order_id: order_id }); assert(!result.error, "Outbox não consultável."); return result.data; }
async function waitState(order: string, expected: string) { for (let i = 0; i < 40; i++) { const value = await state(order); if (value.status === expected) return value; await new Promise((resolve) => setTimeout(resolve, 250)); } throw Error("Estado durável não concluiu no prazo."); }
async function waitMail(email: string) { for (let i = 0; i < 40; i++) { if (await mailboxCount(email)) return; await new Promise((resolve) => setTimeout(resolve, 250)); } throw Error("Convite automático não chegou ao Mailpit."); }
Deno.test("HTTP paid webhook automatically invites; failed send retries durably without charging", async () => {
  const emailA = `auto-${crypto.randomUUID()}@example.test`, emailB = `retry-${crypto.randomUUID()}@example.test`;
  const a = await fixture(emailA), b = await fixture(emailB);
  try {
    const event = { id: `evt_local_${crypto.randomUUID()}`, event: "CHECKOUT_PAID", checkout: { id: a.gateway_id, externalReference: a.order_id, billingTypes: [a.method], items: [{ value: a.value, quantity: 1 }] } };
    const post = () => fetch(`${url}/functions/v1/asaas-webhook`, { method: "POST", headers: { "asaas-access-token": secret!, "content-type": "application/json" }, body: JSON.stringify(event) });
    const accepted = await post(); assert(accepted.status === 200, "HTTP webhook normal não persistiu."); await accepted.body?.cancel();
    await waitMail(emailA); const sent = await waitState(a.order_id, "sent"); assert(sent.status === "sent", "Convite automático não gravou sent.");
    const duplicate = await post(); assert(duplicate.status === 200, "Duplicata não foi idempotente."); await duplicate.body?.cancel();
    assert(await mailboxCount(emailA) === 1 && (await state(a.order_id)).attempts === 1, "Duplicata reenviou convite.");
    assert(!(await admin.rpc("app_process_payment", { p_event: { id: `evt_local_${crypto.randomUUID()}`, type: "paid", order_id: b.order_id, gateway_id: b.gateway_id, amount_cents: b.amount_cents, method: b.method } })).error, "Pagamento sintético B não persistiu.");
    const failing = createClient(url, service, { ...options, global: { fetch: (async (input: string | URL | Request, init?: RequestInit) => String(input).includes("/auth/v1/invite") ? new Response(JSON.stringify({ msg: "Synthetic definitive send rejection" }), { status: 429, headers: { "content-type": "application/json" } }) : await fetch(input, init)) as typeof fetch } });
    await deliverPaidInvite(failing, b.order_id, "http://127.0.0.1:8088");
    const pending = await state(b.order_id); assert(pending.status === "pending" && pending.attempts === 1, "Falha definitiva não ficou durável.");
    const wait = Math.max(0, Date.parse(pending.retry_at) - Date.now() + 200); assert(wait <= 31_000, "Backoff inesperado."); await new Promise((resolve) => setTimeout(resolve, wait));
    const retry = await fetch(`${url}/functions/v1/process-invites`, { method: "POST", headers: { authorization: `Bearer ${service}`, "content-type": "application/json" }, body: "{}" }); assert(retry.status === 200, "Worker de serviço não reprocessou lote devido."); await retry.body?.cancel();
    await waitMail(emailB); const recovered = await waitState(b.order_id, "sent"); assert(recovered.status === "sent" && recovered.attempts === 2 && await mailboxCount(emailB) === 1, "Retry não enviou exatamente o convite esperado.");
    const orders = await admin.from("orders").select("status").in("id", [a.order_id, b.order_id]); assert(!orders.error && orders.data?.every((o) => o.status === "paid"), "Retry alterou pagamento.");
    await Deno.writeTextFile(`${destination}/.local/http-outbox-evidence.json`, JSON.stringify({ passed: true, native_http_paid_to_mailpit: true, webhook_duplicate_no_resend: true, failure_injection: "Auth invite transport429 only; DB/Auth create real", durable_retry_native_worker: true, retry_attempts: 2, no_extra_charge: true, checked_at: new Date().toISOString() }, null, 2), { mode: 0o600 });
  } finally { await cleanup(a.order_id); await cleanup(b.order_id); }
});
