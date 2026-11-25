import { useState } from "react";
import { CalendarPlus, ChevronDown, CircleCheck, Clock, ExternalLink, LockKeyhole, Play, UserRound, Video } from "lucide-react";
import { Link } from "react-router-dom";
import { date, downloadBlob, rpc, useRpc } from "../api";
import { Action, Empty, Heading, NavigationTabs, QueryState } from "../ui";
import { useModules } from "../modules";
import "./events.css";

type EventPreview = { id: string; starts_at: string };
type AvailableEvent = EventPreview & {
  can_access: true;
  title: string;
  guest: string;
  description: string;
  duration_minutes: number;
  confirmed: boolean;
  can_rsvp: boolean;
};
type LiveEvent = AvailableEvent | (EventPreview & { can_access: false });
type CalendarEvent = Pick<AvailableEvent, "id" | "title" | "starts_at" | "duration_minutes">;

const calendarDate = (value: string | number) =>
  new Date(value).toISOString().replace(/[-:]|\.\d{3}/g, "");

function eventDates(event: CalendarEvent) {
  return [
    calendarDate(event.starts_at),
    calendarDate(Date.parse(event.starts_at) + event.duration_minutes * 60_000),
  ];
}

function foldCalendarLine(line: string) {
  const encoder = new TextEncoder();
  let bytes = 0;
  let result = "";
  for (const character of line) {
    const size = encoder.encode(character).length;
    if (bytes + size > 75) {
      result += "\r\n ";
      bytes = 1;
    }
    result += character;
    bytes += size;
  }
  return result;
}

export function eventCalendar(event: CalendarEvent, stamp = Date.now()) {
  const [start, end] = eventDates(event);
  const title = event.title.replace(/\\/g, "\\\\").replace(/\r\n|\r|\n/g, "\\n").replace(/[,;]/g, "\\$&");
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Icarus//Encontros//PT-BR",
    "BEGIN:VEVENT", `UID:${event.id}@icarus`, `DTSTAMP:${calendarDate(stamp)}`,
    `DTSTART:${start}`, `DTEND:${end}`, `SUMMARY:${title}`, "END:VEVENT", "END:VCALENDAR", "",
  ].map(foldCalendarLine).join("\r\n");
}

function googleCalendar(event: CalendarEvent) {
  return "https://calendar.google.com/calendar/r/eventedit?" + new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: eventDates(event).join("/"),
    stz: "America/Sao_Paulo",
    etz: "America/Sao_Paulo",
  });
}

async function openEventLink(id: string, recording: boolean) {
  const url = new URL(await rpc<string>("app_live_event_link", { p_id: id, p_recording: recording }));
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("Link indisponível.");
  const link = document.createElement("a");
  link.href = url.href;
  link.rel = "noreferrer";
  link.click();
}

function EventCard({ event, recording, featured, refresh }: {
  event: LiveEvent;
  recording: boolean;
  featured: boolean;
  refresh: () => Promise<unknown>;
}) {
  return (
    <article className={`event-card${featured ? " event-feature" : ""}`}>
      {recording && <div className="event-cover" aria-hidden="true">
        {event.can_access ? <Play size={32} /> : <LockKeyhole size={28} />}
        {event.can_access && <span><Clock size={14} /> {event.duration_minutes} min</span>}
      </div>}
      <div className="event-content">
        <div className="event-meta">
          {featured && <span className="event-badge">{event.can_access && !event.can_rsvp ? "Em andamento" : "Próximo encontro"}</span>}
          <time dateTime={event.starts_at}>{date(event.starts_at)} · horário de Brasília</time>
        </div>
        <h3>{event.can_access ? event.title : recording ? "Gravação restrita" : "Encontro restrito"}</h3>
        {event.can_access ? <>
          {event.description && <p className="event-description">{event.description}</p>}
          <div className="event-facts">
            <span><UserRound size={18} aria-hidden="true" /> {event.guest}</span>
            {!recording && <span><Clock size={18} aria-hidden="true" /> {event.duration_minutes} min</span>}
          </div>
        </> : <p>Disponível para membros com um plano que inclui este conteúdo.</p>}
      </div>
      {!event.can_access ? (
        <div className="event-actions">
          <Link className="button primary" to="/app/configuracoes?aba=assinatura">
            <LockKeyhole size={18} aria-hidden="true" /> Ver planos disponíveis
          </Link>
        </div>
      ) : recording ? (
        <div className="event-actions">
          <Action run={() => openEventLink(event.id, true)}>
            Assistir gravação <Play size={18} aria-hidden="true" />
          </Action>
        </div>
      ) : featured ? (
        <Participation event={event} refresh={refresh} />
      ) : (
        <details className="event-compact">
          <summary>Participar <ChevronDown size={16} aria-hidden="true" /></summary>
          <Participation event={event} refresh={refresh} />
        </details>
      )}
    </article>
  );
}

function Participation({ event, refresh }: { event: AvailableEvent; refresh: () => Promise<unknown> }) {
  return (
    <div className="event-actions">
      <div className="event-participation-heading"><h4>Confirmação</h4><span>Acesso liberado</span></div>
      <p className="event-participation-status" role="status">
        {event.confirmed ? "Presença confirmada." : event.can_rsvp ? "Confirme sua presença antes do início." : "Inscrições encerradas."}
      </p>
      {event.can_rsvp && <Action primary={!event.confirmed} run={async () => {
        await rpc("app_live_event_rsvp", { p_id: event.id, p_confirmed: !event.confirmed });
        await refresh();
      }}>
        <CircleCheck size={18} aria-hidden="true" />
        {event.confirmed ? "Cancelar presença" : "Confirmar presença"}
      </Action>}
      <Action run={() => openEventLink(event.id, false)}>
        <Video size={18} aria-hidden="true" /> Entrar na sala
      </Action>
      {event.can_rsvp && <details className="event-calendar">
        <summary><CalendarPlus size={18} aria-hidden="true" /> Adicionar à agenda <ChevronDown size={16} aria-hidden="true" /></summary>
        <Action run={async () => downloadBlob(new Blob([eventCalendar(event)], { type: "text/calendar;charset=utf-8" }), "encontro-icarus.ics")}>
          Baixar evento (.ics)
        </Action>
        <a className="button" href={googleCalendar(event)} target="_blank" rel="noreferrer">
          <ExternalLink size={18} aria-hidden="true" /> Google Agenda
        </a>
      </details>}
    </div>
  );
}

function EventSection({ recording }: { recording: boolean }) {
  const [page, setPage] = useState(1);
  const query = useRpc<{ items: LiveEvent[]; has_more: boolean }>("app_live_events", { p_recordings: recording, p_page: page });
  const id = recording ? "event-recordings" : "event-agenda";
  return (
    <section className="event-section" aria-labelledby={id}>
      <h2 id={id} className={recording ? undefined : "sr-only"} tabIndex={-1}>
        {recording ? "Gravações anteriores do acervo" : "Agenda de encontros"}
      </h2>
      <QueryState query={query}>
        {query.data && <>
          {query.data.items.length === 0 && <Empty>{recording ? "Nenhuma gravação publicada." : "Nenhum encontro agendado."}</Empty>}
          <div className={recording ? "event-recordings" : "event-upcoming"}>
            {query.data.items.map((event, index) => (
              <EventCard key={event.id} event={event} recording={recording} featured={!recording && page === 1 && index === 0}
                refresh={() => query.refetch({ throwOnError: true })} />
            ))}
          </div>
          {(page > 1 || query.data.has_more) && <nav className="pagination" aria-label={recording ? "Paginação do acervo" : "Paginação da agenda"}>
            <span>Página {page}</span>
            <button disabled={page === 1} onClick={() => setPage(page - 1)}>Anterior</button>
            <button disabled={!query.data.has_more || page === 10000} onClick={() => setPage(page + 1)}>Próxima</button>
          </nav>}
        </>}
      </QueryState>
    </section>
  );
}

export function Events() {
  const modules = useModules();
  const [selected, setSelected] = useState("event-agenda");

  function goTo(id: string) {
    setSelected(id);
    const heading = document.getElementById(id);
    heading?.focus({ preventScroll: true });
    heading?.parentElement?.scrollIntoView?.({ block: "start" });
  }

  return (
    <div className="live-events live-events-page" data-tour="live-events">
      <Heading title="Encontros ao Vivo & Masterminds">
        Acompanhe os encontros mensais com convidados e acesse as gravações disponíveis no seu plano.
      </Heading>
      <NavigationTabs label="Nesta página" selected={selected} items={[
        { id: "event-agenda", label: "Próximos encontros", onClick: () => goTo("event-agenda") },
        { id: "event-recordings", label: "Gravações anteriores", onClick: () => goTo("event-recordings") },
      ]} />
      <EventSection recording={false} />
      <EventSection recording />
      <section className="event-access" aria-labelledby="event-access-title">
        <div>
          <h2 id="event-access-title">Seu acesso aos encontros</h2>
          <p>Consulte sua assinatura para conferir o plano e a validade do acesso.</p>
        </div>
        <div className="event-actions">
          <Link className="button primary" to="/app/configuracoes?aba=assinatura">Consultar assinatura</Link>
          {modules.help && <Link className="button" to="/ajuda/encontros">Ajuda sobre encontros</Link>}
        </div>
      </section>
    </div>
  );
}
