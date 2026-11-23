import { Fragment, useState } from "react";
import type { ReactNode } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Plus } from "lucide-react";
import {
  cache,
  date,
  downloadBlob,
  edge,
  money,
  roleLabel,
  roleLabels,
  rpc,
  useRpc,
} from "../api";
import { buildAdminCsv, exportLimit } from "../admin-export";
import type { Page, Plan, Course } from "../api";
import {
  Action,
  Back,
  Empty,
  Field,
  Form,
  Heading,
  Modal,
  Notice,
  Pager,
  Progress,
  QueryState,
  Search,
  nullable,
  value,
} from "../ui";
import { RichEditor } from "../rich";
import { Reauth } from "./settings";
import { Moderate, statusName } from "./community";
import { useBootstrap } from "../auth";
import { Upload } from "../upload";

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
function AdminList({
  entity,
  title,
  action,
  children,
  section = false,
}: {
  entity: string;
  title: string;
  action?: ReactNode;
  children: (item: Row) => ReactNode;
  section?: boolean;
}) {
  const [params, setParams] = useSearchParams(),
    q = params.get("q") ?? "",
    page = Number(params.get("page") || 1),
    query = useRpc<Page<Row>>("app_admin_list", {
      p_entity: entity,
      p_query: q,
      p_page: page,
    }),
    exportEntity = entity === "profiles" || entity === "orders" ? entity : null;
  return (
    <>
      <Heading title={title} action={action} level={section ? 2 : 1} />
      <Search initial={q} onSearch={(q) => setParams({ q, page: "1" })} />
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
              onChange={(page) => setParams({ q, page: String(page) })}
            />
          </>
        )}
      </QueryState>
    </>
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
      <span>Ordem {String(row.order_index ?? 0)}</span>
      <Action disabled={index <= 0} run={() => move(-1)}>
        <ArrowUp size={18} />
        Subir {text(row, "title")}
      </Action>
      <Action disabled={index >= siblings.length - 1} run={() => move(1)}>
        <ArrowDown size={18} />
        Descer {text(row, "title")}
      </Action>
    </div>
  );
}
export function AdminCourses() {
  return (
    <AdminList
      entity="courses"
      title="Conteúdo"
      action={
        <Link className="button primary" to="/admin/cursos/novo">
          <Plus size={18} />
          Criar curso
        </Link>
      }
    >
      {(course) => (
        <>
          <div>
            <h2>
              <Link to={"/admin/cursos/" + course.id}>
                {text(course, "title")}
              </Link>
            </h2>
            <p>
              {statusName(text(course, "status"))} · /{text(course, "slug")}
            </p>
          </div>
          <Link className="button" to={"/admin/cursos/" + course.id}>
            Editar curso
          </Link>
        </>
      )}
    </AdminList>
  );
}
export function CourseEditor() {
  const { id } = useParams(),
    isNew = id === "novo",
    courses = useAll("courses"),
    course = courses.data?.find((row) => row.id === id),
    navigate = useNavigate(),
    [tab, setTab] = useState("course");
  return (
    <>
      <Back to="/admin/cursos" />
      <Heading
        title={
          isNew
            ? "Criar curso"
            : course
              ? text(course, "title")
              : "Editar curso"
        }
      />
      <QueryState query={courses}>
        {(isNew || course) && (
          <>
            <nav className="tabs" aria-label="Editor de curso">
              {[
                ["course", "Curso"],
                ["structure", "Estrutura e aulas"],
                ["certificate", "Certificado"],
              ].map(([key, label]) => (
                <button
                  key={key}
                  disabled={isNew && key !== "course"}
                  aria-current={tab === key ? "page" : undefined}
                  onClick={() => setTab(key)}
                >
                  {label}
                </button>
              ))}
              {course && (
                <Link
                  className="button"
                  to={"/app/cursos/" + text(course, "slug")}
                >
                  Prévia autorizada
                </Link>
              )}
            </nav>
            {tab === "course" && (
              <div className="reading" data-tour="course-editor">
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
                    <h2>Capa do curso</h2>
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
            {tab === "structure" && course && <Structure course={course} />}{" "}
            {tab === "certificate" && course && (
              <div className="reading">
                <Form
                  label="Salvar configuração do certificado"
                  onSave={(data) =>
                    save("courses", course.id, {
                      certificate_enabled: check(data, "certificate_enabled"),
                      signer_name: value(data, "signer_name"),
                      signer_title: value(data, "signer_title"),
                      signature_url: nullable(data, "signature_url"),
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
                  <Field label="URL da assinatura (opcional)">
                    <input
                      name="signature_url"
                      type="url"
                      defaultValue={text(course, "signature_url")}
                      placeholder="https://"
                    />
                  </Field>
                  <Notice>
                    O certificado usa o nome do aluno, o curso e a carga horária
                    do currículo obrigatório. Alterações não reescrevem
                    documentos já emitidos. Cadastre dados reais ou identifique
                    expressamente uma demonstração.
                  </Notice>
                </Form>
              </div>
            )}
          </>
        )}
        {!isNew && courses.data && !course && (
          <Notice error>Curso não encontrado.</Notice>
        )}
      </QueryState>
    </>
  );
}
function Structure({ course }: { course: Row }) {
  const modules = useAll("modules"),
    sections = useAll("sections"),
    lessons = useAll("lessons"),
    [selected, setSelected] = useState<{
      entity: "modules" | "sections" | "lessons";
      row?: Row;
      parent: string;
    } | null>(null);
  const ownModules =
    modules.data
      ?.filter((m) => m.course_id === course.id)
      .sort((a, b) => Number(a.order_index) - Number(b.order_index)) ?? [];
  return (
    <>
      <div className="section-heading">
        <h2>Estrutura do curso</h2>
        <button
          onClick={() => setSelected({ entity: "modules", parent: course.id })}
        >
          <Plus size={18} />
          Adicionar módulo
        </button>
      </div>
      <Notice>
        Crie módulos, seções e aulas nesta ordem. Os botões Subir e Descer
        funcionam com teclado e mouse.
      </Notice>
      <QueryState query={modules}>
        <QueryState query={sections}>
          <QueryState query={lessons}>
            <div className="editor-outline">
              {ownModules.map((module) => {
                const ownSections =
                  sections.data
                    ?.filter((s) => s.module_id === module.id)
                    .sort(
                      (a, b) => Number(a.order_index) - Number(b.order_index),
                    ) ?? [];
                return (
                  <section key={module.id}>
                    <div className="section-heading">
                      <h3>
                        {text(module, "title")}{" "}
                        <span className="badge">
                          {statusName(text(module, "status"))}
                        </span>
                      </h3>
                      <button
                        onClick={() =>
                          setSelected({
                            entity: "modules",
                            row: module,
                            parent: course.id,
                          })
                        }
                      >
                        Editar módulo
                      </button>
                    </div>
                    <OrderControl
                      entity="modules"
                      row={module}
                      siblings={ownModules}
                    />
                    {ownSections.map((section) => {
                      const ownLessons =
                        lessons.data
                          ?.filter((l) => l.section_id === section.id)
                          .sort(
                            (a, b) =>
                              Number(a.order_index) - Number(b.order_index),
                          ) ?? [];
                      return (
                        <div className="section-block" key={section.id}>
                          <div className="section-heading">
                            <h4>
                              {text(section, "title")}
                              {!!section.is_bonus && (
                                <span className="badge">Bônus</span>
                              )}
                            </h4>
                            <button
                              onClick={() =>
                                setSelected({
                                  entity: "sections",
                                  row: section,
                                  parent: module.id,
                                })
                              }
                            >
                              Editar seção
                            </button>
                          </div>
                          <OrderControl
                            entity="sections"
                            row={section}
                            siblings={ownSections}
                          />
                          {ownLessons.map((lesson) => (
                            <article
                              className="lesson-editor-row"
                              key={lesson.id}
                            >
                              <div className="section-heading">
                                <strong>{text(lesson, "title")}</strong>
                                <button
                                  onClick={() =>
                                    setSelected({
                                      entity: "lessons",
                                      row: lesson,
                                      parent: section.id,
                                    })
                                  }
                                >
                                  Editar aula
                                </button>
                              </div>
                              <p>
                                {statusName(text(lesson, "status"))} ·{" "}
                                {text(lesson, "type")} ·{" "}
                                {Math.ceil(
                                  Number(lesson.duration_seconds) / 60,
                                )}{" "}
                                min{lesson.is_required ? " · Obrigatória" : ""}
                              </p>
                              <OrderControl
                                entity="lessons"
                                row={lesson}
                                siblings={ownLessons}
                              />
                            </article>
                          ))}
                          <button
                            onClick={() =>
                              setSelected({
                                entity: "lessons",
                                parent: section.id,
                              })
                            }
                          >
                            <Plus size={18} />
                            Adicionar aula
                          </button>
                        </div>
                      );
                    })}
                    <button
                      onClick={() =>
                        setSelected({ entity: "sections", parent: module.id })
                      }
                    >
                      <Plus size={18} />
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
      {selected && (
        <section
          className="inline-editor"
          ref={focusEditor}
          key={`${selected.entity}-${selected.row?.id ?? selected.parent}`}
        >
          <div className="section-heading">
            <h2>
              {selected.row ? "Editar" : "Criar"}{" "}
              {selected.entity === "modules"
                ? "módulo"
                : selected.entity === "sections"
                  ? "seção"
                  : "aula"}
            </h2>
            <button onClick={() => setSelected(null)}>Fechar editor</button>
          </div>
          <StructureForm
            entity={selected.entity}
            row={selected.row}
            parent={selected.parent}
            after={async () => {
              await Promise.all([
                modules.refetch(),
                sections.refetch(),
                lessons.refetch(),
              ]);
              setSelected(null);
            }}
          />
        </section>
      )}
    </>
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
  return (
    <div className="reading">
      <Form
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
            <input name="title" required defaultValue={text(row, "title")} />
          </Field>
        ) : (
          <IdentityFields row={row} />
        )}
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
            <Field label="Tipo de aula">
              <select name="type" defaultValue={text(row, "type", "video")}>
                <option value="video">Vídeo</option>
                <option value="text">Texto</option>
              </select>
            </Field>
            <RichEditor
              name="body"
              initial={text(row, "body")}
              label="Descrição da aula"
            />
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
            <Field label="Identificador do vídeo no Bunny">
              <input
                name="video_id"
                defaultValue={text(row, "video_id")}
                maxLength={100}
              />
            </Field>
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
          {entity === "lessons" && <Upload kind="lesson" resourceId={row.id} />}
          <Archive entity={entity} row={row} />
        </>
      )}
    </div>
  );
}
export function AdminMaterials() {
  const folders = useAll("material_folders"),
    lessons = useAll("lessons"),
    [editing, setEditing] = useState<Row | null | undefined>(undefined),
    [folder, setFolder] = useState<Row | null | undefined>(undefined);
  return (
    <>
      <AdminList
        entity="materials"
        title="Materiais"
        action={
          <div className="actions">
            <button onClick={() => setFolder(null)}>Nova pasta</button>
            <button className="primary" onClick={() => setEditing(null)}>
              Novo material
            </button>
          </div>
        }
      >
        {(item) => (
          <>
            <div>
              <h2>{text(item, "name")}</h2>
              <p>
                {statusName(text(item, "status"))} · {text(item, "file_type")} ·{" "}
                {text(item, "size_bytes")} bytes
              </p>
            </div>
            <button onClick={() => setEditing(item)}>Editar material</button>
          </>
        )}
      </AdminList>
      <h2>Pastas</h2>
      <QueryState query={folders}>
        {folders.data?.map((item) => (
          <div className="resource-row" key={item.id}>
            <strong>{text(item, "name")}</strong>
            <button onClick={() => setFolder(item)}>Editar pasta</button>
          </div>
        ))}
      </QueryState>
      {folder !== undefined && (
        <section
          className="inline-editor reading"
          ref={focusEditor}
          key={folder?.id ?? "new-folder"}
        >
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
        </section>
      )}
      {editing !== undefined && (
        <section
          className="inline-editor reading"
          ref={focusEditor}
          key={editing?.id ?? "new-material"}
        >
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
        </section>
      )}
    </>
  );
}
export function AdminMembers() {
  return (
    <AdminList entity="profiles" title="Membros">
      {(member) => (
        <>
          <div>
            <h2>
              <Link to={"/admin/membros/" + member.id}>
                {memberName(member)}
              </Link>
            </h2>
            <p>
              {roleLabel(text(member, "role"))} ·{" "}
              {member.suspended ? "Suspenso" : "Ativo"}
            </p>
          </div>
          <Link className="button" to={"/admin/membros/" + member.id}>
            Abrir ficha
          </Link>
        </>
      )}
    </AdminList>
  );
}
export function MemberEditor() {
  const { id } = useParams(),
    members = useRpc<MemberDetail>("app_admin_member_detail", { p_id: id }),
    member = members.data?.profile,
    plans = useAll("plans"),
    [change, setChange] = useState<Record<string, unknown> | null>(null),
    [reason, setReason] = useState("");
  return (
    <>
      <Back to="/admin/membros" />
      <Heading title={member ? memberName(member) : "Ficha do membro"} />
      <QueryState query={members}>
        {member ? (
          <div className="reading">
            <dl>
              <dt>Papel</dt>
              <dd>{roleLabel(text(member, "role"))}</dd>
              <dt>Estado</dt>
              <dd>{member.suspended ? "Suspenso" : "Ativo"}</dd>
              <dt>Onboarding</dt>
              <dd>{member.onboarding_complete ? "Concluído" : "Pendente"}</dd>
            </dl>
            {members.data && <MemberFacts detail={members.data} />}
            <Notice>
              Conceder acesso aqui é uma cortesia auditada. Esta ação não cria
              um pagamento nem confirma uma venda.
            </Notice>
            <Form
              label="Revisar alteração"
              successMessage="Dados preparados. Confirme sua identidade para aplicar a alteração."
              onSave={async (data) => {
                setChange({
                  role: value(data, "role"),
                  suspended: check(data, "suspended"),
                  ...(value(data, "plan_id")
                    ? {
                        plan_id: value(data, "plan_id"),
                        access_ends_at: new Date(
                          value(data, "access_ends_at"),
                        ).toISOString(),
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
            {change && (
              <section>
                <h2>Confirme a alteração</h2>
                <p>
                  Papel: {roleLabel(String(change.role))}. Acesso:{" "}
                  {change.suspended ? "suspenso" : "ativo"}.{" "}
                  {change.plan_id ? "Cortesia solicitada." : ""}{" "}
                  {change.revoke_access ? "Revogação solicitada." : ""}
                </p>
                <p>Motivo: {reason}</p>
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
                      await members.refetch();
                    }}
                  </Reauth>
                  <button onClick={() => setChange(null)}>
                    Cancelar alteração
                  </button>
                </div>
              </section>
            )}
          </div>
        ) : (
          <Empty>Membro não encontrado.</Empty>
        )}
      </QueryState>
    </>
  );
}
function MemberFacts({ detail }: { detail: MemberDetail }) {
  return (
    <>
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
              {text(subscription, "status")} ·{" "}
              {date(text(subscription, "starts_at"))} a{" "}
              {date(text(subscription, "ends_at"))} ·{" "}
              {subscription.source === "manual"
                ? "Cortesia"
                : text(subscription, "source")}
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
      <h2>Pedidos ({detail.orders.total})</h2>
      {detail.orders.items.map((order) => (
        <p key={order.id}>
          <Link className="text-action" to={"/admin/pedidos/" + order.id}>
            {order.id.slice(0, 8)} · {money(Number(order.amount_cents))} ·{" "}
            {statusName(text(order, "status"))}
          </Link>
        </p>
      ))}
      <h2>Tickets ({detail.tickets.total})</h2>
      {detail.tickets.items.map((ticket) => (
        <p key={ticket.id}>
          <Link className="text-action" to={"/admin/suporte/" + ticket.id}>
            {text(ticket, "subject")} · {statusName(text(ticket, "status"))}
          </Link>
        </p>
      ))}
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
  return (
    <>
      <AdminList
        entity="plans"
        title="Planos"
        action={
          <button className="primary" onClick={() => setEditing(null)}>
            Criar plano
          </button>
        }
      >
        {(plan) => (
          <>
            <div>
              <h2>{text(plan, "name")}</h2>
              <p>
                {money(Number(plan.price_cents))} · {String(plan.access_months)}{" "}
                meses · {plan.active ? "Ativo" : "Inativo"}
              </p>
            </div>
            <button onClick={() => setEditing(plan)}>Editar plano</button>
          </>
        )}
      </AdminList>
      {editing !== undefined && (
        <section className="inline-editor reading" key={editing?.id ?? "new"} ref={focusEditor}>
          <h2>{editing ? "Editar plano" : "Criar plano"}</h2>
          <Form
            label="Salvar plano"
            secondaryAction={<button type="button" onClick={() => setEditing(undefined)}>Fechar editor</button>}
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
    </>
  );
}
export function AdminOrders() {
  const { id } = useParams(),
    orders = useAll("orders"),
    order = orders.data?.find((o) => o.id === id);
  if (id)
    return (
      <>
        <Back to="/admin/pedidos" />
        <Heading title="Detalhes do pedido" />
        <QueryState query={orders}>
          {order ? (
            <>
              <dl>
                <dt>Identificador</dt>
                <dd>{order.id}</dd>
                <dt>Estado confirmado pelo servidor</dt>
                <dd>{statusName(text(order, "status"))}</dd>
                <dt>Valor</dt>
                <dd>{money(Number(order.amount_cents))}</dd>
                <dt>Método</dt>
                <dd>{text(order, "method")}</dd>
                <dt>Data</dt>
                <dd>{date(text(order, "created_at"))}</dd>
                <dt>Acesso concedido</dt>
                <dd>{order.finalized_at ? "Sim" : "Ainda não confirmado"}</dd>
              </dl>
              <Notice>
                Estorno, documento fiscal e reenvio de convite dependem de
                operações do provedor no servidor. Não existe ação para marcar
                pagamento manualmente.
              </Notice>
            </>
          ) : (
            <Empty>Pedido não encontrado.</Empty>
          )}
        </QueryState>
      </>
    );
  return (
    <AdminList entity="orders" title="Pedidos">
      {(order) => (
        <>
          <div>
            <h2>
              <Link to={"/admin/pedidos/" + order.id}>
                Pedido {order.id.slice(0, 8)}
              </Link>
            </h2>
            <p>
              {money(Number(order.amount_cents))} ·{" "}
              {date(text(order, "created_at"))} · {text(order, "method")}
            </p>
          </div>
          <span className="badge">{statusName(text(order, "status"))}</span>
        </>
      )}
    </AdminList>
  );
}
export function AdminCommunity() {
  const [params, setParams] = useSearchParams(),
    tab = params.get("aba") ?? "moderacao",
    [editing, setEditing] = useState<Row | null | undefined>(undefined),
    spaces = useAll("spaces");
  return (
    <>
      <Heading title="Comunidade" />
      <nav className="tabs" aria-label="Administração da comunidade">
        {[
          ["moderacao", "Publicações"],
          ["respostas", "Respostas"],
          ["denuncias", "Denúncias"],
          ["espacos", "Espaços"],
        ].map(([id, label]) => (
          <button
            key={id}
            aria-current={tab === id ? "page" : undefined}
            onClick={() => setParams({ aba: id })}
          >
            {label}
          </button>
        ))}
      </nav>
      {tab === "moderacao" && (
        <AdminList entity="posts" title="Fila de publicações" section>
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
        <AdminList entity="replies" title="Fila de respostas" section>
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
        <AdminList entity="reports" title="Denúncias" section>
          {(report) => (
            <div>
              <p>{text(report, "reason")}</p>
              <p>Estado: {statusName(text(report, "status"))}</p>
              <Form
                label="Concluir análise"
                onSave={async (data) => {
                  await rpc("app_moderate", {
                    p_target_type: "report",
                    p_target_id: report.id,
                    p_decision: value(data, "decision"),
                    p_reason: value(data, "reason"),
                  });
                  await cache.invalidateQueries({
                    queryKey: ["app_admin_list"],
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
              </Form>
            </div>
          )}
        </AdminList>
      )}
      {tab === "espacos" && (
        <>
          <button className="primary" onClick={() => setEditing(null)}>
            Criar espaço
          </button>
          <QueryState query={spaces}>
            {spaces.data?.map((space) => (
              <div className="resource-row" key={space.id}>
                <div>
                  <h2>{text(space, "name")}</h2>
                  <p>{text(space, "description")}</p>
                </div>
                <button onClick={() => setEditing(space)}>Editar espaço</button>
              </div>
            ))}
          </QueryState>
          {editing !== undefined && (
            <div className="inline-editor reading" key={editing?.id ?? "new"} ref={focusEditor}>
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
          )}
        </>
      )}
    </>
  );
}
export function AdminSettings() {
  const [params, setParams] = useSearchParams(),
    tab = params.get("aba") ?? "onboarding",
    [legal, setLegal] = useState<Row | null | undefined>(undefined),
    config = useRpc<Page<Row>>("app_admin_list", {
      p_entity: "onboarding",
      p_query: "",
      p_page: 1,
    }),
    capabilities = useQuery({
      queryKey: ["capabilities"],
      queryFn: () => edge<Record<string, unknown>>("capabilities"),
    });
  return (
    <>
      <Heading title="Configurações da academia" />
      <nav className="tabs" aria-label="Configurações da academia">
        {[
          ["onboarding", "Onboarding"],
          ["integracoes", "Integrações"],
          ["legal", "Documentos legais"],
          ["equipe", "Equipe"],
          ["privacidade", "Privacidade"],
        ].map(([id, label]) => (
          <button
            key={id}
            aria-current={tab === id ? "page" : undefined}
            onClick={() => setParams({ aba: id })}
          >
            {label}
          </button>
        ))}
      </nav>
      {tab === "onboarding" && <OnboardingAdmin />}
      {tab === "integracoes" && (
        <div className="reading">
          <h2>Situação dos provedores</h2>
          <QueryState query={capabilities}>
            {capabilities.data && (
              <dl>
                {Object.entries(capabilities.data).map(([key, v]) => (
                  <Fragment key={key}>
                    <dt>{key}</dt>
                    <dd>
                      {typeof v === "boolean"
                        ? v
                          ? "Configurado"
                          : "Não configurado"
                        : String(v)}
                    </dd>
                  </Fragment>
                ))}
              </dl>
            )}
          </QueryState>
          <Notice>
            Credenciais são configuradas exclusivamente no servidor. Esta tela
            não lê nem armazena secrets.
          </Notice>
        </div>
      )}
      {tab === "legal" && (
        <>
          <AdminList
            entity="legal_versions"
            title="Documentos versionados"
            section
            action={<button onClick={() => setLegal(null)}>Nova versão</button>}
          >
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
                  Publique somente textos realmente aprovados para esta
                  academia.
                </Notice>
              </Form>
            </div>
          )}
        </>
      )}
      {tab === "equipe" && (
        <>
          <p>
            Papéis são independentes de planos. Altere o papel na ficha de um
            membro com reautenticação.
          </p>
          <Link className="button" to="/admin/membros">
            Gerenciar membros e equipe
          </Link>
        </>
      )}
      {tab === "privacidade" && (
        <AdminList
          entity="privacy_requests"
          title="Solicitações de privacidade"
          section
        >
          {(request) => (
            <div>
              <h3>{text(request, "kind")}</h3>
              <p>
                {statusName(text(request, "status"))} ·{" "}
                {date(text(request, "created_at"))}
              </p>
              <p>
                O processamento exige análise e retenção legal no servidor.
                Nenhuma exclusão automática é simulada nesta tela.
              </p>
            </div>
          )}
        </AdminList>
      )}
    </>
  );
}
function OnboardingAdmin() {
  const questions = useAll("onboarding_questions"),
    [selected, setSelected] = useState<Row | null | undefined>(undefined);
  return (
    <>
      <h2>Perguntas do onboarding</h2>
      <p>
        Configure as perguntas permitidas do perfil. A ordem e a obrigatoriedade
        serão aplicadas no cadastro de perfil.
      </p>
      <button onClick={() => setSelected(null)}>Adicionar pergunta</button>
      <QueryState query={questions}>
        {questions.data?.map((question) => (
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
        ))}
      </QueryState>
      {selected !== undefined && (
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
      )}
    </>
  );
}
