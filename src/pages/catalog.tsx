import { useEffect, useId, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, ArrowUpRight, ChevronLeft, ChevronRight, Lock } from "lucide-react";
import { useRpc } from "../api";
import type { Course, Page } from "../api";
import { PrivateImage } from "../media";
import { Empty, Heading, Pager, Progress, QueryState, Search } from "../ui";
import "../catalog.css";

const coursePath = (course: Course) => "/app/cursos/" + encodeURIComponent(course.slug);
const inProgress = (course: Course) =>
  course.can_access && course.completed_lessons > 0 &&
  course.completed_lessons < course.total_lessons && course.progress_percent < 100;
const actionLabel = (course: Course) => !course.can_access
  ? "Consultar acesso"
  : inProgress(course) ? "Continuar curso"
  : course.completed_lessons > 0 ? "Revisar curso" : "Conhecer curso";
const plainDescription = (description: string) =>
  description.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

function CourseCover({ course, featured = false }: { course: Course; featured?: boolean }) {
  return course.cover_url ? (
    <div className="catalog-cover-media">
      <PrivateImage kind="course-cover" id={course.id} className="catalog-cover-image" />
    </div>
  ) : (
    <div className={`catalog-cover-type${featured ? " catalog-cover-featured" : ""}`} aria-hidden="true">
      <span className="catalog-cover-brand">Icarus</span>
      <span className="catalog-cover-title">{course.title}</span>
      <span className="catalog-cover-foot">{course.total_lessons} aulas <ArrowUpRight size={20} /></span>
    </div>
  );
}

function CourseAction({ course }: { course: Course }) {
  return (
    <Link className="button primary catalog-action" to={coursePath(course)}>
      {!course.can_access && <Lock size={18} aria-hidden="true" />}
      {actionLabel(course)}<ArrowRight size={18} aria-hidden="true" />
    </Link>
  );
}

function CourseMeta({ course }: { course: Course }) {
  return <p className="catalog-meta">{course.total_lessons} aulas · {Math.ceil(course.duration_seconds / 60)} min</p>;
}

function CourseShelf({ title, description, courses }: { title: string; description: string; courses: Course[] }) {
  const id = useId(), track = useRef<HTMLDivElement>(null);
  const [limits, setLimits] = useState({ previous: false, next: false });
  useEffect(() => {
    const element = track.current!;
    const update = () => {
      const previous = element.scrollLeft > 2;
      const next = element.scrollLeft < element.scrollWidth - element.clientWidth - 2;
      setLimits(old => old.previous === previous && old.next === next ? old : { previous, next });
    };
    update();
    element.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    observer?.observe(element);
    return () => {
      element.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      observer?.disconnect();
    };
  }, [courses]);
  function scroll(direction: number) {
    const element = track.current;
    if (!element) return;
    element.scrollBy({
      left: direction * element.clientWidth * .85,
      behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  }
  return (
    <section className="catalog-shelf" aria-labelledby={id + "-title"}>
      <div className="catalog-shelf-head">
        <div><h2 id={id + "-title"}>{title}</h2><p>{description}</p></div>
        <div className="catalog-arrows">
          <button type="button" className="icon-button" aria-label={`Cursos anteriores: ${title}`} aria-controls={id} disabled={!limits.previous} onClick={() => scroll(-1)}><ChevronLeft size={20} aria-hidden="true" /></button>
          <button type="button" className="icon-button" aria-label={`Próximos cursos: ${title}`} aria-controls={id} disabled={!limits.next} onClick={() => scroll(1)}><ChevronRight size={20} aria-hidden="true" /></button>
        </div>
      </div>
      <div className="catalog-track" ref={track} id={id} role="region" aria-label={`${title}: fileira horizontal`} tabIndex={0}>
        {courses.map(course => (
          <article className="catalog-card" key={course.id}>
            <CourseCover course={course} />
            <h3><Link to={coursePath(course)}>{course.title}</Link></h3>
            <CourseMeta course={course} />
            <Progress value={course.progress_percent} done={course.completed_lessons} total={course.total_lessons} />
            <CourseAction course={course} />
          </article>
        ))}
      </div>
    </section>
  );
}

export function Catalog() {
  const [params, setParams] = useSearchParams();
  const parsedPage = Number(params.get("page") || 1);
  const page = Number.isSafeInteger(parsedPage) ? Math.min(100000, Math.max(1, parsedPage)) : 1;
  const q = params.get("q") || "";
  const catalog = useRpc<Page<Course>>("app_catalog", { p_query: q, p_page: page });
  const data = catalog.data;
  const featured = catalog.isPending || catalog.error ? undefined :
    data?.items.find(inProgress) ?? data?.items.find(course => course.can_access) ?? data?.items[0];
  // O destaque já apresenta este curso; as fileiras não repetem esse mesmo card.
  const others = data?.items.filter(course => course.id !== featured?.id) ?? [];
  const ongoing = others.filter(inProgress);
  return (
    <div className="catalog-view">
      <Heading title="Seus cursos">Continue de onde parou ou explore os conteúdos disponíveis.</Heading>
      {featured && (
          <section className="catalog-feature" aria-labelledby="catalog-feature-title" data-tour="courses">
            <div className="catalog-feature-copy">
              <h2 id="catalog-feature-title"><Link to={coursePath(featured)}>{featured.title}</Link></h2>
              {plainDescription(featured.description) && <p className="catalog-description">{plainDescription(featured.description)}</p>}
              <CourseMeta course={featured} />
              <Progress value={featured.progress_percent} done={featured.completed_lessons} total={featured.total_lessons} />
              <CourseAction course={featured} />
            </div>
            <CourseCover course={featured} featured />
          </section>
      )}
      <Search initial={q} onSearch={q => setParams({ q, page: "1" })} />
      <QueryState query={catalog}>
        {data && (
          <>
            <p className="catalog-scope" role="status">
              {data.items.length ? `Exibindo ${(data.page - 1) * data.page_size + 1}–${(data.page - 1) * data.page_size + data.items.length} de ${data.total} cursos` : `${data.total} cursos encontrados`}
              {` · página ${data.page} de ${Math.max(1, Math.ceil(data.total / data.page_size))}.`}
              {data.total > data.page_size && " Destaque e fileiras mostram somente os cursos desta página."}
            </p>
            {ongoing.length > 0 && <CourseShelf title="Continue aprendendo" description="Outros cursos em andamento nesta página." courses={ongoing} />}
            {others.length > 0 && <CourseShelf title="Explore os cursos" description="Mais cursos desta página, além do destaque." courses={others} />}
            {data.items.length === 0 && (
              <Empty>
                <p>{data.total > 0 ? "Nenhum curso nesta página. Volte à primeira página para ver os resultados." : q ? "Nenhum curso corresponde à busca. Limpe a busca para ver os cursos publicados." : "Nenhum curso publicado para seu perfil. Os cursos liberados aparecerão aqui."}</p>
                {(q || data.total > 0) && <button onClick={() => setParams({ q: data.total > 0 ? q : "", page: "1" })}>{data.total > 0 ? "Voltar à primeira página" : "Limpar busca"}</button>}
              </Empty>
            )}
            <Pager page={data.page} total={data.total} onChange={page => setParams({ q, page: String(page) })} />
          </>
        )}
      </QueryState>
    </div>
  );
}
