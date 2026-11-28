import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { cache, type Space } from "./api";
import { Composer } from "./pages/community";
import { draftStorageKey, readDraft } from "./draft";
import { DraftOwner } from "./ui";

vi.hoisted(() => {
  vi.stubEnv("VITE_SUPABASE_URL", "http://127.0.0.1:58621");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-public-key");
});
vi.mock("./auth", () => ({ useAuth: () => ({ session: { user: { id: "autor-qa" } } }) }));

const general = { id: "geral", name: "Geral" };
const sales = { id: "vendas", name: "Vendas", can_post: true };
const readOnly = { id: "leitura", name: "Leitura", can_post: false };
const post = {
  id: "publicacao", space_id: general.id, title: "Título publicado",
  body: "Texto da publicação existente.", can_edit: true,
};
const draftPrefix = "icarus:draft:autor-qa:post:";
const page = (spaces: Space[]) => ({ spaces, items: [], page: 1, total: 0, page_size: 20 });
const listed = (spaces: Space[]) => Response.json(page(spaces));

afterEach(() => {
  cleanup();
  cache.clear();
  localStorage.clear();
  sessionStorage.removeItem(draftPrefix + "new");
  sessionStorage.removeItem(draftPrefix + post.id);
  vi.unstubAllGlobals();
});

function mount(
  handler: (rpc: string, args: Record<string, unknown>) => Response | Promise<Response>,
  path = "/app/comunidade/novo?space=vendas",
) {
  const writes: Record<string, unknown>[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const name = String(input).split("/").at(-1)!;
    const args = JSON.parse(String(init?.body));
    if (name === "app_save_post") writes.push(args);
    return handler(name, args);
  }));
  render(
    <QueryClientProvider client={cache}>
      <MemoryRouter initialEntries={[path]}>
        <DraftOwner.Provider value="autor-qa">
          <Routes>
            <Route path="/app/comunidade/novo" element={<Composer />} />
            <Route path="/app/comunidade/:post/editar" element={<Composer />} />
          </Routes>
        </DraftOwner.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return writes;
}

function delayedFeed() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

const spaceField = () => screen.getByRole("combobox", { name: "Espaço" });
const titleField = () => screen.getByRole("textbox", { name: "Título" });
const bodyField = () => screen.getByRole("textbox", { name: "Sua publicação" });
const send = () => fireEvent.submit(screen.getByRole("button", { name: "Enviar para revisão" }).closest("form")!);

it("aplica o filtro quando as opções chegam, mantém a escolha posterior e preserva a entrada para reenviar em AJAX", async () => {
  const delayed = delayedFeed();
  let rejected = false;
  const writes = mount(async (name) => {
    if (name === "app_feed") {
      await delayed.promise;
      return listed([general, sales, readOnly]);
    }
    if (!rejected) {
      rejected = true;
      return Response.json({ code: "P0001", message: "Espaço indisponível." }, { status: 400 });
    }
    return Response.json({ id: "novo", status: "pending" });
  });
  expect(spaceField()).toHaveValue("");
  fireEvent.input(titleField(), { target: { value: "Título digitado" } });
  fireEvent.input(bodyField(), { target: { value: "Texto que já estava no formulário." } });
  delayed.resolve();
  await screen.findByRole("option", { name: "Vendas" });
  expect(spaceField()).toHaveValue(sales.id);
  expect(titleField()).toHaveValue("Título digitado");
  expect(bodyField()).toHaveValue("Texto que já estava no formulário.");

  fireEvent.change(spaceField(), { target: { value: general.id } });
  await act(async () => { cache.setQueryData(["app_feed", {}], page([sales, general])); });
  expect(spaceField()).toHaveValue(general.id);
  send();
  expect(await screen.findByRole("alert")).toHaveTextContent("Espaço indisponível.");
  expect(spaceField()).toHaveValue(general.id);
  expect(titleField()).toHaveValue("Título digitado");
  expect(bodyField()).toHaveValue("Texto que já estava no formulário.");
  expect(writes[0]).toEqual({
    p_id: null, p_space_id: general.id, p_title: "Título digitado",
    p_body: "Texto que já estava no formulário.", p_image_path: null,
  });

  fireEvent.change(spaceField(), { target: { value: sales.id } });
  send();
  await screen.findByRole("link", { name: "Ver minha publicação pendente" });
  expect(writes[1]).toEqual({ ...writes[0], p_space_id: sales.id });
});

it.each(["inexistente", readOnly.id])("mantém o seletor vazio se o parâmetro %s não permite publicação", async (space) => {
  const writes = mount(() => listed([general, readOnly]), "/app/comunidade/novo?space=" + space);
  await screen.findByRole("option", { name: general.name });
  expect(screen.queryByRole("option", { name: readOnly.name })).not.toBeInTheDocument();
  expect(spaceField()).toHaveValue("");
  fireEvent.input(titleField(), { target: { value: "Título preenchido" } });
  fireEvent.input(bodyField(), { target: { value: "Texto preenchido." } });
  send();
  expect(await screen.findByRole("alert")).toHaveTextContent("Confira os campos indicados");
  expect(writes).toHaveLength(0);
});

it("remove uma seleção revogada sem trocar para o espaço da rota ou apagar os campos", async () => {
  const writes = mount(() => listed([general, sales]));
  await screen.findByRole("option", { name: sales.name });
  fireEvent.change(spaceField(), { target: { value: general.id } });
  fireEvent.input(titleField(), { target: { value: "Título mantido" } });
  fireEvent.input(bodyField(), { target: { value: "Texto mantido." } });
  await act(async () => { cache.setQueryData(["app_feed", {}], page([sales])); });
  await waitFor(() => expect(screen.queryByRole("option", { name: general.name })).not.toBeInTheDocument());
  expect(spaceField()).toHaveValue("");
  expect(titleField()).toHaveValue("Título mantido");
  expect(bodyField()).toHaveValue("Texto mantido.");
  send();
  expect(await screen.findByRole("alert")).toHaveTextContent("Confira os campos indicados");
  expect(writes).toHaveLength(0);
});

it.each([
  { id: "new", path: "/app/comunidade/novo?space=vendas" },
  { id: post.id, path: "/app/comunidade/publicacao/editar?space=vendas" },
])("recupera o rascunho $id com precedência sobre o filtro e mantém seu espaço durante a espera", async ({ id, path }) => {
  sessionStorage.setItem(draftPrefix + id, JSON.stringify({
    title: "Título em rascunho", body: "Texto em rascunho.", space: general.id,
  }));
  const delayed = delayedFeed();
  mount(async (name) => {
    if (name === "app_post") return Response.json({ post, replies: [] });
    await delayed.promise;
    return listed([sales, general]);
  }, path);
  const title = await screen.findByRole("textbox", { name: "Título" });
  expect(title).toHaveValue("Título em rascunho");
  expect(bodyField()).toHaveValue("Texto em rascunho.");
  fireEvent.input(title, { target: { value: "Rascunho atualizado" } });
  delayed.resolve();
  await screen.findByRole("option", { name: general.name });
  expect(spaceField()).toHaveValue(general.id);
  expect(title).toHaveValue("Rascunho atualizado");
  const key = draftStorageKey("autor-qa", `${path}|Enviar para revisão|${id === "new" ? "" : id}`);
  await waitFor(() => expect(readDraft(key)?.fields).toEqual(
    [["title", "Rascunho atualizado"], ["space", general.id], ["body", "Texto em rascunho."]],
  ));
});

it("edição sem rascunho usa o espaço salvo e reenvia a mesma publicação em revisão", async () => {
  const delayed = delayedFeed();
  const writes = mount(async (name) => {
    if (name === "app_post") return Response.json({ post, replies: [] });
    if (name === "app_feed") {
      await delayed.promise;
      return listed([sales, general]);
    }
    return Response.json({ id: post.id, status: "pending" });
  }, "/app/comunidade/publicacao/editar?space=vendas");
  const title = await screen.findByRole("textbox", { name: "Título" });
  expect(title).toHaveValue(post.title);
  delayed.resolve();
  await screen.findByRole("option", { name: general.name });
  expect(spaceField()).toHaveValue(general.id);
  send();
  await screen.findByRole("link", { name: "Ver minha publicação pendente" });
  expect(writes[0]).toEqual({
    p_id: post.id, p_space_id: general.id, p_title: post.title,
    p_body: post.body, p_image_path: null,
  });
});
