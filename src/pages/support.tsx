import { useState } from "react";
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
  return admin ? (
    <AdminTickets />
  ) : (
    <div className="support-page">
      <Heading title="Central de Suporte & Atendimento">
        Envie sua solicitação à equipe e acompanhe as respostas na conversa.
      </Heading>
      <nav className="support-shortcuts" aria-label="Atalhos de suporte">
        <Link className="support-panel" to="/ajuda">
          <BookOpen size={22} aria-hidden="true" />
          <strong>Central de ajuda</strong>
          <span>Consulte os guias da plataforma.</span>
        </Link>
        <Link className="support-panel" to="/ajuda/suporte">
          <LifeBuoy size={22} aria-hidden="true" />
          <strong>Como funciona o atendimento</strong>
          <span>Veja como acompanhar e reabrir um chamado.</span>
        </Link>
        <Link className="support-panel" to="/app/suporte/novo">
          <MessageSquare size={22} aria-hidden="true" />
          <strong>Abrir ticket</strong>
          <span>Fale com a equipe de suporte.</span>
        </Link>
      </nav>
      <div className="support-member-grid">
        <section className="support-panel">
          <h2>Abrir novo chamado</h2>
          <TicketForm />
        </section>
        <section aria-label="Meus chamados recentes" data-tour="support">
          <h2>Meus chamados recentes</h2>
          <TicketQueue />
        </section>
      </div>
      <section className="support-panel">
        <SectionHeading
          className="support-section-heading"
          title="Perguntas frequentes"
          actions={
            <Link className="text-action" to="/ajuda">
              Ver todos os guias <ArrowUpRight size={16} aria-hidden="true" />
            </Link>
          }
        />
        <div className="support-faq">
          {helpLinks.map(([to, label]) => (
            <Link to={to} key={to}>
              {label}
              <ChevronRight size={16} aria-hidden="true" />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function AdminTickets() {
  const { ticket } = useParams();
  const [params] = useSearchParams();
  const page = params.get("page");
  return (
    <div className="support-page support-admin">
      <Heading title="Gestão de Tickets & Atendimento ao Aluno">
        Acompanhe a fila de atendimento e responda aos chamados autorizados.
      </Heading>
      {ticket && (
        <div className="support-mobile-back">
          <Back
            to={
              page
                ? "/admin/suporte?page=" + encodeURIComponent(page)
                : "/admin/suporte"
            }
          />
        </div>
      )}
      <div
        className={
          ticket
            ? "support-admin-grid support-admin-selected"
            : "support-admin-grid"
        }
      >
        <section className="support-admin-queue" aria-label="Fila de suporte">
          <TicketQueue admin selected={ticket} />
        </section>
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
      </div>
    </div>
  );
}

function TicketQueue({
  admin = false,
  selected,
}: {
  admin?: boolean;
  selected?: string;
}) {
  const [params, setParams] = useSearchParams();
  const requestedPage = Number(params.get("page") || 1);
  const page =
    Number.isInteger(requestedPage) &&
    requestedPage >= 1 &&
    requestedPage <= 100000
      ? requestedPage
      : 1;
  const query = useRpc<Page<Ticket>>("app_tickets", { p_page: page });
  const base = admin ? "/admin/suporte" : "/app/suporte";
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [search, setSearch] = useState("");
  const items = query.data?.items.filter(
    (ticket) =>
      (!status ||
        (status === "active"
          ? ticket.status !== "resolved"
          : ticket.status === status)) &&
      (!priority || ticket.priority === priority) &&
      ticket.subject
        .toLocaleLowerCase("pt-BR")
        .includes(search.trim().toLocaleLowerCase("pt-BR")),
  );

  return (
    <QueryState query={query}>
      {query.data && items && (
        <>
          {query.data.total > 0 && (
            <fieldset className="support-filters">
              <legend className={admin ? undefined : "sr-only"}>
                Filtrar nesta página
              </legend>
              {admin ? (
                <>
                  <Field label="Buscar por assunto">
                    <input
                      type="search"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                    />
                  </Field>
                  <div className="support-filter-options">
                    <Field label="Status">
                      <select
                        value={status}
                        onChange={(event) => setStatus(event.target.value)}
                      >
                        <option value="">Todos</option>
                        {statuses.map((item) => (
                          <option key={item} value={item}>
                            {statusName(item)}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Prioridade">
                      <select
                        value={priority}
                        onChange={(event) => setPriority(event.target.value)}
                      >
                        <option value="">Todas</option>
                        {priorities.map((item) => (
                          <option key={item} value={item}>
                            {priorityName(item)}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                </>
              ) : (
                <div className="support-member-filters">
                  {[
                    ["", "Todos"],
                    ["active", "Em aberto"],
                    ["resolved", "Resolvidos"],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={status === value}
                      onClick={() => setStatus(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </fieldset>
          )}
          <ul className="support-queue">
            {items.map((ticket) => (
              <li key={ticket.id}>
                <Link
                  className="support-panel support-ticket-link"
                  to={{
                    pathname: base + "/" + ticket.id,
                    search: page > 1 ? "?page=" + page : "",
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
          {query.data.total > 20 && (
            <Pager
              page={page}
              total={query.data.total}
              onChange={(next) => setParams({ page: String(next) })}
            />
          )}
        </>
      )}
    </QueryState>
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
              {query.data.messages.map((message) => (
                <article key={message.id}>
                  <p className="meta">
                    <strong>{message.author_name}</strong> ·{" "}
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
                </article>
              ))}
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
