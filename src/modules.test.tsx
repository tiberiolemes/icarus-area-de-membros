import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { Shell } from "./shell";
import { AdminSettings } from "./pages/admin";
import { Settings } from "./pages/settings";
import { Help } from "./pages/help";
import { Ranking } from "./pages/ranking";
import { NotificationHistory } from "./pages/notifications";
import { helpPathFor } from "./pages/help-paths";
import { moduleOfPath, modules as moduleList, readModules } from "./modules";

vi.hoisted(() => {
  vi.stubEnv("VITE_SUPABASE_URL", "http://127.0.0.1:58521");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-public-key");
});

const { profile, settings, plans, refetch, rpc } = vi.hoisted(() => ({
  profile: { id: "member-1", full_name: "Pessoa Teste", plan_name: "Plano ativo", current_plan_id: null as string | null, role: "member", theme: undefined as string | undefined },
  settings: { name: "Icarus", modules: {} as Record<string, boolean> },
  plans: [] as { id: string; slug: string; name: string; active: boolean; price_cents: number; access_months: number; benefits: string[] }[],
  refetch: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("./api", async (importOriginal) => ({ ...await importOriginal<typeof import("./api")>(), rpc, edge: vi.fn(), signOut: vi.fn() }));
vi.mock("./auth", () => ({
  useAuth: () => ({ session: null, loading: false }),
  useBootstrap: () => ({ data: { profile, settings, plans }, refetch, isFetching: false }),
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
  profile.current_plan_id = null;
  plans.length = 0;
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
  const links = within(menu).getAllByRole("link");
  for (const name of ["Cursos", "Comunidade", "Materiais", "Podcasts", "Certificados", "Ranking", "Encontros ao vivo", "Suporte", "Central de ajuda"]) {
    const link = links.find((item) => item.textContent?.trim() === name);
    expect(link).toHaveAccessibleName(name);
  }
  expect(screen.getByText("Conteúdo da rota")).toBeInTheDocument();
  expect(within(screen.getByRole("navigation", { name: "Navegação rápida" })).getByRole("link", { name: "Ranking" })).toBeInTheDocument();
});

it("o admin continua no painel do módulo desligado, com selo e aviso", () => {
  profile.role = "admin";
  settings.modules = { community: false };
  mount("/admin/comunidade");
  const menu = screen.getByRole("navigation", { name: "Administração" });
  const community = menu.querySelector('a[href="/admin/comunidade"]');
  expect(community).toBeVisible();
  expect(community).toHaveAccessibleName("Comunidade Desativado");
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

it("a Central de ajuda desligada fica indisponível para o aluno, e a equipe segue vendo os artigos do painel", () => {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  cache.setQueryData(["app_public_context", {}], { name: "Icarus", modules: { help: false, podcasts: false } });
  const view = mount("/ajuda", <Help />, cache);
  expect(screen.getByRole("heading", { name: "Recurso indisponível" })).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Central de ajuda" })).not.toBeInTheDocument();
  view.unmount();

  profile.role = "support";
  settings.modules = { help: false, podcasts: false };
  const home = mount("/app/ajuda", <Help member />, cache);
  expect(screen.getByText(/A Central de ajuda está desativada para os alunos/)).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Para a equipe" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Integrações" })).toHaveAttribute("href", "/app/ajuda?categoria=integracoes");
  home.unmount();

  // Com Podcasts desligado, o artigo do aluno some e o do painel continua, porque a equipe ainda prepara episódios.
  const student = mount("/app/ajuda?categoria=comunidade-e-eventos", <Help member />, cache);
  expect(screen.getByRole("link", { name: "Participar dos encontros ao vivo" })).toBeVisible();
  expect(screen.queryByRole("link", { name: "Assistir a podcasts e masterclasses" })).not.toBeInTheDocument();
  student.unmount();
  mount("/app/ajuda?categoria=conteudo", <Help member />, cache);
  expect(screen.getByRole("link", { name: "Publicar podcasts e masterclasses" })).toHaveAttribute("href", "/app/ajuda/administracao-podcasts");
});

it("o aluno vê só os assuntos dele, e artigo da equipe aberto pelo endereço não aparece", () => {
  const home = mount("/app/ajuda", <Help member />);
  expect(screen.getByRole("link", { name: "Primeiros passos" })).toHaveAttribute("href", "/app/ajuda?categoria=primeiros-passos");
  expect(screen.queryByRole("heading", { name: "Para a equipe" })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Integrações" })).not.toBeInTheDocument();
  home.unmount();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={["/app/ajuda/integracao-asaas"]}>
        <Routes><Route path="/app/ajuda/:artigo" element={<Help member />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  expect(screen.getByRole("heading", { name: "Artigo não encontrado" })).toBeVisible();
  expect(screen.queryByText(/Chave de API/)).not.toBeInTheDocument();
});

it("o artigo de integração mostra passos, imagem com descrição e links para os outros artigos", () => {
  profile.role = "admin";
  settings.modules = { support: false };
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={["/app/ajuda/integracao-asaas"]}>
        <Routes><Route path="/app/ajuda/:artigo" element={<Help member />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  expect(screen.getByRole("heading", { level: 1, name: "Receber pagamentos com o Asaas" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "Antes de começar" })).toBeVisible();
  const menu = screen.getByRole("img", { name: /menu do usuário aberto/ });
  expect(menu).toHaveAttribute("loading", "lazy");
  expect(menu.closest("a")).toHaveAttribute("target", "_blank");
  expect(screen.getAllByText("CHECKOUT_PAID", { selector: "strong" })[0]).toBeVisible();
  expect(screen.getAllByRole("link", { name: "verificação em duas etapas" })[0]).toHaveAttribute("href", "/app/ajuda/verificacao-em-duas-etapas");
  expect(screen.getByRole("link", { name: "Integrações" })).toHaveAttribute("href", "/app/ajuda?categoria=integracoes");
  expect(screen.queryByRole("link", { name: "Preciso de suporte" })).not.toBeInTheDocument();
});

it("cada aba de Configurações, no painel e na conta, abre o artigo que explica aquela aba", () => {
  // As abas vêm da tela: aba nova ou renomeada muda esta lista e pede a escolha do artigo dela.
  const articleByTab = (label: string) => Object.fromEntries(
    within(screen.getByRole("navigation", { name: label })).getAllByRole("link").map((link) => {
      const url = new URL(link.getAttribute("href")!, "http://icarus.test");
      return [url.searchParams.get("aba") ?? "", helpPathFor(url.pathname, url.search)];
    }));
  profile.role = "admin";
  const panel = mount("/admin/configuracoes?aba=modulos", <AdminSettings />);
  expect(articleByTab("Configurações da plataforma")).toEqual({
    onboarding: "/ajuda/perguntas-do-primeiro-acesso", marca: "/ajuda/marca-da-plataforma", certificado: "/ajuda/certificado-do-curso", modulos: "/ajuda/modulos",
    integracoes: "/ajuda/integracao-asaas", legal: "/ajuda/documentos-legais", equipe: "/ajuda/equipe-e-papeis",
    auditoria: "/ajuda/privacidade-e-auditoria", privacidade: "/ajuda/privacidade-e-auditoria",
  });
  panel.unmount();
  profile.role = "member";
  mount("/app/configuracoes?aba=assinatura", <Settings />);
  expect(articleByTab("Configurações")).toEqual({
    perfil: "/ajuda/conta", empresa: "/ajuda/conta", notificacoes: "/ajuda/notificacoes", assinatura: "/ajuda/assinatura",
    seguranca: "/ajuda/verificacao-em-duas-etapas", privacidade: "/ajuda/privacidade",
  });
});

it("busca artigos sem acentos e confirma o voto só quando o servidor salva", async () => {
  const search = mount("/app/ajuda?q=notificacoes+sino", <Help member />);
  expect(screen.getByRole("heading", { name: "Resultados da busca" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "Conta e assinatura" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Ler avisos e escolher notificações" })).toHaveAttribute("href", "/app/ajuda/notificacoes");
  expect(screen.queryByRole("heading", { name: "Para a equipe" })).not.toBeInTheDocument();
  search.unmount();
  const empty = mount("/app/ajuda?q=naoexiste", <Help member />);
  expect(screen.getByText("Nenhum artigo encontrado.")).toBeVisible();
  empty.unmount();

  rpc.mockRejectedValueOnce(new Error("Falha temporária de QA."));
  const article = render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={["/app/ajuda/notificacoes"]}>
        <Routes><Route path="/app/ajuda/:artigo" element={<Help member />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  const vote = within(article.container).getByRole("button", { name: "Sim" });
  fireEvent.click(vote);
  expect(await within(article.container).findByRole("alert")).toHaveTextContent("Falha temporária");
  expect(within(article.container).queryByText("Obrigado pelo retorno.")).not.toBeInTheDocument();
  fireEvent.click(vote);
  expect(await within(article.container).findByText("Obrigado pelo retorno.")).toHaveFocus();
  expect(vote).not.toBeInTheDocument();
  expect(rpc).toHaveBeenLastCalledWith("app_help_feedback", { p_page: "/ajuda/notificacoes", p_action: "rate", p_rating: true });
});

it("identifica a assinatura vigente pelo id mesmo com ofertas de mesmo nome", () => {
  const plan = { name: "Plano ativo", active: true, price_cents: 1000, access_months: 1, benefits: [] };
  plans.push({ ...plan, id: "vigente", slug: "vigente" }, { ...plan, id: "novo", slug: "novo" });
  profile.current_plan_id = "vigente";
  mount("/app/configuracoes?aba=assinatura", <Settings />);
  expect(screen.getByText("Seu plano atual")).toBeVisible();
  expect(screen.getByRole("link", { name: "Assinar" })).toHaveAttribute("href", "/checkout?plano=novo");
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
