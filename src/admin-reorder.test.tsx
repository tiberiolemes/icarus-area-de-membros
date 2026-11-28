import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.hoisted(() => {
  vi.stubEnv("VITE_SUPABASE_URL", "http://127.0.0.1:58521");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-public-key");
});

import { cache } from "./api";
import { CourseEditor } from "./pages/admin";

const lesson = (id: string, section_id: string, title: string, order_index: number) =>
  ({ id, section_id, title, slug: id, type: "text", status: "published", order_index });
let rows: Record<string, Record<string, unknown>[]>;
let calls: { name: string; body: Record<string, unknown> }[];
let failSave: boolean;

beforeEach(() => {
  calls = [];
  failSave = false;
  rows = {
    courses: [{ id: "c", title: "Curso editorial", slug: "editorial", status: "draft", access_mode: "members" }],
    modules: [
      { id: "m", course_id: "c", title: "Fundamentos", slug: "fundamentos", status: "published", order_index: 0 },
      { id: "n", course_id: "c", title: "Aprofundamento", slug: "aprofundamento", status: "published", order_index: 1 },
    ],
    sections: [
      { id: "s", module_id: "m", title: "Prática", status: "published", order_index: 0, is_default: false },
      { id: "t", module_id: "m", title: "Revisão final", status: "published", order_index: 1, is_default: false },
    ],
    lessons: [
      lesson("a", "s", "Abertura", 0),
      lesson("b", "s", "Prática guiada", 1),
      lesson("c", "s", "Exercício", 2),
      lesson("d", "s", "Revisão", 3),
      lesson("e", "t", "Desafio", 0),
    ],
    materials: [],
  };
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const name = String(input).split("/").at(-1)!, body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
    calls.push({ name, body });
    if (name === "app_admin_save") {
      if (failSave) return Response.json({ message: "Conteúdo bloqueado para edição.", code: "P0001" }, { status: 400 });
      Object.assign(rows[body.p_entity].find(({ id }) => id === body.p_id)!, body.p_data);
      return Response.json({ id: body.p_id });
    }
    const items = name === "app_admin_list" ? rows[body.p_entity] ?? [] : [];
    return Response.json({ items, total: items.length, page: 1, page_size: 20 });
  }));
});

afterEach(() => {
  cleanup();
  cache.clear();
  vi.unstubAllGlobals();
});

async function reorder() {
  render(
    <QueryClientProvider client={cache}>
      <MemoryRouter initialEntries={["/admin/cursos/c?aba=estrutura"]}>
        <Routes><Route path="/admin/cursos/:id" element={<CourseEditor />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Reordenar" }));
}
const handle = (title: string) => screen.getByRole("img", { name: `Arrastar ${title}` });
const row = (title: string) => screen.getByText(title, { selector: "strong" }).closest("article")!;
// O jsdom não tem DataTransfer: um objeto com o que o arraste usa.
function transfer() {
  const data = new Map<string, string>();
  return {
    setData: (type: string, value: string) => void data.set(type, value),
    getData: (type: string) => data.get(type) ?? "",
    effectAllowed: "all",
    dropEffect: "none",
  };
}
const saves = () => calls.filter(({ name }) => name === "app_admin_save").map(({ body }) => body);

it("alça aparece só com Reordenar ligado e as setas continuam", async () => {
  render(
    <QueryClientProvider client={cache}>
      <MemoryRouter initialEntries={["/admin/cursos/c?aba=estrutura"]}>
        <Routes><Route path="/admin/cursos/:id" element={<CourseEditor />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await screen.findByText("Exercício", { selector: "strong" });
  expect(screen.queryByRole("img", { name: /^Arrastar / })).toBeNull();
  expect(screen.queryByText(/Arraste pela alça/)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Reordenar" }));
  expect(screen.getByText(/Arraste pela alça ou use Subir e Descer para mudar a ordem\./)).toBeInTheDocument();
  for (const title of ["Fundamentos", "Prática", "Exercício"]) {
    expect(handle(title)).toHaveAttribute("draggable", "true");
    expect(screen.getByRole("button", { name: `Subir ${title}` })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: `Descer ${title}` })).toBeInTheDocument();
  }
});

it("arrastar a terceira aula para o topo grava as novas posições", async () => {
  await reorder();
  const dataTransfer = transfer();
  fireEvent.dragStart(handle("Exercício"), { dataTransfer });
  expect(dataTransfer.effectAllowed).toBe("move");
  expect(fireEvent.dragOver(row("Abertura"), { dataTransfer })).toBe(false);
  expect(row("Abertura")).toHaveAttribute("data-drop", "before");
  fireEvent.drop(row("Abertura"), { dataTransfer });
  fireEvent.dragEnd(handle("Exercício"), { dataTransfer });
  await waitFor(() => expect(saves()).toHaveLength(3));
  expect(saves()).toEqual([
    { p_entity: "lessons", p_id: "c", p_data: { order_index: 0 } },
    { p_entity: "lessons", p_id: "a", p_data: { order_index: 1 } },
    { p_entity: "lessons", p_id: "b", p_data: { order_index: 2 } },
  ]);
  await waitFor(() => expect(screen.getAllByRole("article")[0]).toHaveTextContent("Exercício"));
  expect(row("Abertura")).not.toHaveAttribute("data-drop");
});

it("soltar no mesmo lugar não grava nada", async () => {
  await reorder();
  const dataTransfer = transfer();
  fireEvent.dragStart(handle("Prática guiada"), { dataTransfer });
  fireEvent.dragOver(row("Prática guiada"), { dataTransfer });
  expect(row("Prática guiada")).not.toHaveAttribute("data-drop");
  fireEvent.drop(row("Prática guiada"), { dataTransfer });
  fireEvent.dragEnd(handle("Prática guiada"), { dataTransfer });
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(saves()).toEqual([]);
});

it("soltar aula em outra seção não faz nada", async () => {
  await reorder();
  const dataTransfer = transfer();
  fireEvent.dragStart(handle("Abertura"), { dataTransfer });
  // Sem preventDefault no dragover, o navegador nem deixa soltar ali.
  expect(fireEvent.dragOver(row("Desafio"), { dataTransfer })).toBe(true);
  expect(row("Desafio")).not.toHaveAttribute("data-drop");
  fireEvent.drop(row("Desafio"), { dataTransfer });
  fireEvent.dragEnd(handle("Abertura"), { dataTransfer });
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(saves()).toEqual([]);
});

it("erro ao gravar mostra aviso e recarrega a estrutura", async () => {
  await reorder();
  failSave = true;
  const lists = () => calls.filter(({ name, body }) => name === "app_admin_list" && body.p_entity === "lessons").length;
  const before = lists();
  const dataTransfer = transfer();
  fireEvent.dragStart(handle("Exercício"), { dataTransfer });
  fireEvent.dragOver(row("Abertura"), { dataTransfer });
  fireEvent.drop(row("Abertura"), { dataTransfer });
  fireEvent.dragEnd(handle("Exercício"), { dataTransfer });
  expect(await screen.findByRole("alert")).toHaveTextContent("A nova ordem não foi salva. Conteúdo bloqueado para edição.");
  await waitFor(() => expect(lists()).toBeGreaterThan(before));
  expect(handle("Exercício")).toHaveAttribute("draggable", "true");
  expect(screen.getAllByRole("article")[0]).toHaveTextContent("Abertura");
});
