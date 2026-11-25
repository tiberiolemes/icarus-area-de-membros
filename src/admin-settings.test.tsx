import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MemoryRouter, useLocation } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
vi.hoisted(() => {
  vi.stubEnv("VITE_SUPABASE_URL", "http://127.0.0.1:58521");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-public-key");
});
import { cache } from "./api";
import { AdminCommunity, AdminCourses, AdminMaterials, AdminSettings } from "./pages/admin";

let page = { items: [] as Record<string, unknown>[], total: 0, page: 1, page_size: 20 };
let failing = false;
beforeEach(() => {
  cache.clear();
  page = { items: [], total: 0, page: 1, page_size: 20 };
  failing = false;
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
  vi.stubGlobal("fetch", vi.fn(async () => failing
    ? new Response(JSON.stringify({ message: "falha" }), { status: 500, headers: { "Content-Type": "application/json" } })
    : new Response(JSON.stringify(page), { status: 200, headers: { "Content-Type": "application/json" } })));
});
afterEach(() => { cleanup(); cache.clear(); vi.unstubAllGlobals(); });

function Where() {
  const { search } = useLocation();
  return <output data-testid="where">{search}</output>;
}
function show(tab: string, node = <AdminSettings />, path = "/admin/configuracoes?aba=" + tab) {
  return render(
    <QueryClientProvider client={cache}>
      <MemoryRouter initialEntries={[path]}>{node}<Where /></MemoryRouter>
    </QueryClientProvider>,
  );
}

const tabs = [
  ["onboarding", "Onboarding", "Onboarding dos membros"],
  ["marca", "Plataforma e marca", "Plataforma, marca e white label"],
  ["modulos", "Módulos", "Módulos da plataforma"],
  ["integracoes", "Gateway Asaas", "Gateway de pagamento Asaas"],
  ["legal", "Documentos legais", "Documentos legais"],
  ["equipe", "Equipe", "Equipe e controle de acesso"],
  ["auditoria", "Auditoria", "Trilha de auditoria"],
  ["privacidade", "Privacidade", "Solicitações de privacidade"],
] as const;

it.each(tabs)("a aba %s usa a página padrão de Configurações", (tab, crumb, title) => {
  const view = show(tab);
  const surface = view.container.querySelector(".admin-settings");
  expect(surface).toHaveAttribute("data-section", tab);
  expect(surface!.querySelector(".settings-breadcrumb")).toHaveTextContent(`AdministraçãoConfigurações${crumb}`);
  expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  expect(screen.getByRole("heading", { level: 1, name: title })).toBeInTheDocument();
  expect(surface!.querySelector(".page-heading p")?.textContent).toBeTruthy();
  const nav = screen.getByRole("navigation", { name: "Configurações da plataforma" });
  expect(within(nav).getAllByRole("link")).toHaveLength(tabs.length);
  expect(within(nav).getByRole("link", { current: "page" })).toHaveAttribute("href", expect.stringContaining("aba=" + (tab === "integracoes" ? "integracoes" : tab)));
});

it.each([["legal", "Documentos versionados"], ["privacidade", "Solicitações registradas"]])("a lista de %s fica num cartão, com vazio, busca e paginação que mantêm a aba", async (tab, list) => {
  const view = show(tab);
  const card = (await screen.findByRole("heading", { level: 2, name: list })).closest(".settings-panel");
  expect(card).not.toBeNull();
  expect(await within(card as HTMLElement).findByText("Nenhum registro cadastrado.")).toBeInTheDocument();
  fireEvent.change(within(card as HTMLElement).getByRole("searchbox"), { target: { value: "termos" } });
  fireEvent.submit(within(card as HTMLElement).getByRole("searchbox").closest("form")!);
  await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent(`?aba=${tab}&q=termos&page=1`));
  expect(view.container.querySelector(".admin-settings")).toHaveAttribute("data-section", tab);
});

it("a lista com falha mostra o erro dentro do cartão", async () => {
  failing = true;
  show("privacidade");
  const card = screen.getByRole("heading", { level: 2, name: "Solicitações registradas" }).closest(".settings-panel") as HTMLElement;
  expect(await within(card).findByRole("alert")).toBeInTheDocument();
});

it("Nova versão fica na ação principal e abre o editor de documento", async () => {
  show("legal");
  fireEvent.click(screen.getByRole("button", { name: "Nova versão" }));
  expect(await screen.findByRole("heading", { level: 2, name: "Criar documento" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Salvar documento" })).toBeInTheDocument();
});

it("Adicionar pergunta abre o editor do onboarding e o vazio fica no cartão", async () => {
  show("onboarding");
  const card = screen.getByRole("heading", { level: 2, name: "Perguntas do onboarding" }).closest(".settings-panel") as HTMLElement;
  expect(await within(card).findByText("Nenhuma pergunta cadastrada.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Adicionar pergunta" }));
  expect(await screen.findByRole("heading", { level: 2, name: "Criar pergunta" })).toBeInTheDocument();
});

it.each([
  ["Conteúdo", <AdminCourses />, "/admin/cursos", "AdministraçãoConteúdo", "Cursos e aulas", "Cursos", "Criar curso"],
  ["Materiais", <AdminMaterials />, "/admin/materiais", "AdministraçãoMateriais", "Materiais", "Arquivos", "Novo material"],
  ["Comunidade", <AdminCommunity />, "/admin/comunidade?aba=respostas", "AdministraçãoComunidadeRespostas", "Comunidade", "Fila de respostas", "Comentários de aula"],
] as const)("%s do painel usa a página padrão, com a lista em cartão e a busca que mantém os filtros", async (_name, node, path, trail, title, list, action) => {
  const view = show("", node, path);
  const surface = view.container.querySelector(".admin-settings");
  expect(surface!.querySelector(".settings-breadcrumb")).toHaveTextContent(trail);
  expect(screen.getByRole("heading", { level: 1, name: title })).toBeInTheDocument();
  expect(surface!.querySelector(".page-heading p")?.textContent).toBeTruthy();
  expect(within(surface!.querySelector(".page-heading") as HTMLElement).getByRole(action === "Comentários de aula" || action === "Criar curso" ? "link" : "button", { name: action })).toBeInTheDocument();
  const card = (await screen.findByRole("heading", { level: 2, name: list })).closest(".settings-panel") as HTMLElement;
  expect(await within(card).findByText("Nenhum registro cadastrado.")).toBeInTheDocument();
  fireEvent.change(within(card).getByRole("searchbox"), { target: { value: "termo" } });
  fireEvent.submit(within(card).getByRole("searchbox").closest("form")!);
  await waitFor(() => expect(screen.getByTestId("where").textContent).toContain("q=termo&page=1"));
  if (path.includes("aba=")) expect(screen.getByTestId("where")).toHaveTextContent("aba=respostas");
});

it("as abas da Comunidade são links e mantêm a página padrão", () => {
  show("", <AdminCommunity />, "/admin/comunidade");
  const tabs = screen.getByRole("navigation", { name: "Administração da comunidade" });
  expect(within(tabs).getByRole("link", { current: "page" })).toHaveTextContent("Publicações");
  expect(within(tabs).getByRole("link", { name: "Espaços" })).toHaveAttribute("href", "/admin/comunidade?aba=espacos");
});

it("Materiais cria pasta e material e lista as pastas em cartão", async () => {
  show("", <AdminMaterials />, "/admin/materiais");
  const folders = screen.getByRole("heading", { level: 2, name: "Pastas" }).closest(".settings-panel") as HTMLElement;
  expect(await within(folders).findByText("Nenhuma pasta cadastrada.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Nova pasta" }));
  expect(await screen.findByRole("heading", { level: 2, name: "Criar pasta" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Novo material" }));
  expect(await screen.findByRole("heading", { level: 2, name: "Criar material" })).toBeInTheDocument();
});

it("Espaços da Comunidade ficam num cartão com Criar espaço", async () => {
  show("", <AdminCommunity />, "/admin/comunidade?aba=espacos");
  const card = screen.getByRole("heading", { level: 2, name: "Espaços" }).closest(".settings-panel") as HTMLElement;
  expect(await within(card).findByText("Nenhum espaço cadastrado.")).toBeInTheDocument();
  fireEvent.click(within(card).getByRole("button", { name: "Criar espaço" }));
  expect(await screen.findByRole("heading", { level: 2, name: "Criar espaço" })).toBeInTheDocument();
});
