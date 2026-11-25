import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createServer } from "vite";
import { browserContext, fullScreenshot, launchChrome, pngSize } from "./browser.mjs";

process.umask(0o077);
assert(process.argv[2], "Uso: node tests/visual/admin-reports.mjs DIRETORIO");
const out = resolve(process.argv[2]);
mkdirSync(out, { mode: 0o700 });
const path = "/tests/fixtures/admin-reports.html";
const periods = ["2026-11-01", "2026-11-06", "2026-11-11", "2026-11-16", "2026-11-21", "2026-11-25"];
const courses = [
  { id: "10000000-0000-4000-8000-000000000001", title: "Demonstração · Fundamentos de aprendizagem" },
  { id: "10000000-0000-4000-8000-000000000002", title: "Demonstração · Curso sem progresso" },
];
const lessons = Array.from({ length: 21 }, (_, index) => ({
  id: `lesson-${index}`, title: `Aula ${index + 1} · ${["Introdução", "Planejamento", "Prática"][index % 3]}`,
  module_title: index < 4 ? "Primeiros passos" : "Aplicação prática",
  duration_seconds: 256 + index * 30, registered: 72 - index, completed: 51 - index,
}));
const dashboard = {
  from_day: "2026-11-01", through_day: "2026-11-24", observed_at: "2026-11-24T12:00:00Z",
  new_members: 206, first_activations: 31,
  revenue_cents: 1490000, mrr_cents: 550000, renewals_due: 13,
  completions: 191, completing_members_7d: 27, completing_members_30d: 58,
  posts: 29, pending_posts: 4, new_tickets: 15, open_tickets: 3, answered_tickets: 12, first_response_seconds: 2520,
  acquisition: [30, 37, 68, 49, 22].map((n, i) => ({
    starts_on: periods[i], ends_before: periods[i + 1], new_members: n, first_activations: [4, 7, 5, 12, 3][i],
  })),
  payments: [
    { method: "CREDIT_CARD", orders: 9, amount_cents: 810000 },
    { method: "PIX", orders: 8, amount_cents: 680000 },
  ],
};

function reply(name, args) {
  if (name === "app_admin_dashboard") {
    assert(["current", "90d", "year", "custom"].includes(args.p_period));
    if (args.p_period === "custom") return { ...dashboard, from_day: args.p_from, through_day: args.p_through };
    return args.p_period === "90d"
      ? { ...dashboard, from_day: "2026-08-27", new_members: 0, first_activations: 0, revenue_cents: 0,
        acquisition: [], payments: [], first_response_seconds: null, answered_tickets: 0 } : dashboard;
  }
  if (name === "app_admin_analytics_courses") {
    return { items: courses, total: courses.length, page: args.p_page, page_size: 20 };
  }
  assert.equal(name, "app_admin_course_analytics");
  if (args.p_course_id === courses[1].id) {
    return { started: 0, module_title: null, module_completed: null, course_completed: null,
      lessons: { items: [], total: 0, page: 1, page_size: 20 } };
  }
  assert.equal(args.p_course_id, courses[0].id);
  const offset = (args.p_page - 1) * 20;
  return { started: 83, module_title: "Primeiros passos", module_completed: 51, course_completed: 27,
    lessons: { items: lessons.slice(offset, offset + 20), total: lessons.length, page: args.p_page, page_size: 20 } };
}

const port = Number(process.env.ICARUS_REPORTS_PORT ?? 8312);
assert(Number.isInteger(port) && port >= 8300 && port <= 8399, "Reserve uma porta 8300–8399 para a fixture.");
const origin = "http://127.0.0.1:" + port;
process.env.VITE_SUPABASE_URL = origin;
process.env.VITE_SUPABASE_ANON_KEY = "fixture-only";
process.env.VITE_ICARUS_UPDATE_REPO = ""; // fixtures recusam hosts externos: sem consulta às Releases do GitHub
const vite = await createServer({
  cacheDir: join(out, "vite-cache"),
  clearScreen: false,
  server: { host: "127.0.0.1", port, strictPort: true, watch: null, hmr: false },
});

async function exercise(browser, view, theme, width) {
  const started = performance.now();
  const viewport = { width, height: width < 640 ? 880 : 1024 };
  const context = await browser.newContext({ ...browserContext, viewport, screen: viewport });
  const calls = [], errors = [], unexpected = [];
  let failNextDashboard = false;
  try {
    await context.route("**/*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin !== origin) {
        unexpected.push(url.origin);
        return route.abort();
      }
      if (!url.pathname.startsWith("/rest/v1/rpc/")) return route.continue();
      const name = url.pathname.split("/").at(-1);
      const args = request.postDataJSON();
      calls.push({ name, args });
      if (failNextDashboard && name === "app_admin_dashboard") {
        failNextDashboard = false;
        return route.fulfill({ status: 400, json: { code: "P0001", message: "Falha temporária da fixture." } });
      }
      return route.fulfill({ json: reply(name, args) });
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    await page.clock.setFixedTime(new Date("2026-11-24T12:00:00Z"));
    await page.goto(origin + path + `?theme=${theme}&view=${view}`);
    const title = page.getByRole("heading", { level: 1 });
    const loaded = page.locator(".reports-kpis");
    await loaded.waitFor();
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await title.evaluate((node) => document.activeElement === node), true);
    const base = `${view}-${theme}-${width}`;
    const cdp = await context.newCDPSession(page);
    const png = await fullScreenshot(cdp, viewport);
    writeFileSync(join(out, base + ".png"), png);
    const geometry = await page.evaluate(() => {
      const rect = (selector) => {
        const box = document.querySelector(selector).getBoundingClientRect();
        return [box.x, box.y, box.width, box.height];
      };
      return {
        document: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
        heading: rect("h1"), metrics: rect(".reports-kpis"), firstPanel: rect(".reports-panel"),
        kpiColumns: [...document.querySelectorAll(".reports-kpis > div")].filter(node => node.offsetTop === document.querySelector(".reports-kpis > div").offsetTop).length,
        font: getComputedStyle(document.querySelector("h1")).fontFamily,
        theme: document.documentElement.dataset.theme,
        controls: [...document.querySelectorAll(".admin-reports button, .admin-reports select, .admin-reports a, .admin-reports summary")]
          .map((node) => ({ name: node.innerText || node.tagName, width: node.getBoundingClientRect().width,
            height: node.getBoundingClientRect().height })),
        selectFontPx: document.querySelector("select") ? parseFloat(getComputedStyle(document.querySelector("select")).fontSize) : null,
      };
    });
    assert.equal(geometry.document[0], width);
    assert.equal(geometry.kpiColumns, width < 640 ? 2 : 3);
    assert.equal(geometry.theme, theme);
    assert.match(geometry.font, /^Inter/);
    assert(geometry.controls.every((control) => control.width >= 44 && control.height >= 44), JSON.stringify(geometry.controls));
    if (geometry.selectFontPx !== null) assert(geometry.selectFontPx >= 16);
    assert.deepEqual(pngSize(png), { width, height: geometry.document[1] });

    if (view === "dashboard") {
      await page.getByText("Ver dados do gráfico").press("Enter");
      await page.getByRole("columnheader", { name: "Primeiras ativações" }).waitFor();
      await page.getByRole("button", { name: "Período: Mês atual" }).press("Enter");
      const next = page.getByRole("button", { name: "Últimos 90 dias", exact: true });
      failNextDashboard = true;
      await next.press("Enter");
      await page.getByRole("alert").getByText("Falha temporária da fixture.").waitFor();
      assert.equal(await page.getByRole("button", { name: "Período: Últimos 90 dias" }).evaluate((node) => document.activeElement === node), true);
      await page.getByRole("button", { name: "Tentar novamente" }).press("Enter");
      await page.getByText("Nenhum pedido pago no período.").waitFor();
      await page.getByText("Sem respostas", { exact: true }).waitFor();
      assert.equal(await page.getByRole("button", { name: "Período: Últimos 90 dias" }).getAttribute("aria-expanded"), "false");
      assert.deepEqual(calls.map((call) => call.args.p_period), ["current", "90d", "90d"]);
      await page.getByRole("button", { name: "Período: Últimos 90 dias" }).press("Enter");
      const dialog = page.getByRole("dialog");
      await page.getByRole("button", { name: "Personalizado", exact: true }).click();
      await dialog.getByLabel("Data inicial").fill("19112026");
      await dialog.getByLabel("Data final").fill("21112026");
      assert(await dialog.getByRole("status").innerText() === "19/11/2026 a 21/11/2026 · 3 dias");
      assert.equal(await dialog.locator(".period-month:visible").count(), width < 640 ? 1 : 2);
      const apply = dialog.getByRole("button", { name: "Aplicar" });
      const bounds = await apply.boundingBox();
      assert(bounds && bounds.y >= 0 && bounds.y + bounds.height <= viewport.height);
      await page.screenshot({ path: join(out, base + "-periodo.png") });
      await apply.press("Enter");
      await page.getByText("19/11/2026 a 21/11/2026 · Horário de Brasília").waitFor();
      assert.deepEqual(calls.at(-1).args, { p_period: "custom", p_from: "2026-11-19", p_through: "2026-11-21" });
      await page.getByRole("link", { name: "Analisar cursos" }).press("Enter");
      await page.getByRole("heading", { name: "Analytics de aprendizagem" }).waitFor();
    } else {
      const selector = page.getByRole("combobox", { name: "Curso selecionado" });
      const table = page.getByRole("region", { name: "Tabela de progresso por aula" });
      if (width === 360) {
        await table.focus();
        await table.press("ArrowRight");
        await page.waitForFunction(() => document.querySelector(".reports-table-wrap").scrollLeft > 0);
      }
      await page.getByRole("button", { name: "Próxima" }).press("Enter");
      await page.getByRole("rowheader", { name: /Aula 21/ }).waitFor();
      assert(calls.some((call) => call.name === "app_admin_course_analytics" && call.args.p_page === 2));
      await selector.focus();
      await selector.selectOption(courses[1].id);
      await page.getByText("Nenhum progresso registrado neste curso.").waitFor();
      await page.getByText("Nenhuma aula publicada neste curso.").waitFor();
      assert.equal(await page.getByText("Telemetria de reprodução indisponível").count(), 0);
      assert.equal(await selector.evaluate((node) => document.activeElement === node), true);
      assert.equal(calls.at(-1).args.p_page, 1);
    }
    assert.deepEqual(unexpected, []);
    assert.deepEqual(errors, []);
    return { view, theme, viewport, ...geometry, requests: calls, durationMs: Math.round(performance.now() - started) };
  } finally {
    await context.close();
  }
}

let browser;
try {
  await vite.listen();
  const launch = await launchChrome();
  browser = launch.browser;
  const measurements = [];
  for (const view of ["dashboard", "analytics"]) {
    for (const theme of ["dark", "light"]) {
      for (const width of (view === "dashboard" ? [1280, 390, 360] : [1280, 360])) {
        const measurement = await exercise(browser, view, theme, width);
        measurements.push(measurement);
        console.log(view, theme, width, measurement.durationMs + " ms", measurement.document);
      }
    }
  }
  writeFileSync(join(out, "measurements.json"), JSON.stringify({ chrome: browser.version(), measurements }, null, 2) + "\n");
} finally {
  await browser?.close();
  await vite.close();
}
