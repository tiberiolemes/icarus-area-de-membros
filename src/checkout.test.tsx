import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
vi.hoisted(() => {
  vi.stubEnv("VITE_SUPABASE_URL", "http://127.0.0.1:58521");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-public-key");
});
import { cache } from "./api";
import { Checkout } from "./pages/checkout";
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
        else {
          sent = JSON.parse(String(init?.body));
          result = { order_id: "test-order", status: "pending" };
        }
        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );
    render(
      <QueryClientProvider client={cache}>
        <MemoryRouter initialEntries={["/checkout?plano=demo"]}>
          <Checkout />
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
    fireEvent.change(screen.getByLabelText("Forma de pagamento"), {
      target: { value: "CREDIT_CARD" },
    });
    expect(
      screen.getByLabelText("Parcelas").querySelectorAll("option"),
    ).toHaveLength(12);
    fireEvent.change(screen.getByLabelText("Parcelas"), {
      target: { value: installments },
    });
    if (method === "PIX")
      fireEvent.change(screen.getByLabelText("Forma de pagamento"), {
        target: { value: "PIX" },
      });
    fireEvent.click(screen.getByRole("checkbox", { name: /Aceito os Termos/ }));
    fireEvent.submit(
      screen.getByRole("button", { name: /Continuar/ }).closest("form")!,
    );
    await waitFor(() => expect(sent).toBeDefined());
    expect(sent).toMatchObject({
      plan_id: "plan-id",
      method,
      installments: method === "PIX" ? 1 : Number(installments),
    });
    expect(sent).not.toHaveProperty("card");
  },
);
