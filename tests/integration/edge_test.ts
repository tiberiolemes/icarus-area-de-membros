import { createClient } from "npm:@supabase/supabase-js@2.119.2";
import { createHandler as capabilities } from "../../supabase/functions/capabilities/index.ts";
import { createHandler as checkout } from "../../supabase/functions/checkout/index.ts";
import { createHandler as webhook } from "../../supabase/functions/asaas-webhook/index.ts";
import { createHandler as media } from "../../supabase/functions/media/index.ts";
import { createHandler as upload } from "../../supabase/functions/upload/index.ts";
import { createHandler as reauthenticate } from "../../supabase/functions/reauthenticate/index.ts";
import { createHandler as orderStatus } from "../../supabase/functions/order-status/index.ts";
import { createHandler as passwordSetup } from "../../supabase/functions/password-setup/index.ts";
import { deliverPaidInvite, finishPaidOrder, normalizeEvent } from "../../supabase/functions/_shared/payment.ts";
import { publicStorageUrl } from "../../supabase/functions/_shared/storage.ts";
import { clients, type Dependencies } from "../../supabase/functions/_shared/client.ts";
import { constantEqual, sha256 } from "../../supabase/functions/_shared/http.ts";
import { imageSize } from "../../supabase/functions/_shared/files.ts";

const id = "11111111-1111-4111-8111-111111111111", other = "22222222-2222-4222-8222-222222222222";
function assert(value: unknown, label = "assertion") { if (!value) throw Error(label); }
function equal(a: unknown, b: unknown) { assert(JSON.stringify(a) === JSON.stringify(b), `Expected ${JSON.stringify(b)}, received ${JSON.stringify(a)}`); }
const jwt = (claims = {}) => [btoa(JSON.stringify({ alg: "HS256", typ: "JWT" })), btoa(JSON.stringify({ sub: id, session_id: other, aal: "aal1", aud: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600, ...claims })), "test-only-signature"].join(".");
const user = { id, email: "member@demo.icarus.invalid", email_confirmed_at: "2026-11-23T00:00:00Z", role: "authenticated", aud: "authenticated", factors: [] };
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
type Route = (url: URL, init: RequestInit) => Response | Promise<Response> | undefined;
function deps(route: Route = () => undefined, config: Record<string, string> = {}) {
  const requests: { url: string; body: unknown; method: string; headers: Headers }[] = [];
  const values = { SUPABASE_URL: "http://127.0.0.1:58521", SUPABASE_ANON_KEY: "local-public", SUPABASE_SERVICE_ROLE_KEY: "local-test-secret", APP_ORIGIN: "http://127.0.0.1:8088", ICARUS_MODE: "local", ...config };
  const d: Dependencies = { env: (name) => values[name as keyof typeof values], client: createClient, fetch: (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    requests.push({ url: url.href, body: typeof init.body === "string" ? JSON.parse(init.body) : null, method: init.method || "GET", headers: new Headers(init.headers) });
    const routed = await route(url, init); if (routed) return routed;
    if (url.pathname === "/auth/v1/user") return response(user);
    if (url.pathname.endsWith("/app_touch_session")) return response({ expires_at: "2026-11-23T01:00:00Z" });
    if (url.pathname.endsWith("/app_bootstrap")) return response({ profile: { role: "member" } });
    if (url.pathname.endsWith("/app_integration_credentials")) return response({});
    if (["app_checkout_throttle", "app_reauth_throttle", "app_admin_integration_test_throttle", "app_staff_bunny_search_throttle"].includes(url.pathname.split("/").at(-1) ?? "")) return response(null);
    throw Error(`Unexpected fake transport request: ${url.pathname}`);
  }) as typeof fetch };
  return { d, requests };
}
function request(body: unknown, { token = jwt(), headers = {} }: { token?: string | null; headers?: Record<string, string> } = {}) {
  return new Request("http://127.0.0.1:58521/functions/v1/test", { method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers }, body: JSON.stringify(body) });
}
const billing = { ASAAS_API_KEY: "sandbox-test-only", ASAAS_WEBHOOK_TOKEN: "synthetic-webhook-token-32-characters", ASAAS_ENV: "sandbox", ASAAS_ITEM_IMAGE_BASE64: "synthetic-image" };
const buyer = { name: "DEMONSTRAÇÃO comprador", email: "new@demo.icarus.invalid", document: "00000000000", phone: "00000000000" };
const purchase = { plan_id: id, method: "PIX", installments: 1, attempt_key: "synthetic-attempt", buyer, legal_version_ids: [id, other], marketing_opt_in: false };
const paidPayments = (value: number, status = "RECEIVED") => response({ hasMore: false, data: [{ status, billingType: "PIX", value }] });

Deno.test("capabilities exposes only public capability flags", async () => {
  const { d, requests } = deps(); const result = await capabilities(d)(new Request("http://localhost/test"));
  equal(await result.json(), { asaas: false, bunny: false, storage: true });
  assert(requests.every((r) => r.url.endsWith("app_integration_credentials") && r.headers.get("apikey") === "local-test-secret"));
});
Deno.test("public capabilities coalesces Vault reads and recalculates provider flags after one minute", async () => {
  const { d, requests } = deps((url, init) => {
    if (url.pathname.endsWith("app_integration_credentials") && JSON.parse(String(init.body)).p_provider === "asaas")
      return response({ env: "sandbox", sandbox_api_key: "fixture-key", sandbox_webhook_token: billing.ASAAS_WEBHOOK_TOKEN });
  });
  const handler = capabilities(d);
  const read = () => handler(new Request("http://localhost/test")).then((result) => result.json());
  const realNow = Date.now;
  let now = realNow();
  Date.now = () => now;
  try {
    const results = await Promise.all([read(), read(), read()]);
    assert(results.every((data) => data.asaas === true && !JSON.stringify(data).includes("fixture-key")));
    equal(requests.length, 2);
    now += 59_999;
    await read();
    equal(requests.length, 2);
    now += 1;
    await read();
    equal(requests.length, 4);
  } finally { Date.now = realNow; }
});
Deno.test("webhook reuses the Vault without processing unauthorized requests", async () => {
  const { d, requests } = deps((url) => url.pathname.endsWith("app_integration_credentials")
    ? response({ env: "sandbox", sandbox_api_key: "fixture-key", sandbox_webhook_token: billing.ASAAS_WEBHOOK_TOKEN })
    : undefined);
  const handler = webhook(d);
  for (let i = 0; i < 3; i++) {
    const invalid = new Request("http://localhost/test", { method: "POST", body: "invalid JSON" });
    equal((await handler(invalid)).status, 401);
    assert(!invalid.bodyUsed);
  }
  equal(requests.map((r) => r.url.split("/").at(-1)), ["app_integration_credentials"]);
});
Deno.test("missing provider denies checkout after the Vault check and before any payment operation", async () => {
  const { d, requests } = deps(); const result = await checkout(d)(request(purchase, { token: null }));
  equal(result.status, 503); equal((await result.json()).error.code, "CONFIGURATION_REQUIRED");
  assert(requests.every((r) => r.url.endsWith("app_integration_credentials")));
});
Deno.test("invalid JWT never reaches resource RPC", async () => {
  const { d, requests } = deps((url) => url.pathname === "/auth/v1/user" ? response({ msg: "invalid JWT" }, 401) : undefined);
  equal((await media(d)(request({ kind: "lesson", id }))).status, 401);
  assert(!requests.some((r) => r.url.includes("app_media_access")));
});
Deno.test("Vault supplies checkout credentials without forwarding them to the client", async () => {
  const { d, requests } = deps((url) =>
    url.pathname.endsWith("app_integration_credentials")
      ? response({ env: "sandbox", sandbox_api_key: "fake-vault-asaas-key", sandbox_webhook_token: billing.ASAAS_WEBHOOK_TOKEN })
      : reserve(url));
  const result = await checkout(d)(request(purchase, { token: null }));
  equal(result.status, 200);
  assert(!(await result.text()).includes("fake-vault-asaas-key"));
  equal(requests.find((r) => r.url.includes("api-sandbox.asaas.com"))?.headers.get("access_token"), "fake-vault-asaas-key");
  equal(requests.find((r) => r.url.endsWith("app_integration_credentials"))?.headers.get("apikey"), "local-test-secret");
});
Deno.test("a signed Bunny embed uses the Vault and honors a per-field environment override", async () => {
  const { d } = deps((url) => url.pathname.endsWith("app_media_access")
    ? response({ can_access: true, provider: "bunny", video_id: other })
    : url.pathname.endsWith("app_integration_credentials")
      ? response({ library_id: "842", token_key: "fake-vault-signing-key", api_key: "fake-stream-key", cdn_host: "vz-teste.b-cdn.net" })
      : undefined, { BUNNY_LIBRARY_ID: "902" });
  const result = await media(d)(request({ kind: "lesson", id }));
  equal(result.status, 200);
  const url = new URL((await result.json()).url);
  equal(url.pathname, `/embed/902/${other}`);
  equal(url.searchParams.get("token"), await sha256("fake-vault-signing-key" + other + url.searchParams.get("expires")));
});
Deno.test("admin checks connection with environment priority and receives only safe results", async () => {
  for (const status of [200, 401]) {
    const { d, requests } = deps((url) => {
      if (url.pathname === "/auth/v1/user") return response({ ...user, factors: [{ status: "verified" }] });
      if (url.pathname.endsWith("app_bootstrap")) return response({ profile: { role: "admin" } });
      if (url.pathname.endsWith("app_integration_credentials")) return response({ env: "sandbox", sandbox_api_key: "fake-vault-key", sandbox_webhook_token: billing.ASAAS_WEBHOOK_TOKEN });
      if (url.pathname.endsWith("app_admin_asaas_production")) return response(null);
      if (url.hostname === "api.asaas.com") return response({ balance: 9999, internal: "não mostrar" }, status);
    }, { ASAAS_ENV: "production", ASAAS_API_KEY: "fake-environment-key", TURNSTILE_SECRET_KEY: "test-captcha" });
    const result = await capabilities(d)(request({ action: "integration-test", provider: "asaas" }, { token: jwt({ aal: "aal2" }) }));
    equal(result.status, 200);
    const data = await result.json();
    equal(data.ok, status === 200);
    assert(!JSON.stringify(data).includes("fake-environment-key") && !JSON.stringify(data).includes("balance"));
    const call = requests.find((r) => r.url.includes("api.asaas.com"));
    equal(call?.url, "https://api.asaas.com/v3/payments?limit=1");
    equal(call?.headers.get("access_token"), "fake-environment-key");
  }
});
Deno.test("Bunny connection uses the Stream key and never sends it to the configured CDN", async () => {
  for (const status of [200, 401]) {
    const { d, requests } = deps((url) => {
      if (url.pathname === "/auth/v1/user") return response({ ...user, factors: [{ status: "verified" }] });
      if (url.pathname.endsWith("app_bootstrap")) return response({ profile: { role: "admin" } });
      if (url.pathname.endsWith("app_integration_credentials")) return response({
        library_id: "42", api_key: "synthetic-stream-key", token_key: "synthetic-player-key", cdn_host: "vz-fixture.b-cdn.net",
      });
      if (url.hostname === "video.bunnycdn.com") return response({ items: ["fixture"] }, status);
    });
    const result = await capabilities(d)(request({ action: "integration-test", provider: "bunny" }, { token: jwt({ aal: "aal2" }) }));
    equal((await result.json()).ok, status === 200);
    const calls = requests.filter((r) => !r.url.startsWith("http://127.0.0.1"));
    equal(calls.map((r) => r.url), ["https://video.bunnycdn.com/library/42/videos?itemsPerPage=1"]);
    equal(calls[0].headers.get("accesskey"), "synthetic-stream-key");
  }
});
Deno.test("integration test denies AAL1 and enforces a shared admin limit before the Vault or provider", async () => {
  for (const provider of ["asaas", "bunny"]) {
    for (const aal of ["aal1", "aal2"]) {
      const { d, requests } = deps((url) => {
        if (url.pathname === "/auth/v1/user" && aal === "aal2") return response({ ...user, factors: [{ status: "verified" }] });
        if (url.pathname.endsWith("app_bootstrap")) return response({ profile: { role: "admin" } });
        if (url.pathname.endsWith("app_admin_integration_test_throttle")) return response({ code: "PT429" }, 429);
      });
      const result = await capabilities(d)(request({ action: "integration-test", provider }, { token: jwt({ aal }) }));
      equal(result.status, aal === "aal1" ? 403 : 429);
      equal((await result.json()).error.code, aal === "aal1" ? "MFA_REQUIRED" : "RATE_LIMITED");
      equal(requests.filter((r) => r.url.endsWith("app_admin_integration_test_throttle")).map((r) => r.body),
        aal === "aal1" ? [] : [{ p_actor_id: id }]);
      assert(!requests.some((r) => r.url.endsWith("app_integration_credentials") || !r.url.startsWith("http://127.0.0.1")));
    }
  }
});
Deno.test("rotation returns a newly generated token once, only after MFA and without accepting a supplied token", async () => {
  let stored: Record<string, string> = { env: "sandbox", sandbox_api_key: "fake-original-api" };
  const { d, requests } = deps((url, init) => {
    if (url.pathname.endsWith("app_bootstrap")) return response({ profile: { role: "admin" } });
    if (url.pathname === "/auth/v1/user") return response({ ...user, factors: [{ status: "verified" }] });
    if (url.pathname === "/auth/v1/token") return response({ access_token: jwt({ session_id: id }), refresh_token: "synthetic-refresh", token_type: "bearer", expires_in: 3600, user });
    if (url.pathname === "/auth/v1/logout") return response({});
    if (url.pathname.endsWith("app_confirm_reauth")) return response({ expires_at: new Date(Date.now() + 300_000).toISOString() });
    if (url.pathname.endsWith("app_integration_credentials")) return response(stored);
    if (url.pathname.endsWith("app_admin_save_integration")) {
      const fields = JSON.parse(String(init.body)).p_fields;
      stored = { ...stored, sandbox_webhook_token: fields.webhook_token, _updated_at: "2026-11-26T00:00:00Z", _updated_by_name: "Admin de teste" };
      return response(null);
    }
  });
  const body = { action: "rotate-asaas-webhook", environment: "sandbox", password: "fake-admin-password" };
  equal((await reauthenticate(d)(request(body))).status, 403);
  const bearer = { token: jwt({ aal: "aal2" }) };
  equal((await reauthenticate(d)(request({ ...body, webhook_token: "externally-supplied" }, bearer))).status, 422);
  equal((await capabilities(d)(request({ action: "integration-save", provider: "asaas", fields: { env: "sandbox", webhook_token: "externally-supplied" } }, bearer))).status, 422);
  const generatedResponse = await reauthenticate(d)(request(body, bearer));
  equal(generatedResponse.headers.get("cache-control"), "no-store");
  const { webhook_token: generated } = await generatedResponse.json();
  assert(/^[a-f0-9]{64}$/.test(generated));
  const state = await (await capabilities(d)(request({ action: "integration-status", provider: "asaas" }, bearer))).text();
  assert(!state.includes(generated) && !state.includes("fake-original-api"));
  const result = JSON.parse(state);
  equal(result.fields.webhook_token.suffix, generated.slice(-4));
  equal(result.updated_by, "Admin de teste");
  equal(requests.filter((r) => r.url.endsWith("app_admin_save_integration")).length, 1);
});
Deno.test("member cannot inspect integrations and missing Bunny or webhook stays 503", async () => {
  const { d, requests } = deps((url) => url.pathname.endsWith("app_media_access") ? response({ can_access: true, provider: "bunny", video_id: other }) : undefined);
  const result = await capabilities(d)(request({ action: "integration-status", provider: "bunny" }));
  equal(result.status, 403);
  assert(!requests.some((r) => r.url.endsWith("app_integration_credentials")));
  equal((await media(d)(request({ kind: "lesson", id }))).status, 503);
  equal((await webhook(d)(request({}, { token: null }))).status, 503);
});
const bunnyVault = { library_id: "42", api_key: "synthetic-stream-key", token_key: "synthetic-player-key", cdn_host: "vz-fixture.b-cdn.net" };
function bunnySearch(profile: Record<string, unknown>, bunny: Route = () => undefined, stored: Record<string, string> = bunnyVault) {
  const found = deps((url, init) => {
    if (url.pathname.endsWith("app_bootstrap")) return response({ profile });
    if (url.pathname.endsWith("app_integration_credentials")) return response(stored);
    if (url.hostname === "video.bunnycdn.com") return bunny(url, init);
  });
  const search = (body: Record<string, unknown> = {}) => capabilities(found.d)(request({ action: "bunny-videos", query: "Módulo 1", page: 2, ...body }));
  const outside = () => found.requests.filter((r) => !r.url.startsWith("http://127.0.0.1"));
  return { ...found, search, outside };
}
Deno.test("instrutor busca vídeos do Bunny e recebe só id, título, duração e situação", async () => {
  const { requests, search, outside } = bunnySearch({ role: "instructor" }, (_url, init) => {
    equal(init.redirect, "error"); assert(init.signal instanceof AbortSignal, "sem tempo máximo");
    return response({ totalItems: 1, currentPage: 2, itemsPerPage: 20, items: [{
      guid: other, title: "Módulo 1", length: 754, status: 4, videoLibraryId: 42, storageSize: 1024, thumbnailFileName: "thumbnail.jpg", captions: [],
    }] });
  });
  const result = await search();
  equal(result.status, 200);
  const body = await result.text();
  equal(JSON.parse(body), { items: [{ id: other, title: "Módulo 1", length: 754, ready: true }], total: 1, page: 2 });
  assert(!body.includes("synthetic-stream-key"), "chave na resposta");
  equal(outside().map((r) => r.url), ["https://video.bunnycdn.com/library/42/videos?page=2&itemsPerPage=20&orderBy=date&search=M%C3%B3dulo%201"]);
  equal(outside()[0].headers.get("accesskey"), "synthetic-stream-key");
  equal(requests.filter((r) => r.url.endsWith("app_staff_bunny_search_throttle")).map((r) => r.body), [{ p_actor_id: id }]);
});
Deno.test("membro não busca vídeos do Bunny", async () => {
  for (const profile of [{ role: "member" }, { role: "moderator" }, { role: "support" }, { role: "instructor", demo: true }, { role: "admin", password_setup_required: true }]) {
    const { requests, search } = bunnySearch(profile, () => response({ totalItems: 0, items: [] }));
    const result = await search();
    equal(result.status, 403);
    assert(!requests.some((r) => r.url.endsWith("app_integration_credentials") || r.url.endsWith("app_staff_bunny_search_throttle") || !r.url.startsWith("http://127.0.0.1")),
      `${JSON.stringify(profile)} chegou ao Bunny`);
  }
});
Deno.test("busca longa é recusada antes do Bunny", async () => {
  for (const body of [{ query: "a".repeat(101) }, { query: 42 }, { page: 0 }, { page: 1001 }, { page: 1.5 }, { page: "2" }]) {
    const { requests, search } = bunnySearch({ role: "admin" }, () => response({ totalItems: 0, items: [] }));
    const result = await search(body);
    equal(result.status, 422);
    assert(!requests.some((r) => r.url.endsWith("app_integration_credentials") || !r.url.startsWith("http://127.0.0.1")), `${JSON.stringify(body)} chegou ao Bunny`);
  }
  const { search, outside } = bunnySearch({ role: "admin" }, () => response({ totalItems: 0, currentPage: 1000, items: [] }));
  equal(await (await search({ query: "a".repeat(100), page: 1000 })).json(), { items: [], total: 0, page: 1000 });
  equal(outside().length, 1);
});
Deno.test("chave recusada pelo Bunny vira mensagem clara", async () => {
  const refused = "A API do Bunny Stream recusou a chave. Confira as credenciais salvas.";
  const unavailable = "A API do Bunny Stream está indisponível. Tente novamente.";
  for (const [status, message] of [[401, refused], [403, refused], [500, unavailable], [0, unavailable]] as const) {
    const { search } = bunnySearch({ role: "admin" }, () => {
      if (!status) throw new TypeError("network");
      return response({ Message: "synthetic-stream-key inválida" }, status);
    });
    const result = await search();
    equal(result.status, 502);
    const body = await result.text();
    equal(JSON.parse(body).error.message, message);
    assert(!body.includes("synthetic-stream-key"), "chave na resposta");
  }
});
Deno.test("Bunny sem chave salva responde BUNNY_NOT_CONFIGURED", async () => {
  for (const stored of [{ library_id: "42", token_key: "synthetic-player-key" }, { ...bunnyVault, library_id: "biblioteca" }]) {
    const { search, outside } = bunnySearch({ role: "instructor" }, () => response({ totalItems: 0, items: [] }), stored);
    const result = await search();
    equal(result.status, 409);
    equal((await result.json()).error, { code: "BUNNY_NOT_CONFIGURED", message: "Configure o Bunny Stream em Configurações > Integrações." });
    equal(outside(), []);
  }
});
Deno.test("checkout in production requires switch proof for the current keys and the Turnstile secret", async () => {
  const apiKey = "fake-asaas-production";
  const config = { ...billing, ASAAS_ENV: "production", ASAAS_API_KEY: apiKey, ICARUS_MODE: "production" };
  const fingerprint = await sha256(JSON.stringify([apiKey, billing.ASAAS_WEBHOOK_TOKEN]));
  for (const [activeHash, captcha, status, code] of [
    [undefined, "fake-captcha", 503, "CONFIGURATION_REQUIRED"],
    ["stale", "fake-captcha", 503, "CONFIGURATION_REQUIRED"],
    [fingerprint, "", 503, "CAPTCHA_UNAVAILABLE"],
    [fingerprint, "fake-captcha", 200, undefined],
  ] as const) {
    const { d, requests } = deps((url) => {
      if (url.pathname.endsWith("app_integration_credentials")) return response({ _production_active_hash: activeHash });
      if (url.hostname === "challenges.cloudflare.com") return response({ success: true });
      if (url.pathname.endsWith("app_checkout_begin")) return response({ order_id: id, asaas_environment: "production", create_gateway: true, amount_cents: 1000, plan_name: "Teste" });
      if (url.hostname === "api.asaas.com") return response({ id: other });
      if (url.pathname.endsWith("app_checkout_gateway")) return response({ id });
    }, { ...config, TURNSTILE_SECRET_KEY: captcha });
    const result = await checkout(d)(request({ ...purchase, captcha_token: "synthetic-captcha-response" }, { token: null }));
    equal(result.status, status);
    const order = await result.json();
    if (code) equal(order.error.code, code);
    else {
      equal(new URL(order.url).hostname, "asaas.com");
      equal(order.asaas_environment, "production");
    }
    equal(requests.some((r) => r.url.includes("api.asaas.com")), status === 200);
  }
});
Deno.test("production activation accepts only recent provider proof and sends reauthentication to the restricted RPC", async () => {
  const apiKey = "fake-production-api-key";
  const fingerprint = await sha256(JSON.stringify([apiKey, billing.ASAAS_WEBHOOK_TOKEN]));
  let proofTime = new Date(Date.now() - 25 * 3_600_000).toISOString();
  const { d, requests } = deps((url, init) => {
    if (url.pathname === "/auth/v1/user") return response({ ...user, factors: [{ status: "verified" }] });
    if (url.pathname.endsWith("app_bootstrap")) return response({ profile: { role: "admin" } });
    if (url.pathname.endsWith("app_integration_credentials")) return response({
      env: "production", production_api_key: apiKey, production_webhook_token: billing.ASAAS_WEBHOOK_TOKEN,
      _production_test_hash: fingerprint, _production_tested_at: proofTime,
    });
    if (url.hostname === "api.asaas.com") return response({ data: [] });
    if (url.pathname.endsWith("app_admin_asaas_production")) {
      if (JSON.parse(String(init.body)).p_action === "test") proofTime = new Date().toISOString();
      return response(null);
    }
  });
  const setter = { action: "integration-production", provider: "asaas", enabled: true, reauth_token: "fake-password-confirmation" };
  const bearer = { token: jwt({ aal: "aal2" }) };
  equal((await capabilities(d)(request(setter, bearer))).status, 409);
  equal((await capabilities(d)(request({ action: "integration-test", provider: "asaas" }, bearer))).status, 200);
  equal((await capabilities(d)(request(setter, bearer))).status, 200);
  equal(requests.filter((r) => r.url.endsWith("app_admin_asaas_production")).map((r) => r.body), [
    { p_actor_id: id, p_action: "test", p_fingerprint: fingerprint },
    { p_actor_id: id, p_action: "enable", p_fingerprint: fingerprint, p_reauth_token: "fake-password-confirmation" },
  ]);
});
Deno.test("the global order limit returns 429 before any payment request, even without IP", async () => {
  const { d, requests } = deps((url) => url.pathname.endsWith("app_checkout_begin")
    ? response({ code: "PT429" }, 429) : undefined, billing);
  const result = await checkout(d)(request(purchase, { token: null }));
  equal(result.status, 429);
  equal((await result.json()).error.code, "RATE_LIMITED");
  assert(!requests.some((r) => r.url.includes("asaas.com")));
});
Deno.test("CHECKOUT_PAID from the Vault is persisted only if the Asaas confirms it in the order's environment", async () => {
  for (const [providerStatus, orderEnvironment, status] of [
    ["PENDING", "sandbox", 409], ["CONFIRMED", "production", 409], ["CONFIRMED", "sandbox", 200],
  ] as const) {
    const { d, requests } = deps((url) => {
      if (url.pathname.endsWith("app_integration_credentials")) return response({
        env: "sandbox", sandbox_api_key: "fake-reconciliation-key", sandbox_webhook_token: billing.ASAAS_WEBHOOK_TOKEN,
      });
      if (url.pathname.endsWith("app_payment_context")) return response({ order_id: id, gateway_id: other, asaas_environment: orderEnvironment });
      if (url.hostname === "api-sandbox.asaas.com") {
        equal(url.searchParams.get("checkoutSession"), other);
        return paidPayments(10, providerStatus);
      }
      if (url.pathname.endsWith("app_process_payment")) return response({ duplicate: false });
    });
    const body = { id: "evt_vault", event: "CHECKOUT_PAID", checkout: { id: other, externalReference: id, billingTypes: ["PIX"], items: [{ value: 10, quantity: 1 }] } };
    const result = await webhook(d)(request(body, { token: null, headers: { "asaas-access-token": billing.ASAAS_WEBHOOK_TOKEN } }));
    equal(result.status, status);
    equal(requests.some((r) => r.url.endsWith("app_process_payment")), status === 200);
    equal(requests.find((r) => r.url.includes("api-sandbox.asaas.com"))?.headers.get("access_token"),
      orderEnvironment === "sandbox" ? "fake-reconciliation-key" : undefined);
  }
});
Deno.test("media requires server object gate before signing", async () => {
  const { d, requests } = deps((url) => url.pathname.endsWith("app_media_access") ? response({ message: "denied", code: "42501" }, 403) : undefined);
  equal((await media(d)(request({ kind: "lesson", id: other, user_id: other }))).status, 403);
  assert(!requests.some((r) => r.url.includes("/storage/")));
  equal(requests.find((r) => r.url.includes("app_media_access"))!.body, { p_actor_id: id, p_kind: "lesson", p_id: other });
});
Deno.test("Bunny signs server gated video for 120s without exposing key", async () => {
  const { d } = deps((url) => url.pathname.endsWith("app_media_access") ? response({ can_access: true, provider: "bunny", video_id: other }) : undefined, { BUNNY_LIBRARY_ID: "759", BUNNY_TOKEN_KEY: "synthetic-signing-key", BUNNY_ALLOWED_DOMAIN: "127.0.0.1" });
  const result = await media(d)(request({ kind: "lesson", id })); equal(result.status, 200);
  const body = await result.json(), url = new URL(body.url), expires = url.searchParams.get("expires")!;
  equal(url.searchParams.get("token"), await sha256("synthetic-signing-key" + other + expires));
  assert(Number(expires) <= Math.floor(Date.now() / 1000) + 120); assert(!JSON.stringify(body).includes("synthetic-signing-key"));
});
Deno.test("aula com vídeo do YouTube sai pelo player sem cookies, só depois da liberação do servidor", async () => {
  const gated = (video_id: string) => deps((url) => url.pathname.endsWith("app_media_access") ? response({ can_access: true, provider: "youtube", video_id }) : undefined).d;
  const result = await media(gated("dQw4w9WgXcQ"))(request({ kind: "lesson", id }));
  equal(result.status, 200);
  const body = await result.json();
  equal(body.provider, "youtube"); equal(body.url, "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0");
  equal((await media(gated("javascript:alert(1)"))(request({ kind: "lesson", id }))).status, 503);
});
Deno.test("storage URL uses private bucket, server path and short TTL", async () => {
  const { d, requests } = deps((url) => url.pathname.endsWith("app_media_access") ? response({ can_access: true, storage_path: "synthetic/lesson.mp4", provider: "supabase" }) : url.pathname.includes("/storage/v1/object/sign/") ? response({ signedURL: "/object/sign/icarus-private/synthetic/lesson.mp4?token=test-only" }) : undefined);
  equal((await media(d)(request({ kind: "lesson", id, storage_path: "other-user/secret" }))).status, 200);
  const signed = requests.find((r) => r.url.includes("/storage/"))!;
  assert(signed.url.includes("icarus-private/synthetic/lesson.mp4")); equal(signed.body, { expiresIn: 120 });
});
Deno.test("capa do curso sai com o foco do corte, e os outros arquivos sem ele", async () => {
  const gated = (focus: string | null) => deps((url) => url.pathname.endsWith("app_media_access") ? response({ can_access: true, storage_path: "course-cover/synthetic.jpg", provider: "supabase", focus }) : url.pathname.includes("/storage/v1/object/sign/") ? response({ signedURL: "/object/sign/icarus-private/course-cover/synthetic.jpg?token=test-only" }) : undefined).d;
  const cover = await (await media(gated("20% 70%"))(request({ kind: "course-cover", id }))).json();
  equal(cover.focus, "20% 70%"); assert(cover.url.includes("course-cover/synthetic.jpg")); equal(cover.provider, "supabase");
  const lesson = await (await media(gated(null))(request({ kind: "lesson", id }))).json();
  assert(lesson.url && !("focus" in lesson));
});
Deno.test("webhook token checked before parsing or persistence", async () => {
  for (const secret of [null, "wrong-token"]) {
    const { d, requests } = deps(() => undefined, billing);
    equal((await webhook(d)(request({ secret: "not-an-event" }, { token: null, headers: secret ? { "asaas-access-token": secret } : {} }))).status, 401);
    equal(requests.length, 0);
  }
  assert(await constantEqual("same", "same")); assert(!(await constantEqual("same", "different")));
});
Deno.test("webhook normalizes minimal event and waits DB persistence before 200", async () => {
  const { d, requests } = deps((url) => url.pathname.endsWith("app_payment_context") ? response({ order_id: id, gateway_id: other, asaas_environment: "sandbox" }) : url.hostname === "api-sandbox.asaas.com" ? paidPayments(10.15) : url.pathname.endsWith("app_process_payment") ? response({ order_id: id, status: "paid", duplicate: false, invite_pending: false }) : undefined, billing);
  const body = { id: "evt_synthetic", event: "CHECKOUT_PAID", checkout: { id: other, externalReference: id, billingTypes: ["PIX"], items: [{ value: 10.15, quantity: 1 }], customerData: { email: buyer.email } } };
  const result = await webhook(d)(request(body, { token: null, headers: { "asaas-access-token": billing.ASAAS_WEBHOOK_TOKEN } })); equal(result.status, 200);
  equal(requests.find((r) => r.url.includes("app_process_payment"))!.body, { p_event: { id: "evt_synthetic", type: "paid", order_id: id, gateway_id: other, amount_cents: 1015, method: "PIX" } });
  assert(requests.findIndex((r) => r.url.includes("/v3/payments")) < requests.findIndex((r) => r.url.endsWith("app_process_payment")));
  assert(!JSON.stringify(await result.json()).includes(buyer.email));
});
Deno.test("invalid amount and ambiguous checkout methods reject before DB", async () => {
  for (const value of [0, -1, 1.001, Infinity]) {
    let rejected = false;
    try { normalizeEvent({ id: "evt", event: "CHECKOUT_PAID", checkout: { id, externalReference: other, billingTypes: ["PIX"], items: [{ value, quantity: 1 }] } }); } catch { rejected = true; }
    assert(rejected);
  }
});
Deno.test("guest checkout reserves order before provider; existing attempt never calls Asaas", async () => {
  for (const reserved of [true, false]) {
    const { d, requests } = deps((url) => url.pathname.endsWith("app_checkout_begin") ? response({ order_id: id, asaas_environment: "sandbox", amount_cents: 1000, plan_name: "DEMONSTRAÇÃO", status: "pending", create_gateway: reserved }) : url.hostname === "api-sandbox.asaas.com" ? response({ id: other }) : url.pathname.endsWith("app_checkout_gateway") ? response({ id, status: "pending" }) : undefined, billing);
    const result = await checkout(d)(request(purchase, { token: null }));
    equal(result.status, reserved ? 200 : 409);
    equal(requests.filter((r) => r.url.includes("api-sandbox.asaas.com")).length, reserved ? 1 : 0);
    equal(requests[0].body && (requests[0].body as Record<string, unknown>).p_actor_id, null);
    if (reserved) { const body = await result.json(); equal(body.status, "pending"); assert(body.receipt_token.length === 64); assert(!JSON.stringify(body).includes(buyer.email)); }
  }
});
Deno.test("guest browser receipt is bound by hash and stays outside provider request and responses", async () => {
  const token = "synthetic-browser-receipt", hash = await sha256(token);
  let reserved = false;
  const { d, requests } = deps((url, init) => {
    if (url.pathname.endsWith("app_checkout_begin")) {
      const { p_receipt_hash } = JSON.parse(String(init.body));
      equal(p_receipt_hash, hash);
      if (reserved) return response({ order_id: id, asaas_environment: "sandbox", status: "pending", checkout_url: "https://sandbox.asaas.com/checkoutSession/show?id=fixture" });
      reserved = true;
      return response({ order_id: id, asaas_environment: "sandbox", amount_cents: 1000, plan_name: "DEMONSTRAÇÃO", create_gateway: true });
    }
    if (url.hostname === "api-sandbox.asaas.com") return response({ id: other });
    if (url.pathname.endsWith("app_checkout_gateway")) return response({ id });
    if (url.pathname.endsWith("app_order_status")) {
      assert(!String(init.body).includes(token));
      return JSON.parse(String(init.body)).p_receipt_hash === hash
        ? response({ order_id: id, status: "pending", amount_cents: 1000, access_granted: false })
        : response({ code: "P0001" }, 400);
    }
  }, billing);
  for (const invalid of [null, "invalid", hash + "\n"])
    equal((await checkout(d)(request({ ...purchase, receipt_hash: invalid }, { token: null }))).status, 422);
  equal(requests.length, 0);
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await checkout(d)(request({ ...purchase, receipt_hash: hash }, { token: null }));
    equal(result.status, 200);
    equal(result.headers.get("cache-control"), "no-store");
    const data = await result.json();
    equal(data.asaas_environment, "sandbox");
    assert(!JSON.stringify(data).includes("receipt"));
  }
  const provider = requests.filter((r) => r.url.includes("api-sandbox.asaas.com"));
  equal(provider.length, 1);
  assert(!JSON.stringify(provider[0]).includes(hash) && !JSON.stringify(provider[0]).includes(token));
  const denied = await orderStatus(d)(request({ order_id: id, receipt_token: hash }, { token: null }));
  equal(denied.status, 422);
  const accepted = await orderStatus(d)(request({ order_id: id, receipt_token: token }, { token: null }));
  equal(accepted.status, 200);
  equal(accepted.headers.get("cache-control"), "no-store");
  equal(await accepted.json(), { order_id: id, status: "pending", amount_cents: 1000, access_granted: false });
});
Deno.test("authenticated checkout email is native Auth email", async () => {
  const { d, requests } = deps((url) => url.pathname.endsWith("app_checkout_begin") ? response({ order_id: id, asaas_environment: "sandbox", status: "pending", checkout_url: "https://sandbox.asaas.com/checkoutSession/show?id=test" }) : undefined, billing);
  equal((await checkout(d)(request(purchase))).status, 200);
  const args = requests.find((r) => r.url.includes("app_checkout_begin"))!.body as Record<string, Record<string, string>>;
  equal(args.p_buyer_data.email, user.email);
});
Deno.test("order status needs actor or receipt, never email", async () => {
  const { d, requests } = deps();
  equal((await orderStatus(d)(request({ order_id: id, email: buyer.email }, { token: null }))).status, 401); equal(requests.length, 0);
});
Deno.test("public SDK anon bearer is guest; arbitrary invalid bearer is rejected", async () => {
  const { d, requests } = deps((url) => url.pathname.endsWith("app_checkout_begin") ? response({ order_id: id, asaas_environment: "sandbox", status: "pending", checkout_url: "https://sandbox.asaas.com/checkoutSession/show?id=test" }) : undefined, billing);
  equal((await checkout(d)(request(purchase, { token: "local-public" }))).status, 200);
  equal((requests.find((r) => r.url.includes("app_checkout_begin"))!.body as Record<string, unknown>).p_actor_id, null);
});
Deno.test("refund resolves payment id through official checkoutSession filter", async () => {
  const { d, requests } = deps((url) => url.pathname.endsWith("app_payment_context") ? response({ order_id: id, gateway_id: other, asaas_environment: "sandbox" }) : url.hostname === "api-sandbox.asaas.com" ? response({ hasMore: false, data: [{ id: "pay_synthetic", value: 10.15, billingType: "PIX", status: "REFUNDED" }] }) : url.pathname.endsWith("app_process_payment") ? response({ status: "refunded", duplicate: false }) : undefined, billing);
  const result = await webhook(d)(request({ id: "evt_refund_synthetic", event: "PAYMENT_REFUNDED", payment: { id: "pay_synthetic", externalReference: id, value: 10.15, billingType: "PIX" } }, { token: null, headers: { "asaas-access-token": billing.ASAAS_WEBHOOK_TOKEN } }));
  equal(result.status, 200);
  assert(requests.some((r) => r.url.includes(`checkoutSession=${other}`)));
  const event = (requests.find((r) => r.url.includes("app_process_payment"))!.body as { p_event: { gateway_id: string } }).p_event;
  equal(event.gateway_id, other);
});
Deno.test("unlinked refund never reaches financial transition", async () => {
  const { d, requests } = deps((url) => url.pathname.endsWith("app_payment_context") ? response({ order_id: id, gateway_id: other, asaas_environment: "sandbox" }) : url.hostname === "api-sandbox.asaas.com" ? response({ hasMore: false, data: [{ id: "another-payment", value: 10, billingType: "PIX" }] }) : undefined, billing);
  const result = await webhook(d)(request({ id: "evt_unlinked_synthetic", event: "PAYMENT_REFUNDED", payment: { id: "pay_synthetic", externalReference: id, value: 10, billingType: "PIX" } }, { token: null, headers: { "asaas-access-token": billing.ASAAS_WEBHOOK_TOKEN } }));
  equal(result.status, 409); assert(!requests.some((r) => r.url.includes("app_process_payment")));
});
for (const role of ["member", "admin"]) Deno.test(`reauth without factor verifies native password for ${role} and revokes only secondary session`, async () => {
  let stored: Record<string, unknown> = {};
  const { d, requests } = deps((url, init) => {
    if (url.pathname.endsWith("app_bootstrap")) return response({ profile: { role } });
    if (url.pathname === "/auth/v1/token") return response({ access_token: jwt({ session_id: id }), refresh_token: "synthetic-refresh", token_type: "bearer", expires_in: 3600, user });
    if (url.pathname.endsWith("app_confirm_reauth")) { stored = JSON.parse(String(init.body)); return response({ expires_at: new Date(Date.now() + 300_000).toISOString() }); }
    if (url.pathname === "/auth/v1/logout") { equal(url.searchParams.get("scope"), "local"); assert(new Headers(init.headers).get("authorization") !== `Bearer ${jwt()}`); return response({}); }
  });
  const result = await reauthenticate(d)(request({ password: " synthetic password " })); equal(result.status, 200);
  const body = await result.json(); equal(stored.p_actor_id, id); equal(stored.p_session_id, other); equal(stored.p_token_hash, await sha256(body.token));
  const token = requests.find((r) => r.url.includes("/auth/v1/token"))!;
  equal((token.body as Record<string, string>).password, " synthetic password ");
  equal(token.headers.get("apikey"), "local-test-secret");
  assert(requests.some((r) => r.url.includes("/auth/v1/logout")));
});
Deno.test("verified staff AAL1 reauth denies before password verification", async () => {
  const { d, requests } = deps((url) => url.pathname.endsWith("app_bootstrap") ? response({ profile: { role: "admin" } }) : url.pathname === "/auth/v1/user" ? response({ ...user, factors: [{ id: other, status: "verified", factor_type: "totp" }] }) : undefined);
  const result = await reauthenticate(d)(request({ password: "test-only-password" })); equal(result.status, 403); equal((await result.json()).error.code, "MFA_REQUIRED");
  assert(!requests.some((r) => r.url.includes("/token")));
});
Deno.test("upload rejects disguised file before gate or storage", async () => {
  const { d, requests } = deps();
  const form = new FormData(); form.set("kind", "ticket-attachment"); form.set("resource_id", id); form.set("file", new File(["<script>bad</script>"], "fake.pdf", { type: "application/pdf" }));
  equal((await upload(d)(new Request("http://localhost/upload", { method: "POST", headers: { authorization: `Bearer ${jwt()}` }, body: form }))).status, 422);
  assert(!requests.some((r) => r.url.includes("app_upload_access") || r.url.includes("/storage/")));
});
Deno.test("avatar aceita só JPG ou PNG reais de até 500 KB", async () => {
  const send = (d: Dependencies, file: File) => {
    const form = new FormData(); form.set("kind", "avatar"); form.set("resource_id", id); form.set("file", file);
    return upload(d)(new Request("http://localhost/upload", { method: "POST", headers: { authorization: `Bearer ${jwt()}` }, body: form }));
  };
  const jpeg = (size: number) => { const bytes = new Uint8Array(size); bytes.set([255, 216, 255, 224]); return bytes; };
  const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13]);
  for (const file of [
    new File([jpeg(500 * 1024 + 1)], "avatar.jpg", { type: "image/jpeg" }),
    new File([new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ")], "avatar.webp", { type: "image/webp" }),
    new File([new TextEncoder().encode("isto não é uma imagem")], "avatar.jpg", { type: "image/jpeg" }),
  ]) {
    const { d, requests } = deps();
    equal((await send(d, file)).status, 422);
    assert(!requests.some((r) => r.url.includes("app_upload_access") || r.url.includes("/storage/")), file.name);
  }
  for (const file of [new File([jpeg(500 * 1024)], "avatar.jpg", { type: "image/jpeg" }), new File([png], "avatar.png", { type: "image/png" })]) {
    const { d, requests } = deps((url) => url.pathname.endsWith("app_upload_access") ? response({ id, bucket: "icarus-private", path: `avatar/${id}/${other}.jpg` }) : url.pathname.includes("/storage/v1/object/icarus-private/") ? response({ Key: "icarus-private/avatar" }) : url.pathname.endsWith("app_upload_finalize") ? response({ id, state: "ready" }) : undefined);
    equal((await send(d, file)).status, 200);
    equal(requests.find((r) => r.url.includes("app_upload_access"))?.body, { p_actor_id: id, p_kind: "avatar", p_resource_id: id, p_file_name: file.name, p_content_type: file.type, p_size_bytes: file.size });
  }
});
Deno.test("capa do curso aceita imagem de até 500 KB", async () => {
  const send = (d: Dependencies, file: File) => {
    const form = new FormData(); form.set("kind", "course-cover"); form.set("resource_id", other); form.set("file", file);
    return upload(d)(new Request("http://localhost/upload", { method: "POST", headers: { authorization: `Bearer ${jwt()}` }, body: form }));
  };
  const jpeg = (size: number) => { const bytes = new Uint8Array(size); bytes.set([255, 216, 255, 224]); return bytes; };
  const big = deps();
  const refused = await send(big.d, new File([jpeg(500 * 1024 + 1)], "capa.jpg", { type: "image/jpeg" }));
  equal(refused.status, 422);
  equal((await refused.json()).error, { code: "INVALID_FILE", message: "A capa precisa ser PNG, JPG ou WebP de até 500 KB." });
  assert(!big.requests.some((r) => r.url.includes("app_upload_access") || r.url.includes("/storage/")));
  const file = new File([jpeg(500 * 1024)], "capa.jpg", { type: "image/jpeg" });
  const { d, requests } = deps((url) => url.pathname.endsWith("app_upload_access") ? response({ id, bucket: "icarus-private", path: `course-cover/${other}/${id}.jpg` }) : url.pathname.includes("/storage/v1/object/icarus-private/") ? response({ Key: "icarus-private/course-cover" }) : url.pathname.endsWith("app_upload_finalize") ? response({ id, state: "ready" }) : undefined);
  equal((await send(d, file)).status, 200);
  equal(requests.find((r) => r.url.includes("app_upload_access"))?.body, { p_actor_id: id, p_kind: "course-cover", p_resource_id: other, p_file_name: "capa.jpg", p_content_type: "image/jpeg", p_size_bytes: 500 * 1024 });
  // A reserva em JSON é só de material. Por ela a capa escaparia do limite.
  const reserve = deps();
  equal((await upload(reserve.d)(request({ action: "reserve", kind: "course-cover", resource_id: other, file_name: "capa.jpg", content_type: "image/jpeg", size_bytes: 500 * 1024 }))).status, 422);
  assert(!reserve.requests.some((r) => r.url.includes("app_upload_access")));
});
Deno.test("reserva de material aceita PDF até 5 MB e ZIP até 500 MiB", async () => {
  const { d, requests } = deps((url) => url.pathname.endsWith("app_upload_access") ? response({ id, bucket: "icarus-private", path: `material/${other}/${id}.pdf`, expires_at: new Date(Date.now() + 900_000).toISOString() }) : undefined);
  const pdf = { action: "reserve", kind: "material", resource_id: other, file_name: "demo.pdf", content_type: "application/pdf", size_bytes: 5242880 };
  const result = await upload(d)(request(pdf)); equal(result.status, 200); equal((await result.json()).method, "storage");
  assert(!requests.some((r) => r.url.includes("/storage/")));
  const count = requests.filter((r) => r.url.includes("app_upload_access")).length;
  const refused = await upload(d)(request({ ...pdf, size_bytes: 5242881 }));
  equal(refused.status, 422);
  equal((await refused.json()).error.message, "Imagens aceitam até 500 KB e PDFs até 5 MB.");
  equal(requests.filter((r) => r.url.includes("app_upload_access")).length, count);
  const zip = { ...pdf, file_name: "demo.zip", content_type: "application/zip", size_bytes: 500 * 1024 * 1024 };
  equal((await upload(d)(request(zip))).status, 200);
  equal((await upload(d)(request({ ...zip, size_bytes: zip.size_bytes + 1 }))).status, 422);
});
Deno.test("reserva de vídeo da aula e MP4 de material são recusados com a frase do vídeo", async () => {
  const noVideo = { code: "INVALID_FILE", message: "A plataforma não recebe vídeo. Use o Bunny Stream ou o YouTube." };
  const mp4 = { file_name: "aula.mp4", content_type: "video/mp4", size_bytes: 1024 };
  for (const body of [
    { action: "reserve", kind: "lesson", resource_id: other, ...mp4 },
    { action: "reserve", kind: "lesson", resource_id: other, file_name: "roteiro.pdf", content_type: "application/pdf", size_bytes: 1024 },
    { action: "reserve", kind: "material", resource_id: other, ...mp4 },
    { action: "reserve", kind: "material", resource_id: other, ...mp4, size_bytes: 2 * 1024 * 1024 * 1024 },
  ]) {
    const { d, requests } = deps();
    const refused = await upload(d)(request(body));
    equal(refused.status, 422);
    equal((await refused.json()).error, noVideo);
    assert(!requests.some((r) => r.url.includes("app_upload_access") || r.url.includes("/storage/")), `${body.kind} ${body.file_name}`);
  }
  const video = new Uint8Array(16); video.set(new TextEncoder().encode("ftypisom"), 4);
  for (const kind of ["lesson", "material", "ticket-attachment"]) {
    const { d, requests } = deps();
    const form = new FormData(); form.set("kind", kind); form.set("resource_id", other); form.set("file", new File([video], "tela.mp4", { type: "video/mp4" }));
    const refused = await upload(d)(new Request("http://localhost/upload", { method: "POST", headers: { authorization: `Bearer ${jwt()}` }, body: form }));
    equal(refused.status, 422);
    equal((await refused.json()).error, noVideo);
    assert(!requests.some((r) => r.url.includes("app_upload_access") || r.url.includes("/storage/")), kind);
  }
});
Deno.test("multipart recusa imagem acima de 500 KB e PDF acima de 5 MB antes da reserva", async () => {
  const send = (d: Dependencies, kind: string, file: File) => {
    const form = new FormData(); form.set("kind", kind); form.set("resource_id", other); form.set("file", file);
    return upload(d)(new Request("http://localhost/upload", { method: "POST", headers: { authorization: `Bearer ${jwt()}` }, body: form }));
  };
  const sized = (head: number[], size: number) => { const bytes = new Uint8Array(size); bytes.set(head); return bytes; };
  const png = (size: number) => sized([137, 80, 78, 71, 13, 10, 26, 10], size);
  const pdf = (size: number) => sized([...new TextEncoder().encode("%PDF-1.7")], size);
  for (const [kind, file] of [
    ["post-image", new File([png(512001)], "foto.png", { type: "image/png" })],
    ["ticket-attachment", new File([png(512001)], "foto.png", { type: "image/png" })],
    ["ticket-attachment", new File([pdf(5242881)], "doc.pdf", { type: "application/pdf" })],
  ] as const) {
    const { d, requests } = deps();
    const refused = await send(d, kind, file);
    equal(refused.status, 422);
    equal((await refused.json()).error.message, "Imagens aceitam até 500 KB e PDFs até 5 MB.");
    assert(!requests.some((r) => r.url.includes("app_upload_access") || r.url.includes("/storage/")), `${kind} ${file.name}`);
  }
  const { d, requests } = deps((url) => url.pathname.endsWith("app_upload_access") ? response({ id, bucket: "icarus-private", path: `ticket-attachment/${other}/${id}.pdf` }) : url.pathname.includes("/storage/v1/object/icarus-private/") ? response({ Key: "icarus-private/ticket" }) : url.pathname.endsWith("app_upload_finalize") ? response({ id, state: "ready" }) : undefined);
  equal((await send(d, "ticket-attachment", new File([pdf(5242880)], "doc.pdf", { type: "application/pdf" }))).status, 200);
  equal((requests.find((r) => r.url.includes("app_upload_access"))?.body as { p_size_bytes: number }).p_size_bytes, 5242880);
});
Deno.test("native finalize inspects ranged object bytes before ready", async () => {
  const { d, requests } = deps((url, init) => url.pathname.endsWith("app_upload_context") ? response({ bucket: "icarus-private", path: "material/demo.pdf", content_type: "application/pdf", size_bytes: 64, expires_at: new Date(Date.now() + 900_000).toISOString() }) : url.pathname.includes("/object/sign/") && init.method === "POST" ? response({ signedURL: "/object/sign/icarus-private/material/demo.pdf?token=test" }) : url.searchParams.has("token") ? new Response("%PDF-1.4\nfixture", { status: 206 }) : url.pathname.endsWith("app_upload_finalize") ? response({ id, state: "ready" }) : undefined);
  const result = await upload(d)(request({ action: "finalize", upload_id: id })); equal(result.status, 200);
  const ranged = requests.find((r) => r.url.includes("?token=")); assert(ranged);
  assert(requests.findIndex((r) => r.url.includes("?token=")) < requests.findIndex((r) => r.url.includes("app_upload_finalize")));
});
Deno.test("native finalize never marks disguised object ready", async () => {
  const { d, requests } = deps((url, init) => url.pathname.endsWith("app_upload_context") ? response({ bucket: "icarus-private", path: "material/demo.pdf", content_type: "application/pdf", expires_at: new Date(Date.now() + 900_000).toISOString() }) : url.pathname.includes("/object/sign/") && init.method === "POST" ? response({ signedURL: "/object/sign/icarus-private/material/demo.pdf?token=test" }) : url.searchParams.has("token") ? new Response("<script>disguised</script>", { status: 206 }) : undefined);
  equal((await upload(d)(request({ action: "finalize", upload_id: id }))).status, 422);
  assert(!requests.some((r) => r.url.includes("app_upload_finalize")));
});
Deno.test("human service RPC headers derive only from verified JWT, ignoring browser forged headers", async () => {
  const { d, requests } = deps((url) => url.pathname.endsWith("app_media_access") ? response({ code: "42501", message: "denied" }, 403) : undefined);
  await media(d)(request({ kind: "lesson", id }, { headers: { "x-icarus-session-id": id, "x-icarus-aal": "aal2" } }));
  const gate = requests.find((r) => r.url.includes("app_media_access"))!;
  equal(gate.headers.get("x-icarus-session-id"), other); equal(gate.headers.get("x-icarus-aal"), "aal1");
});
Deno.test("stale native session denies before service RPC", async () => {
  const { d, requests } = deps((url) => url.pathname.endsWith("app_touch_session") ? response({ code: "P0001", message: "expired" }, 400) : undefined);
  const result = await media(d)(request({ kind: "lesson", id })); assert(result.status >= 400);
  assert(!requests.some((r) => r.url.includes("app_media_access")));
});
Deno.test("checkout event cannot substitute a different stored gateway link", async () => {
  const { d, requests } = deps((url) => url.pathname.endsWith("app_payment_context") ? response({ order_id: id, gateway_id: id, asaas_environment: "sandbox" }) : undefined, billing);
  const body = { id: "evt_wrong_gateway", event: "CHECKOUT_PAID", checkout: { id: other, externalReference: id, billingTypes: ["PIX"], items: [{ value: 10, quantity: 1 }] } };
  equal((await webhook(d)(request(body, { token: null, headers: { "asaas-access-token": billing.ASAAS_WEBHOOK_TOKEN } }))).status, 409);
  assert(!requests.some((r) => r.url.includes("app_process_payment")));
});
Deno.test("DB persistence failure never acknowledges a webhook as received", async () => {
  const { d, requests } = deps((url) => url.pathname.endsWith("app_payment_context") ? response({ order_id: id, gateway_id: other, asaas_environment: "sandbox" }) : url.hostname === "api-sandbox.asaas.com" ? paidPayments(10) : url.pathname.endsWith("app_process_payment") ? response({ code: "XX000", message: "private internals" }, 500) : undefined, billing);
  const result = await webhook(d)(request({ id: "evt_storage_failure", event: "CHECKOUT_PAID", checkout: { id: other, externalReference: id, billingTypes: ["PIX"], items: [{ value: 10, quantity: 1 }] } }, { token: null, headers: { "asaas-access-token": billing.ASAAS_WEBHOOK_TOKEN } }));
  equal(result.status, 503); assert(!(await result.text()).includes("private internals"));
  assert(requests.some((r) => r.url.endsWith("app_process_payment")));
});
Deno.test("checkout timeout leaves reserved attempt for reconciliation, retry never creates second charge", async () => {
  let fresh = true, external = 0;
  const { d } = deps((url) => {
    if (url.pathname.endsWith("app_checkout_begin")) { const create = fresh; fresh = false; return response({ order_id: id, asaas_environment: "sandbox", amount_cents: 1000, plan_name: "DEMONSTRAÇÃO", create_gateway: create }); }
    if (url.hostname === "api-sandbox.asaas.com") { external++; throw new DOMException("Synthetic timeout", "TimeoutError"); }
  }, billing);
  equal((await checkout(d)(request(purchase, { token: null }))).status, 503);
  equal((await checkout(d)(request(purchase, { token: null }))).status, 409); equal(external, 1);
});
Deno.test("outbox recovery resolves confirmed account before creating any invitation", async () => {
  const { d, requests } = deps((url) => url.pathname.endsWith("app_finalize_paid_order") ? response({ id, finalized: true }) : undefined);
  equal(await finishPaidOrder(clients(d).admin, id, buyer.email, "http://127.0.0.1:8088"), { pending: false, delivery: "completed" });
  assert(!requests.some((r) => r.url.includes("/auth/")));
});
Deno.test("unconfirmed invitation failure keeps recovery pending without payment or forced confirmation", async () => {
  const { d, requests } = deps((url) => url.pathname.endsWith("app_finalize_paid_order") ? response({ id, finalized: false }) : url.pathname.endsWith("/auth/v1/admin/users") ? response({ ...user, email_confirmed_at: null }) : url.pathname.endsWith("/auth/v1/invite") ? response({ msg: "Synthetic delivery unavailable", code: "unexpected_failure" }, 500) : undefined);
  equal(await finishPaidOrder(clients(d).admin, id, buyer.email, "http://127.0.0.1:8088"), { pending: true, delivery: "uncertain" });
  const created = requests.find((r) => r.url.includes("/admin/users"))!.body as Record<string, unknown>;
  equal(created.email_confirm, false); equal(created.app_metadata, { icarus_server_created: true, icarus_password_setup_required: true }); assert(!("password" in created));
  assert(!requests.some((r) => r.url.includes("api-sandbox.asaas.com") || r.url.includes("app_process_payment")));
});
Deno.test("password setup uses native current JWT and clears flag only after native success", async () => {
  for (const success of [true, false]) {
    const { d, requests } = deps((url, init) => {
      if (url.pathname.endsWith("app_bootstrap")) return response({ profile: { role: "member", password_setup_required: true } });
      if (url.pathname === "/auth/v1/user" && init.method === "PUT") { equal(new Headers(init.headers).get("authorization"), `Bearer ${jwt()}`); return success ? response(user) : response({ code: "weak_password" }, 422); }
      if (url.pathname.endsWith("app_complete_password_setup")) return response({ completed: true });
    });
    const result = await passwordSetup(d)(request({ password: "Ic!9synthetic-first-password" })); equal(result.status, success ? 200 : 422);
    equal(requests.filter((r) => r.url.includes("app_complete_password_setup")).length, success ? 1 : 0);
    assert(!requests.some((r) => r.url.includes("/admin/users")));
  }
});
Deno.test("failed multipart cancels only an empty pending reservation, preserves an object after ambiguous failure", async () => {
  for (const exists of [false, true]) {
    const path = `ticket-attachment/${other}/${id}.pdf`;
    const { d, requests } = deps((url) => url.pathname.endsWith("app_upload_access") ? response({ id, bucket: "icarus-private", path }) : url.pathname.includes("/object/list/") ? response(exists ? [{ id: other, name: `${id}.pdf` }] : []) : url.pathname.includes("/storage/v1/object/icarus-private/") ? response({ statusCode: "500", message: "synthetic ambiguous failure", error: "Internal" }, 500) : url.pathname.endsWith("app_upload_cancel") ? response({ cancelled: true }) : undefined);
    const form = new FormData(); form.set("kind", "ticket-attachment"); form.set("resource_id", other); form.set("file", new File(["%PDF-1.4\nsynthetic\n"], "demo.pdf", { type: "application/pdf" }));
    equal((await upload(d)(new Request("http://localhost/upload", { method: "POST", headers: { authorization: `Bearer ${jwt()}` }, body: form }))).status, 503);
    equal(requests.filter((r) => r.url.includes("app_upload_cancel")).length, exists ? 0 : 1);
    assert(!requests.some((r) => r.method === "DELETE"));
  }
});
Deno.test("signed Storage origin is translated only for the configured internal API and private sign path", () => {
  const local = { SUPABASE_URL: "http://kong:8000", ICARUS_PUBLIC_SUPABASE_URL: "http://127.0.0.1:58521", ICARUS_MODE: "local" };
  const get = (name: string) => local[name as keyof typeof local];
  equal(publicStorageUrl("http://kong:8000/storage/v1/object/sign/icarus-private/demo.mp4?token=opaque&x=1", get), "http://127.0.0.1:58521/storage/v1/object/sign/icarus-private/demo.mp4?token=opaque&x=1");
  for (const value of ["http://unexpected:8000/storage/v1/object/sign/icarus-private/demo.mp4?token=opaque", "http://kong:8000/storage/v1/object/public/icarus-private/demo.mp4"]) { let failed = false; try { publicStorageUrl(value, get); } catch { failed = true; } assert(failed); }
  const cloud = "https://project.supabase.co/storage/v1/object/sign/icarus-private/demo.mp4?token=opaque";
  equal(publicStorageUrl(cloud, (name) => name === "SUPABASE_URL" ? "https://project.supabase.co" : undefined), cloud);
});
Deno.test("checkout optional phone and callback use the real /pedido route", async () => {
  const { d, requests } = deps((url) => url.pathname.endsWith("app_checkout_begin") ? response({ order_id: id, asaas_environment: "sandbox", amount_cents: 1000, plan_name: "DEMONSTRAÇÃO", create_gateway: true }) : url.hostname === "api-sandbox.asaas.com" ? response({ id: other }) : url.pathname.endsWith("app_checkout_gateway") ? response({ id }) : undefined, billing);
  equal((await checkout(d)(request({ ...purchase, buyer: { ...buyer, phone: "" } }, { token: null }))).status, 200);
  const posted = requests.find((r) => r.url.includes("api-sandbox.asaas.com"))!.body as { callback: Record<string, string> };
  const callback = `http://127.0.0.1:8088/pedido/${id}`;
  equal(posted.callback, { successUrl: callback, cancelUrl: callback, expiredUrl: callback });
});
Deno.test("paid webhook schedules claimed invitation after persistence and acknowledges before email completes", async () => {
  const tasks: Promise<unknown>[] = []; let release!: (value: Response) => void; let started!: () => void;
  const inviteStarted = new Promise<void>((resolve) => { started = resolve; });
  const { d, requests } = deps((url) => {
    if (url.pathname.endsWith("app_payment_context")) return response({ order_id: id, gateway_id: other, asaas_environment: "sandbox" });
    if (url.hostname === "api-sandbox.asaas.com") return paidPayments(10);
    if (url.pathname.endsWith("app_process_payment")) return response({ order_id: id, status: "paid", invite_pending: true });
    if (url.pathname.endsWith("app_claim_payment_invite")) return response({ claimed: true, invite_email: buyer.email });
    if (url.pathname.endsWith("app_finalize_paid_order")) return response({ finalized: false });
    if (url.pathname.endsWith("/admin/users")) return response({ ...user, email_confirmed_at: null });
    if (url.pathname.endsWith("/invite")) { started(); return new Promise<Response>((resolve) => { release = resolve; }); }
    if (url.pathname.endsWith("app_finish_payment_invite")) return response({ status: "sent" });
  }, billing);
  d.waitUntil = (task) => tasks.push(task);
  const result = await webhook(d)(request({ id: "evt_auto_invite", event: "CHECKOUT_PAID", checkout: { id: other, externalReference: id, billingTypes: ["PIX"], items: [{ value: 10, quantity: 1 }] } }, { token: null, headers: { "asaas-access-token": billing.ASAAS_WEBHOOK_TOKEN } }));
  equal(result.status, 200); await inviteStarted;
  assert(!requests.some((r) => r.url.endsWith("app_finish_payment_invite")));
  release(response({ ...user, email_confirmed_at: null })); await Promise.all(tasks);
  equal((requests.find((r) => r.url.endsWith("app_finish_payment_invite"))!.body as Record<string, unknown>).p_success, true);
});
Deno.test("definite invitation failure retries through claim; ambiguous delivery never auto-retries", async () => {
  for (const status of [429, 500]) {
    const { d, requests } = deps((url) => url.pathname.endsWith("app_claim_payment_invite") ? response({ claimed: true, invite_email: buyer.email }) : url.pathname.endsWith("app_finalize_paid_order") ? response({ finalized: false }) : url.pathname.endsWith("/admin/users") ? response({ ...user, email_confirmed_at: null }) : url.pathname.endsWith("/invite") ? response({ msg: "synthetic failure" }, status) : url.pathname.endsWith("app_finish_payment_invite") ? response({ status: status === 429 ? "pending" : "uncertain" }) : undefined);
    await deliverPaidInvite(clients(d).admin, id, "http://127.0.0.1:8088");
    equal((requests.find((r) => r.url.endsWith("app_finish_payment_invite"))!.body as Record<string, unknown>).p_success, status === 429 ? false : null);
    assert(!requests.some((r) => r.url.includes("api-sandbox.asaas.com")));
  }
});

const siteverify = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const turnstile = { TURNSTILE_SECRET_KEY: "synthetic-turnstile-secret" };
const reserve = (url: URL) => url.pathname.endsWith("app_checkout_begin") ? response({ order_id: id, asaas_environment: "sandbox", amount_cents: 1000, plan_name: "DEMONSTRAÇÃO", create_gateway: true }) : url.hostname === "api-sandbox.asaas.com" ? response({ id: other }) : url.pathname.endsWith("app_checkout_gateway") ? response({ id }) : undefined;
Deno.test("checkout com Turnstile configurado confere o token no servidor antes do pedido e do Asaas", async () => {
  for (const [token, answer, status] of [[undefined, null, 403], ["token-recusado", { success: false }, 403], ["token-valido", { success: true }, 200]] as const) {
    let verified: FormData | undefined;
    const { d, requests } = deps((url, init) => {
      if (url.href === siteverify) { verified = init.body as FormData; return response(answer); }
      return reserve(url);
    }, { ...billing, ...turnstile });
    const result = await checkout(d)(request({ ...purchase, ...(token ? { captcha_token: token } : {}) }, { token: null, headers: { "cf-connecting-ip": "203.0.113.7" } }));
    equal(result.status, status);
    equal(requests.some((r) => r.url.includes("app_checkout_begin")), status === 200);
    equal(requests.some((r) => r.url.includes("api-sandbox.asaas.com")), status === 200);
    if (status !== 200) equal((await result.json()).error.code, "CAPTCHA_FAILED");
    if (token) equal([verified?.get("secret"), verified?.get("response"), verified?.get("remoteip")], [turnstile.TURNSTILE_SECRET_KEY, token, "203.0.113.7"]);
    else equal(verified, undefined);
    // Desafio recusado não consome o limite: ninguém trava o email de outra pessoa sem resolver o Turnstile.
    equal(requests.some((r) => r.url.includes("app_checkout_throttle")), status === 200);
  }
});
Deno.test("checkout recusa a compra quando o Turnstile não responde", async () => {
  const { d, requests } = deps((url) => url.href === siteverify ? response({}, 500) : reserve(url), { ...billing, ...turnstile });
  const result = await checkout(d)(request({ ...purchase, captcha_token: "token-valido" }, { token: null }));
  equal(result.status, 503);
  assert(!requests.some((r) => r.url.includes("app_checkout_begin") || r.url.includes("api-sandbox.asaas.com")));
});
Deno.test("checkout sem Turnstile configurado segue sem consultar a Cloudflare", async () => {
  const { d, requests } = deps(reserve, billing);
  equal((await checkout(d)(request(purchase, { token: null }))).status, 200);
  assert(!requests.some((r) => r.url === siteverify));
});
Deno.test("checkout limita tentativas por IP e email antes de reservar o pedido; trocar a attempt_key não contorna", async () => {
  let limited = false;
  const throttles: unknown[] = [];
  const { d, requests } = deps((url, init) => {
    if (url.pathname.endsWith("app_checkout_throttle")) { throttles.push(JSON.parse(String(init.body))); return limited ? response({ code: "P0001", message: "Muitas solicitações. Aguarde um minuto." }, 400) : response(null); }
    return reserve(url);
  }, billing);
  const headers = { "cf-connecting-ip": "203.0.113.7", "x-forwarded-for": "6.6.6.6, 203.0.113.7" };
  equal((await checkout(d)(request(purchase, { token: null, headers }))).status, 200);
  equal(throttles[0], { p_actor_id: null, p_client_ip: "203.0.113.7", p_email: buyer.email });
  limited = true;
  const blocked = await checkout(d)(request({ ...purchase, attempt_key: "outra-tentativa-sintetica" }, { token: null, headers }));
  equal(blocked.status, 429);
  equal((await blocked.json()).error.code, "RATE_LIMITED");
  equal(requests.filter((r) => r.url.includes("app_checkout_begin")).length, 1);
  equal(requests.filter((r) => r.url.includes("api-sandbox.asaas.com")).length, 1);
});
Deno.test("reauth limita as tentativas de senha por usuário antes de conferir a senha", async () => {
  const { d, requests } = deps((url, init) => {
    if (url.pathname.endsWith("app_reauth_throttle")) { equal(JSON.parse(String(init.body)), { p_actor_id: id }); return response({ code: "P0001", message: "Muitas solicitações. Aguarde um minuto." }, 400); }
  });
  const result = await reauthenticate(d)(request({ password: "test-only-password" }));
  equal(result.status, 429);
  equal((await result.json()).error.code, "RATE_LIMITED");
  assert(!requests.some((r) => r.url.includes("/auth/v1/token")));
});
Deno.test("sem APP_ORIGIN, só o modo local usa o padrão de loopback; produção ou modo ausente falham claro", async () => {
  for (const mode of ["production", "", "prod"]) {
    const production = deps(undefined, { ICARUS_MODE: mode, APP_ORIGIN: "" });
    for (const handler of [capabilities, webhook]) {
      const result = await handler(production.d)(new Request("http://localhost/test", { method: "POST", headers: { "asaas-access-token": billing.ASAAS_WEBHOOK_TOKEN }, body: "{}" }));
      equal(result.status, 503);
      equal((await result.json()).error.code, "CONFIGURATION_REQUIRED");
    }
    equal(production.requests.length, 0);
  }
  const local = deps(undefined, { APP_ORIGIN: "" });
  const allowed = await capabilities(local.d)(new Request("http://localhost/test", { headers: { origin: "http://127.0.0.1:8088" } }));
  equal(allowed.status, 200);
  equal(allowed.headers.get("access-control-allow-origin"), "http://127.0.0.1:8088");
});
Deno.test("checkout limita pelo IP do cabeçalho confiável, agrupando IPv6 por /64, e ignora o x-forwarded-for", async () => {
  for (const [headers, ip] of [
    [{ "cf-connecting-ip": "198.51.100.30", "x-forwarded-for": "1.2.3.4, 198.51.100.30" }, "198.51.100.30"],
    // Sem cabeçalho confiável não há limite por IP: o último salto pode ser o próprio proxy, igual para todos.
    [{ "x-forwarded-for": "1.2.3.4, 198.51.100.31" }, null],
    [{ "cf-connecting-ip": "2001:db8:abcd:12:aaaa::1" }, "2001:db8:abcd:12::/64"],
    [{ "cf-connecting-ip": "2001:DB8:ABCD:0012:ffff:1:2:3" }, "2001:db8:abcd:12::/64"],
    [{}, null],
  ] as const) {
    let sent: Record<string, unknown> | undefined;
    const { d } = deps((url, init) => {
      if (url.pathname.endsWith("app_checkout_throttle")) { sent = JSON.parse(String(init.body)); return response(null); }
      return reserve(url);
    }, billing);
    equal((await checkout(d)(request(purchase, { token: null, headers }))).status, 200);
    equal(sent?.p_client_ip, ip);
  }
});

function pngLogo(width: number, height: number, size = 64) {
  const bytes = new Uint8Array(size), view = new DataView(bytes.buffer);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
  view.setUint32(16, width); view.setUint32(20, height);
  return bytes;
}
function webpLogo(chunk: "VP8 " | "VP8L" | "VP8X", width: number, height: number) {
  const bytes = new Uint8Array(64), view = new DataView(bytes.buffer);
  bytes.set(new TextEncoder().encode(`RIFF\0\0\0\0WEBP${chunk}`));
  if (chunk === "VP8 ") { bytes.set([0x9d, 0x01, 0x2a], 23); view.setUint16(26, width, true); view.setUint16(28, height, true); }
  if (chunk === "VP8L") { bytes[20] = 0x2f; view.setUint32(21, ((width - 1) | ((height - 1) << 14)) >>> 0, true); }
  if (chunk === "VP8X") { view.setUint32(24, width - 1, true); view.setUint32(27, height - 1, true); }
  return bytes;
}
const logoPath = (variant: string, n: number) => `logo/${variant}-${n}${id.slice(1)}.png`;
function brandDeps(route: Route = () => undefined, role = "admin") {
  return deps((url, init) => url.pathname.endsWith("app_bootstrap") ? response({ profile: { role } }) : route(url, init));
}
function sendLogo(d: Dependencies, file: File, variant = "light", courseId?: string, preview = false) {
  const form = new FormData(); form.set("kind", preview ? "brand-asset-preview" : "brand-asset"); form.set("variant", variant); form.set("file", file);
  if (courseId) form.set("course_id", courseId);
  return upload(d)(new Request("http://localhost/upload", { method: "POST", headers: { authorization: `Bearer ${jwt()}` }, body: form }));
}
const touchedBrand = (requests: { url: string }[]) => requests.some((r) => r.url.includes("app_brand_asset") || r.url.includes("/storage/"));

Deno.test("imageSize lê as dimensões do cabeçalho PNG e WebP", () => {
  equal(imageSize("image/png", pngLogo(960, 240)), { width: 960, height: 240 });
  equal(imageSize("image/webp", webpLogo("VP8 ", 961, 241)), { width: 961, height: 241 });
  equal(imageSize("image/webp", webpLogo("VP8L", 962, 242)), { width: 962, height: 242 });
  equal(imageSize("image/webp", webpLogo("VP8X", 4096, 1024)), { width: 4096, height: 1024 });
  equal(imageSize("image/png", pngLogo(960, 240).slice(0, 20)), null);
  equal(imageSize("image/webp", webpLogo("VP8X", 960, 240).slice(0, 30)), null);
  equal(imageSize("image/jpeg", new Uint8Array(64)), null);
});
Deno.test("logo recusa tipo, tamanho, dimensões e variante antes do banco e do Storage", async () => {
  const jpeg = new Uint8Array(64); jpeg.set([255, 216, 255, 224]);
  for (const [file, variant] of [
    [new File([jpeg], "logo.png", { type: "image/png" }), "light"],
    [new File(["<svg/>"], "assinatura.svg", { type: "image/svg+xml" }), "signature"],
    [new File([pngLogo(960, 240)], "logo.webp", { type: "image/webp" }), "light"],
    [new File([pngLogo(960, 240, 512001)], "logo.png", { type: "image/png" }), "light"],
    [new File([pngLogo(239, 60)], "logo.png", { type: "image/png" }), "light"],
    [new File([pngLogo(240, 59)], "logo.png", { type: "image/png" }), "light"],
    [new File([pngLogo(4097, 100)], "logo.png", { type: "image/png" }), "light"],
    [new File([pngLogo(960, 240)], "logo.png", { type: "image/png" }), "sepia"],
    [new File([webpLogo("VP8X", 960, 240).slice(0, 30)], "curta.webp", { type: "image/webp" }), "light"],
    [new File([webpLogo("VP8X", 512, 512)], "icone.webp", { type: "image/webp" }), "icon"],
    [new File([pngLogo(512, 500)], "icone.png", { type: "image/png" }), "icon"],
    [new File([pngLogo(179, 179)], "icone.png", { type: "image/png" }), "icon"],
    [new File([webpLogo("VP8X", 600, 200)], "assinatura.webp", { type: "image/webp" }), "signature"],
    [new File([pngLogo(2001, 300)], "assinatura.png", { type: "image/png" }), "signature"],
    [new File([pngLogo(199, 60)], "assinatura.png", { type: "image/png" }), "signature"],
  ] as const) {
    const { d, requests } = brandDeps();
    equal((await sendLogo(d, file, variant, variant === "signature" ? other : undefined)).status, 422);
    assert(!touchedBrand(requests), `${file.name} ${file.size} ${variant}`);
  }
});
Deno.test("logo de quem não é admin para antes do banco e do Storage", async () => {
  for (const role of ["member", "support", "moderator", "instructor"]) {
    const { d, requests } = brandDeps(undefined, role);
    equal((await sendLogo(d, new File([pngLogo(960, 240, 512000)], "logo.png", { type: "image/png" }))).status, 403);
    equal((await upload(d)(request({ action: "brand-asset-remove", variant: "light" }))).status, 403);
    assert(!touchedBrand(requests), role);
  }
  const { d, requests } = brandDeps((url) => url.pathname.endsWith("app_brand_asset_begin") ? response({ code: "P0001", message: "Sessão inválida, segundo fator ou configuração de senha pendente." }, 400) : undefined);
  equal((await sendLogo(d, new File([pngLogo(960, 240)], "logo.png", { type: "image/png" }))).status, 422);
  assert(!requests.some((r) => r.url.includes("/storage/")), "banco recusou e nada foi gravado");
});
Deno.test("logo grava, troca e só depois apaga a anterior", async () => {
  const path = logoPath("light", 3), old = logoPath("light", 4);
  const { d, requests } = brandDeps((url, init) =>
    url.pathname.endsWith("app_brand_asset_begin") ? response(path)
    : url.pathname === `/storage/v1/object/icarus-brand/${path}` ? response({ Key: `icarus-brand/${path}` })
    : url.pathname.endsWith("app_brand_asset_commit") ? response({ logo_light: path, logo_dark: null, icon: null, previous: old })
    : url.pathname === "/storage/v1/object/icarus-brand" && init.method === "DELETE" ? response([{ name: old }])
    : undefined);
  const result = await sendLogo(d, new File([webpLogo("VP8X", 960, 240)], "Logo.WEBP", { type: "image/webp" }));
  equal(result.status, 200); equal(await result.json(), { logo_light: path, logo_dark: null, icon: null, logo_light_ratio: null, logo_dark_ratio: null });
  const at = (part: string) => requests.findIndex((r) => r.url.includes(part));
  equal(requests.find((r) => r.url.includes("app_brand_asset_begin"))?.body, { p_actor_id: id, p_variant: "light", p_content_type: "image/webp" });
  equal(requests.find((r) => r.url.includes("app_brand_asset_commit"))?.body, { p_actor_id: id, p_variant: "light", p_path: path, p_course_id: null, p_ratio: 4 });
  equal(requests.find((r) => r.method === "DELETE")?.body, { prefixes: [old] });
  assert(at("app_brand_asset_begin") < at(`/icarus-brand/${path}`) && at(`/icarus-brand/${path}`) < at("app_brand_asset_commit") && at("app_brand_asset_commit") < requests.findIndex((r) => r.method === "DELETE"), "ordem begin, upload, commit, delete");
});
Deno.test("falha no commit apaga só o arquivo novo", async () => {
  const path = logoPath("dark", 5);
  const { d, requests } = brandDeps((url, init) =>
    url.pathname.endsWith("app_brand_asset_begin") ? response(path)
    : url.pathname === `/storage/v1/object/icarus-brand/${path}` ? response({ Key: `icarus-brand/${path}` })
    : url.pathname.endsWith("app_brand_asset_commit") ? response({ message: "indisponível" }, 503)
    : url.pathname === "/storage/v1/object/icarus-brand" && init.method === "DELETE" ? response([{ name: path }])
    : undefined);
  equal((await sendLogo(d, new File([pngLogo(960, 240)], "logo.png", { type: "image/png" }), "dark")).status, 503);
  equal(requests.filter((r) => r.method === "DELETE").map((r) => r.body), [{ prefixes: [path] }]);
});
Deno.test("remover grava nulo e depois apaga a anterior, mesmo se o Storage falhar", async () => {
  const old = logoPath("dark", 6);
  const { d, requests } = brandDeps((url, init) =>
    url.pathname.endsWith("app_brand_asset_commit") ? response({ logo_light: null, logo_dark: null, icon: null, previous: old })
    : url.pathname === "/storage/v1/object/icarus-brand" && init.method === "DELETE" ? response({ message: "falha" }, 500)
    : undefined);
  const result = await upload(d)(request({ action: "brand-asset-remove", variant: "dark" }));
  equal(result.status, 200); equal(await result.json(), { logo_light: null, logo_dark: null, icon: null, logo_light_ratio: null, logo_dark_ratio: null });
  equal(requests.find((r) => r.url.includes("app_brand_asset_commit"))?.body, { p_actor_id: id, p_variant: "dark", p_path: null, p_course_id: null });
  equal(requests.find((r) => r.method === "DELETE")?.body, { prefixes: [old] });
  assert(!requests.some((r) => r.url.includes("app_brand_asset_begin")));
});

Deno.test("favicon e assinatura seguem o mesmo caminho; assinatura sem curso é a do modelo global", async () => {
  const icon = `icon/${other}.png`, signature = `signature/${other}.png`;
  const { d, requests } = brandDeps((url, init) =>
    url.pathname.endsWith("app_brand_asset_begin") ? response(JSON.parse(String(init.body)).p_variant === "icon" ? icon : signature)
    : url.pathname.startsWith("/storage/v1/object/icarus-brand/") ? response({ Key: url.pathname })
    : url.pathname.endsWith("app_brand_asset_commit") ? response(JSON.parse(String(init.body)).p_variant === "icon" ? { logo_light: null, logo_dark: null, icon, previous: null } : { signature_path: signature, previous: null })
    : undefined);
  const saved = await sendLogo(d, new File([pngLogo(512, 512)], "icone.png", { type: "image/png" }), "icon");
  equal(saved.status, 200); equal(await saved.json(), { logo_light: null, logo_dark: null, icon, logo_light_ratio: null, logo_dark_ratio: null });
  const global = await sendLogo(d, new File([pngLogo(600, 200)], "assinatura.png", { type: "image/png" }), "signature");
  equal(global.status, 200); equal(await global.json(), { signature_path: signature });
  for (const [file, variant, message] of [
    [new File([pngLogo(239, 60)], "logo.png", { type: "image/png" }), "light", "A logo precisa ter pelo menos 240 × 60 px e no máximo 4096 px de cada lado."],
    [new File([pngLogo(512, 500)], "icone.png", { type: "image/png" }), "icon", "O ícone precisa ser quadrado, com pelo menos 180 × 180 px e no máximo 4096 px."],
    [new File([pngLogo(2001, 300)], "assinatura.png", { type: "image/png" }), "signature", "A assinatura precisa ter pelo menos 200 × 60 px e no máximo 2000 px de cada lado."],
  ] as const) equal((await (await sendLogo(d, file, variant, other)).json()).error.message, message);
  const signed = await sendLogo(d, new File([pngLogo(600, 200)], "assinatura.png", { type: "image/png" }), "signature", other);
  equal(signed.status, 200); equal(await signed.json(), { signature_path: signature });
  equal(requests.filter((r) => r.url.includes("app_brand_asset_commit")).map((r) => r.body), [
    { p_actor_id: id, p_variant: "icon", p_path: icon, p_course_id: null, p_ratio: 1 },
    { p_actor_id: id, p_variant: "signature", p_path: signature, p_course_id: null },
    { p_actor_id: id, p_variant: "signature", p_path: signature, p_course_id: other },
  ]);
  const removed = await upload(d)(request({ action: "brand-asset-remove", variant: "signature", course_id: other }));
  equal(removed.status, 200);
  equal(requests.filter((r) => r.url.includes("app_brand_asset_commit")).at(-1)?.body, { p_actor_id: id, p_variant: "signature", p_path: null, p_course_id: other });
  equal((await upload(d)(request({ action: "brand-asset-remove", variant: "signature" }))).status, 200);
  equal(requests.filter((r) => r.url.includes("app_brand_asset_commit")).at(-1)?.body, { p_actor_id: id, p_variant: "signature", p_path: null, p_course_id: null });
  equal((await sendLogo(d, new File([pngLogo(600, 200)], "assinatura.png", { type: "image/png" }), "signature", "curso-invalido")).status, 422);
});

Deno.test("SVG só é processado depois da autorização, prévia não grava e upload persiste o resultado sanitizado", async () => {
  const path = logoPath("dark", 7).replace(".png", ".svg");
  const source = '<svg viewBox="0 0 400 200" onload="alert(1)"><rect x="50" y="50" width="300" height="100" fill="black"/></svg>';
  const file = new File([source], "logo.svg", { type: "image/svg+xml" });
  let stored: File | undefined;
  const route: Route = (url, init) => {
    if (url.pathname.endsWith("app_brand_asset_begin")) return response(path);
    if (url.pathname === `/storage/v1/object/icarus-brand/${path}`) {
      stored = (init.body as FormData).get("") as File;
      return response({ Key: path });
    }
    if (url.pathname.endsWith("app_brand_asset_commit")) return response({ logo_dark: path, logo_dark_ratio: JSON.parse(String(init.body)).p_ratio });
  };
  const notAdmin = brandDeps(undefined, "member");
  equal((await sendLogo(notAdmin.d, file, "dark", undefined, true)).status, 403);
  assert(!touchedBrand(notAdmin.requests));

  const { d, requests } = brandDeps(route);
  const preview = await sendLogo(d, file, "dark", undefined, true);
  equal(preview.status, 200);
  const clean = await preview.json();
  assert(!clean.svg.includes("onload") && clean.ratio > 2.9 && clean.warnings.length === 1);
  assert(!requests.some((r) => r.url.includes("/storage/") || r.url.includes("app_brand_asset_commit")));

  const save = await sendLogo(d, file, "dark");
  equal(save.status, 200);
  if (!(stored instanceof Blob)) throw new Error("Storage não recebeu a imagem");
  equal(stored.type, "image/svg+xml");
  equal(await stored.text(), clean.svg);
  equal((await save.json()).logo_dark_ratio, clean.ratio);
  const malformed = new File([source + "<html/>"], "falso.svg", { type: "image/svg+xml" });
  const reject = brandDeps(route);
  equal((await sendLogo(reject.d, malformed, "dark")).status, 422);
  assert(!reject.requests.some((r) => r.url.includes("/storage/") || r.url.includes("app_brand_asset_commit")));
});

const removedFile = `material/${other}/a.pdf`;
const deleteDeps = (storage: () => Response) => deps((url, init) =>
  url.pathname.endsWith("/app_admin_delete") ? response({ id: other, paths: [removedFile] })
  : url.pathname === "/storage/v1/object/icarus-private" && init.method === "DELETE" ? storage()
  : undefined);
Deno.test("exclusão chama a RPC com o ator do JWT e remove os arquivos devolvidos", async () => {
  const { d, requests } = deleteDeps(() => response([{ name: removedFile }]));
  const result = await upload(d)(request({ action: "delete", entity: "materials", id: other }));
  equal(result.status, 200); equal(await result.json(), { deleted: true, files_removed: 1 });
  equal(requests.find((r) => r.url.endsWith("/app_admin_delete"))?.body, { p_actor_id: id, p_entity: "materials", p_id: other });
  equal(requests.filter((r) => r.method === "DELETE").map((r) => r.body), [{ prefixes: [removedFile] }]);
  assert(requests.findIndex((r) => r.url.endsWith("/app_admin_delete")) < requests.findIndex((r) => r.method === "DELETE"), "banco antes do Storage");
});
Deno.test("falha do Storage não desfaz a exclusão e avisa", async () => {
  const { d } = deleteDeps(() => response({ statusCode: "500", message: "falha sintética", error: "Internal" }, 500));
  const logged: unknown[][] = [], original = console.error;
  console.error = (...args: unknown[]) => { logged.push(args); };
  try {
    const result = await upload(d)(request({ action: "delete", entity: "materials", id: other }));
    equal(result.status, 200);
    equal(await result.json(), { deleted: true, files_removed: 0, warning: "O item foi excluído, mas alguns arquivos não foram apagados do armazenamento." });
  } finally { console.error = original; }
  equal(logged.length, 1);
  assert(!JSON.stringify(logged).includes(removedFile), "log sem o caminho do arquivo");
});
Deno.test("entidade fora da lista é recusada antes da RPC", async () => {
  const { d, requests } = deleteDeps(() => response([]));
  for (const [body, message] of [
    [{ entity: "courses", id: other }, "Esta entidade não pode ser excluída."],
    [{ entity: "materials", id: "nao-e-uuid" }, "Identificador inválido."],
  ] as const) {
    const result = await upload(d)(request({ action: "delete", ...body }));
    equal(result.status, 422); equal((await result.json()).error.message, message);
  }
  assert(!requests.some((r) => r.url.includes("app_admin_delete") || r.url.includes("/storage/")));
});
