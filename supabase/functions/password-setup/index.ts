import { actor, defaults, rpc, type Dependencies } from "../_shared/client.ts";
import { endpoint, HttpError, json, required } from "../_shared/http.ts";
export const createHandler = (d: Dependencies = defaults) => endpoint(async (req) => {
  const a = (await actor(req, d))!, body = await json(req);
  if (!a.profile.password_setup_required) throw new HttpError(409, "PASSWORD_ALREADY_CONFIGURED", "A senha inicial já foi configurada.");
  if (typeof body.password !== "string" || body.password.length < 8 || body.password.length > 72 || !/[a-z]/.test(body.password) || !/[A-Z]/.test(body.password) || !/\d/.test(body.password) || !/[^\w\s]/.test(body.password)) throw new HttpError(422, "INVALID_PASSWORD", "Use de 8 a 72 caracteres, com maiúscula, minúscula, número e símbolo.");
  const [url, anon] = required(d.env, "SUPABASE_URL", "SUPABASE_ANON_KEY");
  // Auth's native user endpoint uses the genuine access token; no fabricated refresh session or Admin password override.
  const changed = await d.fetch(`${url}/auth/v1/user`, { method: "PUT", headers: { Authorization: req.headers.get("authorization")!, apikey: anon, "Content-Type": "application/json" }, body: JSON.stringify({ password: body.password }), signal: AbortSignal.timeout(10_000) });
  if (!changed.ok) { await changed.body?.cancel(); throw new HttpError(422, "PASSWORD_NOT_CONFIRMED", "A senha não foi aceita. Confira a política e tente novamente."); }
  const updated = await changed.json();
  if (updated.id !== a.userInfo.id) throw new HttpError(503, "PASSWORD_NOT_CONFIRMED", "Não foi possível confirmar a alteração.");
  await rpc(a.admin, "app_complete_password_setup", { p_actor_id: a.userInfo.id, p_session_id: a.claims.session_id });
  return { completed: true };
}, d.env);
export const handler = createHandler();
if (import.meta.main) Deno.serve(handler);
