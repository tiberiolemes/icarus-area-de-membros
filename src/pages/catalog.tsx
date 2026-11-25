import { useId } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CirclePlay, Clock, Layers2, Lock, Play } from "lucide-react";
import { rpc } from "../api";
import type { Course, Module, Page } from "../api";
import { courseLessonPath } from "../course-paths";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../auth";
import { PrivateImage } from "../media";
import { RichContent } from "../rich";
import { CatalogLaunches } from "./catalog-launches";
import { Empty, Pager, Progress, QueryState, Search } from "../ui";
import "../catalog.css";

const coursePath = (course: Pick<Course, "slug">) => "/app/cursos/" + encodeURIComponent(course.slug);
export function curriculumPercent(course: Pick<Course, "completed_lessons" | "total_lessons">) {
  return course.total_lessons ? Math.round(100 * course.completed_lessons / course.total_lessons) : 0;
}
const plainDescription = (description: string) =>
  description.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const lessonCount = (count: number) => `${count} ${count === 1 ? "aula" : "aulas"}`;
function duration(seconds: number) {
  const minutes = Math.ceil(seconds / 60);
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours} h${minutes % 60 ? ` ${minutes % 60} min` : ""}` : `${minutes} min`;
}

function CourseCover({ course, hasCover, featured = false }: { course: Pick<Course, "id" | "title" | "total_lessons">; hasCover: boolean; featured?: boolean }) {
  return hasCover ? (
    <div className="catalog-cover-media">
      <PrivateImage kind="course-cover" id={course.id} className="catalog-cover-image" />
    </div>
  ) : (
    <div className={`catalog-cover-type${featured ? " catalog-cover-featured" : ""}`} aria-hidden="true">
      <span className="catalog-cover-brand">Icarus</span>
      <span className="catalog-cover-title">{course.title}</span>
      <span className="catalog-cover-foot">{lessonCount(course.total_lessons)}</span>
    </div>
  );
}

export function CourseFeature({ course, modules }: {course: Course; modules: Module[]}) {
  const titleId = useId();
  const lessons = modules.flatMap((module) => module.sections.flatMap((section) =>
    section.lessons.filter((lesson) => lesson.can_access).map((lesson) => ({ lesson, moduleSlug: module.slug })),
  ));
  const unfinished = lessons.filter(({ lesson }) => !lesson.completed);
  const resumed = unfinished.filter(({ lesson }) => (lesson.position_seconds ?? 0) > 0)
    .sort((a, b) => (b.lesson.last_activity_at ?? "").localeCompare(a.lesson.last_activity_at ?? ""))[0];
  const target = resumed ?? unfinished[0] ?? lessons[0];
  const started = course.completed_lessons > 0 || lessons.some(({ lesson }) => (lesson.position_seconds ?? 0) > 0);
  return (
    <section className="catalog-feature" aria-labelledby={titleId}>
      <svg className="catalog-feature-motif" width="620" height="620" viewBox="0 0 400 400" fill="none" aria-hidden="true">
        <path d="M40 360L200 40L360 360L200 240L40 360ZM80 340L200 100L320 340L200 250L80 340ZM120 320L200 160L280 320L200 260L120 320Z"
          stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
      <div className="catalog-feature-copy">
        <h1 id={titleId} tabIndex={-1}>{course.title}</h1>
        {!course.can_access && <div className="catalog-tags"><span className="catalog-tag">Acesso restrito</span></div>}
        <RichContent content={course.description} />
        <ul className="catalog-feature-meta">
          <li><Layers2 size={16} aria-hidden="true" />{modules.length} {modules.length === 1 ? "módulo" : "módulos"}</li>
          <li><CirclePlay size={16} aria-hidden="true" />{lessonCount(course.total_lessons)}</li>
          <li><Clock size={16} aria-hidden="true" />{duration(course.duration_seconds)}</li>
        </ul>
        <div className="catalog-feature-progress">
          <span>Progresso da trilha</span>
          <Progress value={curriculumPercent(course)} done={course.completed_lessons} total={course.total_lessons} />
        </div>
        {course.can_access && target && (
          <Link className="button primary" to={courseLessonPath(course.slug, target.moduleSlug, target.lesson.id)}>
            <Play size={18} aria-hidden="true" /> {started ? "Continuar" : "Começar"}
          </Link>
        )}
      </div>
      <div className="catalog-feature-visual"><CourseCover course={course} hasCover={Boolean(course.cover_url)} featured /></div>
    </section>
  );
}

type CatalogFilter = 'all' | 'ongoing' | 'completed' | 'restricted';
type ShowcaseCourse = Pick<Course, 'id' | 'slug' | 'title' | 'description' | 'total_lessons'
  | 'duration_seconds' | 'can_access' | 'progress_percent' | 'completed_lessons'> & {
  has_cover: boolean;
  module_count: number;
  state: Exclude<CatalogFilter, 'all'> | 'available';
  target: { id: string; title: string; module_slug: string; module_title: string; position_seconds: number } | null;
};
type Showcase = Page<ShowcaseCourse> & { resume: ShowcaseCourse | null; counts: Record<CatalogFilter, number> };
const filters: Record<CatalogFilter, string> = {
  all: 'Todos os cursos', ongoing: 'Em andamento', completed: 'Concluídos', restricted: 'Restritos',
};
const sortOptions = { recent: 'Mais recentes', progress: 'Maior progresso', title: 'Ordem alfabética', duration: 'Carga horária' };
const statuses = { available: 'Disponível', ongoing: 'Em andamento', completed: 'Concluído', restricted: 'Acesso restrito' };

function outlinePath(course: ShowcaseCourse) {
  return coursePath(course) + (course.target ? '?' + new URLSearchParams({ modulo: course.target.module_slug }) : '');
}

function ResumeCourse({ course }: { course: ShowcaseCourse }) {
  const target = course.target;
  if (!target || !course.can_access) return null;
  const path = courseLessonPath(course.slug, target.module_slug, target.id);
  const seconds = Math.floor(target.position_seconds);
  const clock = seconds > 0 ? ` (${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')})` : '';
  return <section className="showcase-resume" aria-label="Continuar aprendendo">
    <div className="showcase-art"><CourseCover course={course} hasCover={course.has_cover} featured /></div>
    <div className="showcase-resume-copy">
      <p className="showcase-eyebrow"><CirclePlay size={16} /> Em andamento · Retomada imediata</p>
      <p className="catalog-meta">{course.title} · {target.module_title}</p>
      <h2>{target.title}</h2>
      <Progress value={course.progress_percent} done={course.completed_lessons} total={course.total_lessons} />
      <div className="showcase-actions"><Link className="button primary" data-tour="courses" to={path}><Play size={16} /> Retomar aula{clock}</Link>
        <Link className="button" to={outlinePath(course)}>Ver ementa</Link></div>
    </div>
  </section>;
}

function ShowcaseCard({ course }: { course: ShowcaseCourse }) {
  const target = course.can_access ? course.target : null;
  const description = plainDescription(course.description);
  const ongoing = course.state === 'ongoing';
  return <article className="showcase-card">
    <div className="showcase-art"><CourseCover course={course} hasCover={course.has_cover} />
      <span className="showcase-badge">{course.can_access ? <Layers2 size={13} /> : <Lock size={13} />}{course.can_access && !target ? "Sem aula disponível" : statuses[course.state]}</span>
    </div>
    <div className="showcase-card-copy">
      <p className="catalog-meta">{course.module_count} {course.module_count === 1 ? 'módulo' : 'módulos'} · {lessonCount(course.total_lessons)}{course.duration_seconds > 0 && ` · ${duration(course.duration_seconds)}`}</p>
      <h3><Link to={outlinePath(course)}>{course.title}</Link></h3>
      {description && <p className="catalog-description">{description}</p>}
      {target && ongoing && <p className="showcase-next"><CirclePlay size={16} />{target.title}</p>}
      {course.can_access && <Progress value={course.progress_percent} done={course.completed_lessons} total={course.total_lessons} />}
      <div className="showcase-actions">
        <Link className="button" to={outlinePath(course)}>{course.can_access ? 'Ver ementa' : 'Consultar acesso'}</Link>
        {target && <Link className="button primary" to={courseLessonPath(course.slug, target.module_slug, target.id)}>
          <Play size={16}/>{ongoing ? 'Continuar curso' : course.state === 'completed' ? 'Rever aulas' : 'Começar curso'}</Link>}
      </div>
    </div>
  </article>;
}

export function Catalog() {
  const [params, setParams] = useSearchParams();
  const parsedPage = Number(params.get('page') || 1);
  const page = Number.isSafeInteger(parsedPage) ? Math.min(100000, Math.max(1, parsedPage)) : 1;
  const q = params.get('q') ?? '';
  const rawFilter = params.get('filtro') ?? '';
  const filter = Object.hasOwn(filters, rawFilter) ? rawFilter as CatalogFilter : 'all';
  const rawSort = params.get('ordem') ?? '';
  const sort = Object.hasOwn(sortOptions, rawSort) ? rawSort : 'recent';
  const { session } = useAuth();
  const args = { p_query: q, p_page: page, p_filter: filter, p_sort: sort };
  const catalog = useQuery({
    queryKey: ['app_catalog_showcase', session?.user.id, args], queryFn: () => rpc<Showcase>('app_catalog_showcase', args), staleTime: 0,
  });
  const data = catalog.error ? undefined : catalog.data;
  function change(key: string, value: string) {
    const next = new URLSearchParams(params);
    next.delete('page');
    if (value) next.set(key, value); else next.delete(key);
    setParams(next);
  }
  return <div className="showcase">
    <header className="showcase-heading" data-tour={data?.resume ? undefined : "courses"}><p className="catalog-meta">Área de membros / Cursos e formações</p>
      <h1 tabIndex={-1}>Seus cursos e trilhas</h1>
      <p>Retome seus estudos ou escolha um curso para começar.</p>
    </header>
    {data?.resume && <ResumeCourse course={data.resume} />}
    <section aria-labelledby="showcase-catalog-title">
      <h2 id="showcase-catalog-title">Catálogo de cursos</h2>
      <div className="showcase-tools">
        <div role="group" aria-label="Filtrar cursos" className="showcase-filters" data-tour="course-catalog">
          {(Object.keys(filters) as CatalogFilter[]).map(key =>
            <button key={key} type="button" aria-pressed={filter === key} onClick={() => change('filtro', key === 'all' ? '' : key)}>
              {filters[key]}{data?.counts && ` (${data.counts[key]})`}</button>)}
        </div>
        <div className="showcase-search">
          <Search initial={q} label="Buscar cursos" placeholder="Buscar no catálogo" variant="stitch" onSearch={value => change('q', value)} />
          <select aria-label="Ordenar cursos" value={sort} onChange={e => change('ordem', e.target.value)}>
            {Object.entries(sortOptions).map(([value,label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
      </div>
      <QueryState query={catalog}>{data && <>
        {data.items.length > 0 ? <div className="showcase-grid">
          {data.items.map(course => <ShowcaseCard key={course.id} course={course} />)}
        </div> : <Empty>
          <p>{data.total > 0 ? 'Nenhum curso nesta página.' : q || filter !== 'all' ? 'Nenhum curso corresponde aos filtros.' : 'Nenhum curso publicado para seu perfil. Os cursos liberados aparecerão aqui.'}</p>
          {data.total > 0 ? <button onClick={() => change('page','1')}>Voltar à primeira página</button> :
            (q || filter !== 'all') && <button onClick={() => setParams({})}>Limpar busca e filtros</button>}
        </Empty>}
        {data.total > data.page_size && <Pager page={data.page} total={data.total} onChange={value => change('page',String(value))} />}
      </>}</QueryState>
    </section>
    <CatalogLaunches />
  </div>;
}
