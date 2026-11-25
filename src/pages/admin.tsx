import { Fragment, useCallback, useEffect, useRef, useState } from "react";
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
  ChevronRight,
  CreditCard,
  Download,
  FileText,
  Flag,
  FolderOpen,
  LayoutGrid,
  MessageSquare,
  Reply,
  History,
  KeyRound,
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
  money,
  roleLabel,
  roleLabels,
  rpc,
  safeUrl,
  useRpc,
} from "../api";
import { buildAdminCsv, exportLimit } from "../admin-export";
import { courseLessonPath } from "../course-paths";
import type { Page, Plan, Course } from "../api";
import {
  Action,
  Back,
  Empty,
  Field,
  Form,
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
import { AdminBrand, AssetCard } from "./admin-brand";
import { brandAssetUrl } from "../brand";
import { AdminCatalogLaunch } from "./admin-catalog-launch";
import { Reauth } from "./settings";
import { Moderate, statusName } from "./community";
import { useBootstrap } from "../auth";
import { moduleLabel, modules, readModules, type ModuleKey } from "../modules";
import { Upload } from "../upload";
import "./admin-commercial.css";
import "./admin-settings.css";
import "../admin-content.css";

type Row = { id: string; [key: string]: unknown };
type MemberDetail = {
  profile: Row;
  subscriptions: Page<Row>;
  courses: Page<Course>;
  orders: Page<Row>;
  tickets: Page<Row>;
};
const text = (row: Row | undefined, key: string, fallback = "") =>
  String(row?.[key] ?? fallback);
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
async function save(
  entity: string,
  id: string | null,
  data: Record<string, unknown>,
) {
  const result = await rpc<{ id: string }>("app_admin_save", {
    p_entity: entity,
    p_id: id,
    p_data: data,
  });
  await cache.invalidateQueries({ queryKey: ["app_admin_list"] });
  return result;
}
function useAll(entity: string) {
  return useQuery({
    queryKey: ["app_admin_list", entity, "all"],
    queryFn: async () => {
      const first = await rpc<Page<Row>>("app_admin_list", {
        p_entity: entity,
        p_page: 1,
        p_query: "",
      });
      const items = [...first.items];
      for (let page = 2; items.length < first.total; page++) {
        const next = await rpc<Page<Row>>("app_admin_list", {
          p_entity: entity,
          p_page: page,
          p_query: "",
        });
        if (!next.items.length) break;
        items.push(...next.items);
      }
      return items;
    },
  });
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
}: {
  entity: string;
  /** RPC própria da lista, no mesmo formato paginado da app_admin_list. */
  rpc?: "app_admin_reports" | "app_admin_privacy_requests";
  title: string;
  action?: ReactNode;
  children: (item: Row) => ReactNode;
  section?: boolean;
  icon?: ReactNode;
}) {
  const [params, setParams] = useSearchParams(),
    q = params.get("q") ?? "",
    page = Number(params.get("page") || 1),
    query = useRpc<Page<Row>>(listRpc ?? "app_admin_list", listRpc
      ? { p_query: q, p_page: page }
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
function IdentityFields({ row }: { row?: Row }) {
  return (
    <>
      <Field label="Título">
        <input
          name="title"
          required
          defaultValue={text(row, "title")}
          maxLength={200}
        />
      </Field>
      <Field
        label="Endereço (slug)"
        hint="Use letras minúsculas, números e hífens. O endereço compõe o link do conteúdo."
      >
        <input
          name="slug"
          required
          pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
          defaultValue={text(row, "slug")}
          maxLength={120}
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
          <option value="members">Todos os membros</option>
          <option value="plans">Planos selecionados</option>
          <option value="subscribers">Assinatura ativa</option>
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
function Archive({ entity, row }: { entity: string; row: Row }) {
  const archived = row.status === "archived";
  return (
    <details className="archive">
      <summary>{archived ? "Restaurar registro" : "Arquivar registro"}</summary>
      <p>
        {archived
          ? "O estado anterior será restaurado."
          : "O conteúdo deixa de ser publicado; histórico, progresso e certificados são preservados."}
      </p>
      <Reauth>
        {async (token) => {
          if (
            !window.confirm(
              archived ? "Restaurar este registro?" : "Arquivar este registro?",
            )
          )
            throw new Error("Operação cancelada.");
          await rpc("app_admin_archive", {
            p_entity: entity,
            p_id: row.id,
            p_archived: !archived,
            p_reauth_token: token,
          });
          await cache.invalidateQueries({ queryKey: ["app_admin_list"] });
        }}
      </Reauth>
    </details>
  );
}
function OrderControl({
  entity,
  row,
  siblings,
}: {
  entity: string;
  row: Row;
  siblings: Row[];
}) {
  const index = siblings.findIndex((item) => item.id === row.id);
  async function move(direction: number) {
    const target = index + direction;
    if (target < 0 || target >= siblings.length) return;
    const ordered = [...siblings];
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    for (const [position, item] of ordered.entries())
      if (Number(item.order_index) !== position)
        await save(entity, item.id, { order_index: position });
  }
  return (
    <div className="order-controls">
      <Action disabled={index <= 0} run={() => move(-1)}>
        <ArrowUp size={18} aria-hidden="true" />
        <span className="sr-only">Subir {text(row, "title")}</span>
      </Action>
      <Action disabled={index >= siblings.length - 1} run={() => move(1)}>
        <ArrowDown size={18} aria-hidden="true" />
        <span className="sr-only">Descer {text(row, "title")}</span>
      </Action>
    </div>
  );
}
export function AdminCourses() {
  return (
    <AdminSurface
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
                <p>
                  {statusName(text(course, "status"))} · /
                  {text(course, "slug")}
                </p>
              </div>
              <div className="actions">
                <Link className="button" to={editor}>
                  Editar curso
                </Link>
                <Link className="button" to={`${editor}?aba=estrutura`}>
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
    <div className="admin-content">
      <Back to="/admin/cursos" label="Cursos e aulas" />
      <Heading
        title={
          isNew
            ? "Criar curso"
            : course
              ? text(course, "title")
              : "Editar curso"
        }
      >
        Organize o currículo, configure o acesso e revise o conteúdo publicado.
      </Heading>
      <QueryState query={courses}>
        {(isNew || course) && (
          <>
            <div className="content-context" data-tour="course-editor">
              {course && (
                <div className="content-summary">
                  <span className="content-icon">
                    <BookOpen size={20} aria-hidden="true" />
                  </span>
                  <div>
                    <strong>{statusName(text(course, "status"))}</strong>
                    <p>/{text(course, "slug")}</p>
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
              <div className="reading content-panel">
                <Form
                  key={id}
                  label={isNew ? "Criar curso" : "Salvar curso"}
                  onSave={async (data) => {
                    const saved = await save("courses", isNew ? null : id!, {
                      title: value(data, "title"),
                      slug: value(data, "slug"),
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
                {course && (
                  <>
                    {course.status === "draft" && (
                      <AdminCatalogLaunch entity="courses" id={course.id} />
                    )}
                    <SectionHeading title="Capa do curso" />
                    <Upload
                      kind="course-cover"
                      resourceId={course.id}
                      onUploaded={() => void courses.refetch()}
                    />
                    <Archive entity="courses" row={course} />
                  </>
                )}
              </div>
            )}
            {tab === "structure" && course && <Structure course={course} />}
            {tab === "certificate" && course && (
              <div className="reading content-panel">
                <Form
                  label="Salvar configuração do certificado"
                  onSave={(data) =>
                    save("courses", course.id, {
                      certificate_enabled: check(data, "certificate_enabled"),
                      signer_name: value(data, "signer_name"),
                      signer_title: value(data, "signer_title"),
                    })
                  }
                >
                  <label className="check">
                    <input
                      type="checkbox"
                      name="certificate_enabled"
                      defaultChecked={!!course.certificate_enabled}
                    />
                    Emitir certificado após as aulas obrigatórias
                  </label>
                  <Field label="Nome do responsável">
                    <input
                      name="signer_name"
                      defaultValue={text(course, "signer_name")}
                      maxLength={160}
                    />
                  </Field>
                  <Field label="Cargo do responsável">
                    <input
                      name="signer_title"
                      defaultValue={text(course, "signer_title")}
                      maxLength={160}
                    />
                  </Field>
                  <Notice>
                    O certificado usa o nome do aluno, o curso e a carga horária
                    do currículo obrigatório. Alterações não reescrevem
                    documentos já emitidos. Cadastre dados reais ou identifique
                    expressamente uma demonstração.
                  </Notice>
                </Form>
                {admin ? (
                  <AssetCard key={course.id} variant="signature" courseId={course.id}
                    saved={brandAssetUrl(course.signature_path) ?? safeUrl(course.signature_url) ?? null}
                    onChanged={() => courses.refetch()} />
                ) : (
                  <Notice>A assinatura do certificado é enviada por um administrador.</Notice>
                )}
              </div>
            )}
          </>
        )}
        {!isNew && courses.data && !course && (
          <Notice error>Curso não encontrado.</Notice>
        )}
      </QueryState>
    </div>
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
};

function StructureActions({
  entity,
  row,
  siblings,
  onEdit,
  current,
}: {
  entity: StructureSelection["entity"];
  row: Row;
  siblings?: Row[];
  onEdit: (event: MouseEvent<HTMLButtonElement>) => void;
  current?: boolean;
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
      {siblings && <OrderControl entity={entity} row={row} siblings={siblings} />}
    </div>
  );
}
function Structure({ course }: { course: Row }) {
  const modules = useAll("modules"),
    sections = useAll("sections"),
    lessons = useAll("lessons"),
    [reordering, setReordering] = useState(false),
    [selected, setSelected] = useState<StructureSelection | null>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const focusPanel = useCallback((node: HTMLElement | null) => {
    focusEditor(node);
  }, []);
  useEffect(() => {
    if (!selected) opener.current?.focus();
  }, [selected]);
  function openEditor(target: StructureSelection) {
    return (event: MouseEvent<HTMLButtonElement>) => {
      opener.current = event.currentTarget;
      setSelected(target);
    };
  }
  const ownModules = (modules.data ?? [])
    .filter((module) => module.course_id === course.id)
    .sort((a, b) => Number(a.order_index) - Number(b.order_index));
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
          {reordering && "Use Subir e Descer para mudar a ordem dos itens. "}
          <Link className="text-action" to="/ajuda/administracao">
            Ajuda sobre conteúdo
          </Link>
        </p>
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
              <div className="editor-outline">
                {ownModules.map((module) => {
                  const ownSections = courseSections
                    .filter((section) => section.module_id === module.id)
                    .sort(
                      (a, b) => Number(a.order_index) - Number(b.order_index),
                    );
                  return (
                    <section
                      className="content-panel content-module"
                      key={module.id}
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
                            onEdit={openEditor({
                              entity: "modules",
                              row: module,
                              parent: course.id,
                            })}
                          />
                        }
                      />
                      {ownSections.map((section) => {
                        const ownLessons = courseLessons
                          .filter((lesson) => lesson.section_id === section.id)
                          .sort(
                            (a, b) =>
                              Number(a.order_index) - Number(b.order_index),
                          );
                        return (
                          <div className="section-block" key={section.id}>
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
                                  siblings={reordering ? ownSections : undefined}
                                  current={selected?.row?.id === section.id}
                                  onEdit={openEditor({
                                    entity: "sections",
                                    row: section,
                                    parent: module.id,
                                  })}
                                />
                              }
                            />
                            {ownLessons.map((lesson) => {
                              const editing =
                                selected?.entity === "lessons" &&
                                selected.row?.id === lesson.id;
                              return (
                                <article
                                  className="lesson-editor-row"
                                  data-selected={editing || undefined}
                                  key={lesson.id}
                                >
                                  <div className="lesson-editor-title">
                                    <span className="content-icon">
                                      {lesson.type === "video" ? (
                                        <Video size={16} aria-hidden="true" />
                                      ) : (
                                        <FileText
                                          size={16}
                                          aria-hidden="true"
                                        />
                                      )}
                                    </span>
                                    <div>
                                      <strong>{text(lesson, "title")}</strong>{" "}
                                      {lesson.is_preview ? (
                                        <span className="badge">Prévia</span>
                                      ) : null}{" "}
                                      {editing && (
                                        <span className="badge content-editing">
                                          Editando
                                        </span>
                                      )}
                                      <p>
                                        {statusName(text(lesson, "status"))} ·{" "}
                                        {lesson.type === "video"
                                          ? "Vídeo"
                                          : "Texto"}{" "}
                                        ·{" "}
                                        {Math.ceil(
                                          Number(lesson.duration_seconds ?? 0) /
                                            60,
                                        )}{" "}
                                        min
                                        {lesson.is_required
                                          ? " · Obrigatória"
                                          : ""}
                                      </p>
                                    </div>
                                  </div>
                                  <StructureActions
                                    entity="lessons"
                                    row={lesson}
                                    siblings={reordering ? ownLessons : undefined}
                                    current={editing}
                                    onEdit={openEditor({
                                      entity: "lessons",
                                      row: lesson,
                                      parent: section.id,
                                    })}
                                  />
                                </article>
                              );
                            })}
                            <button
                              className="content-append"
                              type="button"
                              onClick={openEditor({
                                entity: "lessons",
                                parent: section.id,
                              })}
                            >
                              <Plus size={18} aria-hidden="true" />
                              Adicionar aula
                            </button>
                          </div>
                        );
                      })}
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
              <button
                className="content-icon-action"
                type="button"
                title="Fechar editor"
                aria-label="Fechar editor"
                onClick={() => setSelected(null)}
              >
                <X size={18} aria-hidden="true" />
              </button>
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
          <StructureForm
            entity={selected.entity}
            row={currentRow}
            parent={selected.parent}
            after={async () => {
              await Promise.all([
                modules.refetch(),
                sections.refetch(),
                lessons.refetch(),
              ]);
              setSelected((current) => (current === selected ? null : current));
            }}
          />
        </section>
      )}
    </div>
  );
}
function StructureForm({
  entity,
  row,
  parent,
  after,
}: {
  entity: "modules" | "sections" | "lessons";
  row?: Row;
  parent: string;
  after: () => Promise<void>;
}) {
  const [uploading, setUploading] = useState(false);
  return (
    <>
      <Form
        label="Salvar conteúdo"
        submitDisabled={uploading}
        onSave={async (data) => {
          let fields: Record<string, unknown> = {
            title: value(data, "title"),
            status: value(data, "status"),
            order_index: num(data, "order_index"),
          };
          if (entity === "modules")
            fields = {
              ...fields,
              slug: value(data, "slug"),
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
              slug: value(data, "slug"),
              body: value(data, "body"),
              type: value(data, "type"),
              duration_seconds: num(data, "duration_seconds"),
              video_id: nullable(data, "video_id"),
              is_preview: check(data, "is_preview"),
              is_required: check(data, "is_required"),
              ...(!row ? { section_id: parent } : {}),
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
                label="Identificador do vídeo no Bunny"
                hint="Use o ID cadastrado na biblioteca do Bunny Stream."
              >
                <input
                  name="video_id"
                  defaultValue={text(row, "video_id")}
                  maxLength={100}
                />
              </Field>
              {row ? (
                <div onInput={(event) => event.stopPropagation()}>
                  <Upload kind="lesson" resourceId={row.id} onBusyChange={setUploading} />
                </div>
              ) : <p>Salve a aula para enviar um arquivo de vídeo.</p>}
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
            <input
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
      {row && (
        <>
          {entity === "modules" && row.status === "draft" && (
            <AdminCatalogLaunch entity="modules" id={row.id} />
          )}
          <Archive entity={entity} row={row} />
        </>
      )}
    </>
  );
}
export function AdminMaterials() {
  const folders = useAll("material_folders"),
    lessons = useAll("lessons"),
    [editing, setEditing] = useState<Row | null | undefined>(undefined),
    [folder, setFolder] = useState<Row | null | undefined>(undefined);
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
      <AdminList entity="materials" title="Arquivos" icon={<FileText size={20} aria-hidden="true" />}>
        {(item) => (
          <>
            <div>
              <h3>{text(item, "name")}</h3>
              <p>
                {statusName(text(item, "status"))} · {text(item, "file_type")} ·{" "}
                {text(item, "size_bytes")} bytes
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
            <h2>{folder ? "Editar pasta" : "Criar pasta"}</h2>
            <Form
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
            {folder && <Archive entity="material_folders" row={folder} />}
          </div>
        </section>
      )}
      {editing !== undefined && (
        <section className="settings-panel">
          <div className="reading inline-editor" ref={focusEditor} key={editing?.id ?? "new-material"}>
            <h2>{editing ? "Editar material" : "Criar material"}</h2>
            <Form
              label="Salvar material"
              secondaryAction={<button type="button" onClick={() => setEditing(undefined)}>Fechar editor</button>}
              onSave={async (data) => {
                const result = await save("materials", editing?.id ?? null, {
                  name: value(data, "name"),
                  description: value(data, "description"),
                  folder_id: nullable(data, "folder_id"),
                  lesson_id: nullable(data, "lesson_id"),
                  file_type: value(data, "file_type"),
                  status: value(data, "status"),
                  ...accessData(data),
                });
                setEditing({
                  ...editing,
                  id: result.id,
                  name: value(data, "name"),
                  description: value(data, "description"),
                  status: value(data, "status"),
                });
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
              <Field label="Aula vinculada">
                <select
                  name="lesson_id"
                  defaultValue={text(editing ?? undefined, "lesson_id")}
                >
                  <option value="">Sem vínculo</option>
                  {lessons.data?.map((l) => (
                    <option key={l.id} value={l.id}>
                      {text(l, "title")}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Tipo">
                <select
                  name="file_type"
                  defaultValue={text(
                    editing ?? undefined,
                    "file_type",
                    "application/pdf",
                  )}
                >
                  {[
                    "application/pdf",
                    "application/zip",
                    "video/mp4",
                    "image/png",
                    "image/jpeg",
                    "text/plain",
                    "audio/mpeg",
                  ].map((type) => (
                    <option key={type}>{type}</option>
                  ))}
                </select>
              </Field>
              <StatusField row={editing ?? undefined} />
              <AccessFields row={editing ?? undefined} />
            </Form>
            {editing && (
              <>
                <Upload kind="material" resourceId={editing.id} />
                <Archive entity="materials" row={editing} />
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
  summarize,
  action,
  children,
}: {
  entity: "profiles" | "plans" | "orders";
  title: string;
  description: string;
  section: string;
  searchHint: string;
  summarize: (items: Row[]) => [label: string, value: number | string][];
  action?: ReactNode;
  children: (items: Row[]) => ReactNode;
}) {
  const [params, setParams] = useSearchParams();
  const situation = entity === "orders"
    ? orderStatuses.find((status) => status === params.get("situacao"))
    : undefined;
  const q = situation ? "" : params.get("q") ?? "";
  // The orders RPC searches "uuid status amount_cents"; spaces match the full status.
  const queryTerm = situation ? ` ${situation} ` : q;
  const page = Number(params.get("page") || 1);
  const query = useRpc<Page<Row>>("app_admin_list", {
    p_entity: entity,
    p_query: queryTerm,
    p_page: page,
  });
  const total = query.data?.total ?? 0;
  const search = (
    <Search
      variant="stitch"
      placeholder={searchHint}
      label={entity === "orders" ? "Buscar pedidos" : undefined}
      initial={q}
      onSearch={(q) => setParams({ q, page: "1" })}
    />
  );

  return (
    <>
      <Heading
        title={title}
        action={
          <div className="commercial-heading-actions">
            {action}
            {entity !== "plans" && (
              <div className="commercial-export" data-tour="admin-export">
                <Action
                  disabled={!query.isSuccess || !total || total > exportLimit}
                  run={async () => {
                    const csv = await buildAdminCsv(entity, queryTerm);
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
        {description}
      </Heading>
      {query.isSuccess && (
        <dl className="commercial-metrics" aria-label="Resumo dos resultados">
          <div>
            <dt>Total encontrado</dt>
            <dd>
              <strong>{total.toLocaleString("pt-BR")}</strong>
              <small>{situation ? "Na situação selecionada" : q ? "Na busca atual" : "Em todo o cadastro"}</small>
            </dd>
          </div>
          {summarize(query.data.items).map(([label, metric]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>
                <strong>{metric.toLocaleString("pt-BR")}</strong>
                <small>Nesta página</small>
              </dd>
            </div>
          ))}
        </dl>
      )}
      {entity !== "plans" && (
        <div className="commercial-toolbar">
          {search}
          {entity === "orders" && (
            <div className="commercial-order-filters" data-tour="order-filters">
              <div className="commercial-statuses" role="group" aria-label="Situação dos pedidos">
                <button type="button" aria-pressed={!queryTerm} onClick={() => setParams({})}>
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
                onChange={(page) => setParams({
                  ...(situation ? { situacao: situation } : { q }),
                  page: String(page),
                })}
              />
            </>
          )}
        </QueryState>
      </section>
    </>
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
    <div className="admin-commercial">
      <CommercialList
        entity="profiles"
        title="Gestão de membros e CRM"
        description="Consulte cadastros, planos e vigências. A ficha reúne o progresso e o histórico de cada membro."
        section="Diretório de membros"
        searchHint="Buscar por nome ou empresa"
        summarize={(members) => [
          [
            "Sem suspensão",
            members.filter((member) => !member.suspended).length,
          ],
          ["Suspensos", members.filter((member) => member.suspended).length],
          [
            "Com plano vigente",
            members.filter((member) => member.plan_name).length,
          ],
        ]}
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
    </div>
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
    <div className="admin-commercial">
      <Back to="/admin/membros" />
      <Heading title={member ? memberName(member) : "Ficha do membro"} />
      <QueryState query={members}>
        {member ? (
          <div className="commercial-detail">
            <section className="commercial-panel">
              <h2>Perfil e acesso</h2>
              <dl>
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
    </div>
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
        <h2>Aprendizado ({detail.courses.total} cursos)</h2>
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
        <h2>Tickets ({detail.tickets.total})</h2>
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
  return (
    <div className="admin-commercial admin-commercial-plans">
      <CommercialList
        entity="plans"
        title="Planos e ofertas"
        description="Gerencie os preços, a duração de acesso e os benefícios de cada plano."
        section="Planos cadastrados"
        searchHint="Buscar plano"
        summarize={(plans) => [
          ["Ativos", plans.filter((plan) => plan.active).length],
          ["Inativos", plans.filter((plan) => !plan.active).length],
        ]}
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
        {(plans) => (
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
        )}
      </CommercialList>
      {saved && <Notice>Plano salvo com sucesso.</Notice>}
      {editing !== undefined && (
        <section
          className="commercial-panel commercial-plan-editor"
          key={editing?.id ?? "new"}
          ref={focusEditor}
        >
          <h2>{editing ? "Editar plano" : "Criar plano"}</h2>
          <Form
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
                slug: value(data, "slug"),
                price_cents: num(data, "price_cents"),
                access_months: num(data, "access_months"),
                benefits: value(data, "benefits")
                  .split("\n")
                  .map((v) => v.trim())
                  .filter(Boolean),
                active: check(data, "active"),
              });
            }}
          >
            <Field label="Nome">
              <input
                name="name"
                required
                defaultValue={text(editing ?? undefined, "name")}
              />
            </Field>
            <Field label="Endereço (slug)">
              <input
                name="slug"
                required
                defaultValue={text(editing ?? undefined, "slug")}
                pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              />
            </Field>
            <Field
              label="Preço em centavos"
              hint="Exemplo: 10000 representa R$ 100,00."
            >
              <input
                name="price_cents"
                type="number"
                required
                min="0"
                step="1"
                defaultValue={Number(editing?.price_cents ?? 0)}
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
          </Form>
        </section>
      )}
      <section className="commercial-panel commercial-campaigns">
        <h2>Cupons e campanhas</h2>
        <p>
          Cupons, links UTM e textos de upgrade ainda não estão disponíveis.
        </p>
      </section>
    </div>
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
    <div className="admin-commercial">
      <Back to="/admin/pedidos" />
      <Heading title="Detalhes do pedido" />
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
    </div>
  );
}

export function AdminOrders() {
  const { id } = useParams();
  if (id) return <OrderDetail id={id} />;

  return (
    <div className="admin-commercial">
      <CommercialList
        entity="orders"
        title="Pedidos e faturamento"
        description="Consulte transações, valores dos pedidos e os estados confirmados pelo servidor."
        section="Livro de vendas"
        searchHint="ID ou valor em centavos"
        summarize={(orders) => {
          const paid = orders.filter((order) => order.status === "paid");
          return [
            ["Pedidos pagos", paid.length],
            [
              "Pedidos pendentes",
              orders.filter((order) => order.status === "pending").length,
            ],
            [
              "Valor dos pedidos pagos",
              money(
                paid.reduce(
                  (total, order) => total + Number(order.amount_cents),
                  0,
                ),
              ),
            ],
          ];
        }}
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
    </div>
  );
}
export function AdminCommunity() {
  const [params] = useSearchParams(),
    tab = params.get("aba") ?? "moderacao",
    [editing, setEditing] = useState<Row | null | undefined>(undefined),
    spaces = useAll("spaces");
  const current = communityTabs.find(([id]) => id === tab) ?? communityTabs[0];
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
        <AdminList entity="posts" title="Fila de publicações" icon={<MessageSquare size={20} aria-hidden="true" />}>
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
        <AdminList entity="replies" title="Fila de respostas" icon={<Reply size={20} aria-hidden="true" />}>
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
              {text(report, "status") === "pending" && <Form
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
              {spaces.data?.length ? spaces.data.map((space) => (
                <div className="resource-row" key={space.id}>
                  <div>
                    <h3>{text(space, "name")}</h3>
                    <p>{text(space, "description")}</p>
                  </div>
                  <button onClick={() => setEditing(space)}>Editar espaço</button>
                </div>
              )) : <Empty>Nenhum espaço cadastrado.</Empty>}
            </QueryState>
          </section>
          {editing !== undefined && (
            <section className="settings-panel">
              <div className="reading inline-editor" key={editing?.id ?? "new"} ref={focusEditor}>
                <h2>{editing ? "Editar espaço" : "Criar espaço"}</h2>
                <Form
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

/** Página padrão do painel (classe admin-settings): trilha, título, descrição, ação à direita, abas e cartões. */
function AdminSurface({ section, trail, title, description, action, tabs, children }: {
  section: string;
  trail: string[];
  title: string;
  description: string;
  action?: ReactNode;
  tabs?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="admin-settings" data-section={section}>
      <p className="settings-breadcrumb">
        {trail.map((item, index) => (
          <Fragment key={item}>
            {index > 0 && <ChevronRight size={14} aria-hidden="true" />}
            <span>{item}</span>
          </Fragment>
        ))}
      </p>
      <Heading title={title} action={action}>{description}</Heading>
      {tabs}
      {children}
      <Link className="button settings-help" to="/ajuda/administracao">Ajuda da administração</Link>
    </div>
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
        <Link className="button primary" to="/admin/membros">
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
  action: string;
  actor_id: string | null;
  target_type: string;
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
  const events = useRpc<Page<AuditEvent>>("app_admin_list", {
    p_entity: "audit_events",
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
                        <div><dt>Ator</dt><dd>{event.actor_id ?? "Sem ator identificado"}</dd></div>
                        <div><dt>Ação</dt><dd><strong>{event.action}</strong></dd></div>
                        <div><dt>Alvo</dt><dd>{event.target_type}{event.target_id && <small>{event.target_id}</small>}</dd></div>
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

async function getAdminCapabilities() {
  const data = await edge<Record<string, unknown> | null>("capabilities");
  return {
    asaas: typeof data?.asaas === "boolean" ? data.asaas : undefined,
    bunny: typeof data?.bunny === "boolean" ? data.bunny : undefined,
    mode: data?.mode === "production" || data?.mode === "local" ? data.mode : undefined,
    storage: data?.storage === true,
    email: data?.email === "configured" || data?.email === "local" ? data.email : undefined,
  };
}

function AdminIntegrations({ provider }: { provider: "asaas" | "bunny" }) {
  const capabilities = useQuery({ queryKey: ["admin-capabilities"], queryFn: getAdminCapabilities });
  const asaas = provider === "asaas";
  const configured = capabilities.data?.[provider];
  const ProviderIcon = asaas ? CreditCard : Video;

  return (
    <SettingsSurface
      tab="integracoes"
      sectionLabel={asaas ? "Gateway Asaas" : "Bunny Stream"}
      title={asaas ? "Gateway de pagamento Asaas" : "Integração Bunny Stream"}
      description={asaas ? "Checkout hospedado para pagamentos por Pix e cartão." : "Reprodução de vídeos autorizada pelo servidor."}
      action={
        <button type="button" aria-controls="settings-provider-status" aria-disabled={capabilities.isFetching}
          onClick={() => {
            if (!capabilities.isFetching) void capabilities.refetch({ cancelRefetch: false });
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
            <p id="settings-provider-status" role="status" data-configured={capabilities.isSuccess && configured === true}>
              {capabilities.isFetching ? "Consultando configuração…" :
                capabilities.isError || configured === undefined ? "Estado indisponível" :
                configured ? "Configuração detectada" : "Não configurado"}
            </p>
            {capabilities.isError && <p role="alert">A consulta falhou. Use Atualizar estado para tentar novamente.</p>}
            <p>O indicador informa a presença da configuração no servidor.</p>
          </div>
        </section>
      </div>
      <div className="settings-provider-grid">
        <section className="settings-panel">
          <h2><KeyRound size={20} aria-hidden="true" /> {asaas ? "API e autenticação" : "Credenciais e biblioteca"}</h2>
          <p>{asaas
            ? "O checkout usa o ambiente sandbox. Configure a chave da API, o token do webhook, a origem da aplicação e a imagem do item no servidor."
            : "Configure o identificador da biblioteca, a chave de assinatura e o domínio permitido no servidor."}</p>
        </section>
        <section className="settings-panel">
          <h2><Shield size={20} aria-hidden="true" /> {asaas ? "Webhooks e confirmação" : "Acesso e reprodução"}</h2>
          <p>{asaas
            ? "O servidor valida o token do webhook e processa a confirmação do pagamento antes de conceder acesso."
            : "Associe o identificador do vídeo à aula. O servidor verifica o acesso antes de emitir um link de reprodução temporário."}</p>
          <Link className="button" to={asaas ? "/admin/pedidos" : "/admin/cursos"}>
            {asaas ? "Consultar pedidos" : "Gerenciar aulas"}
          </Link>
        </section>
        <section className="settings-panel">
          <h2><FileText size={20} aria-hidden="true" /> {asaas ? "Conciliação e operações fiscais" : "Processamento de vídeo"}</h2>
          <p>{asaas
            ? "Consulte taxas, conciliação e operações fiscais no painel do Asaas."
            : "Consulte a biblioteca, o processamento e os perfis de vídeo no painel do Bunny Stream."}</p>
        </section>
      </div>
      {capabilities.isSuccess && (
        <details className="settings-panel settings-services">
          <summary>Outros serviços da plataforma</summary>
          <dl className="settings-roles">
            <div><dt>Aplicação</dt><dd>{capabilities.data.mode === "production" ? "Produção" : capabilities.data.mode === "local" ? "Local" : "Indisponível"}</dd></div>
            <div><dt>Armazenamento</dt><dd>{capabilities.data.storage ? "Disponível na configuração" : "Indisponível"}</dd></div>
            <div><dt>E-mail</dt><dd>{capabilities.data.email === "configured" ? "Configuração detectada" : capabilities.data.email === "local" ? "Local" : "Indisponível"}</dd></div>
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
  if (tab === "modulos") return <AdminModules />;
  if (tab === "equipe") return <AdminTeam />;
  if (tab === "auditoria") return <AdminAudit />;
  if (tab === "integracoes") return <AdminIntegrations provider={params.get("provedor") === "bunny" ? "bunny" : "asaas"} />;
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
          {questions.data?.length ? questions.data.map((question) => (
            <div className="resource-row" key={question.id}>
              <div>
                <h3>{text(question, "label")}</h3>
                <p>
                  {question.active ? "Ativa" : "Inativa"} ·{" "}
                  {question.required ? "Obrigatória" : "Opcional"}
                </p>
              </div>
              <button onClick={() => setSelected(question)}>
                Editar pergunta
              </button>
            </div>
          )) : <Empty>Nenhuma pergunta cadastrada.</Empty>}
        </QueryState>
      </section>
      {selected !== undefined && (
        <section className="settings-panel">
          <div className="reading inline-editor" key={selected?.id ?? "new"} ref={focusEditor}>
            <h2>{selected ? "Editar pergunta" : "Criar pergunta"}</h2>
            <Form
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
                  {[
                    "name",
                    "segment",
                    "role",
                    "size",
                    "stage",
                    "revenue_range",
                    "acquisition",
                    "product_description",
                  ].map((key) => (
                    <option key={key}>{key}</option>
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
