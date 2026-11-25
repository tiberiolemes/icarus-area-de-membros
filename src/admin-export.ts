import { date, money, roleLabel, rpc } from "./api";
import type { Page } from "./api";

export type AdminExportEntity = "profiles" | "orders";
export const exportLimit = 5000;
type ExportRow = {
  id: string;
  full_name?: string;
  role?: string;
  suspended?: boolean;
  amount_cents?: number;
  method?: string;
  status?: string;
  created_at?: string;
};
export function csvCell(value: unknown) {
  let text = String(value ?? "");
  if (/^[\s\u0000-\u001f\u200B\uFEFF]*[=+\-@]/u.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
export async function buildAdminCsv(entity: AdminExportEntity, query: string, filters?: { p_role: string | null; p_plan: string | null; p_status: string | null }) {
  const rows: ExportRow[] = [],
    ids = new Set<string>();
  let expected: number | undefined;
  for (let page = 1; page <= Math.ceil(exportLimit / 20); page++) {
    const result = await rpc<Page<ExportRow>>(filters ? "app_admin_commercial" : "app_admin_list", {
      p_entity: entity,
      p_query: query,
      p_page: page,
      ...filters,
    });
    if (
      !Number.isInteger(result.total) ||
      result.total < 0 ||
      result.total > exportLimit
    )
      throw new Error(
        `A exportação aceita até ${exportLimit.toLocaleString("pt-BR")} registros. Refine a busca antes de exportar.`,
      );
    expected ??= result.total;
    if (
      result.total !== expected ||
      !Array.isArray(result.items) ||
      result.items.length > 20
    )
      throw new Error(
        "A lista mudou durante a exportação. Tente novamente para obter um arquivo completo.",
      );
    for (const row of result.items) {
      if (!row.id || ids.has(row.id))
        throw new Error(
          "Não foi possível confirmar todos os registros da exportação. Tente novamente.",
        );
      ids.add(row.id);
      rows.push(row);
    }
    if (rows.length === expected) {
      const header =
        entity === "profiles"
          ? ["Nome", "Papel", "Situação"]
          : ["Pedido", "Valor", "Método", "Situação", "Data"];
      const body = rows.map((row) =>
        entity === "profiles"
          ? [
              row.full_name,
              roleLabel(row.role),
              row.suspended ? "Suspenso" : "Ativo",
            ]
          : [
              row.id,
              money(Number(row.amount_cents)),
              row.method,
              orderStatus(row.status),
              date(row.created_at),
            ],
      );
      return (
        "\uFEFF" +
        [header, ...body]
          .map((row) => row.map(csvCell).join(";"))
          .join("\r\n") +
        "\r\n"
      );
    }
    if (!result.items.length || rows.length > expected)
      throw new Error(
        "A lista mudou durante a exportação. Nenhum arquivo parcial foi gerado.",
      );
  }
  throw new Error(
    "Não foi possível concluir a exportação. Refine a busca e tente novamente.",
  );
}
function orderStatus(status?: string) {
  return (
    (
      {
        pending: "Pendente",
        paid: "Pago",
        refunded: "Estornado",
        chargeback: "Chargeback",
        expired: "Expirado",
        cancelled: "Cancelado",
      } as Record<string, string>
    )[status ?? ""] ??
    status ??
    ""
  );
}
