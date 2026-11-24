import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.hoisted(() => {
  vi.stubEnv("VITE_SUPABASE_URL", "http://127.0.0.1:58521");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-public-key");
});

import { cache } from "./api";
import { MemberSearch } from "./pages/member-search";

const course = { kind: "course", title: "Gestão", path: "/app/cursos/gestao" };
const moduleHit = { kind: "module", title: "Planejamento", path: "/app/cursos/gestao/planejamento" };
const lesson = { kind: "lesson", title: "Estratégia de preços", path: "/app/cursos/gestao/planejamento/~6dd0a182-c806-412f-9aa5-ac7f819c7cb2" };
const response = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
const page = (items: (typeof course)[], total = items.length, number = 1) =>
  response({ items, total, page: number, page_size: 20 });
type Params = { p_query: string; p_page: number };

function server(resolve: (args: Params, signal?: AbortSignal | null) => Response | Promise<Response>) {
  const calls = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
    expect(String(url)).toBe("http://127.0.0.1:58521/rest/v1/rpc/app_member_search");
    expect(init?.method).toBe("POST");
    return resolve(JSON.parse(String(init?.body)), init?.signal);
  });
  vi.stubGlobal("fetch", calls);
  return calls;
}

function RouteLabel() {
  const { pathname, search } = useLocation();
  return <h1>{pathname}{search}</h1>;
}

function fixture(actorId = "member-1", drawerOpen = false) {
  return (
    <QueryClientProvider client={cache}>
      <MemoryRouter initialEntries={["/app/cursos/origem/modulo/aula"]}>
        <MemberSearch actorId={actorId} drawerOpen={drawerOpen} />
        <RouteLabel />
        <button>Controle externo</button>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function enter(term: string) {
  const input = screen.getByRole("searchbox");
  fireEvent.change(input, { target: { value: term } });
  fireEvent.submit(screen.getByRole("search"));
  return input;
}

beforeEach(() => {
  cache.clear();
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  cache.clear();
  vi.unstubAllGlobals();
});

it("faz busca pelo SDK com atalho, navegação de resultados e destino profundo na SPA", async () => {
  const otherLesson = { ...lesson, title: "Estratégia de preços na segunda seção",
    path: "/app/cursos/gestao/planejamento/~ff9bd951-cfc7-4722-aeaf-c29bcec9b84b" };
  const search = vi.fn(() => page([course, moduleHit, lesson, otherLesson]));
  server(search);
  render(fixture());
  const input = screen.getByRole("searchbox");
  fireEvent.keyDown(window, { ctrlKey: true, key: "k" });
  expect(input).toHaveFocus();
  expect(screen.getByRole("status")).toHaveTextContent("Digite pelo menos 2 caracteres");
  fireEvent.change(input, { target: { value: " g " } });
  expect(search).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: "  gestão  " } });
  expect(screen.getByRole("status")).toHaveTextContent("Buscando conteúdos");
  const results = await screen.findByRole("list", { name: "Resultados da busca" });
  const links = within(results).getAllByRole("link");
  expect(links.map((link) => link.getAttribute("href"))).toEqual([course.path, moduleHit.path, lesson.path, otherLesson.path]);
  expect(search).toHaveBeenCalledExactlyOnceWith({ p_query: "gestão", p_page: 1 }, expect.any(AbortSignal));
  fireEvent.keyDown(input, { key: "ArrowDown" });
  expect(links[0]).toHaveFocus();
  fireEvent.keyDown(links[0], { key: "ArrowDown" });
  expect(links[1]).toHaveFocus();
  fireEvent.keyDown(links[1], { key: "Escape" });
  expect(input).toHaveFocus();
  expect(results).not.toBeInTheDocument();
  expect(input).toHaveValue("  gestão  ");
  fireEvent.click(input);
  fireEvent.click(await screen.findByRole("link", { name: /Estratégia de preços na segunda seção/ }));
  expect(screen.getByRole("heading")).toHaveTextContent(otherLesson.path);
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

it("pagina no servidor, mantém foco e reinicia na primeira página quando o termo muda", async () => {
  const search = vi.fn(({ p_query, p_page }: Params) =>
    p_query === "preços" ? page([lesson]) : page([p_page === 1 ? course : moduleHit], 22, p_page));
  server(search);
  render(fixture());
  const input = enter("gestão");
  await screen.findByRole("link", { name: "Gestão Curso" });
  fireEvent.click(screen.getByRole("button", { name: "Próxima" }));
  expect(input).toHaveFocus();
  expect(screen.queryByRole("link", { name: "Gestão Curso" })).not.toBeInTheDocument();
  await screen.findByRole("link", { name: "Planejamento Módulo" });
  expect(screen.getByRole("status")).toHaveTextContent("página 2 de 2");
  expect(screen.getByRole("button", { name: "Próxima" })).toBeDisabled();
  fireEvent.change(input, { target: { value: "" } });
  expect(screen.getByRole("status")).toHaveTextContent("Digite pelo menos 2 caracteres");
  fireEvent.change(input, { target: { value: "gestão" } });
  await screen.findByRole("link", { name: "Gestão Curso" });
  fireEvent.change(input, { target: { value: "preços" } });
  await screen.findByRole("link", { name: /Estratégia de preços/ });
  expect(search.mock.calls.map(([args]) => args)).toEqual([
    { p_query: "gestão", p_page: 1 }, { p_query: "gestão", p_page: 2 },
    { p_query: "gestão", p_page: 1 }, { p_query: "preços", p_page: 1 },
  ]);
});

it("mantém termo em falha e retentativa, anuncia vazio e leva o termo ao catálogo", async () => {
  let attempts = 0;
  server(() => ++attempts === 1 ? response({ code: "XX000", message: "detalhe privado" }, 503) : page([]));
  render(fixture());
  const input = enter("  custo & valor  ");
  expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível concluir a busca.");
  expect(screen.queryByText("detalhe privado")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
  expect(input).toHaveFocus();
  await screen.findByText("Nenhum conteúdo disponível encontrado.");
  expect(attempts).toBe(2);
  expect(input).toHaveValue("  custo & valor  ");
  fireEvent.click(screen.getByRole("link", { name: "Buscar no catálogo" }));
  expect(screen.getByRole("heading")).toHaveTextContent("/app/cursos?q=custo+%26+valor&page=1");
  expect(screen.getByRole("searchbox")).toHaveValue("custo & valor");
});

it("descarta resposta em trânsito na troca de ator e só aceita destinos de conteúdo locais", async () => {
  let release!: (value: Response) => void;
  let pendingSignal: AbortSignal | null | undefined;
  const html = '<img src=x onerror="alert(1)">';
  const calls = server(({ p_query }, signal) => {
    if (p_query === "antiga") {
      pendingSignal = signal;
      return new Promise<Response>((resolve) => { release = resolve; });
    }
    return page([
      { ...lesson, title: html },
      { ...lesson, path: "//example.test", title: "Destino externo" },
      { ...lesson, path: "/app/cursos/%2e%2e/conta", title: "Desvio de rota" },
      { ...lesson, path: course.path, title: "Tipo incompatível" },
      { ...lesson, kind: "module", title: "Endereço de aula em módulo" },
      { ...lesson, path: "/app/cursos/gestao/planejamento/~invalido", title: "Identificador inválido" },
      { ...lesson, path: lesson.path + "\n", title: "Caractere de controle" },
    ]);
  });
  const mounted = render(fixture());
  enter("antiga");
  await waitFor(() => expect(calls).toHaveBeenCalledTimes(1));
  mounted.rerender(fixture("member-2"));
  expect(pendingSignal?.aborted).toBe(true);
  expect(screen.getByRole("searchbox")).toHaveValue("");
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  enter("nova");
  const text = await screen.findByText(html);
  await act(async () => release(page([course])));
  expect(text.closest("a")).toHaveAttribute("href", lesson.path);
  const hits = screen.getByRole("list", { name: "Resultados da busca" });
  expect(within(hits).getAllByRole("link")).toHaveLength(1);
  expect(hits.querySelector("img")).toBeNull();
  expect(cache.getQueriesData({ queryKey: ["app_member_search", "member-1"] })).toEqual([]);
});

it("fecha ao sair do campo e suspende o atalho durante a gaveta", () => {
  const mounted = render(fixture());
  fireEvent.keyDown(window, { metaKey: true, key: "k" });
  const input = screen.getByRole("searchbox");
  const outside = screen.getByRole("button", { name: "Controle externo" });
  act(() => outside.focus());
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  fireEvent.keyDown(window, { metaKey: true, key: "k" });
  expect(input).toHaveFocus();
  fireEvent.pointerDown(outside);
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  mounted.rerender(fixture("member-1", true));
  act(() => outside.focus());
  fireEvent.keyDown(window, { ctrlKey: true, key: "k" });
  expect(outside).toHaveFocus();
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});
