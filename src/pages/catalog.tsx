import { useEffect, useId, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, ArrowUpRight, Check, ChevronLeft, ChevronRight, CirclePlay, Clock, Layers2, Lock, LockOpen, Play, SkipForward } from "lucide-react";
import { useRpc } from "../api";
import type { Course, Lesson, Module, Page } from "../api";
import { courseLessonPath } from "../course-paths";
import { useBootstrap } from "../auth";
import { PrivateImage } from "../media";
import { RichContent } from "../rich";
import { CatalogLaunches } from "./catalog-launches";
import { Empty, Pager, Progress, QueryState, Search } from "../ui";
import "../catalog.css";

const coursePath = (course: Course) => "/app/cursos/" + encodeURIComponent(course.slug);
const modulePath = (course: Course, module: Module) => coursePath(course) + "/" + encodeURIComponent(module.slug);
const subscriptionPath = "/app/configuracoes?aba=assinatura";
const nextLesson = (lessons: Lesson[]) => lessons.find(lesson => lesson.can_access && !lesson.completed);
const inProgress = (course: Course) =>
  course.can_access && course.completed_lessons > 0 &&
  course.completed_lessons < course.total_lessons && course.progress_percent < 100;
const actionLabel = (course: Course) => !course.can_access
  ? "Consultar acesso"
  : inProgress(course) ? "Continuar curso"
  : course.completed_lessons > 0 ? "Revisar curso" : "Conhecer curso";
const plainDescription = (description: string) =>
  description.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const lessonCount = (count: number) => `${count} ${count === 1 ? "aula" : "aulas"}`;
function duration(seconds: number) {
  const minutes = Math.ceil(seconds / 60);
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours} h${minutes % 60 ? ` ${minutes % 60} min` : ""}` : `${minutes} min`;
}

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

function CourseAction({ course, destination }: { course: Course; destination?: string }) {
  return (
    <Link className="button primary catalog-action" to={destination ?? coursePath(course)}>
      {!course.can_access && <Lock size={18} aria-hidden="true" />}
      {destination && <Play size={20} fill="currentColor" aria-hidden="true" />}
      {actionLabel(course)}
      {!destination && <ArrowRight size={18} aria-hidden="true" />}
    </Link>
  );
}

function CourseMeta({ course }: { course: Course }) {
  return <p className="catalog-meta">{lessonCount(course.total_lessons)} · {duration(course.duration_seconds)}</p>;
}

export function CourseFeature({ course, modules, detail = false }: {
  course: Course; modules?: Module[]; detail?: boolean;
}) {
  const titleId = useId();
  const Title = detail ? "h1" : "h2";
  const summary = detail ? "" : plainDescription(course.description);
  let next: { lesson: Lesson; path: string } | undefined;
  if (inProgress(course)) {
    for (const module of modules ?? []) {
      if (!module.can_access) continue;
      const lesson = nextLesson(module.sections.flatMap(section => section.lessons));
      if (lesson) {
        next = { lesson, path: courseLessonPath(course.slug, module.slug, lesson.id) };
        break;
      }
    }
  }
  return (
    <section className="catalog-feature" aria-labelledby={titleId} data-tour={detail ? undefined : "courses"}>
      <svg className="catalog-feature-motif" width="620" height="620" viewBox="0 0 400 400" fill="none" aria-hidden="true">
        <path d="M40 360L200 40L360 360L200 240L40 360ZM80 340L200 100L320 340L200 250L80 340ZM120 320L200 160L280 320L200 260L120 320Z"
          stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
      <div className="catalog-feature-copy">
        <div className="catalog-tags">
          <span className="catalog-tag catalog-tag-primary">Curso</span>
          {(!course.can_access || inProgress(course)) && (
            <span className="catalog-tag">{course.can_access ? "Em andamento" : "Acesso restrito"}</span>
          )}
        </div>
        <Title id={titleId} tabIndex={detail ? -1 : undefined}>
          {detail ? course.title : <Link to={coursePath(course)}>{course.title}</Link>}
        </Title>
        {detail ? <RichContent content={course.description} /> :
          summary && <p className="catalog-description">{summary}</p>}
        <ul className="catalog-feature-meta">
          {modules && <li><Layers2 size={16} aria-hidden="true" />{modules.length} {modules.length === 1 ? "módulo" : "módulos"}</li>}
          <li><CirclePlay size={16} aria-hidden="true" />{lessonCount(course.total_lessons)}</li>
          <li><Clock size={16} aria-hidden="true" />{duration(course.duration_seconds)}</li>
        </ul>
        <div className="catalog-feature-progress">
          <span>Progresso da trilha</span>
          <Progress value={course.progress_percent} done={course.completed_lessons} total={course.total_lessons} />
        </div>
        {(!detail || next) && <CourseAction course={course} destination={next?.path} />}
      </div>
      <div className="catalog-feature-visual">
        <CourseCover course={course} featured />
        {next && <p className="catalog-next-lesson"><SkipForward className="catalog-mobile-only" size={16} aria-hidden="true" /><span>Próxima aula:</span> <strong>{next.lesson.title}</strong></p>}
      </div>
    </section>
  );
}

export function CourseModules({ course, modules, catalog = false }: { course: Course; modules: Module[]; catalog?: boolean }) {
  const titleId = useId();
  const accessible = modules.filter(module => module.can_access).length;
  return (
    <section className="catalog-modules" aria-labelledby={titleId}>
      <header className="catalog-modules-head">
        <div>
          <span className="catalog-modules-label">Estrutura curricular</span>
          <h2 id={titleId}>Módulos do curso</h2>
        </div>
        {modules.length > 0 && <p>{catalog && <LockOpen className="catalog-mobile-only" size={16} aria-hidden="true" />}{accessible} de {modules.length} com acesso liberado</p>}
      </header>
      {modules.length ? (
        <ol className="catalog-module-grid">
          {modules.map((module, index) => {
            const ordinal = String(index + 1).padStart(2, "0");
            const lessons = module.sections.flatMap(section => section.lessons);
            const done = lessons.filter(lesson => lesson.completed).length;
            const percent = lessons.length ? Math.round(100 * done / lessons.length) : 0;
            const locked = !module.can_access;
            const complete = lessons.length > 0 && done === lessons.length;
            const ongoing = !locked && done > 0 && !complete;
            const seconds = lessons.reduce((total, lesson) => total + lesson.duration_seconds, 0);
            const next = catalog && course.can_access && ongoing ? nextLesson(lessons) : undefined;
            const StatusIcon = locked ? Lock : complete ? Check : ongoing ? Play : LockOpen;
            return (
              <li key={module.id} className="catalog-module" data-state={locked ? "locked" : ongoing ? "ongoing" : complete ? "complete" : undefined}>
                {catalog && <span className="catalog-mobile-only catalog-module-marker" aria-hidden="true">
                  <span>{ordinal}</span><StatusIcon size={18} />
                </span>}
                <div className="catalog-module-top">
                  <span>Módulo {ordinal}</span>
                  <span className="catalog-tag">
                    {locked ? <><Lock size={13} aria-hidden="true" />Bloqueado</> :
                      complete ? <><Check size={13} aria-hidden="true" />Concluído</> :
                      ongoing ? "Em andamento" : "Disponível"}
                  </span>
                </div>
                <h3><Link to={modulePath(course, module)}><span>{module.title}</span>
                  {catalog && !locked && !ongoing && <ChevronRight className="catalog-mobile-only catalog-module-chevron" size={18} aria-hidden="true" />}
                </Link></h3>
                <div className="catalog-module-foot">
                  <p className="catalog-meta">{lessonCount(lessons.length)}{seconds > 0 && ` · ${duration(seconds)}`}</p>
                  {locked ? <Link to={subscriptionPath}>Consultar assinatura</Link> :
                    <Progress value={percent} />}
                </div>
                {next && <Link className="button catalog-mobile-only catalog-module-resume" to={courseLessonPath(course.slug, module.slug, next.id)}>
                  <CirclePlay size={18} aria-hidden="true" /> Retomar aula <span className="sr-only">{next.title}</span>
                </Link>}
              </li>
            );
          })}
        </ol>
      ) : <Empty>O conteúdo deste curso ainda não está disponível.</Empty>}
      {!catalog && course.can_access && <CatalogLaunches courseSlug={course.slug} />}
    </section>
  );
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
  const firstName = useBootstrap().data?.profile.full_name.trim().split(/\s+/)[0];
  const [params, setParams] = useSearchParams();
  const parsedPage = Number(params.get("page") || 1);
  const page = Number.isSafeInteger(parsedPage) ? Math.min(100000, Math.max(1, parsedPage)) : 1;
  const q = params.get("q") || "";
  const catalog = useRpc<Page<Course>>("app_catalog", { p_query: q, p_page: page });
  const data = catalog.data;
  const featured = catalog.isPending || catalog.error ? undefined :
    data?.items.find(inProgress) ?? data?.items.find(course => course.can_access) ?? data?.items[0];
  const detail = useRpc<{ course: Course; modules: Module[] }>("app_course", { p_slug: featured?.slug }, Boolean(featured));
  const featuredDetail = !detail.error && detail.data?.course?.id === featured?.id ? detail.data : undefined;
  // O destaque já apresenta este curso; as fileiras não repetem esse mesmo card.
  const others = data?.items.filter(course => course.id !== featured?.id) ?? [];
  const ongoing = others.filter(inProgress);
  const greeting = firstName ? `Olá, ${firstName}! ` : "";
  const prompt = "Continue de onde parou ou explore novos conteúdos.";
  const singlePage = data?.page === 1 && data.total <= data.page_size;
  return (
    <div className="catalog-view" data-single-page={singlePage || undefined}>
      <header className="page-heading">
        <div>
          <p className="catalog-mobile-only catalog-mobile-page-title" aria-hidden="true">Cursos</p>
          <h1 tabIndex={-1}>{greeting}<span className={firstName ? "catalog-heading-prompt" : undefined}>{prompt}</span></h1>
          {firstName && <p className="catalog-mobile-only catalog-mobile-prompt">{prompt}</p>}
          <p className="catalog-heading-description">Acompanhe seu progresso e acesse os módulos liberados para você.</p>
        </div>
      </header>
      <Search initial={q} onSearch={q => setParams({ q, page: "1" })} />
      {featured && <CourseFeature course={featuredDetail?.course ?? featured} modules={featuredDetail?.modules} />}
      {featured && (
        <div className="catalog-detail-state">
          <QueryState query={detail}>
            {featuredDetail && <CourseModules course={featuredDetail.course} modules={featuredDetail.modules} catalog />}
          </QueryState>
        </div>
      )}
      <QueryState query={catalog}>
        {data && (
          <>
            {data.items.length === 0 && (
              <Empty>
                <p>{data.total > 0 ? "Nenhum curso nesta página. Volte à primeira página para ver os resultados." : q ? "Nenhum curso corresponde à busca. Limpe a busca para ver os cursos publicados." : "Nenhum curso publicado para seu perfil. Os cursos liberados aparecerão aqui."}</p>
                {(q || data.total > 0) && <button onClick={() => setParams({ q: data.total > 0 ? q : "", page: "1" })}>{data.total > 0 ? "Voltar à primeira página" : "Limpar busca"}</button>}
              </Empty>
            )}
            <CatalogLaunches />
            {featuredDetail?.course.can_access && <CatalogLaunches courseSlug={featuredDetail.course.slug} />}
            <p className="catalog-scope" role="status">
              {data.items.length ? `Exibindo ${(data.page - 1) * data.page_size + 1}–${(data.page - 1) * data.page_size + data.items.length} de ${data.total} cursos` : `${data.total} cursos encontrados`}
              {` · página ${data.page} de ${Math.max(1, Math.ceil(data.total / data.page_size))}.`}
              {data.total > data.page_size && " Destaque e fileiras mostram somente os cursos desta página."}
            </p>
            {ongoing.length > 0 && <CourseShelf title="Continue aprendendo" description="Outros cursos em andamento nesta página." courses={ongoing} />}
            {others.length > 0 && <CourseShelf title="Explore os cursos" description="Mais cursos desta página, além do destaque." courses={others} />}
            <Pager page={data.page} total={data.total} onChange={page => setParams({ q, page: String(page) })} />
            {featuredDetail?.modules.some(module => !module.can_access) && (
              <aside className="catalog-mobile-only catalog-access-panel" aria-labelledby="catalog-access-title">
                <h2 id="catalog-access-title">Módulos com acesso restrito</h2>
                <Link className="button" to={subscriptionPath}>Ver assinatura <ArrowRight size={18} aria-hidden="true" /></Link>
              </aside>
            )}
          </>
        )}
      </QueryState>
    </div>
  );
}
