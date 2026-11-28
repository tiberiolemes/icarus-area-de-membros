import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { Shell } from "./shell";

vi.hoisted(() => {
  vi.stubEnv("VITE_SUPABASE_URL", "http://127.0.0.1:58521");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-public-key");
});
vi.mock("./auth", () => ({ useBootstrap: () => ({ data: {
  profile: { id: "admin-1", full_name: "Pessoa Teste", role: "admin" },
} }) }));
vi.mock("./tour", () => ({ Tour: () => null }));
vi.mock("./update-notice", () => ({ UpdateNotice: () => null }));
vi.mock("./pages/notifications", () => ({ NotificationBell: () => null }));

function mount(path = "/admin/cursos") {
  const cache = new QueryClient();
  return render(<QueryClientProvider client={cache}><MemoryRouter initialEntries={[path]}><Shell /></MemoryRouter></QueryClientProvider>);
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});

it("Recolher menu recolhe a barra e guarda a escolha", () => {
  const { container, unmount } = mount();
  const toggle = screen.getByRole("button", { name: "Recolher menu" });
  const aside = screen.getByRole("complementary");
  expect(toggle).toHaveAttribute("aria-expanded", "true");
  expect(toggle).toHaveAttribute("aria-controls", aside.id);
  fireEvent.click(toggle);
  expect(screen.getByRole("button", { name: "Expandir menu" })).toHaveAttribute("aria-expanded", "false");
  expect(container.querySelector(".app-shell")).toHaveAttribute("data-sidebar", "collapsed");
  expect(localStorage.getItem("icarus:sidebar:admin")).toBe("1");
  unmount();
  mount();
  fireEvent.click(screen.getByRole("button", { name: "Expandir menu" }));
  expect(screen.getByRole("button", { name: "Recolher menu" })).toHaveAttribute("aria-expanded", "true");
  expect(localStorage.getItem("icarus:sidebar:admin")).toBe("0");
});

it("barra recolhida mantém o nome de cada link para leitor de tela", () => {
  localStorage.setItem("icarus:sidebar:admin", "1");
  mount();
  expect(screen.getByRole("link", { name: "Cursos e aulas" })).toHaveAttribute("data-label", "Cursos e aulas");
  expect(screen.getByRole("link", { name: "Área do aluno" })).toBeInTheDocument();
});

it("painel e área do aluno guardam escolhas separadas", () => {
  localStorage.setItem("icarus:sidebar:member", "0");
  localStorage.setItem("icarus:sidebar:admin", "1");
  mount();
  expect(screen.getByRole("button", { name: "Expandir menu" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("link", { name: "Área do aluno" }));
  expect(screen.getByRole("button", { name: "Recolher menu" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Recolher menu" }));
  expect(localStorage.getItem("icarus:sidebar:member")).toBe("1");
  fireEvent.click(screen.getByRole("button", { name: "Expandir menu" }));
  expect(localStorage.getItem("icarus:sidebar:member")).toBe("0");
  expect(localStorage.getItem("icarus:sidebar:admin")).toBe("1");
  fireEvent.click(screen.getByRole("link", { name: "Administração" }));
  expect(screen.getByRole("button", { name: "Expandir menu" })).toBeInTheDocument();
});

it("sem localStorage a barra começa expandida e alterna sem erro", () => {
  vi.spyOn(window, "localStorage", "get").mockImplementation(() => { throw new Error("Acesso bloqueado"); });
  mount();
  fireEvent.click(screen.getByRole("button", { name: "Recolher menu" }));
  expect(screen.getByRole("button", { name: "Expandir menu" })).toHaveAttribute("aria-expanded", "false");
});

it("a gaveta do celular não tem o botão de recolher", () => {
  localStorage.setItem("icarus:sidebar:member", "1");
  mount("/app/cursos");
  const aside = screen.getByRole("complementary");
  expect(within(aside).getByRole("button", { name: "Expandir menu" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Abrir navegação" }));
  const drawer = within(screen.getByRole("dialog", { name: "Navegação" }));
  expect(drawer.queryByRole("button", { name: /(?:Recolher|Expandir) menu/ })).toBeNull();
  expect(drawer.getByRole("link", { name: "Configurações" })).toBeInTheDocument();
});
