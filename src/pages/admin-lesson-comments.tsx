import {
  Link,
  useLocation,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { useRpc } from "../api";
import type { Course, Page } from "../api";
import { RoleGate } from "../auth";
import { Back, Empty, Heading, Notice, Pager, QueryState, Search } from "../ui";
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

  if (!curso) return <ModerationCourses />;

  if (!slugPattern.test(curso) || (lessonId && !lessonIdPattern.test(lessonId))) {
    return (
      <>
        <Back to={root} label="Cursos para moderação" />
        <Heading title="Comentários de aula" />
        <Notice error>{unavailable}</Notice>
      </>
    );
  }

  return (
    <>
      <Back
        to={(lessonId ? `${root}/${curso}` : root) + search}
        label={lessonId ? "Aulas do curso" : "Cursos para moderação"}
      />
      <ModerationCourse slug={curso} lessonId={lessonId?.toLowerCase()} />
    </>
  );
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
    <>
      <Back to="/admin/comunidade" label="Administração da comunidade" />
      <Heading title="Comentários de aula">
        Escolha um curso publicado e uma aula à qual você tem acesso.
      </Heading>
      <Search initial={q} onSearch={(q) => setParams({ q, page: "1" })} />
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
            onChange={(page) => setParams({ q, page: String(page) })}
          />
        )}
      </QueryState>
    </>
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
    <>
      <Heading title={title}>
        {selected && course && `${course.title} · ${selected.module.title} · ${selected.section.title}`}
      </Heading>
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
    </>
  );
}
