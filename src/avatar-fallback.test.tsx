import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { FallbackAvatar } from "./avatar-fallback";
import { Settings } from "./pages/settings";
import { Shell } from "./shell";

vi.hoisted(() => {
  vi.stubEnv("VITE_SUPABASE_URL", "http://127.0.0.1:58521");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-public-key");
});
const { profile, refetch, rpc, edge } = vi.hoisted(() => ({
  profile: { id: "pessoa-1", full_name: "Pessoa Teste", plan_name: "Plano ativo", role: "member", theme: "light", company: {}, bio: "",
    avatar_id: undefined as string | undefined, gravatar_checked_at: "2026-11-01T00:00:00Z" as string | null | undefined },
  refetch: vi.fn(),
  rpc: vi.fn(),
  edge: vi.fn(),
}));
vi.mock("./api", async (importOriginal) => ({ ...await importOriginal<typeof import("./api")>(), rpc, edge }));
vi.mock("./auth", () => ({ useBootstrap: () => ({ data: { profile, plans: [], settings: { name: "Icarus", modules: {} } }, refetch }) }));
vi.mock("./tour", () => ({ Tour: () => null }));
vi.mock("./update-notice", () => ({ UpdateNotice: () => null }));

const palette = ["#000000", "#1F1F1F", "#8A8A8A", "#EAEAEA", "#FFFFFF"];
const shapes = (svg: Element) => [...svg.querySelectorAll("*")].map((node) => [node.getAttribute("fill"), node.getAttribute("transform"), node.getAttribute("d")].join("|"));

function mount(path: string, element = <Shell />) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/app/configuracoes" element={<Settings />} />
          <Route element={element}><Route path="*" element={<p>Página</p>} /></Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  Object.assign(profile, { id: "pessoa-1", role: "member", avatar_id: undefined, gravatar_checked_at: "2026-11-01T00:00:00Z" });
  rpc.mockReset().mockResolvedValue({ items: [], page: 1, page_size: 20, total: 0, unread_count: 0 });
  edge.mockReset();
  refetch.mockReset();
  vi.stubGlobal("scrollTo", vi.fn());
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("mesma semente gera a mesma imagem e sementes diferentes geram imagens diferentes", () => {
  const { container } = render(<><FallbackAvatar seed="conta-a" size={40} /><FallbackAvatar seed="conta-a" size={40} /><FallbackAvatar seed="conta-b" size={40} /></>);
  const [first, again, other] = container.querySelectorAll("svg");
  expect(shapes(first)).toEqual(shapes(again));
  expect(shapes(first)).not.toEqual(shapes(other));
  expect(first).toHaveAttribute("aria-hidden", "true");
  expect(first).toHaveAttribute("width", "40");
  const fills = [...container.querySelectorAll("[fill]")].map((node) => node.getAttribute("fill")!.toUpperCase()).filter((fill) => fill.startsWith("#"));
  expect(fills.length).toBeGreaterThan(0);
  expect(fills.every((fill) => palette.includes(fill))).toBe(true);
});

it.each([["aluno", "/app/cursos", "member"], ["painel", "/admin", "admin"]])("topo mostra a imagem padrão de quem não tem foto, no aluno e no painel (%s)", (_area, path, role) => {
  profile.role = role;
  mount(path);
  const account = screen.getByRole("link", { name: "Sua conta: Pessoa Teste" });
  const avatar = account.querySelector(".avatar")!;
  expect(avatar).toHaveAttribute("aria-hidden", "true");
  expect(avatar.querySelector("svg")).not.toBeNull();
  expect(avatar.textContent).toBe("");
});

it("perfil mostra a imagem padrão no lugar do ícone de pessoa", () => {
  mount("/app/configuracoes");
  const card = screen.getByRole("region", { name: "Perfil atual" });
  const avatar = card.querySelector(".student-account-avatar")!;
  expect(avatar.querySelector("svg:not(.lucide)")).not.toBeNull();
  expect(card.querySelector(".lucide-user-round")).toBeNull();
});

it("foto enviada aparece no lugar da imagem padrão", async () => {
  profile.avatar_id = "foto-1";
  edge.mockResolvedValue({ url: "https://media.example.test/foto", expires_at: "2030-01-01" });
  mount("/app/cursos");
  const account = screen.getByRole("link", { name: "Sua conta: Pessoa Teste" });
  const photo = await within(account).findByAltText("");
  fireEvent.load(photo);
  expect(photo).toBeVisible();
  expect(photo).toHaveAttribute("src", "https://media.example.test/foto");
  cleanup();
  mount("/app/configuracoes");
  expect(await screen.findByAltText("Sua foto de perfil")).toHaveAttribute("src", "https://media.example.test/foto");
  expect(screen.getByRole("region", { name: "Perfil atual" }).querySelector(".student-account-avatar")).toBeNull();
});

it("entrada sem foto e sem consulta pede o Gravatar uma vez e recarrega o perfil quando chega foto", async () => {
  profile.id = "pessoa-sem-foto";
  profile.gravatar_checked_at = null;
  edge.mockResolvedValue({ avatar: true });
  mount("/app/cursos");
  await waitFor(() => expect(refetch).toHaveBeenCalledTimes(1));
  expect(edge).toHaveBeenCalledExactlyOnceWith("upload", { action: "gravatar" });
  cleanup();
  mount("/app/cursos");
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(edge).toHaveBeenCalledTimes(1);
});

it("Gravatar sem foto não recarrega o perfil e falha não interrompe a tela", async () => {
  profile.id = "pessoa-sem-gravatar";
  profile.gravatar_checked_at = null;
  edge.mockResolvedValue({ avatar: false });
  mount("/app/cursos");
  await waitFor(() => expect(edge).toHaveBeenCalledTimes(1));
  expect(refetch).not.toHaveBeenCalled();
  cleanup();
  profile.id = "pessoa-com-erro";
  edge.mockRejectedValue(new Error("Serviço indisponível"));
  mount("/app/cursos");
  await waitFor(() => expect(edge).toHaveBeenCalledTimes(2));
  expect(screen.getByText("Página")).toBeVisible();
  expect(refetch).not.toHaveBeenCalled();
});
