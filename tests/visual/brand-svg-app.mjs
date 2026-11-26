import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { createReadStream, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { browserContext, launchChrome, pngSize } from "./browser.mjs";

const [output, policyFile] = process.argv.slice(2);
assert(output && policyFile, "Uso: node tests/visual/brand-svg-app.mjs DIRETÓRIO CSP-CADDY");
const policy = readFileSync(policyFile, "utf8").match(/Content-Security-Policy "([^"]+)"/)[1];
const storage = policy.match(/img-src[^;]* (https:\/\/[^ ]+\.supabase\.co)/)[1];
const out = resolve(output);
const dist = resolve("dist");
mkdirSync(out, { recursive: true });
const formats = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2" };
const server = createServer((req, res) => {
  const path = new URL(req.url, "http://127.0.0.1").pathname;
  const candidate = resolve(dist, "." + path);
  const file = candidate.startsWith(dist + "/") && statSync(candidate, { throwIfNoEntry: false })?.isFile() ? candidate : join(dist, "index.html");
  res.writeHead(200, { "content-type": formats[extname(file)] ?? "application/octet-stream", "content-security-policy": policy,
    "x-content-type-options": "nosniff" });
  createReadStream(file).pipe(res);
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const origin = `http://127.0.0.1:${server.address().port}`;
const require = createRequire(import.meta.url);
const { PNG } = require(process.env.STITCH_PNGJS || "pngjs");

const rect = (x, y, width, height) => `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="5" fill="url(#paint)"/>`;
const artwork = {
  horizontal: ['viewBox="0 0 320 80"', rect(0, 0, 320, 80), 4],
  quadrada: ['viewBox="0 0 120 120"', rect(0, 0, 120, 120), 1],
  margem: ['viewBox="0 0 800 400"', rect(200, 140, 400, 120), 10 / 3],
  dimensoes: ['viewBox="0 0 320 100" width="37" height="900" preserveAspectRatio="none"', rect(0, 0, 320, 100), 3.2],
};
function svg([geometry, content], dark) {
  const colors = dark ? ["#f6b8ef", "#fff"] : ["#8f00d9", "#ea00a8"];
  return `<svg xmlns="http://www.w3.org/2000/svg" ${geometry}>
    <defs><linearGradient id="paint"><stop stop-color="${colors[0]}"/><stop offset="1" stop-color="${colors[1]}"/></linearGradient></defs>
    ${content}</svg>`;
}
const variants = Object.fromEntries(Object.entries(artwork).map(([shape, art]) => [shape, {
  light: svg(art, false), dark: svg(art, true), icon: svg(art, false),
}]));
const normalizer = spawnSync("deno", ["eval", "--no-lock", "--node-modules-dir=manual", `
  import { normalizeBrandSvg } from "./supabase/functions/upload/svg.ts";
  const input = JSON.parse(await new Response(Deno.stdin.readable).text());
  const result = {};
  for (const [shape, variants] of Object.entries(input)) {
    result[shape] = {};
    for (const [variant, svg] of Object.entries(variants)) {
      result[shape][variant] = await normalizeBrandSvg(new TextEncoder().encode(svg), variant);
    }
  }
  console.log(JSON.stringify(result));
`], { input: JSON.stringify(variants), encoding: "utf8" });
assert.equal(normalizer.status, 0, normalizer.stderr);
const cleaned = JSON.parse(normalizer.stdout);
const id = "11111111-1111-4111-8111-111111111111";
const code = "a".repeat(48);
const certificate = { code, student_name: "Aluna da demonstração", course_title: "Curso de demonstração", duration_minutes: 120,
  issued_at: "2026-11-26T15:00:00Z", signer_name: "Equipe de ensino", signer_title: "Coordenação", demo: true };
const paths = { light: `logo/light-${id}.svg`, dark: `logo/dark-${id}.svg`, icon: `icon/${id}.svg` };
const key = `sb-${new URL(storage).hostname.split(".")[0]}-auth-token`;
const { browser, settings } = await launchChrome();
const results = [];

async function fixture(shape, theme, width, role) {
  const viewport = { width, height: width === 360 ? 880 : 1024 };
  const browserFixture = await browser.newContext({ ...browserContext, viewport, acceptDownloads: true });
  const files = cleaned[shape];
  const voice = "Academia demonstração";
  const published = { name: voice, legal_versions: [], plans: [], logo_light: paths.light, logo_dark: paths.dark, icon: paths.icon,
    logo_light_ratio: files.light.ratio, logo_dark_ratio: files.dark.ratio };
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const user = { id, role: "authenticated", aud: "authenticated", factors: [],
    email: "chrome-fixture@example.test" };
  const profile = { id, full_name: "Conta de demonstração", role, theme, onboarding_complete: true };
  const token = [{ alg: "HS256", typ: "JWT" }, { sub: id, session_id: id, exp: expires, aal: "aal2" }, "fixture"]
    .map((part) => Buffer.from(JSON.stringify(part)).toString("base64url")).join(".");
  await browserFixture.addInitScript(({ key, session }) => {
    if (session) localStorage.setItem(key, JSON.stringify(session));
  }, { key, session: role ? { access_token: token, refresh_token: "fixture", expires_at: expires, user } : null });
  const errors = [];
  let previews = 0;
  await browserFixture.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === origin) return route.continue();
    if (url.origin === "https://api.github.com") return route.fulfill({ json: { tag_name: "v2.9.0" } });

    if (url.origin !== storage) { errors.push(`Origem inesperada: ${url.origin}`); return route.abort(); }
    const headers = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,OPTIONS" };
    if (route.request().method() === "OPTIONS") return route.fulfill({ headers, body: "" });
    for (const [variant, path] of Object.entries(paths)) {
      if (url.pathname.endsWith("/icarus-brand/" + path)) return route.fulfill({ contentType: "image/svg+xml", headers, body: files[variant].svg });
    }
    const reply = (json) => route.fulfill({ headers, json });
    switch (url.pathname.split("/").at(-1)) {
      case "user": return reply(user);
      case "app_bootstrap": return reply({ profile, plans: [], orders: [], settings: { ...published, name_revision: 0 } });
      case "app_public_context": return reply(published);
      case "app_touch_session": return reply({ expires_at: new Date(expires * 1000).toISOString(), warning_seconds: 60 });
      case "app_notifications": return reply({ items: [], unread_count: 0, total: 0, page: 1, page_size: 20 });
      case "app_certificate": return reply(certificate);
      case "app_certificates": return reply({ items: [certificate], courses: [] });
      case "capabilities": return reply({ asaas: false, bunny: false, storage: true });
      case "upload": {
        const form = route.request().postData();
        const variant = /name="variant"\r\n\r\n(light|dark|icon)\r\n/.exec(form)?.[1];
        assert(variant && form.includes("brand-asset-preview"), "A etapa da prévia não pode gravar.");
        previews++;
        return reply(files[variant]);
      }
    }
    return reply({});
  });
  const page = await browserFixture.newPage();
  page.setDefaultTimeout(10000);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.exposeFunction("fixtureCspViolation", (directive, uri) => errors.push(`CSP ${directive}: ${uri}`));
  await page.addInitScript(() => document.addEventListener("securitypolicyviolation", (event) =>
    void window.fixtureCspViolation(event.violatedDirective, event.blockedURI)));
  return { browserFixture, page, errors, files, previews: () => previews };
}

async function assertImage(image, ratio, prefix = "") {
  await image.waitFor();
  await image.scrollIntoViewIfNeeded();
  const rendered = await image.evaluate(async (img) => {
    await img.decode();
    const { width, height } = img.getBoundingClientRect();
    return { width, height, fit: getComputedStyle(img).objectFit, src: img.getAttribute("src"), naturalWidth: img.naturalWidth };
  });
  assert(rendered.naturalWidth > 0 && rendered.fit === "contain" && rendered.height > 0);
  assert(Math.abs(rendered.width / rendered.height - ratio) < 0.025, JSON.stringify({ rendered, ratio }));
  if (prefix) assert(rendered.src.startsWith(prefix), rendered.src);
  return rendered;
}

async function capture(page, label, shape, theme, width, images) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    window.scrollTo(0, 0);
  });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width, label);
  const name = `${shape}-${theme}-${width}-${label}.png`;
  await page.screenshot({ path: join(out, name), animations: "disabled", fullPage: true });
  results.push({ name, images });
}

function certificateLogo(path, ratio, sampleWidth, sampleHeight) {
  const png = PNG.sync.read(readFileSync(path));
  let minX = png.width, minY = png.height, maxX = 0, maxY = 0;
  for (let y = 0; y < sampleHeight; y++) {
    for (let x = 0; x < sampleWidth; x++) {
      const i = (y * png.width + x) * 4;
      if (png.data[i] < 250 && png.data[i + 1] < 90 && png.data[i + 2] > 90) {
        minX = Math.min(minX, x); minY = Math.min(minY, y);
        maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      }
    }
  }
  assert(maxX > minX && maxY > minY, "Marca ausente no certificado");
  const found = (maxX - minX + 1) / (maxY - minY + 1);
  assert(Math.abs(found - ratio) < 0.09, JSON.stringify({ found, ratio }));
  return [minX, minY, maxX, maxY];
}

try {
  for (const [shape, art] of Object.entries(artwork)) {
    for (const theme of ["light", "dark"]) {
      for (const width of [1280, 360]) {
        const guest = await fixture(shape, theme, width, null);
        try {
          const { page, files, errors } = guest;
          assert(Math.abs(files[theme].ratio - art[2]) < 0.09, shape);
          await page.goto(origin + "/entrar");
          await page.locator(".public-top .brand-custom").first().waitFor({ state: "attached" });
          await page.evaluate((tone) => { document.documentElement.dataset.theme = tone; }, theme);
          const publicLogo = await assertImage(page.locator(".public-top .brand-custom:visible"), files[theme].ratio, storage);
          await page.waitForFunction((path) => document.querySelector('link[rel="icon"]').href.endsWith(path), paths.icon);
          assert.equal(await page.locator('link[rel="icon"]').getAttribute("type"), "image/svg+xml");
          await capture(page, "entrada", shape, theme, width, [publicLogo]);

          await page.goto(origin + "/checkout");
          await page.locator(".public-top .brand-custom").first().waitFor({ state: "attached" });
          await page.evaluate((tone) => { document.documentElement.dataset.theme = tone; }, theme);
          const checkoutLogo = await assertImage(page.locator(".public-top .brand-custom:visible"), files[theme].ratio, storage);
          await capture(page, "checkout", shape, theme, width, [checkoutLogo]);

          await page.goto(`${origin}/verificar/${code}`);
          await page.locator(".certificate-brand .brand-custom").first().waitFor({ state: "attached" });
          await page.evaluate((tone) => { document.documentElement.dataset.theme = tone; }, theme);
          const certLogo = await assertImage(page.locator(".certificate-brand .brand-custom:visible"), files[theme].ratio, storage);
          await capture(page, "certificado", shape, theme, width, [certLogo]);
          if (theme === "light" && width === 1280) {
            for (const format of ["PNG", "PDF"]) {
              const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Baixar " + format }).click()]);
              const target = join(out, `export-${shape}.${format.toLowerCase()}`);
              await download.saveAs(target);
              if (format === "PNG") {
                assert.deepEqual(pngSize(readFileSync(target)), { width: 3200, height: 2240 });
                results.push({ name: target, logoBounds: certificateLogo(target, files.light.ratio, 840, 385) });
              } else {
                const rendered = join(out, `export-${shape}-pdf`);
                const pdf = spawnSync("pdftoppm", ["-r", "144", "-png", "-singlefile", target, rendered], { encoding: "utf8" });
                assert.equal(pdf.status, 0, pdf.stderr);
                results.push({ name: target, logoBounds: certificateLogo(rendered + ".png", files.light.ratio, 420, 192) });
              }
            }
          }
          assert.deepEqual(errors, []);
        } finally { await guest.browserFixture.close(); }

        const member = await fixture(shape, theme, width, "member");
        try {
          const { page, files, errors } = member;
          await page.goto(origin + "/app/configuracoes?aba=perfil");
          if (width === 360) {
            const top = await assertImage(page.locator(".mobile-frame-label .brand-custom:visible"), files[theme].ratio, storage);
            await capture(page, "topo-aluno", shape, theme, width, [top]);
            await page.getByRole("button", { name: "Abrir navegação" }).click();
            const drawer = await assertImage(page.locator('[role="dialog"] .rail-brand .brand-custom:visible'), files[theme].ratio, storage);
            await capture(page, "gaveta-aluno", shape, theme, width, [drawer]);
          } else {
            const rail = await assertImage(page.locator(".sidebar .rail-brand .brand-custom:visible"), files[theme].ratio, storage);
            await capture(page, "lateral-aluno", shape, theme, width, [rail]);
          }
          assert.deepEqual(errors, []);
        } finally { await member.browserFixture.close(); }

        const admin = await fixture(shape, theme, width, "admin");
        try {
          const { page, files, errors } = admin;
          await page.goto(origin + "/admin/configuracoes?aba=marca");
          const adminSelector = width === 360 ? ".admin-topbar-brand" : ".sidebar .rail-brand";
          const brand = await assertImage(page.locator(`${adminSelector} .brand-custom:visible`), files[theme].ratio, storage);
          await capture(page, width === 360 ? "topo-admin" : "lateral-admin", shape, theme, width, [brand]);
          if (width === 360) {
            await page.getByRole("button", { name: "Abrir navegação" }).click();
            const drawer = await assertImage(page.locator('[role="dialog"] .rail-brand .brand-custom:visible'), files[theme].ratio, storage);
            await capture(page, "gaveta-admin", shape, theme, width, [drawer]);
            await page.getByRole("button", { name: "Fechar navegação" }).click();
          }
          for (const variant of ["light", "dark", "icon"]) {
            await page.locator(`[data-variant="${variant}"] input[type="file"]`).setInputFiles({
              name: `${shape}.svg`, mimeType: "image/svg+xml", buffer: Buffer.from(variants[shape][variant]),
            });
            await page.locator(`[data-variant="${variant}"] img[src^="blob:"]`).waitFor();
          }
          const snapshots = [];
          const visible = page.locator(".brand-samples .brand-custom:visible");
          for (const logo of await visible.all()) {
            const slot = await logo.evaluate((img) => [img.closest("[data-brand-slot]").dataset.brandSlot, img.closest("[data-theme]").dataset.theme]);
            snapshots.push(await assertImage(logo, slot[0] === "icon" ? 1 : files[slot[1]].ratio, "blob:"));
          }
          assert.equal(snapshots.length, 15);
          assert.equal(admin.previews(), 3);
          assert.equal(await page.getByRole("button", { name: "Salvar logo colorida" }).isEnabled(), true);
          assert.deepEqual(errors, []);
          await capture(page, "previa", shape, theme, width, snapshots);
        } finally { await admin.browserFixture.close(); }
      }
    }
  }
  writeFileSync(join(out, "chrome.json"), JSON.stringify({ settings, csp: policy, results }, null, 2));
  console.log(`${results.length} capturas e exportações verificados no Chrome.`);
} finally {
  await browser.close();
  await new Promise((done) => server.close(done));
}
