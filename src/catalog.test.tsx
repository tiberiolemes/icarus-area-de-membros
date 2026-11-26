import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
vi.hoisted(() => {
  vi.stubEnv("VITE_SUPABASE_URL", "http://127.0.0.1:58521");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-public-key");
});
import { cache } from "./api";
import type { Course } from "./api";
import { Catalog, CoursePage } from "./pages/learning";
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
function catalogFetch(items: Course[], total = items.length, resume: object | null = null) {
  const requests: { p_query: string; p_page: number }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const args = JSON.parse(String(init?.body));
    expect(String(input)).toContain("/rest/v1/rpc/app_catalog_showcase");
    requests.push({ p_query: args.p_query, p_page: args.p_page });
    return json({ items, total, page: args.p_page, page_size: 20, resume, counts: {all: total, ongoing: 0, completed: 0, restricted: 0} });
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

describe("Vitrine de cursos", () => {
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
    fireEvent.click(await screen.findByRole("button", { name: "Limpar busca e filtros" }));
    await waitFor(() => expect(input).toHaveValue(""));
  });
  it("mantém busca/página no SDK, explicita o recorte e não busca outras páginas antecipadamente", async () => {
    const requests = catalogFetch([course("a"), course("b")], 45);
    mount("/app/cursos?q=gest%C3%A3o&page=2");
    expect(await screen.findByText(/45 registros · página 2 de 3/)).toBeInTheDocument();
    expect(requests).toEqual([{ p_query: "gestão", p_page: 2 }]);
    fireEvent.click(screen.getByRole("button", { name: "Próxima" }));
    await waitFor(() => expect(requests.at(-1)).toEqual({ p_query: "gestão", p_page: 3 }));
    await screen.findByRole("heading", { name: "Curso a", level: 3 });
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
    await screen.findByRole("heading", { name: "Curso recuperado", level: 3 });
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
    expect(screen.queryByRole("button", { name: "Limpar busca e filtros" })).not.toBeInTheDocument();
  });

  it("recupera busca sem resultados sem reload ou filtro fictício", async () => {
    const requests = catalogFetch([]);
    mount("/app/cursos?q=inexistente&page=2");
    fireEvent.click(await screen.findByRole("button", { name: "Limpar busca e filtros" }));
    await waitFor(() => expect(requests.at(-1)).toEqual({ p_query: "", p_page: 1 }));
    expect(screen.getByRole("searchbox")).toHaveValue("");
    expect(screen.getByRole("combobox", {name: "Ordenar cursos"})).toHaveValue("recent");
  });

  it("oferece retornar à página1 quando o resultado existe em outra página", async () => {
    const requests = catalogFetch([], 21);
    mount("/app/cursos?q=curso&page=99");
    fireEvent.click(await screen.findByRole("button", { name: "Voltar à primeira página" }));
    await waitFor(() => expect(requests.at(-1)).toEqual({ p_query: "curso", p_page: 1 }));
  });

  it("mantém todos os cursos na grade, omite módulos e aponta à aula liberada por ID", async () => {
    const target = { id: "id2", title: "Aula duplicada", module_slug: "Módulo & atual", module_title: "Introdução", position_seconds: 614 };
    const ongoing = { ...course("andamento"), state: "ongoing", module_count: 1, target };
    const available = { ...course("novo"), state: "available", module_count: 1, target: { ...target, position_seconds: 0 } };
    catalogFetch([available, ongoing], 2, ongoing);
    mount();
    const resume = await screen.findByRole("region", {name: "Continuar aprendendo"});
    const direct = "/app/cursos/andamento/M%C3%B3dulo%20%26%20atual/~id2";
    expect(within(resume).getByRole("link", { name: "Retomar aula (10:14)" })).toHaveAttribute("href", direct);
    expect(screen.getByRole("link", { name: "Continuar curso" })).toHaveAttribute("href", direct);
    expect(screen.getByRole("link", { name: "Começar curso" })).toHaveAttribute("href", direct.replace("andamento","novo"));
    expect(screen.getAllByRole("article")).toHaveLength(2);
    expect(screen.queryByRole("heading", {name: "Módulos do curso"})).not.toBeInTheDocument();
  });

  it("abre o módulo indicado na ementa, mostra o progresso curricular e mantém o destino de prévia", async () => {
    const lesson = {id:"l1",title:"Aula de prévia",duration_seconds:90,can_access:true,is_preview:true};
    const item = course("ementa", {total_lessons:2, completed_lessons:1, required_lessons:0, progress_percent:0});
    const modules = ["primeiro","segundo"].map((slug,i) => ({
      slug, id:slug, title:slug, can_access:i === 0,
      sections:[{id:"s"+i,title:"Conteúdo",lessons:[{...lesson,id:"l"+i}]}],
    }));
    vi.stubGlobal("fetch", vi.fn(async () => json({course:item,modules})));
    render(<QueryClientProvider client={cache}><MemoryRouter initialEntries={["/app/cursos/ementa?modulo=segundo"]}>
      <Routes><Route path="/app/cursos/:curso" element={<CoursePage />} /></Routes>
    </MemoryRouter></QueryClientProvider>);
    await screen.findByRole("heading", {name:"Curso ementa"});
    expect(screen.getByRole("link", {name:"Continuar"})).toHaveAttribute("href", "/app/cursos/ementa/primeiro/~l0");
    expect(screen.getByRole("progressbar", {name:"50% concluído"})).toHaveValue(50);
    expect(screen.getByText("primeiro").closest("details")).not.toHaveAttribute("open");
    const expanded = screen.getByText("segundo").closest("details")!;
    expect(expanded).toHaveAttribute("open");
    expect(within(expanded).getByRole("link", {name:/Aula de prévia/})).toHaveAttribute("href", "/app/cursos/ementa/segundo/~l1");
  });

  it("mostra na página do módulo as aulas, a duração e o progresso só daquele módulo", async () => {
    const lesson = (id: string, duration_seconds: number, completed: boolean) =>
      ({id, title:"Aula "+id, duration_seconds, can_access:true, completed});
    const item = course("ementa", {total_lessons:5, completed_lessons:2, required_lessons:0, progress_percent:40, duration_seconds:1920});
    const modules = [
      {slug:"primeiro", id:"primeiro", title:"Módulo um", can_access:true, sections:[{id:"s1",title:"Conteúdo",lessons:[lesson("a",60,true),lesson("b",60,false)]}]},
      {slug:"segundo", id:"segundo", title:"Módulo dois", can_access:true, sections:[{id:"s2",title:"Parte 1",lessons:[lesson("c",600,true)]},{id:"s3",title:"Parte 2",lessons:[lesson("d",600,false),lesson("e",600,false)]}]},
    ];
    vi.stubGlobal("fetch", vi.fn(async () => json({course:item,modules})));
    render(<QueryClientProvider client={cache}><MemoryRouter initialEntries={["/app/cursos/ementa/segundo"]}>
      <Routes><Route path="/app/cursos/:curso/:modulo" element={<CoursePage />} /></Routes>
    </MemoryRouter></QueryClientProvider>);
    await screen.findByRole("heading", {name:"Módulo dois"});
    expect(screen.getByText("3 aulas · 30 minutos")).toBeVisible();
    expect(screen.getByRole("progressbar", {name:"33% concluído"})).toHaveValue(33);
    expect(screen.getByText("1/3 aulas · 33%")).toBeVisible();
  });

  it("lista as aulas soltas do módulo sem o cabeçalho da seção automática", async () => {
    const lesson = (id: string) => ({id, title:"Aula "+id, duration_seconds:60, can_access:true, completed:false});
    const modules = [{slug:"unico", id:"unico", title:"Módulo único", can_access:true, sections:[
      {id:"auto",title:"Aulas do módulo",is_default:true,lessons:[lesson("a")]},
      {id:"extra",title:"Material extra",is_default:false,lessons:[lesson("b")]},
    ]}];
    vi.stubGlobal("fetch", vi.fn(async () => json({course:course("soltas",{total_lessons:2}),modules})));
    render(<QueryClientProvider client={cache}><MemoryRouter initialEntries={["/app/cursos/soltas"]}>
      <Routes><Route path="/app/cursos/:curso" element={<CoursePage />} /></Routes>
    </MemoryRouter></QueryClientProvider>);
    expect(await screen.findByRole("link", {name:/Aula a/})).toBeInTheDocument();
    expect(screen.queryByText("Aulas do módulo")).toBeNull();
    expect(screen.getByRole("heading", {name:"Material extra"})).toBeInTheDocument();
  });

  it("clicar na capa do cartão abre o mesmo destino do título, sem criar parada extra no teclado", async () => {
    catalogFetch([course("capa-clicavel", { title: "Curso com capa" })]);
    const { container } = mount();
    const title = await screen.findByRole("link", { name: "Curso com capa" });
    const art = container.querySelector(".showcase-card .showcase-art a");
    expect(art).toHaveAttribute("href", title.getAttribute("href"));
    expect(art).toHaveAttribute("tabindex", "-1");
    expect(art).toHaveAttribute("aria-hidden", "true");
  });

  it("oferece somente a consulta de acesso ao curso restrito", async () => {
    catalogFetch([course("negado", {can_access: false})]);
    mount();
    fireEvent.click(await screen.findByRole("link", {name: "Consultar acesso"}));
    expect(await screen.findByRole("heading", {name: "Detalhes reais do curso"})).toBeInTheDocument();
  });

  it("filtra e ordena no servidor desde a primeira página e preserva a busca", async () => {
    catalogFetch([]);
    mount("/app/cursos?q=marketing&page=3");
    fireEvent.click(screen.getByRole("button", {name: /^Em andamento/}));
    fireEvent.change(screen.getByRole("combobox"), {target: {value: "progress"}});
    await waitFor(() => expect(fetch).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({
      body: JSON.stringify({p_query:"marketing",p_page:1,p_filter:"ongoing",p_sort:"progress"})
    })));
  });
  it("usa fallback com título real, escapa conteúdo malicioso e codifica slug como segmento", async () => {
    const title = '<img src=x onerror="alert(1)">Título';
    catalogFetch([course("seguro", { title, slug: "a/b?x=#fim", description: "<script>alert(1)</script><p>Texto seguro</p>" })]);
    const { container } = mount();
    await screen.findByRole("heading", { name: title });
    expect(container.querySelector("img,script")).toBeNull();
    expect(screen.getByText("Sem aula disponível")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver ementa" })).toHaveAttribute("href", "/app/cursos/a%2Fb%3Fx%3D%23fim");
    expect(container.querySelector(".catalog-cover-title")).toHaveTextContent(title);
    expect(container.querySelector(".catalog-description")).toHaveTextContent("Texto seguro");
  });

  it("pede a capa pelo PrivateImage real e nunca usa cover_url como src", async () => {
    const mediaCalls: unknown[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes("/rest/v1/rpc/app_catalog")) return json({ items: [{ ...course("privado"), has_cover:true }], total: 1, page: 1, page_size: 20 });
      if (String(input).endsWith("/rpc/app_course")) return json({ course: course("privado", { cover_url: "javascript:raw-cover" }), modules: [] });
      expect(String(input)).toContain("/functions/v1/media");
      mediaCalls.push(JSON.parse(String(init?.body)));
      return json({ url: "https://media.example.test/signed-cover", expires_at: "2030-01-01" });
    }));
    const { container } = mount();
    await waitFor(() => expect(container.querySelector("img")).toHaveAttribute("src", "https://media.example.test/signed-cover"));
    expect(mediaCalls).toEqual([{ kind: "course-cover", id: "privado" }]);
    expect(container.innerHTML).not.toContain("javascript:raw-cover");
    expect(container.querySelector("img")!.style.objectPosition).toBe("");
  });

  it("posiciona a capa pelo foco do corte que o servidor entrega", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/rest/v1/rpc/app_catalog")) return json({ items: [{ ...course("privado"), has_cover: true }], total: 1, page: 1, page_size: 20 });
      if (String(input).endsWith("/rpc/app_course")) return json({ course: course("privado"), modules: [] });
      return json({ url: "https://media.example.test/signed-cover", expires_at: "2030-01-01", focus: "20% 70%" });
    }));
    const { container } = mount();
    await waitFor(() => expect(container.querySelector("img")).toHaveStyle({ objectPosition: "20% 70%" }));
  });

});
