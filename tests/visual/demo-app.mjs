import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { launchChrome } from "./browser.mjs";

const [address, output] = process.argv.slice(2);
assert(address && output, "Uso: node tests/visual/demo-app.mjs URL DIRETÓRIO");
const target = new URL(address);
mkdirSync(output, { recursive: true });
const { browser } = await launchChrome();

async function open(width) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
  const external = [], errors = [];
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.origin === target.origin) return route.continue();
    external.push(url.origin);
    return route.abort();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(9000);
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 400) errors.push(response.status() + " " + new URL(response.url()).pathname);
  });
  const visit = (path) => page.goto(target.href + "#" + path);
  const heading = (name) => page.getByRole("heading", { name, exact: true }).first();
  const button = (name) => page.getByRole("button", { name, exact: true }).first();
  async function capture(name) {
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width, name);
    assert.match(await page.locator("h1").first().evaluate((el) => getComputedStyle(el).fontFamily), /Inter/);
    assert.deepEqual(await page.locator("img").evaluateAll((images) =>
      images.filter((img) => img.getClientRects().length && img.complete && !img.naturalWidth).map((img) => img.getAttribute("src"))), []);
    await page.screenshot({ path: join(output, `${name}-${width}.png`), animations: "disabled" });
  }
  return { context, page, visit, heading, button, capture, external, errors };
}

try {
  for (const width of [1280, 360]) {
    const { context, page, visit, heading, button, capture, external, errors } = await open(width);
    try {
      await visit("/entrar");
      await heading("Entre na sua área de membros").waitFor();
      await capture("login");
      await button("Entrar como aluno").click();
      await page.locator(".showcase").waitFor();
      await page.locator(".showcase-grid article").first().waitFor();
      assert.equal(await page.locator(".showcase-grid article").count(), 4);
      await capture("catalogo");
      const catalogUrl = page.url();
      await page.getByRole("link", { name: "Pular para o conteúdo" }).press("Enter");
      assert.equal(page.url(), catalogUrl);
      assert.equal(await page.evaluate(() => document.activeElement.id), "main");
      await page.getByRole("link", { name: /retomar aula/i }).first().click();
      await heading("Organize módulos e aulas").waitFor();
      await page.waitForFunction(() => document.querySelector("video")?.readyState >= 2);
      await page.waitForFunction(() => document.querySelector("video")?.currentTime >= 3.9);
      await capture("player");
      await button(width === 360 ? "Concluir Aula" : "Marcar como concluída").click();
      await page.getByText("Aula concluída", { exact: true }).first().waitFor();
      const lessonUrl = page.url();
      await page.reload();
      await page.getByText("Aula concluída", { exact: true }).first().waitFor();
      await visit("/app/cursos/estrutura-cursos/primeiros-passos/~00000000-0000-4000-8000-000000000302");
      await heading("Revise a experiência do aluno").waitFor();
      await button(width === 360 ? "Concluir Aula" : "Marcar como concluída").click();
      await page.getByText(/certificado emitido/).first().waitFor();
      await visit("/app/certificados");
      await page.getByRole("link", { name: "Abrir certificado", exact: true }).click();
      await page.getByText("Demonstração sem validade", { exact: true }).first().waitFor();
      await page.goto(lessonUrl);
      await page.getByRole("tab", { name: /materiais/i }).click();
      const download = page.waitForEvent("download");
      await button("Baixar").click();
      assert.match((await download).suggestedFilename(), /Roteiro de curso/);
      await visit("/app/comunidade");
      await page.getByText("Bem-vindos à comunidade", { exact: true }).first().waitFor();
      await capture("comunidade");
      await visit("/app/suporte");
      await heading("Central de Suporte & Atendimento").waitFor();
      await page.getByText("Onde encontro o roteiro de aula?", { exact: true }).first().waitFor();
      await capture("suporte");
      await visit("/app/suporte/novo");
      await page.getByLabel("Assunto", { exact: true }).fill("Dúvida sobre material");
      await page.getByLabel("Mensagem", { exact: true }).fill("Onde posso baixar o roteiro da aula?");
      await button("Enviar chamado").click();
      await heading("Dúvida sobre material").waitFor();
      await visit("/app/encontros-ao-vivo");
      await button("Confirmar presença").click();
      await button("Cancelar presença").waitFor();
      await visit("/app/ranking");
      const ranking = page.getByRole("link", { name: "Como pontuar" });
      await ranking.waitFor();
      const rankingUrl = page.url();
      await ranking.press("Enter");
      assert.equal(page.url(), rankingUrl);
      await visit("/app/configuracoes?aba=perfil");
      await heading("Configurações da conta").waitFor();
      if (width === 360) {
        await button("Abrir navegação").click();
      }
      await page.getByRole("button", { name: /Mudar para tema escuro/i }).first().click();
      await page.waitForFunction(() => document.documentElement.dataset.theme === "dark");
      await visit("/app/cursos");
      await page.locator(".showcase").waitFor();
      await capture("catalogo-escuro");
      await visit("/admin/dashboard");
      await page.getByRole("alert").filter({ hasText: "Acesso restrito" }).waitFor();
      assert.deepEqual(errors, []);
      assert.deepEqual(external, []);
    } finally { await context.close(); }

    const admin = await open(width);
    try {
      const { page, visit, heading, button, capture, external, errors } = admin;
      await visit("/entrar");
      await button("Entrar como administrador").click();
      await heading("Dashboard Executivo & Métricas").waitFor();
      await page.locator(".reports-kpis").waitFor();
      await capture("dashboard");
      await visit("/admin/cursos");
      await heading("Cursos e aulas").waitFor();
      await page.getByRole("link", { name: "Editar curso", exact: true }).first().waitFor();
      await capture("cursos-admin");
      await page.getByRole("link", { name: "Editar curso", exact: true }).first().click();
      await heading("Estratégia de cursos digitais").waitFor();
      await capture("editor");
      await visit("/admin/cursos/novo");
      await page.getByLabel("Título", { exact: true }).fill("Curso de teste");
      await page.getByLabel(/slug|endereço/i).fill("curso-de-teste");
      await button("Criar curso").click();
      await heading("Curso de teste").waitFor();
      await page.getByLabel("Estado", { exact: true }).selectOption("published");
      await button("Salvar curso").click();
      await page.getByText("Publicado", { exact: true }).first().waitFor();
      await visit("/app/cursos");
      await heading("Curso de teste").waitFor();
      await visit("/admin/comunidade");
      await page.getByText("Checklist para publicar um curso", { exact: true }).first().waitFor();
      await capture("moderacao");
      const post = page.getByText("Checklist para publicar um curso", { exact: true }).first();
      const card = post.locator("../..");
      await card.getByText("Moderação manual", { exact: true }).click();
      await card.getByLabel("Motivo da decisão").fill("Conteúdo adequado à comunidade.");
      page.once("dialog", (dialog) => dialog.accept());
      await card.getByRole("button", { name: "Confirmar decisão" }).click();
      await page.getByRole("link", { name: "Checklist para publicar um curso", exact: true }).locator("../..").getByText(/^Publicado/).waitFor();
      await visit("/admin/suporte");
      await page.getByText("Onde encontro o roteiro de aula?", { exact: true }).first().waitFor();
      await capture("suporte-admin");
      await visit("/admin/suporte/00000000-0000-4000-8000-000000000050");
      await page.getByLabel("Sua resposta", { exact: true }).fill("O roteiro está na pasta Roteiros de curso.");
      await button("Enviar resposta").click();
      await page.getByText("O roteiro está na pasta Roteiros de curso.", { exact: true }).waitFor();
      await visit("/admin/membros/00000000-0000-4000-8000-000000000001");
      await heading("Marina Costa").waitFor();
      await page.getByRole("heading", { name: /Aprendizado/ }).waitFor();
      assert.deepEqual(errors, []);
      assert.deepEqual(external, []);
    } finally { await admin.context.close(); }
    console.log(`DEMO em ${width}px: aluno, administração, aulas, rotas e isolamento aprovados.`);
  }
} finally { await browser.close(); }
