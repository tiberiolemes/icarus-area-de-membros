import { useState } from "react";
import type { HTMLAttributes, ReactNode } from "react";
import { GripVertical } from "lucide-react";
import { cache, errorMessage } from "../api";
import { moveItem } from "../reorder";
import { Notice } from "../ui";
import { save, text, type Row } from "./admin-data";

/** Grava `order_index` só nos itens cuja posição mudou, o mesmo caminho das setas. */
export async function persistOrder(entity: string, ordered: Row[]) {
  for (const [position, item] of ordered.entries())
    if (Number(item.order_index) !== position) await save(entity, item.id, { order_index: position });
}

type RowProps = HTMLAttributes<HTMLElement> & Partial<Record<`data-${string}`, string | boolean>>;

/**
 * Arraste nativo dentro de uma lista. O item arrastado fica no estado deste hook, então soltar
 * numa linha de outra lista (outra chamada do hook) não faz nada. Linha fora de `siblings` não arrasta.
 */
export function useDragOrder(entity: string, siblings: Row[]) {
  const [dragged, setDragged] = useState<string | null>(null),
    [over, setOver] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const position = (row: Row) => siblings.findIndex((item) => item.id === row.id);
  const from = siblings.findIndex((item) => item.id === dragged);
  function clear() {
    setDragged(null);
    setOver(null);
  }
  async function drop(row: Row) {
    const to = position(row);
    clear();
    if (from < 0 || to < 0 || from === to) return;
    setBusy(true);
    setError("");
    try {
      await persistOrder(entity, moveItem(siblings, from, to));
    } catch (err) {
      setError(`A nova ordem não foi salva. ${errorMessage(err)}`);
      await cache.invalidateQueries({ queryKey: ["app_admin_list"] });
    } finally {
      setBusy(false);
    }
  }
  return {
    busy,
    notice: error ? <Notice error>{error}</Notice> : null,
    rowProps(row: Row): RowProps {
      const index = position(row);
      if (index < 0) return {};
      return {
        "data-drag-row": true,
        "data-dragging": dragged === row.id || undefined,
        // O item ocupa o lugar da linha de destino: descendo, entra depois dela; subindo, antes.
        "data-drop": over === row.id && from >= 0 && from !== index ? (from < index ? "after" : "before") : undefined,
        onDragOver(event) {
          if (from < 0 || busy) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          setOver(row.id);
        },
        onDrop(event) {
          if (from < 0 || busy) return;
          event.preventDefault();
          event.stopPropagation();
          void drop(row);
        },
      };
    },
    handle(row: Row): ReactNode {
      if (position(row) < 0) return null;
      const label = `Arrastar ${text(row, "title")}`;
      return (
        <span
          className="drag-handle"
          role="img"
          aria-label={label}
          title={label}
          aria-disabled={busy || undefined}
          draggable={!busy}
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = "move";
            // Sem dado, o Firefox não inicia o arraste.
            event.dataTransfer.setData("text/plain", text(row, "title"));
            const node = event.currentTarget.closest("[data-drag-row]");
            if (node) event.dataTransfer.setDragImage?.(node, 24, 24);
            setError("");
            setDragged(row.id);
          }}
          onDragEnd={clear}
        >
          <GripVertical size={18} aria-hidden="true" />
        </span>
      );
    },
  };
}

/** Chama o hook uma vez por lista quando as listas são montadas num laço. */
export function DragOrder({ entity, siblings, children }: {
  entity: string;
  siblings: Row[];
  children: (drag: ReturnType<typeof useDragOrder>) => ReactNode;
}) {
  const drag = useDragOrder(entity, siblings);
  return (
    <>
      {drag.notice}
      {children(drag)}
    </>
  );
}
