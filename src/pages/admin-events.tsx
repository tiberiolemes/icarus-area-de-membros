import { AdminSurface } from "./admin-surface";
import { useState } from "react";
import { CalendarDays, Plus } from "lucide-react";
import { cache, date, rpc, useRpc } from "../api";
import { Empty, Field, Form, Modal, Notice, Pager, QueryState, value } from "../ui";
import "./events.css";

type PlanChoice = { id: string; name: string };
type AdminEvent = {
  id: string;
  revision: number;
  title: string;
  guest: string;
  description: string;
  starts_at: string;
  duration_minutes: number;
  meeting_url: string;
  recording_url: string | null;
  access_mode: "plans" | "members" | "subscribers";
  plan_ids: string[];
  status: "draft" | "published" | "archived";
};
type RSVP = { id: string; full_name: string; created_at: string };
const statusLabels = { draft: "Rascunho", published: "Publicado", archived: "Arquivado" };

const localTime = new Intl.DateTimeFormat("sv-SE", {
  dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo", hourCycle: "h23",
});

function EventEditor({ event, plans, refresh }: {
  event?: AdminEvent;
  plans: PlanChoice[];
  refresh: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Modal formAction title={event ? "Editar encontro" : "Novo encontro"}
      description="Agende a sessão, defina os planos com acesso e informe os links."
      trigger={<button className={event ? undefined : "primary"}>{event ? "Editar" : <><Plus size={18} aria-hidden="true" /> Novo encontro</>}</button>}
      open={open} onOpenChange={setOpen}>
      <EventForm event={event} plans={plans} onDone={() => {
        setOpen(false);
        refresh();
      }} />
    </Modal>
  );
}

function EventForm({ event: current, plans, onDone }: {
  event?: AdminEvent;
  plans: PlanChoice[];
  onDone: () => void;
}) {
  const [event] = useState(current);
  const [id] = useState(() => event?.id ?? crypto.randomUUID());
  const [mode, setMode] = useState<AdminEvent["access_mode"]>(event?.access_mode ?? "plans");
  return (
    <Form submitInHeading label="Salvar encontro" onDone={onDone} onSave={async (data) => {
      const selected = mode === "plans" ? data.getAll("plans") : [];
      if (mode === "plans" && selected.length === 0) throw new Error("Selecione pelo menos um plano com acesso.");
      await rpc("app_admin_save_live_event", {
        p_id: id, p_revision: event?.revision ?? 0, p_title: value(data, "title"),
        p_guest: value(data, "guest"), p_description: value(data, "description"),
        p_starts_at: value(data, "starts_at"), p_duration_minutes: Number(value(data, "duration")),
        p_meeting_url: value(data, "meeting"), p_recording_url: value(data, "recording") || null,
        p_access_mode: mode, p_plan_ids: selected, p_status: value(data, "status"),
      });
    }}>
      <Field label="Título"><input name="title" required maxLength={160} defaultValue={event?.title} /></Field>
      <Field label="Convidado"><input name="guest" required maxLength={160} defaultValue={event?.guest} /></Field>
      <Field label="Descrição"><textarea name="description" maxLength={4000} defaultValue={event?.description} /></Field>
      <Field label="Data e hora (horário de Brasília)">
        <input name="starts_at" type="datetime-local" required defaultValue={event ? localTime.format(new Date(event.starts_at)).replace(" ", "T") : ""} />
      </Field>
      <Field label="Duração em minutos"><input name="duration" type="number" required min={1} max={720} defaultValue={event?.duration_minutes ?? 60} /></Field>
      <Field label="Link da sala" hint="Cole o link de participação do Zoom ou Google Meet.">
        <input name="meeting" type="url" required maxLength={2048} defaultValue={event?.meeting_url} autoComplete="off" />
      </Field>
      <Field label="Link da gravação" hint="O link fica disponível após o fim de um encontro publicado.">
        <input name="recording" type="url" maxLength={2048} defaultValue={event?.recording_url ?? ""} autoComplete="off" />
      </Field>
      <Field label="Quem pode acessar">
        <select name="access" value={mode} onChange={(e) => setMode(e.target.value as AdminEvent["access_mode"])}>
          <option value="plans">Planos selecionados</option>
          <option value="subscribers">Membros com assinatura ativa</option>
          <option value="members">Todos os membros</option>
        </select>
      </Field>
      <fieldset className="event-plan-options" hidden={mode !== "plans"} disabled={mode !== "plans"}>
        <legend>Planos com acesso</legend>
        {plans.map((plan) => (
          <label key={plan.id}>
            <input type="checkbox" name="plans" value={plan.id} defaultChecked={event?.plan_ids.includes(plan.id)} />
            {plan.name}
          </label>
        ))}
        {plans.length === 0 && <Notice>Cadastre um plano ou selecione outro tipo de acesso.</Notice>}
      </fieldset>
      <Field label="Situação">
        <select name="status" defaultValue={event?.status ?? "draft"}>
          {Object.entries(statusLabels).map(([status, label]) => <option key={status} value={status}>{label}</option>)}
        </select>
      </Field>
    </Form>
  );
}

function Confirmations({ id }: { id: string }) {
  const [page, setPage] = useState(1);
  const query = useRpc<{ items: RSVP[]; total: number }>("app_admin_live_event_rsvps", { p_id: id, p_page: page });
  return (
    <QueryState query={query}>
      {query.data && <>
        {query.data.total === 0 ? <Empty>Nenhuma presença confirmada.</Empty> : (
          <ul className="event-rsvps">
            {query.data.items.map((person) => <li key={person.id}>
              <strong>{person.full_name || "Membro sem nome"}</strong>
              <time dateTime={person.created_at}>{date(person.created_at)}</time>
            </li>)}
          </ul>
        )}
        {(query.data.total > 20 || page > 1) && <Pager page={page} total={query.data.total} onChange={setPage} />}
      </>}
    </QueryState>
  );
}

export function AdminEvents() {
  const [page, setPage] = useState(1);
  const [saved, setSaved] = useState(false);
  const query = useRpc<{ items: AdminEvent[]; plans: PlanChoice[]; total: number }>("app_admin_live_events", { p_page: page });
  function refresh() {
    setSaved(true);
    if (page !== 1) setPage(1);
    void cache.invalidateQueries({ queryKey: ["app_admin_live_events"] });
  }

  return (
    <AdminSurface className="live-events event-admin" section="encontros" trail={["Administração", "Encontros ao vivo"]}
      title="Encontros ao vivo" description="Agende sessões, gerencie confirmações e publique gravações."
      action={query.data && <EventEditor plans={query.data.plans} refresh={refresh} />}>
      <div data-tour="admin-live-events" className="settings-panel">
        {saved && <Notice>Encontro salvo.</Notice>}
        <QueryState query={query}>
          {query.data && <>
            {query.data.items.length === 0 && <Empty>Nenhum encontro cadastrado.</Empty>}
            <div className="event-upcoming">
              {query.data.items.map((event) => <article key={event.id} className="event-card event-admin-row">
                <div className="event-content">
                  <div className="event-meta"><CalendarDays size={16} aria-hidden="true" /> <time dateTime={event.starts_at}>{date(event.starts_at)}</time> · {statusLabels[event.status]}</div>
                  <h2>{event.title}</h2>
                  <p>{event.guest} · {event.duration_minutes} min{event.recording_url ? " · Gravação cadastrada" : ""}</p>
                </div>
                <div className="event-admin-actions">
                  <EventEditor event={event} plans={query.data!.plans} refresh={refresh} />
                  <Modal title="Presenças confirmadas" description={event.title} trigger={<button>Ver presenças</button>}>
                    <Confirmations id={event.id} />
                  </Modal>
                </div>
              </article>)}
            </div>
            {(query.data.total > 20 || page > 1) && <Pager page={page} total={query.data.total} onChange={setPage} />}
          </>}
        </QueryState>
      </div>
    </AdminSurface>
  );
}
