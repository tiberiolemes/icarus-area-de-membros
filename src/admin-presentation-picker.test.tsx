import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.hoisted(() => {
  vi.stubEnv("VITE_SUPABASE_URL", "http://127.0.0.1:58521");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-public-key");
});

import { cache } from "./api";
import { AdminCourses } from "./pages/admin";

const lesson = (id: string, section_id: string, title: string, order_index: number, status = "published") =>
  ({ id, section_id, title, slug: id, type: "video", status, order_index });
const rows: Record<string, Record<string, unknown>[]> = {
  courses: [
    { id: "c", title: "Curso editorial", slug: "editorial", status: "published", access_mode: "members" },
    { id: "v", title: "Curso vazio", slug: "vazio", status: "draft", access_mode: "members" },
  ],
  modules: [
    { id: "m2", course_id: "c", title: "Avançado", slug: "avancado", status: "published", order_index: 1 },
    { id: "m1", course_id: "c", title: "Fundamentos", slug: "fundamentos", status: "published", order_index: 0 },
    { id: "mv", course_id: "v", title: "Módulo sem aulas", slug: "sem-aulas", status: "draft", order_index: 0 },
    { id: "mx", course_id: "x", title: "Outro curso", slug: "outro", status: "published", order_index: 0 },
  ],
  sections: [
    { id: "t", module_id: "m1", title: "Revisão", status: "published", order_index: 1, is_default: false },
    { id: "s", module_id: "m1", title: "Prática", status: "published", order_index: 0, is_default: false },
    { id: "auto", module_id: "m1", title: "Aulas do módulo", status: "published", order_index: 0, is_default: true },
    { id: "u", module_id: "m2", title: "Projeto", status: "published", order_index: 0, is_default: false },
    { id: "x", module_id: "mx", title: "Fora", status: "published", order_index: 0, is_default: false },
  ],
  lessons: [
    lesson("l3", "s", "Exercício", 1),
    lesson("l2", "s", "Aquecimento", 0),
    lesson("l1", "auto", "Boas-vindas", 0),
    lesson("l4", "t", "Fechamento", 0),
    lesson("l5", "u", "Projeto final", 0),
    lesson("l6", "s", "Rascunho antigo", 2, "archived"),
    lesson("l7", "x", "Aula de outro curso", 0),
  ],
};

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const name = String(input).split("/").at(-1)!, body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
    const items = name === "app_admin_list" ? rows[body.p_entity] ?? [] : [];
    return Response.json({ items, total: items.length, page: 1, page_size: 20 });
  }));
});

afterEach(() => {
  cleanup();
  cache.clear();
  vi.unstubAllGlobals();
});

async function pick(course: string) {
  render(
    <QueryClientProvider client={cache}>
      <MemoryRouter initialEntries={["/admin/cursos"]}>
        <Routes><Route path="/admin/cursos" element={<AdminCourses />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  const row = (await screen.findByRole("link", { name: course })).closest<HTMLElement>(".admin-row")!;
  expect([...row.querySelectorAll("div.actions > *")].map((node) => node.textContent))
    .toEqual(["Editar curso", "Editar apresentação", "Estrutura e aulas"]);
  fireEvent.click(within(row).getByRole("button", { name: "Editar apresentação" }));
  return within(await screen.findByRole("dialog", { name: "Escolha a aula" }));
}

it("lista as aulas do curso por módulo, na ordem da estrutura", async () => {
  const dialog = await pick("Curso editorial");
  const modules = await dialog.findAllByRole("heading", { level: 3 });
  expect(modules.map((heading) => heading.textContent)).toEqual(["Fundamentos", "Avançado"]);
  const lists = dialog.getAllByRole("list");
  expect(within(lists[0]).getAllByRole("link").map((link) => link.textContent))
    .toEqual(["Boas-vindas", "Aquecimento", "Exercício", "Fechamento"]);
  expect(within(lists[1]).getAllByRole("link").map((link) => link.textContent)).toEqual(["Projeto final"]);
  expect(dialog.queryByText("Aula de outro curso")).toBeNull();
});

it("aula arquivada fica de fora", async () => {
  const dialog = await pick("Curso editorial");
  await dialog.findByRole("link", { name: "Exercício" });
  expect(dialog.queryByRole("link", { name: "Rascunho antigo" })).toBeNull();
});

it("cada aula leva ao editor de apresentação", async () => {
  const dialog = await pick("Curso editorial");
  expect(await dialog.findByRole("link", { name: "Exercício" })).toHaveAttribute("href", "/admin/cursos/c/aulas/l3/apresentacao");
  expect(dialog.getByRole("link", { name: "Projeto final" })).toHaveAttribute("href", "/admin/cursos/c/aulas/l5/apresentacao");
});

it("curso sem aulas mostra o vazio com o link para Estrutura e aulas", async () => {
  const dialog = await pick("Curso vazio");
  expect(await dialog.findByText("Este curso ainda não tem aulas.")).toBeInTheDocument();
  expect(dialog.getByRole("link", { name: "Estrutura e aulas" })).toHaveAttribute("href", "/admin/cursos/v?aba=estrutura");
  expect(dialog.queryByRole("list")).toBeNull();
});
