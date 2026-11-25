import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Shell } from "./shell";
import { NotificationHistory } from "./pages/notifications";

const { profile, settings, refetch, rpc, edge, signOut } = vi.hoisted(() => ({
  profile: { id: "member-1", full_name: "Pessoa Teste", plan_name: "Plano ativo", role: "member", theme: undefined as string | undefined, avatar_id: undefined as string | undefined },
  settings: { name: "Icarus" },
  refetch: vi.fn(),
  rpc: vi.fn(),
  edge: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock("./api", async (importOriginal) => ({
  ...await importOriginal<typeof import("./api")>(), rpc, edge, signOut,
}));
vi.mock("./auth", () => ({ useBootstrap: () => ({ data: { profile, settings }, refetch }) }));
vi.mock("./tour", () => ({ Tour: () => <button>Guia desta tela</button> }));
vi.mock("./update-notice", () => ({ UpdateNotice: () => <p>Aviso de versão nova</p> }));

function CurrentRoute() {
  const { pathname, search } = useLocation();
  return <h1 tabIndex={-1}>{pathname}{search}</h1>;
}

function mount(path: string) {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={cache}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<Shell />}>
            <Route path="/app/notificacoes" element={<NotificationHistory memberId={profile.id} />} />
            <Route path="*" element={<CurrentRoute />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  settings.name = "Icarus";
  profile.full_name = "Pessoa Teste";
  profile.role = "member";
  profile.plan_name = "Plano ativo";
  profile.theme = undefined;
  profile.avatar_id = undefined;
  rpc.mockReset();
  rpc.mockResolvedValue({ items: [], page: 1, page_size: 20, total: 0, unread_count: 0 });
  edge.mockReset();
  refetch.mockReset();
  signOut.mockReset();
  vi.stubGlobal("scrollTo", vi.fn());
});
afterEach(() => {
  delete document.documentElement.dataset.theme;
  vi.unstubAllGlobals();
});

it.each([
  ["/app/comunidade/post", " Alex  de Vance ", "AV"],
  ["/app/comunidade/post", "élodie", "É"],
  ["/app/comunidade/post", "", "I"],
  ["/app/comunidade", "Alex Vance", "A"],
  ["/app/comunidade/novo", "Alex Vance", "A"],
  ["/app/comunidade/post/editar", "Alex Vance", "A"],
])("mantém o nome acessível e o fallback de %s para %s", (path, fullName, initials) => {
  profile.full_name = fullName;
  mount(path);
  const name = fullName.trim().replace(/\s+/g, " ") || "Membro";
  const account = screen.getByRole("link", { name: `Sua conta: ${name}` });
  expect(within(account).getByText(initials)).toHaveAttribute("aria-hidden", "true");
  expect(edge).not.toHaveBeenCalled();
});

it("mantém a foto privada da conta no thread e volta às iniciais quando ela falha", async () => {
  profile.full_name = "Alex Vance";
  profile.avatar_id = "avatar-1";
  edge.mockResolvedValue({ url: "https://media.example.test/signed-avatar", expires_at: "2030-01-01" });
  mount("/app/comunidade/post");
  const account = screen.getByRole("link", { name: "Sua conta: Alex Vance" });
  const photo = await within(account).findByAltText("");
  expect(edge).toHaveBeenCalledExactlyOnceWith("media", { kind: "avatar", id: "avatar-1" });
  expect(photo).toHaveAttribute("src", "https://media.example.test/signed-avatar");
  expect(photo).toHaveAttribute("referrerpolicy", "no-referrer");
  expect(photo).not.toBeVisible();
  fireEvent.load(photo);
  expect(photo).toBeVisible();
  fireEvent.error(photo);
  expect(photo).not.toBeVisible();
  expect(within(account).getByText("AV")).toBeVisible();
});

it("monta a busca no player e preserva o termo ao abrir o catálogo pela SPA", async () => {
  mount("/app/cursos/curso/modulo/aula");
  expect(screen.getByRole("link", { name: "Cursos" })).toHaveAttribute("aria-current", "page");
  expect(screen.getByRole("link", { name: "Voltar ao módulo" })).toHaveAttribute("href", "/app/cursos/curso/modulo");
  expect(screen.queryByRole("navigation", { name: "Navegação rápida" })).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Sua conta: Pessoa Teste" })).toHaveAttribute("href", "/app/configuracoes");
  expect(within(screen.getByRole("banner")).getByTitle("Plano ativo")).toHaveTextContent("Plano ativo");
  expect(screen.getByRole("button", { name: "Guia desta tela" })).toBeVisible();
  const search = screen.getByRole("searchbox", { name: "Busca rápida em aulas e módulos" });
  fireEvent.keyDown(window, { key: "k", ctrlKey: true });
  expect(search).toHaveFocus();
  fireEvent.change(search, { target: { value: "  preço & valor  " } });
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("/app/cursos/curso/modulo/aula");
  fireEvent.click(screen.getByRole("link", { name: "Buscar no catálogo" }));
  const heading = screen.getByRole("heading", { level: 1 });
  expect(heading).toHaveTextContent("/app/cursos?q=pre%C3%A7o+%26+valor&page=1");
  await waitFor(() => expect(heading).toHaveFocus());
  expect(screen.getByRole("searchbox")).toHaveValue("preço & valor");
  expect(screen.queryByRole("link", { name: "Buscar no catálogo" })).not.toBeInTheDocument();
});

it.each([["/app/cursos", "Cursos"], ["/app/comunidade", "Comunidade"]])(
  "indica a seção atual em %s e navega pelos destinos reais da barra",
  async (path, label) => {
    mount(path);
    const nav = within(screen.getByRole("navigation", { name: "Navegação rápida" }));
    expect(nav.getByRole("link", { name: label, current: "page" })).toHaveAttribute("href", path);
    expect(nav.getAllByRole("link").map(link => link.getAttribute("href"))).toEqual([
      "/app/cursos", "/app/comunidade", "/app/ranking", "/app/materiais", "/app/configuracoes",
    ]);
    fireEvent.click(nav.getByRole("link", { name: label === "Cursos" ? "Comunidade" : "Cursos" }));
    await waitFor(() => expect(screen.getByRole("heading", { level: 1 })).toHaveFocus());
    expect(nav.getByRole("link", { current: "page" })).not.toHaveTextContent(label);
  },
);

it.each(["/app/cursos", "/app/comunidade"])("abre Podcasts pelo atalho escuro em %s", async (path) => {
  profile.theme = "dark";
  mount(path);
  const nav = within(screen.getByRole("navigation", { name: "Navegação rápida" }));
  expect(nav.getAllByRole("link").map(link => link.getAttribute("href"))).toEqual([
    "/app/cursos", "/app/comunidade", "/app/podcasts", "/app/ranking", "/app/configuracoes",
  ]);
  fireEvent.click(nav.getByRole("link", { name: "Podcasts" }));
  const heading = screen.getByRole("heading", { name: "/app/podcasts" });
  await waitFor(() => expect(heading).toHaveFocus());
  expect(screen.queryByRole("navigation", { name: "Navegação rápida" })).not.toBeInTheDocument();
});

it("abre o Ranking real pela barra e mantém Materiais na gaveta escura", async () => {
  profile.theme = "dark";
  mount("/app/cursos");
  const menu = screen.getByRole("button", { name: "Abrir navegação" });
  fireEvent.click(menu);
  const drawer = within(screen.getByRole("dialog", { name: "Navegação" }));
  expect(drawer.getByRole("link", { name: "Materiais" })).toHaveAttribute("href", "/app/materiais");
  fireEvent.click(drawer.getByRole("button", { name: "Fechar navegação" }));
  await waitFor(() => expect(menu).toHaveFocus());

  const quickNav = within(screen.getByRole("navigation", { name: "Navegação rápida" }));
  const ranking = quickNav.getByRole("link", { name: "Ranking" });
  expect(ranking).toHaveAttribute("href", "/app/ranking");
  fireEvent.click(ranking);
  await waitFor(() => expect(screen.getByRole("heading", { name: "/app/ranking" })).toHaveFocus());
});

it("suspende a busca durante a gaveta, devolve foco no Escape e mantém a ação de saída", async () => {
  mount("/app/comunidade");
  fireEvent.keyDown(window, { key: "k", ctrlKey: true });
  expect(screen.getByRole("link", { name: "Abrir catálogo" })).toBeVisible();
  const trigger = screen.getByRole("button", { name: "Abrir navegação" });
  fireEvent.click(trigger);
  const drawer = screen.getByRole("dialog", { name: "Navegação" });
  expect(screen.queryByText("Digite pelo menos 2 caracteres.")).not.toBeInTheDocument();
  expect(within(drawer).getByRole("link", { name: "Comunidade" })).toHaveAttribute("aria-current", "page");
  const focusedInDrawer = document.activeElement!;
  expect(within(drawer).getByRole("button", { name: "Fechar navegação" })).toHaveFocus();
  fireEvent.keyDown(focusedInDrawer, { key: "k", ctrlKey: true });
  expect(focusedInDrawer).toHaveFocus();
  fireEvent.keyDown(drawer, { key: "Escape" });
  await waitFor(() => expect(drawer).not.toBeInTheDocument());
  await waitFor(() => expect(trigger).toHaveFocus());
  fireEvent.keyDown(trigger, { key: "k", ctrlKey: true });
  expect(screen.getByRole("searchbox")).toHaveFocus();
  fireEvent.click(screen.getByRole("button", { name: "Sair" }));
  await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
});

it("inicia em claro e salva a preferência pelo mesmo RPC das configurações", async () => {
  const mounted = mount("/app/cursos");
  expect(document.documentElement).toHaveAttribute("data-theme", "light");
  fireEvent.click(screen.getByRole("button", { name: /Tema claro.*Mudar para tema escuro/i }));
  await waitFor(() => expect(refetch).toHaveBeenCalledTimes(1));
  expect(rpc).toHaveBeenCalledWith("app_profile", { p_data: { theme: "dark" } });
  mounted.unmount();
  profile.theme = "dark";
  mount("/app/cursos");
  expect(document.documentElement).toHaveAttribute("data-theme", "dark");
});

it("mostra erro de gravação e mantém a aparência confirmada", async () => {
  rpc.mockRejectedValue(new Error("Falha ao salvar a preferência."));
  mount("/app/suporte");
  fireEvent.click(screen.getByRole("button", { name: /Mudar para tema escuro/i }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Falha ao salvar a preferência.");
  expect(document.documentElement).toHaveAttribute("data-theme", "light");
  expect(refetch).not.toHaveBeenCalled();
});

it.each([
  ["admin", "Administração", "/admin/cursos"],
  ["member", "Cursos", "/app/cursos"],
  ["instructor", "Painel de conteúdo", "/admin/cursos"],
  ["moderator", "Moderação", "/admin/comunidade"],
  ["support", "Atendimento", "/admin/suporte"],
])("mostra a entrada adequada ao papel %s na área de membros", (role, label, path) => {
  profile.role = role;
  mount("/app/cursos");
  const sidebar = screen.getByRole("complementary");
  const menu = within(sidebar).getByRole("navigation", { name: "Área de membros" });
  expect(within(menu).getAllByRole("link")[0]).toHaveAccessibleName(label);
  expect(within(menu).getAllByRole("link")[0]).toHaveAttribute("href", path);

  fireEvent.click(screen.getByRole("button", { name: "Abrir navegação" }));
  const drawer = screen.getByRole("dialog", { name: "Navegação" });
  expect(within(drawer).getByRole("link", { name: label })).toHaveAttribute("href", path);

  if (role !== "admin") {
    expect(within(menu).queryByRole("link", { name: "Administração" })).toBeNull();
    expect(within(drawer).queryByRole("link", { name: "Administração" })).toBeNull();
  }
});

it.each([
  ["support", "/admin/suporte", "Suporte", ["/admin/suporte"]],
  ["moderator", "/admin/comunidade", "Moderador", ["/admin/comunidade"]],
  ["instructor", "/admin/cursos", "Instrutor", ["/admin/cursos", "/admin/materiais"]],
] as const)("mantém o menu e a identidade administrativos para %s", (role, path, label, destinations) => {
  profile.role = role;
  mount(path);
  const nav = screen.getByRole("navigation", { name: "Administração" });
  expect(within(nav).getAllByRole("link").map(link => link.getAttribute("href"))).toEqual(destinations);
  expect(within(nav).getByRole("link", { current: "page" })).toHaveAttribute("href", path);
  const account = screen.getByRole("link", { name: "Sua conta: Pessoa Teste" });
  expect(within(account).getByText(label)).toBeVisible();
  expect(within(account).queryByText("Plano ativo")).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Área do aluno" })).toHaveAttribute("href", "/app/cursos");
  expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /^Notificações/ })).not.toBeInTheDocument();
  expect(rpc).not.toHaveBeenCalled();
});

it("abre o histórico do sino do aluno e direciona o foco ao título", async () => {
  mount("/app/cursos/curso/modulo/aula");
  const bell = screen.getByRole("button", { name: "Notificações" });
  const account = screen.getByRole("link", { name: "Sua conta: Pessoa Teste" });
  expect(bell.nextElementSibling).toBe(account);
  fireEvent.click(bell);
  const dropdown = screen.getByRole("dialog", { name: "Notificações" });
  fireEvent.click(within(dropdown).getByRole("link", { name: "Ver todas as notificações" }));
  await waitFor(() => expect(screen.getByRole("heading", { level: 1, name: "Notificações" })).toHaveFocus());
  expect(dropdown).not.toBeInTheDocument();
  expect(rpc).toHaveBeenCalledWith("app_notifications", { p_page: 1 });
});

it("exibe o nome publicado nos dois espaços da marca do membro", () => {
  settings.name = "Academia de teste";
  mount("/app/cursos");
  expect(screen.getByRole("link", { name: "Academia de teste" })).toBeInTheDocument();
  expect(screen.getAllByText("Academia de teste")).toHaveLength(2);
  expect(screen.queryByRole("img", { name: "Icarus" })).not.toBeInTheDocument();
});

it("usa o nome personalizado na lateral e no topo móvel da administração", () => {
  profile.role = "admin";
  settings.name = "Plataforma de teste";
  mount("/admin/cursos");
  expect(screen.getAllByText("Plataforma de teste")).toHaveLength(2);
  expect(screen.queryByRole("img", { name: "Icarus" })).not.toBeInTheDocument();
});

it.each([
  ["admin", "/admin/cursos", true],
  ["admin", "/app/cursos", false],
  ["instructor", "/admin/cursos", false],
  ["support", "/admin/suporte", false],
])("mostra o aviso de versão nova só para %s no painel (%s)", (role, path, shown) => {
  profile.role = role;
  mount(path);
  expect(screen.queryByText("Aviso de versão nova") !== null).toBe(shown);
});

function adminBadge(scope: HTMLElement) {
  const badge = within(scope).getByText("Admin").closest(".admin-badge");
  expect(badge).not.toBeNull();
  expect(badge!.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  return badge;
}

it.each(["", "Membro Pro"])("mostra só a badge Admin no cartão do admin com plano \"%s\"", (plan) => {
  profile.role = "admin";
  profile.plan_name = plan;
  const { container } = mount("/app/cursos");
  const account = screen.getByRole("link", { name: "Sua conta: Pessoa Teste" });
  adminBadge(account);
  expect(within(account).queryByText("Sem plano ativo")).not.toBeInTheDocument();
  if (plan) expect(within(account).queryByText(plan)).not.toBeInTheDocument();
  adminBadge(container.querySelector<HTMLElement>(".mobile-frame-label")!);
  fireEvent.click(screen.getByRole("button", { name: "Abrir navegação" }));
  adminBadge(screen.getByRole("dialog", { name: "Navegação" }));
  expect(within(screen.getByRole("dialog", { name: "Navegação" })).queryByText("Sem plano ativo")).not.toBeInTheDocument();
});

it("troca o papel por extenso pela badge Admin no painel e mantém os outros papéis", () => {
  profile.role = "admin";
  mount("/admin/cursos");
  const account = screen.getByRole("link", { name: "Sua conta: Pessoa Teste" });
  adminBadge(account);
  expect(within(account).queryByText("Administrador")).not.toBeInTheDocument();
});

it("mantém o texto do papel para instrutor no painel, sem badge Admin", () => {
  profile.role = "instructor";
  const { container } = mount("/admin/cursos");
  expect(within(screen.getByRole("link", { name: "Sua conta: Pessoa Teste" })).getByText("Instrutor")).toBeInTheDocument();
  expect(container.querySelector(".admin-badge")).toBeNull();
});

it.each([
  ["Membro Pro", "Membro Pro"],
  ["", "Sem plano ativo"],
])("mantém o plano \"%s\" do membro sem badge Admin", (plan, shown) => {
  profile.plan_name = plan;
  const { container } = mount("/app/cursos");
  expect(within(screen.getByRole("link", { name: "Sua conta: Pessoa Teste" })).getByText(shown)).toBeInTheDocument();
  expect(container.querySelector(".admin-badge")).toBeNull();
  expect(screen.queryByText("Admin")).not.toBeInTheDocument();
});
