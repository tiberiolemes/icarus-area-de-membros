import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.hoisted(() => {
  vi.stubEnv("VITE_SUPABASE_URL", "http://127.0.0.1:58521");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-public-key");
});

const { sendFile, uploads } = vi.hoisted(() => ({ sendFile: vi.fn(), uploads: [] as { kind: string; resourceId: string }[] }));
vi.mock("./upload", async (importOriginal) => ({
  ...await importOriginal<typeof import("./upload")>(),
  sendFile,
  // O componente de envio tem testes próprios; aqui só importa o que o bloco faz quando ele conclui.
  Upload: ({ kind, resourceId, onUploaded }: { kind: string; resourceId: string; onUploaded?: (file: File) => void }) => {
    uploads.push({ kind, resourceId });
    return <button type="button" onClick={() => onUploaded?.(new File(["webp"], "mapa.webp", { type: "image/webp" }))}>Concluir envio</button>;
  },
}));

import { cache } from "./api";
import { CourseEditor } from "./pages/admin";

const material = (id: string, name: string, lesson_ids: string[], extra: Record<string, unknown> = {}) =>
  ({ id, name, description: "", folder_id: null, file_type: "application/pdf", size_bytes: 2048, status: "published",
    access_mode: "members", plan_ids: [], lesson_ids, storage_path: `materials/${id}.pdf`, ...extra });
let rows: Record<string, Record<string, unknown>[]>;
let calls: { name: string; body: Record<string, unknown> }[];

beforeEach(() => {
  calls = [];
  uploads.length = 0;
  sendFile.mockReset();
  rows = {
    courses: [{ id: "c", title: "Curso editorial", slug: "editorial", status: "published", access_mode: "members" }],
    modules: [{ id: "m", course_id: "c", title: "Fundamentos", slug: "fundamentos", status: "published", order_index: 0 }],
    sections: [{ id: "s", module_id: "m", title: "Prática", status: "published", order_index: 0 }],
    lessons: [
      { id: "a", section_id: "s", title: "Exercício", slug: "exercicio", type: "text", status: "published", order_index: 0 },
      { id: "b", section_id: "s", title: "Revisão", slug: "revisao", type: "text", status: "published", order_index: 1 },
    ],
    materials: [material("apostila", "Apostila", ["a", "b"]), material("mapa", "Mapa", ["b"])],
  };
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const name = String(input).split("/").at(-1)!, body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
    calls.push({ name, body });
    if (name === "app_admin_save") {
      const list = rows[body.p_entity];
      const row = list.find(({ id }) => id === body.p_id);
      if (row) Object.assign(row, body.p_data);
      else list.push({ id: "novo", ...body.p_data });
      return Response.json({ id: body.p_id ?? "novo" });
    }
    if (name === "app_admin_unlink_material") {
      const row = rows.materials.find(({ id }) => id === body.p_material_id)!;
      row.lesson_ids = (row.lesson_ids as string[]).filter((id) => id !== body.p_lesson_id);
      if (!(row.lesson_ids as string[]).length) row.status = "draft";
      return Response.json({ id: row.id, status: row.status });
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

async function editor(button: string) {
  render(
    <QueryClientProvider client={cache}>
      <MemoryRouter initialEntries={["/admin/cursos/c?aba=estrutura"]}>
        <Routes><Route path="/admin/cursos/:id" element={<CourseEditor />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  fireEvent.click(await screen.findByRole("button", { name: button }));
  return screen.findByRole("region", { name: "Materiais da aula" });
}

const saves = () => calls.filter(({ name }) => name === "app_admin_save").map(({ body }) => body);
const item = (block: HTMLElement, name: string) => within(block).getByText(name, { selector: "strong" }).closest("li") as HTMLElement;

it("aula salva lista os materiais vinculados", async () => {
  const block = await editor("Editar aula Exercício");
  await within(block).findByText("Apostila");
  expect(within(block).getAllByRole("listitem")).toHaveLength(1);
  expect(item(block, "Apostila")).toHaveTextContent("Publicado · PDF · 2 KB");
  expect(within(item(block, "Apostila")).getByRole("link", { name: "Editar em Materiais" }))
    .toHaveAttribute("href", "/admin/materiais?editar=apostila");
  expect(within(block).queryByText("Mapa")).toBeNull();
  expect(within(block).queryByRole("button", { name: "Reenviar arquivo" })).toBeNull();
  expect(within(block).getByRole("group", { name: "Adicionar material" })).toBeInTheDocument();
});

it("soltar arquivo cria material rascunho vinculado à aula, envia e publica", async () => {
  sendFile.mockImplementation(async (_kind: string, id: string) => {
    Object.assign(rows.materials.find((row) => row.id === id)!, { storage_path: `materials/${id}.pdf`, size_bytes: 1024 });
    return new File(["%PDF-1.7"], "roteiro.pdf", { type: "application/pdf" });
  });
  const block = await editor("Editar aula Exercício");
  const zone = within(block).getByRole("group", { name: "Adicionar material" });
  // Vídeo é recusado antes de criar o material.
  fireEvent.drop(zone, { dataTransfer: { files: [new File(["v"], "aula.mp4", { type: "video/mp4" })] } });
  expect(within(block).getByRole("alert")).toHaveTextContent("A plataforma não recebe vídeo. Use o Bunny Stream ou o YouTube.");
  const file = new File(["%PDF-1.7"], "roteiro.pdf", { type: "application/pdf" });
  fireEvent.drop(zone, { dataTransfer: { files: [file] } });
  expect(await within(block).findByText("Material enviado e publicado na aula.")).toBeInTheDocument();
  expect(saves()).toEqual([
    { p_entity: "materials", p_id: null, p_data: {
      name: "Roteiro", folder_id: null, lesson_ids: ["a"], status: "draft", access_mode: "members", plan_ids: [], file_type: "application/pdf",
    } },
    { p_entity: "materials", p_id: "novo", p_data: { status: "published", file_type: "application/pdf" } },
  ]);
  expect(sendFile).toHaveBeenCalledExactlyOnceWith("material", "novo", file, expect.any(AbortSignal), expect.any(Function));
  await waitFor(() => expect(item(block, "Roteiro")).toHaveTextContent("Publicado · PDF · 1 KB"));
});

it("falha no envio deixa o material como rascunho Sem arquivo com Reenviar arquivo", async () => {
  sendFile.mockRejectedValue(new Error("Tipo ou tamanho de arquivo não permitido."));
  const block = await editor("Editar aula Exercício");
  fireEvent.drop(within(block).getByRole("group", { name: "Adicionar material" }), {
    dataTransfer: { files: [new File(["PK"], "mapa-mental.zip", { type: "application/zip" })] },
  });
  expect(await within(block).findByRole("alert")).toHaveTextContent("Tipo ou tamanho de arquivo não permitido.");
  expect(within(block).getByRole("alert")).toHaveTextContent("rascunho");
  expect(saves()).toHaveLength(1);
  await waitFor(() => expect(item(block, "Mapa-mental")).toHaveTextContent("Rascunho · Sem arquivo"));
  // A confirmação de outra ação substitui o aviso da falha.
  fireEvent.click(within(item(block, "Apostila")).getByRole("button", { name: "Desvincular" }));
  expect(await within(block).findByText("Material desvinculado da aula.")).toBeInTheDocument();
  expect(within(block).queryByRole("alert")).toBeNull();
  const resend = within(item(block, "Mapa-mental")).getByRole("button", { name: "Reenviar arquivo" });
  expect(resend).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(resend);
  expect(resend).toHaveAttribute("aria-expanded", "true");
  expect(uploads.at(-1)).toEqual({ kind: "material", resourceId: "novo" });
  fireEvent.click(within(block).getByRole("button", { name: "Concluir envio" }));
  await waitFor(() => expect(saves()).toHaveLength(2));
  expect(saves()[1]).toEqual({ p_entity: "materials", p_id: "novo", p_data: { status: "published", file_type: "image/webp" } });
  expect(await within(block).findByText("Arquivo enviado e material publicado na aula.")).toBeInTheDocument();
});

it("Desvincular chama app_admin_unlink_material", async () => {
  const block = await editor("Editar aula Revisão");
  await within(block).findByText("Mapa");
  fireEvent.click(within(item(block, "Mapa")).getByRole("button", { name: "Desvincular" }));
  await waitFor(() => expect(within(block).queryByText("Mapa")).toBeNull());
  expect(calls.find(({ name }) => name === "app_admin_unlink_material")?.body).toEqual({ p_material_id: "mapa", p_lesson_id: "b" });
  const status = within(block).getByText("Material desvinculado da aula. Sem nenhuma aula, ele voltou para rascunho.");
  await waitFor(() => expect(status).toHaveFocus());
  expect(within(block).getByText("Apostila")).toBeInTheDocument();
});

it("aula nova pede para salvar antes", async () => {
  const block = await editor("Adicionar aula em Prática");
  expect(block).toHaveTextContent("Salve a aula para adicionar materiais.");
  expect(within(block).queryByRole("group", { name: "Adicionar material" })).toBeNull();
});
