import { clients, defaults, rpc, type Dependencies } from "../_shared/client.ts";
import { constantEqual, endpoint, HttpError, json, required } from "../_shared/http.ts";
import { deliverPaidInvite, normalizeEvent, resolvePaymentEvent } from "../_shared/payment.ts";
export const createHandler = (d: Dependencies = defaults) => endpoint(async (req) => {
  const [secret] = required(d.env, "ASAAS_WEBHOOK_TOKEN");
  if (secret.length < 32 || secret.length > 255 || /\s/.test(secret)) throw new HttpError(503, "CONFIGURATION_REQUIRED", "Webhook ainda não configurado.");
  const token = req.headers.get("asaas-access-token") || "";
  if (!token || token.length > 255 || !(await constantEqual(secret, token))) throw new HttpError(401, "UNAUTHORIZED", "Notificação não autorizada.");
  const body = await json(req), event = normalizeEvent(body);
  if (!event) return { received: true, ignored: true };
  const admin = clients(d).admin;
  const normalized = await resolvePaymentEvent(admin, event, body, d);
  const result = await rpc(admin, "app_process_payment", { p_event: normalized });
  if (result.invite_pending) {
    const task = deliverPaidInvite(admin, normalized.order_id, d.env("APP_ORIGIN") || "http://127.0.0.1:8088").catch(() => ({ claimed: false, status: "pending" }));
    const runtime = (globalThis as unknown as { EdgeRuntime?: { waitUntil(task: Promise<unknown>): void } }).EdgeRuntime;
    if (d.waitUntil) d.waitUntil(task); else runtime?.waitUntil(task);
  }
  // Payment is durable before acknowledgement; outbox claims/retries survive worker interruption.
  return { received: true, duplicate: Boolean(result.duplicate) };
}, d.env);
export const handler = createHandler();
if (import.meta.main) Deno.serve(handler);
