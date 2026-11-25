import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { Shell } from "./shell";
import { AdminSettings } from "./pages/admin";
import { Help } from "./pages/help";
import { Ranking } from "./pages/ranking";
import { NotificationHistory } from "./pages/notifications";
import { moduleOfPath, modules as moduleList, readModules } from "./modules";

vi.hoisted(() => {
  vi.stubEnv("VITE_SUPABASE_URL", "http://127.0.0.1:58521");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-public-key");
});

const { profile, settings, refetch, rpc } = vi.hoisted(() => ({
  profile: { id: "member-1", full_name: "Pessoa Teste", plan_name: "Plano ativo", role: "member", theme: undefined as string | undefined },
  settings: { name: "Icarus", modules: {} as Record<string, boolean> },
  refetch: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("./api", async (importOriginal) => ({ ...await importOriginal<typeof import("./api")>(), rpc, edge: vi.fn(), signOut: vi.fn() }));
vi.mock("./auth", () => ({
  useAuth: () => ({ session: null, loading: false }),
  useBootstrap: () => ({ data: { profile, settings }, refetch, isFetching: false }),
}));
vi.mock("./tour", () => ({ Tour: () => <button>Guia desta tela</button> }));
vi.mock("./update-notice", () => ({ UpdateNotice: () => null }));

const allOff = Object.fromEntries(moduleList.map(({ key }) => [key, false]));

function mount(path: string, node = <Shell />, cache = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  return render(
    <QueryClientProvider client={cache}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={node}>
            <Route path="*" element={<p>Conteúdo da rota</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  settings.modules = {};
  profile.role = "member";
  profile.theme = undefined;
  rpc.mockReset();
  rpc.mockResolvedValue({ items: [], page: 1, page_size: 20, total: 0, unread_count: 0 });
  refetch.mockReset();
  refetch.mockResolvedValue({});
  vi.stubGlobal("scrollTo", vi.fn());
});

it("liga tudo quando o servidor não envia os módulos e mapeia cada rota ao seu módulo", () => {
  expect(Object.values(readModules(undefined)).every(Boolean)).toBe(true);
  expect(readModules({ ranking: false }).ranking).toBe(false);
  expect(readModules({ ranking: "false" }).ranking).toBe(true);
  expect(moduleOfPath("/app/comunidade/abc/editar")).toBe("community");
  expect(moduleOfPath("/admin/encontros")).toBe("live_events");
  expect(moduleOfPath("/app/encontros-ao-vivo")).toBe("live_events");
  expect(moduleOfPath("/admin/feedbacks")).toBe("feedback");
  expect(moduleOfPath("/ajuda/cursos")).toBe("help");
  expect(moduleOfPath("/app/cursos/curso")).toBeUndefined();
  expect(moduleOfPath("/app/notificacoes")).toBeUndefined();
});

it("com os módulos desligados, o aluno não vê menu, atalhos nem feedback, e a rota mostra indisponível", () => {
  settings.modules = allOff;
  mount("/app/comunidade");
  const menu = screen.getByRole("navigation", { name: "Área de membros" });
  // Cursos e Certificados são o núcleo e não desligam.
  expect(within(menu).getByRole("link", { name: "Cursos" })).toBeInTheDocument();
  expect(within(menu).getByRole("link", { name: "Certificados" })).toBeInTheDocument();
  for (const name of ["Comunidade", "Materiais", "Podcasts", "Ranking", "Encontros ao vivo", "Suporte", "Central de ajuda"])
    expect(within(menu).queryByRole("link", { name })).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Recurso indisponível" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Voltar aos cursos" })).toHaveAttribute("href", "/app/cursos");
  expect(screen.queryByText("Conteúdo da rota")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Enviar feedback/ })).not.toBeInTheDocument();
  const quick = screen.getByRole("navigation", { name: "Navegação rápida" });
  for (const name of ["Comunidade", "Ranking", "Materiais"]) expect(within(quick).queryByRole("link", { name })).not.toBeInTheDocument();
  expect(within(quick).getByRole("link", { name: "Cursos" })).toBeInTheDocument();
});

it("religar devolve o menu, os atalhos e a rota", () => {
  mount("/app/comunidade");
  const menu = screen.getByRole("navigation", { name: "Área de membros" });
  for (const name of ["Cursos", "Comunidade", "Materiais", "Podcasts", "Certificados", "Ranking", "Encontros ao vivo", "Suporte", "Central de ajuda"])
    expect(within(menu).getByRole("link", { name })).toBeInTheDocument();
  expect(screen.getByText("Conteúdo da rota")).toBeInTheDocument();
  expect(within(screen.getByRole("navigation", { name: "Navegação rápida" })).getByRole("link", { name: "Ranking" })).toBeInTheDocument();
});

it("o admin continua no painel do módulo desligado, com selo e aviso", () => {
  profile.role = "admin";
  settings.modules = { community: false };
  mount("/admin/comunidade");
  const menu = screen.getByRole("navigation", { name: "Administração" });
  expect(within(menu).getByRole("link", { name: "Comunidade Desativado" })).toHaveAttribute("href", "/admin/comunidade");
  expect(within(menu).getByRole("link", { name: "Suporte" })).toBeInTheDocument();
  expect(screen.getByText("O módulo Comunidade está desativado.")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Configurações > Módulos" })).toHaveAttribute("href", "/admin/configuracoes?aba=modulos");
  expect(screen.getByText("Conteúdo da rota")).toBeInTheDocument();
});

it("a aba Módulos liga e desliga por AJAX e avisa a falha", async () => {
  profile.role = "admin";
  settings.modules = { ranking: false };
  rpc.mockResolvedValueOnce({ ranking: true });
  mount("/admin/configuracoes?aba=modulos", <AdminSettings />);
  expect(screen.getByRole("heading", { level: 1, name: "Módulos da plataforma" })).toBeInTheDocument();
  expect(screen.getAllByText("Sempre ativo")).toHaveLength(2);
  expect(screen.getByRole("heading", { level: 3, name: "Certificados" })).toBeInTheDocument();
  expect(screen.queryByRole("switch", { name: "Certificados" })).not.toBeInTheDocument();
  expect(screen.queryByRole("switch", { name: "Cursos" })).not.toBeInTheDocument();
  expect(screen.getAllByRole("switch")).toHaveLength(8);
  const ranking = screen.getByRole("switch", { name: "Ranking" });
  expect(ranking).toHaveAttribute("aria-checked", "false");
  expect(ranking).toHaveAccessibleDescription(/Os pontos continuam registrados/);
  fireEvent.click(ranking);
  await waitFor(() => expect(rpc).toHaveBeenCalledWith("app_admin_set_module", { p_key: "ranking", p_enabled: true }));
  await waitFor(() => expect(refetch).toHaveBeenCalled());
  expect(await screen.findByText("Módulo Ranking ligado.")).toBeInTheDocument();

  rpc.mockRejectedValueOnce(new Error("Confirme o segundo fator para continuar."));
  fireEvent.click(screen.getByRole("switch", { name: "Comunidade" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível desligar o módulo Comunidade. Confirme o segundo fator para continuar.");
});

it("a Central de ajuda desligada fica indisponível para o aluno e esconde artigos de módulos desligados da equipe", () => {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  cache.setQueryData(["app_public_context", {}], { name: "Icarus", modules: { help: false, podcasts: false } });
  const view = mount("/ajuda", <Help />, cache);
  expect(screen.getByRole("heading", { name: "Recurso indisponível" })).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Central de ajuda" })).not.toBeInTheDocument();
  view.unmount();

  profile.role = "support";
  mount("/ajuda", <Help />, cache);
  expect(screen.getByText(/A Central de ajuda está desativada para os alunos/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Cadastre conteúdo e opere as filas" })).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Assista e publique podcasts e masterclasses" })).not.toBeInTheDocument();
});

it("o Ranking esconde as regras de comunidade com ela desligada e mantém as de aula e certificado", async () => {
  settings.modules = { community: false };
  rpc.mockResolvedValue({ starts_at: null, ends_at: null, time_zone: "America/Sao_Paulo", prizes: null,
    rules: { post: 10, reply: 5, like: 1, lesson: 3, certificate: 20 }, podium: [], own: { status: "unranked" }, items: [], page: 1, total: 0 });
  mount("/app/ranking", <><Ranking memberId={profile.id} /></>);
  const rules = await screen.findByRole("heading", { name: "Regras de pontuação" });
  const list = rules.parentElement!;
  expect(within(list).getByText("Aula concluída")).toBeInTheDocument();
  expect(within(list).getByText("Certificado emitido")).toBeInTheDocument();
  for (const name of ["Post aprovado", "Resposta aprovada", "Curtida recebida em post"])
    expect(within(list).queryByText(name)).not.toBeInTheDocument();
});

it("aviso antigo de um módulo desligado continua no histórico, sem o botão para a tela indisponível", async () => {
  settings.modules = { materials: false };
  rpc.mockResolvedValue({ items: [
    { id: "n1", event_key: "material_published", title: "Material novo", subtitle: "Pasta", created_at: "2026-11-20T12:00:00Z", read_at: null, action_path: "/app/materiais" },
    { id: "n2", event_key: "lesson_comment_approved", title: "Comentário aprovado", subtitle: "Aula", created_at: "2026-11-20T12:00:00Z", read_at: null, action_path: "/app/cursos/curso" },
  ], page: 1, page_size: 20, total: 2, unread_count: 2 });
  mount("/app/notificacoes", <NotificationHistory memberId={profile.id} />);
  expect(await screen.findByText("Material novo")).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: /Ver materiais/ })).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Ver curso/ })).toHaveAttribute("href", "/app/cursos/curso");
});
