import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.hoisted(() => {
  vi.stubEnv("VITE_SUPABASE_URL", "http://127.0.0.1:58521");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-public-key");
});
import { buildAdminCsv, csvCell } from "./admin-export";
import { edge, errorMessage } from "./api";
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});
afterEach(() => vi.unstubAllGlobals());
describe("CSV de listas administrativas existentes", () => {
  it.each([21, 25])(
    "exporta os %i resultados filtrados além da primeira página, sem campos extras",
    async (total) => {
      const requests: { p_entity: string; p_query: string; p_page: number }[] =
        [];
      vi.stubGlobal(
        "fetch",
        vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
          const args = JSON.parse(String(init?.body));
          requests.push(args);
          return json({
            items: Array.from(
              { length: Math.min(20, total - (args.p_page - 1) * 20) },
              (_, index) => ({
                id: String((args.p_page - 1) * 20 + index),
                full_name:
                  index === 0
                    ? "Álvaro — demonstração"
                    : "Aluno sintético " + index,
                role: "member",
                suspended: false,
                buyer_data: { document: "never-export" },
                receipt_token: "never-export",
              }),
            ),
            total,
            page: args.p_page,
            page_size: 20,
          });
        }),
      );
      const csv = await buildAdminCsv("profiles", "selecionados");
      expect(requests).toEqual([
        { p_entity: "profiles", p_query: "selecionados", p_page: 1 },
        { p_entity: "profiles", p_query: "selecionados", p_page: 2 },
      ]);
      expect(csv.charCodeAt(0)).toBe(0xfeff);
      expect(csv.split("\r\n").filter(Boolean)).toHaveLength(total + 1);
      expect(csv).toContain("Álvaro — demonstração");
      expect(csv).not.toContain("never-export");
      expect(csv).not.toContain("buyer_data");
    },
  );
  it("usa somente as colunas de pedidos e neutraliza fórmulas e aspas", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        json({
          items: [
            {
              id: "pedido-sintetico",
              amount_cents: 1234,
              method: "PIX",
              status: "paid",
              created_at: "2026-11-23T03:00:00Z",
              buyer_data: { document: "never-export" },
            },
          ],
          total: 1,
          page: 1,
          page_size: 20,
        }),
      ),
    );
    const csv = await buildAdminCsv("orders", "");
    expect(csv).toContain('"Pedido";"Valor";"Método";"Situação";"Data"');
    expect(csv).toContain('"Pago"');
    expect(csv).not.toContain("never-export");
    for (const value of [
      "=1+1",
      "+SUM(A1)",
      "-1+2",
      "@HYPERLINK(1)",
      " \t=1+1",
      "\u200B=1+1",
    ])
      expect(csvCell(value)).toBe("\"'" + value + '"');
    expect(csvCell('Nome "A"; linha\nseguinte')).toBe(
      '"Nome ""A""; linha\nseguinte"',
    );
  });
  it("interrompe falha na segunda página sem entregar arquivo parcial", async () => {
    let requests = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        ++requests === 1
          ? json({
              items: Array.from({ length: 20 }, (_, i) => ({
                id: String(i),
                full_name: "Aluno sintético",
              })),
              total: 25,
              page: 1,
              page_size: 20,
            })
          : json({ message: "Serviço indisponível." }, 503),
      ),
    );
    const publish = vi.fn();
    await expect(
      buildAdminCsv("profiles", "filtro").then(publish),
    ).rejects.toBeDefined();
    expect(publish).not.toHaveBeenCalled();
    expect(requests).toBe(2);
  });
  it("não gera arquivo se o total mudar ou exceder o limite explícito", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        json({ items: [], total: 5001, page: 1, page_size: 20 }),
      ),
    );
    await expect(buildAdminCsv("profiles", "")).rejects.toThrow("5.000");
    let page = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        json({
          items: Array.from({ length: 20 }, (_, i) => ({ id: String(i) })),
          total: ++page === 1 ? 25 : 26,
          page,
          page_size: 20,
        }),
      ),
    );
    await expect(buildAdminCsv("profiles", "")).rejects.toThrow("lista mudou");
  });
});
describe("Erros de Edge Functions em português", () => {
  it("traduz erro HTTP/Relay do SDK sem causa personalizada", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({}, 503)),
    );
    await expect(
      edge("media", { kind: "lesson", id: "synthetic" }),
    ).rejects.toThrow("Serviço indisponível nesta instalação");
    expect(
      errorMessage({
        name: "FunctionsRelayError",
        message: "Relay Error invoking the Edge Function",
      }),
    ).toBe(
      "Serviço indisponível nesta instalação. Tente novamente ou procure o suporte.",
    );
  });
  it("preserva a causa segura em português informada pelo endpoint", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        json(
          {
            error: {
              code: "CONFIGURATION_REQUIRED",
              message: "Vídeo ainda não configurado.",
            },
          },
          503,
        ),
      ),
    );
    await expect(
      edge("media", { kind: "lesson", id: "synthetic" }),
    ).rejects.toThrow("Vídeo ainda não configurado.");
  });
});
