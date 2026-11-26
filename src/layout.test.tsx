import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Link, MemoryRouter } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
vi.hoisted(() => {
  vi.stubEnv("VITE_SUPABASE_URL", "http://127.0.0.1:58521");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-public-key");
});
import { cache } from "./api";
import { Tour } from "./tour";
import { Form } from "./ui";
import { AdminCommunity, AdminPlans, AdminSettings } from "./pages/admin";

const calls: string[] = [];
const page = { items: [], total: 0, page: 1, page_size: 20 };
beforeEach(() => {
  cache.clear(); calls.length = 0;
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    calls.push(String(input));
    return new Response(JSON.stringify(page), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
});
afterEach(() => { cleanup(); cache.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function show(node: React.ReactNode, route = "/admin/planos") {
  return render(<QueryClientProvider client={cache}><MemoryRouter initialEntries={[route]}>{node}</MemoryRouter></QueryClientProvider>);
}

it("ilumina o início de uma seção longa sem recortar a tela inteira", async () => {
  const view = show(<><section data-tour="community"><h2>Publicações</h2></section><Tour /></>);
  const feed = view.container.querySelector("section")!;
  const heading = screen.getByRole("heading", { name: "Publicações" });
  const region = new DOMRect(0, 120, 360, 2400);
  vi.spyOn(feed, "getClientRects").mockReturnValue([region] as unknown as DOMRectList);
  vi.spyOn(feed, "getBoundingClientRect").mockReturnValue(region);
  vi.spyOn(heading, "getBoundingClientRect").mockReturnValue(new DOMRect(16, 130, 328, 28));
  fireEvent.click(screen.getByRole("button", { name: "Guia desta tela" }));
  await waitFor(() => expect(heading).toHaveClass("tour-target"));
  expect(feed).not.toHaveClass("tour-target");
});

it("o guia encontra alvos carregados após o render, ignora a navegação oculta e devolve o foco ao pausar", async () => {
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockImplementation(function (this: HTMLElement) {
    return (this.style.display === "none" ? [] : [new DOMRect(0, 0, 44, 44)]) as unknown as DOMRectList;
  });
  const { rerender } = show(<><nav data-tour="navigation" style={{ display: "none" }} /><button data-tour="navigation">Abrir navegação</button><Tour /></>);
  rerender(<QueryClientProvider client={cache}><MemoryRouter initialEntries={["/admin/planos"]}>
    <nav data-tour="navigation" style={{ display: "none" }} /><button data-tour="navigation">Abrir navegação</button><Tour /><div data-tour="courses">Curso carregado</div>
  </MemoryRouter></QueryClientProvider>);
  const launch = screen.getByRole("button", { name: "Guia desta tela" });
  fireEvent.click(launch);
  const panel = await screen.findByRole("complementary", { name: "Guia desta tela" });
  expect(screen.getByText("Passo 1 de 2")).toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole("button", { name: "Abrir navegação" })).toHaveClass("tour-target"));
  expect(document.querySelector("nav")).not.toHaveClass("tour-target");
  await waitFor(() => expect(panel).toHaveFocus());
  expect(within(panel).getByRole("button", { name: "Próximo passo" })).toHaveClass("primary");
  fireEvent.click(within(panel).getByRole("button", { name: "Pausar" }));
  await waitFor(() => expect(launch).toHaveFocus());
  expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  expect(document.querySelector(".tour-target")).toBeNull();
});

it("alinha a abertura ao alvo após rolagem e a remove quando o alvo desaparece", async () => {
  const { rerender } = show(<><Tour /><div data-tour="courses">Vitrine</div></>);
  const target = screen.getByText("Vitrine");
  const geometry = vi.spyOn(target, "getBoundingClientRect").mockReturnValue(new DOMRect(40, 100, 100, 80));
  vi.spyOn(target, "getClientRects").mockReturnValue([target.getBoundingClientRect()] as unknown as DOMRectList);
  vi.spyOn(document.documentElement, "clientWidth", "get").mockReturnValue(360);
  fireEvent.click(screen.getByRole("button", { name: "Guia desta tela" }));
  const panel = await screen.findByRole("complementary", { name: "Guia desta tela" });
  const hole = document.querySelector<HTMLElement>(".tour-spotlight")!;
  expect(hole).toHaveStyle({ left: "36px", top: "96px", width: "108px", height: "88px" });
  geometry.mockReturnValue(new DOMRect(-10, 70, 100, 80));
  fireEvent.scroll(window);
  await waitFor(() => expect(hole).toHaveStyle({ left: "0px", top: "66px", width: "94px" }));
  rerender(<QueryClientProvider client={cache}><MemoryRouter initialEntries={["/admin/planos"]}><Tour /></MemoryRouter></QueryClientProvider>);
  await waitFor(() => expect(document.querySelector(".tour-shade")).toBeNull());
  expect(within(panel).getByRole("heading", { name: "Conheça esta tela" })).toBeVisible();
  expect(within(panel).getByRole("button", { name: "Concluir" })).toBeEnabled();
});

it("o guia mantém o erro de leitura visível e não abre um painel fictício", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ message: "Indisponível" }), { status: 503, headers: { "Content-Type": "application/json" } })));
  show(<Tour />);
  fireEvent.click(screen.getByRole("button", { name: "Guia desta tela" }));
  await screen.findByRole("alert");
  expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Guia desta tela" })).toBeEnabled();
});

it("o guia destaca a busca do cabeçalho e depois o filtro do currículo no player", async () => {
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue([new DOMRect(0, 0, 44, 44)] as unknown as DOMRectList);
  show(<><header className="topbar"><Tour /></header><div data-tour="member-search">Busca rápida</div><div data-tour="curriculum">Conteúdos</div></>,
    "/app/cursos/curso/modulo/aula");
  fireEvent.click(screen.getByRole("button", { name: "Guia desta tela" }));
  const panel = await screen.findByRole("complementary", { name: "Guia desta tela" });
  expect(panel.parentElement).toBe(document.body);
  expect(within(panel).getByRole("heading", { name: "Encontre cursos, módulos e aulas" })).toBeVisible();
  await waitFor(() => expect(screen.getByText("Busca rápida")).toHaveClass("tour-target"));
  fireEvent.click(within(panel).getByRole("button", { name: "Próximo passo" }));
  expect(await within(panel).findByText(/Filtrar tópicos e aulas/)).toBeVisible();
  await waitFor(() => expect(screen.getByText("Conteúdos")).toHaveClass("tour-target"));
  expect(screen.getByText("Busca rápida")).not.toHaveClass("tour-target");
});

it("o guia de auditoria acompanha a paginação e fecha ao mudar de superfície", async () => {
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue([new DOMRect(0, 0, 44, 44)] as unknown as DOMRectList);
  show(
    <>
      <Tour />
      <section data-tour="admin-settings-audit">Eventos registrados</section>
      <Link to="?aba=auditoria&q=curso&page=2">Próxima página</Link>
      <Link to="?aba=integracoes&provedor=bunny">Bunny Stream</Link>
    </>,
    "/admin/configuracoes?aba=auditoria",
  );
  fireEvent.click(screen.getByRole("button", { name: "Guia desta tela" }));
  const panel = await screen.findByRole("complementary", { name: "Guia desta tela" });
  expect(within(panel).getByRole("link", { name: "Ajuda completa" })).toHaveAttribute("href", "/ajuda/privacidade-e-auditoria");
  await waitFor(() => expect(screen.getByText("Eventos registrados")).toHaveClass("tour-target"));
  fireEvent.click(screen.getByRole("link", { name: "Próxima página" }));
  expect(panel).toBeInTheDocument();
  fireEvent.click(screen.getByRole("link", { name: "Bunny Stream" }));
  await waitFor(() => expect(panel).not.toBeInTheDocument());
  expect(screen.getByText("Eventos registrados")).not.toHaveClass("tour-target");
});

it("abrir e fechar um editor abaixo de uma lista leva o foco à tarefa e retorna ao disparador sem gravar", async () => {
  show(<AdminPlans />);
  const trigger = screen.getByRole("button", { name: "Criar plano" });
  trigger.focus(); fireEvent.click(trigger);
  expect(screen.getByRole("heading", { name: "Criar plano" })).toHaveFocus();
  expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledWith({ block: "start" });
  fireEvent.click(screen.getByRole("button", { name: "Fechar editor" }));
  expect(trigger).toHaveFocus();
  expect(calls.some((url) => url.endsWith("/app_admin_save"))).toBe(false);
});

it("agrupa a ação secundária após o envio e bloqueia ambas durante a gravação", async () => {
  let finish!: () => void;
  const cancel = vi.fn();
  show(<Form label="Publicar" onSave={() => new Promise<void>((resolve) => { finish = resolve; })} secondaryAction={<button type="button" onClick={cancel}>Cancelar</button>}><input aria-label="Título" /></Form>);
  const primary = screen.getByRole("button", { name: "Publicar" }), secondary = screen.getByRole("button", { name: "Cancelar" });
  expect(primary.nextElementSibling).toBe(secondary);
  fireEvent.click(secondary); expect(cancel).toHaveBeenCalledOnce();
  fireEvent.submit(primary.closest("form")!);
  expect(primary).toBeDisabled(); expect(secondary).toBeDisabled();
  finish();
  await waitFor(() => expect(primary).toBeEnabled());
  expect(secondary).toBeEnabled();
});

it.each(["moderacao", "respostas", "denuncias"])("a aba %s da comunidade mantém um título principal e um título de seção", async (tab) => {
  show(<AdminCommunity />, "/admin/comunidade?aba=" + tab);
  expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(1);
});

it.each(["legal", "privacidade"])("a aba %s das configurações mantém um título principal", async (tab) => {
  show(<AdminSettings />, "/admin/configuracoes?aba=" + tab);
  expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(1);
});
