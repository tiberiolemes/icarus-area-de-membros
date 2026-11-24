import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.119.2";
import { env, required, HttpError, type Env } from "./http.ts";
export type Dependencies = { env: Env; fetch: typeof fetch; client: typeof createClient; waitUntil?: (task: Promise<unknown>) => void };
export const defaults: Dependencies = { env, fetch, client: createClient };
export function clients(d: Dependencies, token?: string, session?: { id: string; aal: string }) {
  const [url, anon, service] = required(d.env, "SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY");
  // O verifier confere senha com a chave de serviço: com o CAPTCHA do Auth ligado, a chave pública é recusada sem token do navegador.
  const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: d.fetch } };
  return { admin: d.client(url, service, { ...options, global: { ...options.global, ...(session ? { headers: { "x-icarus-session-id": session.id, "x-icarus-aal": session.aal } } : {}) } }), user: d.client(url, anon, { ...options, global: { ...options.global, ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}) } }), verifier: () => d.client(url, service, options) };
}
export async function rpc(client: SupabaseClient, name: string, args: Record<string, unknown> = {}) {
  const { data, error } = await client.rpc(name, args);
  if (error) {
    const code = error.code;
    throw new HttpError(code === "42501" ? 403 : code === "23505" ? 409 : code === "P0001" || code === "22023" ? 422 : 503, code === "42501" ? "FORBIDDEN" : code === "23505" ? "CONFLICT" : "REQUEST_REJECTED", "Operação não autorizada ou indisponível. Confira os dados e tente novamente.");
  }
  return data;
}
export async function actor(req: Request, d: Dependencies, optional = false) {
  const auth = req.headers.get("authorization");
  if (!auth && optional) return null;
  if (optional && auth === `Bearer ${d.env("SUPABASE_ANON_KEY")}`) return null;
  if (!auth?.startsWith("Bearer ")) throw new HttpError(401, "UNAUTHORIZED", "Entre novamente para continuar.");
  const token = auth.slice(7);
  const c = clients(d, token);
  const { data, error } = await c.user.auth.getUser(token);
  if (error || !data.user || !data.user.email_confirmed_at) throw new HttpError(401, "UNAUTHORIZED", "Entre novamente para continuar.");
  const claims = await c.user.auth.getClaims(token);
  if (claims.error || claims.data?.claims.sub !== data.user.id || typeof claims.data.claims.session_id !== "string") throw new HttpError(401, "UNAUTHORIZED", "Sessão inválida.");
  await rpc(c.user, "app_touch_session", { p_activity: false });
  const boot = await rpc(c.user, "app_bootstrap");
  if (!boot?.profile?.role) throw new HttpError(403, "FORBIDDEN", "Perfil indisponível.");
  if (data.user.factors?.some((f) => f.status === "verified") && claims.data.claims.aal !== "aal2") throw new HttpError(403, "MFA_REQUIRED", "Confirme o segundo fator para continuar.");
  const admin = clients(d, token, { id: claims.data.claims.session_id, aal: String(claims.data.claims.aal) }).admin;
  return { ...c, admin, userInfo: data.user, claims: claims.data.claims, profile: boot.profile };
}
