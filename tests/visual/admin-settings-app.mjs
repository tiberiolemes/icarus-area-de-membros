import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createServer } from "vite";
import { browserContext, fullScreenshot, launchChrome, pngSize } from "./browser.mjs";
import { pixels, sha256 } from "./pixels.mjs";

const [outArg, scope] = process.argv.slice(2);
assert(outArg && (!scope || scope === "--integracoes"), "Uso: node tests/visual/admin-settings-app.mjs DIRETÓRIO [--integracoes]");
const out = resolve(outArg);
const port = Number(process.env.STITCH_SETTINGS_PORT || 8293);
assert(Number.isInteger(port) && port >= 1024 && port <= 65535);
const origin = `http://127.0.0.1:${port}`;
const base = `${origin}/admin/configuracoes`;
const clock = new Date("2026-11-24T12:01:00Z");
const expiry = +clock / 1000 + 3600;
const id = (n) => `a1000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const cases = [
  { name: "equipe", params: "aba=equipe", title: "Equipe e controle de acesso", screen: "gest_o_de_equipe_logs_de_auditoria" },
  { name: "auditoria", params: "aba=auditoria", title: "Trilha de auditoria", screen: "gest_o_de_equipe_logs_de_auditoria" },
  { name: "bunny", params: "aba=integracoes&provedor=bunny", title: "Integração Bunny Stream", screen: "integra_o_bunny_stream_video_delivery" },
  { name: "asaas", params: "aba=integracoes&provedor=asaas", title: "Gateway de pagamento Asaas", screen: "gateway_de_pagamento_asaas" },
].filter(({ name }) => !scope || name === "asaas" || name === "bunny");
const events = Array.from({ length: 22 }, (_, index) => ({
  id: id(100 + index), actor_id: index === 1 ? null : id(1),
  action: index % 2 ? "ticket-reply" : "member-change",
  target_type: index % 2 ? "tickets" : "profiles", target_id: id(200 + index),
  reason: index === 0 ? "<b>Revisão de acesso da demonstração</b>" : null,
  created_at: new Date(+clock - index * 60000).toISOString(),
}));

async function prepare(browser, viewport, theme, role = "admin", aal = "aal2") {
  const context = await browser.newContext({ ...browserContext, viewport, screen: viewport });
  const calls = [];
  const unexpected = [];
  const errors = [];
  const factor = { id: id(5), user_id: id(1), status: "verified", factor_type: "totp" };
  const user = { id: id(1), role: "authenticated", aud: "authenticated", factors: [factor] };
  const token = [{ alg: "HS256", typ: "JWT" }, { sub: user.id, exp: expiry, aal }, "fixture"]
    .map((part) => Buffer.from(JSON.stringify(part)).toString("base64url")).join(".");
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin) {
      unexpected.push(url.hostname);
      return route.abort();
    }
    if (!/^\/(rest|auth|functions)\/v1\//.test(url.pathname)) return route.continue();
    const name = url.pathname.split("/").at(-1);
    const args = request.postDataJSON();
    const reply = (json, status = 200) => route.fulfill({ json, status });
    calls.push({ name, args });
    switch (name) {
      case "user": return reply(user);
      case "app_public_context": return reply({ name: "Icarus", plans: [], legal_versions: [] });
      case "app_bootstrap": return reply({
        profile: { id: user.id, full_name: "Admin da demonstração", role, theme, onboarding_complete: true },
        plans: [], settings: {},
      });
      case "app_touch_session": return reply({ expires_at: new Date(expiry * 1000).toISOString(), warning_seconds: 60 });
      case "capabilities": {
        if (args.action === "integration-test") return reply({ ok: false, message: "A chave de API foi recusada no teste." });
        const n = calls.filter((call) => call.name === name && call.args?.action === "integration-status" && call.args.provider === args.provider).length;
        if (n === 2) return reply({ message: "Falha de leitura na fixture." }, 503);
        const fields = args.provider === "asaas" ? {
          env: { source: "vault", value: "production" },
          api_key: { source: "environment", suffix: "a109", configured: true },
          webhook_token: { source: "vault", suffix: "b147", configured: true },
        } : {
          library_id: { source: "vault", value: "12840" },
          cdn_host: { source: "environment", value: "vz-demo.b-cdn.net" },
          api_key: { source: "vault", suffix: "a735", configured: true },
          token_key: { source: "vault", suffix: "c852", configured: true },
        };
        return reply({
          configured: n >= 3, test_ready: n >= 3, can_write: true, fields: n >= 3 ? fields : {},
          updated_at: n >= 3 ? clock.toISOString() : null, updated_by: n >= 3 ? "Admin da demonstração" : null,
          storage: true, email: "local", mode: "local", turnstile: n >= 3,
          webhook_url: "https://api.example.test/functions/v1/asaas-webhook?ambiente=" + (n >= 3 ? "production" : "sandbox"),
          production_enabled: false, production_test_valid: false, checkout_allowed: n < 3,
        });
      }
      case "app_admin_list": {
        if (role !== "admin" || aal !== "aal2" || args.p_query === "restrito") {
          return reply({ code: "42501", message: "Acesso restrito." }, 403);
        }
        if (args.p_entity !== "audit_events") break;
        const matching = events.filter((event) => JSON.stringify(event).includes(args.p_query));
        return reply({ items: matching.slice((args.p_page - 1) * 20, args.p_page * 20), total: matching.length, page: args.p_page, page_size: 20 });
      }
    }
    unexpected.push(name);
    return reply({ message: "Requisição fora da fixture." }, 501);
  });
  await context.addInitScript((session) => localStorage.setItem("sb-127-auth-token", JSON.stringify(session)), {
    access_token: token, refresh_token: "fixture", expires_at: expiry, expires_in: 3600, token_type: "bearer", user,
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.clock.setFixedTime(clock);
  return { context, page, calls, errors, unexpected };
}

async function capture(page, cdp, viewport, name) {
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: -1, y: -1 });
  await page.waitForFunction(() => !document.querySelector(":hover"));
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await Promise.all(document.getAnimations().filter((animation) => Number.isFinite(animation.effect?.getComputedTiming().endTime))
      .map((animation) => animation.finished.catch(() => {})));
  });
  const state = await page.evaluate(() => {
    const root = document.documentElement;
    const panel = document.querySelector(".admin-settings");
    const rect = (element) => {
      const { x, y, width, height } = element.getBoundingClientRect();
      return [x, y, width, height];
    };
    const controls = [...panel.querySelectorAll("button, a, input, select, summary")]
      .filter((element) => element.getClientRects().length > 0)
      .map((element) => ({ tag: element.localName, box: rect(element), font: parseFloat(getComputedStyle(element).fontSize) }));
    return {
      document: { width: root.scrollWidth, height: root.scrollHeight },
      viewport: { width: innerWidth, height: innerHeight },
      theme: root.dataset.theme, dpr: devicePixelRatio, scale: visualViewport.scale,
      scroll: [scrollX, scrollY], focus: document.activeElement.localName,
      hovered: [...document.querySelectorAll(":hover")].map((element) => element.localName),
      boxes: Object.fromEntries([".settings-breadcrumb", "h1", ".tabs", ".settings-panel"].map((selector) => [selector, rect(panel.querySelector(selector))])),
      controls,
    };
  });
  assert.equal(state.document.width, viewport.width);
  assert.deepEqual([state.viewport, state.dpr, state.scale, state.scroll, state.focus, state.hovered], [viewport, 1, 1, [0, 0], "h1", []]);
  assert.deepEqual(state.controls.filter(({ tag, box, font }) => box[2] < 44 || box[3] < 44 || (["input", "select"].includes(tag) && font < 16)), []);
  let first = await fullScreenshot(cdp, viewport);
  let second = await fullScreenshot(cdp, viewport);
  let repetition = pixels(first, second, "RGBA");
  // Uma nova pintura do Chrome pode mudar poucos pixels fora da área visível.
  // O recibo continua exigindo duas capturas consecutivas idênticas.
  for (let retry = 0; repetition.differentPixels !== 0 && retry < 4; retry++) {
    first = second;
    second = await fullScreenshot(cdp, viewport);
    repetition = pixels(first, second, "RGBA");
  }
  assert.equal(repetition.differentPixels, 0);
  const path = join(out, `${name}-a.png`);
  writeFileSync(path, first, { flag: "wx" });
  writeFileSync(join(out, `${name}-b.png`), second, { flag: "wx" });
  const png = { ...pngSize(first), sha256: sha256(first) };
  return { path, png, repetition, state };
}

async function exercise(browser, settings, commit, target, theme, width) {
  const viewport = { width, height: width === 360 ? 880 : 1024 };
  const { context, page, calls, unexpected, errors } = await prepare(browser, viewport, theme);
  const prefix = [target.name, theme, width].join("-");
  try {
    const cdp = await context.newCDPSession(page);
    await page.goto(`${base}?${target.params}`);
    const heading = page.getByRole("heading", { name: target.title, exact: true });
    await heading.waitFor();
    await page.waitForFunction(() => document.activeElement === document.querySelector(".admin-settings h1"));
    const isProvider = target.name === "bunny" || target.name === "asaas";
    const status = page.locator("#settings-provider-status");
    if (isProvider) await status.filter({ hasText: /^Não configurado$/ }).waitFor();
    if (target.name === "auditoria") await page.getByText("22 registros · página 1 de 2").waitFor();
    const baseline = await capture(page, cdp, viewport, prefix);
    const providerStates = {};
    assert.equal(baseline.state.theme, theme);
    await page.keyboard.press("Tab");
    assert.deepEqual(await page.evaluate(() => {
      const control = document.activeElement;
      const style = getComputedStyle(control);
      return [!!control.closest(".page-heading"), style.outlineWidth, style.outlineOffset, style.outlineStyle];
    }), [true, "2px", "3px", "solid"]);
    const timeOrigin = await page.evaluate(() => performance.timeOrigin);

    if (target.name === "equipe") {
      assert.equal(await page.getByRole("link", { name: "Gerenciar membros e equipe" }).getAttribute("href"), "/admin/membros");
      await page.getByRole("link", { name: "Consultar trilha de auditoria" }).press("Enter");
      await page.getByText("22 registros · página 1 de 2").waitFor();
      assert(page.url().endsWith("?aba=auditoria"));
      assert(!calls.some(({ name }) => name === "capabilities"));
    } else if (target.name === "auditoria") {
      const reason = page.getByText(events[0].reason, { exact: true });
      assert.equal(await reason.locator("b").count(), 0);
      await page.getByRole("button", { name: "Próxima" }).press("Enter");
      await page.getByText("22 registros · página 2 de 2").waitFor();
      const search = page.getByRole("searchbox", { name: "Buscar eventos de auditoria" });
      await search.fill("member-change");
      await search.press("Enter");
      await page.getByText("11 registros · página 1 de 1").waitFor();
      assert(await search.evaluate((input) => input === document.activeElement));
      assert.deepEqual(calls.filter(({ name }) => name === "app_admin_list").map(({ args }) => args), [
        { p_entity: "audit_events", p_query: "", p_page: 1 },
        { p_entity: "audit_events", p_query: "", p_page: 2 },
        { p_entity: "audit_events", p_query: "member-change", p_page: 1 },
      ]);
      await search.fill("sem-resultados");
      await search.press("Enter");
      await page.getByText("Nenhum evento encontrado para esta busca.").waitFor();
      await search.fill("restrito");
      await search.press("Enter");
      const denied = page.getByRole("alert").getByText(/Você não tem permissão para esta ação/);
      await denied.waitFor();
      await page.getByRole("button", { name: "Tentar novamente" }).press("Enter");
      await denied.waitFor();
      assert.equal(await search.inputValue(), "restrito");
      assert.equal(calls.filter(({ args }) => args?.p_query === "restrito").length, 2);
      assert(!calls.some(({ name }) => name === "capabilities"));
    } else {
      const refresh = page.getByRole("button", { name: "Atualizar estado" });
      await page.keyboard.press("Enter");
      await page.getByRole("alert").filter({ hasText: /A consulta falhou/ }).waitFor();
      assert(await refresh.evaluate((button) => button === document.activeElement));
      await page.keyboard.press("Enter");
      await status.filter({ hasText: /^Configurado$/ }).waitFor();
      assert.equal(await page.getByLabel(/^Chave de API/).inputValue(), "");
      await heading.evaluate((element) => { element.focus({ preventScroll: true }); window.scrollTo(0, 0); });
      providerStates.configured = await capture(page, cdp, viewport, prefix + "-configurado");
      await page.getByRole("button", { name: "Testar conexão" }).click();
      await page.getByRole("alert").filter({ hasText: "A chave de API foi recusada no teste." }).waitFor();
      await status.filter({ hasText: /^Com erro$/ }).waitFor();
      await heading.evaluate((element) => { element.focus({ preventScroll: true }); window.scrollTo(0, 0); });
      providerStates.connectionError = await capture(page, cdp, viewport, prefix + "-com-erro");
      const services = page.locator("summary");
      await services.press("Enter");
      await page.getByText("Armazenamento", { exact: true }).waitFor();
      assert.equal(await page.getByRole("link", { name: target.name === "bunny" ? "Gerenciar aulas" : "Consultar pedidos" }).getAttribute("href"), target.name === "bunny" ? "/admin/cursos" : "/admin/pedidos");
      await page.getByRole("link", { name: target.name === "bunny" ? "Gateway Asaas" : "Bunny Stream" }).press("Enter");
      await status.filter({ hasText: /^Não configurado$/ }).waitFor();
      assert.equal(calls.filter(({ name, args }) => name === "capabilities" && args.action === "integration-test").length, 1);
      assert(!calls.some(({ name }) => name.startsWith("app_admin_")));
    }
    assert.equal(await page.evaluate(() => performance.timeOrigin), timeOrigin);
    assert.deepEqual([unexpected, errors], [[], []]);
    writeFileSync(join(out, `${prefix}.json`), JSON.stringify({
      ...baseline, providerStates, screen: target.screen, commit, settings, clock: clock.toISOString(),
      stateProof: { equivalent: false, evidence: ["A fixture usa somente os contratos atuais. As amostras do Stitch incluem dados e operações sem contrato."] },
    }, null, 2) + "\n", { flag: "wx" });
  } finally {
    await context.close();
  }
}

process.umask(0o077);
mkdirSync(out);
process.env.VITE_SUPABASE_URL = origin;
process.env.VITE_SUPABASE_ANON_KEY = "fixture-only";
process.env.VITE_ICARUS_UPDATE_REPO = ""; // fixtures recusam hosts externos: sem consulta às Releases do GitHub
const vite = await createServer({
  cacheDir: join(out, "vite-cache"), clearScreen: false,
  server: { host: "127.0.0.1", port, strictPort: true, hmr: false, watch: null },
});
let browser;
try {
  await vite.listen();
  const launched = await launchChrome();
  browser = launched.browser;
  const commit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  for (const target of cases) for (const theme of ["light", "dark"]) for (const width of [1280, 360]) {
    await exercise(browser, launched.settings, commit, target, theme, width);
    process.stdout.write(`${target.name} ${theme} ${width} OK\n`);
  }
  const denied = [];
  for (const role of ["member", "support", "moderator", "instructor", "admin"]) {
    const aal = role === "admin" ? "aal1" : "aal2";
    const { context, page, calls, unexpected, errors } = await prepare(browser, { width: 1280, height: 1024 }, "dark", role, aal);
    try {
      for (const target of cases) {
        await page.goto(`${base}?${target.params}`);
        if (aal === "aal1") await page.waitForURL("**/entrar?returnTo=*");
        else await page.getByRole("heading", { name: "Acesso restrito", exact: true }).waitFor();
        denied.push({ role, aal, route: target.params });
      }
      assert(!calls.some(({ name }) => name === "capabilities" || name.startsWith("app_admin_")));
      assert.deepEqual([unexpected, errors], [[], []]);
    } finally {
      await context.close();
    }
  }
  writeFileSync(join(out, "negativas.json"), JSON.stringify(denied, null, 2) + "\n", { flag: "wx" });
} finally {
  await browser?.close();
  await vite.close();
}
