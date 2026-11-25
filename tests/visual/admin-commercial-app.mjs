import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createServer } from "vite";
import { browserContext, fullScreenshot, launchChrome, pngSize } from "./browser.mjs";
import { sha256 } from "./pixels.mjs";

const [outArg] = process.argv.slice(2);
assert(outArg, "Uso: node tests/visual/admin-commercial-app.mjs DIRETÓRIO");
const out = resolve(outArg);
const port = Number(process.env.STITCH_APP_PORT || 8276);
assert(Number.isInteger(port) && port >= 1024 && port <= 65535);
const origin = "http://127.0.0.1:" + port;
const clock = new Date("2026-11-24T12:01:00Z");
const expiry = +clock / 1000 + 3600;
const isoExpiry = new Date(expiry * 1000).toISOString();
const id = (index) => index.toString(16).padStart(8, "0") + "-0000-4000-8000-000000000001";
const user = { id: id(1), role: "authenticated", aud: "authenticated" };
const token = [{ alg: "HS256", typ: "JWT" }, { sub: user.id, exp: expiry, aal: "aal2" }, "fixture"]
  .map((part) => Buffer.from(JSON.stringify(part)).toString("base64url")).join(".");
const session = { access_token: token, refresh_token: "fixture", expires_at: expiry, expires_in: 3600, token_type: "bearer", user };
const list = (items, page = 1) => ({ items: items.slice((page - 1) * 20, page * 20), total: items.length, page, page_size: 20 });
const cases = [
  { route: "membros", reference: "membros_crm", ready: "Diretório de membros" },
  { route: "planos", reference: "planos_ofertas_cupons_de_desconto", ready: "Planos cadastrados" },
  { route: "pedidos", reference: "pedidos_faturamento", ready: "Livro de vendas" },
];

function records() {
  const plans = [
    { id: id(21), name: "Comunidade", slug: "comunidade", price_cents: 0, access_months: 12, active: true, benefits: ["Materiais da comunidade", "Acesso ao fórum"] },
    { id: id(22), name: "Profissional anual", slug: "profissional", price_cents: 449700, access_months: 12, active: true, benefits: ["Cursos e materiais", "Encontros", "Certificados"] },
    { id: id(23), name: "Turma anterior", slug: "turma-anterior", price_cents: 249000, access_months: 6, active: false, benefits: [] },
  ];
  const profiles = ["Alex Vilar", "Bruna Luz", "Marcos Lima", "Lara Reis"].map((full_name, index) => ({
    id: id(11 + index), full_name, role: "member", suspended: index === 3,
    company: { name: ["Atlas", "Norte", "Singular Tecnologia", "Oficina Sul"][index], segment: "Educação" },
    plan_name: index === 3 ? null : plans[index % 2].name, access_ends_at: index === 3 ? null : "2027-11-25T12:00:00Z", onboarding_complete: true,
  }));
  const orders = ["paid", "pending", "refunded", "chargeback", "expired", "cancelled"].map((status, index) => ({
    id: id(31 + index), user_id: index === 0 ? profiles[0].id : null, amount_cents: index === 0 ? 449700 : 249000,
    method: index % 2 ? "CREDIT_CARD" : "PIX", status, created_at: "2026-11-23T12:00:00Z",
    paid_at: index === 0 ? "2026-11-23T12:01:00Z" : null,
    finalized_at: index === 0 ? "2026-11-23T12:02:00Z" : null,
  }));
  return { profiles, plans, orders };
}

async function prepare(browser, viewport, theme, role = "admin") {
  const context = await browser.newContext({ ...browserContext, viewport, screen: viewport });
  const entities = records();
  const calls = [];
  const unexpected = [];
  let rejectedSave = false;
  let issuedAuthorization = false;
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin && url.protocol !== "blob:") {
      unexpected.push(url.hostname);
      return route.abort();
    }
    if (!/^\/(rest|auth|functions)\/v1\//.test(url.pathname)) return route.continue();
    const name = url.pathname.split("/").at(-1);
    const args = request.postDataJSON();
    calls.push(name === "reauthenticate" ? { name } : { name, args });
    const reply = (json, status = 200) => route.fulfill({ json, status });
    if (name.startsWith("app_admin_") && role !== "admin") {
      return reply({ code: "42501", message: "Acesso restrito." }, 403);
    }
    switch (name) {
      case "user": return reply(user);
      case "app_bootstrap": return reply({
        profile: { ...entities.profiles[0], id: user.id, full_name: "Equipe de teste", role, theme },
        plans: [], settings: {},
      });
      case "app_touch_session": return reply({ expires_at: isoExpiry, warning_seconds: 60 });
      case "app_admin_list": {
        if (args.p_query === "restrito") return reply({ code: "42501", message: "Acesso restrito." }, 403);
        const query = args.p_query.toLocaleLowerCase("pt-BR");
        const items = entities[args.p_entity]?.filter((row) => JSON.stringify(row).toLocaleLowerCase("pt-BR").includes(query));
        if (items) return reply(list(items, args.p_page));
        break;
      }
      case "app_admin_member_detail": {
        const profile = entities.profiles.find((row) => row.id === args.p_id);
        if (!profile) return reply({ code: "P0001", message: "Membro indisponível." }, 400);
        return reply({
          profile, subscriptions: list([{ id: id(41), plan_name: profile.plan_name, status: "active", starts_at: "2026-11-23T12:00:00Z", ends_at: profile.access_ends_at, source: "order" }]),
          courses: list([]), tickets: list([]), orders: list(entities.orders.filter((order) => order.user_id === profile.id)),
        });
      }
      case "reauthenticate":
        if (args.password !== "senha-da-fixture") return reply({ message: "Senha inválida na fixture." }, 401);
        issuedAuthorization = true;
        return reply({ token: "autorizacao-da-fixture", expires_at: isoExpiry });
      case "app_admin_member": {
        const profile = entities.profiles.find((row) => row.id === args.p_id);
        if (!profile || !issuedAuthorization || args.p_reauth_token !== "autorizacao-da-fixture") break;
        issuedAuthorization = false;
        Object.assign(profile, args.p_data);
        return reply(profile);
      }
      case "app_admin_save": {
        const plan = entities.plans.find((row) => row.id === args.p_id);
        if (args.p_entity !== "plans" || !plan) break;
        if (!rejectedSave) {
          rejectedSave = true;
          return reply({ code: "P0001", message: "Falha de salvamento da fixture." }, 400);
        }
        Object.assign(plan, args.p_data);
        return reply({ id: plan.id });
      }
    }
    unexpected.push(name);
    return reply({ message: "RPC fora da fixture." }, 501);
  });
  await context.addInitScript((value) => localStorage.setItem("sb-127-auth-token", JSON.stringify(value)), session);
  const page = await context.newPage();
  await page.clock.setFixedTime(clock);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return { context, page, calls, unexpected, errors };
}

async function inspect(page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const box = (element) => {
      const { x, y, width, height } = element.getBoundingClientRect();
      return [x, y, width, height].map((value) => Number(value.toFixed(2)));
    };
    const panel = document.querySelector(".admin-commercial");
    const visible = (element) => element.getClientRects().length && getComputedStyle(element).visibility === "visible";
    return {
      viewport: { width: innerWidth, height: innerHeight }, theme: root.dataset.theme,
      document: { width: root.scrollWidth, height: root.scrollHeight },
      scroll: [scrollX, scrollY], dpr: devicePixelRatio, scale: visualViewport.scale,
      focus: document.activeElement?.localName,
      hovered: [...document.querySelectorAll(":hover")].map((element) => element.localName),
      fonts: [...document.fonts].filter((font) => font.status === "loaded").map((font) => font.family),
      geometry: Object.fromEntries([
        "h1", ".commercial-metrics", ".commercial-toolbar", ".commercial-results", ".stitch-search",
        ".commercial-table", ".commercial-plans", ".commercial-campaigns", ".commercial-detail",
      ].flatMap((selector) => {
        const element = panel.querySelector(selector);
        return element ? [[selector, box(element)]] : [];
      })),
      controls: [...panel.querySelectorAll("button, a, input, textarea, select, summary")]
        .filter(visible).map((element) => {
          const target = element.matches('[type="checkbox"]') ? element.closest("label") : element;
          return { label: element.getAttribute("aria-label") || element.name || element.textContent.trim(),
            box: box(target), font: getComputedStyle(element).fontSize, input: element.matches('input:not([type="checkbox"]), textarea, select') };
        }),
    };
  });
}

async function capture(page, cdp, viewport, prefix, settings, commit, target) {
  await page.locator(".admin-commercial").waitFor();
  await page.evaluate(() => document.fonts.ready);
  const observed = await inspect(page);
  assert.equal(observed.document.width, viewport.width);
  assert(observed.controls.every(({ box, input, font }) => box[2] >= 44 && box[3] >= 44 && (!input || parseFloat(font) >= 16)),
    JSON.stringify(observed.controls.filter(({ box, input, font }) => box[2] < 44 || box[3] < 44 || (input && parseFloat(font) < 16))));
  const path = join(out, prefix + ".png");
  const png = await fullScreenshot(cdp, viewport);
  writeFileSync(path, png, { flag: "wx" });
  return { screen: target.reference, settings, commit, path, state: observed, clock: clock.toISOString(),
    png: { ...pngSize(png), sha256: sha256(png) },
    stateProof: { equivalent: false, evidence: ["Dados sintéticos limitados ao contrato implementado, métricas por página e ações reais da interface."] },
  };
}

async function exercise(browser, settings, commit, target, theme, width) {
  const viewport = { width, height: width === 360 ? 880 : 1024 };
  const started = performance.now();
  const { context, page, calls, unexpected, errors } = await prepare(browser, viewport, theme);
  const prefix = [target.route, theme, width].join("-");
  try {
    const cdp = await context.newCDPSession(page);
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: -1, y: -1 });
    await page.goto(origin + "/admin/" + target.route);
    await page.locator(".commercial-metrics").waitFor();
    assert.equal(await page.locator(".commercial-results h2").innerText(), target.ready);
    await page.waitForFunction(() => document.activeElement === document.querySelector(".admin-commercial h1"));
    await page.keyboard.press("Tab");
    const focus = await page.evaluate(() => {
      const element = document.activeElement;
      return [element.closest(".commercial-heading-actions") !== null, getComputedStyle(element).outlineWidth, getComputedStyle(element).outlineOffset];
    });
    assert.deepEqual(focus, [true, "2px", "3px"]);
    await page.locator(".admin-commercial h1").focus();
    const baseline = await capture(page, cdp, viewport, prefix, settings, commit, target);
    assert.deepEqual([baseline.state.theme, baseline.state.viewport, baseline.state.dpr, baseline.state.focus], [theme, viewport, 1, "h1"]);
    const timeOrigin = await page.evaluate(() => performance.timeOrigin);
    const search = page.getByRole("searchbox");
    const term = target.route === "membros" ? "Atlas" : target.route === "planos" ? "Comunidade" : "pending";
    await search.fill(term);
    await search.press("Enter");
    await page.getByText("Na busca atual").waitFor();
    assert(await search.evaluate((element) => element === document.activeElement));
    assert(calls.some(({ name, args }) => name === "app_admin_list" && args.p_query === term && args.p_page === 1));
    if (target.route !== "planos") {
      const download = page.waitForEvent("download");
      await page.getByRole("button", { name: "Exportar resultado completo em CSV" }).press("Enter");
      assert.equal((await download).suggestedFilename(), target.route + "-icarus.csv");
    }
    await search.fill("termo inexistente");
    await search.press("Enter");
    await page.getByText("Nenhum resultado para esta busca. Tente outro termo.").waitFor();
    await search.fill("restrito");
    await search.press("Enter");
    await page.getByRole("alert").waitFor();
    assert.equal(await search.inputValue(), "restrito");
    const count = () => calls.filter(({ args }) => args?.p_query === "restrito").length;
    await page.getByRole("button", { name: "Tentar novamente" }).press("Enter");
    await page.getByRole("alert").waitFor();
    assert.equal(count(), 2);
    await search.fill("");
    await search.press("Enter");
    await page.getByText("Em todo o cadastro").waitFor();

    let detail;
    if (target.route === "membros") {
      await page.getByRole("link", { name: "Abrir ficha de Alex Vilar" }).press("Enter");
      await page.getByRole("heading", { name: "Alex Vilar" }).waitFor();
      detail = await capture(page, cdp, viewport, prefix + "-ficha", settings, commit, target);
      await page.locator("summary").press("Enter");
      await page.getByText(/Ativa.*Pedido/).waitFor();
      await page.getByLabel("Motivo obrigatório").fill("Revisão da fixture");
      await page.getByRole("button", { name: "Revisar alteração" }).press("Enter");
      await page.waitForFunction(() => document.activeElement?.textContent === "Confirme a alteração");
      assert(!calls.some(({ name }) => name === "app_admin_member"));
      await page.keyboard.press("Tab");
      const authorize = page.getByRole("button", { name: "Autorizar alteração crítica" });
      assert(await authorize.evaluate((element) => element === document.activeElement));
      await page.keyboard.press("Enter");
      const dialog = page.getByRole("dialog", { name: "Confirme sua identidade" });
      await dialog.waitFor();
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "detached" });
      await page.waitForFunction(() => document.activeElement?.matches('.commercial-review button[aria-haspopup="dialog"]'));
      await authorize.press("Enter");
      const password = dialog.getByLabel("Senha atual", { exact: true });
      const confirm = dialog.getByRole("button", { name: "Confirmar e executar" });
      await password.fill("senha-invalida");
      await confirm.press("Enter");
      await dialog.getByRole("alert").waitFor();
      assert.equal(await password.inputValue(), "");
      assert(!calls.some(({ name }) => name === "app_admin_member"));
      await password.fill("senha-da-fixture");
      await confirm.press("Enter");
      await dialog.waitFor({ state: "detached" });
      await page.getByText("Alteração de acesso registrada.").waitFor();
      assert.equal(await page.getByText("Dados preparados. Confirme sua identidade para aplicar a alteração.").count(), 0);
      const mutation = calls.filter(({ name }) => name === "app_admin_member");
      assert.deepEqual(mutation.map(({ args }) => args), [{
        p_id: id(11), p_data: { role: "member", suspended: false }, p_reason: "Revisão da fixture",
        p_reauth_token: "autorizacao-da-fixture",
      }]);
    } else if (target.route === "planos") {
      const create = page.getByRole("button", { name: "Criar plano" });
      await create.press("Enter");
      await page.waitForFunction(() => document.activeElement?.textContent === "Criar plano" && document.activeElement?.localName === "h2");
      await page.getByRole("button", { name: "Fechar editor" }).press("Enter");
      assert(await create.evaluate((element) => element === document.activeElement));
      const edit = page.getByRole("button", { name: "Editar plano Comunidade" });
      await edit.press("Enter");
      await page.waitForFunction(() => document.activeElement?.textContent === "Editar plano" && document.activeElement?.localName === "h2");
      detail = await capture(page, cdp, viewport, prefix + "-editor", settings, commit, target);
      await page.getByLabel("Nome", { exact: true }).fill("Comunidade revisada");
      const save = page.getByRole("button", { name: "Salvar plano" });
      await save.press("Enter");
      await page.getByRole("alert").waitFor();
      await page.waitForFunction(() => document.activeElement?.getAttribute("role") === "alert");
      assert.equal(await page.getByLabel("Nome", { exact: true }).inputValue(), "Comunidade revisada");
      await save.press("Enter");
      await page.getByText("Plano salvo com sucesso.").waitFor();
      await page.getByRole("heading", { name: "Comunidade revisada" }).waitFor();
      assert(await page.getByRole("button", { name: "Editar plano Comunidade revisada" })
        .evaluate((element) => element === document.activeElement));
      assert.deepEqual(calls.filter(({ name }) => name === "app_admin_save").map(({ args }) => args), Array(2).fill({
        p_entity: "plans", p_id: id(21), p_data: { name: "Comunidade revisada", slug: "comunidade",
          price_cents: 0, access_months: 12, benefits: ["Materiais da comunidade", "Acesso ao fórum"], active: true },
      }));
    } else {
      await page.getByRole("link", { name: "Detalhes do pedido " + id(31).slice(0, 8) }).press("Enter");
      await page.getByRole("heading", { name: "Histórico do pedido" }).waitFor();
      detail = await capture(page, cdp, viewport, prefix + "-detalhe", settings, commit, target);
      assert.equal(await page.locator(".commercial-timeline time").count(), 3);
      assert.equal(await page.getByRole("button", { name: /estornar|cobrar|reenviar|reembolsar/i }).count(), 0);
      assert(calls.some(({ name, args }) => name === "app_admin_list" && args.p_query === id(31)));
    }
    assert.equal(await page.evaluate(() => performance.timeOrigin), timeOrigin);
    assert.deepEqual(unexpected, []);
    assert.deepEqual(errors, []);
    writeFileSync(join(out, prefix + ".json"), JSON.stringify({
      ...baseline, detail, checks: ["teclado e foco", "busca e vazio", "erro e repetição", "ações AJAX da rota"],
      durationMs: Math.round(performance.now() - started),
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
  for (const target of cases) for (const theme of ["light", "dark"]) for (const width of [360, 1280]) {
    await exercise(browser, launched.settings, commit, target, theme, width);
    process.stdout.write([target.route, theme, width, "OK"].join(" ") + "\n");
  }
  const denied = [];
  for (const role of ["member", "support", "moderator", "instructor"]) {
    const { context, page, calls, unexpected, errors } = await prepare(browser, { width: 1280, height: 1024 }, "dark", role);
    try {
      for (const { route } of cases) {
        await page.goto(origin + "/admin/" + route);
        await page.getByText(/Acesso restrito|Você não tem permissão para esta área/).waitFor();
        denied.push({ role, route });
      }
      assert(!calls.some(({ name }) => name.startsWith("app_admin_")));
      assert.deepEqual([unexpected, errors], [[], []]);
    } finally {
      await context.close();
    }
  }
  writeFileSync(join(out, "papel-acesso.json"), JSON.stringify(denied, null, 2) + "\n", { flag: "wx" });
} finally {
  await browser?.close();
  await vite.close();
}
