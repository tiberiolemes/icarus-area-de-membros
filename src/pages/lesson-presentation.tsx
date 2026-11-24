import { useIsMutating, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AudioLines, CirclePlay, Flag, Sigma } from "lucide-react";
import { rpc } from "../api";
import { useAuth } from "../auth";
import { RichContent } from "../rich";
import { Action, Empty, Loading, Notice } from "../ui";
import "./lesson-presentation.css";

export type Presentation = {
  subtitle?: string;
  chapters?: { title: string; start_seconds: number; duration_seconds?: number }[];
  takeaways?: { icon: "tune" | "layers"; title: string; body: string }[];
  formula?: { label: string; reference?: string; expression: string; description?: string };
  checklist?: { id: string; label: string }[];
  cta?: { label?: string; context?: string; title: string; body: string; button: string; url: string };
};

type PresentationData = { presentation: Presentation | null; checked_ids: string[] };

export function useLessonPresentation(lessonId: string | undefined) {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const actor = session?.user.id;
  const enabled = Boolean(actor && lessonId);
  const args = { p_lesson_id: lessonId, p_edit: false };
  const queryKey = ["app_lesson_presentation", args, actor];
  const mutationKey = ["app_lesson_checklist_item", lessonId, actor];
  const query = useQuery({
    queryKey,
    enabled,
    networkMode: "always",
    queryFn: () => rpc<PresentationData>("app_lesson_presentation", args),
  });
  const saving = useIsMutating({ mutationKey, exact: true }) > 0;
  const mutation = useMutation({
    mutationKey,
    networkMode: "always",
    mutationFn: async (item: { id: string; checked: boolean; lessonId: string; actor: string }) => {
      const result = await rpc<{ checked: boolean }>("app_lesson_checklist_item", {
        p_lesson_id: item.lessonId,
        p_item_id: item.id,
        p_checked: item.checked,
      });
      if (typeof result?.checked !== "boolean") throw new Error("Checklist sem confirmação");
      return result.checked;
    },
    onMutate: () => queryClient.getQueryCache().find({ queryKey, exact: true }),
    onSuccess: (checked, item, previousQuery) => {
      const key = ["app_lesson_presentation", { p_lesson_id: item.lessonId, p_edit: false }, item.actor];
      // Um logout pode recriar a consulta com a mesma chave após um novo login.
      const currentQuery = queryClient.getQueryCache().find({ queryKey: key, exact: true });
      if (currentQuery !== previousQuery || currentQuery?.state.status !== "success") return;
      void queryClient.cancelQueries({ queryKey: key, exact: true });
      queryClient.setQueryData<PresentationData>(key, (current) => {
        if (!current) return;
        const checkedIds = current.checked_ids.filter((id) => id !== item.id);
        return { ...current, checked_ids: checked ? [...checkedIds, item.id] : checkedIds };
      });
    },
  });
  const data = enabled && !query.isError ? query.data : undefined;
  const currentItem = mutation.variables?.lessonId === lessonId && mutation.variables?.actor === actor
    ? mutation.variables?.id
    : undefined;

  return {
    presentation: data?.presentation,
    checkedIds: data?.checked_ids,
    loading: enabled && query.isPending,
    loadError: enabled && query.isError,
    retry: query.refetch,
    saving,
    failedItem: mutation.isError ? currentItem : undefined,
    onCheck(id: string, checked: boolean) {
      if (!actor || !lessonId || !data || queryClient.isMutating({ mutationKey, exact: true })) return;
      mutation.mutate({ id, checked, lessonId, actor });
    },
  };
}

const iconPath = {
  tune: "M3 17v2h6v-2H3Zm0-12v2h10V5H3Zm10 16v-2h8v-2h-8v-2h-2v6h2ZM7 9v2H3v2h4v2h2V9H7Zm14 4v-2H11v2h10Zm-6-4h2V7h4V5h-4V3h-2v6Z",
  layers: "m12 16.54 7.37-5.73L21 12.08 12 19.08 3 12.08l1.63-1.27L12 16.54Zm0-2.54L3 7l9-7 9 7-9 7Zm0-2.54L17.74 7 12 2.54 6.26 7 12 11.46Z",
  chat: "M4 4h16v12H6l-2 2V4Zm0-2a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H4Zm2 4h12v2H6Zm0 3h12v2H6Zm0 3h8v2H6Z",
};

function EditorialIcon({ name }: { name: keyof typeof iconPath }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false" fill="currentColor">
      <path d={iconPath[name]} transform={name === "layers" ? "translate(0 2)" : undefined} />
    </svg>
  );
}

function timestamp(seconds: number) {
  const whole = Math.floor(seconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor(whole / 60) % 60;
  return [hours || null, minutes, whole % 60]
    .filter((part) => part !== null)
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
}

type LessonDescriptionProps = {
  body?: string;
  presentation?: Presentation | null;
  checkedIds?: string[];
  onSeek?: (seconds: number) => void;
  activeChapter?: number;
  onCheck?: (id: string, checked: boolean) => void;
  saving?: boolean;
  failedItem?: string;
  loading?: boolean;
  loadError?: boolean;
  retry?: () => Promise<unknown>;
};

export function LessonDescription({
  body, presentation, checkedIds = [], onSeek, activeChapter, onCheck, saving, failedItem, loading, loadError, retry,
}: LessonDescriptionProps) {
  const { chapters, takeaways, formula, checklist } = presentation ?? {};
  if (!presentation || (!body && !chapters?.length && !takeaways?.length && !formula && !checklist?.length)) return (
    <>
      {body ? <RichContent content={body} /> : <Empty>Esta aula não tem descrição.</Empty>}
      {loading && <Loading />}
      {loadError && (
        <Notice error>
          Não foi possível carregar os detalhes da aula.
          {retry && <Action run={async () => { await retry(); }}>Tentar novamente</Action>}
        </Notice>
      )}
    </>
  );

  return (
    <div className="lesson-presentation">
      {body && (
        <section className="lesson-presentation-objective">
          <h2 className="lesson-presentation-label"><Flag className="stitch-lesson-mobile stitch-lesson-dark-label" size={15} aria-hidden="true" />Objetivo da Aula</h2>
          <RichContent content={body} />
        </section>
      )}
      {!!chapters?.length && (
        <section className="lesson-presentation-chapters">
          <h2 className="lesson-presentation-label">
            <span className="stitch-lesson-wide">Índice &amp; Capítulos da Aula</span>
            <span className="stitch-lesson-mobile stitch-lesson-light-label">Índice &amp; Capítulos</span>
            <span className="stitch-lesson-mobile stitch-lesson-dark-label">Capítulos da Aula</span>
          </h2>
          <span className="stitch-lesson-mobile lesson-presentation-chapter-count">
            {chapters.length} <span className="stitch-lesson-light-label">{chapters.length === 1 ? "seção" : "seções"}</span>
            <span className="stitch-lesson-dark-label">{chapters.length === 1 ? "tópico" : "tópicos"}</span>
          </span>
          <ul>
            {chapters.map(({ title, start_seconds, duration_seconds }) => {
              const selected = start_seconds === activeChapter;
              const content = (
                <>
                  <span className="stitch-lesson-wide">{timestamp(start_seconds)} · {title}</span>
                  {duration_seconds !== undefined && (
                    <span className="lesson-presentation-duration stitch-lesson-wide">{timestamp(duration_seconds)}</span>
                  )}
                  <span className="lesson-presentation-chapter-start stitch-lesson-mobile">{timestamp(start_seconds)}</span>
                  <span className="lesson-presentation-chapter-title stitch-lesson-mobile">{title}</span>
                  <span className="lesson-presentation-chapter-icon stitch-lesson-mobile stitch-lesson-light-label">
                    {selected ? <AudioLines size={16} aria-hidden="true" /> : <CirclePlay size={16} aria-hidden="true" />}
                  </span>
                </>
              );
              return (
                <li key={`${start_seconds}-${title}`}>
                  {onSeek
                    ? <button className="lesson-presentation-chapter" type="button" aria-current={selected || undefined}
                        onClick={() => onSeek(start_seconds)}>{content}</button>
                    : <div className="lesson-presentation-chapter" aria-current={selected || undefined}>{content}</div>}
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {!!takeaways?.length && (
        <div className="lesson-presentation-takeaways">
          {takeaways.map(({ icon, title, body }, index) => (
            <section className="lesson-presentation-takeaway" key={`${index}-${title}`}>
              <div className="stitch-lesson-mobile stitch-lesson-dark-label lesson-presentation-framework" aria-hidden="true">
                <span>Framework {String(index + 1).padStart(2, "0")}</span>
                <EditorialIcon name={icon} />
              </div>
              <h2><EditorialIcon name={icon} />{title}</h2>
              <p>{body}</p>
            </section>
          ))}
        </div>
      )}
      {formula && (
        <section className="lesson-presentation-formula">
          <div>
            <h2 className="lesson-presentation-label">
              <Sigma className="stitch-lesson-mobile stitch-lesson-dark-label" size={16} aria-hidden="true" />{formula.label}
            </h2>
            {formula.reference && <span>{formula.reference}</span>}
            <Sigma className="stitch-lesson-mobile stitch-lesson-light-label" size={16} aria-hidden="true" />
          </div>
          <code>{formula.expression}</code>
          {formula.description && <p>{formula.description}</p>}
        </section>
      )}
      {!!checklist?.length && (
        <section className="lesson-presentation-checklist">
          <h2><span className="stitch-lesson-wide">Checklist de Aplicação Prática</span><span className="stitch-lesson-mobile">Checklist de Aplicação</span></h2>
          <span className="stitch-lesson-mobile stitch-lesson-dark-label lesson-presentation-checklist-count">
            {checklist.length} {checklist.length === 1 ? "etapa" : "etapas"}
          </span>
          <ul>
            {checklist.map(({ id, label }) => (
              <li key={id}>
                <label>
                  <input type="checkbox" checked={checkedIds.includes(id)} disabled={!onCheck}
                    aria-disabled={saving || undefined}
                    onChange={(event) => { if (!saving) onCheck?.(id, event.currentTarget.checked); }} />
                  <span>{label}</span>
                </label>
                {failedItem === id && <Notice error>Não foi possível salvar este item. Tente novamente.</Notice>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export function LessonCta({ cta }: { cta?: Presentation["cta"] }) {
  if (!cta) return null;
  let url: URL;
  try {
    url = new URL(cta.url);
    if (url.protocol !== "https:" || url.username || url.password) return null;
  } catch {
    return null;
  }
  return (
    <aside className="lesson-presentation-cta">
      <span className="stitch-lesson-mobile stitch-lesson-dark-label lesson-presentation-cta-icon"><EditorialIcon name="chat" /></span>
      <div className="lesson-presentation-cta-copy">
        {(cta.label || cta.context) && (
          <div className="lesson-presentation-cta-context">
            {cta.label && <span className="lesson-presentation-cta-label">{cta.label}</span>}
            {cta.context && <span>{cta.context}</span>}
          </div>
        )}
        <h2><span className="stitch-lesson-mobile stitch-lesson-light-label"><EditorialIcon name="chat" /></span><span>{cta.title}</span></h2>
        <p>{cta.body}</p>
      </div>
      <a href={url.href} target="_blank" rel="noopener noreferrer">
        <EditorialIcon name="chat" />
        <span>{cta.button}</span>
      </a>
    </aside>
  );
}
