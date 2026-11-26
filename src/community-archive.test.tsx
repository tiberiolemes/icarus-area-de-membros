import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
vi.hoisted(() => {
  vi.stubEnv("VITE_SUPABASE_URL", "http://127.0.0.1:58621");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-public-key");
});
import { cache, type Post } from "./api";
import { PostPage } from "./pages/community";
import { Modal } from "./ui";

afterEach(() => {
  cleanup();
  cache.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function fixture(overrides: Partial<Post> = {}): Post {
  return {
    id: "post-id", author_id: "author-a", author_name: "DEMONSTRAÇÃO autora",
    author_role: "member", plan_name: "", title: "DEMONSTRAÇÃO publicação",
    body: "Texto que precisa continuar legível.", created_at: "2026-11-23T12:00:00Z",
    status: "approved", vote_count: 4, voted: false, can_edit: true,
    can_archive: true, can_restore: false, ...overrides,
  };
}
function mount(post = fixture(), mutation?: (args: { p_id: string; p_archived: boolean }) => Promise<unknown>, canModerate = false) {
  let current = post;
  const calls: string[] = [];
  const transport = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const name = String(input).split("/").at(-1)!;
    calls.push(name);
    if (name === "app_archive_post") {
      const args = JSON.parse(String(init?.body));
      const result = await mutation?.(args);
      if (result instanceof Response) return result;
      current = fixture({
        status: args.p_archived ? "archived" : "rejected",
        can_edit: !args.p_archived, can_archive: !args.p_archived, can_restore: args.p_archived,
      });
      return json({ id: current.id, status: current.status, archived: args.p_archived });
    }
    return json({ post: current, replies: [fixture({ id: "reply-id", title: undefined, body: "Resposta histórica.", can_archive: false, can_restore: false })], can_moderate: canModerate });
  });
  vi.stubGlobal("fetch", transport);
  render(<QueryClientProvider client={cache}><MemoryRouter initialEntries={["/app/comunidade/post-id"]}><Routes>
    <Route path="/app/comunidade/:post" element={<PostPage />} />
  </Routes></MemoryRouter></QueryClientProvider>);
  return { calls, transport, setPost: (next: Post) => { current = next; } };
}
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}
async function openArchive(name = "Arquivar publicação") {
  const trigger = await screen.findByText(name, { selector: "button" });
  expect(trigger).toBeVisible();
  expect(trigger).toHaveAccessibleName(name);
  fireEvent.click(trigger);
  return screen.getByRole("dialog", { name });
}

it("não oferece moderação do tópico arquivado, mantendo a moderação autorizada da resposta", async () => {
  mount(fixture({ status: "archived", can_edit: false, can_archive: false, can_restore: true }), undefined, true);
  await screen.findByRole("heading", { name: "DEMONSTRAÇÃO publicação" });
  expect(screen.getAllByText("Moderação manual")).toHaveLength(1);
  expect(screen.getByText("Moderação manual").closest("article")).toHaveTextContent("Resposta histórica.");
});

it("capacidades falsas não oferecem arquivar/restaurar, mesmo quando autor_id coincide", async () => {
  mount(fixture({ can_archive: false, can_restore: false }));
  await screen.findByRole("heading", { name: "DEMONSTRAÇÃO publicação" });
  expect(screen.queryByRole("button", { name: /Arquivar publicação|Restaurar publicação/ })).not.toBeInTheDocument();
});

it("cancelar preserva conteúdo, não escreve nem invalida feed e devolve foco", async () => {
  const { calls } = mount();
  const invalidate = vi.spyOn(cache, "invalidateQueries");
  const dialog = await openArchive();
  expect(within(dialog).getByText(/Texto, imagem, respostas e votos são preservados/)).toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(calls.filter((name) => name === "app_archive_post")).toHaveLength(0);
  expect(invalidate).not.toHaveBeenCalled();
  expect(screen.getByText("Texto que precisa continuar legível.")).toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole("button", { name: "Arquivar publicação" })).toHaveFocus());
});

it("bloqueia reenvio e fechamento durante a escrita e só atualiza após confirmação", async () => {
  let resolve!: () => void;
  const pending = new Promise<void>((done) => { resolve = done; });
  const { calls, transport } = mount(fixture(), () => pending);
  const invalidate = vi.spyOn(cache, "invalidateQueries");
  const dialog = await openArchive();
  const form = within(dialog).getByRole("button", { name: "Confirmar arquivamento" }).closest("form")!;
  fireEvent.submit(form);
  fireEvent.submit(form);
  await waitFor(() => expect(within(dialog).getByRole("button", { name: "Enviando…" })).toBeDisabled());
  fireEvent.click(within(dialog).getByRole("button", { name: "Fechar" }));
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  expect(calls.filter((name) => name === "app_archive_post")).toHaveLength(1);
  expect(invalidate).not.toHaveBeenCalled();
  expect(screen.queryByText("Publicação arquivada. Seu histórico foi preservado.")).not.toBeInTheDocument();
  resolve();
  await screen.findByText("Publicação arquivada. Seu histórico foi preservado.");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ["app_feed"] });
  const write = transport.mock.calls.find(([input]) => String(input).includes("app_archive_post"))!;
  expect(JSON.parse(String(write[1]?.body))).toEqual({ p_id: "post-id", p_archived: true });
  expect(calls.lastIndexOf("app_post")).toBeGreaterThan(calls.indexOf("app_archive_post"));
  expect(screen.getByText("Resposta histórica.")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Votar/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Denunciar" })).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Escreva uma resposta")).not.toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole("button", { name: "Restaurar publicação" })).toHaveFocus());
});

it("exibe erro recuperável, preserva a confirmação e permite nova tentativa", async () => {
  let attempts = 0;
  const { calls } = mount(fixture(), async () => {
    if (++attempts === 1) return json({ code: "P0001", message: "Falha temporária. Tente novamente." }, 400);
  });
  const invalidate = vi.spyOn(cache, "invalidateQueries");
  const dialog = await openArchive();
  fireEvent.click(within(dialog).getByRole("button", { name: "Confirmar arquivamento" }));
  const error = await screen.findByText("Falha temporária. Tente novamente.");
  expect(invalidate).not.toHaveBeenCalled();
  expect(screen.queryByText("Publicação arquivada. Seu histórico foi preservado.")).not.toBeInTheDocument();
  await waitFor(() => expect(error.closest('[role="alert"]')).toHaveFocus());
  fireEvent.click(within(dialog).getByRole("button", { name: "Confirmar arquivamento" }));
  await screen.findByText("Publicação arquivada. Seu histórico foi preservado.");
  expect(calls.filter((name) => name === "app_archive_post")).toHaveLength(2);
});

it("restaurar informa estado rejeitado real, sem anunciar aprovação", async () => {
  mount(fixture({ status: "archived", can_edit: false, can_archive: false, can_restore: true }));
  const dialog = await openArchive("Restaurar publicação");
  fireEvent.click(within(dialog).getByRole("button", { name: "Confirmar restauração" }));
  await screen.findByText("Publicação restaurada. Estado atual: Não aprovado.");
  expect(screen.queryByLabelText("Escreva uma resposta")).not.toBeInTheDocument();
  expect(screen.getByText("Texto que precisa continuar legível.")).toBeInTheDocument();
});

it("trata capacidade revogada entre leitura e escrita sem invalidar feed", async () => {
  let setPost!: (next: Post) => void;
  ({ setPost } = mount(fixture(), async () => {
    setPost(fixture({ status: "archived", can_edit: false, can_archive: false, can_restore: false }));
    return json({ code: "P0001", message: "Publicação indisponível." }, 400);
  }));
  const invalidate = vi.spyOn(cache, "invalidateQueries");
  const dialog = await openArchive();
  fireEvent.click(within(dialog).getByRole("button", { name: "Confirmar arquivamento" }));
  await screen.findByText("Publicação indisponível.");
  expect(within(dialog).getByRole("button", { name: "Confirmar arquivamento" })).toBeDisabled();
  expect(invalidate).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole("button", { name: "Fechar" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(screen.queryByRole("button", { name: "Arquivar publicação" })).not.toBeInTheDocument();
  await waitFor(() => expect(screen.getByText("Texto que precisa continuar legível.").closest("article")).toHaveFocus());
});

it("a confirmação aberta não troca de arquivar para restaurar após mudança concorrente", async () => {
  const { setPost } = mount();
  const dialog = await openArchive();
  setPost(fixture({ status: "archived", can_edit: false, can_archive: false, can_restore: true }));
  await act(() => cache.invalidateQueries({ queryKey: ["app_post"] }));
  await waitFor(() => expect(within(dialog).getByRole("button", { name: "Confirmar arquivamento" })).toBeDisabled());
  expect(within(dialog).queryByRole("button", { name: "Confirmar restauração" })).not.toBeInTheDocument();
});

it("Modal existente continua sem controle externo por padrão", async () => {
  render(<Modal title="Modal existente" trigger={<button>Abrir existente</button>}><p>Conteúdo existente</p></Modal>);
  fireEvent.click(screen.getByRole("button", { name: "Abrir existente" }));
  const dialog = await screen.findByRole("dialog");
  fireEvent.click(within(dialog).getByRole("button", { name: "Fechar" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(screen.getByRole("button", { name: "Abrir existente" })).toHaveFocus();
});
