import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";

vi.hoisted(() => {
  vi.stubEnv("VITE_SUPABASE_URL", "http://127.0.0.1:58521");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-public-key");
});

import { cache } from "./api";
import { CourseEditor } from "./pages/admin";

const records: Record<string, Record<string, unknown>[]> = {
  courses: [{ id: "c", title: "Curso", slug: "curso", status: "published", access_mode: "all" }],
  modules: [{ id: "m", course_id: "c", title: "Módulo", slug: "modulo", status: "published", order_index: 0 }],
  sections: [{ id: "s", module_id: "m", title: "Prática", status: "published", order_index: 0 }],
  lessons: [{ id: "a", section_id: "s", title: "Abertura", slug: "abertura", type: "video", status: "published", order_index: 0, duration_seconds: 60 }],
  materials: [],
};
const videos = [
  { id: "11111111-1111-4111-8111-111111111111", title: "Boas-vindas", length: 754, ready: true },
  { id: "22222222-2222-4222-8222-222222222222", title: "Em processamento", length: 0, ready: false },
];
let bunny: boolean;
let search: boolean;
let library: () => Response;
let calls: { url: string; body: Record<string, unknown> }[];
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  bunny = true;
  search = true;
  library = () => json({ items: videos, total: videos.length, page: 1 });
  calls = [];
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
    calls.push({ url, body });
    if (url.endsWith("/app_admin_list")) {
      const items = records[body.p_entity] ?? [];
      return json({ items, total: items.length, page: 1, page_size: 20 });
    }
    if (url.endsWith("/functions/v1/capabilities"))
      return body.action === "bunny-videos" ? library() : json({ asaas: false, bunny, bunny_search: search, storage: true });
    return json({});
  }));
});
afterEach(() => {
  cleanup();
  cache.clear();
  vi.unstubAllGlobals();
});

async function openLesson() {
  render(
    <QueryClientProvider client={cache}>
      <MemoryRouter initialEntries={["/admin/cursos/c?aba=estrutura"]}>
        <Routes><Route path="/admin/cursos/:id" element={<CourseEditor />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Editar aula Abertura" }));
  return within(screen.getByRole("group", { name: "Mídia da aula" }));
}
const bunnyCalls = () => calls.filter(({ body }) => body.action === "bunny-videos").map(({ body }) => body);

it("buscar no Bunny lista título, duração e Processando", async () => {
  const media = await openLesson();
  fireEvent.click(await media.findByRole("button", { name: "Buscar no Bunny" }));
  const dialog = within(await screen.findByRole("dialog", { name: "Buscar vídeo no Bunny" }));
  const ready = (await dialog.findByText("Boas-vindas", { selector: "strong" })).closest("li")!;
  expect(ready).toHaveTextContent("12:34");
  expect(ready).not.toHaveTextContent("Processando");
  expect(dialog.getByText("Em processamento", { selector: "strong" }).closest("li")).toHaveTextContent("Processando");
  expect(bunnyCalls()).toEqual([{ action: "bunny-videos", query: "", page: 1 }]);
  // A busca fica dentro do formulário da aula no React: não pode salvar a aula nem marcar alteração.
  fireEvent.change(dialog.getByRole("searchbox"), { target: { value: "boas" } });
  fireEvent.submit(dialog.getByRole("search"));
  await waitFor(() => expect(bunnyCalls()).toContainEqual({ action: "bunny-videos", query: "boas", page: 1 }));
  expect(calls.some(({ url }) => url.endsWith("/app_admin_save"))).toBe(false);
  const leave = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(leave);
  expect(leave.defaultPrevented).toBe(false);
});

it("Usar este vídeo preenche o ID e a duração e fecha", async () => {
  const media = await openLesson();
  fireEvent.click(await media.findByRole("button", { name: "Buscar no Bunny" }));
  const dialog = within(await screen.findByRole("dialog", { name: "Buscar vídeo no Bunny" }));
  fireEvent.click(await dialog.findByRole("button", { name: "Usar este vídeo Boas-vindas" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(media.getByLabelText("Vídeo do Bunny ou link do YouTube")).toHaveValue(videos[0].id);
  expect(media.getByLabelText("Duração em segundos")).toHaveValue(754);
  const leave = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(leave);
  expect(leave.defaultPrevented).toBe(true);
  // Vídeo ainda em processamento chega sem duração: o campo fica como estava.
  fireEvent.click(media.getByRole("button", { name: "Buscar no Bunny" }));
  fireEvent.click(await screen.findByRole("button", { name: "Usar este vídeo Em processamento" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(media.getByLabelText("Vídeo do Bunny ou link do YouTube")).toHaveValue(videos[1].id);
  expect(media.getByLabelText("Duração em segundos")).toHaveValue(754);
});

it("biblioteca vazia mostra o vazio", async () => {
  library = () => json({ items: [], total: 0, page: 1 });
  const media = await openLesson();
  fireEvent.click(await media.findByRole("button", { name: "Buscar no Bunny" }));
  expect(await screen.findByText("Nenhum vídeo encontrado na biblioteca.")).toBeInTheDocument();
});

it("erro da API mostra a mensagem e Tentar novamente", async () => {
  library = () => json({ code: "BUNNY_UNAVAILABLE", message: "A API do Bunny Stream está indisponível. Tente novamente." }, 502);
  const media = await openLesson();
  fireEvent.click(await media.findByRole("button", { name: "Buscar no Bunny" }));
  const dialog = within(await screen.findByRole("dialog", { name: "Buscar vídeo no Bunny" }));
  expect(await dialog.findByRole("alert")).toHaveTextContent("A API do Bunny Stream está indisponível. Tente novamente.");
  library = () => json({ items: videos, total: videos.length, page: 1 });
  fireEvent.click(dialog.getByRole("button", { name: "Tentar novamente" }));
  expect(await dialog.findByText("Boas-vindas", { selector: "strong" })).toBeInTheDocument();
});

it("sem Bunny configurado o botão não aparece e a dica aponta para Integrações", async () => {
  bunny = false;
  search = false;
  const media = await openLesson();
  await waitFor(() =>
    expect(media.getByText(/Para buscar na biblioteca, configure o Bunny em Configurações > Integrações\./)).toBeInTheDocument(),
  );
  expect(media.queryByRole("button", { name: "Buscar no Bunny" })).toBeNull();
});

it("com a reprodução pronta e sem a chave da API, a busca não aparece e a dica aponta para Integrações", async () => {
  search = false;
  const media = await openLesson();
  await waitFor(() =>
    expect(media.getByText(/Para buscar na biblioteca, configure o Bunny em Configurações > Integrações\./)).toBeInTheDocument(),
  );
  expect(media.queryByRole("button", { name: "Buscar no Bunny" })).toBeNull();
});
