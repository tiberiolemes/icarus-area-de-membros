import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";

vi.hoisted(() => {
  vi.stubEnv("VITE_SUPABASE_URL", "http://127.0.0.1:58521");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-public-key");
});

import { cache } from "./api";
import { AdminMembers, AdminOrders, AdminPlans } from "./pages/admin";

const id = "d0000000-0000-4000-8000-000000000001";
const order = {
  id,
  amount_cents: 1234,
  method: "PIX",
  status: "pending",
  created_at: "2026-11-23T12:00:00Z",
};

function show(path: string, items: object[], total = items.length) {
  const requests = vi.fn(async (_url: string, request: RequestInit) => {
    const args = JSON.parse(String(request.body));
    return Response.json({
      items,
      total,
      page: args.p_page,
      page_size: 20,
      metrics: { paid: 5, pending: 12, revenue_cents: 450000 },
    });
  });
  vi.stubGlobal("fetch", requests);
  render(
    <QueryClientProvider client={cache}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/admin/membros" element={<AdminMembers />} />
          <Route path="/admin/planos" element={<AdminPlans />} />
          <Route path="/admin/pedidos" element={<AdminOrders />} />
          <Route path="/admin/pedidos/:id" element={<AdminOrders />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return requests;
}

afterEach(() => {
  cleanup();
  cache.clear();
  vi.unstubAllGlobals();
});

it("busca membros no servidor e conserva a ação de abrir a ficha", async () => {
  const requests = show("/admin/membros?page=3", [
    {
      id,
      full_name: "DEMONSTRAÇÃO membro",
      role: "member",
      suspended: true,
      company: { name: "DEMONSTRAÇÃO empresa" },
    },
  ]);
  const table = await screen.findByRole("table");
  expect(within(table).getByText("Suspenso")).toBeInTheDocument();
  expect(
    within(table).getByRole("link", {
      name: "Abrir ficha de DEMONSTRAÇÃO membro",
    }),
  ).toHaveAttribute("href", "/admin/membros/" + id);
  fireEvent.change(screen.getByRole("searchbox"), {
    target: { value: "empresa" },
  });
  fireEvent.submit(screen.getByRole("search"));
  await screen.findByRole("table");
  expect(JSON.parse(String(requests.mock.lastCall?.[1].body))).toEqual({
    p_entity: "profiles",
    p_query: "empresa",
    p_page: 1, p_role: null, p_plan: null, p_status: null,
  });
});

it("abre o pedido por identificador e mantém o estado pendente do servidor", async () => {
  const requests = show("/admin/pedidos", [order]);
  const table = await screen.findByRole("table");
  expect(within(table).getByText("Aguardando pagamento")).toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("link", { name: "Detalhes do pedido d0000000" }),
  );
  expect(await screen.findByText("Ainda não confirmado")).toBeInTheDocument();
  expect(JSON.parse(String(requests.mock.lastCall?.[1].body))).toEqual({
    p_entity: "orders",
    p_query: id,
    p_page: 1,
  });
});

it("trata um identificador inválido sem pesquisar o livro de vendas", () => {
  const requests = show("/admin/pedidos/%25", [order]);
  expect(screen.getByText("Pedido não encontrado.")).toBeInTheDocument();
  expect(requests).not.toHaveBeenCalled();
});

it("consulta a situação no servidor em todas as páginas e volta à busca geral por ID", async () => {
  const requests = show("/admin/pedidos?q=1234&page=3", [order], 45);
  await screen.findByRole("table");
  const filters = within(screen.getByRole("group", { name: "Situação dos pedidos" }));
  const pending = filters.getByRole("button", { name: "Aguardando pagamento" });
  fireEvent.click(pending);
  expect(pending).toHaveAttribute("aria-pressed", "true");
  await screen.findByText("45 registros · página 1 de 3");
  expect(JSON.parse(String(requests.mock.lastCall?.[1].body))).toEqual({
    p_entity: "orders", p_query: "", p_page: 1, p_role: null, p_plan: null, p_status: "pending",
  });
  fireEvent.click(screen.getByRole("button", { name: "Próxima" }));
  await screen.findByText("45 registros · página 2 de 3");
  expect(JSON.parse(String(requests.mock.lastCall?.[1].body))).toEqual({
    p_entity: "orders", p_query: "", p_page: 2, p_role: null, p_plan: null, p_status: "pending",
  });
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: id } });
  fireEvent.submit(screen.getByRole("search"));
  await screen.findByText("45 registros · página 1 de 3");
  expect(pending).toHaveAttribute("aria-pressed", "false");
  expect(JSON.parse(String(requests.mock.lastCall?.[1].body))).toEqual({
    p_entity: "orders", p_query: id, p_page: 1, p_role: null, p_plan: null, p_status: null,
  });
});

it("exibe o valor dos pedidos pagos em todo o resultado do servidor", async () => {
  show("/admin/pedidos?q=2026", [
    order,
    { ...order, id: "paid", status: "paid", amount_cents: 4500 },
    { ...order, id: "refunded", status: "refunded", amount_cents: 7000 },
  ], 26);

  const overview = (await screen.findByText("Total encontrado")).closest("dl")!;
  expect(within(overview).getByText("26")).toBeInTheDocument();
  expect(within(overview).getAllByText("Na busca atual").length).toBeGreaterThan(0);
  const paid = within(overview).getByText("Valor dos pedidos pagos").closest("div")!;
  expect(within(paid).getByText(/4\.500,00/)).toBeInTheDocument();
  expect(within(paid).getByText("Na busca atual")).toBeInTheDocument();
});

it("expõe o benefício de um plano como texto e preserva o valor cadastrado", async () => {
  show("/admin/planos", [
    {
      id,
      name: "DEMONSTRAÇÃO local",
      price_cents: 9900,
      access_months: 12,
      active: true,
      benefits: ["Material <b>local</b>"],
    },
  ]);
  const card = await screen.findByRole("article");
  expect(within(card).getByText(/99,00/)).toBeInTheDocument();
  expect(within(card).getByText("Material <b>local</b>")).toBeInTheDocument();
  expect(
    within(card).getByRole("button", {
      name: "Editar plano DEMONSTRAÇÃO local",
    }),
  ).toBeEnabled();
});

it("formulário de plano envia interest_free", async () => {
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
  const requests = show("/admin/planos", [
    { id, name: "DEMONSTRAÇÃO local", slug: "demo-local", price_cents: 58800, access_months: 12, active: true, benefits: [], interest_free: false },
  ]);
  fireEvent.click(await screen.findByRole("button", { name: "Editar plano DEMONSTRAÇÃO local" }));
  const box = screen.getByRole("checkbox", { name: "Parcelamento sem juros no cartão" });
  expect(box).not.toBeChecked();
  expect(box).toHaveAccessibleDescription("Ligue só se a sua conta do Asaas não repassa juros do parcelamento ao aluno.");
  fireEvent.click(box);
  fireEvent.click(screen.getByRole("button", { name: "Salvar plano" }));
  await waitFor(() => expect(requests.mock.calls.some(([url]) => String(url).endsWith("app_admin_save"))).toBe(true));
  const [, request] = requests.mock.calls.find(([url]) => String(url).endsWith("app_admin_save"))!;
  expect(JSON.parse(String(request.body))).toMatchObject({ p_entity: "plans", p_id: id, p_data: { interest_free: true } });
});
