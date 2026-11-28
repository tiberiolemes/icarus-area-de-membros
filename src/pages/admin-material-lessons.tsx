import { useContext, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { cache, errorMessage, rpc } from "../api";
import { Dropzone } from "../dropzone";
import { overLimit } from "../optimize";
import { Action, Empty, Field, FormDraftReady, Notice, QueryState } from "../ui";
import { hints, sendFile, Upload } from "../upload";
import { statusName } from "./community";
import { materialSize, materialTypes, save, text, useAll, type Row } from "./admin-data";
import "./admin-material-lessons.css";

const byOrder = (a: Row, b: Row) => Number(a.order_index) - Number(b.order_index) || a.id.localeCompare(b.id);
const searchable = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("pt-BR");
const selection = (count: number) => `${count} ${count === 1 ? "aula selecionada" : "aulas selecionadas"}`;

/** Aulas do material por curso e módulo. A seção não aparece: a automática é invisível para a equipe. */
export function LessonLinks({ selected }: { selected: string[] }) {
  const queries = [useAll("courses"), useAll("modules"), useAll("sections"), useAll("lessons")];
  const loading = queries.some((query) => query.isPending);
  const setDraftReady = useContext(FormDraftReady);
  useLayoutEffect(() => {
    setDraftReady?.(!loading);
    return () => setDraftReady?.(true);
  }, [loading, setDraftReady]);
  const [courses, modules, sections, lessons] = queries.map((query) => query.data ?? []);
  const [filter, setFilter] = useState(""), [count, setCount] = useState(selected.length);
  const term = searchable(filter.trim());
  const groups = [...courses].sort(byOrder).map((course) => ({
    course,
    modules: modules.filter((module) => module.course_id === course.id).sort(byOrder).map((module) => ({
      module,
      lessons: sections.filter((section) => section.module_id === module.id).sort(byOrder).flatMap((section) =>
        lessons.filter((lesson) => lesson.section_id === section.id && (lesson.status !== "archived" || selected.includes(lesson.id))).sort(byOrder)),
    })).filter((group) => group.lessons.length),
  })).filter((group) => group.modules.length);
  const shown = new Set(groups.flatMap((group) => group.modules.flatMap((module) => module.lessons.map((lesson) => lesson.id))));
  // A aula aparece quando o filtro bate no título dela, do módulo ou do curso.
  const visible = new Set(groups.flatMap(({ course, modules }) => modules.flatMap(({ module, lessons }) =>
    lessons.filter((lesson) => !term || [course, module, lesson].some((row) => searchable(text(row, "title")).includes(term)))
      .map((lesson) => lesson.id))));
  const anyVisible = (rows: Row[]) => rows.some((lesson) => visible.has(lesson.id));
  return (
    <fieldset
      className="lesson-links"
      onInput={(event) => setCount([...event.currentTarget.querySelectorAll<HTMLInputElement>('input[name="lesson_ids"]')]
        .filter((input) => input.checked || input.type === "hidden").length)}
    >
      <legend>Aulas vinculadas</legend>
      <Field label="Filtrar aulas">
        <input
          type="search"
          data-no-draft
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          // O filtro não é dado do material: não marca alteração nem envia o formulário com Enter.
          onInput={(event) => event.stopPropagation()}
          onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }}
        />
      </Field>
      <p className="lesson-links-count" aria-live="polite">{selection(count)}</p>
      {/* Vínculo sem caixa na tela (lista carregando ou com erro) segue no envio, para salvar não apagar o que não se vê. */}
      {selected.filter((id) => !shown.has(id)).map((id) => <input key={id} type="hidden" name="lesson_ids" value={id} readOnly />)}
      <QueryState query={{
        isPending: loading,
        error: queries.find((query) => query.error)?.error ?? null,
        refetch: () => queries.forEach((query) => query.refetch()),
      }}>
        {groups.length ? (
          <div className="lesson-links-list">
            {groups.map(({ course, modules }) => (
              <fieldset key={course.id} hidden={!modules.some(({ lessons }) => anyVisible(lessons))}>
                <legend>{text(course, "title")}</legend>
                {modules.map(({ module, lessons }) => (
                  <fieldset key={module.id} hidden={!anyVisible(lessons)}>
                    <legend>{text(module, "title")}</legend>
                    {lessons.map((lesson) => (
                      <label className="check" key={lesson.id} hidden={!visible.has(lesson.id)}>
                        <input type="checkbox" name="lesson_ids" value={lesson.id} defaultChecked={selected.includes(lesson.id)} />
                        {text(lesson, "title")}
                        {lesson.status === "archived" && <> <span className="badge">Arquivado</span></>}
                      </label>
                    ))}
                  </fieldset>
                ))}
              </fieldset>
            ))}
            {!visible.size && <p role="status">Nenhuma aula encontrada.</p>}
          </div>
        ) : <Empty>Nenhuma aula cadastrada.</Empty>}
      </QueryState>
    </fieldset>
  );
}

// Os tipos da dica: um arquivo que a função upload recusaria nem chega a criar o material.
const materialFiles = ".pdf,.png,.jpg,.jpeg,.webp,.zip,.txt,.mp3";
// Pela extensão, porque arquivo sem tipo informado e o seletor em "Todos os arquivos" passam pelo accept.
const acceptedFile = (file: File) => materialFiles.split(",").some((extension) => file.name.toLowerCase().endsWith(extension));
// Nome do arquivo sem a extensão, com a inicial maiúscula, no limite de 200 caracteres do material.
function materialName(file: File) {
  const base = file.name.replace(/\.[^.]+$/, "") || file.name;
  return (base.charAt(0).toLocaleUpperCase("pt-BR") + base.slice(1)).slice(0, 200);
}
const draftLeft = " O arquivo foi enviado, mas o material continua em rascunho. Publique em Editar em Materiais.";

/** Materiais da aula salva. Soltar um arquivo cria o material já vinculado, como rascunho, envia e só então publica. */
export function LessonMaterials({ lessonId }: { lessonId: string }) {
  const materials = useAll("materials"),
    heading = useId(),
    [sending, setSending] = useState<{ file: File; id?: string }>(),
    [resend, setResend] = useState(""),
    [state, setState] = useState(""),
    [error, setError] = useState(""),
    controller = useRef<AbortController | null>(null),
    input = useRef<HTMLInputElement>(null),
    status = useRef<HTMLParagraphElement>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const linked = (materials.data ?? []).filter((row) => (row.lesson_ids as string[] | undefined)?.includes(lessonId));
  const publish = (id: string, file: File) => save("materials", id, { status: "published", file_type: file.type });
  // O botão usado some da lista: o foco vai para a confirmação.
  const announce = (message: string) => {
    setError("");
    setState(message);
    requestAnimationFrame(() => status.current?.focus());
  };

  async function add(file: File | undefined) {
    if (!file || controller.current) return;
    setError("");
    setState("");
    const refused = acceptedFile(file) ? overLimit(file) : "Tipo de arquivo não aceito aqui.";
    if (refused) {
      setError(refused);
      if (input.current) input.current.value = "";
      return;
    }
    const abort = (controller.current = new AbortController());
    let id = "", sent: File | undefined;
    setSending({ file });
    try {
      setState("Criando o material…");
      // Todos os membros: quem controla o acesso é a aula.
      ({ id } = await save("materials", null, {
        name: materialName(file), folder_id: null, lesson_ids: [lessonId], status: "draft",
        access_mode: "members", plan_ids: [], file_type: file.type,
      }));
      setSending({ file, id });
      sent = await sendFile("material", id, file, abort.signal, setState);
      await publish(id, sent);
      setState("Material enviado e publicado na aula.");
    } catch (err) {
      setState("");
      const aborted = abort.signal.aborted, reason = aborted ? "Envio cancelado." : errorMessage(err);
      setError(!id ? reason
        : sent ? reason + draftLeft
        // Cancelado na confirmação, o arquivo pode já ter chegado: a linha da lista mostra se ele existe.
        : aborted ? `${reason} O material ficou em rascunho.`
        : `${reason} O material ficou em rascunho, sem arquivo. Use Reenviar arquivo na lista.`);
      void materials.refetch();
    } finally {
      controller.current = null;
      setSending(undefined);
      if (input.current) input.current.value = "";
    }
  }

  async function republish(id: string, file: File) {
    setError("");
    try {
      await publish(id, file);
      announce("Arquivo enviado e material publicado na aula.");
    } catch (err) {
      setError(errorMessage(err) + draftLeft);
      void materials.refetch();
    } finally {
      // O arquivo já subiu: o reenvio fecha e o Desvincular volta, mesmo sem publicar.
      setResend("");
    }
  }

  return (
    <section className="lesson-materials" aria-labelledby={heading}>
      <h3 id={heading}>Materiais da aula</h3>
      <QueryState query={materials}>
        {linked.length ? (
          <ul className="lesson-materials-list">
            {linked.map((row) => {
              const missing = !row.storage_path, uploading = sending?.id === row.id, name = text(row, "name");
              // As ações repetem em cada linha: o nome do material vai junto para o leitor de tela.
              const which = <> <span className="sr-only">{name}</span></>;
              return (
                <li key={row.id}>
                  <div>
                    <strong>{name}</strong>
                    <span>
                      {statusName(text(row, "status"))} ·{" "}
                      {missing
                        ? uploading ? "Enviando arquivo" : "Sem arquivo"
                        : `${materialTypes[text(row, "file_type")] ?? "Arquivo"} · ${materialSize(Number(row.size_bytes))}`}
                    </span>
                  </div>
                  <div className="actions">
                    <Link className="button" to={`/admin/materiais?editar=${encodeURIComponent(row.id)}`}>Editar em Materiais{which}</Link>
                    {missing && !uploading && row.status !== "archived" && (
                      <button type="button" aria-expanded={resend === row.id} onClick={() => setResend(resend === row.id ? "" : row.id)}>
                        Reenviar arquivo{which}
                      </button>
                    )}
                    {/* Durante o envio ou com o reenvio aberto, desvincular deixaria o envio publicar o material sem aula, aberto a todos. */}
                    <Action disabled={uploading || resend === row.id} run={async () => {
                      const result = await rpc<{ id: string; status: string }>("app_admin_unlink_material", { p_material_id: row.id, p_lesson_id: lessonId });
                      await cache.invalidateQueries({ queryKey: ["app_admin_list"] });
                      announce(result.status === "draft" && row.status !== "draft"
                        ? "Material desvinculado da aula. Sem nenhuma aula, ele voltou para rascunho."
                        : "Material desvinculado da aula.");
                    }}>
                      Desvincular{which}
                    </Action>
                  </div>
                  {missing && resend === row.id && (
                    <Upload kind="material" resourceId={row.id} onUploaded={(file) => void republish(row.id, file)} />
                  )}
                </li>
              );
            })}
          </ul>
        ) : <Empty>Nenhum material nesta aula.</Empty>}
      </QueryState>
      <Dropzone
        label="Adicionar material"
        hint={hints.material}
        accept={materialFiles}
        disabled={!!sending}
        fileName={sending?.file.name}
        fileSize={sending?.file.size}
        inputRef={input}
        onFile={(file) => void add(file)}
      />
      {sending && (
        <>
          <div className="actions">
            <button type="button" onClick={() => controller.current?.abort()}>Cancelar envio</button>
          </div>
          <progress aria-label="Envio em andamento, sem estimativa percentual" />
        </>
      )}
      <p className="lesson-materials-status" role="status" tabIndex={-1} ref={status}>{state}</p>
      {error && <Notice error>{error}</Notice>}
    </section>
  );
}
