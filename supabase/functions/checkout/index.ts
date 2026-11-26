import { actor, clients, defaults, rpc, throttle, type Dependencies } from "../_shared/client.ts";
import { appOrigin, endpoint, HttpError, json, nonce, sha256, text, uuid } from "../_shared/http.ts";
import { asaasConfig, asaasEndpoints, asaasHeaders } from "../_shared/integrations.ts";
// Com o segredo configurado, o token do Turnstile é conferido aqui; sem resposta da Cloudflare, a compra fica bloqueada.
async function verifyTurnstile(d: Dependencies, secret: string, token: unknown, ip: string | null) {
  if (typeof token !== "string" || !token || token.length > 2048) throw new HttpError(403, "CAPTCHA_FAILED", "Conclua a verificação de segurança e tente novamente.");
  const form = new FormData();
  form.set("secret", secret);
  form.set("response", token);
  if (ip) form.set("remoteip", ip);
  const response = await d.fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form, signal: AbortSignal.timeout(10_000) }).catch(() => null);
  if (!response?.ok) throw new HttpError(503, "CAPTCHA_UNAVAILABLE", "Verificação de segurança indisponível. Recarregue a página e tente de novo.");
  if ((await response.json()).success !== true) throw new HttpError(403, "CAPTCHA_FAILED", "Verificação de segurança recusada. Recarregue a página e tente de novo.");
}
// IPv6 entra no limite pelo /64: quem tem um bloco inteiro não escapa trocando de endereço a cada pedido.
export function limitKey(ip: string) {
  if (!ip.includes(":")) return ip;
  const [head, tail = ""] = ip.toLowerCase().split("::");
  const left = head ? head.split(":") : [], right = tail ? tail.split(":") : [];
  const groups = [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill("0"), ...right];
  return groups.slice(0, 4).map((group) => group.replace(/^0+(?=.)/, "")).join(":") + "::/64";
}
export const createHandler = (d: Dependencies = defaults) => endpoint(async (req) => {
  const service = clients(d).admin;
  const config = await asaasConfig(d, service);
  if (!config.configured) throw new HttpError(503, "CONFIGURATION_REQUIRED", "Integração ainda não configurada.");
  if (!config.checkoutAllowed) throw new HttpError(503, "CONFIGURATION_REQUIRED", "Cobranças em Produção estão desativadas.");
  const secret = d.env("TURNSTILE_SECRET_KEY");
  if (d.env("ICARUS_MODE") === "production" && !secret) {
    throw new HttpError(503, "CAPTCHA_UNAVAILABLE", "Verificação de segurança do checkout não configurada.");
  }
  const origin = appOrigin(d.env), image = d.env("ASAAS_ITEM_IMAGE_BASE64");
  const a = await actor(req, d, true), body = await json(req);
  const method = text(body.method, 16), installments = body.installments ?? 1;
  if (!["PIX", "CREDIT_CARD"].includes(method) || !Number.isInteger(installments) || Number(installments) < 1 || Number(installments) > 12 || (method === "PIX" && installments !== 1)) throw new HttpError(422, "INVALID_INPUT", "Forma de pagamento inválida.");
  const buyer = body.buyer as Record<string, unknown> | undefined;
  if (!buyer) throw new HttpError(422, "INVALID_INPUT", "Confira os dados de compra.");
  const buyerData = { name: text(buyer.name, 120), email: a?.userInfo.email || text(buyer.email, 254).toLowerCase(), document: text(buyer.document, 18).replace(/[.\-/]/g, ""), phone: buyer.phone == null || buyer.phone === "" ? "" : text(buyer.phone, 20).replace(/[()\s+-]/g, "") };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyerData.email) || !/^(\d{11}|\d{14})$/.test(buyerData.document) || (buyerData.phone && !/^\d{10,13}$/.test(buyerData.phone))) throw new HttpError(422, "INVALID_INPUT", "Confira email, documento e telefone.");
  if (!Array.isArray(body.legal_version_ids) || body.legal_version_ids.length < 2 || body.legal_version_ids.length > 5 || typeof body.marketing_opt_in !== "boolean") throw new HttpError(422, "INVALID_INPUT", "Confira o aceite dos termos.");
  const receipt = body.receipt_hash === undefined ? nonce() : undefined;
  const receiptHash = receipt ? await sha256(receipt) : body.receipt_hash;
  if (typeof receiptHash !== "string" || receiptHash.length !== 64 || /[^a-f0-9]/.test(receiptHash)) throw new HttpError(422, "INVALID_INPUT", "Recibo inválido.");
  const admin = a?.admin || service;
  // Só a Cloudflare (Supabase hospedado) garante o IP: o x-forwarded-for começa pelo que o cliente escreve e termina no proxy.
  const ip = req.headers.get("cf-connecting-ip")?.trim() || null;
  // Desafio recusado não consome o limite, para ninguém travar o email de outra pessoa sem resolver o Turnstile.
  if (secret) await verifyTurnstile(d, secret, body.captcha_token, ip);
  await throttle(admin, "app_checkout_throttle", { p_actor_id: a?.userInfo.id || null, p_client_ip: ip && limitKey(ip), p_email: buyerData.email });
  const order = await rpc(admin, "app_checkout_begin", { p_actor_id: a?.userInfo.id || null, p_plan_id: uuid(body.plan_id), p_attempt_key: text(body.attempt_key, 128), p_method: method, p_installments: installments, p_buyer_data: buyerData, p_legal_version_ids: body.legal_version_ids.map(uuid), p_marketing_opt_in: body.marketing_opt_in, p_receipt_hash: receiptHash, p_asaas_environment: config.mode, ...(config.productionFingerprint ? { p_production_fingerprint: config.productionFingerprint } : {}) });
  if (order.asaas_environment !== config.mode) throw new HttpError(409, "RECONCILIATION_REQUIRED", "Tentativa feita em outro ambiente. Consulte o pedido existente.");
  if (order.checkout_url) return { order_id: order.order_id, status: order.status, url: order.checkout_url, asaas_environment: order.asaas_environment };
  if (order.create_gateway !== true) throw new HttpError(409, "RECONCILIATION_REQUIRED", "Tentativa já recebida. Consulte o pedido antes de tentar novamente.");
  if (!Number.isSafeInteger(order.amount_cents) || order.amount_cents <= 0) throw new HttpError(503, "INVALID_OFFER", "Oferta indisponível.");
  const callback = new URL(`/pedido/${uuid(order.order_id)}`, origin).href;
  const gatewayEndpoints = asaasEndpoints[config.mode];
  const response = await d.fetch(`${gatewayEndpoints.api}/checkouts`, { method: "POST", redirect: "error", signal: AbortSignal.timeout(15_000), headers: { ...asaasHeaders(config.fields.api_key.value!), "Content-Type": "application/json" }, body: JSON.stringify({ billingTypes: [method], chargeTypes: [Number(installments) > 1 ? "INSTALLMENT" : "DETACHED"], ...(Number(installments) > 1 ? { installment: { maxInstallmentCount: installments } } : {}), minutesToExpire: 60, externalReference: order.order_id, callback: { successUrl: callback, cancelUrl: callback, expiredUrl: callback }, items: [{ name: String(order.plan_name).slice(0, 30), quantity: 1, value: order.amount_cents / 100, ...(image ? { imageBase64: image } : {}) }], customerData: { name: buyerData.name, email: buyerData.email, cpfCnpj: buyerData.document, ...(buyerData.phone ? { phone: buyerData.phone } : {}) } }) });
  if (!response.ok) throw new HttpError(503, "GATEWAY_UNAVAILABLE", "Pagamento não iniciado. Consulte o pedido antes de tentar novamente.");
  const gateway = await response.json();
  const gatewayId = uuid(gateway.id);
  const url = `${gatewayEndpoints.checkout}/checkoutSession/show?id=${gatewayId}`;
  await rpc(admin, "app_checkout_gateway", { p_order_id: order.order_id, p_gateway_id: gatewayId, p_checkout_url: url });
  return { order_id: order.order_id, status: "pending", url, asaas_environment: order.asaas_environment, receipt_token: receipt };
}, d.env);
export const handler = createHandler();
if (import.meta.main) Deno.serve(handler);
