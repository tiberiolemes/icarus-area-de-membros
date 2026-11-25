import { actor, defaults, rpc, throttle, type Dependencies } from "../_shared/client.ts";
import { endpoint, HttpError, json, nonce, sha256, text } from "../_shared/http.ts";
export const createHandler = (d: Dependencies = defaults) => endpoint(async (req) => {
  const a = (await actor(req, d))!;
  const body = await json(req);
  text(body.password, 1024);
  const password = body.password as string;
  const hasMfa = a.userInfo.factors?.some((f) => f.status === "verified");
  if (hasMfa && a.claims.aal !== "aal2") throw new HttpError(403, "MFA_REQUIRED", "Confirme o segundo fator para continuar.");
  // A senha é conferida com a chave de serviço, fora do CAPTCHA e do limite por IP do Auth: o limite fica por usuário.
  await throttle(a.admin, "app_reauth_throttle", { p_actor_id: a.userInfo.id });
  const verifier = a.verifier();
  try {
    const checked = await verifier.auth.signInWithPassword({ email: a.userInfo.email!, password });
    if (checked.error || checked.data.user?.id !== a.userInfo.id) throw new HttpError(403, "REAUTH_FAILED", "Senha não confirmada.");
    const token = nonce();
    const confirmed = await rpc(a.admin, "app_confirm_reauth", { p_actor_id: a.userInfo.id, p_session_id: a.claims.session_id, p_token_hash: await sha256(token) });
    return { token, expires_at: confirmed.expires_at };
  } finally {
    const result = await verifier.auth.signOut({ scope: "local" });
    if (result.error) throw new HttpError(503, "REAUTH_FAILED", "Não foi possível finalizar a verificação. Tente novamente.");
  }
}, d.env);
export const handler = createHandler();
if (import.meta.main) Deno.serve(handler);
