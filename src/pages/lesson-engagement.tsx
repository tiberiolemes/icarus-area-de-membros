import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Bookmark, Check, Clock, MessageSquare, NotebookPen, Pencil, Trash2, UserRound,
} from "lucide-react";
import { AppError, date, errorMessage, rpc, useRpc } from "../api";
import type { Page } from "../api";
import { Action, Empty, Field, Form, Notice, QueryState, value } from "../ui";
import "./lesson-engagement.css";

export type LessonEngagement = {
  saved: boolean;
  notes_count: number;
  comments_count: number;
};

export type LessonNote = {
  id: string;
  body: string;
  position_seconds: number | null;
  updated_at: string;
};

export type LessonComment = {
  id: string;
  author_name: string;
  body: string;
  parent_id: string | null;
  status: "pending" | "approved" | "rejected";
  is_instructor: boolean;
  created_at: string;
};

type LessonProps = { lessonId: string };
type PanelProps = LessonProps & { active?: boolean };
type Saved = Pick<LessonEngagement, "saved">;
type CommentResult = Pick<LessonComment, "id" | "status">;
type Decision = "approve" | "reject";

const engagementRpc = "app_lesson_engagement";
const notesRpc = "app_lesson_notes";
const commentsRpc = "app_lesson_comments";

export function useLessonEngagement(lessonId: string | undefined) {
  return useRpc<LessonEngagement>(engagementRpc, { p_lesson_id: lessonId }, !!lessonId);
}

function useRefreshEngagement(lessonId: string) {
  const client = useQueryClient();
  return (name: typeof notesRpc | typeof commentsRpc) =>
    Promise.all([name, engagementRpc].map((rpcName) =>
      client.invalidateQueries({ queryKey: [rpcName, { p_lesson_id: lessonId }] }),
    ));
}

export function LessonEngagementActions({
  lessonId,
  onOpenNotes,
}: LessonProps & { onOpenNotes: () => void }) {
  return (
    <div className="lesson-engagement-actions">
      <LessonFavorite key={lessonId} lessonId={lessonId} />
      <button
        type="button" className="lesson-engagement-icon"
        aria-label="Fazer anotação" title="Fazer anotação" onClick={onOpenNotes}
      >
        <NotebookPen size={20} aria-hidden="true" />
      </button>
    </div>
  );
}

export function LessonFavorite({ lessonId }: LessonProps) {
  const query = useLessonEngagement(lessonId);
  const client = useQueryClient();
  const lock = useRef(false);
  const button = useRef<HTMLButtonElement>(null);
  const key = [engagementRpc, { p_lesson_id: lessonId }];
  const mutation = useMutation({
    mutationFn: (saved: boolean) =>
      rpc<Saved>("app_lesson_favorite", { p_lesson_id: lessonId, p_saved: saved }),
    onMutate: () => client.getQueryCache().find({ queryKey: key, exact: true }),
    onSuccess: async ({ saved }, _requested, source) => {
      // A sessão pode ter terminado enquanto o servidor respondia.
      if (!source || client.getQueryCache().find({ queryKey: key, exact: true }) !== source) return;
      client.setQueryData<LessonEngagement>(key, (current) =>
        current ? { ...current, saved } : undefined,
      );
      await client.invalidateQueries({ queryKey: key, exact: true });
    },
  });
  const saved = query.data?.saved;
  const unavailable = saved === undefined || !!query.error;
  const label = saved ? "Remover dos favoritos" : "Favoritar aula";
  return (
    <div className="lesson-engagement-favorite">
      <button
        ref={button}
        type="button" className="lesson-engagement-icon"
        aria-label="Favoritar aula" title={label}
        aria-pressed={unavailable ? undefined : saved}
        aria-busy={query.isPending || mutation.isPending}
        aria-disabled={unavailable || mutation.isPending}
        onClick={() => {
          if (unavailable || lock.current) return;
          lock.current = true;
          mutation.mutate(!saved, { onSettled: () => { lock.current = false; } });
        }}
      >
        <Bookmark size={20} fill={saved && !unavailable ? "currentColor" : "none"} aria-hidden="true" />
      </button>
      {query.error && (
        <div className="lesson-engagement-favorite-feedback">
          <span role="alert">{errorMessage(query.error)}</span>{" "}
          <button type="button" onClick={async () => {
            const result = await query.refetch();
            if (!result.error) button.current?.focus();
          }}>Tentar novamente</button>
        </div>
      )}
      {mutation.error && (
        <span className="lesson-engagement-favorite-feedback" role="alert">
          {errorMessage(mutation.error)}
        </span>
      )}
    </div>
  );
}

export function LessonEngagementTab({
  tab,
  active,
  count,
  id,
  panelId,
  onOpen,
}: {
  tab: "comments" | "notes";
  active: boolean;
  count?: number;
  id: string;
  panelId: string;
  onOpen: () => void;
}) {
  const Icon = tab === "comments" ? MessageSquare : NotebookPen;
  const label = tab === "comments" ? "Comentários" : "Anotações pessoais";
  const showCount = tab === "comments" && count !== undefined;
  return (
    <button
      type="button" className={`lesson-engagement-tab lesson-engagement-tab-${tab}`} role="tab" id={id}
      aria-selected={active} aria-controls={panelId} tabIndex={active ? 0 : -1}
      aria-label={showCount ? `${label} ${count}` : label}
      onClick={onOpen}
    >
      <Icon size={18} aria-hidden="true" />
      {tab === "notes" ? <>
        <span className="stitch-lesson-wide">{label}</span>
        <span className="stitch-lesson-mobile">Anotações</span>
      </> : <span>{label}</span>}
      {showCount && (
        <span className="lesson-engagement-tab-count">{count}</span>
      )}
    </button>
  );
}

function timestamp(seconds: number) {
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor(total / 60) % 60;
  const s = total % 60;
  const clock = [m, s].map((part) => String(part).padStart(2, "0")).join(":");
  return h > 0 ? `${h}:${clock}` : clock;
}

function requiredText(data: FormData, field: string, message: string, maximum: number, minimum = 1) {
  const text = value(data, field);
  const length = Array.from(text).length;
  if (length < minimum || length > maximum) throw new AppError(message);
  return text;
}

function Pagination({
  data, onPage, disabled,
}: { data: Page<unknown>; onPage: (page: number) => void; disabled?: boolean }) {
  const pages = Math.max(1, Math.ceil(data.total / data.page_size));
  if (pages <= 1) return null;
  return (
    <nav className="lesson-engagement-pagination" aria-label="Paginação">
      <button type="button" disabled={disabled || data.page <= 1} onClick={() => onPage(data.page - 1)}>
        Anterior
      </button>
      <span>Página {data.page} de {pages}</span>
      <button type="button" disabled={disabled || data.page >= pages} onClick={() => onPage(data.page + 1)}>
        Próxima
      </button>
    </nav>
  );
}

const emptyNote = { note: null, body: "" };

export function LessonNotes(props: PanelProps & {
  getPositionSeconds?: () => number | null;
  onSeek?: (seconds: number) => void;
  focusRequest?: number;
}) {
  return <NotesPanel key={props.lessonId} {...props} />;
}

function NotesPanel({
  lessonId, active = true, getPositionSeconds, onSeek, focusRequest = 0,
}: Parameters<typeof LessonNotes>[0]) {
  const [page, setPage] = useState(1);
  const [editor, setEditor] = useState<{ note: LessonNote | null; body: string }>(emptyNote);
  const [deleted, setDeleted] = useState(false);
  const [formRevision, setFormRevision] = useState(0);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const lastFocusRequest = useRef(0);
  const query = useRpc<Page<LessonNote>>(notesRpc, { p_lesson_id: lessonId, p_page: page }, active);
  const refresh = useRefreshEngagement(lessonId);
  const available = !!query.data && !query.error;
  const save = useMutation({
    mutationFn: ({ body, note, position }: { body: string; note: LessonNote | null; position: number | null }) =>
      rpc<Pick<LessonNote, "id">>("app_save_lesson_note", {
        p_lesson_id: lessonId, p_id: note?.id ?? null, p_body: body, p_position_seconds: position,
      }),
    onSuccess: async () => {
      setPage(1);
      await refresh(notesRpc);
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => rpc<Pick<LessonNote, "id">>("app_delete_lesson_note", {
      p_lesson_id: lessonId, p_id: id,
    }),
    onSuccess: async () => {
      setPage(1);
      await refresh(notesRpc);
    },
  });
  const busy = save.isPending || remove.isPending;
  const focusEditor = () => requestAnimationFrame(() => textarea.current?.focus());
  const openEditor = (note: LessonNote | null) => {
    if (editor.body !== (editor.note?.body ?? "") &&
        !window.confirm("Descartar o texto não salvo desta anotação?")) return;
    setEditor(note ? { note, body: note.body } : emptyNote);
    setFormRevision((revision) => revision + 1);
    setDeleted(false);
    focusEditor();
  };

  useEffect(() => {
    if (active && available && !busy && focusRequest && focusRequest !== lastFocusRequest.current) {
      lastFocusRequest.current = focusRequest;
      textarea.current?.focus();
    }
  }, [active, available, busy, focusRequest]);

  return (
    <div className="lesson-engagement-panel">
      <Form
        key={formRevision}
        className="lesson-engagement-form lesson-engagement-note-form"
        label={editor.note ? "Salvar alterações" : "Salvar anotação"}
        successMessage="Anotação salva."
        disabled={!available || remove.isPending}
        secondaryAction={editor.note && (
          <button type="button" onClick={() => openEditor(null)}>Cancelar edição</button>
        )}
        onSave={async (data) => {
          setDeleted(false);
          const body = requiredText(data, "body", "Escreva uma anotação de até 2.000 caracteres.", 2000);
          const current = editor.note ? editor.note.position_seconds : getPositionSeconds?.();
          const position = typeof current === "number" && Number.isFinite(current) && current >= 0
            ? current : null;
          await save.mutateAsync({ note: editor.note, body, position });
        }}
        onDone={() => { setEditor(emptyNote); focusEditor(); }}
      >
        <Field
          label={editor.note ? "Editar anotação pessoal" : "Suas anotações pessoais"}
          hint={!editor.note && getPositionSeconds ? "Ao salvar, a anotação guarda a posição atual da aula." : undefined}
        >
          <textarea
            ref={textarea} name="body" rows={6} required
            placeholder="Escreva uma anotação privada sobre esta aula."
            value={editor.body}
            onChange={(event) => {
              setEditor({ ...editor, body: event.target.value });
              setDeleted(false);
            }}
          />
        </Field>
      </Form>
      {deleted && <p className="lesson-engagement-feedback" role="status"><Check size={16} aria-hidden="true" /> Anotação excluída.</p>}
      <div className="lesson-engagement-list" ref={list} role="region" aria-label="Anotações salvas" tabIndex={-1}>
        <QueryState query={query}>
          {query.data?.items.length ? (
            <ul className="lesson-engagement-items">
              {query.data.items.map((note) => {
                const seconds = note.position_seconds;
                return (
                  <li className="lesson-engagement-item" key={note.id}>
                    <div className="lesson-engagement-item-header">
                      <time dateTime={note.updated_at}>{date(note.updated_at)}</time>
                      {seconds !== null && (onSeek ? (
                        <button type="button" className="lesson-engagement-time"
                          aria-label={`Ir para ${timestamp(seconds)} na aula`}
                          onClick={() => onSeek(seconds)}>
                          <Clock size={16} aria-hidden="true" /> {timestamp(seconds)}
                        </button>
                      ) : <span>{timestamp(seconds)}</span>)}
                    </div>
                    <p className="lesson-engagement-body">{note.body}</p>
                    <div className="lesson-engagement-row-actions">
                      <button type="button" disabled={busy} onClick={() => openEditor(note)}>
                        <Pencil size={16} aria-hidden="true" /> Editar
                      </button>
                      <Action
                        disabled={busy}
                        confirm="Excluir esta anotação? O texto será removido."
                        run={async () => {
                          await remove.mutateAsync(note.id);
                          if (editor.note?.id === note.id) {
                            setEditor(emptyNote);
                            setFormRevision((revision) => revision + 1);
                          }
                          setDeleted(true);
                          focusEditor();
                        }}
                      >
                        <Trash2 size={16} aria-hidden="true" /> Excluir
                      </Action>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : <Empty>Nenhuma anotação pessoal nesta aula.</Empty>}
          {query.data && <Pagination data={query.data} disabled={busy} onPage={(next) => {
            setPage(next);
            list.current?.focus();
          }} />}
        </QueryState>
      </div>
    </div>
  );
}

function CommentHeader({ comment, replyTo }: { comment: LessonComment; replyTo?: string }) {
  return (
    <div className="lesson-engagement-item-header">
      <strong>{comment.author_name}</strong>
      {comment.is_instructor && <span className="lesson-engagement-tag">Instrutor</span>}
      <time dateTime={comment.created_at}>{date(comment.created_at)}</time>
      {comment.parent_id && <span>{replyTo ? `Resposta a ${replyTo}` : "Resposta"}</span>}
      {comment.status === "pending" && <span className="lesson-engagement-tag">Em moderação</span>}
      {comment.status === "rejected" && <span className="lesson-engagement-tag">Rejeitado</span>}
    </div>
  );
}

export function LessonComments(props: PanelProps & { authorName?: string }) {
  return <CommentsPanel key={props.lessonId} {...props} />;
}

function CommentsPanel({ lessonId, active = true, authorName }: Parameters<typeof LessonComments>[0]) {
  const [page, setPage] = useState(1);
  const [body, setBody] = useState("");
  const [parent, setParent] = useState<LessonComment | null>(null);
  const [feedback, setFeedback] = useState("");
  const [formRevision, setFormRevision] = useState(0);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const query = useRpc<Page<LessonComment>>(commentsRpc, {
    p_lesson_id: lessonId, p_page: page, p_review: false,
  }, active);
  const refresh = useRefreshEngagement(lessonId);
  const save = useMutation({
    mutationFn: (comment: string) => rpc<CommentResult>("app_save_lesson_comment", {
      p_lesson_id: lessonId, p_parent_id: parent?.id ?? null, p_body: comment,
    }),
    onSuccess: () => refresh(commentsRpc),
  });
  const comments = query.data?.items ?? [];
  const roots = new Map(comments.filter((comment) => !comment.parent_id)
    .map((comment) => [comment.id, comment.author_name]));
  const replies = new Map<string, LessonComment[]>();
  for (const comment of comments) {
    if (comment.parent_id && roots.has(comment.parent_id)) {
      const siblings = replies.get(comment.parent_id) ?? [];
      siblings.push(comment);
      replies.set(comment.parent_id, siblings);
    }
  }
  const ordered = comments.flatMap((comment) =>
    comment.parent_id && roots.has(comment.parent_id)
      ? []
      : [comment, ...(replies.get(comment.id) ?? [])],
  );
  const initials = authorName?.trim().split(/\s+/).slice(0, 2).map((name) => Array.from(name)[0]).join("");
  const focusEditor = () => requestAnimationFrame(() => textarea.current?.focus());
  const chooseParent = (next: LessonComment | null) => {
    if (parent?.id !== next?.id) {
      if (body.trim() && !window.confirm("Descartar o comentário que você está escrevendo?")) return;
      setBody("");
      setParent(next);
      setFeedback("");
      setFormRevision((revision) => revision + 1);
    }
    focusEditor();
  };
  return (
    <div className="lesson-engagement-panel">
      <div className="lesson-engagement-composer">
        <span className="lesson-engagement-avatar" aria-hidden="true">
          {initials || <UserRound size={20} />}
        </span>
        <Form
          key={formRevision}
          className={parent ? "lesson-engagement-form" : "lesson-engagement-form lesson-engagement-comment-form"}
          label={parent ? "Enviar resposta" : "Publicar comentário"}
          disabled={!query.data || !!query.error}
          successMessage=""
          secondaryAction={parent && (
            <button type="button" onClick={() => chooseParent(null)}>Cancelar resposta</button>
          )}
          onSave={async (data) => {
            setFeedback("");
            const comment = requiredText(data, "body", "Escreva um comentário de até 10.000 caracteres.", 10000);
            const result = await save.mutateAsync(comment);
            setFeedback(result.status === "pending"
              ? "Comentário enviado para moderação."
              : "Comentário enviado.");
          }}
          onDone={() => { setBody(""); setParent(null); focusEditor(); }}
        >
          <Field label={parent ? `Resposta a ${parent.author_name}` : "Seu comentário"}>
            <textarea
              ref={textarea} name="body" rows={3} required
              placeholder="Deixe uma dúvida ou reflexão sobre a aula…"
              value={body} onChange={(event) => { setBody(event.target.value); setFeedback(""); }}
            />
          </Field>
        </Form>
      </div>
      {feedback && <p className="lesson-engagement-feedback" role="status"><Check size={16} aria-hidden="true" /> {feedback}</p>}
      <div className="lesson-engagement-list" ref={list} role="region" aria-label="Comentários da aula" tabIndex={-1}>
        <QueryState query={query}>
          {ordered.length ? (
            <ul className="lesson-engagement-items">
              {ordered.map((comment) => {
                const replyTo = comment.parent_id ? roots.get(comment.parent_id) : undefined;
                return (
                  <li className="lesson-engagement-item" data-reply={!!replyTo} key={comment.id}>
                    <CommentHeader comment={comment} replyTo={replyTo} />
                    <p className="lesson-engagement-body">{comment.body}</p>
                    {!comment.parent_id && comment.status === "approved" && (
                      <div className="lesson-engagement-row-actions">
                        <button type="button" disabled={save.isPending} onClick={() => chooseParent(comment)}>
                          Responder
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : <Empty>Nenhum comentário nesta aula.</Empty>}
          {query.data && <Pagination data={query.data} disabled={save.isPending} onPage={(next) => {
            setPage(next);
            list.current?.focus();
          }} />}
        </QueryState>
      </div>
    </div>
  );
}

export function LessonCommentModeration(props: LessonProps) {
  return <ModerationPanel key={props.lessonId} {...props} />;
}

function ModerationPanel({ lessonId }: LessonProps) {
  const [page, setPage] = useState(1);
  const [feedback, setFeedback] = useState("");
  const list = useRef<HTMLDivElement>(null);
  const query = useRpc<Page<LessonComment>>(commentsRpc, {
    p_lesson_id: lessonId, p_page: page, p_review: true,
  });
  const refresh = useRefreshEngagement(lessonId);
  const mutation = useMutation({
    mutationFn: ({ id, decision, reason }: { id: string; decision: Decision; reason: string }) =>
      rpc<CommentResult>("app_moderate_lesson_comment", {
        p_lesson_id: lessonId, p_id: id, p_decision: decision, p_reason: reason,
      }),
    onSuccess: async ({ status }) => {
      setFeedback(status === "approved" ? "Comentário aprovado." : status === "rejected"
        ? "Comentário rejeitado." : "Decisão registrada.");
      setPage(1);
      await refresh(commentsRpc);
      list.current?.focus();
    },
  });
  return (
    <div className="lesson-engagement-panel">
      <h2>Moderação de comentários</h2>
      {feedback && <Notice>{feedback}</Notice>}
      <div ref={list} role="region" aria-label="Comentários para moderação" tabIndex={-1}>
        <QueryState query={query}>
          {query.data?.items.length ? (
            <ul className="lesson-engagement-items">
              {query.data.items.map((comment) => (
                <li className="lesson-engagement-item" key={comment.id}>
                  <CommentHeader comment={comment} />
                  <p className="lesson-engagement-body">{comment.body}</p>
                  {comment.status === "pending" && (
                    <Form
                      className="lesson-engagement-form"
                      label="Registrar decisão" disabled={mutation.isPending} successMessage=""
                      onSave={async (data) => {
                        setFeedback("");
                        const decision = value(data, "decision");
                        if (decision !== "approve" && decision !== "reject")
                          throw new AppError("Selecione uma decisão.");
                        const reason = requiredText(data, "reason", "Informe um motivo de 3 a 2.000 caracteres.", 2000, 3);
                        await mutation.mutateAsync({ id: comment.id, decision, reason });
                      }}
                    >
                      <Field label="Decisão">
                        <select name="decision" required defaultValue="">
                          <option value="" disabled>Selecione</option>
                          <option value="approve">Aprovar</option>
                          <option value="reject">Rejeitar</option>
                        </select>
                      </Field>
                      <Field label="Motivo">
                        <textarea name="reason" rows={2} required />
                      </Field>
                    </Form>
                  )}
                </li>
              ))}
            </ul>
          ) : <Empty>Nenhum comentário aguardando moderação nesta aula.</Empty>}
          {query.data && <Pagination data={query.data} disabled={mutation.isPending} onPage={(next) => {
            setPage(next);
            list.current?.focus();
          }} />}
        </QueryState>
      </div>
    </div>
  );
}
