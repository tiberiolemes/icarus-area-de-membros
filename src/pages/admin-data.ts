import { useQuery } from "@tanstack/react-query";
import { cache, rpc } from "../api";
import type { Page } from "../api";

export type Row = { id: string; [key: string]: unknown };
export const text = (row: Row | undefined, key: string, fallback = "") =>
  String(row?.[key] ?? fallback);
export async function save(
  entity: string,
  id: string | null,
  data: Record<string, unknown>,
) {
  const result = await rpc<{ id: string }>("app_admin_save", {
    p_entity: entity,
    p_id: id,
    p_data: data,
  });
  await cache.invalidateQueries({ queryKey: ["app_admin_list"] });
  if (entity === "plans") await cache.invalidateQueries({ queryKey: ["app_admin_commercial"] });
  return result;
}
export function useAll(entity: string) {
  return useQuery({
    queryKey: ["app_admin_list", entity, "all"],
    queryFn: async () => {
      const first = await rpc<Page<Row>>("app_admin_list", {
        p_entity: entity,
        p_page: 1,
        p_query: "",
      });
      const items = [...first.items];
      for (let page = 2; items.length < first.total; page++) {
        const next = await rpc<Page<Row>>("app_admin_list", {
          p_entity: entity,
          p_page: page,
          p_query: "",
        });
        if (!next.items.length) break;
        items.push(...next.items);
      }
      return items;
    },
  });
}
const fileNumber = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
export function materialSize(size: number) {
  if (size >= 1_048_576) return `${fileNumber.format(size / 1_048_576)} MB`;
  if (size >= 1024) return `${fileNumber.format(size / 1024)} KB`;
  return `${fileNumber.format(size)} B`;
}
