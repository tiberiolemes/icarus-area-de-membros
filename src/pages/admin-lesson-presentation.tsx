import { useId, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { ArrowDown, ArrowUp, Plus } from "lucide-react";
import { errorMessage, rpc, useRpc } from "../api";
import { RoleGate, useAuth } from "../auth";
import { Loading, Notice, QueryState, SubmitInHeading, Unsaved } from "../ui";
import { AdminSurface } from "./admin-surface";
import "./admin-lesson-presentation.css";

type Chapter = { title: string; start_seconds: number; duration_seconds?: number };
type Takeaway = { icon: "tune" | "layers"; title: string; body: string };
type ChecklistItem = { id: string; label: string };
type Formula = { label: string; reference?: string; expression: string; description?: string };
type Cta = { label?: string; context?: string; title: string; body: string; button: string; url: string };
type Presentation = {
  subtitle?: string;
  chapters?: Chapter[];
  takeaways?: Takeaway[];
  checklist?: ChecklistItem[];
  formula?: Formula;
  cta?: Cta;
};
type Draft = {
  subtitle: string;
  chapters: { id: string; title: string; start: string; duration: string }[];
  takeaways: (Takeaway & { id: string })[];
  checklist: ChecklistItem[];
  formula?: Required<Formula>;
  cta?: Required<Cta>;
};

const emptyFormula = { label: "", reference: "", expression: "", description: "" };
const emptyCta = { label: "", context: "", title: "", body: "", button: "", url: "" };
const lessonIdPattern = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;
const whatsappLink = /^https:\/\/(wa\.me|(?:(?:api|chat|web|www)\.)?whatsapp\.com)(?:[/?#](?:[A-Za-z0-9._~!$&'()*+,;=:@/?#-]|%[0-9A-Fa-f]{2})*)?$/i;
const discardMessage = "Você tem alterações não salvas. Deseja sair desta edição?";

function fromPresentation(presentation: Presentation | null): Draft {
  return {
    subtitle: presentation?.subtitle ?? "",
    chapters: (presentation?.chapters ?? []).map((chapter) => ({
      id: crypto.randomUUID(),
      title: chapter.title,
      start: String(chapter.start_seconds),
      duration: String(chapter.duration_seconds ?? ""),
    })),
    takeaways: (presentation?.takeaways ?? []).map((item) => ({ ...item, id: crypto.randomUUID() })),
    checklist: presentation?.checklist ?? [],
    formula: presentation?.formula ? { ...emptyFormula, ...presentation.formula } : undefined,
    cta: presentation?.cta ? { ...emptyCta, ...presentation.cta } : undefined,
  };
}

const formulaFields = [
  { key: "label", label: "Nome da fórmula", limit: 160, required: true },
  { key: "reference", label: "Referência (opcional)", limit: 200 },
  { key: "expression", label: "Expressão", limit: 1000, multiline: true, required: true },
  { key: "description", label: "Descrição (opcional)", limit: 2000, multiline: true },
] as const satisfies readonly BlockField<Formula>[];
const ctaFields = [
  { key: "label", label: "Etiqueta (opcional)", limit: 120 },
  { key: "context", label: "Contexto (opcional)", limit: 200 },
  { key: "title", label: "Título da chamada", limit: 160, required: true },
  { key: "body", label: "Texto da chamada", limit: 2000, multiline: true, required: true },
  { key: "button", label: "Texto do botão", limit: 80, required: true },
  { key: "url", label: "Link do WhatsApp", limit: 2048, required: true, inputMode: "url" },
] as const satisfies readonly BlockField<Cta>[];

type BlockField<T> = { key: keyof T & string; label: string; limit: number; required?: boolean; multiline?: boolean; inputMode?: "url" };
type Errors = Record<string, string>;
const hasText = (value: string) => /[^\p{White_Space}\uFEFF]/u.test(value);

function seconds(value: string) {
  const normalized = value.trim().replace(",", ".");
  return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(normalized)
    ? Number(normalized)
    : NaN;
}

// The RPC compares exact decimal numbers. Avoid rejecting equal boundaries due to float rounding.
const exceeds = (end: number, limit: number) => end - limit > Number.EPSILON * end;

function prepare(draft: Draft) {
  const errors: Errors = {};
  const presentation: Presentation = {};
  function checkText(name: string, value: string, limit: number, required = true) {
    if (!hasText(value)) {
      if (required) errors[name] = "Preencha este campo.";
      return false;
    }
    if (Array.from(value).length > limit) errors[name] = `Use até ${limit} caracteres.`;
    return true;
  }
  function block<T extends Record<string, string>>(name: string, value: T, fields: readonly BlockField<T>[]) {
    return Object.fromEntries(fields.flatMap(({ key, limit, required }) =>
      checkText(`${name}-${key}`, value[key], limit, required ?? false) ? [[key, value[key]]] : [],
    ));
  }

  if (checkText("subtitle", draft.subtitle, 200, false)) presentation.subtitle = draft.subtitle;
  let previousStart = -1;
  let previousEnd = 0;
  if (draft.chapters.length) presentation.chapters = draft.chapters.map(({ id, title, start, duration }) => {
    const startSeconds = seconds(start);
    const durationSeconds = hasText(duration) ? seconds(duration) : undefined;
    checkText(`${id}-title`, title, 160);
    if (!Number.isFinite(startSeconds) || startSeconds < 0 || startSeconds >= 86400)
      errors[`${id}-start`] = "Informe um início de 0 a menos de 86.400 segundos.";
    else if (startSeconds <= previousStart)
      errors[`${id}-start`] = "O início deve ser maior que o do capítulo anterior.";
    else if (exceeds(previousEnd, startSeconds))
      errors[`${id}-start`] = "O capítulo anterior termina depois deste início.";

    const validDuration = durationSeconds === undefined || (
      Number.isFinite(durationSeconds) && durationSeconds > 0 && durationSeconds <= 86400 &&
      !exceeds(startSeconds + durationSeconds, 86400)
    );
    if (!validDuration)
      errors[`${id}-duration`] = "Informe uma duração positiva que termine em até 86.400 segundos.";
    previousStart = startSeconds;
    previousEnd = startSeconds + (validDuration ? durationSeconds ?? 0 : 0);
    return { title, start_seconds: startSeconds, duration_seconds: durationSeconds };
  });
  if (draft.takeaways.length) presentation.takeaways = draft.takeaways.map(({ id, ...item }) => {
    checkText(`${id}-title`, item.title, 160);
    checkText(`${id}-body`, item.body, 2000);
    return item;
  });
  if (draft.checklist.length) {
    draft.checklist.forEach(({ id, label }) => checkText(`${id}-label`, label, 300));
    presentation.checklist = draft.checklist;
  }
  if (draft.formula) presentation.formula = block("formula", draft.formula, formulaFields) as Formula;
  if (draft.cta) {
    presentation.cta = block("cta", draft.cta, ctaFields) as Cta;
    if (!errors["cta-url"] && !whatsappLink.test(draft.cta.url))
      errors["cta-url"] = "Informe um link HTTPS oficial do WhatsApp, sem credenciais ou porta.";
  }
  return { errors, presentation: Object.keys(presentation).length ? presentation : null };
}

type EditorProps = { lessonId: string; lessonTitle?: string; onClose?: () => void };

export function AdminLessonPresentationPage() {
  const { id, lessonId } = useParams();
  const validLesson = Boolean(id && lessonId && lessonIdPattern.test(id) && lessonIdPattern.test(lessonId));
  const query = useRpc<{ course_title: string; module_title: string; lesson_title: string }>("app_admin_lesson_context",
    { p_course_id: id, p_lesson_id: lessonId }, validLesson);
  const data = query.data;
  const coursePath = id ? `/admin/cursos/${encodeURIComponent(id)}?aba=estrutura` : "/admin/cursos";
  return (
    <AdminSurface formAction section="aula-apresentacao"
      trail={["Administração", { label: data?.course_title ?? "Cursos e aulas", to: coursePath }, ...(data ? [data.module_title] : []), "Apresentação"]}
      title={data ? data.lesson_title : "Editar apresentação"}
      description="Edite os capítulos e os materiais complementares da aula.">
      {validLesson ? <QueryState query={query}>
        {data && <AdminLessonPresentation lessonId={lessonId!} />}
      </QueryState> : <Notice error>Selecione uma aula cadastrada para editar sua apresentação.</Notice>}
    </AdminSurface>
  );
}

export function AdminLessonPresentation(props: EditorProps) {
  const { session } = useAuth();
  const titleId = useId();
  const lessonId = props.lessonId.toLowerCase();
  return (
    <section className="lesson-presentation-editor" aria-labelledby={titleId} data-tour="lesson-presentation-editor">
      <header className="lesson-presentation-editor__heading">
        <h2 id={titleId}>Apresentação da aula</h2>
        {props.lessonTitle && <p>{props.lessonTitle}</p>}
      </header>
      <RoleGate roles={["admin", "instructor"]}>
        {lessonIdPattern.test(lessonId) ? (
          <PresentationEntry
            key={`${session?.user.id}:${lessonId}`}
            lessonId={lessonId}
            actorId={session?.user.id}
            onClose={props.onClose}
          />
        ) : <Notice error>Selecione uma aula cadastrada para editar sua apresentação.</Notice>}
      </RoleGate>
    </section>
  );
}

function PresentationEntry({ lessonId, actorId, onClose }: EditorProps & { actorId?: string }) {
  const client = useQueryClient();
  const queryKey = ["admin-lesson-presentation", actorId, lessonId];
  const query = useQuery({
    queryKey,
    networkMode: "always",
    queryFn: async () => {
      const result = await rpc<{ presentation: Presentation | null }>("app_lesson_presentation", {
        p_lesson_id: lessonId, p_edit: true,
      });
      return result.presentation;
    },
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
  });

  if (query.data === undefined) return (
    <>
      {query.isFetching ? <Loading /> : (
        <>
          <Notice error>{errorMessage(query.error)}</Notice>
          <button type="button" onClick={() => void query.refetch()}>Tentar novamente</button>
        </>
      )}
      {onClose && <button type="button" onClick={onClose}>Fechar editor</button>}
    </>
  );

  return (
    <PresentationForm initial={query.data} onClose={onClose} onSave={async (presentation) => {
      const current = client.getQueryCache().find({ queryKey, exact: true });
      const result = await rpc<{ lesson_id: string }>("app_admin_save_lesson_presentation", {
        p_lesson_id: lessonId, p_presentation: presentation,
      });
      if (result?.lesson_id !== lessonId) throw new Error("Não foi possível confirmar o salvamento. Tente novamente.");
      if (current && current === client.getQueryCache().find({ queryKey, exact: true })) {
        client.setQueryData(queryKey, presentation);
        void client.invalidateQueries({ queryKey: ["app_lesson_presentation", { p_lesson_id: lessonId }] });
      }
    }} />
  );
}

function EditorField({ name, label, value, onChange, error, multiline, required, inputMode }: {
  name: string; label: string; value: string; onChange: (value: string) => void; error?: string;
  multiline?: boolean; required?: boolean; inputMode?: "decimal" | "url";
}) {
  const id = useId();
  const props = {
    id, name, value, required, inputMode,
    "aria-invalid": !!error,
    "aria-describedby": error ? `${id}-error` : undefined,
  };
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {multiline ? <textarea {...props} rows={3} onChange={(event) => onChange(event.target.value)} />
        : <input {...props} onChange={(event) => onChange(event.target.value)} />}
      {error && <small className="field-error" id={`${id}-error`}>{error}</small>}
    </div>
  );
}

function focusAfterRender(target: () => HTMLElement | null | undefined) {
  requestAnimationFrame(() => target()?.focus());
}

function EditorialList<T extends { id: string }>({ label, itemLabel, limit, rows, create, onChange, children, hint }: {
  label: string; itemLabel: string; limit: number; rows: T[]; create: () => T;
  onChange: (rows: T[]) => void; children: (item: T, update: (item: T) => void) => ReactNode; hint?: string;
}) {
  const headingId = useId();
  const add = useRef<HTMLButtonElement>(null);
  const rowId = (id: string) => `${headingId}-${id}`;
  function move(index: number, offset: number) {
    const next = [...rows];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    onChange(next);
    focusAfterRender(() => document.getElementById(rowId(rows[index].id)));
  }
  return (
    <section className="lesson-presentation-editor__block" aria-labelledby={headingId}>
      <h3 id={headingId}>{label}</h3>
      {hint && <p className="lesson-presentation-editor__hint">{hint}</p>}
      {rows.length > 0 && <ol className="lesson-presentation-editor__items">
        {rows.map((row, index) => {
          const position = `${itemLabel.toLocaleLowerCase("pt-BR")} ${index + 1}`;
          return (
            <li key={row.id}>
              <div className="lesson-presentation-editor__item-bar">
                <h4 id={rowId(row.id)} tabIndex={-1}>{itemLabel} {index + 1}</h4>
                <div className="lesson-presentation-editor__item-actions">
                  <button type="button" aria-label={`Mover ${position} para cima`} disabled={index === 0} onClick={() => move(index, -1)}>
                    <ArrowUp size={18} aria-hidden="true" />
                  </button>
                  <button type="button" aria-label={`Mover ${position} para baixo`} disabled={index === rows.length - 1} onClick={() => move(index, 1)}>
                    <ArrowDown size={18} aria-hidden="true" />
                  </button>
                  <button type="button" aria-label={`Remover ${position}`} onClick={() => {
                    const target = rows[index + 1] ?? rows[index - 1];
                    onChange(rows.filter((item) => item.id !== row.id));
                    focusAfterRender(() => target ? document.getElementById(rowId(target.id)) : add.current);
                  }}>Remover</button>
                </div>
              </div>
              <div role="group" aria-labelledby={rowId(row.id)}>
                {children(row, (updated) => onChange(rows.map((item) => item.id === row.id ? updated : item)))}
              </div>
            </li>
          );
        })}
      </ol>}
      <button type="button" ref={add} disabled={rows.length >= limit} onClick={() => {
        const item = create();
        onChange([...rows, item]);
        focusAfterRender(() => document.getElementById(rowId(item.id))?.closest("li")?.querySelector("input, select, textarea"));
      }}><Plus size={18} aria-hidden="true" /> Adicionar {itemLabel.toLocaleLowerCase("pt-BR")}</button>
      {rows.length >= limit && <p className="lesson-presentation-editor__hint">Limite de {limit} itens atingido.</p>}
    </section>
  );
}

function OptionalBlock<T extends Record<string, string>>({ name, label, value, fields, errors, onChange, empty, hint }: {
  name: string; label: string; value?: T; empty: T; fields: readonly BlockField<T>[];
  errors: Errors; onChange: (value?: T) => void; hint?: string;
}) {
  const headingId = useId();
  const section = useRef<HTMLElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  return (
    <section ref={section} className="lesson-presentation-editor__block" aria-labelledby={headingId}>
      <h3 id={headingId}>{label}</h3>
      {hint && <p className="lesson-presentation-editor__hint">{hint}</p>}
      {value && fields.map(({ key, limit: _limit, ...field }) => (
        <EditorField key={key} {...field} name={`${name}-${key}`} value={value[key]}
          error={errors[`${name}-${key}`]} onChange={(text) => onChange({ ...value, [key]: text })} />
      ))}
      <button type="button" ref={toggle} onClick={() => {
        onChange(value ? undefined : empty);
        focusAfterRender(() => value ? toggle.current : section.current?.querySelector("input"));
      }}>
        {!value && <Plus size={18} aria-hidden="true" />}
        {value ? "Remover" : "Adicionar"} {label.toLocaleLowerCase("pt-BR")}
      </button>
    </section>
  );
}

function PresentationForm({ initial, onSave, onClose }: {
  initial: Presentation | null; onSave: (presentation: Presentation | null) => Promise<void>; onClose?: () => void;
}) {
  const formId = useId();
  const [saved, setSaved] = useState(() => fromPresentation(initial));
  const [draft, setDraft] = useState(saved);
  const [errors, setErrors] = useState<Errors>({});
  const [message, setMessage] = useState<{ text: string; error?: boolean }>();
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const feedback = useRef<HTMLDivElement>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  function update(change: Partial<Draft>) {
    setDraft((previous) => ({ ...previous, ...change }));
    setMessage(undefined);
    setErrors({});
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (lock.current || !dirty) return;
    const next = prepare(draft);
    const invalid = Object.keys(next.errors)[0];
    if (invalid) {
      setErrors(next.errors);
      setMessage({ text: "Revise os campos indicados antes de salvar.", error: true });
      focusAfterRender(() => form.elements.namedItem(invalid) as HTMLElement | null);
      return;
    }
    const retained = new Set(draft.checklist.map(({ id }) => id));
    if (saved.checklist.some(({ id }) => !retained.has(id)) &&
      !window.confirm("Salvar a remoção? As marcações dos alunos nos itens removidos serão apagadas.")) return;

    lock.current = true;
    setBusy(true);
    setMessage(undefined);
    try {
      await onSave(next.presentation);
      setSaved(draft);
      setMessage({ text: "Apresentação salva." });
      focusAfterRender(() => feedback.current);
    } catch (error) {
      setMessage({ text: errorMessage(error), error: true });
      focusAfterRender(() => feedback.current);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <Unsaved dirty={dirty} />
      <form id={formId} noValidate autoComplete="off" onSubmit={submit} aria-busy={busy}>
        <fieldset disabled={busy}>
          <EditorField name="subtitle" label="Subtítulo (opcional)" value={draft.subtitle}
            error={errors.subtitle} onChange={(subtitle) => update({ subtitle })} />

          <EditorialList label="Capítulos" itemLabel="Capítulo" rows={draft.chapters} limit={40}
            hint="Use segundos em ordem crescente. A duração é opcional e não pode invadir o capítulo seguinte."
            create={() => ({ id: crypto.randomUUID(), title: "", start: "", duration: "" })}
            onChange={(chapters) => update({ chapters })}>
            {(row, set) => <>
              <EditorField name={`${row.id}-title`} label="Título do capítulo" value={row.title}
                required error={errors[`${row.id}-title`]} onChange={(title) => set({ ...row, title })} />
              <div className="lesson-presentation-editor__grid">
                <EditorField name={`${row.id}-start`} label="Início em segundos" value={row.start} inputMode="decimal"
                  required error={errors[`${row.id}-start`]} onChange={(start) => set({ ...row, start })} />
                <EditorField name={`${row.id}-duration`} label="Duração em segundos (opcional)" value={row.duration} inputMode="decimal"
                  error={errors[`${row.id}-duration`]} onChange={(duration) => set({ ...row, duration })} />
              </div>
            </>}
          </EditorialList>

          <EditorialList label="Destaques" itemLabel="Destaque" rows={draft.takeaways} limit={20}
            create={() => ({ id: crypto.randomUUID(), icon: "tune" as const, title: "", body: "" })}
            onChange={(takeaways) => update({ takeaways })}>
            {(row, set) => <>
              <label className="field">Ícone
                <select value={row.icon} onChange={(event) => set({ ...row, icon: event.target.value === "layers" ? "layers" : "tune" })}>
                  <option value="tune">Ajustes</option>
                  <option value="layers">Camadas</option>
                </select>
              </label>
              <EditorField name={`${row.id}-title`} label="Título do destaque" value={row.title}
                required error={errors[`${row.id}-title`]} onChange={(title) => set({ ...row, title })} />
              <EditorField name={`${row.id}-body`} label="Texto do destaque" value={row.body}
                multiline required error={errors[`${row.id}-body`]} onChange={(body) => set({ ...row, body })} />
            </>}
          </EditorialList>

          <OptionalBlock name="formula" label="Fórmula" value={draft.formula} empty={emptyFormula}
            fields={formulaFields} errors={errors} onChange={(formula) => update({ formula })} />

          <EditorialList label="Checklist" itemLabel="Item" rows={draft.checklist} limit={40}
            hint="Editar ou mover um item preserva as marcações dos alunos. Removê-lo apaga suas marcações ao salvar."
            create={() => ({ id: crypto.randomUUID(), label: "" })} onChange={(checklist) => update({ checklist })}>
            {(row, set) => <EditorField name={`${row.id}-label`} label="Texto do item" value={row.label}
              required error={errors[`${row.id}-label`]} onChange={(label) => set({ ...row, label })} />}
          </EditorialList>

          <OptionalBlock name="cta" label="Chamada para ação" value={draft.cta} empty={emptyCta}
            fields={ctaFields} errors={errors} onChange={(cta) => update({ cta })}
            hint="Use um link HTTPS oficial do WhatsApp, como wa.me ou whatsapp.com." />
        </fieldset>

        <div className="lesson-presentation-editor__footer">
          {message && <div tabIndex={-1} ref={feedback}><Notice error={message.error}>{message.text}</Notice></div>}
          <div className="form-actions">
            <SubmitInHeading>
              <button className="primary" type="submit" form={formId} disabled={busy || !dirty}>
                {busy ? "Salvando…" : "Salvar apresentação"}
              </button>
            </SubmitInHeading>
            {onClose && <button type="button" disabled={busy} onClick={() => {
              if (!dirty || window.confirm(discardMessage)) onClose();
            }}>Fechar editor</button>}
          </div>
        </div>
      </form>
    </>
  );
}
