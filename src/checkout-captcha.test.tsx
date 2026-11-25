import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";

const { widget } = vi.hoisted(() => {
  vi.stubEnv("VITE_SUPABASE_URL", "http://127.0.0.1:58521");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-public-key");
  vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "0x4AAAAAAA-teste");
  return { widget: { token: "", reset: vi.fn() } };
});
vi.mock("./checkout-receipt", () => ({
  prepareReceipt: async () => ({}),
  receiptHash: async () => "fixture-hash",
  saveReceipt: async () => {},
  loadReceipt: async () => "fixture-receipt",
}));
// Só o widget da Cloudflare é substituído: ele devolve o token num campo oculto, e a leitura do token é a real.
vi.mock("./captcha", async (importOriginal) => ({
  ...await importOriginal<typeof import("./captcha")>(),
  Captcha: () => <input type="hidden" name="captcha_token" value={widget.token} readOnly />,
  resetCaptcha: widget.reset,
}));
import { cache } from "./api";
import { Checkout } from "./pages/checkout";

afterEach(() => {
  cache.clear();
  vi.unstubAllGlobals();
  widget.reset.mockReset();
});

async function buy(token: string) {
  widget.token = token;
  const sent: Record<string, unknown>[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const result = url.includes("app_public_context")
      ? { plans: [{ id: "plan-id", slug: "demo", name: "DEMONSTRAÇÃO", price_cents: 100, access_months: 12, benefits: [] }], legal_ready: true, legal_versions: [{ id: "terms-id", kind: "terms" }] }
      : url.includes("capabilities") ? { asaas: true }
      : url.endsWith("/checkout") ? (sent.push(JSON.parse(String(init?.body))), { order_id: "test-order", status: "pending" })
      : undefined;
    if (!result) throw new Error("Endpoint fora da fixture");
    return Response.json(result);
  }));
  render(
    <QueryClientProvider client={cache}>
      <MemoryRouter initialEntries={["/checkout?plano=demo"]}>
        <Routes>
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/pedido/:pedido" element={<p>Pedido aberto</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  fireEvent.change(await screen.findByLabelText("Nome completo"), { target: { value: "DEMONSTRAÇÃO QA" } });
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "qa@demo.icarus.invalid" } });
  fireEvent.change(screen.getByLabelText("CPF ou CNPJ"), { target: { value: "00000000000" } });
  fireEvent.click(screen.getByRole("checkbox", { name: /Aceito os Termos/ }));
  fireEvent.submit(screen.getByRole("button", { name: /Continuar/ }).closest("form")!);
  return sent;
}

it("envia o token do Turnstile com a compra e renova o desafio depois da tentativa", async () => {
  const sent = await buy("token-do-desafio");
  await screen.findByText("Pedido aberto");
  expect(sent).toHaveLength(1);
  expect(sent[0].captcha_token).toBe("token-do-desafio");
  expect(widget.reset).toHaveBeenCalledOnce();
});

it("sem o desafio resolvido, a compra não sai do navegador, a pessoa sabe o motivo e nada do que digitou se perde", async () => {
  const sent = await buy("");
  expect(await screen.findByText(/Conclua a verificação de segurança/)).toBeInTheDocument();
  expect(sent).toHaveLength(0);
  expect(screen.getByLabelText("CPF ou CNPJ")).toHaveValue("00000000000");
  // O desafio em andamento não é reiniciado por um clique adiantado.
  expect(widget.reset).not.toHaveBeenCalled();
});
