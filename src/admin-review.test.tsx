import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
vi.hoisted(() => {
  vi.stubEnv("VITE_SUPABASE_URL", "http://127.0.0.1:58521");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-public-key");
});
import { cache } from "./api";
import { MemberEditor } from "./pages/admin";
afterEach(() => {
  cleanup();
  cache.clear();
  vi.unstubAllGlobals();
});
it("a revisão local anuncia preparação em português sem chamar a mutação antes da reauth", async () => {
  const requests: string[] = [];
  const page = { items: [], total: 0, page: 1, page_size: 20 };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      requests.push(String(input));
      const data = String(input).includes("app_admin_member_detail")
        ? {
            profile: {
              id: "member-id",
              full_name: "DEMONSTRAÇÃO membro",
              role: "member",
              suspended: false,
              onboarding_complete: true,
            },
            subscriptions: page,
            courses: page,
            orders: page,
            tickets: page,
          }
        : page;
      return new Response(JSON.stringify(data), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
  render(
    <QueryClientProvider client={cache}>
      <MemoryRouter initialEntries={["/admin/membros/member-id"]}>
        <Routes>
          <Route path="/admin/membros/:id" element={<MemberEditor />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await screen.findByRole("heading", { name: "DEMONSTRAÇÃO membro" });
  fireEvent.change(screen.getByLabelText("Motivo obrigatório"), {
    target: { value: "DEMONSTRAÇÃO revisão sem aplicar alteração" },
  });
  fireEvent.submit(
    screen.getByRole("button", { name: "Revisar alteração" }).closest("form")!,
  );
  await screen.findByText(
    "Dados preparados. Confirme sua identidade para aplicar a alteração.",
  );
  expect(screen.queryByText("Salvo com sucesso.")).not.toBeInTheDocument();
  expect(screen.getByText(/Papel: Membro/)).toBeInTheDocument();
  expect(requests.some((url) => url.endsWith("/rpc/app_admin_member"))).toBe(
    false,
  );
  expect(screen.getByRole("combobox", { name: "Papel" })).toHaveValue("member");
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Autorizar alteração crítica" }),
    ).toBeEnabled(),
  );
});
