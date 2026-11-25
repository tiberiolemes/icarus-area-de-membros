import { clients, defaults, rpc, type Dependencies } from "../_shared/client.ts";
import { appOrigin, constantEqual, endpoint, HttpError, required, uuid } from "../_shared/http.ts";
import { deliverPaidInvite } from "../_shared/payment.ts";
export const createHandler = (d: Dependencies = defaults) => endpoint(async (req) => {
  const [secret] = required(d.env, "SUPABASE_SERVICE_ROLE_KEY");
  const bearer = req.headers.get("authorization") || "";
  if (!bearer.startsWith("Bearer ") || !(await constantEqual(secret, bearer.slice(7)))) throw new HttpError(401, "UNAUTHORIZED", "Operação de serviço não autorizada.");
  const admin = clients(d).admin;
  const due = await rpc(admin, "app_payment_invites_due", { p_limit: 20 });
  if (!Array.isArray(due?.items)) throw new HttpError(503, "SERVICE_UNAVAILABLE", "Fila temporariamente indisponível.");
  let attempted = 0;
  for (const item of due.items.slice(0, 20)) {
    await deliverPaidInvite(admin, uuid(item.order_id), appOrigin(d.env)); attempted++;
  }
  return { attempted };
}, d.env);
export const handler = createHandler();
if (import.meta.main) Deno.serve(handler);
