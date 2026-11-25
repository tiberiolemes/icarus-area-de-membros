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
vi.mock("./checkout-receipt", () => ({
  prepareReceipt: async () => ({}),
  receiptHash: async () => "fixture-hash",
  saveReceipt: async () => {},
  loadReceipt: vi.fn(async () => "fixture-receipt" as string | null),
}));
import { cache } from "./api";
import { loadReceipt } from "./checkout-receipt";
import { Checkout, OrderStatus } from "./pages/checkout";
afterEach(() => {
  cleanup();
  cache.clear();
  vi.unstubAllGlobals();
});
it.each([
  { installments: "2", method: "CREDIT_CARD" },
  { installments: "12", method: "CREDIT_CARD" },
  { installments: "12", method: "PIX" },
])(
  "serializa $method com seleção $installments sem capturar cartão",
  async ({ installments, method }) => {
    let sent: Record<string, unknown> | undefined;
    const attempts: unknown[] = [];
    const statusRequests: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        let result: unknown;
        if (url.includes("app_public_context"))
          result = {
            plans: [
              {
                id: "plan-id",
                slug: "demo",
                name: "DEMONSTRAÇÃO",
                price_cents: 100,
                access_months: 12,
                benefits: [],
              },
            ],
            legal_ready: true,
            legal_versions: [{ id: "terms-id", kind: "terms" }],
          };
        else if (url.includes("capabilities")) result = { asaas: true };
        else if (url.endsWith("/order-status")) {
          statusRequests.push(JSON.parse(String(init?.body)));
          result = {
            status: statusRequests.length === 1 ? "pending" : "paid",
            amount_cents: 12345,
            access_granted: statusRequests.length > 2,
          };
        } else if (url.endsWith("/checkout")) {
          sent = JSON.parse(String(init?.body));
          attempts.push(sent?.attempt_key);
          if (method === "PIX" && attempts.length === 1)
            return Response.json(
              { message: "Indisponível nesta tentativa." },
              { status: 503 },
            );
          result = {
            order_id: "test-order",
            status: "pending",
          };
        } else throw new Error("Endpoint fora da fixture");
        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );
    render(
      <QueryClientProvider client={cache}>
        <MemoryRouter initialEntries={["/checkout?plano=demo"]}>
          <Routes>
            <Route path="/checkout" element={<Checkout />} />
            <Route path="/pedido/:pedido" element={<OrderStatus />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await screen.findByLabelText("Nome completo");
    fireEvent.change(screen.getByLabelText("Nome completo"), {
      target: { value: "DEMONSTRAÇÃO QA" },
    });
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "qa@demo.icarus.invalid" },
    });
    fireEvent.change(screen.getByLabelText("CPF ou CNPJ"), {
      target: { value: "00000000000" },
    });
    fireEvent.click(screen.getByRole("radio", { name: "Cartão de crédito" }));
    expect(
      screen.getByLabelText("Parcelas").querySelectorAll("option"),
    ).toHaveLength(12);
    fireEvent.change(screen.getByLabelText("Parcelas"), {
      target: { value: installments },
    });
    if (method === "PIX")
      fireEvent.click(screen.getByRole("radio", { name: "Pix" }));
    const terms = screen.getByRole("checkbox", { name: /Aceito os Termos/ });
    expect(terms).not.toBeChecked();
    fireEvent.click(terms);
    fireEvent.submit(
      screen.getByRole("button", { name: /Continuar/ }).closest("form")!,
    );
    await waitFor(() => expect(sent).toBeDefined());
    if (method === "PIX") {
      const alert = await screen.findByRole("alert");
      await waitFor(() => expect(alert).toHaveFocus());
      expect(screen.getByLabelText("CPF ou CNPJ")).toHaveValue("");
      expect(screen.getByLabelText("Nome completo")).toHaveValue(
        "DEMONSTRAÇÃO QA",
      );
      fireEvent.change(screen.getByLabelText("CPF ou CNPJ"), {
        target: { value: "00000000000" },
      });
      fireEvent.submit(
        screen.getByRole("button", { name: /Continuar/ }).closest("form")!,
      );
      await waitFor(() => expect(attempts).toEqual([attempts[0], attempts[0]]));
      await screen.findByRole("heading", { name: "Aguardando pagamento" });
      expect(screen.getByText(/123,45/)).toBeInTheDocument();
      const consult = screen.getByRole("button", { name: "Consultar novamente" });
      fireEvent.click(consult);
      await screen.findByRole("heading", { name: "Pago" });
      expect(screen.queryByRole("link", { name: "Abrir meus cursos" })).toBeNull();
      fireEvent.click(consult);
      expect(
        await screen.findByRole("link", { name: "Abrir meus cursos" }),
      ).toHaveAttribute("href", "/app/cursos");
      expect(statusRequests).toEqual(Array(3).fill({
        order_id: "test-order",
        receipt_token: "fixture-receipt",
      }));
    }
    expect(sent).toMatchObject({
      plan_id: "plan-id",
      method,
      installments: method === "PIX" ? 1 : Number(installments),
      legal_version_ids: ["terms-id"],
      marketing_opt_in: false,
      receipt_hash: "fixture-hash",
    });
    expect(sent).not.toHaveProperty("card");
    expect(sent).not.toHaveProperty("price_cents");
  },
);

it("aponta no próprio campo o aceite obrigatório que faltou", async () => {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const result = url.includes("app_public_context")
      ? { plans: [{ id: "plan-id", slug: "demo", name: "DEMONSTRAÇÃO", price_cents: 100, access_months: 12, benefits: [] }],
        legal_ready: true, legal_versions: [{ id: "terms-id", kind: "terms" }] }
      : url.includes("capabilities") ? { asaas: true } : null;
    if (!result) throw new Error("O envio não deveria sair sem o aceite");
    return new Response(JSON.stringify(result), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
  render(<QueryClientProvider client={cache}><MemoryRouter initialEntries={["/checkout?plano=demo"]}>
    <Routes><Route path="/checkout" element={<Checkout />} /></Routes>
  </MemoryRouter></QueryClientProvider>);
  await screen.findByLabelText("Nome completo");
  fireEvent.change(screen.getByLabelText("Nome completo"), { target: { value: "DEMONSTRAÇÃO QA" } });
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "qa@demo.icarus.invalid" } });
  fireEvent.change(screen.getByLabelText("CPF ou CNPJ"), { target: { value: "00000000000" } });
  fireEvent.submit(screen.getByRole("button", { name: /Continuar/ }).closest("form")!);
  const terms = screen.getByRole("checkbox", { name: /Aceito os Termos/ });
  await waitFor(() => expect(terms).toHaveAttribute("aria-invalid", "true"));
  expect(document.getElementById(terms.getAttribute("aria-describedby")!)).toHaveTextContent("Marque esta opção para continuar.");
});

it("preserva o endereço do pedido no link de entrada sem recibo", async () => {
  const order = "00000000-0000-4000-8000-000000000001";
  vi.mocked(loadReceipt).mockResolvedValueOnce(undefined);
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ name: "Icarus" })));
  render(<QueryClientProvider client={cache}><MemoryRouter initialEntries={["/pedido/" + order]}>
    <Routes><Route path="/pedido/:pedido" element={<OrderStatus />} /></Routes>
  </MemoryRouter></QueryClientProvider>);
  expect(await screen.findByRole("link", { name: /^Entrar$/ }))
    .toHaveAttribute("href", "/entrar?returnTo=" + encodeURIComponent("/pedido/" + order));
});
