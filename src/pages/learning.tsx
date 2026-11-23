import { useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  CheckCircle2,
  Download,
  FileText,
  Folder,
  Lock,
  Play,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";
import { cache, edge, errorMessage, rpc, safeUrl, useRpc } from "../api";
import type { Course, Lesson, Material, Module, Page } from "../api";
import {
  Action,
  Back,
  Empty,
  Heading,
  Notice,
  Pager,
  Progress,
  QueryState,
  Search,
} from "../ui";
import { BunnyPlayer } from "../bunny";
import { PrivateImage } from "../media";
import { RichContent } from "../rich";

export function Catalog() {
  const [params, setParams] = useSearchParams(),
    page = Number(params.get("page") || 1),
    q = params.get("q") || "",
    catalog = useRpc<Page<Course>>("app_catalog", { p_query: q, p_page: page });
  return (
    <>
      <Heading title="Seus cursos">
        Continue de onde parou ou explore os conteúdos disponíveis.
      </Heading>
      <Search initial={q} onSearch={(q) => setParams({ q, page: "1" })} />
      <QueryState query={catalog}>
        {catalog.data && (
          <>
            <div className="course-list" data-tour="courses">
              {catalog.data.items.map((course) => (
                <article key={course.id} className="course-row">
                  {course.cover_url ? (
                    <PrivateImage
                      kind="course-cover"
                      id={course.id}
                      className="course-cover"
                    />
                  ) : (
                    <div
                      className="course-cover typographic-cover"
                      aria-hidden="true"
                    >
                      <BookMark />
                      <span>{course.title}</span>
                    </div>
                  )}
                  <div>
                    <h2>
                      <Link to={"/app/cursos/" + course.slug}>
                        {course.title}
                      </Link>
                    </h2>
                    <p className="clamp">
                      {course.description.replace(/<[^>]*>/g, "")}
                    </p>
                    <p className="meta">
                      {course.total_lessons} aulas ·{" "}
                      {Math.ceil(course.duration_seconds / 60)} min
                    </p>
                    <Progress
                      value={course.progress_percent}
                      done={course.completed_lessons}
                      total={course.total_lessons}
                    />
                    <Link
                      className="button primary"
                      to={"/app/cursos/" + course.slug}
                    >
                      {course.can_access
                        ? course.progress_percent > 0
                          ? "Continuar curso"
                          : "Conhecer curso"
                        : "Consultar acesso"}
                      <ArrowRight size={18} />
                    </Link>
                  </div>
                </article>
              ))}
            </div>
            {catalog.data.items.length === 0 && (
              <Empty>
                {q
                  ? "Nenhum curso corresponde à busca. Limpe os filtros para ver os cursos publicados."
                  : "Nenhum curso publicado para seu perfil. Os cursos liberados aparecerão aqui."}
              </Empty>
            )}
            <Pager
              page={page}
              total={catalog.data.total}
              onChange={(page) => setParams({ q, page: String(page) })}
            />
          </>
        )}
      </QueryState>
    </>
  );
}
function BookMark() {
  return <span className="cover-mark">Icarus</span>;
}
export type CourseDetail = { course: Course; modules: Module[] };
export function Curriculum({
  course,
  modules,
  current,
}: {
  course: Course;
  modules: Module[];
  current?: string;
}) {
  return (
    <div className="curriculum" data-tour="curriculum">
      {modules.map((module) => (
        <section key={module.id}>
          <h3>
            <Link to={`/app/cursos/${course.slug}/${module.slug}`}>
              {module.title}
            </Link>
            {!module.can_access && (
              <Lock size={16} aria-label="Acesso restrito" />
            )}
          </h3>
          {module.sections.map((section) => (
            <details key={section.id} open>
              <summary>
                {section.title}
                {section.is_bonus && <span className="badge">Bônus</span>}
              </summary>
              <ol>
                {section.lessons.map((lesson) => (
                  <li key={lesson.id}>
                    <Link
                      aria-current={lesson.id === current ? "page" : undefined}
                      to={`/app/cursos/${course.slug}/${module.slug}/${lesson.slug}`}
                    >
                      {lesson.completed ? (
                        <CheckCircle2 size={18} />
                      ) : lesson.can_access ? (
                        <Play size={18} />
                      ) : (
                        <Lock size={18} />
                      )}
                      <span>
                        {lesson.title}
                        <small>
                          {Math.ceil(lesson.duration_seconds / 60)} min
                        </small>
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            </details>
          ))}
        </section>
      ))}
    </div>
  );
}
export function CoursePage() {
  const { curso, modulo } = useParams(),
    query = useRpc<CourseDetail>("app_course", { p_slug: curso }),
    data = query.data,
    modules = modulo
      ? data?.modules.filter((m) => m.slug === modulo)
      : data?.modules;
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
                <Heading
                  title={
                    modulo
                      ? (modules?.[0]?.title ?? data.course.title)
                      : data.course.title
                  }
                >
                  {data.course.total_lessons} aulas ·{" "}
                  {Math.ceil(data.course.duration_seconds / 60)} minutos
                </Heading>
                {!data.course.can_access && <AccessRequired />}
                <Progress
                  value={data.course.progress_percent}
                  done={data.course.completed_lessons}
                  total={data.course.total_lessons}
                />
                {!modulo && <RichContent content={data.course.description} />}
                <div className="course-outline">
                  <h2>Conteúdo do curso</h2>
                  <Curriculum course={data.course} modules={modules ?? []} />
                  {!modules?.length && (
                    <Empty>
                      O conteúdo deste curso ainda não está disponível.
                    </Empty>
                  )}
                </div>
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
export function LessonPage() {
  const { curso, modulo, aula } = useParams(),
    course = useRpc<CourseDetail>("app_course", { p_slug: curso }),
    module = course.data?.modules.find((m) => m.slug === modulo),
    found = module?.sections
      .flatMap((s) => s.lessons)
      .find((l) => l.slug === aula),
    query = useRpc<LessonDetail>("app_lesson", { p_id: found?.id }, !!found),
    [tab, setTab] = useState<"description" | "materials">("description"),
    [showList, setShowList] = useState(true),
    [progressError, setProgressError] = useState(""),
    [progressFeedback, setProgressFeedback] = useState(""),
    position = useRef(0),
    video = useRef<HTMLVideoElement>(null),
    lastSaved = useRef(0);
  const data = query.data,
    media = useQuery({
      queryKey: ["media", "lesson", found?.id],
      queryFn: () =>
        edge<{ url: string; expires_at: string; provider: string }>("media", {
          kind: "lesson",
          id: found?.id,
        }),
      enabled: !!data?.can_access && data?.lesson.type === "video",
      retry: false,
      staleTime: 0,
      gcTime: 0,
    });
  useEffect(() => {
    position.current = data?.position_seconds ?? 0;
    lastSaved.current = 0;
  }, [found?.id, data?.position_seconds]);
  useEffect(() => {
    setProgressError("");
    setProgressFeedback("");
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
    if (!id) return null;
    for (const m of course.data?.modules ?? []) {
      const lesson = m.sections
        .flatMap((s) => s.lessons)
        .find((l) => l.id === id);
      if (lesson) return `/app/cursos/${curso}/${m.slug}/${lesson.slug}`;
    }
    return null;
  };
  const previous = lessonPath(data?.previous_id ?? null),
    next = lessonPath(data?.next_id ?? null),
    mediaUrl = safeUrl(media.data?.url),
    bunny =
      media.data?.provider === "bunny" &&
      mediaUrl &&
      ["iframe.mediadelivery.net", "player.mediadelivery.net"].includes(
        new URL(mediaUrl).hostname,
      );
  return (
    <>
      <Back to={`/app/cursos/${curso}/${modulo}`} label="Voltar ao módulo" />
      <QueryState query={course}>
        {course.data && !found ? (
          <>
            <Heading title="Aula indisponível" />
            <Notice>A aula não existe ou não está publicada para você.</Notice>
          </>
        ) : (
          found && (
            <QueryState query={query}>
              {data && (
                <>
                  <Heading
                    title={data.lesson.title}
                    action={
                      <button
                        aria-expanded={showList}
                        onClick={() => setShowList(!showList)}
                      >
                        {showList ? <PanelRightClose /> : <PanelRightOpen />}
                        Conteúdos
                      </button>
                    }
                  >
                    {data.module.title} ·{" "}
                    {Math.ceil(data.lesson.duration_seconds / 60)} min
                  </Heading>
                  <div
                    className={`lesson-layout ${showList ? "" : "focus-mode"}`}
                  >
                    <div>
                      {!data.can_access ? (
                        <AccessRequired reason={data.reason} />
                      ) : (
                        <>
                          <div className="player" data-tour="player">
                            {data.lesson.type === "video" ? (
                              media.isPending ? (
                                <p role="status">
                                  Preparando vídeo autorizado…
                                </p>
                              ) : media.error ? (
                                <div>
                                  <Notice>{errorMessage(media.error)}</Notice>
                                  <button onClick={() => media.refetch()}>
                                    Tentar carregar vídeo
                                  </button>
                                </div>
                              ) : mediaUrl ? (
                                bunny ? (
                                  <BunnyPlayer
                                    title={data.lesson.title}
                                    url={mediaUrl}
                                    initialPosition={data.position_seconds}
                                    onPosition={(seconds) => {
                                      position.current = seconds;
                                      if (
                                        Date.now() - lastSaved.current >=
                                        15_000
                                      ) {
                                        lastSaved.current = Date.now();
                                        void rpc("app_progress", {
                                          p_lesson_id: found.id,
                                          p_position_seconds: seconds,
                                          p_complete: false,
                                        }).catch((error) =>
                                          setProgressError(errorMessage(error)),
                                        );
                                      }
                                    }}
                                    onPause={() => {
                                      void rpc("app_progress", {
                                        p_lesson_id: found.id,
                                        p_position_seconds: position.current,
                                        p_complete: false,
                                      }).catch((error) =>
                                        setProgressError(errorMessage(error)),
                                      );
                                    }}
                                  />
                                ) : (
                                  <video
                                    ref={video}
                                    key={mediaUrl}
                                    controls
                                    controlsList="nodownload"
                                    src={mediaUrl}
                                    onLoadedMetadata={() => {
                                      if (video.current)
                                        video.current.currentTime =
                                          data.position_seconds;
                                    }}
                                    onError={() => {
                                      if (
                                        media.data &&
                                        Date.now() >
                                          new Date(
                                            media.data.expires_at,
                                          ).getTime()
                                      )
                                        void media.refetch();
                                    }}
                                    onTimeUpdate={(e) => {
                                      position.current =
                                        e.currentTarget.currentTime;
                                      if (
                                        Date.now() - lastSaved.current >=
                                        15_000
                                      ) {
                                        lastSaved.current = Date.now();
                                        void rpc("app_progress", {
                                          p_lesson_id: found.id,
                                          p_position_seconds: position.current,
                                          p_complete: false,
                                        }).catch((error) =>
                                          setProgressError(errorMessage(error)),
                                        );
                                      }
                                    }}
                                    onPause={() => {
                                      lastSaved.current = Date.now();
                                      void rpc("app_progress", {
                                        p_lesson_id: found.id,
                                        p_position_seconds: position.current,
                                        p_complete: false,
                                      }).catch((error) =>
                                        setProgressError(errorMessage(error)),
                                      );
                                    }}
                                  />
                                )
                              ) : (
                                <Notice>
                                  O servidor não retornou um vídeo autorizado.
                                  Procure o suporte.
                                </Notice>
                              )
                            ) : (
                              <div className="text-lesson">
                                <FileText size={36} />
                                <p>
                                  Aula de leitura. O conteúdo está na descrição
                                  abaixo.
                                </p>
                              </div>
                            )}
                          </div>
                          {media.data?.provider === "local-demo" && (
                            <Notice>
                              Vídeo de demonstração local. Não é conteúdo de
                              produção.
                            </Notice>
                          )}
                          <div className="lesson-actions">
                            {data.completed ? (
                              <span className="badge">
                                <CheckCircle2 size={18} />
                                Aula concluída
                              </span>
                            ) : (
                              <Action
                                run={async () => {
                                  const result = await rpc<{
                                    certificate_code?: string;
                                    certificate_reason?: string;
                                    course_progress_percent: number;
                                  }>("app_progress", {
                                    p_lesson_id: found.id,
                                    p_position_seconds: position.current,
                                    p_complete: true,
                                  });
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
                                Marcar como concluída
                              </Action>
                            )}
                            <Action
                              run={async () => {
                                await rpc("app_progress", {
                                  p_lesson_id: found.id,
                                  p_position_seconds: position.current,
                                  p_complete: false,
                                });
                                await query.refetch();
                                setProgressError("");
                                setProgressFeedback(
                                  "Ponto de retomada confirmado pelo servidor.",
                                );
                              }}
                            >
                              Salvar ponto de retomada
                            </Action>
                          </div>
                          {progressError && (
                            <Notice error>
                              Ponto de retomada não confirmado. {progressError}{" "}
                              Use Salvar ponto de retomada para tentar
                              novamente.
                            </Notice>
                          )}
                          {progressFeedback && (
                            <Notice>{progressFeedback}</Notice>
                          )}
                          <div
                            className="tabs"
                            role="tablist"
                            aria-label="Conteúdo da aula"
                            onKeyDown={(event) => {
                              if (
                                ![
                                  "ArrowLeft",
                                  "ArrowRight",
                                  "Home",
                                  "End",
                                ].includes(event.key)
                              )
                                return;
                              event.preventDefault();
                              const next =
                                event.key === "Home"
                                  ? "description"
                                  : event.key === "End"
                                    ? "materials"
                                    : tab === "description"
                                      ? "materials"
                                      : "description";
                              setTab(next);
                              document
                                .getElementById(
                                  next === "description"
                                    ? "description-tab"
                                    : "materials-tab",
                                )
                                ?.focus();
                            }}
                          >
                            <button
                              id="description-tab"
                              role="tab"
                              aria-selected={tab === "description"}
                              aria-controls="lesson-description"
                              tabIndex={tab === "description" ? 0 : -1}
                              onClick={() => setTab("description")}
                            >
                              Descrição
                            </button>
                            <button
                              id="materials-tab"
                              role="tab"
                              aria-selected={tab === "materials"}
                              aria-controls="lesson-materials"
                              tabIndex={tab === "materials" ? 0 : -1}
                              onClick={() => setTab("materials")}
                            >
                              Materiais ({data.materials.length})
                            </button>
                          </div>
                          {tab === "description" ? (
                            <section
                              id="lesson-description"
                              role="tabpanel"
                              aria-labelledby="description-tab"
                            >
                              <RichContent content={data.lesson.body ?? ""} />
                            </section>
                          ) : (
                            <section
                              id="lesson-materials"
                              role="tabpanel"
                              aria-labelledby="materials-tab"
                            >
                              <MaterialList materials={data.materials} />
                            </section>
                          )}
                        </>
                      )}
                      <nav className="lesson-navigation" aria-label="Aulas">
                        {previous ? (
                          <Link className="button" to={previous}>
                            Aula anterior
                          </Link>
                        ) : (
                          <span />
                        )}
                        {next && (
                          <Link className="button" to={next}>
                            Próxima aula
                            <ArrowRight size={18} />
                          </Link>
                        )}
                      </nav>
                    </div>
                    {showList && (
                      <aside
                        className="lesson-sidebar"
                        aria-label="Lista de conteúdos"
                      >
                        <h2>Conteúdos</h2>
                        <Curriculum
                          course={course.data!.course}
                          modules={course.data!.modules}
                          current={found.id}
                        />
                      </aside>
                    )}
                  </div>
                </>
              )}
            </QueryState>
          )
        )}
      </QueryState>
    </>
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
export function Materials() {
  const { pasta } = useParams(),
    [params, setParams] = useSearchParams(),
    q = params.get("q") ?? "",
    page = Number(params.get("page") || 1),
    query = useRpc<
      Page<Material> & {
        folders: { id: string; name: string; count?: number }[];
      }
    >("app_materials", {
      p_folder_id: pasta ?? null,
      p_query: q,
      p_page: page,
    });
  return (
    <>
      {pasta && <Back to="/app/materiais" label="Todas as pastas" />}
      <Heading title="Seus materiais">
        Arquivos e recursos liberados para seu aprendizado.
      </Heading>
      <Search initial={q} onSearch={(q) => setParams({ q, page: "1" })} />
      <QueryState query={query}>
        {query.data && (
          <>
            <div className="folder-list" data-tour="materials">
              {query.data.folders.map((folder) => (
                <Link key={folder.id} to={"/app/materiais/" + folder.id}>
                  <Folder size={24} />
                  <span>
                    {folder.name}
                    {folder.count !== undefined && (
                      <small>{folder.count} arquivos</small>
                    )}
                  </span>
                  <ArrowRight size={20} />
                </Link>
              ))}
            </div>
            <MaterialList materials={query.data.items} />
            <Pager
              page={page}
              total={query.data.total}
              onChange={(page) => setParams({ q, page: String(page) })}
            />
          </>
        )}
      </QueryState>
    </>
  );
}
