import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createServer } from "vite";
import { browserContext, fullScreenshot, launchChrome, pngSize } from "./browser.mjs";
import { pixels, sha256 } from "./pixels.mjs";

assert(process.argv[2], "Uso: node tests/visual/admin-brand-app.mjs DIRETÓRIO");
const out = resolve(process.argv[2]);
const port = Number(process.env.STITCH_BRAND_PORT || 8294);
const origin = `http://127.0.0.1:${port}`;
const brandUrl = `${origin}/admin/configuracoes?aba=marca`;
const clock = new Date("2026-11-24T12:01:00Z");
const expiry = +clock / 1000 + 3600;

async function fixture(browser, viewport, theme, role = "admin", aal = "aal2") {
  const context = await browser.newContext({ ...browserContext, viewport, screen: viewport });
  const sessions = [1, 2, 1].map((actor, index) => {
    const id = `b1000000-0000-4000-8000-00000000000${actor}`;
    const session_id = `b2000000-0000-4000-8000-00000000000${index + 1}`;
    const factors = [{ id: "b1000000-0000-4000-8000-000000000004", status: "verified", factor_type: "totp", user_id: id }];
    const user = { id, role: "authenticated", aud: "authenticated", factors };
    const access_token = [{ alg: "HS256", typ: "JWT" }, { sub: id, session_id, exp: expiry, aal }, "fixture"]
      .map((part) => Buffer.from(JSON.stringify(part)).toString("base64url")).join(".");
    return { access_token, refresh_token: `fixture-${index}`, expires_at: expiry, expires_in: 3600, token_type: "bearer", user };
  });
  const state = { name: "Icarus", revision: 0, attempts: [], failures: [], legal: [], failNextSave: false, holdNextSave: null };
  const publish = (name) => {
    state.name = name;
    state.revision++;
  };
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) {
      state.failures.push(url.origin);
      return route.abort();
    }
    if (!/^\/(rest|auth|functions)\/v1\//.test(url.pathname)) return route.continue();
    const authorization = route.request().headers().authorization;
    const { user } = sessions.find((session) => `Bearer ${session.access_token}` === authorization) ?? sessions[0];
    const args = route.request().postDataJSON();
    const reply = (json, status = 200) => route.fulfill({ json, status });
    switch (url.pathname.split("/").at(-1)) {
      case "user": return reply(user);
      case "app_bootstrap": return reply({
        profile: { id: user.id, full_name: "Admin da demonstração", role, theme, onboarding_complete: true },
        plans: [], settings: { name: state.name, name_revision: state.revision },
      });
      case "app_public_context": return reply({ name: state.name, legal_versions: [], plans: [] });
      case "app_touch_session": return reply({ expires_at: new Date(expiry * 1000).toISOString(), warning_seconds: 60 });
      case "app_admin_save_installation_name": {
        state.attempts.push(args);
        if (state.failNextSave) {
          state.failNextSave = false;
          return reply({ code: "P0001", message: "Falha transitória da fixture." }, 503);
        }
        const saved = args.p_name === state.name || args.p_expected_revision === state.revision;
        if (saved && args.p_name !== state.name) publish(args.p_name);
        const result = { name: state.name, revision: state.revision, saved };
        const hold = state.holdNextSave;
        if (hold) {
          state.holdNextSave = null;
          hold.started();
          await hold.release;
        }
        return reply(result);
      }
      case "app_admin_list":
        if (args.p_entity === "legal_versions") return reply({ items: state.legal, page: 1, page_size: 20, total: state.legal.length });
        break;
      case "app_admin_save":
        if (args.p_entity === "legal_versions") {
          state.legal.push({ id: user.id, ...args.p_data });
          return reply({ id: user.id });
        }
        break;
    }
    state.failures.push(url.pathname);
    return reply({ message: "Requisição fora da fixture." }, 501);
  });
  await context.addInitScript((session) => {
    if (!localStorage.getItem("sb-127-auth-token")) localStorage.setItem("sb-127-auth-token", JSON.stringify(session));
  }, sessions[0]);
  const page = await context.newPage();
  page.setDefaultTimeout(7000);
  page.on("pageerror", (error) => state.failures.push(error.message));
  await page.clock.setFixedTime(clock);
  return { context, page, state, publish, sessions, draftKey: `icarus:draft:${sessions[0].user.id}:installation-name` };
}

async function exercise(browser, theme, width) {
  const viewport = { width, height: width === 360 ? 880 : 1024 };
  const { context, page, state, publish, draftKey } = await fixture(browser, viewport, theme);
  try {
    const cdp = await context.newCDPSession(page);
    await page.goto(brandUrl);
    const heading = page.getByRole("heading", { name: "Plataforma, marca e white label" });
    const input = page.getByRole("textbox", { name: "Nome da instalação" });
    const save = page.getByRole("button", { name: "Salvar nome" });
    await input.waitFor();
    await page.waitForFunction(() => [...document.querySelectorAll(".brand-sample img")].every((img) => img.complete && img.naturalWidth > 0));
    await page.evaluate(() => document.fonts.ready);
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: -1, y: -1 });
    await page.waitForFunction(() => !document.querySelector(":hover"));
    const layout = await page.locator(".admin-settings").evaluate((panel) => {
      const colors = (node) => {
        const style = getComputedStyle(node);
        return [style.color, style.backgroundColor, style.borderLeftColor];
      };
      return {
        width: document.documentElement.scrollWidth, theme: document.documentElement.dataset.theme,
        headingFocused: document.activeElement === panel.querySelector("h1"),
        controls: [...panel.querySelectorAll("button, a, input")].map((el) => {
          const box = el.getBoundingClientRect();
          return { width: box.width, height: box.height, font: parseFloat(getComputedStyle(el).fontSize), tag: el.localName };
        }),
        colors: {
          input: colors(panel.querySelector("input")),
          panel: colors(panel.querySelector(".brand-column .settings-panel")),
          domain: colors(panel.querySelector(".brand-domain")),
          domainText: colors(panel.querySelector(".brand-domain p")),
          primary: colors(panel.querySelector(".brand-workspace .primary")),
          samples: [...panel.querySelectorAll(".brand-sample")].map(colors),
        },
      };
    });
    function contrast(first, second) {
      const lightness = (color) => color.match(/\d+/g).slice(0, 3).map((part) => Number(part) / 255)
        .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
        .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
      const [dark, light] = [lightness(first), lightness(second)].sort((a, b) => a - b);
      return (light + 0.05) / (dark + 0.05);
    }
    assert.deepEqual([layout.width, layout.theme, layout.headingFocused], [width, theme, true]);
    assert.deepEqual(layout.controls.filter((el) => el.width < 44 || el.height < 44 || (el.tag === "input" && el.font < 16)), []);
    const [inputText, inputBg, inputBorder] = layout.colors.input;
    const contrasts = {
      input: contrast(inputText, inputBg),
      domain: contrast(layout.colors.domainText[0], layout.colors.domain[1]),
      primary: contrast(...layout.colors.primary.slice(0, 2)),
      lightSample: contrast(...layout.colors.samples[0].slice(0, 2)),
      darkSample: contrast(...layout.colors.samples[1].slice(0, 2)),
    };
    assert(Object.values(contrasts).every((ratio) => ratio >= 4.5));
    assert(contrast(inputBorder, layout.colors.panel[1]) >= 3);
    const shot = await fullScreenshot(cdp, viewport);
    const second = await fullScreenshot(cdp, viewport);
    const repeat = pixels(shot, second, "RGBA");
    assert.deepEqual(pngSize(shot), pngSize(second));
    writeFileSync(join(out, `${theme}-${width}.png`), shot);
    writeFileSync(join(out, `${theme}-${width}-b.png`), second);

    await heading.focus();
    for (let step = 0; step < 12 && !(await input.evaluate((el) => document.activeElement === el)); step++) await page.keyboard.press("Tab");
    assert(await input.evaluate((el) => document.activeElement === el && getComputedStyle(el).outlineWidth === "2px" && getComputedStyle(el).outlineOffset === "3px"));
    await input.fill("   ");
    await input.press("Enter");
    await page.getByText(/Informe um nome de instalação visível/).waitFor();
    await page.waitForFunction(() => document.activeElement?.getAttribute("role") === "alert");
    assert.equal(state.attempts.length, 0);
    await input.fill("Academia <São José> & Cursos");
    assert.equal(await page.locator(".brand-sample strong").first().textContent(), "Academia <São José> & Cursos");
    state.failNextSave = true;
    const timeOrigin = await page.evaluate(() => performance.timeOrigin);
    await save.press("Enter");
    await page.getByText("Falha transitória da fixture.").waitFor();
    await page.waitForFunction(() => document.activeElement?.getAttribute("role") === "alert");
    assert.equal(await input.inputValue(), "Academia <São José> & Cursos");
    assert.equal(await page.evaluate(() => performance.timeOrigin), timeOrigin);
    page.once("dialog", (dialog) => dialog.accept());
    await page.reload();
    await input.waitFor();
    assert.equal(await input.inputValue(), "Academia <São José> & Cursos");
    publish("Nome intermediário em outra sessão");
    publish("Icarus");
    await save.press("Enter");
    await page.getByText(/O nome publicado mudou em outra sessão/).waitFor();
    await page.locator(".brand-column header strong").getByText("Icarus", { exact: true }).waitFor();
    await page.waitForFunction(() => document.activeElement?.getAttribute("role") === "alert");
    assert.equal(await input.inputValue(), "Academia <São José> & Cursos");
    await save.press("Enter");
    await page.getByText("Nome da instalação salvo.", { exact: true }).waitFor();
    assert.deepEqual(state.attempts.map((attempt) => attempt.p_expected_revision), [0, 0, 2]);
    assert.equal(await page.evaluate((key) => sessionStorage.getItem(key), draftKey), null);
    await input.fill("Rascunho descartável");
    await page.getByRole("button", { name: "Descartar rascunho" }).press("Enter");
    assert.equal(await input.inputValue(), state.name);
    await page.waitForFunction(() => document.activeElement?.getAttribute("name") === "installation_name");
    await page.getByRole("link", { name: "Gerenciar documentos legais" }).press("Enter");
    await page.waitForURL("**/admin/configuracoes?aba=legal");
    await page.getByRole("button", { name: "Nova versão" }).press("Enter");
    await page.getByLabel("Versão").fill("qa-1");
    await page.getByLabel("Título").fill("Termos da demonstração");
    await page.getByLabel("Texto integral").fill("Texto fictício da demonstração usado para verificar o editor versionado.");
    await page.getByRole("button", { name: "Salvar documento" }).press("Enter");
    await page.getByRole("heading", { name: "Termos da demonstração · qa-1" }).waitFor();
    assert.equal(state.legal[0].demo, true);
    assert.deepEqual(state.failures, []);
    return { theme, viewport, png: { ...pngSize(shot), sha256: sha256(shot) }, repeat, layout, contrasts };
  } finally {
    await context.close();
  }
}

async function exerciseLateAck(browser) {
  const { context, page, state, publish, sessions, draftKey } = await fixture(browser, { width: 1280, height: 1024 }, "light");
  const started = Promise.withResolvers();
  const release = Promise.withResolvers();
  try {
    await page.goto(brandUrl);
    const input = page.getByRole("textbox", { name: "Nome da instalação" });
    const save = page.getByRole("button", { name: "Salvar nome" });
    await input.fill("Nome da sessão A antiga");
    state.holdNextSave = { started: started.resolve, release: release.promise };
    const sending = page.waitForRequest((request) => request.url().endsWith("/app_admin_save_installation_name"));
    await save.press("Enter");
    await sending;
    await started.promise;

    const switchTo = (session) => page.evaluate(async ({ access_token, refresh_token }) => {
      const { client } = await import("/src/api.ts");
      const { error } = await client().auth.setSession({ access_token, refresh_token });
      if (error) throw error;
    }, session);
    await switchTo(sessions[1]);
    await page.waitForFunction(() => document.querySelector('[name="installation_name"]')?.value === "Nome da sessão A antiga");
    assert.equal(await page.evaluate((key) => sessionStorage.getItem(key), draftKey), null);
    publish("Nome lido pela nova sessão A");
    await switchTo(sessions[2]);
    await page.waitForFunction(() => document.querySelector('[name="installation_name"]')?.value === "Nome lido pela nova sessão A");
    const newDraft = "Rascunho da nova sessão A";
    await input.fill(newDraft);
    const stored = () => page.evaluate((key) => JSON.parse(sessionStorage.getItem(key)), draftKey);
    assert.deepEqual(await stored(), { name: newDraft, revision: 2 });

    publish("Nome confirmado por nova leitura");
    const readback = page.waitForResponse((response) => response.url().endsWith("/app_bootstrap") &&
      response.request().headers().authorization === `Bearer ${sessions[2].access_token}`);
    release.resolve();
    assert.equal((await (await readback).json()).settings.name_revision, 3);
    await page.getByRole("region", { name: "Identidade da plataforma" })
      .getByText("Nome confirmado por nova leitura", { exact: true }).waitFor();
    await page.locator(".sidebar .rail-brand").getByText("Nome confirmado por nova leitura", { exact: true }).waitFor();
    assert.equal(await input.inputValue(), newDraft);
    assert.deepEqual(await stored(), { name: newDraft, revision: 2 });
    assert.equal(await page.getByText("Nome da instalação salvo.", { exact: true }).count(), 0);
    page.once("dialog", (dialog) => dialog.accept());
    await page.reload();
    await page.getByRole("region", { name: "Identidade da plataforma" })
      .getByText("Nome confirmado por nova leitura", { exact: true }).waitFor();
    await page.locator(".sidebar .rail-brand").getByText("Nome confirmado por nova leitura", { exact: true }).waitFor();
    assert.equal(await input.inputValue(), newDraft);
    assert.deepEqual(state.failures, []);
    return { newDraftPreserved: true, readbackRevision: 3, previousAcknowledgeRevision: 1 };
  } finally {
    release.resolve();
    await context.close();
  }
}

async function exerciseNameValidation(browser) {
  const { context, page, state } = await fixture(browser, { width: 1280, height: 1024 }, "light");
  try {
    await page.goto(brandUrl);
    const input = page.getByRole("textbox", { name: "Nome da instalação" });
    const save = page.getByRole("button", { name: "Salvar nome" });
    const invalid = ["\u034f", "\u00a0", " \u034f\u00a0\u200d\u2800 ", "x".repeat(81), "😀".repeat(81)];
    for (const name of invalid) {
      await input.fill(name);
      await save.press("Enter");
      await page.getByText(/Informe um nome de instalação visível/).waitFor();
      await page.waitForFunction(() => document.activeElement?.getAttribute("role") === "alert");
      assert.equal(await input.inputValue(), name);
    }
    assert.deepEqual(state.attempts, []);
    const valid = ["x".repeat(80), "😀".repeat(80), "Academia 👩‍💻"];
    for (const [revision, name] of valid.entries()) {
      await input.fill(`\u00a0 ${name} \u00a0`);
      await save.press("Enter");
      await page.getByText("Nome da instalação salvo.", { exact: true }).waitFor();
      assert.deepEqual(state.attempts.at(-1), { p_name: name, p_expected_revision: revision });
      assert.equal(await input.inputValue(), name);
    }
    assert.deepEqual(state.failures, []);
    return { rejected: invalid.length, normalizedAndSaved: valid.length };
  } finally {
    await context.close();
  }
}

process.umask(0o077);
mkdirSync(out);
process.env.VITE_SUPABASE_URL = origin;
process.env.VITE_SUPABASE_ANON_KEY = "fixture-only";
const vite = await createServer({
  cacheDir: join(out, "vite-cache"), clearScreen: false,
  server: { host: "127.0.0.1", port, strictPort: true, hmr: false, watch: null },
});
let browser;
try {
  await vite.listen();
  const launched = await launchChrome();
  browser = launched.browser;
  const captures = [];
  for (const theme of ["light", "dark"]) for (const width of [1280, 360]) {
    captures.push(await exercise(browser, theme, width));
    console.log(`${theme} ${width} OK`);
  }
  const delayed = await exerciseLateAck(browser);
  const validation = await exerciseNameValidation(browser);
  const denied = [];
  for (const role of ["member", "support", "moderator", "instructor", "admin"]) {
    const aal = role === "admin" ? "aal1" : "aal2";
    const { context, page, state } = await fixture(browser, { width: 1280, height: 1024 }, "dark", role, aal);
    try {
      await page.goto(brandUrl);
      if (aal === "aal1") await page.waitForURL("**/entrar?returnTo=*");
      else await page.getByText(/Acesso restrito|Você não tem permissão para esta área/).waitFor();
      assert.equal(await page.getByRole("textbox", { name: "Nome da instalação" }).count(), 0);
      assert.deepEqual([state.attempts, state.failures], [[], []]);
      denied.push({ role, aal });
    } finally {
      await context.close();
    }
  }
  writeFileSync(join(out, "resultado.json"), JSON.stringify({ browser: launched.settings, captures, delayed, validation, denied }, null, 2));
} finally {
  await browser?.close();
  await vite.close();
}
