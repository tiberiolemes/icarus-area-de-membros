export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
export type Env = (name: string) => string | undefined;
export const env: Env = (name) => Deno.env.get(name);
export function required(get: Env, ...names: string[]) {
  const values = names.map(get);
  if (values.some((v) => !v)) throw new HttpError(503, "CONFIGURATION_REQUIRED", "Integração ainda não configurada.");
  return values as string[];
}
export async function sha256(value: string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))), (n) => n.toString(16).padStart(2, "0")).join("");
}
export function nonce() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (n) => n.toString(16).padStart(2, "0")).join("");
}
export async function constantEqual(a: string, b: string) {
  const aa = await sha256(a), bb = await sha256(b);
  let difference = 0;
  for (let i = 0; i < aa.length; i++) difference |= aa.charCodeAt(i) ^ bb.charCodeAt(i);
  return difference === 0;
}
export function text(value: unknown, max = 255) {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new HttpError(422, "INVALID_INPUT", "Confira os campos informados.");
  return value.trim();
}
export function uuid(value: unknown) {
  const id = text(value, 36);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new HttpError(422, "INVALID_INPUT", "Identificador inválido.");
  return id;
}
export async function boundedBody(req: Pick<Request, "headers" | "body">, limit: number) {
  if (Number(req.headers.get("content-length")) > limit) throw new HttpError(413, "TOO_LARGE", "Arquivo ou solicitação muito grande.");
  const reader = req.body?.getReader();
  const chunks: Uint8Array[] = []; let size = 0;
  if (reader) while (true) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.length;
    if (size > limit) { await reader.cancel(); throw new HttpError(413, "TOO_LARGE", "Arquivo ou solicitação muito grande."); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}
export async function json(req: Request): Promise<Record<string, unknown>> {
  try {
    const value = JSON.parse(new TextDecoder().decode(await boundedBody(req, 64 * 1024)));
    if (!value || Array.isArray(value) || typeof value !== "object") throw new Error();
    return value;
  } catch (e) { if (e instanceof HttpError) throw e; throw new HttpError(400, "INVALID_JSON", "Solicitação inválida."); }
}
export function endpoint(handler: (req: Request) => Promise<unknown>, get: Env = env, allowGet = false) {
  return async (req: Request): Promise<Response> => {
    const origin = req.headers.get("origin");
    const allowed = get("APP_ORIGIN") || "http://127.0.0.1:8088";
    const headers: Record<string, string> = { "Content-Type": "application/json", "Cache-Control": "no-store", "Vary": "Origin", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": allowGet ? "GET,POST,OPTIONS" : "POST,OPTIONS" };
    if (origin === allowed) headers["Access-Control-Allow-Origin"] = allowed;
    try {
      if (origin && origin !== allowed) throw new HttpError(403, "FORBIDDEN", "Origem não permitida.");
      if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
      if (req.method !== "POST" && !(allowGet && req.method === "GET")) throw new HttpError(405, "METHOD_NOT_ALLOWED", "Método não permitido.");
      return new Response(JSON.stringify(await handler(req)), { status: 200, headers });
    } catch (error) {
      const e = error instanceof HttpError ? error : new HttpError(503, "SERVICE_UNAVAILABLE", "Serviço indisponível. Tente novamente.");
      return new Response(JSON.stringify({ error: { code: e.code, message: e.message } }), { status: e.status, headers });
    }
  };
}
