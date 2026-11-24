import { createClient } from "npm:@supabase/supabase-js@2.119.2";
import { createHandler as media } from "../../supabase/functions/media/index.ts";
import { createHandler as upload } from "../../supabase/functions/upload/index.ts";
import { createHandler as reauthenticate } from "../../supabase/functions/reauthenticate/index.ts";
import { createHandler as checkout } from "../../supabase/functions/checkout/index.ts";
import { createHandler as webhook } from "../../supabase/functions/asaas-webhook/index.ts";
import { createHandler as orderStatus } from "../../supabase/functions/order-status/index.ts";
import { createHandler as passwordSetup } from "../../supabase/functions/password-setup/index.ts";
import { sha256 } from "../../supabase/functions/_shared/http.ts";

function assert(value: unknown, message: string): asserts value { if (!value) throw Error(message); }
const url = Deno.env.get("SUPABASE_URL"), key = Deno.env.get("SUPABASE_ANON_KEY"), service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (Deno.env.get("ICARUS_MODE") !== "local" || url !== "http://127.0.0.1:58521" || !key || !service) throw Error("Testes reais exigem ambiente privado Icarus LOCAL explícito.");
const accounts = JSON.parse(await Deno.readTextFile(Deno.env.get("DEMO_ACCOUNTS_PATH") || ".local/demo-accounts.json"));
const resources = JSON.parse(await Deno.readTextFile(Deno.env.get("DEMO_RESOURCES_PATH") || ".local/demo-resources.json"));
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, service, options);
const a = createClient(url, key, options), b = createClient(url, key, options);
async function login(client: typeof a, account: { email: string; password: string }) {
  const result = await client.auth.signInWithPassword(account);
  assert(!result.error && result.data.session, "Login de fixture local falhou.");
  return result.data.session!.access_token;
}
function req(body: unknown, token?: string) { return new Request(`${url}/functions/v1/test`, { method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) }); }
Deno.test("Auth + SQL gates + private Storage real local, providers disabled", async (t) => {
  const tokenA = await login(a, accounts.member), tokenB = await login(b, accounts.pro);
  const nativeClaims = await a.auth.getClaims(tokenA);
  assert(nativeClaims.data?.claims.session_id, "Sessão nativa sem claim verificável.");
  const humanAdmin = createClient(url, service, { ...options, global: { headers: { "x-icarus-session-id": String(nativeClaims.data.claims.session_id), "x-icarus-aal": String(nativeClaims.data.claims.aal) } } });
  try {
    await t.step("configuration absent creates no external rights", async () => {
      const result = await checkout()(req({}, tokenA)); assert(result.status === 503, "Checkout sem provedor não fechou.");
      const hook = await webhook()(req({})); assert(hook.status === 503, "Webhook sem token não fechou.");
    });
    await t.step("forged and expired-looking JWT rejected by native Auth", async () => {
      const altered = tokenA.slice(0, -8) + "forgedxx";
      assert((await media()(req({ kind: "lesson", id: resources.lesson_id }, altered))).status === 401, "JWT adulterado aceito.");
    });
    await t.step("public signup cannot forge server app metadata or bypass demo legal gate", async () => {
      const forged = await fetch(`${url}/auth/v1/signup`, { method: "POST", headers: { apikey: key, "content-type": "application/json" }, body: JSON.stringify({ email: `forged-${crypto.randomUUID()}@demo.icarus.invalid`, password: "Ic!9synthetic-forgery-check", data: { icarus_server_created: true, icarus_local_demo: true, role: "admin", full_name: "DEMONSTRAÇÃO tentativa rejeitada" }, app_metadata: { icarus_server_created: true } }) });
      assert(forged.status >= 400, "Cadastro público forjou autoridade de servidor."); await forged.body?.cancel();
    });
    await t.step("private fixture has real bytes, member gate and short signed URL", async () => {
      const result = await media()(req({ kind: "lesson", id: resources.lesson_id }, tokenB));
      assert(result.status === 200, "Mídia demo autorizada não assinou.");
      const signed = await result.json();
      const downloaded = await fetch(signed.url, { headers: { Range: "bytes=0-31" } });
      assert(downloaded.status === 206 || downloaded.status === 200, "Vídeo privado não existe.");
      const bytes = new Uint8Array(await downloaded.arrayBuffer());
      assert(new TextDecoder().decode(bytes.slice(4, 8)) === "ftyp", "Fixture não contém MP4 real.");
      const raw = await fetch(`${url}/storage/v1/object/public/icarus-private/${resources.storage_path}`);
      assert(raw.status >= 400, "Bucket privado aceitou URL pública."); await raw.body?.cancel();
      const direct = await a.storage.from("icarus-private").download(resources.storage_path);
      assert(direct.error, "Storage direto contornou gate.");
    });
    await t.step("native reauth wrong password denies and correct password preserves principal session", async () => {
      const denied = await reauthenticate()(req({ password: "incorrect-synthetic-password" }, tokenA)); assert(denied.status === 403, "Senha errada autorizou reauth.");
      const result = await reauthenticate()(req({ password: accounts.member.password }, tokenA)); assert(result.status === 200, "Senha nativa válida não confirmou.");
      const body = await result.json();
      const saved = await admin.from("ica_reauth_nonces").select("actor_id,expires_at,consumed_at").eq("token_hash", await sha256(body.token)).single();
      assert(!saved.error && saved.data.actor_id === accounts.member.id, "Nonce não vinculado ao ator.");
      assert(Date.parse(saved.data.expires_at) - Date.now() <= 300_000, "Nonce excedeu TTL5min.");
      const alive = await a.rpc("app_touch_session", { p_activity: false }); assert(!alive.error, "Reauth revogou sessão principal.");
    });
    let attachmentId: string, ticketId: string;
    await t.step("controlled multipart uploads real PDF to own ticket", async () => {
      const ticket = await a.rpc("app_create_ticket", { p_subject: "DEMONSTRAÇÃO integração local", p_priority: "normal", p_body: "Fixture sintética para testar autorização de anexo." });
      assert(!ticket.error && ticket.data.id, "Ticket sintético não criado.");
      ticketId = ticket.data.id;
      const form = new FormData(); form.set("kind", "ticket-attachment"); form.set("resource_id", ticket.data.id);
      form.set("file", new File(["%PDF-1.4\n% DEMONSTRACAO local\n%%EOF\n"], "demonstracao.pdf", { type: "application/pdf" }));
      const result = await upload()(new Request(`${url}/functions/v1/upload`, { method: "POST", headers: { authorization: `Bearer ${tokenA}` }, body: form }));
      assert(result.status === 200, "Upload real ao ticket falhou."); attachmentId = (await result.json()).id;
      const own = await media()(req({ kind: "ticket-attachment", id: attachmentId }, tokenA)); assert(own.status === 200, "Titular não conseguiu ler anexo.");
    });
    await t.step("native Storage upload enforces reserved path actor and no overwrite, finalize inspects real object", async () => {
      assert(ticketId!, "Ticket precisa existir.");
      const bytes = new TextEncoder().encode("DEMONSTRACAO arquivo local real de integracao.\n");
      const reserved = await humanAdmin.rpc("app_upload_access", { p_actor_id: accounts.member.id, p_kind: "ticket-attachment", p_resource_id: ticketId, p_file_name: "demonstracao.txt", p_content_type: "text/plain", p_size_bytes: bytes.length });
      assert(!reserved.error, "Reserva de fixture local falhou.");
      const wrongActor = await b.storage.from("icarus-private").upload(reserved.data.path, bytes, { contentType: "text/plain", upsert: false });
      assert(wrongActor.error, "Outro ator enviou arquivo na reserva alheia.");
      const sent = await a.storage.from("icarus-private").upload(reserved.data.path, bytes, { contentType: "text/plain", upsert: false });
      assert(!sent.error, "Storage nativo não aceitou reserva própria.");
      const pending = await media()(req({ kind: "ticket-attachment", id: reserved.data.id }, tokenA)); assert(pending.status >= 400, "Arquivo pendente foi lido antes de finalize.");
      const finalized = await upload()(req({ action: "finalize", upload_id: reserved.data.id }, tokenA)); assert(finalized.status === 200, "Finalize não confirmou metadados/assinatura reais.");
      const overwrite = await a.storage.from("icarus-private").upload(reserved.data.path, bytes, { contentType: "text/plain", upsert: true }); assert(overwrite.error, "Storage permitiu sobrescrever arquivo pronto.");
      const ready = await media()(req({ kind: "ticket-attachment", id: reserved.data.id }, tokenA)); assert(ready.status === 200, "Objeto pronto não abriu após finalize.");
    });
    await t.step("other actor and public UUID cannot read ticket attachment or order", async () => {
      assert(attachmentId!, "Anexo positivo precisa existir antes do negativo.");
      const denied = await media()(req({ kind: "ticket-attachment", id: attachmentId, user_id: accounts.member.id }, tokenB));
      assert(denied.status >= 400, "Outro ator abriu anexo.");
      const publicRequest = await media()(req({ kind: "ticket-attachment", id: attachmentId })); assert(publicRequest.status === 401, "UUID público contornou Auth.");
      const status = await orderStatus()(req({ order_id: crypto.randomUUID(), email: accounts.member.email }, tokenB)); assert(status.status >= 400, "Email cliente autorizou pedido.");
    });
    await t.step("staff without MFA can access authorized media through exact session gate", async () => {
      const staff = createClient(url, key, options);
      try { const token = await login(staff, accounts.admin); assert((await media()(req({ kind: "lesson", id: resources.lesson_id }, token))).status === 200, "Staff sem fator não acessou mídia autorizada."); }
      finally { await staff.auth.signOut({ scope: "local" }); }
    });
  } finally { await a.auth.signOut({ scope: "local" }); await b.auth.signOut({ scope: "local" }); }
});

Deno.test("native invitation reaches local Mailpit and email confirmation precedes password login", async () => {
  const unique = crypto.randomUUID(), email = `invite-${unique}@demo.icarus.invalid`;
  const created = await admin.auth.admin.createUser({ email, email_confirm: false, app_metadata: { icarus_server_created: true, icarus_password_setup_required: true }, user_metadata: { full_name: "DEMONSTRAÇÃO convite local" } });
  assert(!created.error && created.data.user && !created.data.user.email_confirmed_at, "Precreate nativo deveria permanecer não confirmado e sem senha.");
  const invited = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: "http://127.0.0.1:8088/auth/callback" });
  assert(!invited.error && invited.data.user, "Auth nativo não convidou conta existente não confirmada.");
  let messageId: string | undefined;
  for (let attempt = 0; attempt < 10 && !messageId; attempt++) {
    const list = await fetch("http://127.0.0.1:58524/api/v1/messages?limit=50"); assert(list.ok, "Mailpit local indisponível.");
    const data = await list.json();
    messageId = data.messages.find((m: { ID: string; To: { Address: string }[] }) => m.To.some((recipient) => recipient.Address === email))?.ID;
    if (!messageId) await new Promise((resolve) => setTimeout(resolve, 300));
  }
  assert(messageId, "Convite200 não comprovou recebimento no Mailpit.");
  const mail = await fetch(`http://127.0.0.1:58524/api/v1/message/${encodeURIComponent(messageId)}`);
  assert(mail.ok, "Mensagem recebida não pôde ser lida localmente.");
  const content = await mail.json();
  const links = String(content.HTML || "").matchAll(/href="([^"]+)"/g);
  const verification = Array.from(links, (match) => match[1].replaceAll("&amp;", "&")).find((link) => { try { const u = new URL(link); return u.origin === url && u.pathname === "/auth/v1/verify"; } catch { return false; } });
  assert(verification, "Mensagem não contém confirmação Auth local.");
  const verified = await fetch(verification, { redirect: "manual" });
  assert(verified.status === 302 || verified.status === 303, "Confirmação nativa falhou.");
  const callback = new URL(verified.headers.get("location")!);
  assert(callback.origin === "http://127.0.0.1:8088", "Callback saiu do destino local permitido.");
  const fragment = new URLSearchParams(callback.hash.slice(1));
  const client = createClient(url, key, options);
  try {
    const session = await client.auth.setSession({ access_token: fragment.get("access_token")!, refresh_token: fragment.get("refresh_token")! });
    assert(!session.error && session.data.user?.email_confirmed_at, "Link de email não confirmou titular nativamente.");
    const password = `Ic!9${unique}`;
    const changed = await passwordSetup()(req({ password }, session.data.session!.access_token)); assert(changed.status === 200, "Primeira senha não foi provada pelo Auth nativo e helper servidor.");
    const boot = await client.rpc("app_bootstrap"); assert(!boot.error && boot.data.profile.password_setup_required === false, "Flag de primeira senha não foi concluída no servidor.");
    await client.auth.signOut({ scope: "local" });
    const signed = await client.auth.signInWithPassword({ email, password }); assert(!signed.error && signed.data.user?.id === created.data.user.id, "Login não usou a mesma conta confirmada do convite.");
  } finally { await client.auth.signOut({ scope: "local" }); }
});
