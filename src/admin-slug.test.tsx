import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.hoisted(() => {
  vi.stubEnv("VITE_SUPABASE_URL", "http://127.0.0.1:58521");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-public-key");
});

import { cache } from "./api";
import { AdminPlans, CourseEditor } from "./pages/admin";
import { slugify } from "./slug";

const course = { id: "c", title: "Curso editorial", slug: "editorial", status: "draft", access_mode: "members", certificate_enabled: false };
let saves: { p_entity: string; p_id: string | null; p_data: Record<string, unknown> }[];

beforeEach(() => {
  saves = [];
  // O jsdom não implementa a rolagem que o editor de planos usa ao abrir.
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input), body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
    if (url.endsWith("/app_admin_save")) {
      saves.push(body);
      return Response.json({ id: "novo" });
    }
    const rows: Record<string, unknown[]> = {
      courses: [course],
      modules: [{ id: "m", course_id: "c", title: "Módulo um", slug: "modulo-um", status: "draft", order_index: 0, access_mode: "inherit" }],
      sections: [{ id: "s", module_id: "m", title: "Seção um", status: "draft", order_index: 0 }],
    };
    const items = url.endsWith("/app_admin_list") ? rows[body.p_entity] ?? [] : [];
    return Response.json({ items, total: items.length, page: 1, page_size: 20 });
  }));
});

afterEach(() => {
  cleanup();
  cache.clear();
  vi.unstubAllGlobals();
});

function show(route: string) {
  render(
    <QueryClientProvider client={cache}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path="/admin/cursos/:id" element={<CourseEditor />} />
          <Route path="/admin/planos" element={<AdminPlans />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

it.each([
  ["Landing Page que converte com Hospedagem Gratuita", "landing-page-que-converte-com-hospedagem-gratuita"],
  ["Ação & Reação: módulo 2!", "acao-reacao-modulo-2"],
  ["  --Já   começou__agora--  ", "ja-comecou-agora"],
  ["Preço R$ 49,90", "preco-r-49-90"],
  ["🎉", ""],
  ["a".repeat(119) + " b c", "a".repeat(119)],
])("monta o endereço de %j só com minúsculas, números e hífens", (text, want) => {
  expect(slugify(text)).toBe(want);
});

it("ao criar um curso, o endereço nasce do título e vai junto no salvamento", async () => {
  show("/admin/cursos/novo");
  fireEvent.change(await screen.findByLabelText("Título"), { target: { value: "Landing Page que converte" } });
  expect(screen.getByLabelText("Endereço (slug)")).toHaveValue("landing-page-que-converte");
  fireEvent.click(screen.getByRole("button", { name: "Criar curso" }));
  await waitFor(() => expect(saves).toHaveLength(1));
  expect(saves[0]).toMatchObject({
    p_entity: "courses", p_id: null,
    p_data: { title: "Landing Page que converte", slug: "landing-page-que-converte" },
  });
});

it("corrige o texto digitado no endereço e salva sem erro de formato", async () => {
  show("/admin/cursos/novo");
  fireEvent.change(await screen.findByLabelText("Título"), { target: { value: "Curso novo" } });
  const slug = screen.getByLabelText("Endereço (slug)");
  // Um título inteiro colado no campo, com espaço no fim: o hífen final fica só enquanto a pessoa digita.
  fireEvent.change(slug, { target: { value: "Landing Page que converte com Hospedagem Gratuita " } });
  expect(slug).toHaveValue("landing-page-que-converte-com-hospedagem-gratuita-");
  fireEvent.click(screen.getByRole("button", { name: "Criar curso" }));
  await waitFor(() => expect(saves).toHaveLength(1));
  expect(saves[0].p_data).toMatchObject({ slug: "landing-page-que-converte-com-hospedagem-gratuita" });
  expect(screen.queryByText("Confira o formato deste campo.")).not.toBeInTheDocument();
});

it("ao sair do campo, o endereço fica sem hífen sobrando", async () => {
  show("/admin/cursos/novo");
  const slug = await screen.findByLabelText("Endereço (slug)");
  fireEvent.change(slug, { target: { value: "Meu Link -" } });
  fireEvent.blur(slug);
  expect(slug).toHaveValue("meu-link");
});

it("o endereço escrito à mão não volta a seguir o título, e limpar o campo devolve a montagem", async () => {
  show("/admin/cursos/novo");
  const title = await screen.findByLabelText("Título"), slug = screen.getByLabelText("Endereço (slug)");
  fireEvent.change(slug, { target: { value: "meu-link" } });
  fireEvent.change(title, { target: { value: "Outro título" } });
  expect(slug).toHaveValue("meu-link");
  fireEvent.change(slug, { target: { value: "" } });
  fireEvent.change(title, { target: { value: "Título final" } });
  expect(slug).toHaveValue("titulo-final");
});

it("em um curso já salvo, mudar o título mantém o endereço que já circula", async () => {
  show("/admin/cursos/c");
  fireEvent.change(await screen.findByLabelText("Título"), { target: { value: "Curso editorial renovado" } });
  expect(screen.getByLabelText("Endereço (slug)")).toHaveValue("editorial");
});

it("o endereço do plano nasce do nome", async () => {
  show("/admin/planos");
  fireEvent.click(await screen.findByRole("button", { name: "Criar plano" }));
  fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Plano Anual Ouro" } });
  expect(screen.getByLabelText("Endereço (slug)")).toHaveValue("plano-anual-ouro");
});

it("enquanto um acento está sendo composto no teclado, o campo espera para corrigir", async () => {
  show("/admin/cursos/novo");
  const slug = await screen.findByLabelText("Endereço (slug)");
  // Teclado com tecla morta: o acento chega sozinho antes da letra. Mexer no valor aqui cancelaria a composição.
  fireEvent.input(slug, { target: { value: "curso-´" }, isComposing: true });
  expect(slug).toHaveValue("curso-´");
  // O Safari e o Firefox mandam mais um evento de digitação depois da composição.
  fireEvent.input(slug, { target: { value: "curso-á" } });
  expect(slug).toHaveValue("curso-a");
  // O Chrome encerra a composição sem esse evento extra.
  fireEvent.input(slug, { target: { value: "curso-aé" }, isComposing: true });
  expect(slug).toHaveValue("curso-aé");
  fireEvent.compositionEnd(slug);
  expect(slug).toHaveValue("curso-ae");
});

it("corrigir o texto no meio do endereço mantém o cursor onde a pessoa estava", async () => {
  show("/admin/cursos/novo");
  const slug = await screen.findByLabelText("Endereço (slug)") as HTMLInputElement;
  // Dois espaços digitados depois de "a" viram um hífen só, e o cursor acompanha.
  fireEvent.input(slug, { target: { value: "a  b", selectionStart: 3, selectionEnd: 3 } });
  expect(slug).toHaveValue("a-b");
  expect([slug.selectionStart, slug.selectionEnd]).toEqual([2, 2]);
});

it.each([
  ["módulo", "Adicionar módulo", "modules"],
  ["aula", "Adicionar aula", "lessons"],
])("o endereço de %s digitado com sobra vai limpo no salvamento", async (_, trigger, entity) => {
  show("/admin/cursos/c?aba=estrutura");
  fireEvent.click(await screen.findByRole("button", { name: trigger }));
  fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Conteúdo novo" } });
  // Com o espaço do fim, o campo fica com um hífen sobrando enquanto a pessoa digita.
  fireEvent.change(screen.getByLabelText("Endereço (slug)"), { target: { value: "Meu Conteúdo " } });
  fireEvent.click(screen.getByRole("button", { name: "Salvar conteúdo" }));
  await waitFor(() => expect(saves).toHaveLength(1));
  expect(saves[0]).toMatchObject({ p_entity: entity, p_id: null, p_data: { title: "Conteúdo novo", slug: "meu-conteudo" } });
});

it("o endereço do plano digitado com sobra vai limpo no salvamento", async () => {
  show("/admin/planos");
  fireEvent.click(await screen.findByRole("button", { name: "Criar plano" }));
  fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Plano Ouro" } });
  fireEvent.change(screen.getByLabelText("Endereço (slug)"), { target: { value: "Ouro Anual " } });
  fireEvent.click(screen.getByRole("button", { name: "Salvar plano" }));
  await waitFor(() => expect(saves).toHaveLength(1));
  expect(saves[0]).toMatchObject({ p_entity: "plans", p_id: null, p_data: { name: "Plano Ouro", slug: "ouro-anual" } });
});
