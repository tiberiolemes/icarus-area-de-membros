import { actor, defaults, rpc, throttle, type Dependencies } from "../_shared/client.ts";
import { endpoint, HttpError, json, nonce, sha256, text } from "../_shared/http.ts";
import { asaasEnvironment } from "../_shared/integrations.ts";
export const createHandler = (d: Dependencies = defaults) => endpoint(async (req) => {
  const a = (await actor(req, d))!;
  const body = await json(req);
  text(body.password, 1024);
  const password = body.password as string;
  const hasMfa = a.userInfo.factors?.some((f) => f.status === "verified");
  if (hasMfa && a.claims.aal !== "aal2") throw new HttpError(403, "MFA_REQUIRED", "Confirme o segundo fator para continuar.");
  const rotate = body.action === "rotate-asaas-webhook";
  const environment = d.env("ASAAS_ENV") ?? body.environment;
  if (rotate) {
    if (a.profile.role !== "admin" || a.profile.demo || a.profile.password_setup_required || !hasMfa || a.claims.aal !== "aal2") {
      throw new HttpError(403, "FORBIDDEN", "Confirme o segundo fator como administrador para gerar um token.");
    }
    if (d.env("ASAAS_WEBHOOK_TOKEN") !== undefined) {
      throw new HttpError(409, "CONFLICT", "O token é controlado por uma variável de ambiente.");
    }
    if (!asaasEnvironment(environment) || "webhook_token" in body) {
      throw new HttpError(422, "INVALID_INPUT", "Confira o ambiente do Asaas para gerar o token.");
    }
  }
  // A senha é conferida com a chave de serviço, fora do CAPTCHA e do limite por IP do Auth: o limite fica por usuário.
  await throttle(a.admin, "app_reauth_throttle", { p_actor_id: a.userInfo.id });
  const verifier = a.verifier();
  const token = nonce();
  let expiresAt: string;
  try {
    const checked = await verifier.auth.signInWithPassword({ email: a.userInfo.email!, password });
    if (checked.error || checked.data.user?.id !== a.userInfo.id) throw new HttpError(403, "REAUTH_FAILED", "Senha não confirmada.");
    const confirmed = await rpc(a.admin, "app_confirm_reauth", { p_actor_id: a.userInfo.id, p_session_id: a.claims.session_id, p_token_hash: await sha256(token) });
    expiresAt = confirmed.expires_at;
  } finally {
    const result = await verifier.auth.signOut({ scope: "local" });
    if (result.error) throw new HttpError(503, "REAUTH_FAILED", "Não foi possível finalizar a verificação. Tente novamente.");
  }
  if (rotate) {
    const generated = nonce();
    await rpc(a.admin, "app_admin_save_integration", {
      p_actor_id: a.userInfo.id, p_provider: "asaas", p_fields: { env: environment, webhook_token: generated }, p_reauth_token: token,
    });
    return { webhook_token: generated };
  }
  return { token, expires_at: expiresAt };
}, d.env);
export const handler = createHandler();
if (import.meta.main) Deno.serve(handler);
