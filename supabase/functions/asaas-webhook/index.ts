import { clients, defaults, rpc, type Dependencies } from "../_shared/client.ts";
import { appOrigin, constantEqual, endpoint, HttpError, json } from "../_shared/http.ts";
import { asaasConfig, asaasEnvironment, minuteCache, validWebhookToken } from "../_shared/integrations.ts";
import { deliverPaidInvite, normalizeEvent, resolvePaymentEvent } from "../_shared/payment.ts";
export const createHandler = (d: Dependencies = defaults) => {
  const vault = minuteCache<Record<string, string | undefined>>();
  return endpoint(async (req) => {
    const admin = clients(d).admin;
    const requested = new URL(req.url).searchParams.get("ambiente");
    if (requested !== null && !asaasEnvironment(requested)) throw new HttpError(422, "INVALID_INPUT", "Ambiente do webhook inválido.");
    const config = await asaasConfig(d, admin, { webhookEnvironment: requested ?? undefined, readVault: vault.get });
    const secret = config.fields.webhook_token.value;
    if (!validWebhookToken(secret)) throw new HttpError(503, "CONFIGURATION_REQUIRED", "Webhook ainda não configurado.");
    const token = req.headers.get("asaas-access-token") || "";
    if (!token || token.length > 255 || !(await constantEqual(secret!, token))) throw new HttpError(401, "UNAUTHORIZED", "Notificação não autorizada.");
    const body = await json(req), event = normalizeEvent(body);
    if (!event) return { received: true, ignored: true };
    const normalized = await resolvePaymentEvent(admin, event, body, d, config.mode, config.fields.api_key.value);
    const result = await rpc(admin, "app_process_payment", { p_event: normalized });
    if (result.invite_pending) {
      const task = deliverPaidInvite(admin, normalized.order_id, appOrigin(d.env)).catch(() => ({ claimed: false, status: "pending" }));
      const runtime = (globalThis as unknown as { EdgeRuntime?: { waitUntil(task: Promise<unknown>): void } }).EdgeRuntime;
      if (d.waitUntil) d.waitUntil(task); else runtime?.waitUntil(task);
    }
    // Payment is durable before acknowledgement; outbox claims/retries survive worker interruption.
    return { received: true, duplicate: Boolean(result.duplicate) };
  }, d.env);
};
export const handler = createHandler();
if (import.meta.main) Deno.serve(handler);
