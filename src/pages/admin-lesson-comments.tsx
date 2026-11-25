import {
  Link,
  useLocation,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { useRef, useState } from "react";
import { cache, date, rpc, useRpc } from "../api";
import { AdminSurface } from "./admin-surface";
import type { Course, Page } from "../api";
import { RoleGate } from "../auth";
import { Action, Back, Empty, Field, Form, Modal, Notice, Pager, QueryState, Search, value } from "../ui";
import type { CourseDetail } from "./learning";
import { LessonCommentModeration } from "./lesson-engagement";

const root = "/admin/comentarios-aula";
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const lessonIdPattern = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;
const unavailable = "Aula indisponível para moderação neste curso.";

export function AdminLessonComments() {
  return (
    <RoleGate roles={["admin", "moderator"]}>
      <LessonCommentsEntry />
    </RoleGate>
  );
}

function LessonCommentsEntry() {
  const { curso, lessonId } = useParams();
  const { search } = useLocation();

  if (!curso) return new URLSearchParams(search).get("aba") === "cursos" ? <ModerationCourses /> : <PendingComments />;

  if (!slugPattern.test(curso) || (lessonId && !lessonIdPattern.test(lessonId))) {
    return (
      <AdminSurface section="comentarios" trail={["Administração", "Comentários de aula"]}
        title="Comentários de aula" description="Revise os comentários enviados nas aulas.">
        <Back to={root} label="Fila de comentários" />
        <Notice error>{unavailable}</Notice>
      </AdminSurface>
    );
  }

  return (
    <>
      <ModerationCourse slug={curso} lessonId={lessonId?.toLowerCase()} />
    </>
  );
}

type PendingComment = {
  id: string;
  lesson_id: string;
  lesson_title: string;
  can_open_lesson: boolean;
  course_title: string;
  course_slug: string;
  author_name: string;
  body: string;
  created_at: string;
};

function PendingComments() {
  const [page, setPage] = useState(1);
  const heading = useRef<HTMLHeadingElement>(null);
  const query = useRpc<Page<PendingComment>>("app_admin_lesson_comment_queue", { p_page: page });
  async function moderate(comment: PendingComment, decision: "approve" | "reject", reason: string) {
    await rpc("app_moderate_lesson_comment", {
      p_id: comment.id, p_lesson_id: comment.lesson_id, p_decision: decision, p_reason: reason,
    });
    await Promise.all(["app_admin_lesson_comment_queue", "app_lesson_comments", "app_lesson"].map(
      (key) => cache.invalidateQueries({ queryKey: [key] }),
    ));
    heading.current?.focus({ preventScroll: true });
  }
  return <AdminSurface section="comentarios" trail={["Administração", { label: "Comunidade", to: "/admin/comunidade" }, "Comentários de aula"]}
    title="Comentários de aula" description="Revise os comentários pendentes das aulas."
    action={<Link className="button" to={root + "?aba=cursos"}>Navegar por curso</Link>}>
    <section className="settings-panel" data-tour="lesson-comment-moderation" aria-labelledby="pending-comments">
      <h2 id="pending-comments" ref={heading} tabIndex={-1}>Pendentes{query.data ? ` (${query.data.total})` : ""}</h2>
      <QueryState query={query}>
        {query.data?.items.length ? <ul className="lesson-engagement-items">
          {query.data.items.map((comment) => <li key={comment.id} className="lesson-engagement-item">
            <div className="lesson-engagement-item-header">
              <strong>{comment.author_name || "Membro sem nome"}</strong>
              <time dateTime={comment.created_at}>{date(comment.created_at)}</time>
            </div>
            {comment.can_open_lesson ? (
              <Link className="text-action" to={`${root}/${encodeURIComponent(comment.course_slug)}/${comment.lesson_id}`}>
                {comment.course_title} · {comment.lesson_title}
              </Link>
            ) : <p>{comment.course_title} · {comment.lesson_title}</p>}
            <p className="lesson-engagement-body">{comment.body}</p>
            <div className="actions">
              <Action run={() => moderate(comment, "approve", "Aprovação manual.")}>Aprovar</Action>
              <Modal title="Rejeitar comentário" trigger={<button>Rejeitar</button>}>
                <Form label="Rejeitar comentário" onSave={(data) => moderate(comment, "reject", value(data, "reason"))}>
                  <Field label="Motivo"><textarea name="reason" required minLength={3} maxLength={2000} /></Field>
                </Form>
              </Modal>
            </div>
          </li>)}
        </ul> : <Empty>Nenhum comentário pendente nesta página.</Empty>}
        {query.data && <Pager page={page} total={query.data.total} onChange={setPage} />}
      </QueryState>
    </section>
  </AdminSurface>;
}

function ModerationCourses() {
  const [params, setParams] = useSearchParams();
  const search = useLocation().search;
  const q = params.get("q") ?? "";
  const requestedPage = Number(params.get("page"));
  const page = Number.isInteger(requestedPage) && requestedPage >= 1 && requestedPage <= 100000
    ? requestedPage
    : 1;
  const query = useRpc<Page<Course>>("app_catalog", {
    p_query: q,
    p_page: page,
  });

  return (
      <AdminSurface section="comentarios-cursos" trail={["Administração", { label: "Administração da comunidade", to: "/admin/comunidade" }, { label: "Comentários de aula", to: root }, "Cursos"]}
        title="Comentários por curso" description="Escolha um curso publicado e uma aula à qual você tem acesso.">
      <section className="settings-panel">
      <Search initial={q} onSearch={(q) => setParams({ aba: "cursos", q, page: "1" })} />
      <QueryState query={query}>
        {query.data?.items.map((course) => (
          <Link
            className="resource-row"
            key={course.id}
            to={`${root}/${encodeURIComponent(course.slug)}${search}`}
          >
            <strong>{course.title}</strong>
          </Link>
        ))}
        {query.data?.total === 0 && <Empty>Nenhum curso encontrado.</Empty>}
        {query.data && (
          <Pager
            page={page}
            total={query.data.total}
            onChange={(page) => setParams({ aba: "cursos", q, page: String(page) })}
          />
        )}
      </QueryState>
      </section>
      </AdminSurface>
  );
}

function ModerationCourse({ slug, lessonId }: { slug: string; lessonId?: string }) {
  const { search } = useLocation();
  const query = useRpc<CourseDetail>("app_course", { p_slug: slug });
  const course = query.data?.course;
  // Uma prévia pode ser acessível mesmo com o curso ou o módulo bloqueado.
  const lessons = query.data?.modules.flatMap((module) =>
    module.sections.flatMap((section) => section.lessons
      .filter((lesson) => lesson.can_access)
      .map((lesson) => ({ lesson, module, section })),
    ),
  ) ?? [];
  const selected = lessons.find(({ lesson }) => lesson.id === lessonId);
  const title = (lessonId ? selected?.lesson.title : course?.title) ?? "Comentários de aula";

  return (
    <AdminSurface section="comentarios-curso"
      trail={["Administração", { label: "Cursos para moderação", to: root + (search || "?aba=cursos") }, ...(selected && course
        ? [{ label: "Aulas do curso", to: `${root}/${slug}${search}` }, title] : [title])]}
      title={title} description={selected ? `${course?.title} · ${selected.module.title} · ${selected.section.title}` : "Selecione uma aula para revisar os comentários."}>
      <section className="settings-panel">
      <QueryState query={query}>
        {lessonId ? (
          selected ? (
            <div className="reading" data-tour="lesson-comment-moderation">
              <p>Escolha Aprovar ou Rejeitar, informe o motivo e registre a decisão.</p>
              <LessonCommentModeration lessonId={selected.lesson.id} />
            </div>
          ) : <Notice error>{unavailable}</Notice>
        ) : (
          lessons.length ? lessons.map(({ lesson, module, section }) => (
            <Link
              className="resource-row"
              key={lesson.id}
              to={`${root}/${slug}/${lesson.id}${search}`}
            >
              <div>
                <strong>{lesson.title}</strong>
                <p className="meta">{module.title} · {section.title}</p>
              </div>
            </Link>
          )) : <Empty>Nenhuma aula disponível para moderação neste curso.</Empty>
        )}
      </QueryState>
      </section>
    </AdminSurface>
  );
}
