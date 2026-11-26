import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
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
it.each(["", "   "])("identifica uma ficha sem nome sem inventar dados pessoais (%j)", async (fullName) => {
  const page = { items: [], total: 0, page: 1, page_size: 20 };
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
    profile: { id: "12345678-member-id", full_name: fullName, role: "member" },
    subscriptions: page, courses: page, orders: page, tickets: page,
  }), { status: 200, headers: { "Content-Type": "application/json" } })));
  render(<QueryClientProvider client={cache}><MemoryRouter initialEntries={["/admin/membros/12345678-member-id"]}><Routes>
    <Route path="/admin/membros/:id" element={<MemberEditor />} />
  </Routes></MemoryRouter></QueryClientProvider>);
  const heading = await screen.findByText("Membro sem nome · 12345678", { selector: "h1" });
  expect(heading).toHaveAccessibleName("Membro sem nome · 12345678");
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
        <Link to="/admin/membros/outro-membro">Abrir outra ficha</Link>
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
  const review = screen.getByRole("heading", { name: "Confirme a alteração" }).closest("section")!;
  expect(within(review).getByText("Papel")).toBeInTheDocument();
  expect(within(review).getByText("Membro")).toBeInTheDocument();
  expect(requests.some((url) => url.endsWith("/rpc/app_admin_member"))).toBe(
    false,
  );
  expect(screen.getByRole("combobox", { name: "Papel" })).toHaveValue("member");
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Autorizar alteração crítica" }),
    ).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole("link", { name: "Abrir outra ficha" }));
  await screen.findByRole("heading", { name: "DEMONSTRAÇÃO membro" });
  expect(screen.queryByRole("heading", { name: "Confirme a alteração" })).not.toBeInTheDocument();
  expect(screen.getByLabelText("Motivo obrigatório")).toHaveValue("");
});
