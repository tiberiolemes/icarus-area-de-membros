import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.hoisted(() => {
  vi.stubEnv("VITE_SUPABASE_URL", "http://127.0.0.1:58521");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-public-key");
});

import { cache } from "./api";
import { CourseEditor } from "./pages/admin";

const lesson = (id: string, section_id: string, title: string, order_index = 0) =>
  ({ id, section_id, title, slug: id, type: "text", status: "published", order_index });
let rows: Record<string, Record<string, unknown>[]>;
let calls: { name: string; body: Record<string, unknown> }[];

beforeEach(() => {
  calls = [];
  rows = {
    courses: [{ id: "c", title: "Curso editorial", slug: "editorial", status: "draft", access_mode: "members" }],
    modules: [
      { id: "m", course_id: "c", title: "Módulo com aulas soltas", slug: "soltas", status: "published", order_index: 0 },
      { id: "n", course_id: "c", title: "Módulo vazio", slug: "vazio", status: "draft", order_index: 1 },
    ],
    sections: [
      { id: "auto", module_id: "m", title: "Aulas do módulo", status: "published", order_index: -1, is_default: true },
      { id: "s", module_id: "m", title: "Prática", status: "published", order_index: 0, is_default: false },
      { id: "t", module_id: "m", title: "Revisão", status: "published", order_index: 1, is_default: false },
    ],
    lessons: [lesson("a", "auto", "Boas-vindas"), lesson("b", "s", "Exercício")],
  };
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const name = String(input).split("/").at(-1)!, body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
    calls.push({ name, body });
    if (name === "app_admin_default_section") return Response.json("auto-nova");
    if (name === "app_admin_save") return Response.json({ id: body.p_id ?? "nova" });
    const items = name === "app_admin_list" ? rows[body.p_entity] ?? [] : [];
    return Response.json({ items, total: items.length, page: 1, page_size: 20 });
  }));
});

afterEach(() => {
  cleanup();
  cache.clear();
  vi.unstubAllGlobals();
});

function show() {
  render(
    <QueryClientProvider client={cache}>
      <MemoryRouter initialEntries={["/admin/cursos/c?aba=estrutura"]}>
        <Routes><Route path="/admin/cursos/:id" element={<CourseEditor />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

it("mostra as aulas soltas direto no módulo, sem cabeçalho nem lápis da seção automática", async () => {
  show();
  const module = (await screen.findByRole("heading", { name: /Módulo com aulas soltas/ })).closest("section")!;
  expect(within(module).getByText("Boas-vindas")).toBeInTheDocument();
  expect(within(module).queryByText("Aulas do módulo")).toBeNull();
  expect(within(module).queryByRole("button", { name: /Editar seção Aulas do módulo/ })).toBeNull();
  expect(within(module).getByRole("heading", { name: "Prática" })).toBeInTheDocument();
  expect(within(module).getByRole("button", { name: "Adicionar aula em Prática" })).toBeInTheDocument();
  expect(within(module).getByRole("button", { name: "Adicionar seção" })).toBeInTheDocument();
});

it("adiciona aula direto no módulo usando a seção automática do servidor", async () => {
  show();
  const module = (await screen.findByRole("heading", { name: /Módulo vazio/ })).closest("section")!;
  fireEvent.click(within(module).getByRole("button", { name: "Adicionar aula" }));
  expect(calls.some(({ name }) => name === "app_admin_default_section")).toBe(false);
  fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Primeira aula" } });
  fireEvent.change(screen.getByLabelText("Endereço (slug)"), { target: { value: "primeira-aula" } });
  fireEvent.click(screen.getByRole("button", { name: "Salvar conteúdo" }));
  await waitFor(() => expect(calls.some(({ name }) => name === "app_admin_save")).toBe(true));
  expect(calls.find(({ name }) => name === "app_admin_default_section")?.body).toEqual({ p_module_id: "n" });
  expect(calls.find(({ name }) => name === "app_admin_save")?.body).toMatchObject({
    p_entity: "lessons", p_id: null, p_data: { title: "Primeira aula", section_id: "auto-nova" },
  });
});

it("reordena só as seções criadas pela equipe e mantém a automática no topo", async () => {
  show();
  fireEvent.click(await screen.findByRole("button", { name: "Reordenar" }));
  expect(screen.queryByRole("button", { name: "Subir Aulas do módulo" })).toBeNull();
  expect(screen.getByRole("button", { name: "Subir Prática" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Subir Revisão" }));
  await waitFor(() => expect(calls.filter(({ name }) => name === "app_admin_save")).toHaveLength(2));
  expect(calls.filter(({ name }) => name === "app_admin_save").map(({ body }) => body)).toEqual([
    { p_entity: "sections", p_id: "t", p_data: { order_index: 0 } },
    { p_entity: "sections", p_id: "s", p_data: { order_index: 1 } },
  ]);
});
