import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { browserContext, launchChrome } from "./browser.mjs";

const app = new URL(process.env.CHECKOUT_QA_APP_ORIGIN ?? "http://127.0.0.1:8189").origin;
const api = new URL(process.env.VITE_SUPABASE_URL ?? "http://127.0.0.1:58521").origin;
const order = "11111111-1111-4111-8111-111111111111";
const callback = `${app}/pedido/${order}`;
const hosted = "https://sandbox.asaas.com/checkoutSession/show?id=fixture";
const contextBody = {
  plans: [{ id: order, slug: "demo", name: "DEMONSTRAÇÃO", price_cents: 12345, access_months: 12, benefits: [] }],
  legal_ready: true,
  legal_versions: [{ id: order, kind: "terms" }, { id: order, kind: "privacy" }],
};
const purchases = [];
const statusRequests = [];
let providerHeaders;
const { browser } = await launchChrome();

async function guest() {
  const context = await browser.newContext(browserContext);
  await context.addInitScript(() => { window.checkoutDocument = crypto.randomUUID(); });
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === app) return route.continue();
    if (url.href === hosted) {
      assert(request.isNavigationRequest());
      providerHeaders = await request.allHeaders();
      return route.fulfill({ contentType: "text/html; charset=utf-8", body: `<a href="${callback}">Voltar à Icarus</a>` });
    }
    if (url.origin !== api) return route.abort();
    const headers = {
      "access-control-allow-origin": app,
      "access-control-allow-headers": "authorization,apikey,content-type,x-client-info",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "cache-control": "no-store",
    };
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    switch (url.pathname) {
      case "/rest/v1/rpc/app_public_context":
        return route.fulfill({ json: contextBody, headers });
      case "/functions/v1/capabilities":
        return route.fulfill({ json: { asaas: true }, headers });
      case "/functions/v1/checkout": {
        const purchase = request.postDataJSON();
        assert(!("receipt_token" in purchase) && /^[a-f0-9]{64}$/.test(purchase.receipt_hash));
        purchases.push(purchase);
        if (purchases.length === 1) {
          return route.fulfill({ status: 503, json: { message: "Falha temporária da fixture." }, headers });
        }
        return route.fulfill({ json: { order_id: order, status: "pending", url: hosted }, headers });
      }
      case "/functions/v1/order-status": {
        const { order_id, receipt_token } = request.postDataJSON();
        assert.equal(order_id, order);
        assert(typeof receipt_token === "string" && /^[a-f0-9]{64}$/.test(receipt_token));
        assert(createHash("sha256").update(receipt_token).digest("hex") === purchases[0].receipt_hash);
        statusRequests.push(receipt_token);
        assert.equal(url.search, "");
        return route.fulfill({ json: { order_id, status: "pending", amount_cents: 12345, access_granted: false }, headers });
      }
      default:
        return route.abort();
    }
  });
  context.setDefaultTimeout(10_000);
  return context.newPage();
}

try {
  const page = await guest();
  await page.goto(`${app}/checkout?plano=demo`);
  const originalDocument = await page.evaluate(() => window.checkoutDocument);
  await page.getByLabel("Nome completo").fill("Comprador de teste");
  await page.getByLabel("Email", { exact: true }).fill("guest@example.test");
  await page.getByLabel("CPF ou CNPJ").fill("00000000000");
  await page.getByRole("checkbox", { name: /Aceito os Termos/ }).check();
  await page.getByRole("button", { name: /Continuar com Pix/ }).click();
  await page.getByText("Falha temporária da fixture.").waitFor();
  await page.getByLabel("CPF ou CNPJ").fill("00000000000");
  await page.getByRole("button", { name: /Continuar com Pix/ }).click();
  await page.waitForURL(hosted);
  const providerDocument = await page.evaluate(() => window.checkoutDocument);
  await page.getByRole("link", { name: "Voltar à Icarus" }).click();
  await page.waitForURL(callback);
  const statusDocument = await page.evaluate(() => window.checkoutDocument);
  assert.equal(new Set([originalDocument, providerDocument, statusDocument]).size, 3);
  await page.getByRole("heading", { name: "Aguardando pagamento" }).waitFor();
  assert.equal(purchases.length, 2);
  assert(purchases[0].attempt_key === purchases[1].attempt_key);
  assert(purchases[0].receipt_hash === purchases[1].receipt_hash);
  assert.equal(statusRequests.length, 1);
  const [token] = statusRequests;
  assert(!providerHeaders.authorization && !providerHeaders.cookie);
  assert(!JSON.stringify(providerHeaders).includes(token));
  assert(!page.url().includes(token));
  const storageIsSafe = await page.evaluate(async ({ order, token }) => {
    const stored = await new Promise((resolve, reject) => {
      const open = indexedDB.open("icarus-checkout");
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const tx = open.result.transaction("receipts");
        const get = tx.objectStore("receipts").get(order);
        tx.oncomplete = () => { open.result.close(); resolve(get.result); };
        tx.onabort = () => reject(tx.error);
      };
    });
    return stored.key instanceof CryptoKey && !stored.key.extractable
      && Object.keys(stored).length === 2 && Number.isFinite(stored.expiresAt)
      && ![stored, localStorage, sessionStorage].some((value) => JSON.stringify(value).includes(token));
  }, { order, token });
  assert(storageIsSafe);
  await page.reload();
  await page.getByRole("heading", { name: "Aguardando pagamento" }).waitFor();
  assert(statusRequests.length === 2 && statusRequests[1] === token);

  const other = await guest();
  await other.goto(callback);
  await other.getByText(/O recibo desta tentativa/).waitFor();
  await page.clock.setFixedTime(Date.now() + 2 * 60 * 60 * 1000 + 1000);
  await page.reload();
  await page.getByText(/O recibo desta tentativa/).waitFor();
  assert.equal(statusRequests.length, 2);
  console.log("Retorno guest em três documentos, reload, retry, outro navegador e prazo aprovados com fixture.");
} finally {
  await browser.close();
}
