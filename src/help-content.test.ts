import { expect, it } from "vitest";
import { articles, articleText, categories, plain, type HelpArticle, type HelpImage } from "./pages/help-content";
import { helpPathFor } from "./pages/help-paths";

const slugs = new Set(articles.map(({ slug }) => slug));
/** Todo texto de um artigo, ainda com a marcação. */
const strings = ({ title, summary, need = [], sections, trouble = [] }: HelpArticle) => [title, summary, ...need, ...trouble.flat(),
  ...sections.flatMap(({ title, intro, steps = [], list = [], note, warn }) => [title, intro, note, warn, ...list,
    ...steps.flatMap((step) => typeof step === "string" ? [step] : [step.text, step.note])]),
].filter((text): text is string => !!text);
const images = ({ sections }: HelpArticle) => sections.flatMap(({ image, steps = [] }) => [image,
  ...steps.map((step) => typeof step === "string" ? undefined : step.image)]).filter((image): image is HelpImage => !!image);

it("cada artigo tem endereço único, assunto existente e conteúdo, e nenhum assunto fica vazio", () => {
  expect(slugs.size).toBe(articles.length);
  for (const article of articles) {
    expect(article.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(categories.some(({ id }) => id === article.category), article.slug).toBe(true);
    expect(article.sections.length, article.slug).toBeGreaterThan(0);
    for (const { steps, list, intro } of article.sections) expect(Boolean(steps?.length || list?.length || intro), article.slug).toBe(true);
  }
  for (const { id } of categories) expect(articles.some((article) => article.category === id), id).toBe(true);
});

it("links entre artigos e relacionados apontam para artigos que existem", () => {
  for (const article of articles) {
    for (const related of article.related ?? []) {
      expect(slugs.has(related), `${article.slug} → ${related}`).toBe(true);
      expect(related).not.toBe(article.slug);
    }
    for (const text of strings(article))
      for (const [, target] of text.matchAll(/\]\(\/ajuda\/([^)]*)\)/g)) expect(slugs.has(target), `${article.slug} → ${target}`).toBe(true);
  }
});

it("os endereços de ajuda usados pelas telas e pelo guia continuam válidos", () => {
  const linked = ["acesso", "cursos", "certificados", "suporte", "comunidade", "encontros", "criar-curso"];
  const screens = ["/admin/dashboard", "/admin/analytics", "/admin/cursos", "/admin/cursos/1", "/admin/cursos/1/aulas/2/apresentacao",
    "/admin/materiais", "/admin/membros/1", "/admin/planos", "/admin/pedidos/1", "/admin/encontros", "/admin/podcasts/novo",
    "/admin/comunidade", "/admin/comentarios-aula", "/admin/suporte/1", "/admin/feedbacks", "/app/cursos", "/app/cursos/a/b/c",
    "/app/materiais", "/app/podcasts", "/app/certificados", "/app/ranking", "/app/encontros-ao-vivo", "/app/notificacoes",
    "/app/comunidade/novo", "/app/suporte"].map((path) => helpPathFor(path));
  const tabs = ["", "onboarding", "marca", "certificado", "modulos", "integracoes", "integracoes&provedor=bunny", "legal", "equipe", "auditoria", "privacidade"]
    .map((tab) => helpPathFor("/admin/configuracoes", "?aba=" + tab));
  const account = ["", "notificacoes", "assinatura", "seguranca", "privacidade"].map((tab) => helpPathFor("/app/configuracoes", "?aba=" + tab));
  for (const path of [...linked.map((slug) => "/ajuda/" + slug), ...screens, ...tabs, ...account])
    expect(slugs.has(path.replace("/ajuda/", "")), path).toBe(true);
  expect(helpPathFor("/admin/configuracoes", "?aba=integracoes&provedor=bunny")).toBe("/ajuda/integracao-bunny");
  expect(helpPathFor("/admin/configuracoes", "?aba=integracoes")).toBe("/ajuda/integracao-asaas");
  expect(helpPathFor("/admin/configuracoes", "?aba=certificado")).toBe("/ajuda/certificado-do-curso");
  expect(helpPathFor("/onboarding")).toBe("/ajuda");
});

it("a tela mais específica abre o artigo dela, e não o da tela geral", () => {
  expect(helpPathFor("/admin/cursos/1/aulas/2/apresentacao")).toBe("/ajuda/apresentacao-da-aula");
  expect(helpPathFor("/admin/cursos/1")).toBe("/ajuda/criar-curso");
  expect(helpPathFor("/app/cursos/a/b/c")).toBe("/ajuda/recursos-da-aula");
  expect(helpPathFor("/app/cursos/a")).toBe("/ajuda/cursos");
  expect(helpPathFor("/admin/membros/1")).toBe("/ajuda/membros");
  expect(helpPathFor("/admin/tela-sem-artigo")).toBe("/ajuda/administracao");
});

it("aba desconhecida, inclusive nome herdado de objeto, abre o artigo padrão da tela", () => {
  for (const tab of ["constructor", "toString", "__proto__", "aba-que-nao-existe"]) {
    expect(helpPathFor("/admin/configuracoes", "?aba=" + tab)).toBe("/ajuda/perguntas-do-primeiro-acesso");
    expect(helpPathFor("/app/configuracoes", "?aba=" + tab)).toBe("/ajuda/conta");
  }
});

it("toda imagem tem descrição que cita os números marcados, legenda e dimensões", () => {
  const all = articles.flatMap(images);
  expect(all.length).toBeGreaterThan(15);
  for (const { src, alt, caption, width, height } of all) {
    expect(src, alt).toBeTruthy();
    expect(alt.length, alt).toBeGreaterThan(40);
    expect(alt).toMatch(/número \d|\d [A-Z]/);
    expect(caption, alt).toBeTruthy();
    expect(Math.min(width, height), alt).toBeGreaterThan(300);
  }
});

it("o texto segue o padrão de escrita: sem travessão, título sem ponto e resumo curto", () => {
  for (const article of articles) {
    for (const text of strings(article)) expect(text, article.slug).not.toMatch(/[—–]|TL;DR/);
    expect(article.title, article.slug).not.toMatch(/[.:!]$/);
    expect(article.summary.length, article.slug).toBeLessThan(220);
  }
});

it("a marcação dos artigos é só a que a tela sabe desenhar, e todo link leva a um artigo ou a um site em https", () => {
  const broken = (text: string) => /\*\*|`|\]\(/.test(plain(text));
  // O detector primeiro: negrito sem par, link dentro de negrito e crase solta sobram depois de tirar a marcação válida.
  for (const sample of ["**Salvar sem fechar", "**[guia](/ajuda/cursos)**", "cole `abc"]) expect(broken(sample), sample).toBe(true);
  for (const article of articles)
    for (const text of strings(article)) {
      expect(broken(text), `${article.slug}: ${text}`).toBe(false);
      for (const [, target] of text.matchAll(/\]\(([^)]*)\)/g))
        expect(target, `${article.slug}: ${text}`).toMatch(/^(\/ajuda\/[a-z0-9-]+|https:\/\/[^\s()]+)$/);
    }
});

it("título, resumo, pergunta e legenda não levam marcação, porque a tela mostra esses textos como estão", () => {
  for (const article of articles) {
    const shown = [article.title, article.summary, ...article.sections.map(({ title }) => title),
      ...(article.trouble ?? []).map(([question]) => question), ...images(article).flatMap(({ alt, caption }) => [alt, caption])];
    for (const text of shown) if (text) expect(text, article.slug).not.toMatch(/\*\*|`|\]\(/);
  }
});

it("a busca lê o texto sem a marcação, incluindo a descrição das imagens", () => {
  expect(plain("Clique em **Salvar**, cole `abc` e veja [o guia](/ajuda/cursos).")).toBe("Clique em Salvar, cole abc e veja o guia.");
  const asaas = articleText(articles.find(({ slug }) => slug === "integracao-asaas")!);
  expect(asaas).toContain("Gerar chave de API");
  expect(asaas).toContain("menu do usuário aberto");
  expect(asaas).not.toMatch(/\*\*|\]\(/);
});
