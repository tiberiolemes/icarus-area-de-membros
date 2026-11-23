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
  value,
} from "../ui";
import { statusName } from "./community";
import { Upload } from "../upload";

export function Tickets({ admin = false }: { admin?: boolean }) {
  const [params, setParams] = useSearchParams(),
    page = Number(params.get("page") || 1),
    query = useRpc<Page<Ticket>>("app_tickets", { p_page: page }),
    base = admin ? "/admin/suporte" : "/app/suporte";
  return (
    <>
      <Heading
        title={admin ? "Fila de suporte" : "Seu suporte"}
        action={
          !admin && (
            <Link className="button primary" to="/app/suporte/novo">
              Abrir ticket
            </Link>
          )
        }
      >
        Acompanhe suas solicitações e continue a conversa em cada ticket.
      </Heading>
      <Link to="/ajuda">Consulte primeiro a central de ajuda</Link>
      <QueryState query={query}>
        {query.data && (
          <>
            <div className="rows" data-tour="support">
              {query.data.items.map((ticket) => (
                <Link
                  className="resource-row"
                  key={ticket.id}
                  to={base + "/" + ticket.id}
                >
                  <div>
                    <h2>{ticket.subject}</h2>
                    <p>
                      {date(ticket.created_at)} ·{" "}
                      {priorityName(ticket.priority)}
                    </p>
                  </div>
                  <span className="badge">{statusName(ticket.status)}</span>
                </Link>
              ))}
            </div>
            {!query.data.items.length && (
              <Empty>
                Você ainda não tem tickets. Abra uma solicitação se precisar de
                ajuda com seu acesso ou com o conteúdo.
              </Empty>
            )}
            <Pager
              page={page}
              total={query.data.total}
              onChange={(page) => setParams({ page: String(page) })}
            />
          </>
        )}
      </QueryState>
    </>
  );
}
export const priorityName = (priority: string) =>
  ({ low: "Baixa", normal: "Normal", high: "Alta", urgent: "Urgente" })[
    priority
  ] ?? priority;
export function NewTicket() {
  const navigate = useNavigate();
  return (
    <>
      <Back to="/app/suporte" />
      <Heading title="Abra uma solicitação">
        Descreva o problema sem incluir senhas, documentos ou dados de cartão.
      </Heading>
      <div className="reading">
        <Form
          label="Abrir ticket"
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
          <Field label="Prioridade">
            <select name="priority" defaultValue="normal">
              {["low", "normal", "high", "urgent"].map((p) => (
                <option key={p} value={p}>
                  {priorityName(p)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Mensagem">
            <textarea
              name="body"
              rows={8}
              required
              minLength={5}
              maxLength={20_000}
            />
          </Field>
        </Form>
      </div>
    </>
  );
}
export function TicketPage({ admin = false }: { admin?: boolean }) {
  const { ticket } = useParams(),
    query = useRpc<Ticket>("app_ticket", { p_id: ticket }),
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
    <>
      <Back to={admin ? "/admin/suporte" : "/app/suporte"} />
      <QueryState query={query}>
        {query.data && (
          <div className="reading">
            <Heading title={query.data.subject}>
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
                  {message.attachments?.map((file) => (
                    <Action
                      key={file.id}
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
                  ))}
                </article>
              ))}
            </div>
            {!!conversationFiles.length && (
              <section>
                <h2>Arquivos da conversa</h2>
                {conversationFiles.map((file) => (
                  <Action
                    key={file.id}
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
                ))}
              </section>
            )}
            <Form
              label={
                query.data.status === "resolved"
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
                    {["open", "in_progress", "waiting_member", "resolved"].map(
                      (status) => (
                        <option key={status} value={status}>
                          {statusName(status)}
                        </option>
                      ),
                    )}
                  </select>
                </Field>
              )}
            </Form>
            <Upload
              kind="ticket-attachment"
              resourceId={ticket!}
              onUploaded={() => void query.refetch()}
            />
          </div>
        )}
      </QueryState>
    </>
  );
}
