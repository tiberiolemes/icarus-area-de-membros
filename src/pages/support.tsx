import { AdminSurface } from "./admin-surface";
import { useState, type ReactNode } from "react";
import {
  ArrowUpRight,
  BookOpen,
  ChevronRight,
  LifeBuoy,
  MessageSquare,
  Paperclip,
} from "lucide-react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { cache, date, edge, safeUrl, useRpc, rpc } from "../api";
import type { Page, Ticket } from "../api";
import { useAuth } from "../auth";
import {
  Action,
  Back,
  Empty,
  Field,
  Form,
  Heading,
  Pager,
  QueryState,
  SectionHeading,
  value,
} from "../ui";
import { statusName } from "./community";
import { Upload } from "../upload";
import { useModules } from "../modules";
import { HelpLink } from "../help-link";

import "./support.css";

const statuses = ["open", "in_progress", "waiting_member", "resolved"];
const priorities = ["low", "normal", "high", "urgent"];
const helpLinks = [
  ["/ajuda/acesso", "Recuperar acesso à conta"],
  ["/ajuda/cursos", "Acessar cursos e aulas"],
  ["/ajuda/certificados", "Consultar certificados"],
  ["/ajuda/suporte", "Acompanhar chamados e anexos"],
];

export function Tickets({ admin = false }: { admin?: boolean }) {
  const modules = useModules();
  return admin ? (
    <AdminTickets />
  ) : (
    <div className="support-page">
      <Heading title="Central de suporte">
        Envie sua solicitação à equipe e acompanhe as respostas na conversa.
      </Heading>
      <nav className="support-shortcuts" aria-label="Atalhos de suporte">
        {modules.help && <>
          <HelpLink className="support-panel" to="/ajuda">
            <BookOpen size={22} aria-hidden="true" />
            <strong>Central de ajuda</strong>
            <span>Consulte os guias da plataforma.</span>
          </HelpLink>
          <HelpLink className="support-panel" to="/ajuda/suporte">
            <LifeBuoy size={22} aria-hidden="true" />
            <strong>Como funciona o atendimento</strong>
            <span>Veja como acompanhar e reabrir um chamado.</span>
          </HelpLink>
        </>}
        <Link className="support-panel" to="/app/suporte/novo">
          <MessageSquare size={22} aria-hidden="true" />
          <strong>Abrir chamado</strong>
          <span>Fale com a equipe de suporte.</span>
        </Link>
      </nav>
      <div className="support-member-grid">
        <section aria-label="Meus chamados recentes" data-tour="support">
          <h2>Meus chamados recentes</h2>
          <TicketQueue />
        </section>
        <section className="support-panel">
          <h2>Abrir novo chamado</h2>
          <TicketForm />
        </section>
      </div>
      {modules.help && (
        <section className="support-panel">
          <SectionHeading
            className="support-section-heading"
            title="Perguntas frequentes"
            actions={
              <HelpLink className="text-action" to="/ajuda">
                Ver todos os guias <ArrowUpRight size={16} aria-hidden="true" />
              </HelpLink>
            }
          />
          <div className="support-faq">
            {helpLinks.map(([to, label]) => (
              <HelpLink to={to} key={to}>
                {label}
                <ChevronRight size={16} aria-hidden="true" />
              </HelpLink>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function AdminTickets() {
  const { ticket } = useParams();
  const [params] = useSearchParams();
  const queryString = params.toString();
  return (
    <AdminSurface className="support-page support-admin" section="suporte"
      trail={["Administração", ticket ? { label: "Suporte", to: "/admin/suporte" } : "Suporte", ...(ticket ? ["Chamado"] : [])]}
      title="Gestão de chamados e atendimento" description="Acompanhe a fila de atendimento e responda aos chamados.">
      {ticket && (
        <div className="support-mobile-back">
          <Back
            to={
              queryString ? "/admin/suporte?" + queryString : "/admin/suporte"
            }
          />
        </div>
      )}
      <TicketQueue admin selected={ticket}>
        {ticket ? (
          <TicketConversation key={ticket} admin ticket={ticket} />
        ) : (
          <section className="support-panel">
            <MessageSquare size={24} aria-hidden="true" />
            <h2>Conversa do chamado</h2>
            <p>
              Selecione um chamado na fila para ver o histórico e responder.
            </p>
          </section>
        )}
      </TicketQueue>
    </AdminSurface>
  );
}

function TicketQueue({
  admin = false,
  selected,
  children,
}: {
  admin?: boolean;
  selected?: string;
  /** Conversa exibida ao lado da fila no painel. */
  children?: ReactNode;
}) {
  const [params, setParams] = useSearchParams();
  const requestedPage = Number(params.get("page") || 1);
  const page =
    Number.isInteger(requestedPage) &&
    requestedPage >= 1 &&
    requestedPage <= 100000
      ? requestedPage
      : 1;
  const base = admin ? "/admin/suporte" : "/app/suporte";
  const [memberStatus, setMemberStatus] = useState("");
  const [draft, setDraft] = useState(params.get("q") ?? "");
  const status = admin ? params.get("situacao") ?? "" : memberStatus;
  const priority = params.get("prioridade") ?? "";
  const search = params.get("q") ?? "";
  function update(key: string, value: string) {
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      next.delete("page");
      if (value) next.set(key, value);
      else next.delete(key);
      return next;
    }, { replace: true });
  }
  const query = useRpc<Page<Ticket> & { counts?: Record<string, number>; first_response_seconds?: number | null }>(
    admin ? "app_admin_ticket_queue" : "app_tickets",
    admin ? { p_page: page, p_query: search, p_status: status || null, p_priority: priority || null } : { p_page: page },
  );
  const counts = query.data?.counts ?? {};
  const response = query.data?.first_response_seconds;
  const active = (counts.open ?? 0) + (counts.in_progress ?? 0) + (counts.waiting_member ?? 0);
  const all = active + (counts.resolved ?? 0);
  const items = query.data?.items?.filter((ticket) => admin || !status ||
    (status === "active" ? ticket.status !== "resolved" : ticket.status === status));

  const list = (
      <QueryState query={query}>
        {query.data && items && (
          <>
          {!admin && query.data.total > 0 && (
            <fieldset className="support-filters">
              <legend className="sr-only">Filtrar nesta página</legend>
              <div className="support-member-filters">
                {[
                  ["", "Todos"],
                  ["active", "Em aberto"],
                  ["resolved", "Resolvidos"],
                ].map(([value, label]) => (
                  <button key={value} type="button" aria-pressed={status === value} onClick={() => setMemberStatus(value)}>
                    {label}
                  </button>
                ))}
              </div>
            </fieldset>
          )}
          <ul className="support-queue">
            {items.map((ticket) => (
              <li key={ticket.id}>
                <Link
                  className="support-panel support-ticket-link"
                  to={{
                    pathname: base + "/" + ticket.id,
                    search: admin ? params.toString() : page > 1 ? "?page=" + page : "",
                  }}
                  aria-current={selected === ticket.id ? "page" : undefined}
                >
                  <span className="support-ticket-meta">
                    <span className="badge" data-status={ticket.status}>
                      {statusName(ticket.status)}
                    </span>
                    <time dateTime={ticket.created_at}>
                      {date(ticket.created_at)}
                    </time>
                  </span>
                  <strong>{ticket.subject}</strong>
                  <span className="support-ticket-meta">
                    <span>
                      Prioridade{" "}
                      {priorityName(ticket.priority).toLocaleLowerCase("pt-BR")}
                    </span>
                    <ChevronRight size={16} aria-hidden="true" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {!items.length && (
            <Empty>
              {query.data.total
                ? "Nenhum chamado encontrado nesta página."
                : admin
                  ? "Nenhum chamado na fila."
                  : "Você ainda não tem chamados."}
            </Empty>
          )}
          {(query.data.total > 20 || (admin && page > 1)) && (
            <Pager
              page={page}
              total={query.data.total}
              onChange={(next) => admin ? update("page", String(next)) : setParams({ page: String(next) })}
            />
          )}
        </>
      )}
      </QueryState>
  );
  if (!admin) return list;
  return (
    <>
      {query.data && <dl className="admin-metrics" aria-label="Indicadores dos chamados">
        <div><dt>Em aberto</dt><dd><strong>{active}</strong></dd></div>
        <div><dt>Aguardando o membro</dt><dd><strong>{counts.waiting_member ?? 0}</strong></dd></div>
        {response != null && <div><dt>Média da primeira resposta</dt><dd><strong>{response < 60 ? `${response} s` : `${Math.round(response / 60)} min`}</strong></dd></div>}
      </dl>}
      <form className="admin-filters" data-tour="support-filters" onSubmit={(event) => { event.preventDefault(); update("q", draft.trim()); }}>
        <div className="support-search">
          <Field label="Buscar por assunto">
            <input type="search" value={draft} maxLength={200} onChange={(event) => setDraft(event.target.value)} />
          </Field>
          <button type="submit">Buscar</button>
        </div>
        <div className="admin-list-filters">
          <Field label="Prioridade">
            <select value={priority} onChange={(event) => update("prioridade", event.target.value)}>
              <option value="">Todas</option>
              {priorities.map((item) => <option key={item} value={item}>{priorityName(item)}</option>)}
            </select>
          </Field>
        </div>
        <div className="tabs support-status-tabs" role="group" aria-label="Situação dos chamados">
          {["", ...statuses].map((item) => <button key={item} type="button" aria-pressed={status === item}
            onClick={() => update("situacao", item)}>
            {item ? statusName(item) : "Todos"}{query.isSuccess && ` (${item ? counts[item] ?? 0 : all})`}
          </button>)}
        </div>
      </form>
      <div className={selected ? "support-admin-grid support-admin-selected" : "support-admin-grid"}>
        <section className="support-admin-queue" aria-label="Fila de suporte">{list}</section>
        {children}
      </div>
    </>
  );
}
export const priorityName = (priority: string) =>
  ({ low: "Baixa", normal: "Normal", high: "Alta", urgent: "Urgente" })[
    priority
  ] ?? priority;
export function NewTicket() {
  return (
    <div className="support-page">
      <Back to="/app/suporte" />
      <div className="support-panel support-conversation">
        <Heading title="Abrir novo chamado" />
        <TicketForm />
      </div>
    </div>
  );
}

function TicketForm() {
  const navigate = useNavigate();
  return (
    <>
      <p>
        Descreva o problema sem incluir senhas, documentos ou dados de cartão.
      </p>
      <Form
        className="support-new-form"
        label="Enviar chamado"
        onSave={async (data) => {
          const ticket = await rpc<{ id: string }>("app_create_ticket", {
            p_subject: value(data, "subject"),
            p_priority: value(data, "priority"),
            p_body: value(data, "body"),
          });
          await cache.invalidateQueries({ queryKey: ["app_tickets"] });
          navigate("/app/suporte/" + ticket.id);
        }}
      >
        <Field label="Assunto">
          <input name="subject" required minLength={3} maxLength={200} />
        </Field>
        <div className="support-priority">
          <Field label="Prioridade">
            <select name="priority" defaultValue="normal">
              {priorities.map((p) => (
                <option key={p} value={p}>
                  {priorityName(p)}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Mensagem">
          <textarea
            name="body"
            rows={8}
            required
            minLength={5}
            maxLength={20_000}
          />
        </Field>
        <p className="support-attachment-hint">
          <Paperclip size={18} aria-hidden="true" /> Anexe arquivos privados na
          conversa após enviar o chamado.
        </p>
      </Form>
    </>
  );
}

export function TicketPage({ admin = false }: { admin?: boolean }) {
  const { ticket } = useParams();
  const [params] = useSearchParams();
  const page = params.get("page");
  if (admin) return <AdminTickets />;
  return (
    <div className="support-page">
      <Back
        to={
          page
            ? "/app/suporte?page=" + encodeURIComponent(page)
            : "/app/suporte"
        }
      />
      {ticket && <TicketConversation key={ticket} ticket={ticket} />}
    </div>
  );
}

function TicketConversation({
  ticket,
  admin = false,
}: {
  ticket: string;
  admin?: boolean;
}) {
  const { session } = useAuth();
  const query = useRpc<Ticket>("app_ticket", { p_id: ticket }),
    messageAttachmentIds = new Set(
      query.data?.messages.flatMap(
        (message) => message.attachments?.map((file) => file.id) ?? [],
      ) ?? [],
    ),
    conversationFiles =
      query.data?.attachments?.filter(
        (file) => !messageAttachmentIds.has(file.id),
      ) ?? [];
  return (
    <section
      className="support-panel support-conversation"
      aria-label="Conversa do chamado"
    >
      <QueryState query={query}>
        {query.data && (
          <>
            <Heading title={query.data.subject} level={admin ? 2 : 1}>
              {priorityName(query.data.priority)} ·{" "}
              {statusName(query.data.status)} · {date(query.data.created_at)}
            </Heading>
            <div className="thread">
              {query.data.messages.map((message) => {
                const team = !admin && session && message.author_id && message.author_id !== session.user.id;
                return <article key={message.id} className={team ? "support-team-message" : undefined}>
                  <p className="meta">
                    <strong>{admin ? message.author_name : message.author_name || (team ? "Atendimento" : "Membro")}</strong>
                    {team && <> <span className="badge">Equipe</span></>} ·{" "}
                    {date(message.created_at)}
                  </p>
                  <div className="prose">{message.body}</div>
                  {!!message.attachments?.length && (
                    <div className="actions">
                      {message.attachments.map((file) => (
                        <DownloadAttachment key={file.id} file={file} />
                      ))}
                    </div>
                  )}
                </article>;
              })}
            </div>
            {!!conversationFiles.length && (
              <section>
                <h2>Arquivos da conversa</h2>
                <div className="actions">
                  {conversationFiles.map((file) => (
                    <DownloadAttachment key={file.id} file={file} />
                  ))}
                </div>
              </section>
            )}
            <Form
              className="support-reply"
              successMessage="Resposta enviada."
              label={
                !admin && query.data.status === "resolved"
                  ? "Reabrir e responder"
                  : "Enviar resposta"
              }
              onSave={async (data, form) => {
                const result = await rpc<{ id: string; status: string }>(
                  "app_ticket_reply",
                  {
                    p_id: ticket,
                    p_body: value(data, "body"),
                    p_status: admin
                      ? value(data, "status")
                      : query.data?.status === "resolved"
                        ? "open"
                        : null,
                  },
                );
                form.reset();
                const status = form.elements.namedItem(
                  "status",
                ) as HTMLSelectElement | null;
                if (status) status.value = result.status;
                await Promise.all([
                  query.refetch(),
                  cache.invalidateQueries({ queryKey: ["app_tickets"] }),
                  cache.invalidateQueries({ queryKey: ["app_admin_ticket_queue"] }),
                ]);
              }}
            >
              <Field label="Sua resposta">
                <textarea
                  name="body"
                  rows={6}
                  required
                  minLength={3}
                  maxLength={20_000}
                />
              </Field>
              {admin && (
                <Field label="Estado após a resposta">
                  <select name="status" defaultValue={query.data.status}>
                    {statuses.map((status) => (
                      <option key={status} value={status}>
                        {statusName(status)}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
            </Form>
            <Upload
              kind="ticket-attachment"
              resourceId={ticket}
              onUploaded={() => void query.refetch()}
            />
          </>
        )}
      </QueryState>
    </section>
  );
}

function DownloadAttachment({ file }: { file: { id: string; name: string } }) {
  return (
    <Action
      run={async () => {
        const result = await edge<{ url: string }>("media", {
          kind: "ticket-attachment",
          id: file.id,
        });
        const url = safeUrl(result.url);
        if (!url) throw new Error("Arquivo indisponível.");
        window.open(url, "_blank", "noopener,noreferrer");
      }}
    >
      Baixar {file.name}
    </Action>
  );
}
