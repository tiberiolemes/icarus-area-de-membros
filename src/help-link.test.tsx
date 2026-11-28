import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { HelpLink } from "./help-link";
import { AdminSurface } from "./pages/admin-surface";

const { auth, profile, settings } = vi.hoisted(() => ({
  auth: { session: {} as object | null, loading: false },
  profile: { role: "member" },
  settings: { modules: {} as Record<string, boolean> },
}));

vi.mock("./auth", () => ({
  useAuth: () => auth,
  useBootstrap: () => ({ data: { profile, settings } }),
}));

vi.mock("./api", async (importOriginal) => ({ ...await importOriginal<typeof import("./api")>(), rpc: vi.fn() }));

vi.mock("./pages/help-content", async (importOriginal) => {
  const real = await importOriginal<typeof import("./pages/help-content")>();
  const articles: import("./pages/help-content").HelpArticle[] = [
    {
      slug: "guia", category: "primeiros-passos", title: "Guia inicial", summary: "Resumo do guia.",
      sections: [{ intro: "Leia [outro guia](/ajuda/outro-guia) ou [a documentação](https://example.com/)." }],
      related: ["outro-guia"],
    },
    {
      slug: "outro-guia", category: "primeiros-passos", title: "Outro guia", summary: "Resumo do outro guia.",
      module: "community", sections: [{ intro: "Orientação sobre a comunidade." }],
    },
    {
      slug: "criar-curso", category: "conteudo", title: "Criar um curso", summary: "Resumo para a equipe.",
      sections: [{ intro: "Orientação reservada à equipe." }],
    },
  ];
  return { ...real, articles };
});

function Where() {
  return <p data-testid="pathname">{useLocation().pathname}</p>;
}

function mount(children: ReactNode, path = "/app/cursos") {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  cache.setQueryData(["app_public_context", {}], { modules: settings.modules });
  render(<QueryClientProvider client={cache}>
    <MemoryRouter initialEntries={[path]}>{children}<Where /></MemoryRouter>
  </QueryClientProvider>);
}

async function open(name = "Ajuda") {
  fireEvent.click(screen.getByRole("link", { name }));
  return within(await screen.findByRole("dialog"));
}

beforeEach(() => {
  auth.session = {};
  profile.role = "member";
  settings.modules = {};
});

it("link de ajuda abre o artigo num popup sem sair da tela", async () => {
  mount(<HelpLink to="/ajuda/guia">Ajuda</HelpLink>);
  const dialog = await open();
  expect(await dialog.findByRole("heading", { name: "Guia inicial" })).toBeVisible();
  expect(screen.getByTestId("pathname")).toHaveTextContent("/app/cursos");
  expect(dialog.getByRole("heading", { name: "Este artigo ajudou?" })).toBeVisible();
  fireEvent.click(dialog.getByRole("button", { name: "Sim" }));
  expect(await dialog.findByText("Obrigado pelo retorno.")).toBeVisible();
});

it("Abrir em uma nova janela aponta para o artigo da Central em nova aba", async () => {
  mount(<HelpLink to="/ajuda/guia">Ajuda</HelpLink>);
  const dialog = await open();
  const newWindow = dialog.getByRole("link", { name: "Abrir em uma nova janela" });
  expect(newWindow).toHaveAttribute("href", "/app/ajuda/guia");
  expect(newWindow).toHaveAttribute("target", "_blank");
  expect(newWindow).toHaveAttribute("rel", expect.stringMatching(/\bnoopener\b/));
});

it("link para outro artigo troca o conteúdo e Voltar retorna", async () => {
  mount(<HelpLink to="/ajuda/guia">Ajuda</HelpLink>);
  const dialog = await open();
  const external = await dialog.findByRole("link", { name: "a documentação" });
  expect(external).toHaveAttribute("target", "_blank");
  fireEvent.click(dialog.getByRole("link", { name: "outro guia" }));
  expect(await dialog.findByRole("heading", { name: "Outro guia" })).toBeVisible();
  expect(dialog.getByRole("link", { name: "Abrir em uma nova janela" })).toHaveAttribute("href", "/app/ajuda/outro-guia");
  fireEvent.click(dialog.getByRole("button", { name: "Voltar" }));
  expect(await dialog.findByRole("heading", { name: "Guia inicial" })).toBeVisible();
  expect(screen.getByTestId("pathname")).toHaveTextContent("/app/cursos");
});

it("link para a Central abre busca e assuntos no popup", async () => {
  auth.session = null;
  mount(<HelpLink to="/ajuda">Ajuda</HelpLink>, "/checkout");
  const dialog = await open();
  expect(await dialog.findByRole("region", { name: "Assuntos" })).toBeVisible();
  const search = dialog.getByRole("searchbox", { name: "Buscar na ajuda" });
  fireEvent.change(search, { target: { value: "comunidade" } });
  fireEvent.submit(search.closest("form")!);
  expect(await dialog.findByRole("heading", { name: "Resultados da busca" })).toBeVisible();
  expect(dialog.getByRole("link", { name: "Outro guia" })).toBeVisible();
  expect(dialog.getByRole("link", { name: "Abrir em uma nova janela" })).toHaveAttribute("href", "/ajuda?q=comunidade");
  expect(screen.getByTestId("pathname")).toHaveTextContent("/checkout");
});

it("artigo de módulo desligado mostra Artigo não encontrado para o aluno", async () => {
  settings.modules = { community: false };
  mount(<HelpLink to="/ajuda/outro-guia">Ajuda</HelpLink>);
  const dialog = await open();
  expect(await dialog.findByRole("heading", { name: "Artigo não encontrado" })).toBeVisible();
  expect(dialog.queryByText("Orientação sobre a comunidade.")).not.toBeInTheDocument();
});

it("Ajuda da administração abre em popup", async () => {
  profile.role = "admin";
  mount(<AdminSurface section="courses" trail={["Cursos"]} title="Cursos" description="Cursos publicados."><p>Lista de cursos.</p></AdminSurface>, "/admin/cursos");
  const dialog = await open("Ajuda da administração");
  expect(await dialog.findByRole("heading", { name: "Criar um curso" })).toBeVisible();
  expect(screen.getByTestId("pathname")).toHaveTextContent("/admin/cursos");
});
