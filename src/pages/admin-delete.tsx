import { useId, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle } from "lucide-react";
import { cache, edge, rpc } from "../api";
import { Form, Modal, Notice, QueryState } from "../ui";
import type { Row } from "./admin-data";

export type DeletableEntity = "lessons" | "sections" | "modules" | "materials" | "material_folders";
type Preview = Record<"sections" | "lessons" | "materials" | "folders" | "students" | "comments" | "linked_materials" | "orphaned_materials", number>;

const titles: Record<DeletableEntity, string> = {
  lessons: "Excluir esta aula para sempre?",
  sections: "Excluir esta seção para sempre?",
  modules: "Excluir este módulo para sempre?",
  materials: "Excluir este material para sempre?",
  material_folders: "Excluir esta pasta para sempre?",
};
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
const list = new Intl.ListFormat("pt-BR", { type: "conjunction" });

/** Frases do modal, só com as contagens maiores que zero. */
function summary(entity: DeletableEntity, p: Preview) {
  const parts = [
    p.sections && plural(p.sections, "seção", "seções"),
    p.lessons && plural(p.lessons, "aula", "aulas"),
    p.folders && plural(p.folders, "subpasta", "subpastas"),
    p.materials && plural(p.materials, "material", "materiais"),
    p.students && `o progresso de ${plural(p.students, "aluno", "alunos")}`,
    p.comments && plural(p.comments, "comentário", "comentários"),
  ].filter((part): part is string => !!part);
  const one = (count: number) => count === 1;
  return [
    parts.length ? `Serão apagados: ${list.format(parts)}.` : "",
    p.orphaned_materials
      ? `${plural(p.orphaned_materials, "material fica", "materiais ficam")} sem aula e ${one(p.orphaned_materials) ? "volta" : "voltam"} para rascunho.`
      : "",
    p.linked_materials && entity === "material_folders"
      ? `${plural(p.linked_materials, "material desta pasta está", "materiais desta pasta estão")} em aulas e ${one(p.linked_materials) ? "deixa" : "deixam"} de aparecer nelas.`
      : "",
    p.linked_materials && entity === "materials" ? "Este material está em aulas e deixa de aparecer nelas." : "",
  ].filter(Boolean);
}

export function Archive({ entity, row }: { entity: string; row: Row }) {
  // O editor de materiais guarda uma cópia da linha; o estado local acompanha o que o servidor confirmou.
  const [archived, setArchived] = useState(row.status === "archived"),
    [open, setOpen] = useState(false),
    [done, setDone] = useState("");
  const explanation = archived
    ? "O estado anterior será restaurado."
    : "O conteúdo deixa de ser publicado; histórico, progresso e certificados são preservados.";
  return (
    <details className="archive">
      <summary>{archived ? "Restaurar registro" : "Arquivar registro"}</summary>
      <p>{explanation}</p>
      <Modal
        title={archived ? "Restaurar este registro?" : "Arquivar este registro?"}
        description={explanation}
        open={open}
        onOpenChange={setOpen}
        trigger={<button type="button">{archived ? "Restaurar" : "Arquivar"}</button>}
      >
        <Form
          label={archived ? "Confirmar restauração" : "Confirmar arquivamento"}
          successMessage=""
          secondaryAction={<button type="button" onClick={() => setOpen(false)}>Cancelar</button>}
          onSave={async () => {
            await rpc("app_admin_archive", { p_entity: entity, p_id: row.id, p_archived: !archived });
            await cache.invalidateQueries({ queryKey: ["app_admin_list"] });
            setArchived(!archived);
            setDone(archived ? "Registro restaurado." : "Registro arquivado.");
            setOpen(false);
          }}
        >
          {null}
        </Form>
      </Modal>
      {done && <p role="status">{done}</p>}
    </details>
  );
}

/** Excluir para sempre, sem senha: o modal mostra antes o que se perde. onDeleted recebe a confirmação para quem fecha o editor. */
export function DangerZone({ entity, row, onDeleted }: { entity: DeletableEntity; row: Row; onDeleted: (message: string) => void }) {
  const [open, setOpen] = useState(false),
    sending = useRef(false),
    heading = useId();
  const preview = useQuery({
    queryKey: ["app_admin_delete_preview", entity, row.id],
    queryFn: () => rpc<Preview>("app_admin_delete_preview", { p_entity: entity, p_id: row.id }),
    enabled: open,
    staleTime: 0,
  });
  return (
    <section className="danger-zone" aria-labelledby={heading}>
      <h3 id={heading}><AlertCircle size={20} aria-hidden="true" /> Zona de perigo</h3>
      <p>Excluir apaga este item e o que depende dele. Não dá para desfazer.</p>
      <Modal
        title={titles[entity]}
        description="Não dá para desfazer. Certificados já emitidos continuam válidos."
        open={open}
        // Enquanto envia, o modal fica aberto para mostrar o erro, se houver.
        onOpenChange={(next) => sending.current || setOpen(next)}
        trigger={<button type="button">Excluir para sempre</button>}
      >
        <Form
          className="danger-confirm"
          label="Excluir para sempre"
          successMessage=""
          submitDisabled={!preview.data}
          secondaryAction={<button type="button" onClick={() => setOpen(false)}>Cancelar</button>}
          onSave={async () => {
            sending.current = true;
            try {
              const result = await edge<{ deleted: true; files_removed: number; warning?: string }>("upload", {
                action: "delete", entity, id: row.id,
              });
              await cache.invalidateQueries({ queryKey: ["app_admin_list"] });
              setOpen(false);
              onDeleted(["Excluído.", result.warning].filter(Boolean).join(" "));
            } finally {
              sending.current = false;
            }
          }}
        >
          <QueryState query={preview}>
            {preview.data && summary(entity, preview.data).map((line) => <p key={line}>{line}</p>)}
          </QueryState>
        </Form>
      </Modal>
    </section>
  );
}

/** Confirmação da exclusão fora do editor, que fecha junto com a zona de perigo; recebe o foco no lugar do item apagado. */
export function useDeletedNotice() {
  const [message, setMessage] = useState(""),
    node = useRef<HTMLDivElement>(null);
  return {
    notice: message ? <div tabIndex={-1} ref={node}><Notice>{message}</Notice></div> : null,
    show(next: string) {
      setMessage(next);
      requestAnimationFrame(() => node.current?.focus());
    },
  };
}
