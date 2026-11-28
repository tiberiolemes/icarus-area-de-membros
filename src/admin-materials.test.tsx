import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.hoisted(() => {
  vi.stubEnv("VITE_SUPABASE_URL", "http://127.0.0.1:58521");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-public-key");
});

import { cache } from "./api";
import { draftStorageKey, writeDraft } from "./draft";
import { AdminMaterials } from "./pages/admin";
import { DraftOwner } from "./ui";

const lesson = (id: string, section_id: string, title: string, order_index = 0, status = "published") =>
  ({ id, section_id, title, slug: id, type: "text", status, order_index });
const material = (id: string, name: string, lesson_ids: string[]) =>
  ({ id, name, description: "", folder_id: null, file_type: "application/pdf", size_bytes: 2048, status: "published", access_mode: "members", plan_ids: [], lesson_ids });
let rows: Record<string, Record<string, unknown>[]>;
let calls: { name: string; body: Record<string, unknown> }[];
let failing = "";
let lessonLoad: Promise<void> | undefined;

beforeEach(() => {
  calls = [];
  failing = "";
  lessonLoad = undefined;
  rows = {
    courses: [
      { id: "ca", title: "Curso A", status: "published", order_index: 1 },
      { id: "cb", title: "Curso B", status: "published", order_index: 0 },
    ],
    modules: [
      { id: "m2", course_id: "ca", title: "Módulo 2", status: "published", order_index: 1 },
      { id: "m1", course_id: "ca", title: "Módulo 1", status: "published", order_index: 0 },
      { id: "m3", course_id: "cb", title: "Introdução", status: "published", order_index: 0 },
    ],
    sections: [
      { id: "s1", module_id: "m1", title: "Prática", status: "published", order_index: 0, is_default: false },
      { id: "auto", module_id: "m1", title: "Aulas do módulo", status: "published", order_index: -1, is_default: true },
      { id: "s2", module_id: "m2", title: "Fechamento", status: "published", order_index: 0, is_default: false },
      { id: "s3", module_id: "m3", title: "Começo", status: "published", order_index: 0, is_default: false },
    ],
    lessons: [
      lesson("l2", "s1", "Exercício"),
      lesson("l1", "auto", "Boas-vindas"),
      lesson("l3", "s2", "Revisão final"),
      lesson("l6", "s2", "Aula removida", 1, "archived"),
      lesson("l4", "s3", "Apresentação"),
      lesson("l5", "s3", "Aula antiga", 1, "archived"),
    ],
    materials: [material("apostila", "Apostila", ["l1", "l3"]), material("mapa", "Mapa", ["l5"]), material("solto", "Solto", [])],
  };
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const name = String(input).split("/").at(-1)!, body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
    calls.push({ name, body });
    if (name === "app_admin_save") return Response.json({ id: body.p_id ?? "novo" });
    if (failing === body.p_entity) return Response.json({ message: "falha" }, { status: 500 });
    if (body.p_entity === "lessons") await lessonLoad;
    const items = name === "app_admin_list" ? rows[body.p_entity] ?? [] : [];
    return Response.json({ items, total: items.length, page: 1, page_size: 20 });
  }));
});

afterEach(() => {
  cleanup();
  cache.clear();
  localStorage.clear();
  vi.unstubAllGlobals();
});

function show(path = "/admin/materiais", owner: string | null = null) {
  render(
    <QueryClientProvider client={cache}>
      <MemoryRouter initialEntries={[path]}>
        <DraftOwner.Provider value={owner}><AdminMaterials /></DraftOwner.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function edit(name: string) {
  const row = (await screen.findByRole("heading", { level: 3, name })).closest(".admin-row") as HTMLElement;
  fireEvent.click(within(row).getByRole("button", { name: "Editar material" }));
  const links = await screen.findByRole("group", { name: "Aulas vinculadas" });
  await within(links).findByRole("group", { name: "Curso A" });
  return links;
}

const saved = async () => {
  fireEvent.click(screen.getByRole("button", { name: "Salvar material" }));
  await waitFor(() => expect(calls.some(({ name }) => name === "app_admin_save")).toBe(true));
  return calls.find(({ name }) => name === "app_admin_save")!.body.p_data as Record<string, unknown>;
};

it("editor agrupa as aulas por curso e módulo e marca as vinculadas", async () => {
  show();
  const links = await edit("Apostila");
  expect(within(links).getAllByRole("group").map((group) => group.querySelector("legend")?.textContent))
    .toEqual(["Curso B", "Introdução", "Curso A", "Módulo 1", "Módulo 2"]);
  const first = within(within(links).getByRole("group", { name: "Módulo 1" }));
  expect(first.getAllByRole("checkbox").map((box) => box.closest("label")?.textContent)).toEqual(["Boas-vindas", "Exercício"]);
  expect(first.getByRole("checkbox", { name: "Boas-vindas" })).toBeChecked();
  expect(first.getByRole("checkbox", { name: "Exercício" })).not.toBeChecked();
  expect(within(within(links).getByRole("group", { name: "Módulo 2" })).getByRole("checkbox", { name: "Revisão final" })).toBeChecked();
  expect(within(links).getByText("2 aulas selecionadas")).toBeInTheDocument();
  expect(within(links).queryByText("Prática")).toBeNull();
});

it("recupera as aulas do material depois do carregamento e atualiza o contador", async () => {
  let finishLoad!: () => void;
  lessonLoad = new Promise<void>((resolve) => { finishLoad = resolve; });
  writeDraft(draftStorageKey("editor", "/admin/materiais|Salvar material|apostila"), [["lesson_ids", "l2"]]);
  show("/admin/materiais", "editor");
  const row = (await screen.findByRole("heading", { level: 3, name: "Apostila" })).closest(".admin-row") as HTMLElement;
  fireEvent.click(within(row).getByRole("button", { name: "Editar material" }));
  const recover = await screen.findByRole("button", { name: "Recuperar rascunho" });
  expect(recover).toBeDisabled();
  finishLoad();
  await waitFor(() => expect(recover).toBeEnabled());
  fireEvent.click(recover);
  const links = screen.getByRole("group", { name: "Aulas vinculadas" });
  expect(within(links).getByText("1 aula selecionada")).toBeInTheDocument();
  expect(within(links).getByRole("checkbox", { name: "Exercício" })).toBeChecked();
  expect(within(links).getByRole("checkbox", { name: "Boas-vindas" })).not.toBeChecked();
  expect(within(links).getByRole("searchbox", { name: "Filtrar aulas" })).toHaveValue("");
});

it("filtrar esconde as aulas que não batem e o envio mantém as marcadas escondidas", async () => {
  show();
  const links = await edit("Apostila");
  const filter = within(links).getByRole("searchbox", { name: "Filtrar aulas" });
  expect(filter).not.toHaveAttribute("name");
  expect(filter).toHaveAttribute("data-no-draft");
  fireEvent.change(filter, { target: { value: "revisao" } });
  expect(within(links).queryByRole("checkbox", { name: "Boas-vindas" })).toBeNull();
  expect(within(links).queryByRole("group", { name: "Curso B" })).toBeNull();
  expect(within(links).getByRole("checkbox", { name: "Revisão final" })).toBeVisible();
  expect(within(links).getByText("2 aulas selecionadas")).toBeInTheDocument();
  expect((await saved()).lesson_ids).toEqual(["l1", "l3"]);
});

it("salvar envia lesson_ids e não envia lesson_id", async () => {
  show();
  const links = await edit("Apostila");
  fireEvent.click(within(links).getByRole("checkbox", { name: "Boas-vindas" }));
  expect(within(links).getByText("1 aula selecionada")).toBeInTheDocument();
  fireEvent.click(within(links).getByRole("checkbox", { name: "Exercício" }));
  expect(within(links).getByText("2 aulas selecionadas")).toBeInTheDocument();
  const data = await saved();
  expect(data.lesson_ids).toEqual(["l2", "l3"]);
  expect(data).not.toHaveProperty("lesson_id");
});

it("aula arquivada aparece só quando já vinculada, com o selo Arquivado", async () => {
  show();
  let links = await edit("Mapa");
  const old = within(links).getByRole("checkbox", { name: /Aula antiga/ });
  expect(old).toBeChecked();
  expect(old.closest("label")).toHaveTextContent("Arquivado");
  expect(within(links).queryByRole("checkbox", { name: /Aula removida/ })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Fechar editor" }));
  links = await edit("Apostila");
  expect(within(links).queryByRole("checkbox", { name: /Aula antiga/ })).toBeNull();
});

it("listagem mostra Em 2 aulas", async () => {
  show();
  const row = (name: string) => screen.getByRole("heading", { level: 3, name }).closest(".admin-row") as HTMLElement;
  await screen.findByRole("heading", { level: 3, name: "Apostila" });
  expect(row("Apostila")).toHaveTextContent("Em 2 aulas");
  expect(row("Mapa")).toHaveTextContent("Em 1 aula");
  expect(row("Solto")).not.toHaveTextContent(/Em \d+ aula/);
});

it("?editar=<id> abre o editor do material", async () => {
  show("/admin/materiais?editar=mapa");
  expect(await screen.findByRole("heading", { level: 2, name: "Editar material" })).toBeInTheDocument();
  expect(screen.getByLabelText("Nome")).toHaveValue("Mapa");
  fireEvent.click(screen.getByRole("button", { name: "Fechar editor" }));
  await waitFor(() => expect(screen.queryByRole("heading", { level: 2, name: "Editar material" })).toBeNull());
  // A lista recarrega depois de fechar; o endereço já não reabre o editor.
  await cache.invalidateQueries();
  expect(screen.queryByRole("heading", { level: 2, name: "Editar material" })).toBeNull();
});

it("material novo continua com as aulas marcadas depois do primeiro salvamento", async () => {
  show();
  fireEvent.click(await screen.findByRole("button", { name: "Novo material" }));
  const links = await screen.findByRole("group", { name: "Aulas vinculadas" });
  expect(within(links).getByText("0 aulas selecionadas")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Resumo" } });
  fireEvent.click(await within(links).findByRole("checkbox", { name: "Exercício" }));
  expect((await saved()).lesson_ids).toEqual(["l2"]);
  // O editor remonta com o id novo; sem o vínculo salvo, um segundo salvamento apagaria as aulas.
  await screen.findByRole("heading", { level: 2, name: "Editar material" });
  expect(await screen.findByRole("checkbox", { name: "Exercício" })).toBeChecked();
  expect(screen.getByLabelText("Nome")).toHaveValue("Resumo");
});

it("sem a lista de aulas, salvar mantém os vínculos que não aparecem na tela", async () => {
  failing = "lessons";
  show();
  const row = (await screen.findByRole("heading", { level: 3, name: "Apostila" })).closest(".admin-row") as HTMLElement;
  fireEvent.click(within(row).getByRole("button", { name: "Editar material" }));
  const links = await screen.findByRole("group", { name: "Aulas vinculadas" });
  // Tentar de novo fica dentro do formulário e não pode salvar o material.
  fireEvent.click(await within(links).findByRole("button", { name: "Tentar novamente" }));
  expect(screen.getByRole("button", { name: "Salvar material" })).toBeEnabled();
  expect(calls.some(({ name }) => name === "app_admin_save")).toBe(false);
  expect(within(links).queryByRole("checkbox")).toBeNull();
  expect((await saved()).lesson_ids).toEqual(["l1", "l3"]);
});
