import { AdminSurface } from "./admin-surface";
import { Image, Link as LinkIcon } from "lucide-react";
import { useRef, useState } from "react";
import { cache, date, rpc, useRpc, type Page } from "../api";
import { PrivateImage } from "../media";
import { Empty, Field, Form, Modal, NavigationTabs, Pager, QueryState, value } from "../ui";
import { feedbackTypes } from "./feedback";
import "./feedback.css";

const statuses = { new: "Novo", reviewing: "Em análise", planned: "Planejado", done: "Feito" };
type Status = keyof typeof statuses;
const statusKeys = Object.keys(statuses) as Status[];

type Summary = {
  id: string;
  kind: keyof typeof feedbackTypes;
  status: Status;
  excerpt: string;
  author_name: string;
  created_at: string;
  page_path: string | null;
  has_screenshot: boolean;
};
type Detail = Pick<Summary, "id" | "kind" | "status" | "author_name" | "created_at" | "page_path"> & {
  body: string;
  browser_family: string | null;
  screenshot_id: string | null;
  revision: number;
};

function FeedbackDetail({ id, onChange }: { id: string; onChange: () => void }) {
  const [printOpen, setPrintOpen] = useState(false);
  const [choice, setChoice] = useState<{ revision: number; status: Status }>();
  const args = { p_id: id };
  const detailKey = ["app_admin_feedback", args] as const;
  const query = useRpc<Detail>("app_admin_feedback", args);
  const item = query.data;
  const selected = choice?.revision === item?.revision ? choice?.status : item?.status;
  return (
    <QueryState query={query}>
      {item && <div className="feedback-detail">
        <div className="feedback-card-top">
          <span className="feedback-type" data-kind={item.kind}>{feedbackTypes[item.kind]}</span>
          <time dateTime={item.created_at}>{date(item.created_at)}</time>
        </div>
        <p className="feedback-description">{item.body}</p>
        <dl className="feedback-context">
          <div><dt>Autor</dt><dd>{item.author_name || "Membro"}</dd></div>
          {item.page_path && <div><dt>Origem</dt><dd>{item.page_path}</dd></div>}
          {item.browser_family && <div><dt>Navegador</dt><dd>{item.browser_family}</dd></div>}
        </dl>
        {item.screenshot_id && <details className="feedback-print-panel" onToggle={(event) => setPrintOpen(event.currentTarget.open)}>
          <summary>Ver print</summary>
          {printOpen && <PrivateImage kind="feedback-screenshot" id={item.screenshot_id} alt="Print enviado com o feedback" className="feedback-print" />}
        </details>}
        <Form submitInHeading draft={id} label="Salvar situação" submitDisabled={selected === item.status} onSave={async (data) => {
          try {
            const updated = await rpc<Pick<Detail, "status" | "revision">>("app_admin_feedback_status", {
              ...args, p_status: value(data, "status"), p_revision: item.revision,
            });
            await cache.cancelQueries({ queryKey: detailKey, exact: true });
            cache.setQueryData<Detail>(detailKey, (current) => {
              if (current && current.revision > updated.revision) return current;
              return { ...(current ?? item), ...updated };
            });
            if (updated.status !== item.status) onChange();
          } catch (error) {
            const latest = await query.refetch();
            if (latest.data && latest.data.revision !== item.revision) onChange();
            throw error;
          }
        }}>
          <Field label={`Situação atual · ${statuses[item.status]}`}>
            <select name="status" value={selected} onChange={(event) => {
              setChoice({ revision: item.revision, status: event.target.value as Status });
            }}>
              {statusKeys.map((status) => <option key={status} value={status}>{statuses[status]}</option>)}
            </select>
          </Field>
        </Form>
      </div>}
    </QueryState>
  );
}

function FeedbackCard({ item, refresh }: { item: Summary; refresh: () => void }) {
  const [open, setOpen] = useState(false);
  const changed = useRef(false);
  return (
    <Modal formAction contentClass="feedback-detail-panel" title="Detalhe do feedback" description="Consulte o relato e atualize a situação da triagem."
      open={open} onOpenChange={(next) => {
        setOpen(next);
        if (!next && changed.current) { changed.current = false; refresh(); }
      }}
      trigger={<button className="feedback-card" type="button" aria-label={`Ver feedback de ${item.author_name || "membro"}: ${item.excerpt}`}>
        <span className="feedback-card-top">
          <span className="feedback-type" data-kind={item.kind}>{feedbackTypes[item.kind]}</span>
          <time dateTime={item.created_at}>{date(item.created_at)}</time>
        </span>
        <strong className="feedback-excerpt">{item.excerpt}</strong>
        {item.has_screenshot && <span className="feedback-card-meta"><Image size={14} aria-hidden="true" /> Print anexado</span>}
        <span className="feedback-card-meta">{item.author_name || "Membro"}</span>
        {item.page_path && <span className="feedback-card-meta"><LinkIcon size={14} aria-hidden="true" /> {item.page_path}</span>}
      </button>}>
      {open && <FeedbackDetail id={item.id} onChange={() => { changed.current = true; }} />}
    </Modal>
  );
}

export function AdminFeedbacks() {
  const [page, setPage] = useState(1);
  const [kind, setKind] = useState("");
  const [status, setStatus] = useState("");
  const filters = useRef<HTMLDivElement>(null);
  const query = useRpc<Page<Summary> & { counts: Partial<Record<Status, number>> }>("app_admin_feedbacks", {
    p_kind: kind || null, p_status: status || null, p_page: page,
  });
  const result = query.data;
  function refresh() {
    void cache.invalidateQueries({ queryKey: ["app_admin_feedbacks"] }).then(() => {
      requestAnimationFrame(() => {
        if (document.activeElement === document.body) filters.current?.querySelector("select")?.focus();
      });
    });
  }
  return (
    <AdminSurface section="feedbacks" trail={["Administração", "Feedbacks"]}
      title="Feedbacks dos alunos" description="Acompanhe sugestões e problemas enviados pela área do aluno.">
      {result && <dl className="admin-metrics" aria-label="Feedbacks por situação">
        {statusKeys.map((key) => <div key={key}><dt>{statuses[key]}</dt><dd><strong>{result.counts[key] ?? 0}</strong></dd></div>)}
      </dl>}
      <div className="admin-filters" ref={filters} data-tour="admin-feedbacks">
        <div className="admin-list-filters">
          <Field label="Tipo">
            <select value={kind} onChange={(event) => { setKind(event.target.value); setPage(1); }}>
              <option value="">Todos os tipos</option>
              {Object.entries(feedbackTypes).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </Field>
        </div>
        <NavigationTabs label="Situação dos feedbacks" selected={status}
          items={["", ...statusKeys].map((key) => ({
            id: key, label: key ? `${statuses[key as Status]} (${result?.counts[key as Status] ?? 0})` : "Todos",
            onClick: () => { setStatus(key); setPage(1); },
          }))} />
      </div>
      <QueryState query={query}>
        {result && <>
          {result.total === 0 ? <Empty>Nenhum feedback para os filtros escolhidos.</Empty> : (
            <div className="feedback-board" data-filtered={!!status}>
              {statusKeys.filter((key) => !status || key === status).map((key) => (
                <section className="feedback-column" key={key} aria-labelledby={`feedback-column-${key}`}>
                  <header><h2 id={`feedback-column-${key}`}>{statuses[key]}</h2><span>{result.counts[key] ?? 0}</span></header>
                  {result.items.filter((item) => item.status === key).map((item) => <FeedbackCard key={item.id} item={item} refresh={refresh} />)}
                </section>
              ))}
            </div>
          )}
          {(page > 1 || result.total > 20) && <Pager page={page} total={result.total} onChange={setPage} />}
        </>}
      </QueryState>
    </AdminSurface>
  );
}
