import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { Help } from "./pages/help";

vi.hoisted(() => {
  vi.stubEnv("VITE_SUPABASE_URL", "http://127.0.0.1:58521");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-public-key");
});

const { auth, profile, settings } = vi.hoisted(() => ({
  auth: { session: null as object | null, loading: false },
  profile: { id: "member-1", full_name: "Pessoa Teste", role: "member" },
  settings: { name: "Icarus", modules: {} as Record<string, boolean> },
}));
vi.mock("./api", async (importOriginal) => ({ ...await importOriginal<typeof import("./api")>(), rpc: vi.fn() }));
vi.mock("./auth", () => ({
  useAuth: () => auth,
  useBootstrap: () => ({ data: { profile, settings, plans: [] }, refetch: vi.fn(), isFetching: false }),
}));
// Artigos de exemplo: o comportamento da tela não pode depender do texto real, que muda a cada revisão.
vi.mock("./pages/help-content", async (importOriginal) => {
  const real = await importOriginal<typeof import("./pages/help-content")>();
  const articles: import("./pages/help-content").HelpArticle[] = [
    {
      slug: "guia", category: "ajuda-e-suporte", title: "Guia de exemplo", summary: "Resumo do guia.",
      need: ["Uma conta ativa.", "Uma conta ativa."],
      sections: [{
        title: "Como fazer",
        image: { src: "/tela.webp", width: 800, height: 600, alt: "Tela de exemplo com o botão Salvar marcado com o número 1", caption: "Onde fica o botão." },
        steps: ["Clique em **Salvar**.", "Clique em **Salvar**.",
          "Depois, [abra um chamado](/ajuda/chamados) ou leia o [guia do painel](/ajuda/painel-da-equipe)."],
        list: ["Item repetido.", "Item repetido."],
      }],
      trouble: [["Não deu certo", "Tente de novo."]],
      related: ["chamados", "outro-guia"],
    },
    { slug: "chamados", category: "ajuda-e-suporte", module: "support", title: "Falar com a equipe", summary: "Como abrir um chamado.",
      sections: [{ intro: "Texto do artigo de chamados." }] },
    { slug: "outro-guia", category: "ajuda-e-suporte", title: "Outro guia", summary: "Resumo do outro guia.",
      sections: [{ intro: "Texto do outro guia." }], trouble: [["Outra dúvida", "Outra resposta."]] },
    { slug: "painel-da-equipe", category: "painel", title: "Painel da equipe", summary: "Só a equipe lê.",
      sections: [{ intro: "Conteúdo reservado à equipe." }] },
  ];
  return { ...real, articles };
});

function Where() {
  const { pathname, search } = useLocation();
  return <p>{pathname + search}</p>;
}

function mount(path: string, app = <Help member />) {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  cache.setQueryData(["app_public_context", {}], { name: "Icarus", modules: settings.modules });
  return render(
    <QueryClientProvider client={cache}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/ajuda/:artigo?" element={<Help />} />
          <Route path="/app/ajuda/:artigo?" element={app} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  auth.session = null;
  profile.role = "member";
  settings.modules = {};
  vi.stubGlobal("scrollTo", vi.fn());
});

it("com sessão, o endereço público leva ao mesmo artigo e à mesma busca dentro da área de membros", () => {
  auth.session = {};
  const article = mount("/ajuda/guia?q=aula", <Where />);
  expect(screen.getByText("/app/ajuda/guia?q=aula")).toBeInTheDocument();
  article.unmount();
  mount("/ajuda?categoria=ajuda-e-suporte", <Where />);
  expect(screen.getByText("/app/ajuda?categoria=ajuda-e-suporte")).toBeInTheDocument();
});

it("o redirecionamento preserva a busca em navegador sem URLSearchParams.size, como o Safari anterior ao 17", () => {
  const size = Object.getOwnPropertyDescriptor(URLSearchParams.prototype, "size");
  Object.defineProperty(URLSearchParams.prototype, "size", { configurable: true, get: () => undefined });
  try {
    auth.session = {};
    mount("/ajuda?categoria=ajuda-e-suporte", <Where />);
    expect(screen.getByText("/app/ajuda?categoria=ajuda-e-suporte")).toBeInTheDocument();
  } finally {
    if (size) Object.defineProperty(URLSearchParams.prototype, "size", size);
    else Reflect.deleteProperty(URLSearchParams.prototype, "size");
  }
});

it("o aluno segue o link e os relacionados para os artigos que pode ler, e o link para artigo da equipe fica como texto", () => {
  mount("/app/ajuda/guia");
  expect(screen.getByRole("link", { name: "abra um chamado" })).toHaveAttribute("href", "/app/ajuda/chamados");
  expect(screen.getByText(/guia do painel/)).toHaveTextContent("Depois, abra um chamado ou leia o guia do painel.");
  expect(screen.queryByRole("link", { name: "guia do painel" })).not.toBeInTheDocument();
  const related = screen.getByRole("heading", { name: "Artigos relacionados" }).parentElement!;
  expect(within(related).getByRole("link", { name: "Falar com a equipe" })).toHaveAttribute("href", "/app/ajuda/chamados");
  expect(within(related).getByRole("link", { name: "Outro guia" })).toHaveAttribute("href", "/app/ajuda/outro-guia");
});

it("com o módulo desligado, o artigo dele some para o aluno, e o link para ele vira texto", () => {
  settings.modules = { support: false };
  const guide = mount("/app/ajuda/guia");
  expect(screen.getByText(/abra um chamado/)).toHaveTextContent("Depois, abra um chamado ou leia o guia do painel.");
  expect(screen.queryByRole("link", { name: "abra um chamado" })).not.toBeInTheDocument();
  const related = screen.getByRole("heading", { name: "Artigos relacionados" }).parentElement!;
  expect(within(related).getAllByRole("link").map((link) => link.textContent)).toEqual(["Outro guia"]);
  guide.unmount();
  mount("/app/ajuda/chamados");
  expect(screen.getByRole("heading", { level: 1, name: "Artigo não encontrado" })).toBeVisible();
  expect(screen.queryByText("Texto do artigo de chamados.")).not.toBeInTheDocument();
});

it("visitante que abre artigo da equipe recebe o caminho para entrar, sem ver o artigo", () => {
  const team = mount("/ajuda/painel-da-equipe");
  expect(screen.getByRole("heading", { level: 1, name: "Entre para ler este artigo" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Entrar" })).toHaveAttribute("href", "/entrar?returnTo=%2Fapp%2Fajuda%2Fpainel-da-equipe");
  expect(screen.getByRole("link", { name: "Ver todos os assuntos" })).toHaveAttribute("href", "/ajuda");
  expect(screen.queryByText("Painel da equipe")).not.toBeInTheDocument();
  expect(screen.queryByText("Conteúdo reservado à equipe.")).not.toBeInTheDocument();
  team.unmount();
  // Endereço que não existe continua sem convite para entrar: a sessão não mudaria nada.
  mount("/ajuda/nao-existe");
  expect(screen.getByRole("heading", { level: 1, name: "Artigo não encontrado" })).toBeVisible();
  expect(screen.queryByRole("link", { name: "Entrar" })).not.toBeInTheDocument();
});

it("busca só com espaços mostra a página inicial da ajuda, e não todos os artigos", () => {
  mount("/app/ajuda?q=%20");
  expect(screen.getByRole("heading", { level: 1, name: "Como podemos ajudar?" })).toBeVisible();
  expect(screen.queryByRole("heading", { name: "Resultados da busca" })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Guia de exemplo" })).not.toBeInTheDocument();
});

it("o link da imagem diz que amplia e que abre em nova aba", () => {
  mount("/app/ajuda/guia");
  const link = screen.getByRole("img", { name: /Tela de exemplo/ }).closest("a");
  expect(link).toHaveAttribute("target", "_blank");
  expect(link).toHaveAccessibleName(/Tela de exemplo.*Abre a imagem ampliada em nova aba/);
});

it("passos, itens e pré-requisitos repetidos aparecem todos, sem aviso de chave duplicada", () => {
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  mount("/app/ajuda/guia");
  expect(screen.getAllByText("Uma conta ativa.")).toHaveLength(2);
  expect(screen.getAllByText("Item repetido.")).toHaveLength(2);
  expect(screen.getAllByText("Salvar", { selector: "strong" })).toHaveLength(2);
  expect(errors.mock.calls.map(String).join("\n")).not.toMatch(/same key/);
});

it("uma resposta aberta em um artigo não aparece aberta no artigo seguinte", () => {
  mount("/app/ajuda/guia");
  screen.getByText("Não deu certo").closest("details")!.open = true;
  fireEvent.click(screen.getByRole("link", { name: "Outro guia" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { level: 1, name: "Outro guia" })).toBeVisible();
  expect(screen.getByText("Outra dúvida").closest("details")).not.toHaveAttribute("open");
});
