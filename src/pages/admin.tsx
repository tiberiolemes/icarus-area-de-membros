import { useCallback, useEffect, useRef, useState } from "react";
import type { MouseEvent, ReactNode } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowDown,
  Award,
  ArrowRight,
  ArrowUp,
  BookOpen,
  Check,
  CreditCard,
  Download,
  FileText,
  Flag,
  FolderOpen,
  LayoutGrid,
  MessageSquare,
  Reply,
  History,
  ListOrdered,
  Pencil,
  Plus,
  Presentation,
  RefreshCw,
  Shield,
  ListChecks,
  ToggleRight,
  Users,
  Video,
  X,
} from "lucide-react";
import {
  cache,
  date,
  errorMessage,
  downloadBlob,
  edge,
  AppError,
  money,
  roleLabel,
  roleLabels,
  rpc,
  useRpc,
} from "../api";
import { buildAdminCsv, exportLimit } from "../admin-export";
import { courseLessonPath } from "../course-paths";
import { slugify } from "../slug";
import { parseYouTube } from "./admin-podcasts";
import { youtubeIdPattern } from "./podcasts";

const bunnyVideoId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** O vídeo da aula fica num campo só: ID do Bunny (GUID) ou ID do YouTube, que vem do link colado. */
function lessonVideo(input: string | null) {
  if (!input) return null;
  const youtube = parseYouTube(input) ?? (youtubeIdPattern.test(input) ? input : null);
  if (youtube) return youtube;
  if (bunnyVideoId.test(input)) return input;
  throw new AppError("Cole um link do YouTube ou o ID do vídeo no Bunny.");
}
import { IntegrationCards, IntegrationTestMessage, integrationKey, useIntegrationTest, type IntegrationStatus } from "./admin-integrations";
import type { Page, Plan, Course } from "../api";
import {
  Action,
  Back,
  Empty,
  Field,
  Form,
  FormHeadingTarget,
  Heading,
  Modal,
  NavigationTabs,
  Notice,
  Pager,
  Progress,
  QueryState,
  Search,
  SectionHeading,
  nullable,
  value,
} from "../ui";
import { RichEditor } from "../rich";
import { AdminBrand } from "./admin-brand";
import { CertificateDefaultsEditor, CourseCertificate } from "./admin-certificate";
import { AdminCatalogLaunch } from "./admin-catalog-launch";
import { CoverFocus } from "./admin-course-cover";
import { Reauth } from "./settings";
import { Moderate, statusName } from "./community";
import { useBootstrap } from "../auth";
import { HelpLink } from "../help-link";
import { moduleLabel, modules, readModules, type ModuleKey } from "../modules";
import { Upload } from "../upload";
import "./admin-commercial.css";
import { AdminSurface } from "./admin-surface";
import { materialSize, materialTypes, save, text, useAll, type Row } from "./admin-data";
import { LessonLinks, LessonMaterials } from "./admin-material-lessons";
import { Archive, DangerZone, useDeletedNotice } from "./admin-delete";
import { BunnyPicker } from "./admin-bunny-picker";
import { DragOrder, persistOrder, useDragOrder } from "./admin-drag";
import { PresentationPicker } from "./admin-presentation-picker";
import { moveItem } from "../reorder";
import "../admin-content.css";

type MemberDetail = {
  profile: Row;
  subscriptions: Page<Row>;
  courses: Page<Course>;
  orders: Page<Row>;
  tickets: Page<Row>;
};
const memberName = (member: Row) =>
  text(member, "full_name").trim() || `Membro sem nome · ${member.id.slice(0, 8)}`;
function focusEditor(node: HTMLElement | null) {
  if (!node) return;
  const opener = document.activeElement;
  const title = node.querySelector<HTMLElement>("h2");
  if (title) {
    title.tabIndex = -1;
    title.focus({ preventScroll: true });
  }
  node.scrollIntoView({ block: "start" });
  return () => {
    if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
  };
}
const num = (data: FormData, key: string) => Number(value(data, key) || 0);
const check = (data: FormData, key: string) => data.has(key);
function orderedSettings(rows: Row[] | undefined) {
  return [...(rows ?? [])].sort((a, b) => Number(a.order_index) - Number(b.order_index) || a.id.localeCompare(b.id));
}

function MoveSetting({ collection, item, label, index, total }: {
  collection: "spaces" | "onboarding_questions"; item: Row; label: string; index: number; total: number;
}) {
  async function move(direction: -1 | 1) {
    await rpc("app_admin_move_setting", { p_collection: collection, p_id: item.id, p_direction: direction });
    await Promise.all([
      cache.invalidateQueries({ queryKey: ["app_admin_list", collection] }),
      cache.invalidateQueries({ queryKey: [collection === "spaces" ? "app_feed" : "bootstrap"] }),
    ]);
  }
  return <>
    <Action disabled={!index} run={() => move(-1)}>Subir<span className="sr-only"> {label}</span></Action>
    <Action disabled={index === total - 1} run={() => move(1)}>Descer<span className="sr-only"> {label}</span></Action>
  </>;
}
/** Com `icon`, a lista vira o cartão padrão das Configurações, com a busca na barra do cartão. */
function AdminList({
  entity,
  rpc: listRpc,
  title,
  action,
  children,
  section = false,
  icon,
  listArgs,
  filters,
}: {
  entity: string;
  /** RPC própria da lista, no mesmo formato paginado da app_admin_list. */
  rpc?: "app_admin_reports" | "app_admin_privacy_requests" | "app_admin_moderation_queue";
  listArgs?: Record<string, string | null>;
  filters?: (result: Page<Row> & { pending?: number } | undefined) => ReactNode;
  title: string;
  action?: ReactNode;
  children: (item: Row) => ReactNode;
  section?: boolean;
  icon?: ReactNode;
}) {
  const [params, setParams] = useSearchParams(),
    q = params.get("q") ?? "",
    page = Number(params.get("page") || 1),
    query = useRpc<Page<Row> & { pending?: number }>(listRpc ?? "app_admin_list", listRpc
      ? { p_query: q, p_page: page, ...listArgs }
      : { p_entity: entity, p_query: q, p_page: page }),
    exportEntity = entity === "profiles" || entity === "orders" ? entity : null;
  // Preserva a aba e os demais filtros da URL ao buscar e paginar.
  const go = (nextQuery: string, nextPage: number) => setParams((current) => {
    const next = new URLSearchParams(current);
    next.set("q", nextQuery);
    next.set("page", String(nextPage));
    return next;
  });
  const Wrapper = icon ? "section" : "div";
  return (
    <Wrapper className={icon ? "settings-panel" : "admin-list"}>
      {icon ? (
        <header className="settings-toolbar">
          <h2>{icon} {title}</h2>
          <Search variant="stitch" initial={q} label={`Buscar em ${title.toLocaleLowerCase("pt-BR")}`} onSearch={(next) => go(next, 1)} />
        </header>
      ) : (
        <>
          <Heading title={title} action={action} level={section ? 2 : 1} />
          <Search initial={q} onSearch={(next) => go(next, 1)} />
        </>
      )}
      {exportEntity && (
        <section className="actions" data-tour="admin-export">
          <Action
            disabled={
              query.isPending ||
              !!query.error ||
              !query.data?.total ||
              query.data.total > exportLimit
            }
            run={async () => {
              const csv = await buildAdminCsv(exportEntity, q);
              downloadBlob(
                new Blob([csv], { type: "text/csv;charset=utf-8" }),
                `${exportEntity === "profiles" ? "membros" : "pedidos"}-icarus.csv`,
              );
            }}
          >
            Exportar resultado completo em CSV
          </Action>
          <small>
            Até {exportLimit.toLocaleString("pt-BR")} registros, com a busca
            atual. Refine a busca se exceder o limite.
          </small>
        </section>
      )}
      {filters?.(query.data)}
      <QueryState query={query}>
        {query.data && (
          <>
            <div className="rows">
              {query.data.items.map((item) => (
                <div className="admin-row" key={item.id}>
                  {children(item)}
                </div>
              ))}
            </div>
            {!query.data.items.length && (
              <Empty>
                {q
                  ? "Nenhum resultado para esta busca."
                  : "Nenhum registro cadastrado."}
              </Empty>
            )}
            <Pager
              page={page}
              total={query.data.total}
              onChange={(next) => go(q, next)}
            />
          </>
        )}
      </QueryState>
    </Wrapper>
  );
}
/** Título e endereço. O endereço nasce do título enquanto o item é novo e ninguém o editou, e o campo se corrige sozinho. */
function IdentityFields({ row, label = "Título", name = "title", max = 200 }: {
  row?: Row; label?: string; name?: string; max?: number;
}) {
  const slug = useRef<HTMLInputElement>(null), edited = useRef(false);
  // Corrige o que foi digitado ou colado sem tirar o cursor do lugar.
  const tidy = (input: HTMLInputElement) => {
    const caret = slugify(input.value.slice(0, input.selectionStart ?? undefined), true).length;
    input.value = slugify(input.value, true);
    input.setSelectionRange(caret, caret);
    edited.current = input.value !== "";
  };
  return (
    <>
      <Field label={label}>
        <input
          name={name}
          required
          defaultValue={text(row, name)}
          maxLength={max}
          onChange={(event) => {
            if (!row && !edited.current && slug.current) slug.current.value = slugify(event.currentTarget.value);
          }}
        />
      </Field>
      <Field
        label="Endereço (slug)"
        hint={row ? "Faz parte do link. Se você alterar, o sistema mantém só letras minúsculas, números e hífens."
          : `Faz parte do link e nasce do ${label.toLowerCase()}. Para usar outro, digite aqui. O sistema mantém só letras minúsculas, números e hífens.`}
      >
        <input
          ref={slug}
          name="slug"
          required
          defaultValue={text(row, "slug")}
          maxLength={120}
          // Com tecla morta, o acento chega antes da letra. Mexer no valor no meio cancelaria a composição.
          onChange={(event) => { if (!(event.nativeEvent as InputEvent).isComposing) tidy(event.currentTarget); }}
          onCompositionEnd={(event) => tidy(event.currentTarget)}
          onBlur={(event) => { event.currentTarget.value = slugify(event.currentTarget.value); }}
        />
      </Field>
    </>
  );
}
function StatusField({ row }: { row?: Row }) {
  return (
    <Field label="Estado">
      <select name="status" defaultValue={text(row, "status", "draft")}>
        <option value="draft">Rascunho</option>
        <option value="published">Publicado</option>
      </select>
    </Field>
  );
}
const courseAccessLabel: Record<string, string> = {
  members: "Todos os membros",
  plans: "Planos selecionados",
  subscribers: "Assinatura ativa",
};

function AccessFields({
  row,
  inherit = false,
}: {
  row?: Row;
  inherit?: boolean;
}) {
  const boot = useBootstrap();
  const plans = { data: boot.data?.plans };
  return (
    <>
      <Field label="Regra de acesso">
        <select
          name="access_mode"
          defaultValue={text(
            row,
            "access_mode",
            inherit ? "inherit" : "subscribers",
          )}
        >
          {inherit && <option value="inherit">Herdar do curso</option>}
          {Object.entries(courseAccessLabel).map(([mode, label]) => <option key={mode} value={mode}>{label}</option>)}
        </select>
      </Field>
      <fieldset className="plan-options">
        <legend>Planos permitidos quando restrito</legend>
        {plans.data?.map((plan) => (
          <label className="check" key={plan.id}>
            <input
              name="plan_ids"
              type="checkbox"
              value={plan.id}
              defaultChecked={((row?.plan_ids as string[]) ?? []).includes(
                plan.id,
              )}
            />
            {text(plan, "name")}
          </label>
        ))}
        {!plans.data?.length && <p>Nenhum plano cadastrado.</p>}
      </fieldset>
    </>
  );
}
const accessData = (data: FormData) => ({
  access_mode: value(data, "access_mode"),
  plan_ids: data.getAll("plan_ids").map(String),
});
function OrderControl({
  entity,
  row,
  siblings,
  drag,
}: {
  entity: string;
  row: Row;
  siblings: Row[];
  drag: ReturnType<typeof useDragOrder>;
}) {
  const index = siblings.findIndex((item) => item.id === row.id);
  async function move(direction: number) {
    const target = index + direction;
    if (target < 0 || target >= siblings.length) return;
    await drag.run(() => persistOrder(entity, moveItem(siblings, index, target)));
  }
  return (
    <div className="order-controls">
      <Action disabled={drag.busy || index <= 0} run={() => move(-1)}>
        <ArrowUp size={18} aria-hidden="true" />
        <span className="sr-only">Subir {text(row, "title")}</span>
      </Action>
      <Action disabled={drag.busy || index >= siblings.length - 1} run={() => move(1)}>
        <ArrowDown size={18} aria-hidden="true" />
        <span className="sr-only">Descer {text(row, "title")}</span>
      </Action>
    </div>
  );
}
export function AdminCourses() {
  return (
    <AdminSurface
      className="admin-content admin-courses-index"
      section="conteudo"
      trail={["Administração", "Conteúdo"]}
      title="Cursos e aulas"
      description="Crie cursos, organize módulos e aulas e publique o conteúdo."
      action={
        <Link className="button primary" to="/admin/cursos/novo">
          <Plus size={18} aria-hidden="true" />
          Criar curso
        </Link>
      }
    >
      <AdminList entity="courses" title="Cursos" icon={<BookOpen size={20} aria-hidden="true" />}>
        {(course) => {
          const editor = `/admin/cursos/${encodeURIComponent(course.id)}`;
          return (
            <>
              <div>
                <h3>
                  <Link to={editor}>{text(course, "title")}</Link>
                </h3>
                <p className="actions">
                  <span className="badge">{statusName(text(course, "status"))}</span>
                  <span className="badge">{course.certificate_enabled ? "Certificado disponível" : "Sem certificado"}</span>
                </p>
              </div>
              <div className="actions">
                <Link className="button" to={editor}>
                  Editar curso
                </Link>
                <PresentationPicker course={course} />
                <Link className="button primary" to={`${editor}?aba=estrutura`}>
                  Estrutura e aulas
                </Link>
              </div>
            </>
          );
        }}
      </AdminList>
    </AdminSurface>
  );
}
export function CourseEditor() {
  const admin = useBootstrap().data?.profile.role === "admin";
  const { id } = useParams(),
    isNew = id === "novo",
    courses = useAll("courses"),
    course = courses.data?.find((row) => row.id === id),
    navigate = useNavigate(),
    [params] = useSearchParams(),
    [tab, setTab] = useState(() =>
      params.get("aba") === "estrutura" ? "structure" : "course",
    );
  return (
    <AdminSurface className="admin-content" section="curso-editor" formAction
      trail={["Administração", { label: "Cursos e aulas", to: "/admin/cursos" }, isNew ? "Novo curso" : "Editar curso"]}
      title={isNew ? "Criar curso" : course ? text(course, "title") : "Editar curso"}
      description="Organize o currículo, configure o acesso e revise o conteúdo publicado.">
      <QueryState query={courses}>
        {(isNew || course) && (
          <>
            <div className="content-context" data-tour="course-editor">
              {course && (
                <div className="content-summary">
                  <span className="content-icon">
                    <BookOpen size={20} aria-hidden="true" />
                  </span>
                  <div className="actions" role="group" aria-label="Situação do curso">
                    <span className="badge">{statusName(text(course, "status"))}</span>
                    {courseAccessLabel[text(course, "access_mode")] && (
                      <span className="badge">{courseAccessLabel[text(course, "access_mode")]}</span>
                    )}
                    <span className="badge">{course.certificate_enabled ? "Certificado disponível" : "Sem certificado"}</span>
                  </div>
                </div>
              )}
              <NavigationTabs
                label="Editor de curso"
                selected={tab}
                items={[
                  ["course", "Curso"],
                  ["structure", "Estrutura e aulas"],
                  ["certificate", "Certificado"],
                ].map(([id, label]) => ({
                  id,
                  label,
                  disabled: isNew && id !== "course",
                  onClick: () => setTab(id),
                }))}
              >
                {course && (
                  <Link
                    className="button"
                    to={`/app/cursos/${encodeURIComponent(text(course, "slug"))}`}
                  >
                    Prévia autorizada
                  </Link>
                )}
              </NavigationTabs>
            </div>
            {tab === "course" && (
              <div className={course ? "course-edit-layout" : "reading"}>
                <section className="content-panel" aria-label="Dados do curso">
                  <Form
                    key={id}
                    submitInHeading
                    label={isNew ? "Criar curso" : "Salvar curso"}
                    onSave={async (data) => {
                      const saved = await save("courses", isNew ? null : id!, {
                        title: value(data, "title"),
                        slug: slugify(value(data, "slug")),
                        description: value(data, "description"),
                        status: value(data, "status"),
                        ...accessData(data),
                      });
                      await courses.refetch();
                      if (isNew) navigate("/admin/cursos/" + saved.id);
                    }}
                  >
                    <IdentityFields row={course} />
                    <RichEditor
                      initial={text(course, "description")}
                      label="Descrição do curso"
                    />
                    <StatusField row={course} />
                    <AccessFields row={course} />
                  </Form>
                </section>
                {course && (
                  <section className="content-panel" aria-label="Publicação e capa">
                    {course.status === "draft" && (
                      <AdminCatalogLaunch entity="courses" id={course.id} />
                    )}
                    <SectionHeading title="Capa do curso" />
                    <CoverFocus course={course} onSaved={() => courses.refetch()} />
                    <Upload
                      kind="course-cover"
                      resourceId={course.id}
                      onUploaded={() => void courses.refetch()}
                    />
                    <Archive entity="courses" row={course} />
                  </section>
                )}
              </div>
            )}
            {tab === "structure" && course && <Structure course={course} />}
            {tab === "certificate" && course && (
              <CourseCertificate key={course.id} course={course} admin={admin} save={(data) => save("courses", course.id, data)} />
            )}
          </>
        )}
        {!isNew && courses.data && !course && (
          <Notice error>Curso não encontrado.</Notice>
        )}
      </QueryState>
    </AdminSurface>
  );
}
const structureLabels = {
  modules: "módulo",
  sections: "seção",
  lessons: "aula",
};
type StructureSelection = {
  entity: keyof typeof structureLabels;
  row?: Row;
  parent: string;
  /** Aula nova direto no módulo: parent é o módulo e a seção automática vem do servidor ao salvar. */
  inModule?: boolean;
};

function StructureActions({
  entity,
  row,
  siblings,
  onEdit,
  current,
  drag,
}: {
  entity: StructureSelection["entity"];
  row: Row;
  siblings?: Row[];
  onEdit: (event: MouseEvent<HTMLButtonElement>) => void;
  current?: boolean;
  drag: ReturnType<typeof useDragOrder>;
}) {
  const label = `Editar ${structureLabels[entity]} ${text(row, "title")}`;
  return (
    <div className="actions">
      <button
        className="content-icon-action"
        type="button"
        title={label}
        aria-label={label}
        aria-current={current || undefined}
        onClick={onEdit}
      >
        <Pencil size={18} aria-hidden="true" />
      </button>
      {siblings && <OrderControl entity={entity} row={row} siblings={siblings} drag={drag} />}
      {drag.handle(row)}
    </div>
  );
}
function Structure({ course }: { course: Row }) {
  const modules = useAll("modules"),
    sections = useAll("sections"),
    lessons = useAll("lessons"),
    [reordering, setReordering] = useState(false),
    [selected, setSelected] = useState<StructureSelection | null>(null),
    deleted = useDeletedNotice();
  const opener = useRef<HTMLButtonElement>(null);
  const focusPanel = useCallback((node: HTMLElement | null) => {
    focusEditor(node);
  }, []);
  useEffect(() => {
    if (!selected) opener.current?.focus();
  }, [selected]);
  const [structureSubmit, setStructureSubmit] = useState<HTMLDivElement | null>(null);
  function openEditor(target: StructureSelection) {
    return (event: MouseEvent<HTMLButtonElement>) => {
      opener.current = event.currentTarget;
      setSelected(target);
    };
  }
  const ownModules = (modules.data ?? [])
    .filter((module) => module.course_id === course.id)
    .sort((a, b) => Number(a.order_index) - Number(b.order_index));
  const moduleDrag = useDragOrder("modules", reordering ? ownModules : []);
  const moduleIds = new Set(ownModules.map((module) => module.id));
  const courseSections = (sections.data ?? []).filter((section) =>
    moduleIds.has(text(section, "module_id")),
  );
  const sectionIds = new Set(courseSections.map((section) => section.id));
  const courseLessons = (lessons.data ?? []).filter((lesson) =>
    sectionIds.has(text(lesson, "section_id")),
  );
  const rows = {
    modules: ownModules,
    sections: courseSections,
    lessons: courseLessons,
  };
  const currentRow =
    selected?.row &&
    (rows[selected.entity].find((row) => row.id === selected.row?.id) ??
      selected.row);
  const lessonSection =
    selected?.entity === "lessons" &&
    courseSections.find((row) => row.id === selected.parent);
  const lessonModule =
    lessonSection &&
    ownModules.find((row) => row.id === lessonSection.module_id);
  const lessonRows = (section: Row) => {
    const ownLessons = courseLessons
      .filter((lesson) => lesson.section_id === section.id)
      .sort((a, b) => Number(a.order_index) - Number(b.order_index));
    return (
      <DragOrder entity="lessons" siblings={reordering ? ownLessons : []}>
        {(drag) => ownLessons.map((lesson) => {
      const editing =
        selected?.entity === "lessons" && selected.row?.id === lesson.id;
      return (
        <article
          className="lesson-editor-row"
          data-selected={editing || undefined}
          key={lesson.id}
          {...drag.rowProps(lesson)}
        >
          <div className="lesson-editor-title">
            <span className="content-icon">
              {lesson.type === "video" ? (
                <Video size={16} aria-hidden="true" />
              ) : (
                <FileText size={16} aria-hidden="true" />
              )}
            </span>
            <div>
              <strong>{text(lesson, "title")}</strong>{" "}
              {lesson.is_preview ? <span className="badge">Prévia</span> : null}{" "}
              {editing && (
                <span className="badge content-editing">Editando</span>
              )}
              <p>
                {statusName(text(lesson, "status"))} ·{" "}
                {lesson.type === "video" ? "Vídeo" : "Texto"} ·{" "}
                {Math.ceil(Number(lesson.duration_seconds ?? 0) / 60)} min
                {lesson.is_required ? " · Obrigatória" : ""}
              </p>
            </div>
          </div>
          <StructureActions
            entity="lessons"
            row={lesson}
            siblings={reordering ? ownLessons : undefined}
            current={editing}
            drag={drag}
            onEdit={openEditor({
              entity: "lessons",
              row: lesson,
              parent: section.id,
            })}
          />
        </article>
      );
        })}
      </DragOrder>
    );
  };

  return (
    <div className={`content-workbench${selected ? " has-editor" : ""}`}>
      <section className="content-outline">
        <SectionHeading
          title="Estrutura do curso"
          actions={
            <div className="actions">
              {ownModules.length > 0 && (
                <button type="button" aria-pressed={reordering} onClick={() => setReordering(!reordering)}>
                  <ListOrdered size={18} aria-hidden="true" />
                  Reordenar
                </button>
              )}
              <button
                type="button"
                onClick={openEditor({ entity: "modules", parent: course.id })}
              >
                <Plus size={18} aria-hidden="true" />
                Adicionar módulo
              </button>
            </div>
          }
        />
        <p className="content-hint">
          {reordering && "Arraste pela alça ou use Subir e Descer para mudar a ordem. "}
          <HelpLink className="text-action" to="/ajuda/criar-curso">
            Ajuda sobre conteúdo
          </HelpLink>
        </p>
        {deleted.notice}
        <QueryState query={modules}>
          <QueryState query={sections}>
            <QueryState query={lessons}>
              <p className="content-totals">
                {ownModules.length}{" "}
                {ownModules.length === 1 ? "módulo" : "módulos"}
                {" · "}
                {courseLessons.length}{" "}
                {courseLessons.length === 1 ? "aula" : "aulas"}
              </p>
              {moduleDrag.notice}
              <div className="editor-outline">
                {ownModules.map((module) => {
                  const ownSections = courseSections
                    .filter((section) => section.module_id === module.id)
                    .sort(
                      (a, b) => Number(a.order_index) - Number(b.order_index),
                    );
                  // A seção automática guarda as aulas postas direto no módulo e não aparece na tela.
                  const loose = ownSections.find((section) => section.is_default);
                  const named = ownSections.filter((section) => !section.is_default);
                  return (
                    <section
                      className="content-panel content-module"
                      key={module.id}
                      {...moduleDrag.rowProps(module)}
                    >
                      <SectionHeading
                        level={3}
                        title={
                          <>
                            <span className="content-icon">
                              <FolderOpen size={18} aria-hidden="true" />
                            </span>
                            {text(module, "title")}{" "}
                            <span className="badge">
                              {statusName(text(module, "status"))}
                            </span>
                          </>
                        }
                        actions={
                          <StructureActions
                            entity="modules"
                            row={module}
                            siblings={reordering ? ownModules : undefined}
                            current={selected?.row?.id === module.id}
                            drag={moduleDrag}
                            onEdit={openEditor({
                              entity: "modules",
                              row: module,
                              parent: course.id,
                            })}
                          />
                        }
                      />
                      {loose && lessonRows(loose)}
                      <button
                        className="content-append"
                        type="button"
                        onClick={openEditor({
                          entity: "lessons",
                          parent: module.id,
                          inModule: true,
                        })}
                      >
                        <Plus size={18} aria-hidden="true" />
                        Adicionar aula
                      </button>
                      <DragOrder entity="sections" siblings={reordering ? named : []}>
                      {(drag) => named.map((section) => (
                        <div className="section-block" key={section.id} {...drag.rowProps(section)}>
                          <SectionHeading
                            level={4}
                            title={
                              <>
                                {text(section, "title")}{" "}
                                {section.status === "archived" && (
                                  <span className="badge">Arquivado</span>
                                )}{" "}
                                {!!section.is_bonus && (
                                  <span className="badge">Bônus</span>
                                )}
                              </>
                            }
                            actions={
                              <StructureActions
                                entity="sections"
                                row={section}
                                siblings={reordering ? named : undefined}
                                current={selected?.row?.id === section.id}
                                drag={drag}
                                onEdit={openEditor({
                                  entity: "sections",
                                  row: section,
                                  parent: module.id,
                                })}
                              />
                            }
                          />
                          {lessonRows(section)}
                          <button
                            className="content-append"
                            type="button"
                            aria-label={`Adicionar aula em ${text(section, "title")}`}
                            onClick={openEditor({
                              entity: "lessons",
                              parent: section.id,
                            })}
                          >
                            <Plus size={18} aria-hidden="true" />
                            Adicionar aula
                          </button>
                        </div>
                      ))}
                      </DragOrder>
                      <button
                        className="content-append"
                        type="button"
                        onClick={openEditor({
                          entity: "sections",
                          parent: module.id,
                        })}
                      >
                        <Plus size={18} aria-hidden="true" />
                        Adicionar seção
                      </button>
                    </section>
                  );
                })}
              </div>
              {!ownModules.length && (
                <Empty>
                  Este curso ainda não tem módulos. Adicione o primeiro para
                  organizar o conteúdo.
                </Empty>
              )}
            </QueryState>
          </QueryState>
        </QueryState>
      </section>
      {selected && (
        <section
          className="inline-editor content-panel"
          ref={focusPanel}
          key={`${selected.entity}-${selected.row?.id ?? selected.parent}`}
        >
          <SectionHeading
            title={`${currentRow ? "Editar" : "Criar"} ${structureLabels[selected.entity]}`}
            actions={
              <div className="editor-actions"><div className="heading-submit" ref={setStructureSubmit} />
              <button
                className="content-icon-action"
                type="button"
                title="Fechar editor"
                aria-label="Fechar editor"
                onClick={() => setSelected(null)}
              >
                <X size={18} aria-hidden="true" />
              </button>
              </div>
            }
          />
          {currentRow && (
            <p className="content-selection">{text(currentRow, "title")}</p>
          )}
          {currentRow && lessonModule && (
            <div className="actions content-editor-links">
              <Link
                className="button"
                to={courseLessonPath(text(course, "slug"), text(lessonModule, "slug"), currentRow.id)}
              >
                Prévia autorizada da aula
              </Link>
              {currentRow.status !== "archived" && (
                <Link className="button"
                  to={`/admin/cursos/${encodeURIComponent(course.id)}/aulas/${encodeURIComponent(currentRow.id)}/apresentacao`}
                >
                  <Presentation size={18} aria-hidden="true" />
                  Editar apresentação
                </Link>
              )}
            </div>
          )}
          <FormHeadingTarget.Provider value={structureSubmit}>
          <StructureForm
            entity={selected.entity}
            row={currentRow}
            parent={selected.parent}
            inModule={selected.inModule}
            after={async () => {
              await Promise.all([
                modules.refetch(),
                sections.refetch(),
                lessons.refetch(),
              ]);
              setSelected((current) => (current === selected ? null : current));
            }}
            onDeleted={(message) => {
              // O lápis do item apagado saiu da lista: o foco vai para a confirmação.
              opener.current = null;
              setSelected(null);
              deleted.show(message);
            }}
          />
          </FormHeadingTarget.Provider>
        </section>
      )}
    </div>
  );
}
function StructureForm({
  entity,
  row,
  parent,
  inModule,
  after,
  onDeleted,
}: {
  entity: "modules" | "sections" | "lessons";
  row?: Row;
  parent: string;
  inModule?: boolean;
  after: () => Promise<void>;
  onDeleted: (message: string) => void;
}) {
  const video = useRef<HTMLInputElement>(null),
    duration = useRef<HTMLInputElement>(null),
    instructor = useBootstrap().data?.profile.role === "instructor",
    capabilities = useQuery({
      queryKey: ["capabilities"],
      queryFn: () => edge<{ bunny_search: boolean }>("capabilities"),
      enabled: entity === "lessons",
    });
  // Os campos não são controlados: o evento input avisa o Form que houve alteração.
  function fill(input: HTMLInputElement | null, value: string) {
    if (!input) return;
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }
  return (
    <>
      <Form submitInHeading draft={row?.id ?? `${entity}:${parent}`}
        label="Salvar conteúdo"
        onSave={async (data) => {
          let fields: Record<string, unknown> = {
            title: value(data, "title"),
            status: value(data, "status"),
            order_index: num(data, "order_index"),
          };
          if (entity === "modules")
            fields = {
              ...fields,
              slug: slugify(value(data, "slug")),
              ...accessData(data),
              ...(!row ? { course_id: parent } : {}),
            };
          if (entity === "sections")
            fields = {
              ...fields,
              is_bonus: check(data, "is_bonus"),
              ...(!row ? { module_id: parent } : {}),
            };
          if (entity === "lessons")
            fields = {
              ...fields,
              slug: slugify(value(data, "slug")),
              body: value(data, "body"),
              type: value(data, "type"),
              duration_seconds: num(data, "duration_seconds"),
              video_id: lessonVideo(nullable(data, "video_id")),
              is_preview: check(data, "is_preview"),
              is_required: check(data, "is_required"),
              ...(!row
                ? {
                    section_id: inModule
                      ? await rpc<string>("app_admin_default_section", { p_module_id: parent })
                      : parent,
                  }
                : {}),
            };
          await save(entity, row?.id ?? null, fields);
          await after();
        }}
      >
        {entity === "sections" ? (
          <Field label="Título">
            <input
              name="title"
              required
              maxLength={200}
              defaultValue={text(row, "title")}
            />
          </Field>
        ) : (
          <IdentityFields row={row} />
        )}
        {entity === "lessons" && (
          <>
            <fieldset className="content-media">
              <legend>Mídia da aula</legend>
              <div className="content-form-grid">
                <Field label="Tipo de aula">
                  <select name="type" defaultValue={text(row, "type", "video")}>
                    <option value="video">Vídeo</option>
                    <option value="text">Texto</option>
                    {row?.type === "audio" && <option value="audio">Áudio</option>}
                  </select>
                </Field>
                <Field label="Duração em segundos">
                  <input
                    ref={duration}
                    name="duration_seconds"
                    type="number"
                    required
                    min="0"
                    max="86400"
                    defaultValue={Number(row?.duration_seconds ?? 0)}
                  />
                </Field>
              </div>
              <Field
                label="Vídeo do Bunny ou link do YouTube"
                hint={`Cole o link do vídeo no YouTube ou o ID do vídeo na biblioteca do Bunny Stream.${
                  capabilities.data && !capabilities.data.bunny_search
                    ? instructor
                      ? " Peça a um administrador para configurar o Bunny."
                      : " Para buscar na biblioteca, configure o Bunny em Configurações > Integrações."
                    : ""
                }`}
              >
                <input
                  ref={video}
                  name="video_id"
                  defaultValue={youtubeIdPattern.test(text(row, "video_id")) ? `https://www.youtube.com/watch?v=${text(row, "video_id")}` : text(row, "video_id")}
                  maxLength={100}
                />
              </Field>
              {capabilities.data?.bunny_search && (
                <BunnyPicker
                  onPick={(picked) => {
                    fill(video.current, picked.id);
                    // Vídeo ainda em processamento chega sem duração: mantém a que já está no campo.
                    if (picked.length > 0) fill(duration.current, String(picked.length));
                  }}
                />
              )}
            </fieldset>
            <RichEditor
              name="body"
              initial={text(row, "body")}
              label="Descrição da aula"
            />
          </>
        )}
        <div className="content-form-grid">
          <StatusField row={row} />
          <Field label="Posição na lista">
            {/* Fora do rascunho: recuperar um rascunho antigo desfaria a ordem gravada pelo arraste. */}
            <input
              data-no-draft
              name="order_index"
              type="number"
              min="0"
              max="100000"
              defaultValue={Number(row?.order_index ?? 0)}
              required
            />
          </Field>
        </div>
        {entity === "modules" && <AccessFields row={row} inherit />}
        {entity === "sections" && (
          <label className="check">
            <input
              name="is_bonus"
              type="checkbox"
              defaultChecked={!!row?.is_bonus}
            />
            Seção bônus
          </label>
        )}
        {entity === "lessons" && (
          <>
            <label className="check">
              <input
                name="is_preview"
                type="checkbox"
                defaultChecked={!!row?.is_preview}
              />
              Aula de prévia liberada aos membros
            </label>
            <label className="check">
              <input
                name="is_required"
                type="checkbox"
                defaultChecked={row?.is_required !== false}
              />
              Obrigatória para o certificado
            </label>
          </>
        )}
      </Form>
      {entity === "lessons" && (row ? <LessonMaterials lessonId={row.id} /> : (
        <section className="lesson-materials" aria-labelledby="lesson-materials-new">
          <h3 id="lesson-materials-new">Materiais da aula</h3>
          <p>Salve a aula para adicionar materiais.</p>
        </section>
      ))}
      {row && (
        <>
          {entity === "modules" && row.status === "draft" && (
            <AdminCatalogLaunch entity="modules" id={row.id} />
          )}
          <Archive entity={entity} row={row} />
          <DangerZone entity={entity} row={row} onDeleted={onDeleted} />
        </>
      )}
    </>
  );
}
const inLessons = (row: Row) => {
  const count = (row.lesson_ids as string[] | undefined)?.length ?? 0;
  return count ? ` · Em ${count} ${count === 1 ? "aula" : "aulas"}` : "";
};
/** Abre o editor pelo endereço (?editar=<id>), destino de "Editar em Materiais". */
function MaterialFromUrl({ id, open }: { id: string; open: (row: Row) => void }) {
  const row = useAll("materials").data?.find((item) => item.id === id);
  // Só a chegada da linha dispara: open muda a cada render de quem chama.
  useEffect(() => {
    if (row) open(row);
  }, [row]);
  return null;
}

export function AdminMaterials() {
  const folders = useAll("material_folders"),
    [params, setParams] = useSearchParams(),
    [editing, setEditing] = useState<Row | null | undefined>(undefined),
    [folder, setFolder] = useState<Row | null | undefined>(undefined),
    deleted = useDeletedNotice();
  const target = params.get("editar");
  const [folderSubmit, setFolderSubmit] = useState<HTMLDivElement | null>(null);
  const [materialSubmit, setMaterialSubmit] = useState<HTMLDivElement | null>(null);
  return (
    <AdminSurface
      section="materiais"
      trail={["Administração", "Materiais"]}
      title="Materiais"
      description="Organize a biblioteca em pastas e envie os arquivos privados dos alunos."
      action={
        <div className="actions">
          <button onClick={() => setFolder(null)}>Nova pasta</button>
          <button className="primary" onClick={() => setEditing(null)}>
            <Plus size={18} aria-hidden="true" /> Novo material
          </button>
        </div>
      }
    >
      {deleted.notice}
      <AdminList entity="materials" title="Arquivos" icon={<FileText size={20} aria-hidden="true" />}>
        {(item) => (
          <>
            <div>
              <h3>{text(item, "name")}</h3>
              <p>
                {statusName(text(item, "status"))} ·{" "}
                {item.storage_path
                  ? `${materialTypes[text(item, "file_type")] ?? "Arquivo"} · ${materialSize(Number(item.size_bytes))}`
                  : "Sem arquivo"}
                {inLessons(item)}
              </p>
            </div>
            <button onClick={() => setEditing(item)}>Editar material</button>
          </>
        )}
      </AdminList>
      <section className="settings-panel" aria-labelledby="materials-folders">
        <header>
          <h2 id="materials-folders"><FolderOpen size={20} aria-hidden="true" /> Pastas</h2>
        </header>
        <QueryState query={folders}>
          {folders.data?.length ? folders.data.map((item) => (
            <div className="resource-row" key={item.id}>
              <strong>{text(item, "name")}</strong>
              <button onClick={() => setFolder(item)}>Editar pasta</button>
            </div>
          )) : <Empty>Nenhuma pasta cadastrada.</Empty>}
        </QueryState>
      </section>
      {folder !== undefined && (
        <section className="settings-panel">
          <div className="reading inline-editor" ref={focusEditor} key={folder?.id ?? "new-folder"}>
            <SectionHeading title={folder ? "Editar pasta" : "Criar pasta"}
              actions={<div className="heading-submit" ref={setFolderSubmit} />} />
            <FormHeadingTarget.Provider value={folderSubmit}>
            <Form submitInHeading draft={folder?.id}
              label="Salvar pasta"
              secondaryAction={<button type="button" onClick={() => setFolder(undefined)}>Fechar editor</button>}
              onSave={async (data) => {
                await save("material_folders", folder?.id ?? null, {
                  name: value(data, "name"),
                  status: value(data, "status"),
                  ...accessData(data),
                  ...(!folder ? { parent_id: nullable(data, "parent_id") } : {}),
                });
                setFolder(undefined);
              }}
            >
              <Field label="Nome da pasta">
                <input
                  name="name"
                  required
                  defaultValue={text(folder ?? undefined, "name")}
                />
              </Field>
              {!folder && (
                <Field label="Pasta superior">
                  <select name="parent_id">
                    <option value="">Raiz da biblioteca</option>
                    {folders.data?.map((f) => (
                      <option key={f.id} value={f.id}>
                        {text(f, "name")}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              <StatusField row={folder ?? undefined} />
              <AccessFields row={folder ?? undefined} />
            </Form>
            </FormHeadingTarget.Provider>
            {folder && (
              <>
                <Archive entity="material_folders" row={folder} />
                <DangerZone entity="material_folders" row={folder} onDeleted={(message) => {
                  setFolder(undefined);
                  deleted.show(message);
                }} />
              </>
            )}
          </div>
        </section>
      )}
      {target && (
        <MaterialFromUrl id={target} open={(row) => {
          setEditing(row);
          // Sem o parâmetro, fechar o editor não o reabre quando a lista recarrega.
          setParams((current) => {
            const next = new URLSearchParams(current);
            next.delete("editar");
            return next;
          }, { replace: true });
        }} />
      )}
      {editing !== undefined && (
        <section className="settings-panel">
          <div className="reading inline-editor" ref={focusEditor} key={editing?.id ?? "new-material"}>
            <SectionHeading title={editing ? "Editar material" : "Criar material"}
              actions={<div className="heading-submit" ref={setMaterialSubmit} />} />
            <FormHeadingTarget.Provider value={materialSubmit}>
            <Form submitInHeading draft={editing?.id}
              label="Salvar material"
              secondaryAction={<button type="button" onClick={() => setEditing(undefined)}>Fechar editor</button>}
              onSave={async (data) => {
                const saved = {
                  name: value(data, "name"),
                  description: value(data, "description"),
                  folder_id: nullable(data, "folder_id"),
                  lesson_ids: data.getAll("lesson_ids").map(String),
                  file_type: value(data, "file_type"),
                  status: value(data, "status"),
                  ...accessData(data),
                };
                const result = await save("materials", editing?.id ?? null, saved);
                // O material novo remonta o editor com a chave do id; sem tudo o que foi salvo, os campos voltariam ao padrão.
                setEditing({ ...editing, id: result.id, ...saved });
              }}
            >
              <Field label="Nome">
                <input
                  name="name"
                  required
                  defaultValue={text(editing ?? undefined, "name")}
                />
              </Field>
              <Field label="Descrição">
                <textarea
                  name="description"
                  defaultValue={text(editing ?? undefined, "description")}
                />
              </Field>
              <Field label="Pasta">
                <select
                  name="folder_id"
                  defaultValue={text(editing ?? undefined, "folder_id")}
                >
                  <option value="">Raiz</option>
                  {folders.data?.map((f) => (
                    <option key={f.id} value={f.id}>
                      {text(f, "name")}
                    </option>
                  ))}
                </select>
              </Field>
              <LessonLinks selected={(editing?.lesson_ids as string[] | undefined) ?? []} />
              <Field label="Tipo">
                {/* A chave remonta o campo quando o envio grava o tipo real do arquivo (a imagem vira WebP). */}
                <select
                  key={text(editing ?? undefined, "file_type", "")}
                  name="file_type"
                  defaultValue={text(
                    editing ?? undefined,
                    "file_type",
                    "application/pdf",
                  )}
                >
                  {/* A plataforma não recebe vídeo: o MP4 só aparece no material antigo que já é MP4, para salvar sem trocar o tipo. */}
                  {Object.entries(materialTypes)
                    .filter(([type]) => type !== "video/mp4" || text(editing ?? undefined, "file_type") === type)
                    .map(([type, label]) => (
                      <option key={type} value={type}>{label}</option>
                    ))}
                </select>
              </Field>
              <StatusField row={editing ?? undefined} />
              <AccessFields row={editing ?? undefined} />
            </Form>
            </FormHeadingTarget.Provider>
            {editing && (
              <>
                <Upload kind="material" resourceId={editing.id} onUploaded={(file) => setEditing({ ...editing, file_type: file.type })} />
                <Archive entity="materials" row={editing} />
                <DangerZone entity="materials" row={editing} onDeleted={(message) => {
                  setEditing(undefined);
                  deleted.show(message);
                }} />
              </>
            )}
          </div>
        </section>
      )}
    </AdminSurface>
  );
}
const orderStatuses = ["paid", "pending", "refunded", "chargeback", "expired", "cancelled"] as const;

function orderStatusLabel(status: string) {
  return status === "pending" ? "Aguardando pagamento" : statusName(status);
}

function CommercialList({
  entity,
  title,
  description,
  section,
  searchHint,
  action,
  editor,
  children,
}: {
  entity: "profiles" | "plans" | "orders";
  title: string;
  description: string;
  section: string;
  searchHint: string;
    action?: ReactNode;
  editor?: ReactNode;
  children: (items: Row[]) => ReactNode;
}) {
  const [params, setParams] = useSearchParams();
  const situation = entity === "orders"
    ? orderStatuses.find((status) => status === params.get("situacao"))
    : undefined;
  const q = params.get("q") ?? "";
  const role = entity === "profiles" ? params.get("papel") ?? "" : "";
  const plan = entity === "profiles" ? params.get("plano") ?? "" : "";
  const memberStatus = entity === "profiles" ? params.get("estado") ?? "" : "";
  const page = Number(params.get("page") || 1);
  const filters = { p_role: role || null, p_plan: plan || null, p_status: situation || memberStatus || null };
  const query = useRpc<Page<Row> & { metrics: Record<string, number>; plans?: { id: string; name: string }[] }>("app_admin_commercial", {
    p_entity: entity, p_query: q, p_page: page, ...filters,
  });
  const setFilter = (name: string, value: string) => setParams((previous) => {
    const next = new URLSearchParams(previous);
    next.delete("page");
    if (value) next.set(name, value);
    else next.delete(name);
    return next;
  });
  const scope = situation ? "Na situação selecionada" : q || role || plan || memberStatus ? "Na busca atual" : "Em todo o cadastro";
  const metrics = query.data?.metrics;
  const indicators: [string, number | string | undefined][] = !metrics ? [] : entity === "profiles"
    ? [["Sem suspensão", metrics.active], ["Suspensos", metrics.suspended], ["Com plano vigente", metrics.with_plan]]
    : entity === "plans" ? [["Ativos", metrics.active], ["Inativos", metrics.inactive]]
    : [["Pedidos pagos", metrics.paid], ["Pedidos pendentes", metrics.pending], ["Valor dos pedidos pagos", metrics.revenue_cents == null ? undefined : money(metrics.revenue_cents)]];
  const total = query.data?.total ?? 0;
  const search = (
    <Search
      variant="stitch"
      placeholder={searchHint}
      label={entity === "orders" ? "Buscar pedidos" : undefined}
      initial={q}
      onSearch={(q) => entity === "orders" ? setParams({ q }) : setFilter("q", q)}
    />
  );

  return (
    <AdminSurface className={`admin-commercial ${entity === "plans" ? "admin-commercial-plans" : ""}`}
      section={entity} trail={["Administração", { profiles: "Membros", plans: "Planos", orders: "Pedidos" }[entity]]}
      title={title} description={description}
        action={
          <div className="commercial-heading-actions">
            {action}
            {entity !== "plans" && (
              <div className="commercial-export" data-tour="admin-export">
                <Action
                  disabled={!query.isSuccess || !total || total > exportLimit}
                  run={async () => {
                    const csv = await buildAdminCsv(entity, q, filters);
                    downloadBlob(
                      new Blob([csv], { type: "text/csv;charset=utf-8" }),
                      `${entity === "profiles" ? "membros" : "pedidos"}-icarus.csv`,
                    );
                  }}
                >
                  <Download size={16} aria-hidden="true" />
                  Exportar resultado completo em CSV
                </Action>
                <small>
                  {total > exportLimit ? "Refine a busca. " : ""}
                  Limite de {exportLimit.toLocaleString("pt-BR")} registros.
                </small>
              </div>
            )}
          </div>
        }
      >
      {query.isSuccess && (
        <dl className="admin-metrics" aria-label="Resumo dos resultados">
          <div>
            <dt>Total encontrado</dt>
            <dd>
              <strong>{total.toLocaleString("pt-BR")}</strong>
              <small>{scope}</small>
            </dd>
          </div>
          {indicators.filter(([, metric]) => metric !== undefined).map(([label, metric]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>
                <strong>{metric?.toLocaleString("pt-BR")}</strong>
                <small>{scope}</small>
              </dd>
            </div>
          ))}
        </dl>
      )}
      {entity !== "plans" && (
        <div className="admin-filters">
          {search}
          {entity === "profiles" && <div className="admin-list-filters" data-tour="member-filters">
            <Field label="Papel">
              <select value={role} onChange={(event) => setFilter("papel", event.target.value)}>
                <option value="">Todos os papéis</option><option value="staff">Equipe</option>
                {["admin", "instructor", "moderator", "support", "member"].map((item) =>
                  <option key={item} value={item}>{roleLabel(item)}</option>)}
              </select>
            </Field>
            <Field label="Plano vigente">
              <select value={plan} onChange={(event) => setFilter("plano", event.target.value)}>
                <option value="">Todos os planos</option><option value="none">Sem plano vigente</option>
                {query.data?.plans?.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
              </select>
            </Field>
            <Field label="Situação">
              <select value={memberStatus} onChange={(event) => setFilter("estado", event.target.value)}>
                <option value="">Todas as situações</option><option value="active">Ativo</option><option value="suspended">Suspenso</option>
              </select>
            </Field>
          </div>}
          {entity === "orders" && (
            <div className="commercial-order-filters" data-tour="order-filters">
              <div className="commercial-statuses" role="group" aria-label="Situação dos pedidos">
                <button type="button" aria-pressed={!situation && !q} onClick={() => setParams({})}>
                  Todos
                </button>
                {orderStatuses.map((status) => (
                  <button
                    type="button"
                    key={status}
                    aria-pressed={situation === status}
                    onClick={() => setParams({ situacao: status })}
                  >
                    {orderStatusLabel(status)}
                  </button>
                ))}
              </div>
              <small>Buscar por ID ou valor consulta todas as situações.</small>
            </div>
          )}
        </div>
      )}
      <section className="commercial-results" aria-label={section}>
        <header>
          <h2>{section}</h2>
          {entity === "plans" && search}
        </header>
        <QueryState query={query}>
          {query.data && (
            <>
              {query.data.items.length ? (
                children(query.data.items)
              ) : (
                <Empty>
                  {situation
                    ? "Nenhum pedido nesta situação."
                    : q
                    ? "Nenhum resultado para esta busca. Tente outro termo."
                    : "Nenhum registro cadastrado."}
                </Empty>
              )}
              <Pager
                page={page}
                total={total}
                onChange={(page) => setFilter("page", String(page))}
              />
            </>
          )}
        </QueryState>
      </section>
      {editor}
    </AdminSurface>
  );
}

function memberCompany(member: Row) {
  return member.company as { name?: string; segment?: string } | undefined;
}

function CommercialTable({
  label,
  columns,
  children,
}: {
  label: string;
  columns: string[];
  children: ReactNode;
}) {
  return (
    <table className="commercial-table" role="table" aria-label={label}>
      <thead role="rowgroup">
        <tr role="row">
          {columns.map((column) => (
            <th key={column} scope="col" role="columnheader">
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody role="rowgroup">{children}</tbody>
    </table>
  );
}

function CommercialCell({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <td role="cell">
      <span className="commercial-cell-label" aria-hidden="true">
        {label}
      </span>
      {children}
    </td>
  );
}

export function AdminMembers() {
  return (
      <CommercialList
        entity="profiles"
        title="Gestão de membros e CRM"
        description="Consulte cadastros, planos e vigências. A ficha reúne o progresso e o histórico de cada membro."
        section="Diretório de membros"
        searchHint="Buscar por nome, empresa ou e-mail"
        action={
          <Link className="button" to="/admin/comunidade">
            Moderação da comunidade
          </Link>
        }
      >
        {(members) => (
          <CommercialTable
            label="Tabela de membros"
            columns={[
              "Membro",
              "Empresa",
              "Plano e vigência",
              "Situação",
              "Ações",
            ]}
          >
            {members.map((member) => {
              const company = memberCompany(member);
              const name = memberName(member);
              return (
                <tr key={member.id} role="row">
                  <th scope="row" role="rowheader">
                    <div className="commercial-identity">
                      <span aria-hidden="true">
                        {name
                          .split(/\s+/)
                          .slice(0, 2)
                          .map((part) => part[0])
                          .join("")
                          .toUpperCase()}
                      </span>
                      <div>
                        {name}
                        <small>{roleLabel(text(member, "role"))}</small>
                        {typeof member.email === "string" && <small>{member.email}</small>}
                      </div>
                    </div>
                  </th>
                  <CommercialCell label="Empresa">
                    {company?.name || "—"}
                    {company?.segment && <small>{company.segment}</small>}
                  </CommercialCell>
                  <CommercialCell label="Plano e vigência">
                    {text(member, "plan_name", "Sem plano ativo")}
                    {member.access_ends_at ? (
                      <small>Até {date(text(member, "access_ends_at"))}</small>
                    ) : null}
                  </CommercialCell>
                  <CommercialCell label="Situação">
                    <span
                      className="badge"
                      data-tone={member.suspended ? "error" : "success"}
                    >
                      {member.suspended ? "Suspenso" : "Ativo"}
                    </span>
                  </CommercialCell>
                  <td role="cell">
                    <Link
                      className="button"
                      to={"/admin/membros/" + member.id}
                      aria-label={"Abrir ficha de " + name}
                    >
                      Abrir ficha
                      <ArrowRight size={16} aria-hidden="true" />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </CommercialTable>
        )}
      </CommercialList>
  );
}

function focusMemberReview(title: HTMLHeadingElement | null) {
  if (!title) return;
  const opener = document.activeElement;
  title.focus();
  return () => {
    if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
  };
}

export function MemberEditor() {
  const { id } = useParams();
  return <MemberDetailPanel key={id} id={id} />;
}

function MemberDetailPanel({ id }: { id?: string }) {
  const members = useRpc<MemberDetail>("app_admin_member_detail", { p_id: id }),
    member = members.data?.profile,
    plans = useAll("plans"),
    [change, setChange] = useState<Record<string, unknown> | null>(null),
    [reason, setReason] = useState(""),
    [applied, setApplied] = useState(false);
  return (
    <AdminSurface className="admin-commercial" section="membros-ficha"
      trail={["Administração", { label: "Membros", to: "/admin/membros" }, "Detalhes"]}
      title={member ? memberName(member) : "Ficha do membro"} description="Perfil, acesso e histórico do membro.">
      <QueryState query={members}>
        {member ? (
          <div className="commercial-detail">
            <section className="commercial-panel">
              <h2>Perfil e acesso</h2>
              <dl>
                {typeof member.email === "string" && <><dt>E-mail</dt><dd>{member.email}</dd></>}
                <dt>Empresa</dt>
                <dd>{memberCompany(member)?.name || "Não informada"}</dd>
                <dt>Papel</dt>
                <dd>{roleLabel(text(member, "role"))}</dd>
                <dt>Estado</dt>
                <dd>{member.suspended ? "Suspenso" : "Ativo"}</dd>
                <dt>Onboarding</dt>
                <dd>{member.onboarding_complete ? "Concluído" : "Pendente"}</dd>
              </dl>
            </section>
            {members.data && <MemberFacts detail={members.data} />}
            <section className="commercial-panel commercial-access">
              <h2>Alterar acesso</h2>
              <Notice>
                Conceder acesso aqui é uma cortesia auditada. Esta ação não cria
                um pagamento nem confirma uma venda.
              </Notice>
              <Form
                draft={false}
                label="Revisar alteração"
                successMessage={
                  change
                    ? "Dados preparados. Confirme sua identidade para aplicar a alteração."
                    : ""
                }
                onSave={async (data) => {
                  setApplied(false);
                  const plan = value(data, "plan_id");
                  const expires = new Date(value(data, "access_ends_at"));
                  if (plan && Number.isNaN(expires.getTime())) {
                    setChange(null);
                    throw new Error("Informe a validade da cortesia.");
                  }
                  setChange({
                    role: value(data, "role"),
                    suspended: check(data, "suspended"),
                    ...(plan
                      ? {
                          plan_id: plan,
                          access_ends_at: expires.toISOString(),
                        }
                      : {}),
                    ...(check(data, "revoke_access")
                      ? { revoke_access: true }
                      : {}),
                  });
                  setReason(value(data, "reason"));
                }}
              >
                <Field label="Papel">
                  <select name="role" defaultValue={text(member, "role")}>
                    {Object.entries(roleLabels).map(([role, label]) => (
                      <option key={role} value={role}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
                <label className="check">
                  <input
                    name="suspended"
                    type="checkbox"
                    defaultChecked={!!member.suspended}
                  />
                  Suspender acesso
                </label>
                <Field label="Plano a conceder como cortesia">
                  <select name="plan_id">
                    <option value="">Manter plano atual</option>
                    {plans.data?.map((plan) => (
                      <option key={plan.id} value={plan.id}>
                        {text(plan, "name")}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Validade da cortesia">
                  <input name="access_ends_at" type="datetime-local" />
                </Field>
                <label className="check">
                  <input name="revoke_access" type="checkbox" />
                  Revogar concessões atuais
                </label>
                <Field label="Motivo obrigatório">
                  <textarea
                    name="reason"
                    required
                    minLength={5}
                    maxLength={2000}
                  />
                </Field>
              </Form>
              {applied && <Notice>Alteração de acesso registrada.</Notice>}
              {change && (
                <section className="commercial-review">
                  <h2 tabIndex={-1} ref={focusMemberReview}>
                    Confirme a alteração
                  </h2>
                  <dl>
                    <dt>Papel</dt>
                    <dd>{roleLabel(String(change.role))}</dd>
                    <dt>Acesso</dt>
                    <dd>{change.suspended ? "Suspenso" : "Ativo"}</dd>
                    {!!change.plan_id && (
                      <>
                        <dt>Cortesia até</dt>
                        <dd>{date(String(change.access_ends_at))}</dd>
                      </>
                    )}
                    {!!change.revoke_access && (
                      <>
                        <dt>Concessões atuais</dt>
                        <dd>Revogar</dd>
                      </>
                    )}
                    <dt>Motivo</dt>
                    <dd>{reason}</dd>
                  </dl>
                  <div className="actions">
                    <Reauth>
                      {async (token) => {
                        await rpc("app_admin_member", {
                          p_id: id,
                          p_data: change,
                          p_reason: reason,
                          p_reauth_token: token,
                        });
                        setChange(null);
                        setApplied(true);
                        await Promise.all([
                          members.refetch(),
                          cache.invalidateQueries({
                            queryKey: [
                              "app_admin_list",
                              { p_entity: "profiles" },
                            ],
                          }),
                        ]);
                      }}
                    </Reauth>
                    <button onClick={() => setChange(null)}>
                      Cancelar alteração
                    </button>
                  </div>
                </section>
              )}
            </section>
          </div>
        ) : (
          <Empty>Membro não encontrado.</Empty>
        )}
      </QueryState>
    </AdminSurface>
  );
}
function MemberFacts({ detail }: { detail: MemberDetail }) {
  const concessionStatus: Record<string, string> = {
    active: "Ativa",
    expired: "Expirada",
    scheduled: "Agendada",
    revoked: "Revogada",
  };
  return (
    <>
      <section className="commercial-panel">
        <h2>Plano e vigência</h2>
        <p>
          {text(detail.profile, "plan_name", "Sem plano ativo")} · validade{" "}
          {date(text(detail.profile, "access_ends_at") || null)}
        </p>
        <details className="member-concessions">
          <summary>Concessões ({detail.subscriptions.total})</summary>
          {detail.subscriptions.items.map((subscription) => (
            <article className="plan-row" key={subscription.id}>
              <h3>{text(subscription, "plan_name")}</h3>
              <p>
                {concessionStatus[text(subscription, "status")] ??
                  text(subscription, "status")}{" "}
                · {date(text(subscription, "starts_at"))} a{" "}
                {date(text(subscription, "ends_at"))} ·{" "}
                {subscription.source === "courtesy" ? "Cortesia" : "Pedido"}
              </p>
            </article>
          ))}
          {detail.subscriptions.total > 20 && (
            <p>
              Exibindo as 20 concessões mais recentes de{" "}
              {detail.subscriptions.total}.
            </p>
          )}
        </details>
      </section>
      <section className="commercial-panel">
        <h2>Aprendizado ({detail.courses.total} {detail.courses.total === 1 ? "curso" : "cursos"})</h2>
        {detail.courses.total === 0 && <Empty>Nenhum curso com progresso.</Empty>}
        {detail.courses.items.map((course) => (
          <div className="plan-row" key={course.id}>
            <h3>{course.title}</h3>
            <Progress
              value={course.progress_percent}
              done={course.completed_lessons}
              total={course.total_lessons}
            />
          </div>
        ))}
      </section>
      <section className="commercial-panel">
        <h2>Pedidos ({detail.orders.total})</h2>
        {detail.orders.total === 0 && <Empty>Nenhum pedido registrado.</Empty>}
        {detail.orders.items.map((order) => (
          <p key={order.id}>
            <Link className="text-action" to={"/admin/pedidos/" + order.id}>
              {order.id.slice(0, 8)} · {money(Number(order.amount_cents))} ·{" "}
              {orderStatusLabel(text(order, "status"))}
            </Link>
          </p>
        ))}
      </section>
      <section className="commercial-panel">
        <h2>Chamados ({detail.tickets.total})</h2>
        {detail.tickets.total === 0 && <Empty>Nenhum chamado registrado.</Empty>}
        {detail.tickets.items.map((ticket) => (
          <p key={ticket.id}>
            <Link className="text-action" to={"/admin/suporte/" + ticket.id}>
              {text(ticket, "subject")} · {statusName(text(ticket, "status"))}
            </Link>
          </p>
        ))}
      </section>
      {[detail.courses.total, detail.orders.total, detail.tickets.total].some(
        (total) => total > 20,
      ) && (
        <Notice>
          A ficha mostra até 20 registros recentes de cada seção. As contagens
          representam o total confirmado pelo servidor.
        </Notice>
      )}
    </>
  );
}
export function AdminPlans() {
  const [editing, setEditing] = useState<Row | null | undefined>(undefined);
  const [saved, setSaved] = useState(false);
  const [submitTarget, setSubmitTarget] = useState<HTMLDivElement | null>(null);
  return (
      <CommercialList
        entity="plans"
        title="Planos e ofertas"
        description="Gerencie os preços, a duração de acesso e os benefícios de cada plano."
        section="Planos cadastrados"
        searchHint="Buscar plano"
        editor={editing !== undefined && (
        <section
          className="commercial-panel commercial-plan-editor"
          ref={focusEditor}
          key={editing?.id ?? "new"}
        >
          <SectionHeading title={editing ? "Editar plano" : "Criar plano"}
            actions={<div className="heading-submit" ref={setSubmitTarget} />} />
          <FormHeadingTarget.Provider value={submitTarget}>
          <Form
            draft={editing?.id}
            submitInHeading
            label="Salvar plano"
            onDone={() => {
              setSaved(true);
              setEditing(undefined);
            }}
            secondaryAction={
              <button type="button" onClick={() => setEditing(undefined)}>
                Fechar editor
              </button>
            }
            onSave={async (data) => {
              await save("plans", editing?.id ?? null, {
                name: value(data, "name"),
                slug: slugify(value(data, "slug")),
                price_cents: Math.round(num(data, "price") * 100),
                access_months: num(data, "access_months"),
                benefits: value(data, "benefits")
                  .split("\n")
                  .map((v) => v.trim())
                  .filter(Boolean),
                active: check(data, "active"),
                interest_free: check(data, "interest_free"),
              });
            }}
          >
            <IdentityFields row={editing ?? undefined} label="Nome" name="name" max={120} />
            <Field
              label="Preço em reais"
            >
              <input
                name="price"
                type="number"
                required
                min="0"
                step="0.01"
                max="21474836.47"
                defaultValue={Number(editing?.price_cents ?? 0) / 100}
              />
            </Field>
            <Field label="Meses de acesso">
              <input
                name="access_months"
                type="number"
                min="1"
                max="120"
                required
                defaultValue={Number(editing?.access_months ?? 12)}
              />
            </Field>
            <Field label="Benefícios, um por linha">
              <textarea
                name="benefits"
                defaultValue={((editing?.benefits as string[]) ?? []).join(
                  "\n",
                )}
              />
            </Field>
            <label className="check">
              <input
                type="checkbox"
                name="active"
                defaultChecked={editing?.active !== false}
              />
              Plano ativo
            </label>
            <label className="check">
              <input
                type="checkbox"
                name="interest_free"
                defaultChecked={editing?.interest_free === true}
                aria-describedby="plan-interest-free-hint"
              />
              Parcelamento sem juros no cartão
            </label>
            <small className="check-hint" id="plan-interest-free-hint">
              Ligue só se a sua conta do Asaas não repassa juros do parcelamento ao aluno.
            </small>
          </Form>
          </FormHeadingTarget.Provider>
        </section>
        )}
        action={
          <button
            className="primary"
            onClick={() => {
              setSaved(false);
              setEditing(null);
            }}
          >
            <Plus size={16} aria-hidden="true" />
            Criar plano
          </button>
        }
      >
        {(plans) => <>
          {saved && <Notice>Plano salvo com sucesso.</Notice>}
          <div className="commercial-plans">
            {plans.map((plan) => (
              <article
                className="commercial-panel commercial-plan"
                key={plan.id}
              >
                <span
                  className="badge"
                  data-tone={plan.active ? "success" : undefined}
                >
                  {plan.active ? "Ativo" : "Inativo"}
                </span>
                <h3>{text(plan, "name")}</h3>
                <p className="commercial-price">
                  {money(Number(plan.price_cents))}
                </p>
                <p className="commercial-plan-duration">
                  {Number(plan.access_months) === 1
                    ? "1 mês de acesso"
                    : `${plan.access_months} meses de acesso`}
                </p>
                {Array.isArray(plan.benefits) && plan.benefits.length > 0 && (
                  <ul aria-label="Benefícios">
                    {(plan.benefits as string[]).map((benefit, position) => (
                      <li key={position}>
                        <Check size={16} aria-hidden="true" />
                        {benefit}
                      </li>
                    ))}
                  </ul>
                )}
                <button
                  onClick={() => {
                    setSaved(false);
                    setEditing(plan);
                  }}
                  aria-label={"Editar plano " + text(plan, "name")}
                >
                  <Pencil size={16} aria-hidden="true" />
                  Editar plano
                </button>
              </article>
            ))}
          </div>
        </>}
      </CommercialList>
  );
}
function orderMethod(order: Row) {
  const method = text(order, "method");
  return method === "CREDIT_CARD" ? "Cartão de crédito" : method;
}

function OrderBadge({ order }: { order: Row }) {
  const status = text(order, "status");
  const tone =
    status === "paid"
      ? "success"
      : status === "chargeback"
        ? "error"
        : undefined;
  return (
    <span className="badge" data-tone={tone}>
      {orderStatusLabel(status)}
    </span>
  );
}

function OrderDetail({ id }: { id: string }) {
  const validId = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id);
  const orders = useRpc<Page<Row>>(
    "app_admin_list",
    { p_entity: "orders", p_query: id, p_page: 1 },
    validId,
  );
  const order = orders.data?.items.find((item) => item.id === id);
  return (
    <AdminSurface className="admin-commercial" section="pedidos-ficha"
      trail={["Administração", { label: "Pedidos", to: "/admin/pedidos" }, "Detalhes"]}
      title="Detalhes do pedido" description="Confira o pagamento e a concessão de acesso.">
      {!validId ? (
        <Empty>Pedido não encontrado.</Empty>
      ) : (
        <QueryState query={orders}>
          {order ? (
            <div className="commercial-detail">
              <section className="commercial-panel">
                <OrderBadge order={order} />
                <h2>Resumo do pagamento</h2>
                <p className="commercial-price">
                  {money(Number(order.amount_cents))}
                </p>
                <dl>
                  <dt>Identificador</dt>
                  <dd>{order.id}</dd>
                  <dt>Método</dt>
                  <dd>{orderMethod(order)}</dd>
                  <dt>Concessão registrada</dt>
                  <dd>{order.finalized_at ? "Sim" : "Ainda não confirmado"}</dd>
                </dl>
                {order.user_id ? (
                  <Link
                    className="button"
                    to={"/admin/membros/" + text(order, "user_id")}
                  >
                    Abrir ficha do membro
                  </Link>
                ) : null}
              </section>
              <section className="commercial-panel">
                <h2>Histórico do pedido</h2>
                <ol
                  className="commercial-timeline"
                  aria-label="Eventos registrados"
                >
                  {[
                    ["Pedido criado", text(order, "created_at")],
                    ["Pagamento confirmado", text(order, "paid_at")],
                    ["Acesso concedido", text(order, "finalized_at")],
                  ]
                    .filter(([, timestamp]) => timestamp)
                    .map(([event, timestamp]) => (
                      <li key={event}>
                        {event}
                        <time dateTime={timestamp}>{date(timestamp)}</time>
                      </li>
                    ))}
                </ol>
              </section>
              <Notice>
                Estorno, documento fiscal e reenvio de convite dependem de
                operações do provedor no servidor.
              </Notice>
            </div>
          ) : (
            <Empty>Pedido não encontrado.</Empty>
          )}
        </QueryState>
      )}
    </AdminSurface>
  );
}

export function AdminOrders() {
  const { id } = useParams();
  if (id) return <OrderDetail id={id} />;

  return (
      <CommercialList
        entity="orders"
        title="Pedidos e faturamento"
        description="Consulte transações, valores dos pedidos e os estados confirmados pelo servidor."
        section="Livro de vendas"
        searchHint="Buscar por ID ou valor em reais"
      >
        {(orders) => (
          <CommercialTable
            label="Tabela de pedidos"
            columns={[
              "Pedido e data",
              "Método",
              "Valor do pedido",
              "Status",
              "Ações",
            ]}
          >
            {orders.map((order) => (
              <tr key={order.id} role="row">
                <th scope="row" role="rowheader">
                  {order.id.slice(0, 8)}
                  <small>{date(text(order, "created_at"))}</small>
                </th>
                <CommercialCell label="Método">
                  {orderMethod(order)}
                </CommercialCell>
                <CommercialCell label="Valor do pedido">
                  {money(Number(order.amount_cents))}
                </CommercialCell>
                <CommercialCell label="Status">
                  <OrderBadge order={order} />
                </CommercialCell>
                <td role="cell">
                  <Link
                    className="button"
                    to={"/admin/pedidos/" + order.id}
                    aria-label={"Detalhes do pedido " + order.id.slice(0, 8)}
                  >
                    Detalhes
                    <ArrowRight size={16} aria-hidden="true" />
                  </Link>
                </td>
              </tr>
            ))}
          </CommercialTable>
        )}
      </CommercialList>
  );
}
export function AdminCommunity() {
  const [params] = useSearchParams(),
    tab = params.get("aba") ?? "moderacao",
    [editing, setEditing] = useState<Row | null | undefined>(undefined),
    spaces = useAll("spaces");
  const orderedSpaces = orderedSettings(spaces.data);
  const current = communityTabs.find(([id]) => id === tab) ?? communityTabs[0];
  const pending = params.get("situacao") !== "todas";
  const moderationFilters = (result: Page<Row> & { pending?: number } | undefined) =>
    <NavigationTabs label="Situação da moderação" selected={pending ? "pending" : "all"}
      items={[
        { id: "pending", label: result?.pending == null ? "Pendentes" : `Pendentes (${result.pending})`, to: `?aba=${tab}&situacao=pendentes` },
        { id: "all", label: "Todas", to: `?aba=${tab}&situacao=todas` },
      ]} />;
  return (
    <AdminSurface
      section={"comunidade-" + current[0]}
      trail={["Administração", "Comunidade", current[1]]}
      title="Comunidade"
      description="Modere publicações, respostas e denúncias e organize os espaços."
      action={<Link className="button" to="/admin/comentarios-aula">Comentários de aula</Link>}
      tabs={<NavigationTabs label="Administração da comunidade" selected={current[0]}
        items={communityTabs.map(([id, label]) => ({ id, label, to: `?aba=${id}` }))} />}
    >
      {tab === "moderacao" && (
        <AdminList entity="posts" rpc="app_admin_moderation_queue" listArgs={{ p_entity: "posts", p_status: pending ? "pending" : null }}
          filters={moderationFilters} title="Fila de publicações" icon={<MessageSquare size={20} aria-hidden="true" />}>
          {(post) => (
            <div>
              <p className="meta">
                {statusName(text(post, "status"))} ·{" "}
                {date(text(post, "created_at"))}
              </p>
              <h3>
                <Link to={"/admin/comunidade/" + post.id}>
                  {text(post, "title")}
                </Link>
              </h3>
              <p className="clamp">{text(post, "body")}</p>
              <Moderate
                type="post"
                status={text(post, "status")}
                id={post.id}
                after={() =>
                  cache.invalidateQueries({ queryKey: ["app_admin_list"] })
                }
              />
            </div>
          )}
        </AdminList>
      )}
      {tab === "respostas" && (
        <AdminList entity="replies" rpc="app_admin_moderation_queue" listArgs={{ p_entity: "replies", p_status: pending ? "pending" : null }}
          filters={moderationFilters} title="Fila de respostas" icon={<Reply size={20} aria-hidden="true" />}>
          {(reply) => (
            <div>
              <p>
                {statusName(text(reply, "status"))} ·{" "}
                {date(text(reply, "created_at"))}
              </p>
              <p className="prose">{text(reply, "body")}</p>
              <Link className="text-action" to={"/admin/comunidade/" + text(reply, "post_id")}>
                Abrir publicação
              </Link>
              <Moderate
                type="reply"
                status={text(reply, "status")}
                id={reply.id}
                after={() =>
                  cache.invalidateQueries({ queryKey: ["app_admin_list"] })
                }
              />
            </div>
          )}
        </AdminList>
      )}
      {tab === "denuncias" && (
        <AdminList entity="reports" rpc="app_admin_reports" title="Denúncias" icon={<Flag size={20} aria-hidden="true" />}>
          {(report) => (
            <div>
              <h3>{text(report, "title") || "Conteúdo indisponível"}</h3>
              {text(report, "excerpt") && <p>{text(report, "excerpt")}</p>}
              <p>
                {report.target_type === "reply" ? "Resposta" : "Publicação"} de{" "}
                {text(report, "author_name") || "Membro sem nome"} ·{" "}
                {statusName(text(report, "target_status"))}
              </p>
              <p>
                Motivo da denúncia: {text(report, "reason")} · enviada
                {report.reporter_name != null && ` por ${text(report, "reporter_name").trim() || "Membro sem nome"}`} em{" "}
                {date(text(report, "created_at"))}
              </p>
              <p>Estado: {reportStatus[text(report, "status")] ?? text(report, "status")}</p>
              {text(report, "post_id") && (
                <Link className="button" to={`/admin/comunidade/${text(report, "post_id")}`}>
                  Abrir publicação
                </Link>
              )}
              {report.status === "pending" && (report.reply_id || report.post_id) ? (
                <Moderate type={report.target_type === "reply" ? "reply" : "post"}
                  status={text(report, "target_status")} id={text(report, report.target_type === "reply" ? "reply_id" : "post_id")}
                  after={() => cache.invalidateQueries({ queryKey: ["app_admin_reports"] })} />
              ) : null}
              {text(report, "status") === "pending" && <Form
                draft={false}
                label="Concluir análise"
                onSave={async (data) => {
                  await rpc("app_moderate", {
                    p_target_type: "report",
                    p_target_id: report.id,
                    p_decision: value(data, "decision"),
                    p_reason: value(data, "reason"),
                  });
                  await cache.invalidateQueries({
                    queryKey: ["app_admin_reports"],
                  });
                }}
              >
                <Field label="Resultado">
                  <select name="decision">
                    <option value="resolved">Tratada</option>
                    <option value="dismissed">Improcedente</option>
                  </select>
                </Field>
                <Field label="Motivo">
                  <textarea name="reason" required minLength={5} />
                </Field>
              </Form>}
            </div>
          )}
        </AdminList>
      )}
      {tab === "espacos" && (
        <>
          <section className="settings-panel" aria-labelledby="community-spaces">
            <header className="settings-toolbar">
              <h2 id="community-spaces"><LayoutGrid size={20} aria-hidden="true" /> Espaços</h2>
              <button className="primary" onClick={() => setEditing(null)}>
                <Plus size={18} aria-hidden="true" /> Criar espaço
              </button>
            </header>
            <QueryState query={spaces}>
              {orderedSpaces.length ? orderedSpaces.map((space, index) => (
                <div className="resource-row" key={space.id}>
                  <div>
                    <h3>{text(space, "name")}</h3>
                    <p>{text(space, "description")}</p>
                  </div>
                  <div className="actions">
                    <MoveSetting collection="spaces" item={space} label={text(space, "name")} index={index} total={orderedSpaces.length} />
                    <button onClick={() => setEditing(space)}>Editar espaço</button>
                  </div>
                </div>
              )) : <Empty>Nenhum espaço cadastrado.</Empty>}
            </QueryState>
          </section>
          {editing !== undefined && (
            <section className="settings-panel">
              <div className="reading inline-editor" key={editing?.id ?? "new"} ref={focusEditor}>
                <h2>{editing ? "Editar espaço" : "Criar espaço"}</h2>
                <Form
                  draft={editing?.id}
                  label="Salvar espaço"
                  secondaryAction={<button type="button" onClick={() => setEditing(undefined)}>Fechar editor</button>}
                  onSave={async (data) => {
                    await save("spaces", editing?.id ?? null, {
                      name: value(data, "name"),
                      description: value(data, "description"),
                      status: value(data, "status"),
                      order_index: num(data, "order_index"),
                      ...accessData(data),
                    });
                    setEditing(undefined);
                  }}
                >
                  <Field label="Nome">
                    <input
                      name="name"
                      required
                      defaultValue={text(editing ?? undefined, "name")}
                    />
                  </Field>
                  <Field label="Descrição">
                    <textarea
                      name="description"
                      defaultValue={text(editing ?? undefined, "description")}
                    />
                  </Field>
                  <Field label="Ordem">
                    <input
                      name="order_index"
                      type="number"
                      defaultValue={Number(editing?.order_index ?? 0)}
                      min="0"
                    />
                  </Field>
                  <StatusField row={editing ?? undefined} />
                  <AccessFields row={editing ?? undefined} />
                </Form>
                {editing && <Archive entity="spaces" row={editing} />}
              </div>
            </section>
          )}
        </>
      )}
    </AdminSurface>
  );
}
const communityTabs = [
  ["moderacao", "Publicações"],
  ["respostas", "Respostas"],
  ["denuncias", "Denúncias"],
  ["espacos", "Espaços"],
] as const;
const settingsTabs = [
  ["onboarding", "Onboarding"],
  ["marca", "Plataforma e marca"],
  ["certificado", "Certificado"],
  ["modulos", "Módulos"],
  ["integracoes", "Integrações"],
  ["legal", "Documentos legais"],
  ["equipe", "Equipe"],
  ["auditoria", "Auditoria"],
  ["privacidade", "Privacidade"],
] as const;

function PlatformSettingsTabs({ tab }: { tab: string }) {
  return (
    <NavigationTabs
      label="Configurações da plataforma"
      selected={tab}
      items={settingsTabs.map(([id, label]) => ({ id, label, to: `?aba=${id}` }))}
    />
  );
}

/** Configurações usam a página padrão com as abas da plataforma. */
function SettingsSurface({ tab, sectionLabel, ...page }: {
  tab: (typeof settingsTabs)[number][0];
  sectionLabel?: string;
  title: string;
  description: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <AdminSurface section={tab} trail={["Administração", "Configurações", sectionLabel ?? settingsTabs.find(([id]) => id === tab)![1]]}
      tabs={<PlatformSettingsTabs tab={tab} />} {...page} />
  );
}

const staffScopes = [
  ["admin", "Configurações, equipe, auditoria e operação da plataforma"],
  ["instructor", "Cursos, aulas e materiais"],
  ["moderator", "Espaços, publicações, respostas e denúncias"],
  ["support", "Fila de suporte e atendimento por tickets"],
] as const;

function AdminTeam() {
  return (
    <SettingsSurface
      tab="equipe"
      title="Equipe e controle de acesso"
      description="Consulte os papéis da equipe e gerencie o acesso pela ficha de cada membro."
      action={
        <Link className="button primary" to="/admin/membros?papel=staff">
          <Users size={18} aria-hidden="true" /> Gerenciar membros e equipe
        </Link>
      }
    >
      <section className="settings-panel" data-tour="admin-settings-team" aria-labelledby="settings-roles">
        <header>
          <h2 id="settings-roles"><Shield size={20} aria-hidden="true" /> Papéis da equipe</h2>
          <p>O papel define responsabilidades administrativas. O acesso por assinatura segue as regras de cada conteúdo.</p>
        </header>
        <dl className="settings-roles">
          {staffScopes.map(([role, scope]) => (
            <div key={role}>
              <dt>{roleLabel(role)}</dt><dd>{scope}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section className="settings-panel settings-callout" aria-labelledby="settings-change">
        <div>
          <h2 id="settings-change"><History size={20} aria-hidden="true" /> Alterações de acesso</h2>
          <p>Para alterar um papel, abra a ficha do membro, informe o motivo e reautentique. A alteração fica registrada na trilha de auditoria.</p>
        </div>
        <Link className="button" to="?aba=auditoria">Consultar trilha de auditoria</Link>
      </section>
    </SettingsSurface>
  );
}

// Núcleo da plataforma: aparece na lista para ficar claro que não desliga.
const coreModules = [
  { label: "Cursos", Icon: BookOpen, description: "Catálogo, aulas, progresso e comentários de aula." },
  { label: "Certificados", Icon: Award, description: "Emissão, consulta e verificação pública dos certificados." },
];

function AdminModules() {
  const boot = useBootstrap();
  const state = readModules(boot.data?.settings?.modules);
  const toggle = useMutation({
    mutationFn: ({ key, enabled }: { key: ModuleKey; enabled: boolean }) =>
      rpc("app_admin_set_module", { p_key: key, p_enabled: enabled }),
    onSuccess: async () => {
      void cache.invalidateQueries({ queryKey: ["app_public_context"] });
      await boot.refetch();
    },
  });
  const saved = toggle.variables;
  return (
    <SettingsSurface
      tab="modulos"
      title="Módulos da plataforma"
      description="Escolha quais recursos os alunos veem. Desligar esconde e bloqueia, sem apagar dados."
    >
      <section className="settings-panel" data-tour="admin-settings-modules" aria-labelledby="settings-modules">
        <header>
          <h2 id="settings-modules"><ToggleRight size={20} aria-hidden="true" /> Recursos da área de membros</h2>
          <p>
            Um módulo desligado sai do menu, dos atalhos, do guia e das outras telas, e o servidor recusa o acesso dos alunos.
            Nada é apagado, e religar traz tudo de volta. A equipe continua usando o painel de cada recurso. Nenhuma exportação muda: a de dados do membro e as do painel seguem completas.
          </p>
        </header>
        <ul className="settings-modules">
          {coreModules.map(({ label, Icon, description }) => (
            <li key={label}>
              <Icon size={20} aria-hidden="true" />
              <div>
                <h3>{label}</h3>
                <p>{description}</p>
              </div>
              <span className="settings-module-state" data-on="true">Sempre ativo</span>
            </li>
          ))}
          {modules.map(({ key, label, Icon, description }) => (
            <li key={key}>
              <Icon size={20} aria-hidden="true" />
              <div>
                <h3 id={`module-${key}`}>{label}</h3>
                <p id={`module-${key}-description`}>{description}</p>
              </div>
              <span className="settings-module-state" data-on={state[key]}>{state[key] ? "Ativo" : "Desativado"}</span>
              <button type="button" className="notification-switch" role="switch" aria-checked={state[key]}
                aria-labelledby={`module-${key}`} aria-describedby={`module-${key}-description`}
                aria-disabled={toggle.isPending || boot.isFetching}
                onClick={() => {
                  if (!toggle.isPending && !boot.isFetching) toggle.mutate({ key, enabled: !state[key] });
                }}>
                <span aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
        {toggle.isError && saved && (
          <Notice error>Não foi possível {saved.enabled ? "ligar" : "desligar"} o módulo {moduleLabel(saved.key)}. {errorMessage(toggle.error)}</Notice>
        )}
        <p className="settings-module-status" role="status">
          {toggle.isPending || (toggle.isSuccess && boot.isFetching) ? "Salvando…"
            : toggle.isSuccess && saved ? `Módulo ${moduleLabel(saved.key)} ${saved.enabled ? "ligado" : "desligado"}.` : ""}
        </p>
      </section>
    </SettingsSurface>
  );
}

type AuditEvent = {
  id: string;
  action_label: string;
  actor_id: string | null;
  actor_name: string | null;
  target_label: string;
  target_name: string | null;
  target_path: string | null;
  target_id: string | null;
  reason: string | null;
  created_at: string;
};

function AdminAudit() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const requestedPage = Number(params.get("page") ?? 1);
  const page = Number.isInteger(requestedPage) && requestedPage >= 1 && requestedPage <= 100000 ? requestedPage : 1;
  function navigate(nextQuery: string, nextPage: number) {
    setParams({ aba: "auditoria", q: nextQuery, page: String(nextPage) });
  }
  const events = useRpc<Page<AuditEvent>>("app_admin_audit", {
    p_query: q,
    p_page: page,
  });

  return (
    <SettingsSurface
      tab="auditoria"
      title="Trilha de auditoria"
      description="Consulte ações administrativas, responsáveis, alvos e motivos registrados."
      action={<Link className="button" to="?aba=equipe">Voltar à equipe</Link>}
    >
      <section className="settings-panel" data-tour="admin-settings-audit" aria-labelledby="settings-events">
        <header className="settings-toolbar">
          <h2 id="settings-events"><History size={20} aria-hidden="true" /> Eventos registrados</h2>
          <Search variant="stitch" initial={q} label="Buscar eventos de auditoria"
            placeholder="Buscar por ação, ator ou alvo" onSearch={(query) => navigate(query, 1)} />
        </header>
        <QueryState query={events}>
          {events.data && (
            <>
              {events.data.items.length ? (
                <ul className="settings-events" aria-label="Resultados da auditoria">
                  {events.data.items.map((event) => (
                    <li key={event.id}>
                      <dl>
                        <div><dt>Data e hora</dt><dd><time dateTime={event.created_at}>{date(event.created_at)}</time></dd></div>
                        <div><dt>Ator</dt><dd>{event.actor_id ? <Link to={`/admin/membros/${event.actor_id}`}>{event.actor_name || "Membro sem nome"}</Link> : "Sistema"}</dd></div>
                        <div><dt>Ação</dt><dd><strong>{event.action_label}</strong></dd></div>
                        <div><dt>Alvo</dt><dd>{event.target_path ? <Link to={event.target_path}>{event.target_name ?? event.target_label}</Link> : event.target_name ?? event.target_label}
                          {event.target_name && <small>{event.target_label}</small>}
                          {event.target_id && <details><summary>Identificador</summary><code>{event.target_id}</code></details>}
                        </dd></div>
                        <div><dt>Motivo</dt><dd>{event.reason || "Sem motivo registrado"}</dd></div>
                      </dl>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty>{q ? "Nenhum evento encontrado para esta busca." : "Nenhum evento registrado."}</Empty>
              )}
              <Pager page={page} total={events.data.total} onChange={(nextPage) => navigate(q, nextPage)} />
            </>
          )}
        </QueryState>
      </section>
    </SettingsSurface>
  );
}

const integrationTabs = [
  { id: "asaas", label: "Gateway Asaas", to: "?aba=integracoes&provedor=asaas" },
  { id: "bunny", label: "Bunny Stream", to: "?aba=integracoes&provedor=bunny" },
];

function AdminIntegrations({ provider }: { provider: "asaas" | "bunny" }) {
  const settings = useQuery({ queryKey: integrationKey(provider), queryFn: async () => {
    const data = await edge<IntegrationStatus>("capabilities", { action: "integration-status", provider });
    if (!data?.fields) throw new Error("Não foi possível consultar a configuração.");
    return data;
  } });
  const test = useIntegrationTest(provider);
  const asaas = provider === "asaas";
  const configured = settings.data?.configured;
  const hasError = settings.isError || Boolean(settings.data?.error) || test.isError || test.data?.ok === false;
  const ProviderIcon = asaas ? CreditCard : Video;

  return (
    <SettingsSurface
      tab="integracoes"
      sectionLabel={asaas ? "Gateway Asaas" : "Bunny Stream"}
      title={asaas ? "Gateway de pagamento Asaas" : "Integração Bunny Stream"}
      description={asaas ? "Checkout hospedado para pagamentos por Pix e cartão." : "Reprodução de vídeos autorizada pelo servidor."}
      action={
        <button type="button" aria-controls="settings-provider-status" aria-disabled={settings.isFetching || test.isPending}
          onClick={() => {
            if (settings.isFetching || test.isPending) return;
            test.reset();
            void settings.refetch({ cancelRefetch: false });
          }}>
          <RefreshCw size={16} aria-hidden="true" /> Atualizar estado
        </button>
      }
    >
      <div className="settings-provider" data-tour="admin-settings-providers">
        <NavigationTabs label="Provedores" selected={provider} items={integrationTabs} />
        <section className="settings-panel settings-status" aria-labelledby="settings-provider-title">
          <ProviderIcon size={22} aria-hidden="true" />
          <div>
            <h2 id="settings-provider-title">Configuração do provedor</h2>
            <p id="settings-provider-status" role="status" data-configured={!hasError && configured}>
              {settings.isFetching ? "Consultando configuração…" :
                hasError ? "Com erro" : configured ? "Configurado" : "Não configurado"}
            </p>
            {settings.isError && <p role="alert">A consulta falhou. Use Atualizar estado para tentar novamente.</p>}
            {settings.data?.error && <p role="alert">{settings.data.error}</p>}
            {asaas && settings.data?.checkout_allowed === false && <p>Cobranças em Produção aguardam ativação.</p>}
            {settings.data && <button type="button" disabled={!settings.data.can_write || !settings.data.test_ready || settings.isFetching || test.isPending}
              onClick={() => test.mutate()}>
              {test.isPending ? "Testando conexão…" : "Testar conexão"}
            </button>}
            <IntegrationTestMessage test={test} />
          </div>
        </section>
      </div>
      {settings.data && <>
        <IntegrationCards provider={provider} settings={settings.data} onSave={test.reset} />
        <Link className="button settings-help" to={asaas ? "/admin/pedidos" : "/admin/cursos"}>
          {asaas ? "Consultar pedidos" : "Gerenciar aulas"}
        </Link>
      </>}
      {settings.data?.mode && (
        <details className="settings-panel settings-services">
          <summary>Outros serviços da plataforma</summary>
          <dl className="settings-roles">
            <div><dt>Aplicação</dt><dd>{settings.data.mode === "production" ? "Produção" : "Local"}</dd></div>
            <div><dt>Armazenamento</dt><dd>{settings.data.storage ? "Disponível na configuração" : "Indisponível"}</dd></div>
            <div><dt>E-mail</dt><dd>{settings.data.email === "configured" ? "Configuração detectada" : settings.data.email === "local" ? "Local" : "Indisponível"}</dd></div>
          </dl>
        </details>
      )}
    </SettingsSurface>
  );
}

export function AdminSettings() {
  const [params] = useSearchParams();
  const tab = params.get("aba") ?? "onboarding";
  if (tab === "marca") return (
    <SettingsSurface
      tab="marca"
      title="Plataforma, marca e white label"
      description="Gerencie o nome e a logo da plataforma e os documentos legais."
    >
      <AdminBrand />
    </SettingsSurface>
  );
  if (tab === "certificado") return (
    <SettingsSurface
      tab="certificado"
      title="Modelo de certificado"
      description="Defina o responsável e a assinatura que os cursos usam por padrão."
    >
      <CertificateDefaultsEditor />
    </SettingsSurface>
  );
  if (tab === "modulos") return <AdminModules />;
  if (tab === "equipe") return <AdminTeam />;
  if (tab === "auditoria") return <AdminAudit />;
  if (tab === "integracoes") {
    const provider = params.get("provedor") === "bunny" ? "bunny" : "asaas";
    return <AdminIntegrations key={provider} provider={provider} />;
  }
  if (tab === "legal") return <LegalSettings />;
  if (tab === "privacidade") return <PrivacySettings />;
  return <OnboardingAdmin />;
}
function LegalSettings() {
  const [legal, setLegal] = useState<Row | null | undefined>(undefined);
  return (
    <SettingsSurface
      tab="legal"
      title="Documentos legais"
      description="Publique as versões dos termos de uso e da política de privacidade."
      action={<button className="primary" onClick={() => setLegal(null)}><Plus size={18} aria-hidden="true" /> Nova versão</button>}
    >
      <AdminList entity="legal_versions" title="Documentos versionados" icon={<FileText size={20} aria-hidden="true" />}>
        {(doc) => (
          <>
            <div>
              <h3>
                {text(doc, "title")} · {text(doc, "version")}
              </h3>
              <p>
                {doc.published ? "Publicado" : "Não publicado"}
                {doc.demo ? " · Demonstração" : ""}
              </p>
            </div>
            <button onClick={() => setLegal(doc)}>Editar versão</button>
          </>
        )}
      </AdminList>
      {legal !== undefined && (
        <section className="settings-panel">
          <div className="reading inline-editor" key={legal?.id ?? "new"} ref={focusEditor}>
            <h2>{legal ? "Editar documento" : "Criar documento"}</h2>
            <Form
              draft={legal?.id}
              label="Salvar documento"
              secondaryAction={<button type="button" onClick={() => setLegal(undefined)}>Fechar editor</button>}
              onSave={async (data) => {
                await save("legal_versions", legal?.id ?? null, {
                  kind: value(data, "kind"),
                  version: value(data, "version"),
                  title: value(data, "title"),
                  body: value(data, "body"),
                  published: check(data, "published"),
                  demo: check(data, "demo"),
                });
                void cache.invalidateQueries({ queryKey: ["app_public_context"] });
                setLegal(undefined);
              }}
            >
              <Field label="Tipo">
                <select
                  name="kind"
                  defaultValue={text(legal ?? undefined, "kind", "terms")}
                >
                  <option value="terms">Termos de uso</option>
                  <option value="privacy">Privacidade</option>
                </select>
              </Field>
              <Field label="Versão">
                <input
                  name="version"
                  required
                  defaultValue={text(legal ?? undefined, "version")}
                />
              </Field>
              <Field label="Título">
                <input
                  name="title"
                  required
                  defaultValue={text(legal ?? undefined, "title")}
                />
              </Field>
              <Field label="Texto integral">
                <textarea
                  name="body"
                  rows={16}
                  required
                  defaultValue={text(legal ?? undefined, "body")}
                />
              </Field>
              <label className="check">
                <input
                  name="published"
                  type="checkbox"
                  defaultChecked={!!legal?.published}
                />
                Publicado
              </label>
              <label className="check">
                <input
                  name="demo"
                  type="checkbox"
                  defaultChecked={legal?.demo !== false}
                />
                Demonstração, sem validade jurídica
              </label>
              <Notice>
                Documentos de demonstração não liberam cadastro ou cobrança.
                Publique somente documentos aprovados para esta operação.
              </Notice>
            </Form>
          </div>
        </section>
      )}
    </SettingsSurface>
  );
}
const privacyKinds: Record<string, string> = { export: "Exportação de dados", deletion: "Exclusão de conta" };
const privacyStatus: Record<string, string> = { pending: "Recebido", processing: "Em análise", completed: "Concluído", rejected: "Recusado" };
const reportStatus: Record<string, string> = { pending: "Pendente", resolved: "Tratada", dismissed: "Improcedente" };
function PrivacySettings() {
  return (
    <SettingsSurface
      tab="privacidade"
      title="Solicitações de privacidade"
      description="Acompanhe os pedidos de exportação e exclusão de dados dos membros."
    >
      <AdminList entity="privacy_requests" rpc="app_admin_privacy_requests" title="Solicitações registradas" icon={<Shield size={20} aria-hidden="true" />}>
        {(request) => {
          const status = text(request, "status");
          return (
            <div>
              <h3>{privacyKinds[text(request, "kind")] ?? text(request, "kind")}</h3>
              <p>
                Titular{" "}
                <Link to={`/admin/membros/${text(request, "user_id")}`}>
                  {text(request, "full_name").trim() || "Membro sem nome"}
                </Link>{" "}
                · {privacyStatus[status] ?? status} · {date(text(request, "created_at"))}
              </p>
              {(status === "pending" || status === "processing") && (
                <Form
                  draft={false}
                  label="Registrar atendimento"
                  successMessage="Atendimento registrado."
                  onSave={async (data) => {
                    await rpc("app_admin_set_privacy_request", {
                      p_id: request.id,
                      p_status: value(data, "status"),
                      p_reason: value(data, "reason"),
                    });
                    await cache.invalidateQueries({ queryKey: ["app_admin_privacy_requests"] });
                  }}
                >
                  <Field label="Nova situação">
                    <select name="status">
                      {(["processing", "completed", "rejected"] as const)
                        .filter((option) => option !== status)
                        .map((option) => <option key={option} value={option}>{privacyStatus[option]}</option>)}
                    </select>
                  </Field>
                  <Field label="Motivo do registro">
                    <textarea name="reason" required minLength={3} maxLength={2000} />
                  </Field>
                </Form>
              )}
              <p>
                Registrar o atendimento não exporta nem exclui dados. Conclua o
                processo com a retenção legal e registre aqui; cada decisão fica
                na auditoria.
              </p>
            </div>
          );
        }}
      </AdminList>
    </SettingsSurface>
  );
}
function OnboardingAdmin() {
  const questions = useAll("onboarding_questions"),
    [selected, setSelected] = useState<Row | null | undefined>(undefined);
  const orderedQuestions = orderedSettings(questions.data);
  return (
    <SettingsSurface
      tab="onboarding"
      title="Onboarding dos membros"
      description="Configure as perguntas do perfil feitas no primeiro acesso."
      action={<button className="primary" onClick={() => setSelected(null)}><Plus size={18} aria-hidden="true" /> Adicionar pergunta</button>}
    >
      <section className="settings-panel" aria-labelledby="settings-onboarding">
        <header>
          <h2 id="settings-onboarding"><ListChecks size={20} aria-hidden="true" /> Perguntas do onboarding</h2>
          <p>A ordem e a obrigatoriedade valem no cadastro de perfil.</p>
        </header>
        <QueryState query={questions}>
          {orderedQuestions.length ? orderedQuestions.map((question, index) => (
            <div className="resource-row" key={question.id}>
              <div>
                <h3>{text(question, "label")}</h3>
                <p>
                  {question.active ? "Ativa" : "Inativa"} ·{" "}
                  {question.required ? "Obrigatória" : "Opcional"}
                </p>
              </div>
              <div className="actions">
                <MoveSetting collection="onboarding_questions" item={question} label={text(question, "label")} index={index} total={orderedQuestions.length} />
                <button onClick={() => setSelected(question)}>Editar pergunta</button>
              </div>
            </div>
          )) : <Empty>Nenhuma pergunta cadastrada.</Empty>}
        </QueryState>
      </section>
      {selected !== undefined && (
        <section className="settings-panel">
          <div className="reading inline-editor" key={selected?.id ?? "new"} ref={focusEditor}>
            <h2>{selected ? "Editar pergunta" : "Criar pergunta"}</h2>
            <Form
              draft={selected?.id}
              label="Salvar pergunta"
              secondaryAction={<button type="button" onClick={() => setSelected(undefined)}>Fechar editor</button>}
              onSave={async (data) => {
                await save("onboarding_questions", selected?.id ?? null, {
                  key: value(data, "key"),
                  label: value(data, "label"),
                  type: value(data, "type"),
                  options: value(data, "options").split("\n").filter(Boolean),
                  required: check(data, "required"),
                  active: check(data, "active"),
                  order_index: num(data, "order_index"),
                });
                setSelected(undefined);
              }}
            >
              <Field label="Campo do perfil">
                <select
                  name="key"
                  defaultValue={text(selected ?? undefined, "key", "name")}
                >
                  {Object.entries({
                    name: "Nome da empresa", segment: "Segmento", role: "Cargo",
                    size: "Tamanho da equipe", stage: "Estágio do produto", revenue_range: "Faturamento mensal",
                    acquisition: "Aquisição de clientes", product_description: "Descrição do produto",
                  }).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Pergunta">
                <input
                  name="label"
                  required
                  defaultValue={text(selected ?? undefined, "label")}
                />
              </Field>
              <Field label="Tipo de resposta">
                <select
                  name="type"
                  defaultValue={text(selected ?? undefined, "type", "text")}
                >
                  <option value="text">Texto curto</option>
                  <option value="textarea">Texto longo</option>
                  <option value="select">Lista de opções</option>
                </select>
              </Field>
              <Field label="Opções, uma por linha">
                <textarea
                  name="options"
                  defaultValue={((selected?.options as string[]) ?? []).join(
                    "\n",
                  )}
                />
              </Field>
              <Field label="Ordem">
                <input
                  name="order_index"
                  type="number"
                  min="0"
                  defaultValue={Number(selected?.order_index ?? 0)}
                />
              </Field>
              <label className="check">
                <input
                  name="required"
                  type="checkbox"
                  defaultChecked={!!selected?.required}
                />
                Obrigatória
              </label>
              <label className="check">
                <input
                  name="active"
                  type="checkbox"
                  defaultChecked={selected?.active !== false}
                />
                Ativa
              </label>
            </Form>
          </div>
        </section>
      )}
    </SettingsSurface>
  );
}
