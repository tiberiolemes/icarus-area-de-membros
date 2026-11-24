import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { createServer } from "vite";
import { browserContext, fullScreenshot, launchChrome, pngSize } from "./browser.mjs";
import { sha256 } from "./pixels.mjs";

const [outArg] = process.argv.slice(2);
assert(outArg, "Uso: node tests/visual/ranking-app.mjs DIRETÓRIO");
const out = resolve(outArg);
const port = Number(process.env.STITCH_APP_PORT || 8279);
assert(Number.isInteger(port) && port >= 1024 && port <= 65535);
const origin = "http://127.0.0.1:" + port;
const clock = "2026-11-24T12:01:00.000Z";
const rules = { post: 5, reply: 3, like: 1, lesson: 8, certificate: 15 };
const fixturePath = "/tests/fixtures/ranking.html";
const podium = [
  { position: 1, points: 37, is_self: false, tied: false },
  { position: 2, points: 16, is_self: false, tied: false },
  { position: 3, points: 8, is_self: false, tied: false },
];
const rows = Array.from({ length: 21 }, (_, index) => ({
  position: 4, points: 5, is_self: index === 0, tied: true,
}));

function snapshot(role, period, page) {
  const empty = period === "previous";
  return {
    starts_at: empty ? "2026-10-01T03:00:00Z" : period === "current" ? "2026-11-01T03:00:00Z" : null,
    ends_at: empty ? "2026-11-01T03:00:00Z" : period === "current" ? "2026-12-01T03:00:00Z" : null,
    time_zone: "America/Sao_Paulo", prizes: null, rules,
    podium: empty ? [] : podium,
    own: role === "staff" ? { status: "excluded" } : empty ? { status: "unranked" }
      : { status: "ranked", position: 4, points: 5, tied: true },
    items: empty ? [] : rows.slice((page - 1) * 20, page * 20).map((row) => ({
      ...row, is_self: role === "member" && row.is_self,
    })),
    page, total: empty ? 0 : rows.length,
  };
}

async function open(browser, viewport, theme, role, failure = false) {
  const context = await browser.newContext({ ...browserContext, viewport, screen: viewport, colorScheme: theme });
  const page = await context.newPage();
  const errors = [];
  const calls = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin) {
      errors.push("Origem inesperada " + url.origin);
      return route.abort();
    }
    if (!url.pathname.startsWith("/rest/v1/rpc/")) return route.continue();
    assert.equal(url.pathname, "/rest/v1/rpc/app_ranking");
    assert.equal(request.method(), "POST");
    const { p_period, p_page, ...unexpected } = request.postDataJSON();
    assert.deepEqual(unexpected, {});
    calls.push([p_period, p_page]);
    if (failure) {
      failure = false;
      return route.fulfill({ status: 400, json: { message: "Falha da fixture", code: "P0001" } });
    }
    return route.fulfill({ json: snapshot(role, p_period, p_page) });
  });
  await page.clock.setFixedTime(new Date(clock));
  await page.goto(origin + fixturePath + "?" + new URLSearchParams({ theme, role }));
  return { context, page, errors, calls };
}

const server = await createServer({
  configFile: false, plugins: [react()],
  server: { host: "127.0.0.1", port, strictPort: true, hmr: false },
  define: {
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(origin),
    "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify("fixture-public"),
  },
});
mkdirSync(out);
await server.listen();
let browser;
try {
  const launched = await launchChrome();
  browser = launched.browser;
  const cases = [];
  for (const width of [1280, 360]) {
    for (const theme of ["dark", "light"]) {
      const viewport = { width, height: width === 1280 ? 1024 : 880 };
      const passes = [];
      for (const pass of [1, 2]) {
        const { context, page, errors, calls } = await open(browser, viewport, theme, "member");
        try {
          await page.getByText("Sem premiação configurada para este mês.").waitFor();
          assert.equal(await page.getByRole("cell", { name: "Você", exact: true }).count(), 1);
          await page.evaluate(() => document.fonts.ready);
          const geometry = await page.evaluate(() => ({
            width: document.documentElement.scrollWidth,
            foreground: getComputedStyle(document.querySelector(".ranking-card")).color,
            inter: document.fonts.check("14px Inter"),
            targets: [...document.querySelectorAll("button, a.button")].map((node) => node.getBoundingClientRect().height),
            podium: [...document.querySelectorAll(".ranking-podium li")].map((node) => node.getBoundingClientRect().left),
          }));
          assert.equal(geometry.width, width);
          assert(geometry.inter);
          assert(geometry.targets.every((target) => target >= 44));
          if (width === 1280) assert(geometry.podium[0] > geometry.podium[1] && geometry.podium[0] < geometry.podium[2]);
          assert.equal(await page.locator(".ranking-clock strong").textContent(), "06:14:59:00");
          const cdp = await context.newCDPSession(page);
          const png = await fullScreenshot(cdp, viewport);
          writeFileSync(join(out, `${width}-${theme}-${pass}.png`), png, { flag: "wx" });
          passes.push({ ...pngSize(png), sha256: sha256(png), geometry });
          assert.deepEqual(calls, [["current", 1]]);
          assert.deepEqual(errors, []);
        } finally { await context.close(); }
      }
      assert.equal(passes[0].sha256, passes[1].sha256, `Capturas de ${width} ${theme} devem repetir`);
      cases.push({ viewport, theme, passes });
    }
  }

  const viewport = { width: 360, height: 880 };
  const member = await open(browser, viewport, "dark", "member", true);
  try {
    const { page, calls, errors } = member;
    await page.getByText("Não foi possível carregar o ranking.").waitFor();
    await page.getByRole("button", { name: "Tentar novamente" }).click();
    await page.getByText("4º lugar (empate) · 5 pontos").waitFor();
    await page.getByRole("button", { name: "Próxima" }).click();
    await page.getByText("21 registros · página 2 de 2").waitFor();
    assert.equal(await page.locator("tbody tr").count(), 1);
    assert.equal(await page.evaluate(() => document.activeElement?.textContent), "Lista de classificação");
    const previous = page.getByRole("button", { name: "Mês anterior" });
    await previous.focus();
    await page.keyboard.press("Enter");
    await page.getByText("Você está sem colocação neste período.").waitFor();
    assert.equal(await previous.getAttribute("aria-current"), "page");
    await page.getByRole("button", { name: "Geral" }).click();
    await page.getByRole("heading", { name: "Ranking geral" }).waitFor();
    await page.getByRole("link", { name: "Como pontuar" }).click();
    assert.equal(await page.evaluate(() => document.activeElement?.textContent), "Regras de pontuação");
    assert.deepEqual(calls, [["current", 1], ["current", 1], ["current", 2], ["previous", 1], ["overall", 1]]);
    assert.deepEqual(errors, []);
  } finally { await member.context.close(); }

  const staff = await open(browser, viewport, "light", "staff");
  try {
    await staff.page.getByText("A equipe fica fora da classificação.").waitFor();
    assert.equal(await staff.page.getByText("Você", { exact: true }).count(), 0);
    assert.deepEqual(staff.errors, []);
  } finally { await staff.context.close(); }

  const closing = await open(browser, viewport, "light", "member");
  try {
    await closing.page.getByText("Encerramento em").waitFor();
    const refresh = closing.page.waitForRequest((request) => request.url().endsWith("/rpc/app_ranking"));
    await closing.page.clock.setFixedTime(new Date("2026-12-01T03:00:00Z"));
    await closing.page.getByText("Período encerrado").waitFor();
    await refresh;
    assert.deepEqual(closing.calls, [["current", 1], ["current", 1]]);
    assert.deepEqual(closing.errors, []);
  } finally { await closing.context.close(); }

  writeFileSync(join(out, "run.json"), JSON.stringify({ settings: launched.settings, clock, cases,
    fixture: fixturePath, roles: ["member", "staff"], controls: "períodos, paginação, regras, nova tentativa e releitura na virada" }, null, 2));
  console.log("Quatro pares estáveis e controles de membro/equipe verificados.");
} finally {
  await browser?.close();
  await server.close();
}
