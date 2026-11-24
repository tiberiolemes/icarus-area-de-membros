import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
vi.hoisted(() => {
  vi.stubEnv("VITE_SUPABASE_URL", "http://127.0.0.1:58521");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-public-key");
});
import { cache } from "./api";
import type { Course, Lesson, Module, Page } from "./api";
import { Catalog } from "./pages/learning";
import { RouteFocus } from "./ui";

const course = (id: string, fields: Partial<Course> = {}): Course => ({
  id, slug: id, title: `Curso ${id}`, description: "<p>Descrição do curso</p>",
  cover_url: null, status: "published", access_mode: "public", plan_ids: [],
  certificate_enabled: false, required_lessons: 4, total_lessons: 8,
  completed_lessons: 0, progress_percent: 0, duration_seconds: 3600,
  can_access: true, ...fields,
});
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "Content-Type": "application/json" },
});
function catalogFetch(items: Course[], total = items.length, modules: Module[] = []) {
  const requests: { p_query: string; p_page: number }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const args = JSON.parse(String(init?.body));
    if (String(input).endsWith("/rpc/app_course")) {
      const selected = items.find(item => item.slug === args.p_slug);
      expect(selected).toBeDefined();
      return json({ course: selected, modules });
    }
    expect(String(input)).toContain("/rest/v1/rpc/app_catalog");
    requests.push(args);
    return json({ items, total, page: args.p_page, page_size: 20 } satisfies Page<Course>);
  }));
  return requests;
}
function mount(url = "/app/cursos", routeFocus = false) {
  return render(<QueryClientProvider client={cache}><MemoryRouter initialEntries={[url]}>
    {routeFocus && <RouteFocus />}
    <Routes><Route path="/app/cursos" element={<Catalog />} /><Route path="/app/cursos/:slug" element={<h1>Detalhes reais do curso</h1>} /></Routes>
  </MemoryRouter></QueryClientProvider>);
}
beforeEach(() => { cache.clear(); localStorage.clear(); sessionStorage.clear(); vi.stubGlobal("scrollTo", vi.fn()); });
afterEach(() => { cleanup(); cache.clear(); vi.unstubAllGlobals(); });

describe("Catálogo real em fileiras", () => {
  it("preserva o foco na busca ao enviar e sincroniza o campo ao limpar", async () => {
    const requests = catalogFetch([]);
    mount("/app/cursos", true);
    const input = screen.getByRole("searchbox");
    input.focus();
    fireEvent.change(input, { target: { value: "sem resultado" } });
    fireEvent.submit(screen.getByRole("search"));
    await waitFor(() => expect(requests.at(-1)).toEqual({ p_query: "sem resultado", p_page: 1 }));
    expect(screen.getByRole("searchbox")).toBe(input);
    expect(input).toHaveFocus();
    fireEvent.click(await screen.findByRole("button", { name: "Limpar busca" }));
    await waitFor(() => expect(input).toHaveValue(""));
  });
  it("mantém busca/página no SDK, explicita o recorte e não busca outras páginas antecipadamente", async () => {
    const requests = catalogFetch([course("a"), course("b")], 45);
    mount("/app/cursos?q=gest%C3%A3o&page=2");
    expect(await screen.findByText(/Exibindo 21–22 de 45 cursos/)).toHaveTextContent("página 2 de 3. Destaque e fileiras mostram somente os cursos desta página.");
    expect(requests).toEqual([{ p_query: "gestão", p_page: 2 }]);
    fireEvent.click(screen.getByRole("button", { name: "Próxima" }));
    await waitFor(() => expect(requests.at(-1)).toEqual({ p_query: "gestão", p_page: 3 }));
    await screen.findByRole("heading", { name: "Curso a", level: 2 });
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "nova busca" } });
    fireEvent.submit(screen.getByRole("search"));
    await waitFor(() => expect(requests.at(-1)).toEqual({ p_query: "nova busca", p_page: 1 }));
    expect(requests).toHaveLength(3);
  });

  it.each([["NaN", 1], ["-3", 1], ["0", 1], ["2.5", 1], ["Infinity", 1], ["100001", 100000]])("normaliza page=%s antes de chamar o backend", async (value, expected) => {
    const requests = catalogFetch([]);
    mount(`/app/cursos?page=${value}`);
    await screen.findByText("Nenhum curso publicado para seu perfil. Os cursos liberados aparecerão aqui.");
    expect(requests).toEqual([{ p_query: "", p_page: expected }]);
  });

  it("mostra um único estado de erro e a tentativa usa novamente o SDK", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", vi.fn(async input => String(input).endsWith("/rpc/app_course")
      ? json({ course: course("recuperado"), modules: [] })
      : ++calls === 1
      ? json({ message: "Serviço temporariamente indisponível" }, 503)
      : json({ items: [course("recuperado")], total: 1, page: 1, page_size: 20 })));
    mount();
    expect(await screen.findByRole("alert")).toHaveTextContent("Serviço temporariamente indisponível");
    expect(screen.getAllByRole("button", { name: "Tentar novamente" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    await screen.findByRole("heading", { name: "Curso recuperado", level: 2 });
    expect(calls).toBe(2);
  });

  it("preserva loading, vazio e busca disponível durante a consulta", async () => {
    let resolve!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(r => { resolve = r; })));
    mount();
    expect(screen.getByRole("status", { name: "Carregando conteúdo" })).toBeInTheDocument();
    expect(screen.getByRole("searchbox")).toBeInTheDocument();
    await waitFor(() => expect(resolve).toBeTypeOf("function"));
    await act(async () => resolve(json({ items: [], total: 0, page: 1, page_size: 20 })));
    await screen.findByText("Nenhum curso publicado para seu perfil. Os cursos liberados aparecerão aqui.");
    expect(screen.queryByRole("button", { name: "Limpar busca" })).not.toBeInTheDocument();
  });

  it("recupera busca sem resultados sem reload ou filtro fictício", async () => {
    const requests = catalogFetch([]);
    mount("/app/cursos?q=inexistente&page=2");
    fireEvent.click(await screen.findByRole("button", { name: "Limpar busca" }));
    await waitFor(() => expect(requests.at(-1)).toEqual({ p_query: "", p_page: 1 }));
    expect(screen.getByRole("searchbox")).toHaveValue("");
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("oferece retornar à página1 quando o resultado existe em outra página", async () => {
    const requests = catalogFetch([], 21);
    mount("/app/cursos?q=curso&page=99");
    fireEvent.click(await screen.findByRole("button", { name: "Voltar à primeira página" }));
    await waitFor(() => expect(requests.at(-1)).toEqual({ p_query: "curso", p_page: 1 }));
  });

  it("prefere andamento acessível real e não trata requisitos100% com bônus restante como retomada", async () => {
    catalogFetch([
      course("novo"),
      course("principal", { completed_lessons: 2, progress_percent: 50 }),
      course("bonus", { completed_lessons: 4, total_lessons: 6, progress_percent: 100 }),
      course("andamento", { completed_lessons: 1, progress_percent: 0 }),
    ]);
    mount();
    const hero = await screen.findByRole("region", { name: "Curso principal" });
    expect(within(hero).getByText("2/8 aulas · 50%")).toBeInTheDocument();
    expect(within(hero).getByRole("link", { name: "Continuar curso" })).toHaveAttribute("href", "/app/cursos/principal");
    const ongoing = screen.getByRole("region", { name: "Continue aprendendo" });
    expect(within(ongoing).getByRole("heading", { name: "Curso andamento" })).toBeInTheDocument();
    expect(within(ongoing).queryByRole("heading", { name: "Curso bonus" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("heading", { name: "Curso principal" })).toHaveLength(1);
  });

  it("mantém curso negado visível com Consultar acesso, sem conceder retomada", async () => {
    const requests = catalogFetch([course("negado", { can_access: false, completed_lessons: 2, progress_percent: 50 }), course("liberado")]);
    mount();
    await screen.findByRole("region", { name: "Curso liberado" });
    expect(screen.getByRole("link", { name: "Consultar acesso" })).toHaveAttribute("href", "/app/cursos/negado");
    expect(screen.queryByRole("link", { name: "Continuar curso" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: "Consultar acesso" }));
    expect(await screen.findByRole("heading", { name: "Detalhes reais do curso" })).toBeInTheDocument();
    expect(requests).toHaveLength(1);
  });

  it("usa os módulos do RPC e retoma a primeira aula pendente que o servidor libera", async () => {
    const featured = course("curso-real", { completed_lessons: 1, progress_percent: 25 });
    const lesson = (id: string, fields: Partial<Lesson> = {}): Lesson => ({
      id, slug: id, title: id, type: "video", duration_seconds: 120,
      order_index: 0, can_access: true, completed: false, ...fields,
    });
    const module = (slug: string, can_access: boolean, lessons: Lesson[]): Module => ({
      id: slug, slug, title: slug, order_index: 0, can_access,
      sections: lessons.map((item, order_index) => ({
        id: item.id, title: item.title, order_index, is_bonus: false, lessons: [item],
      })),
    });
    catalogFetch([featured], 1, [
      module("Restrito", false, [lesson("oculta")]),
      module("Concluído", true, [lesson("finalizada", { completed: true })]),
      module("Módulo & atual", true, [
        lesson("vista", { slug: "mesma-aula", completed: true }),
        lesson("ff9bd951-cfc7-4722-aeaf-c29bcec9b84b", { slug: "mesma-aula", title: "próxima #1" }),
      ]),
    ]);
    mount();
    const grid = await screen.findByRole("region", { name: "Módulos do curso" });
    expect(within(grid).getByText("2 de 3 com acesso liberado")).toBeInTheDocument();
    expect(within(grid).getByText("Bloqueado")).toBeInTheDocument();
    expect(within(grid).getByRole("progressbar", { name: "100% concluído" })).toHaveAttribute("value", "100");
    expect(within(grid).getByRole("link", { name: "Consultar assinatura" })).toHaveAttribute("href", "/app/configuracoes?aba=assinatura");
    expect(within(grid).getByRole("progressbar", { name: "50% concluído" })).toHaveAttribute("value", "50");
    expect(within(grid).getByText("2 aulas · 4 min")).toBeInTheDocument();
    const hero = screen.getByRole("region", { name: "Curso curso-real" });
    expect(within(hero).getByText("Próxima aula:").parentElement).toHaveTextContent("Próxima aula: próxima #1");
    expect(within(hero).queryByText("oculta")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Continuar curso" })).toHaveAttribute("href", "/app/cursos/curso-real/M%C3%B3dulo%20%26%20atual/~ff9bd951-cfc7-4722-aeaf-c29bcec9b84b");
    expect(within(grid).getAllByRole("link", { name: /^Retomar aula/ })).toHaveLength(1);
    expect(within(grid).getByRole("link", { name: "Retomar aula próxima #1" })).toHaveAttribute("href", "/app/cursos/curso-real/M%C3%B3dulo%20%26%20atual/~ff9bd951-cfc7-4722-aeaf-c29bcec9b84b");
  });

  it("oferece consulta à assinatura quando há módulos restritos e respeita o acesso da próxima aula", async () => {
    const featured = course("parcial", { completed_lessons: 1, progress_percent: 25 });
    const watched: Lesson = { id: "vista", slug: "vista", title: "Vista", type: "video", duration_seconds: 120,
      order_index: 0, can_access: true, completed: true };
    catalogFetch([featured], 1, [{
      id: "parcial", slug: "parcial", title: "Módulo parcial", order_index: 0, can_access: true,
      sections: [{ id: "s", title: "Aulas", order_index: 0, is_bonus: false, lessons: [
        watched, { ...watched, id: "restrita", slug: "restrita", title: "Aula restrita", can_access: false, completed: false },
      ] }],
    }, { id: "fechado", slug: "fechado", title: "Módulo restrito", order_index: 1, can_access: false, sections: [] }]);
    mount();
    expect(await screen.findByRole("link", { name: "Ver assinatura" })).toHaveAttribute("href", "/app/configuracoes?aba=assinatura");
    expect(screen.getByRole("link", { name: "Continuar curso" })).toHaveAttribute("href", "/app/cursos/parcial");
    expect(screen.queryByRole("link", { name: /^Retomar aula/ })).not.toBeInTheDocument();
  });

  it("usa fallback com título real, escapa conteúdo malicioso e codifica slug como segmento", async () => {
    const title = '<img src=x onerror="alert(1)">Título';
    catalogFetch([course("seguro", { title, slug: "a/b?x=#fim", description: "<script>alert(1)</script><p>Texto seguro</p>" })]);
    const { container } = mount();
    await screen.findByRole("heading", { name: title });
    expect(container.querySelector("img,script")).toBeNull();
    expect(screen.getByRole("link", { name: "Conhecer curso" })).toHaveAttribute("href", "/app/cursos/a%2Fb%3Fx%3D%23fim");
    expect(container.querySelector(".catalog-cover-title")).toHaveTextContent(title);
    expect(container.querySelector(".catalog-description")).toHaveTextContent("Texto seguro");
  });

  it("pede a capa pelo PrivateImage real e nunca usa cover_url como src", async () => {
    const mediaCalls: unknown[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes("/rest/v1/rpc/app_catalog")) return json({ items: [course("privado", { cover_url: "javascript:raw-cover" })], total: 1, page: 1, page_size: 20 });
      if (String(input).endsWith("/rpc/app_course")) return json({ course: course("privado", { cover_url: "javascript:raw-cover" }), modules: [] });
      expect(String(input)).toContain("/functions/v1/media");
      mediaCalls.push(JSON.parse(String(init?.body)));
      return json({ url: "https://media.example.test/signed-cover", expires_at: "2030-01-01" });
    }));
    const { container } = mount();
    await waitFor(() => expect(container.querySelector("img")).toHaveAttribute("src", "https://media.example.test/signed-cover"));
    expect(mediaCalls).toEqual([{ kind: "course-cover", id: "privado" }]);
    expect(container.innerHTML).not.toContain("javascript:raw-cover");
  });

  it("atualiza setas pelos limites do trilho e resize sem depender de layout JSDOM", async () => {
    catalogFetch([course("hero"), course("a"), course("b"), course("c")]);
    mount();
    const track = await screen.findByRole("region", { name: "Explore os cursos: fileira horizontal" });
    let width = 320;
    Object.defineProperties(track, { clientWidth: { get: () => width }, scrollWidth: { get: () => 900 } });
    const scrollBy = vi.fn((options: ScrollToOptions) => { track.scrollLeft += Number(options.left); fireEvent.scroll(track); });
    Object.defineProperty(track, "scrollBy", { value: scrollBy, configurable: true });
    fireEvent(window, new Event("resize"));
    const next = screen.getByRole("button", { name: "Próximos cursos: Explore os cursos" });
    const previous = screen.getByRole("button", { name: "Cursos anteriores: Explore os cursos" });
    expect(previous).toBeDisabled();
    expect(next).toBeEnabled();
    fireEvent.click(next);
    expect(scrollBy).toHaveBeenCalledWith({ left: 272, behavior: "smooth" });
    expect(previous).toBeEnabled();
    track.scrollLeft = 580;
    fireEvent.scroll(track);
    expect(next).toBeDisabled();
    width = 1000; track.scrollLeft = 0;
    fireEvent(window, new Event("resize"));
    expect(previous).toBeDisabled();
    expect(next).toBeDisabled();
    expect(next).toBeInTheDocument();
  });
});
