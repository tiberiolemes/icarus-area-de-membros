import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.hoisted(() => {
  vi.stubEnv("VITE_SUPABASE_URL", "http://127.0.0.1:58521");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-public-key");
});

import { cache } from "./api";
import { AdminMaterials, CourseEditor } from "./pages/admin";
import { Archive, DangerZone, type DeletableEntity } from "./pages/admin-delete";

const none = { sections: 0, lessons: 0, materials: 0, folders: 0, students: 0, comments: 0, linked_materials: 0, orphaned_materials: 0 };
const warning = "O item foi excluído, mas alguns arquivos não foram apagados do armazenamento.";
let rows: Record<string, Record<string, unknown>[]>;
let calls: { name: string; body: Record<string, unknown> }[];
let preview: typeof none;
let deleted: (body: Record<string, unknown>) => Response | Promise<Response>;

beforeEach(() => {
  calls = [];
  preview = { ...none, lessons: 1 };
  deleted = () => Response.json({ deleted: true, files_removed: 1 });
  rows = {
    courses: [{ id: "c", title: "Curso editorial", slug: "editorial", status: "draft", access_mode: "members" }],
    modules: [{ id: "m", course_id: "c", title: "Fundamentos", slug: "fundamentos", status: "published", order_index: 0 }],
    sections: [{ id: "s", module_id: "m", title: "Prática", status: "published", order_index: 0, is_default: false }],
    lessons: [{ id: "a", section_id: "s", title: "Boas-vindas", slug: "boas-vindas", type: "text", status: "published", order_index: 0 }],
    materials: [{ id: "apostila", name: "Apostila", description: "", folder_id: null, file_type: "application/pdf", size_bytes: 2048,
      status: "published", access_mode: "members", plan_ids: [], lesson_ids: [] }],
  };
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const name = String(input).split("/").at(-1)!, body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
    calls.push({ name, body });
    if (name === "app_admin_delete_preview") return Response.json(preview);
    if (name === "app_admin_archive") return Response.json({ id: body.p_id, archived: body.p_archived });
    if (name === "upload") {
      const response = await deleted(body);
      if (response.ok) rows[body.entity] = rows[body.entity].filter((row) => row.id !== body.id);
      return response;
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

function zone(entity: DeletableEntity = "lessons") {
  const onDeleted = vi.fn();
  render(<QueryClientProvider client={cache}><DangerZone entity={entity} row={{ id: "alvo" }} onDeleted={onDeleted} /></QueryClientProvider>);
  return onDeleted;
}
async function openDelete(name: string) {
  const box = await screen.findByRole("region", { name: "Zona de perigo" });
  fireEvent.click(within(box).getByRole("button", { name: "Excluir para sempre" }));
  return screen.findByRole("dialog", { name });
}
async function confirmDelete(dialog: HTMLElement) {
  const confirm = within(dialog).getByRole("button", { name: "Excluir para sempre" });
  await waitFor(() => expect(confirm).toBeEnabled());
  fireEvent.click(confirm);
}
const uploads = () => calls.filter(({ name }) => name === "upload");

it("zona de perigo mostra o resumo do que será apagado", async () => {
  preview = { ...none, lessons: 1, students: 12, comments: 4, orphaned_materials: 3 };
  zone();
  const box = screen.getByRole("region", { name: "Zona de perigo" });
  expect(box).toHaveTextContent("Excluir apaga este item e o que depende dele. Não dá para desfazer.");
  const dialog = await openDelete("Excluir esta aula para sempre?");
  expect(await within(dialog).findByText("Serão apagados: 1 aula, o progresso de 12 alunos e 4 comentários.")).toBeInTheDocument();
  expect(within(dialog).getByText("3 materiais ficam sem aula e voltam para rascunho.")).toBeInTheDocument();
  expect(within(dialog).getByText("Não dá para desfazer. Certificados já emitidos continuam válidos.")).toBeInTheDocument();
  expect(calls).toContainEqual({ name: "app_admin_delete_preview", body: { p_entity: "lessons", p_id: "alvo" } });
  expect(uploads()).toEqual([]);
});

it("confirmar exclui sem pedir senha e avisa quem abriu", async () => {
  render(
    <QueryClientProvider client={cache}>
      <MemoryRouter initialEntries={["/admin/cursos/c?aba=estrutura"]}>
        <Routes><Route path="/admin/cursos/:id" element={<CourseEditor />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Editar aula Boas-vindas" }));
  const dialog = await openDelete("Excluir esta aula para sempre?");
  expect(within(dialog).queryByLabelText(/senha/i)).toBeNull();
  await confirmDelete(dialog);
  const notice = await screen.findByText("Excluído.");
  expect(uploads().map(({ body }) => body)).toEqual([{ action: "delete", entity: "lessons", id: "a" }]);
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.queryByRole("heading", { name: "Editar aula" })).toBeNull();
  expect(screen.queryByText("Boas-vindas")).toBeNull();
  await waitFor(() => expect(notice.closest("[tabindex='-1']")).toHaveFocus());
  expect(calls.some(({ name }) => name === "reauthenticate")).toBe(false);
});

it("clique duplo envia uma exclusão só", async () => {
  let finish = () => {};
  deleted = () => new Promise((done) => { finish = () => done(Response.json({ deleted: true, files_removed: 0 })); });
  const onDeleted = zone();
  const dialog = await openDelete("Excluir esta aula para sempre?");
  const confirm = within(dialog).getByRole("button", { name: "Excluir para sempre" });
  await waitFor(() => expect(confirm).toBeEnabled());
  fireEvent.click(confirm);
  fireEvent.click(confirm);
  await waitFor(() => expect(uploads()).toHaveLength(1));
  expect(within(dialog).getByRole("button", { name: "Cancelar" })).toBeDisabled();
  finish();
  await waitFor(() => expect(onDeleted).toHaveBeenCalledWith("Excluído."));
  expect(uploads()).toHaveLength(1);
});

it("erro Registro indisponível aparece no modal", async () => {
  deleted = () => Response.json({ code: "P0001", message: "Registro indisponível." }, { status: 400 });
  const onDeleted = zone("sections");
  const dialog = await openDelete("Excluir esta seção para sempre?");
  await confirmDelete(dialog);
  expect(await within(dialog).findByRole("alert")).toHaveTextContent("Registro indisponível.");
  expect(onDeleted).not.toHaveBeenCalled();
  expect(screen.getByRole("dialog")).toBe(dialog);
});

it("aviso de arquivos não apagados aparece depois da exclusão", async () => {
  preview = { ...none, materials: 1 };
  deleted = () => Response.json({ deleted: true, files_removed: 0, warning });
  render(<QueryClientProvider client={cache}><MemoryRouter initialEntries={["/admin/materiais"]}><AdminMaterials /></MemoryRouter></QueryClientProvider>);
  const row = (await screen.findByRole("heading", { level: 3, name: "Apostila" })).closest(".admin-row") as HTMLElement;
  fireEvent.click(within(row).getByRole("button", { name: "Editar material" }));
  const dialog = await openDelete("Excluir este material para sempre?");
  expect(await within(dialog).findByText("Serão apagados: 1 material.")).toBeInTheDocument();
  await confirmDelete(dialog);
  expect(await screen.findByText(`Excluído. ${warning}`)).toBeInTheDocument();
  expect(uploads().map(({ body }) => body)).toEqual([{ action: "delete", entity: "materials", id: "apostila" }]);
  expect(screen.queryByRole("heading", { name: "Editar material" })).toBeNull();
  await waitFor(() => expect(screen.queryByRole("heading", { level: 3, name: "Apostila" })).toBeNull());
});

it("pasta avisa quantos materiais estão em aulas", async () => {
  preview = { ...none, folders: 1, materials: 3, linked_materials: 2 };
  zone("material_folders");
  const dialog = await openDelete("Excluir esta pasta para sempre?");
  expect(await within(dialog).findByText("Serão apagados: 1 subpasta e 3 materiais.")).toBeInTheDocument();
  expect(within(dialog).getByText("2 materiais desta pasta estão em aulas e deixam de aparecer nelas.")).toBeInTheDocument();
  expect(within(dialog).queryByText(/rascunho/)).toBeNull();
});

it("arquivar confirma no modal e chama app_admin_archive sem token", async () => {
  render(<QueryClientProvider client={cache}><Archive entity="lessons" row={{ id: "alvo", status: "published" }} /></QueryClientProvider>);
  fireEvent.click(screen.getByText("Arquivar registro", { selector: "summary" }));
  fireEvent.click(screen.getByRole("button", { name: "Arquivar" }));
  const dialog = await screen.findByRole("dialog", { name: "Arquivar este registro?" });
  expect(within(dialog).queryByLabelText(/senha/i)).toBeNull();
  expect(calls.some(({ name }) => name === "app_admin_archive")).toBe(false);
  fireEvent.click(within(dialog).getByRole("button", { name: "Confirmar arquivamento" }));
  expect(await screen.findByText("Registro arquivado.")).toBeInTheDocument();
  expect(calls.filter(({ name }) => name === "app_admin_archive").map(({ body }) => body))
    .toEqual([{ p_entity: "lessons", p_id: "alvo", p_archived: true }]);
  expect(calls.some(({ name }) => name === "reauthenticate")).toBe(false);
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByText("Restaurar registro", { selector: "summary" })).toBeInTheDocument();
});
