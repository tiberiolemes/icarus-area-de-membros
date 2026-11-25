import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ComponentProps, ReactNode, Ref } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  AudioLines,
  ChevronDown,
  ChevronRight,
  Clock,
  Headphones,
  History,
  CheckCircle2,
  Download,
  FileText,
  Folder,
  Lock,
  LockKeyholeOpen,
  Play,
  PanelRightClose,
  PanelRightOpen,
  Search as SearchIcon,
  Star,
  TextAlignStart,
  Circle,
  Check,
} from "lucide-react";
import { AppError, cache, edge, errorMessage, rpc, safeUrl, useRpc } from "../api";
import type { Course, Lesson, Material, Module } from "../api";
import { courseLessonPath } from "../course-paths";
import { useAuth, useBootstrap } from "../auth";
import {
  Action,
  Back,
  Empty,
  Heading,
  Notice,
  Progress,
  QueryState,
} from "../ui";
import { BunnyPlayer } from "../bunny";
import { LessonVideoControls } from "../lesson-video-controls";
import { usePrivateImageQuery } from "../media";
import { CourseFeature, curriculumPercent } from "./catalog";
import { CatalogLaunches } from "./catalog-launches";
import { LessonComments, LessonEngagementActions, LessonEngagementTab, LessonNotes, useLessonEngagement } from "./lesson-engagement";
import { LessonCta, LessonDescription, useLessonPresentation } from "./lesson-presentation";
import { notificationListKey, reconcileNotificationQueries } from "./notifications";
import "../lesson-stitch.css";

export { Catalog } from "./catalog";

export type CourseDetail = { course: Course; modules: Module[] };
export function Curriculum({course, modules, preferredModule}: CourseDetail & {preferredModule?: string | null}) {
  const initial = modules.find(module => module.slug === preferredModule)
    ?? modules.find(module => module.sections.some(section => section.lessons.some(lesson => lesson.can_access && !lesson.completed)))
    ?? modules[0];
  return <div className="curriculum course-syllabus">
    {modules.map(module => <details key={module.id} open={module.id === initial?.id}>
      <summary data-tour={module.id === initial?.id ? "course-syllabus" : undefined}>{module.title}
        {!module.can_access && <Lock size={16} aria-label="Acesso restrito" />}
      </summary>
      <Link className="syllabus-module-link" to={`/app/cursos/${encodeURIComponent(course.slug)}/${encodeURIComponent(module.slug)}`}>Abrir módulo</Link>
      {module.sections.map(section => <div key={section.id}>
        <h3>{section.title}{section.is_bonus && <span className="badge">Bônus</span>}</h3>
        <ol>{section.lessons.map(lesson => <li key={lesson.id}>
          <Link to={courseLessonPath(course.slug, module.slug, lesson.id)}>
            {lesson.completed ? <CheckCircle2 size={18} aria-label="Concluída" /> :
              lesson.can_access ? <Play size={18} aria-label="Disponível" /> : <Lock size={18} aria-label="Acesso restrito" />}
            <span>{lesson.title}<small>{Math.ceil(lesson.duration_seconds / 60)} min</small></span>
          </Link>
        </li>)}</ol>
      </div>)}
    </details>)}
  </div>;
}
export function CoursePage() {
  const [params] = useSearchParams();
  const { curso, modulo } = useParams(),
    query = useRpc<CourseDetail>("app_course", { p_slug: curso }),
    data = query.data,
    modules = modulo
      ? data?.modules.filter((m) => m.slug === modulo)
      : data?.modules;
  // Na página do módulo, os números vêm só das aulas dele, não do curso inteiro.
  const moduleLessons = modules?.[0]?.sections.flatMap((section) => section.lessons) ?? [],
    moduleStats = {
      total_lessons: moduleLessons.length,
      completed_lessons: moduleLessons.filter((lesson) => lesson.completed).length,
      duration_seconds: moduleLessons.reduce((sum, lesson) => sum + lesson.duration_seconds, 0),
    };
  return (
    <>
      <Back
        to={modulo ? `/app/cursos/${curso}` : "/app/cursos"}
        label={modulo ? "Voltar ao curso" : "Todos os cursos"}
      />
      <QueryState query={query}>
        {data && (
          <>
            {modulo && modules?.length === 0 ? (
              <>
                <Heading title="Módulo indisponível" />
                <Notice>
                  Este módulo não existe ou não está disponível para seu perfil.
                </Notice>
              </>
            ) : (
              <>
                {modulo ? (
                  <Heading title={modules?.[0]?.title ?? data.course.title}>
                    {moduleStats.total_lessons} {moduleStats.total_lessons === 1 ? "aula" : "aulas"} ·{" "}
                    {Math.ceil(moduleStats.duration_seconds / 60)} minutos
                  </Heading>
                ) : (
                  <CourseFeature course={data.course} modules={data.modules} />
                )}
                {!data.course.can_access && <AccessRequired />}
                {modulo && (
                  <Progress
                    value={curriculumPercent(moduleStats)}
                    done={moduleStats.completed_lessons}
                    total={moduleStats.total_lessons}
                  />
                )}
                <div className="course-outline">
                  <h2>Conteúdo do curso</h2>
                  <Curriculum course={data.course} modules={modules ?? []} preferredModule={modulo ?? params.get("modulo")} />
                  {!modules?.length && (
                    <Empty>
                      O conteúdo deste curso ainda não está disponível.
                    </Empty>
                  )}
                </div>
                {!modulo && data.course.can_access && <CatalogLaunches courseSlug={data.course.slug} />}
              </>
            )}
          </>
        )}
      </QueryState>
    </>
  );
}
export function AccessRequired({ reason }: { reason?: string }) {
  return (
    <Notice>
      <strong>Conteúdo com acesso restrito</strong>
      <p>
        {reason ??
          "Seu plano atual não libera este conteúdo. Consulte as opções de assinatura disponíveis."}
      </p>
      <Link className="text-action" to="/app/configuracoes?aba=assinatura">Ver minha assinatura</Link>
    </Notice>
  );
}
type LessonDetail = {
  lesson: Lesson;
  course: Course;
  module: Module;
  materials: Material[];
  position_seconds: number;
  completed: boolean;
  previous_id: string | null;
  next_id: string | null;
  can_access: boolean;
  reason?: string;
};
function mediaTime(seconds: number) {
  const whole = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

function PlayerCurriculum({ course, modules, current, hidden, playing, filterRef }: CourseDetail & {
  current: string;
  hidden: boolean;
  playing: boolean;
  filterRef: Ref<HTMLInputElement>;
}) {
  const percent = curriculumPercent(course);
  const [filter, setFilter] = useState("");
  const term = filter.trim().toLocaleLowerCase("pt-BR");
  const matches = (title: string) => title.toLocaleLowerCase("pt-BR").includes(term);
  const visible = modules.map((module, index) => ({
    module,
    index,
    sections: module.sections.map((section) => ({
      ...section,
      lessons: section.lessons.filter((lesson) =>
        matches(module.title) || matches(section.title) || matches(lesson.title),
      ),
    })).filter((section) => !term || section.lessons.length > 0),
  })).filter(({ module, sections }) => !term || matches(module.title) || sections.length > 0);

  return (
    <aside id="lesson-curriculum" className="stitch-curriculum" hidden={hidden} aria-labelledby="lesson-curriculum-title" data-tour="curriculum">
      <div className="stitch-curriculum-head">
        <div className="stitch-curriculum-heading">
          <div>
            <h2 id="lesson-curriculum-title">Conteúdo do Curso</h2>
            <small className="stitch-lesson-wide">
              {course.total_lessons} {course.total_lessons === 1 ? "aula" : "aulas"}
              {" • "}{modules.length} {modules.length === 1 ? "módulo" : "módulos"}
            </small>
            <span className="stitch-lesson-mobile stitch-lesson-light-label stitch-curriculum-caption">
              {percent}% Concluído • {course.total_lessons} {course.total_lessons === 1 ? "aula" : "aulas"}
              {" • "}{modules.length} {modules.length === 1 ? "módulo" : "módulos"}
            </span>
          </div>
          <strong className="stitch-course-progress" aria-label={`${percent}% do curso concluído`}>
            <span>
              {percent}% <span className="stitch-light-only">Concluído</span><span className="stitch-dark-only stitch-lesson-wide-label">Total</span><span className="stitch-lesson-mobile stitch-lesson-dark-label">concluído</span>
            </span>
          </strong>
        </div>
        <progress className="stitch-lesson-mobile stitch-curriculum-progress" max={100} value={percent}
          aria-label="Progresso do curso" />
        <label className="stitch-curriculum-filter">
          <SearchIcon size={16} aria-hidden="true" />
          <span className="stitch-curriculum-field">
            <input
              ref={filterRef}
              type="search"
              aria-label="Filtrar tópicos e aulas"
              placeholder="Filtrar tópicos e aulas..."
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            />
          </span>
        </label>
      </div>
      <div className="stitch-curriculum-list">
        {visible.length === 0 && <p role="status" className="stitch-curriculum-empty">Nenhum tópico ou aula encontrado.</p>}
        {visible.map(({ module, index, sections }) => {
          const lessons = module.sections.flatMap((section) => section.lessons);
          const done = lessons.filter((lesson) => lesson.completed).length;
          const activeLesson = lessons.findIndex((lesson) => lesson.id === current) + 1;
          const active = activeLesson > 0;
          const complete = lessons.length > 0 && done === lessons.length;
          const bonus = module.sections.some((section) => section.is_bonus);
          const duration = lessons.reduce((total, lesson) => total + lesson.duration_seconds, 0);
          const moduleDuration = duration >= 3600
            ? `${Math.floor(duration / 3600)}h ${Math.floor(duration % 3600 / 60)}m`
            : `${Math.floor(duration / 60)}m`;
          const modulePath = `/app/cursos/${course.slug}/${module.slug}`;
          const rows = (items: Lesson[]) => (
            <ol className="stitch-lesson-list">
              {items.map((lesson) => {
                const selected = lesson.id === current;
                const number = lessons.findIndex((item) => item.id === lesson.id) + 1;
                const prefix = `Aula ${index + 1}.${number}: `;
                const rowTitle = lesson.title.startsWith(prefix) ? lesson.title.slice(prefix.length) || lesson.title : lesson.title;
                const status = selected ? (playing ? "Em reprodução" : "Aula atual") : lesson.completed ? "Assistido" : "";
                return (
                  <li key={lesson.id}>
                    <Link aria-current={selected ? "page" : undefined} to={courseLessonPath(course.slug, module.slug, lesson.id)} data-completed={lesson.completed}>
                      {selected && playing ? <AudioLines size={20} aria-hidden="true" /> : lesson.completed
                        ? <CheckCircle2 className="stitch-lesson-watched" size={20} aria-label="Concluída" />
                        : <Circle className="stitch-lesson-unwatched" size={20} aria-hidden="true" />}
                      <span className="stitch-lesson-wide">
                        <strong title={lesson.title}>{number}. {rowTitle}</strong>
                        <small>
                          {mediaTime(lesson.duration_seconds)} min
                          {status && <span className={!selected ? "stitch-light-only" : undefined}>{` • ${status}`}</span>}
                        </small>
                      </span>
                      <span className="stitch-lesson-mobile">
                        <strong title={lesson.title}>{index + 1}.{number} {rowTitle}</strong>
                      </span>
                      {!lesson.can_access ? <Lock className="stitch-lesson-wide stitch-lesson-list-wide-status" size={18} aria-label="Acesso restrito" />
                        : selected && playing ? <AudioLines className="stitch-lesson-wide stitch-lesson-list-wide-status" size={18} aria-hidden="true" />
                          : selected || lesson.completed ? <Play className="stitch-lesson-wide stitch-lesson-list-wide-status" size={18} aria-hidden="true" />
                            : <LockKeyholeOpen className="stitch-lesson-wide stitch-lesson-list-wide-status" size={18} aria-hidden="true" />}
                      <span className="stitch-lesson-mobile stitch-lesson-list-status">
                        {!lesson.can_access && <Lock size={14} aria-label="Acesso restrito" />}
                        {Math.floor(lesson.duration_seconds / 60)}m
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          );
          return (
            <details key={`${module.id}:${!!term}`} open={active || !!term} className="stitch-module"
              data-current={active} data-completed={complete} data-locked={!module.can_access}>
              <summary>
                <span className="stitch-module-index">
                  {!module.can_access ? <Lock size={16} aria-label="Acesso restrito" /> : complete
                    ? <Check size={16} aria-hidden="true" /> : bonus && !active
                      ? <Star size={16} aria-hidden="true" /> : index + 1}
                </span>
                <span>
                  <small className="stitch-lesson-wide">
                    {active && !complete ? <>
                      Módulo em andamento
                      <span className="stitch-light-only">({Math.floor(done / lessons.length * 100)}%)</span>
                    </> : `Módulo ${index + 1}`}
                    {complete && <span className="stitch-light-only">· Concluído</span>}
                    {bonus && <span className="stitch-module-bonus">Bônus</span>}
                  </small>
                  <strong className="stitch-lesson-wide" title={module.title}>{module.title}</strong>
                  <span className="stitch-lesson-mobile">
                    <strong className="stitch-lesson-light-label" title={module.title}>Módulo {index + 1}: {module.title}</strong>
                    <strong className="stitch-lesson-dark-label" title={module.title}>Módulo {String(index + 1).padStart(2, "0")}: {module.title}</strong>
                    <small>
                      <span className="stitch-lesson-light-label">
                        {complete ? `${done} de ${lessons.length} aulas concluídas`
                          : active ? `${done} de ${lessons.length} aulas • ${Math.floor(done * 100 / lessons.length)}%`
                            : `${lessons.length} ${lessons.length === 1 ? "aula" : "aulas"}`}
                      </span>
                      <span className="stitch-lesson-dark-label">
                        {active && !complete ? `Aula ${activeLesson} de ${lessons.length} • Em andamento`
                          : `${done}/${lessons.length} aulas • ${moduleDuration}`}
                      </span>
                    </small>
                  </span>
                </span>
                {module.can_access
                  ? <ChevronDown size={20} aria-hidden="true" className="stitch-disclosure" />
                  : <span className="stitch-module-restriction">Restrito</span>}
              </summary>
              {module.sections.length === 1
                ? rows(sections[0]?.lessons ?? [])
                : sections.map((section) => {
                const all = module.sections.find((item) => item.id === section.id)?.lessons ?? [];
                const completed = all.filter((lesson) => lesson.completed).length;
                return (
                  <details
                    key={section.id}
                    open={!!term || section.lessons.some((lesson) => lesson.id === current)}
                    className="stitch-section"
                  >
                    <summary>
                      <span>{section.title} {section.is_bonus && <span className="badge">Bônus</span>}</span>
                      <small title={`${completed} de ${all.length} aulas concluídas na seção`}>{completed}/{all.length}</small>
                      <ChevronDown size={16} aria-hidden="true" className="stitch-disclosure" />
                      {all.length > 0 && (
                        <progress max={all.length} value={completed} aria-label={`Progresso da seção ${section.title}`} />
                      )}
                    </summary>
                    {rows(section.lessons)}
                  </details>
                );
              })}
              {!active && <Link className="stitch-module-link" to={modulePath}>
                Ver módulo <ArrowRight size={14} aria-hidden="true" />
              </Link>}
            </details>
          );
        })}
      </div>
    </aside>
  );
}

const lessonTabs = ["description", "materials", "comments", "notes"] as const;
const compactLesson = "(max-width: 639px)";

function LessonVideoCover({ courseId }: { courseId: string }) {
  const cover = usePrivateImageQuery("course-cover", courseId);
  const url = safeUrl(cover.data?.url);
  const [loaded, setLoaded] = useState<string>();
  const [failed, setFailed] = useState<string>();

  if (cover.error || !url || failed === url) return null;

  return (
    <div className="stitch-lesson-cover" hidden={loaded !== url} aria-hidden="true">
      <img src={url} alt="" referrerPolicy="no-referrer"
        onLoad={() => setLoaded(url)} onError={() => setFailed(url)} />
    </div>
  );
}

function LessonProgressAction({ children, run, complete, resume }: {
  children: ReactNode;
  run: () => Promise<void>;
  complete?: boolean;
  resume?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const focusBadge = useRef(false);
  const completionButton = useCallback((button: HTMLButtonElement | null) => {
    if (button) return () => { focusBadge.current = document.activeElement === button; };
  }, []);

  if (complete) return (
    <span className="badge" tabIndex={-1} ref={(badge) => {
      if (badge && focusBadge.current) {
        focusBadge.current = false;
        badge.focus({ preventScroll: true });
      }
    }}>
      <CheckCircle2 size={18} aria-hidden="true" />
      Aula concluída
    </span>
  );

  return (
    <span className={resume ? "action stitch-lesson-resume" : "action"}>
      <button type="button" ref={resume ? undefined : completionButton}
        className={resume ? undefined : "primary"} aria-disabled={busy || undefined}
        aria-busy={busy || undefined}
        onClick={async () => {
          if (lock.current) return;
          lock.current = true;
          setBusy(true);
          setError("");
          try {
            await run();
          } catch (err) {
            setError(errorMessage(err));
          } finally {
            lock.current = false;
            setBusy(false);
          }
        }}
      >
        {children}
      </button>
      {error && <span role="alert">{error}</span>}
    </span>
  );
}

export function LessonPage() {
  const memberId = useAuth().session?.user.id;
  const queryClient = useQueryClient();
  const { curso, modulo, aula } = useParams(),
    course = useRpc<CourseDetail>("app_course", { p_slug: curso }),
    module = course.data?.modules.find((m) => m.slug === modulo),
    found = module?.sections.flatMap((section) => section.lessons)
      .find((lesson) => aula?.startsWith("~") ? lesson.id === aula.slice(1) : lesson.slug === aula),
    query = useRpc<LessonDetail>("app_lesson", { p_id: found?.id }, !!found),
    [tab, setTab] = useState<(typeof lessonTabs)[number]>("description"),
    [notesFocus, setNotesFocus] = useState(0),
    [compact, setCompact] = useState(() => window.matchMedia?.(compactLesson).matches ?? false),
    [showList, setShowList] = useState(true),
    [progressError, setProgressError] = useState(""),
    [progressFeedback, setProgressFeedback] = useState(""),
    [playingVideo, setPlayingVideo] = useState<string | null>(null),
    [startedLesson, setStartedLesson] = useState<string | null>(null),
    [playbackChapter, setPlaybackChapter] = useState<{ lessonId: string; start: number | undefined }>(),
    [video, setVideo] = useState<HTMLVideoElement | null>(null),
    [hdVideo, setHdVideo] = useState<HTMLVideoElement | null>(null),
    [seekableVideo, setSeekableVideo] = useState<HTMLVideoElement | null>(null),
    [bunnySeek, setBunnySeek] = useState<{ lessonId: string; url: string; seek: (seconds: number) => void } | null>(null),
    bunnyPosition = useRef<{ lessonId: string; url: string; seconds: number } | null>(null),
    position = useRef(0),
    lastSaved = useRef(0);
  const curriculumToggle = useRef<HTMLButtonElement>(null);
  const curriculumFilter = useRef<HTMLInputElement>(null);
  const focusBeforeResize = useRef<Element | null>(null);
  const tabs = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const breakpoint = window.matchMedia?.(compactLesson);
    if (!breakpoint) return;
    const onChange = () => {
      focusBeforeResize.current = document.activeElement;
      setCompact(breakpoint.matches);
    };
    breakpoint.addEventListener("change", onChange);
    setCompact(breakpoint.matches);
    return () => breakpoint.removeEventListener("change", onChange);
  }, []);

  useLayoutEffect(() => {
    const previous = focusBeforeResize.current;
    focusBeforeResize.current = null;
    if (!previous || (document.activeElement !== previous && document.activeElement !== document.body)) return;
    const toggle = curriculumToggle.current;
    const filter = curriculumFilter.current;
    if (compact && previous === toggle) filter?.focus();
    if (!compact && !showList && filter?.closest("aside")?.contains(previous)) toggle?.focus();
  }, [compact, showList]);

  useLayoutEffect(() => {
    const rail = tabs.current;
    const notes = rail?.querySelector("#notes-tab");
    if (!notesFocus || !rail || !notes) return;
    const row = rail.getBoundingClientRect();
    const item = notes.getBoundingClientRect();
    if (item.right > row.right) rail.scrollLeft += item.right - row.right;
    else if (item.left < row.left) rail.scrollLeft -= row.left - item.left;
  }, [notesFocus]);

  const data = query.data,
    isAudio = data?.lesson.type === "audio",
    hasMedia = isAudio || data?.lesson.type === "video",
    media = useQuery({
      queryKey: ["media", "lesson", found?.id],
      queryFn: () =>
        edge<{ url: string; expires_at: string; provider: string }>("media", {
          kind: "lesson",
          id: found?.id,
        }),
      enabled: !!data?.can_access && hasMedia,
      retry: false,
      staleTime: 0,
      gcTime: 0,
    });
  const lessonId = data?.can_access ? data.lesson.id : undefined;
  const engagement = useLessonEngagement(lessonId);
  const editorial = useLessonPresentation(lessonId);
  const chapters = editorial.presentation?.chapters;
  const chapterAt = (seconds: number) => chapters?.reduce<number | undefined>(
    (active, { start_seconds }) => start_seconds <= seconds ? start_seconds : active, undefined,
  );
  const activeChapter = playbackChapter?.lessonId === found?.id ? playbackChapter?.start
    : chapterAt(data?.position_seconds ?? 0);
  const authorName = useBootstrap().data?.profile.full_name;
  useEffect(() => {
    position.current = data?.position_seconds ?? 0;
    lastSaved.current = 0;
  }, [found?.id, data?.position_seconds]);
  useEffect(() => {
    setTab("description");
    setNotesFocus(0);
    setProgressError("");
    setProgressFeedback("");
    setPlayingVideo(null);
    setStartedLesson(null);
    setPlaybackChapter(undefined);
  }, [found?.id]);
  useEffect(() => {
    if (!found) return;
    const persist = () => {
      if (data?.can_access && position.current > 0)
        void rpc("app_progress", {
          p_lesson_id: found.id,
          p_position_seconds: position.current,
          p_complete: false,
        }).catch((error) => setProgressError(errorMessage(error)));
    };
    window.addEventListener("pagehide", persist);
    return () => window.removeEventListener("pagehide", persist);
  }, [found?.id, data?.can_access]);
  const lessonPath = (id: string | null) => {
    if (!id || !course.data) return null;
    for (const m of course.data.modules) {
      const lesson = m.sections
        .flatMap((s) => s.lessons)
        .find((l) => l.id === id);
      if (lesson) return courseLessonPath(course.data.course.slug, m.slug, lesson.id);
    }
    return null;
  };
  const previous = lessonPath(data?.previous_id ?? null),
    next = lessonPath(data?.next_id ?? null),
    mediaUrl = safeUrl(media.data?.url),
    bunny =
      !isAudio && media.data?.provider === "bunny" &&
      mediaUrl &&
      ["iframe.mediadelivery.net", "player.mediadelivery.net"].includes(
        new URL(mediaUrl).hostname,
      );
  const moduleLessons = module?.sections.flatMap((s) => s.lessons) ?? [];
  const moduleDone = moduleLessons.filter((lesson) => lesson.completed).length;
  const moduleProgress = moduleLessons.length
    ? Math.round((moduleDone / moduleLessons.length) * 100)
    : 0;
  const lessonNumber = moduleLessons.findIndex((lesson) => lesson.id === found?.id) + 1;
  const moduleNumber = (course.data?.modules.findIndex((item) => item.id === module?.id) ?? -1) + 1;
  const mediaLabel = isAudio ? "áudio" : "vídeo";
  const currentVideo = !bunny && mediaUrl && video?.currentSrc === mediaUrl ? video : null;
  const readyBunnySeek = bunny && bunnySeek?.lessonId === lessonId && bunnySeek?.url === mediaUrl ? bunnySeek.seek : undefined;
  const seekTo = currentVideo && seekableVideo === currentVideo ? (seconds: number) => {
    if (!Number.isFinite(seconds) || seconds < 0) return;
    for (let i = 0; i < currentVideo.seekable.length; i++)
      if (seconds >= currentVideo.seekable.start(i) && seconds <= currentVideo.seekable.end(i)) {
        currentVideo.currentTime = seconds;
        return;
      }
  } : readyBunnySeek;
  const notePosition = currentVideo ? () => {
    const seconds = currentVideo.currentTime;
    return currentVideo.readyState >= 1 && Number.isFinite(seconds) ? seconds : null;
  } : readyBunnySeek ? () => {
    const current = bunnyPosition.current;
    return current && current.lessonId === lessonId && current.url === mediaUrl ? current.seconds : null;
  } : undefined;
  const playbackPosition = () => notePosition?.() ?? position.current;

  const savePosition = (lessonId: string, seconds: number) =>
    void rpc("app_progress", {
      p_lesson_id: lessonId,
      p_position_seconds: seconds,
      p_complete: false,
    }).catch((error) => setProgressError(errorMessage(error)));
  const trackPosition = (seconds: number) => {
    if (!found) return;
    position.current = seconds;
    if (chapters?.length) {
      const start = chapterAt(seconds);
      setPlaybackChapter((chapter) => chapter?.lessonId === found.id && chapter.start === start
        ? chapter
        : { lessonId: found.id, start });
    }
    if (Date.now() - lastSaved.current >= 15_000) {
      lastSaved.current = Date.now();
      savePosition(found.id, seconds);
    }
  };
  const nativeMedia: ComponentProps<"video"> = {
    controls: true,
    controlsList: "nodownload",
    src: mediaUrl ?? undefined,
    "aria-label": data?.lesson.title,
    onLoadedMetadata: (event) => {
      event.currentTarget.currentTime = data?.position_seconds ?? 0;
    },
    onError: () => {
      if (media.data && Date.now() > new Date(media.data.expires_at).getTime())
        void media.refetch();
    },
    onTimeUpdate: (event) => trackPosition(event.currentTarget.currentTime),
    onPause: () => {
      if (!found) return;
      lastSaved.current = Date.now();
      savePosition(found.id, position.current);
    },
  };
  return (
    <div className="lesson-stitch">
      <QueryState query={course}>
        {course.data && !found ? (
          <>
            <Back to={`/app/cursos/${curso}/${modulo}`} label="Voltar ao módulo" />
            <Heading title="Aula indisponível" />
            <Notice>A aula não existe ou não está publicada para você.</Notice>
          </>
        ) : found && (
          <QueryState query={query}>
            {data && (
              <>
                <header className="stitch-lesson-toolbar">
                  <div className="stitch-lesson-toolbar-inner">
                    <div className="stitch-lesson-context">
                      <Link className="button stitch-icon-button" to={`/app/cursos/${curso}/${modulo}`} state={{ restoreScroll: true }} aria-label="Voltar ao módulo" title="Voltar ao módulo">
                        <ArrowLeft size={18} aria-hidden="true" />
                      </Link>
                      <div>
                        <nav className="stitch-lesson-crumbs" aria-label="Localização da aula">
                          <Link to="/app/cursos">Cursos</Link>
                          <ChevronRight size={12} aria-hidden="true" />
                          <Link to={`/app/cursos/${curso}`} title={data.course.title}>{data.course.title}</Link>
                          <ChevronRight size={12} aria-hidden="true" />
                          <Link to={`/app/cursos/${curso}/${modulo}`} title={data.module.title}>
                            Módulo <span className="stitch-light-only">{String(moduleNumber).padStart(2, "0")}</span>
                            <span className="stitch-dark-only">{moduleNumber}</span>: {data.module.title}
                          </Link>
                        </nav>
                        <p>
                          <span className="stitch-light-only">Módulo {moduleNumber}: {moduleProgress}% concluído · {moduleDone} de {moduleLessons.length} aulas</span>
                          <span className="stitch-dark-only">Aula {lessonNumber} de {moduleLessons.length} do módulo ({moduleProgress}% concluído)</span>
                        </p>
                      </div>
                    </div>
                    <div className="stitch-lesson-mobile stitch-lesson-module-progress">
                      <div className="stitch-lesson-mobile-crumbs">
                        <span>Cursos</span><ChevronRight size={12} aria-hidden="true" />
                        <span title={data.course.title}>{data.course.title}</span><ChevronRight size={12} aria-hidden="true" />
                        <span>Módulo {String(moduleNumber).padStart(2, "0")}</span>
                        <span className="stitch-lesson-dark-label">{Math.floor(moduleDone * 100 / moduleLessons.length)}%</span>
                      </div>
                      <div className="stitch-lesson-light-label">
                        <span>Módulo {moduleNumber}: {Math.floor(moduleDone * 100 / moduleLessons.length)}% concluído • {moduleDone} de {moduleLessons.length} aulas</span>
                        {moduleLessons.length <= 8 && <span className="stitch-lesson-progress-dots" aria-hidden="true">
                          {moduleLessons.map(({ id, completed }) => <i key={id} data-completed={completed} />)}
                        </span>}
                      </div>
                      <progress max={moduleLessons.length} value={moduleDone} aria-label={`Progresso do módulo ${moduleNumber}`} />
                    </div>
                    <nav className="stitch-lesson-nav" aria-label="Navegação entre aulas">
                      <button type="button" className="stitch-icon-button stitch-curriculum-toggle"
                        ref={curriculumToggle} hidden={compact} aria-expanded={showList} aria-controls="lesson-curriculum"
                        aria-label={showList ? "Ocultar conteúdos" : "Mostrar conteúdos"}
                        title={showList ? "Ocultar conteúdos" : "Mostrar conteúdos"}
                        onClick={() => setShowList(!showList)}
                      >
                        {showList ? <PanelRightClose size={18} aria-hidden="true" /> : <PanelRightOpen size={18} aria-hidden="true" />}
                      </button>
                      {previous && <Link className="button" to={previous} aria-label="Aula anterior"><ArrowLeft size={18} aria-hidden="true" />
                        <span className="stitch-lesson-wide">Aula anterior</span><span className="stitch-lesson-mobile">Anterior</span>
                      </Link>}
                      {next && <Link className="button primary" to={next} aria-label="Próxima aula">
                        <span className="stitch-lesson-wide">Próxima aula</span><span className="stitch-lesson-mobile">Próxima Aula</span>
                        <ArrowRight size={18} aria-hidden="true" />
                      </Link>}
                    </nav>
                  </div>
                </header>
                <div className={`stitch-lesson-grid${showList ? " with-curriculum" : ""}`}>
                  <div className="stitch-lesson-main">
                    {data.can_access && hasMedia && (
                      <div className={`stitch-lesson-media${isAudio ? " is-audio" : ""}`} data-tour="player">
                        {media.isPending ? <p role="status">Preparando {mediaLabel} autorizado…</p> : media.error ? (
                          <div className="stitch-media-error">
                            <Notice error>
                              {media.error instanceof AppError && media.error.code === "CONFIGURATION_REQUIRED"
                                ? `Não foi possível carregar o ${mediaLabel} agora. Tente de novo; se continuar, avise o suporte.`
                                : errorMessage(media.error)}
                            </Notice>
                            <button type="button" onClick={() => media.refetch()}>Tentar carregar {mediaLabel}</button>
                          </div>
                        ) : mediaUrl ? (
                          bunny ? (
                            <BunnyPlayer
                              key={found.id}
                              title={data.lesson.title}
                              url={mediaUrl}
                              initialPosition={data.position_seconds}
                              onPosition={(seconds) => {
                                bunnyPosition.current = { lessonId: found.id, url: mediaUrl, seconds };
                                trackPosition(seconds);
                              }}
                              onPause={() => savePosition(found.id, position.current)}
                              onSeekReady={(seek) => setBunnySeek((current) =>
                                seek ? { lessonId: found.id, url: mediaUrl, seek }
                                  : current?.lessonId === found.id && current.url === mediaUrl ? null : current
                              )}
                            />
                          ) : isAudio ? (
                            <><Headphones size={24} aria-hidden="true" /><audio key={mediaUrl} {...nativeMedia} /></>
                          ) : (
                            <>
                              <video
                                key={`${found.id}:${mediaUrl}`}
                                ref={setVideo}
                                {...nativeMedia}
                                playsInline
                                onLoadedMetadata={(event) => {
                                  nativeMedia.onLoadedMetadata?.(event);
                                  setSeekableVideo(event.currentTarget.seekable.length > 0 ? event.currentTarget : null);
                                }}
                                onProgress={(event) => setSeekableVideo(event.currentTarget.seekable.length > 0 ? event.currentTarget : null)}
                                onEmptied={() => setSeekableVideo(null)}
                                onPlay={() => {
                                  setStartedLesson(found.id);
                                  setPlayingVideo(mediaUrl);
                                }}
                                onPause={(event) => {
                                  setPlayingVideo(null);
                                  nativeMedia.onPause?.(event);
                                }}
                                onEnded={() => setPlayingVideo(null)}
                                onResize={({ currentTarget }) => setHdVideo(currentTarget.videoHeight >= 720 ? currentTarget : null)}
                              />
                              {media.data?.provider === "supabase" && data.course.cover_url && startedLesson !== found.id && (
                                <LessonVideoCover key={data.course.id} courseId={data.course.id} />
                              )}
                              <LessonVideoControls video={video} />
                            </>
                          )
                        ) : <Notice>O servidor não retornou um {mediaLabel} autorizado. Procure o suporte.</Notice>}
                      </div>
                    )}
                    {data.can_access && media.data?.provider === "local-demo" && (
                      <Notice>Mídia de demonstração local. Não é conteúdo de produção.</Notice>
                    )}
                    <section className="stitch-lesson-meta" data-tour={data.can_access && !hasMedia ? "player" : undefined}>
                      <div>
                        <div className="stitch-lesson-facts">
                          <span className="stitch-lesson-number">
                            <span className="stitch-light-only">Aula {moduleNumber}.{lessonNumber}</span>
                            <span className="stitch-dark-only stitch-lesson-wide-label">Aula {String(lessonNumber).padStart(2, "0")}</span>
                            <span className="stitch-lesson-mobile stitch-lesson-dark-label">Aula {moduleNumber}.{lessonNumber}</span>
                          </span>
                          <span>
                            <Clock size={16} aria-hidden="true" />
                            <span className="stitch-light-only">{Math.floor(data.lesson.duration_seconds / 60)}m {data.lesson.duration_seconds % 60}s</span>
                            <span className="stitch-dark-only stitch-lesson-wide-label">{mediaTime(data.lesson.duration_seconds)} min</span>
                            <span className="stitch-lesson-mobile stitch-lesson-dark-label">{Math.floor(data.lesson.duration_seconds / 60)}m {data.lesson.duration_seconds % 60}s</span>
                          </span>
                          {!hasMedia && <span><FileText size={15} aria-hidden="true" />Leitura</span>}
                          {currentVideo && hdVideo === currentVideo && (
                            <div className="stitch-lesson-mobile stitch-lesson-hd">
                              <span className="stitch-lesson-light-label">HD</span>
                              <span className="stitch-lesson-dark-label">Disponível em HD</span>
                            </div>
                          )}
                        </div>
                        <h1 tabIndex={-1}>{data.lesson.title}</h1>
                        {editorial.presentation?.subtitle && (
                          <p className="stitch-lesson-subtitle">{editorial.presentation.subtitle}</p>
                        )}
                      </div>
                      {data.can_access && (
                        <div className="stitch-lesson-actions" key={found.id}>
                          {lessonId && <LessonEngagementActions lessonId={lessonId} onOpenNotes={() => {
                            setTab("notes");
                            setNotesFocus((request) => request + 1);
                          }} />}
                          <LessonProgressAction
                            complete={data.completed}
                            run={async () => {
                              const result = await rpc<{
                                certificate_code?: string;
                                certificate_reason?: string;
                                course_progress_percent: number;
                              }>("app_progress", {
                                p_lesson_id: found.id,
                                p_position_seconds: playbackPosition(),
                                p_complete: true,
                              });
                              if (result.certificate_code && memberId) {
                                void reconcileNotificationQueries(queryClient, { queryKey: notificationListKey(memberId) });
                              }
                              setProgressError("");
                              setProgressFeedback(
                                result.certificate_code
                                  ? "Aula concluída e certificado emitido. Consulte seus certificados."
                                  : result.course_progress_percent ===
                                        100 && result.certificate_reason
                                    ? result.certificate_reason
                                    : "Conclusão confirmada pelo servidor.",
                              );
                              await Promise.all([
                                query.refetch(),
                                course.refetch(),
                                cache.invalidateQueries({
                                  queryKey: ["app_certificates"],
                                }),
                              ]);
                            }}
                          >
                            <CheckCircle2 size={20} aria-hidden="true" />
                            <span className="stitch-lesson-wide-label">Marcar como concluída</span>
                            <span className="stitch-lesson-mobile stitch-lesson-light-label">Concluir Aula</span>
                          </LessonProgressAction>
                          <LessonProgressAction resume
                            run={async () => {
                              await rpc("app_progress", {
                                p_lesson_id: found.id,
                                p_position_seconds: playbackPosition(),
                                p_complete: false,
                              });
                              await query.refetch();
                              setProgressError("");
                              setProgressFeedback(
                                "Ponto de retomada confirmado pelo servidor.",
                              );
                            }}
                          >
                            <span className="stitch-resume-icon" title="Salvar ponto de retomada">
                              <History size={20} aria-hidden="true" />
                              <span className="sr-only">Salvar ponto de retomada</span>
                            </span>
                          </LessonProgressAction>
                        </div>
                      )}
                    </section>
                    {!data.can_access ? <AccessRequired reason={data.reason} /> : (
                      <>
                        {progressError && (
                          <Notice error>Ponto de retomada não confirmado. {progressError} Use Salvar ponto de retomada para tentar novamente.</Notice>
                        )}
                        {progressFeedback && <Notice>{progressFeedback}</Notice>}
                        <div className="stitch-lesson-deck">
                          <div
                            className="stitch-lesson-tabs"
                            ref={tabs}
                            role="tablist"
                            aria-label="Conteúdo da aula"
                            onKeyDown={(event) => {
                              if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                              event.preventDefault();
                              const focused = lessonTabs.findIndex((key) => `${key}-tab` === (event.target as HTMLElement).id);
                              const index = focused < 0 ? lessonTabs.indexOf(tab) : focused;
                              const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? lessonTabs.length - 1
                                : (index + lessonTabs.length + (event.key === "ArrowRight" ? 1 : -1)) % lessonTabs.length;
                              const nextTab = lessonTabs[nextIndex];
                              setTab(nextTab);
                              event.currentTarget.querySelector<HTMLButtonElement>(`#${nextTab}-tab`)?.focus();
                            }}
                          >
                            <button type="button" id="description-tab" role="tab" aria-label="Descrição da Aula" aria-selected={tab === "description"}
                              aria-controls="lesson-description" tabIndex={tab === "description" ? 0 : -1}
                              onClick={() => setTab("description")}>
                              <TextAlignStart size={18} aria-hidden="true" />
                              <span className="stitch-light-only">Descrição da Aula</span>
                              <span className="stitch-dark-only stitch-lesson-wide-label">Descrição</span>
                              <span className="stitch-lesson-mobile stitch-lesson-dark-label">Descrição da Aula</span>
                            </button>
                            <button type="button" id="materials-tab" role="tab"
                              aria-label={`Materiais & Downloads ${data.materials.length}`} aria-selected={tab === "materials"}
                              aria-controls="lesson-materials" tabIndex={tab === "materials" ? 0 : -1}
                              onClick={() => setTab("materials")}>
                              <Folder size={18} aria-hidden="true" />
                              <span className="stitch-light-only stitch-lesson-wide-label">Materiais &amp; Downloads</span>
                              <span className="stitch-lesson-mobile stitch-lesson-light-label">Materiais</span>
                              <span className="stitch-dark-only">Materiais</span>
                              <span className="stitch-lesson-tab-count">{data.materials.length}</span>
                            </button>
                            <LessonEngagementTab tab="comments" active={tab === "comments"} id="comments-tab"
                              panelId="lesson-comments" count={engagement.error ? undefined : engagement.data?.comments_count}
                              onOpen={() => setTab("comments")} />
                            <LessonEngagementTab tab="notes" active={tab === "notes"} id="notes-tab"
                              panelId="lesson-notes" onOpen={() => setTab("notes")} />
                          </div>
                          <section id="lesson-description" role="tabpanel" aria-labelledby="description-tab"
                            hidden={tab !== "description"} tabIndex={0}>
                            <LessonDescription {...editorial} body={data.lesson.body} onSeek={seekTo} activeChapter={activeChapter} />
                          </section>
                          <section id="lesson-materials" role="tabpanel" aria-labelledby="materials-tab"
                            hidden={tab !== "materials"} tabIndex={0}>
                            {tab === "materials" && <MaterialList materials={data.materials} />}
                          </section>
                          {lessonId && <>
                            <section id="lesson-comments" role="tabpanel" aria-labelledby="comments-tab"
                              hidden={tab !== "comments"} tabIndex={0}>
                              <LessonComments lessonId={lessonId} active={tab === "comments"} authorName={authorName} />
                            </section>
                            <section id="lesson-notes" role="tabpanel" aria-labelledby="notes-tab"
                              hidden={tab !== "notes"} tabIndex={0}>
                              <LessonNotes lessonId={lessonId} active={tab === "notes"} focusRequest={notesFocus}
                                getPositionSeconds={notePosition} onSeek={seekTo} />
                            </section>
                          </>}
                        </div>
                        <LessonCta cta={editorial.presentation?.cta} />
                      </>
                    )}
                  </div>
                  {course.data && <PlayerCurriculum key={found.id} {...course.data} current={found.id}
                    hidden={!compact && !showList} playing={!!mediaUrl && mediaUrl === playingVideo} filterRef={curriculumFilter} />}
                </div>
              </>
            )}
          </QueryState>
        )}
      </QueryState>
    </div>
  );
}
export function MaterialList({ materials }: { materials: Material[] }) {
  return materials.length ? (
    <ul className="file-list">
      {materials.map((material) => (
        <li key={material.id}>
          <FileText aria-hidden="true" />
          <div>
            <strong>{material.name}</strong>
            <p>{material.description}</p>
            <small>
              {material.file_type} · {formatBytes(material.size_bytes)}
            </small>
          </div>
          {material.can_access ? (
            <Action
              run={async () => {
                const media = await edge<{ url: string }>("media", {
                  kind: "material",
                  id: material.id,
                });
                const url = safeUrl(media.url);
                if (!url)
                  throw new Error("O servidor não retornou um arquivo válido.");
                const anchor = document.createElement("a");
                anchor.href = url;
                anchor.download = material.name;
                anchor.target = "_blank";
                anchor.rel = "noopener noreferrer";
                anchor.click();
              }}
            >
              <Download size={18} />
              Baixar
            </Action>
          ) : (
            <Link className="text-action" to="/app/configuracoes?aba=assinatura">Consultar acesso</Link>
          )}
        </li>
      ))}
    </ul>
  ) : (
    <Empty>Nenhum material disponível nesta seção.</Empty>
  );
}
export const formatBytes = (size: number) =>
  size < 1024
    ? `${size} B`
    : size < 1024 ** 2
      ? `${(size / 1024).toFixed(1)} KB`
      : `${(size / 1024 ** 2).toFixed(1)} MB`;
