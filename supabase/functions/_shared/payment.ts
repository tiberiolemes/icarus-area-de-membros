import type { SupabaseClient } from "npm:@supabase/supabase-js@2.119.2";
import { rpc, type Dependencies } from "./client.ts";
import { HttpError, text, uuid } from "./http.ts";
import { asaasEndpoints, asaasHeaders, type AsaasEnvironment } from "./integrations.ts";
type ObjectValue = Record<string, unknown>;
export function cents(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || Math.abs(value * 100 - Math.round(value * 100)) > 0.00001 || !Number.isSafeInteger(Math.round(value * 100))) throw new HttpError(422, "INVALID_AMOUNT", "Valor de pagamento inválido.");
  return Math.round(value * 100);
}
export function normalizeEvent(body: ObjectValue) {
  const id = text(body.id, 200), event = text(body.event, 80);
  const types: Record<string, string> = { CHECKOUT_PAID: "paid", CHECKOUT_CANCELED: "cancelled", CHECKOUT_EXPIRED: "expired", PAYMENT_CONFIRMED: "paid", PAYMENT_RECEIVED: "paid", PAYMENT_REFUNDED: "refunded", PAYMENT_PARTIALLY_REFUNDED: "refunded", PAYMENT_CHARGEBACK_REQUESTED: "chargeback", PAYMENT_CHARGEBACK_DISPUTE: "chargeback", PAYMENT_OVERDUE: "expired", PAYMENT_DELETED: "cancelled" };
  if (!types[event]) return null;
  if (event.startsWith("CHECKOUT_")) {
    const checkout = body.checkout as ObjectValue;
    if (!checkout || !Array.isArray(checkout.items) || checkout.items.length !== 1 || !Array.isArray(checkout.billingTypes) || checkout.billingTypes.length !== 1) throw new HttpError(422, "INVALID_EVENT", "Evento incompatível com o pedido.");
    const item = checkout.items[0] as ObjectValue;
    if (item.quantity !== 1) throw new HttpError(422, "INVALID_EVENT", "Evento incompatível com o pedido.");
    return { id, type: types[event], order_id: checkout.externalReference ? uuid(checkout.externalReference) : null, gateway_id: uuid(checkout.id), amount_cents: cents(item.value), method: text(checkout.billingTypes[0], 32) };
  }
  const payment = body.payment as ObjectValue;
  if (!payment) throw new HttpError(422, "INVALID_EVENT", "Evento de pagamento inválido.");
  // A payment id is never silently treated as a checkout id; DB must match its stored gateway link.
  if (types[event] === "paid" || types[event] === "expired" || types[event] === "cancelled") return null;
  return { id, type: types[event], order_id: uuid(payment.externalReference), gateway_id: text(payment.id, 100), amount_cents: cents(payment.value), method: text(payment.billingType, 32) };
}
export async function resolvePaymentEvent(admin: SupabaseClient, event: NonNullable<ReturnType<typeof normalizeEvent>>, body: ObjectValue, d: Dependencies, mode: AsaasEnvironment, apiKey?: string) {
  const context = await rpc(admin, "app_payment_context", { p_order_id: event.order_id, p_gateway_id: body.checkout ? event.gateway_id : null });
  if (!context?.order_id || !context.gateway_id) throw new HttpError(409, "RECONCILIATION_REQUIRED", "Vínculo de pagamento ainda não confirmado.");
  if (context.asaas_environment !== mode) throw new HttpError(409, "RECONCILIATION_REQUIRED", "Notificação de outro ambiente de pagamento.");
  if (body.checkout && context.gateway_id !== event.gateway_id) throw new HttpError(409, "RECONCILIATION_REQUIRED", "Checkout não corresponde ao pedido.");
  const forOrder = { ...event, order_id: uuid(context.order_id), gateway_id: text(context.gateway_id, 100) };
  if (!body.payment && event.type !== "paid") return forOrder;
  if (!apiKey) throw new HttpError(503, "CONFIGURATION_REQUIRED", "Reconciliação ainda não configurada.");
  const url = new URL(`${asaasEndpoints[mode].api}/payments`);
  url.searchParams.set("checkoutSession", context.gateway_id); url.searchParams.set("limit", "100");
  const result = await d.fetch(url, { headers: asaasHeaders(apiKey), redirect: "error", signal: AbortSignal.timeout(10_000) });
  if (!result.ok) throw new HttpError(503, "RECONCILIATION_REQUIRED", "Conciliação de pagamento pendente.");
  const payments = await result.json();
  if (payments.hasMore || !Array.isArray(payments.data) || payments.data.length < 1 || payments.data.length > 12) throw new HttpError(409, "RECONCILIATION_REQUIRED", "Conciliação de pagamento pendente.");
  if (payments.data.some((p: ObjectValue) => p.billingType !== event.method)) throw new HttpError(409, "RECONCILIATION_REQUIRED", "Conciliação de pagamento pendente.");
  const amount = payments.data.reduce((sum: number, p: ObjectValue) => sum + cents(p.value), 0);
  if (event.type === "paid") {
    if (amount !== event.amount_cents || payments.data.some((p: ObjectValue) => p.status !== "CONFIRMED" && p.status !== "RECEIVED")) {
      throw new HttpError(409, "RECONCILIATION_REQUIRED", "O Asaas ainda não confirmou o pagamento deste pedido.");
    }
  } else {
    const actual = payments.data.find((p: ObjectValue) => p.id === event.gateway_id);
    if (!actual || cents(actual.value) !== event.amount_cents) throw new HttpError(409, "RECONCILIATION_REQUIRED", "Conciliação de pagamento pendente.");
  }
  return { ...forOrder, amount_cents: amount };
}
export async function finishPaidOrder(admin: SupabaseClient, orderId: string, email: string, origin: string) {
  const existing = await rpc(admin, "app_finalize_paid_order", { p_order_id: orderId, p_actor_id: null });
  if (existing.finalized) return { pending: false, delivery: "completed" as const };
  // Only Admin API writes app_metadata; no password is supplied or exposed, and email stays unconfirmed.
  const created = await admin.auth.admin.createUser({ email, email_confirm: false, app_metadata: { icarus_server_created: true, icarus_password_setup_required: true } });
  if (created.error && !["email_exists", "user_already_exists"].includes(created.error.code || "")) return { pending: true, delivery: "retry" as const };
  const invited = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: new URL("/auth/callback", origin).href });
  if (invited.error || !invited.data.user) return { pending: true, delivery: invited.error?.status && invited.error.status >= 400 && invited.error.status < 500 ? "retry" as const : "uncertain" as const };
  const finished = await rpc(admin, "app_finalize_paid_order", { p_order_id: orderId, p_actor_id: invited.data.user.id }).catch(() => null);
  return { pending: !finished?.finalized, delivery: "sent" as const };
}
export async function deliverPaidInvite(admin: SupabaseClient, orderId: string, origin: string) {
  const claimId = crypto.randomUUID();
  const claim = await rpc(admin, "app_claim_payment_invite", { p_order_id: orderId, p_claim_id: claimId });
  if (!claim?.claimed) return { claimed: false, status: claim?.reason || "unavailable" };
  let success: boolean | null = null;
  try {
    const result = await finishPaidOrder(admin, orderId, text(claim.invite_email, 254), origin);
    success = result.delivery === "uncertain" ? null : result.delivery !== "retry";
  } catch { success = null; }
  const result = await rpc(admin, "app_finish_payment_invite", { p_order_id: orderId, p_claim_id: claimId, p_success: success });
  return { claimed: true, status: result.status };
}
