import { actor, clients, defaults, rpc, type Dependencies } from "../_shared/client.ts";
import { endpoint, HttpError, json, sha256, text, uuid } from "../_shared/http.ts";
export const createHandler = (d: Dependencies = defaults) => endpoint(async (req) => {
  const a = await actor(req, d, true), body = await json(req);
  if (!a && !body.receipt_token) throw new HttpError(401, "UNAUTHORIZED", "Recibo ou sessão necessários.");
  return await rpc(a?.admin || clients(d).admin, "app_order_status", { p_order_id: uuid(body.order_id), p_actor_id: a?.userInfo.id || null, p_receipt_hash: body.receipt_token ? await sha256(text(body.receipt_token, 128)) : null });
}, d.env);
export const handler = createHandler();
if (import.meta.main) Deno.serve(handler);
