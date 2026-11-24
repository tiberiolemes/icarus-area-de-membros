import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { cache } from "./api";
import { CatalogLaunches } from "./pages/catalog-launches";

vi.hoisted(() => {
  vi.stubEnv("VITE_SUPABASE_URL", "http://127.0.0.1:58521");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-public-key");
});
vi.mock("./auth", async importOriginal => ({
  ...await importOriginal<typeof import("./auth")>(),
  useAuth: () => ({ session: { user: { id: "membro-sintetico" } }, loading: false }),
}));

afterEach(() => {
  cleanup();
  cache.clear();
  vi.unstubAllGlobals();
});

it.each([false, true])("preserva o foco e permite tentar a inscrição novamente após falha (moveu o foco: %s)", async movesFocus => {
  let subscriptions = 0;
  let listed = 0;
  let failSubscription!: (response: Response) => void;
  const firstAttempt = new Promise<Response>(resolve => { failSubscription = resolve; });
  function json(value: unknown, status = 200) {
    return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
  }
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    const args = JSON.parse(String(init?.body));
    if (path.endsWith("/app_catalog_launches")) {
      expect(args).toEqual({ p_course_slug: "curso-publicado" });
      listed++;
      return json([{
        key: "01234567-0000-4000-8000-000000000001",
        title: "Módulo futuro",
        summary: "<script>Resumo literal</script>",
        planned_on: "2027-01-02",
        subscribed: subscriptions > 1,
      }]);
    }
    expect(path).toMatch(/app_subscribe_catalog_launch$/);
    expect(args).toEqual({ p_key: "01234567-0000-4000-8000-000000000001" });
    subscriptions++;
    return subscriptions === 1 ? firstAttempt : json({ subscribed: true });
  }));
  const { container } = render(<QueryClientProvider client={cache}>
    <CatalogLaunches courseSlug="curso-publicado" />
    <button type="button">Outra ação</button>
  </QueryClientProvider>);
  expect(await screen.findByRole("heading", { name: "Próximos módulos" })).toBeVisible();
  expect(screen.getByText("2 de janeiro de 2027")).toBeVisible();
  expect(container.querySelector("script")).toBeNull();
  expect(screen.getByText("<script>Resumo literal</script>")).toBeVisible();
  const name = "Quero ser avisado sobre Módulo futuro";
  const button = screen.getByRole("button", { name });
  button.focus();
  fireEvent.click(button);
  await waitFor(() => expect(subscriptions).toBe(1));
  expect(button).toHaveAttribute("aria-disabled", "true");
  expect(button).toBeEnabled();
  expect(button).toHaveFocus();
  fireEvent.click(button);
  const focused = movesFocus ? screen.getByRole("button", { name: "Outra ação" }) : button;
  if (movesFocus) focused.focus();
  failSubscription(json({ message: "Tente novamente." }, 503));
  expect(await screen.findByRole("alert")).toHaveTextContent("Tente novamente.");
  expect(focused).toHaveFocus();
  expect(screen.getByRole("button", { name })).toBe(button);
  expect(button).not.toHaveAttribute("aria-disabled");
  expect(subscriptions).toBe(1);
  fireEvent.click(button);
  expect(await screen.findByRole("button", { name: "Aviso ativado sobre Módulo futuro" })).toBeDisabled();
  await waitFor(() => expect(listed).toBeGreaterThanOrEqual(3));
  expect(subscriptions).toBe(2);
});
