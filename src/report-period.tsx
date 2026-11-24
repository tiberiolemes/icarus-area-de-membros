import { useId, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import "./report-period.css";

const shortcuts = {
  today: "Hoje", yesterday: "Ontem", "7d": "Últimos 7 dias", "14d": "Últimos 14 dias",
  "30d": "Últimos 30 dias", "90d": "Últimos 90 dias", current: "Mês atual", previous: "Mês passado",
  year: "Este ano", last_year: "Ano passado", overall: "Todo o período", custom: "Personalizado",
} as const;
type PeriodId = keyof typeof shortcuts;
export type ReportPeriod = { id: Exclude<PeriodId, "custom"> } | { id: "custom"; from: string; through: string };
export const periodArgs = (value: ReportPeriod) => value.id === "custom"
  ? { p_period: value.id, p_from: value.from, p_through: value.through } : { p_period: value.id };

const civilToday = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" });
const monthName = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
const toDay = (date: Date) => date.toISOString().slice(0, 10);
const dayDate = (day: string) => new Date(day + "T00:00:00Z");
const br = (day: string) => day ? day.split("-").reverse().join("/") : "";
const dayMillis = 86_400_000;
const shiftDay = (day: string, amount: number) => toDay(new Date(+dayDate(day) + amount * dayMillis));
const monthStart = (day: string, offset = 0) => {
  const date = dayDate(day.slice(0, 7) + "-01");
  date.setUTCMonth(date.getUTCMonth() + offset);
  return toDay(date);
};
const dayCount = (from: string, through: string) => Math.round((+dayDate(through) - +dayDate(from)) / dayMillis) + 1;

function presetRange(value: ReportPeriod, today: string): [string, string] {
  switch (value.id) {
    case "custom": return [value.from, value.through];
    case "overall": return ["", ""];
    case "today": return [today, today];
    case "yesterday": return [shiftDay(today, -1), shiftDay(today, -1)];
    case "current": return [monthStart(today), today];
    case "previous": return [monthStart(today, -1), shiftDay(monthStart(today), -1)];
    case "year": return [today.slice(0, 4) + "-01-01", today];
    case "last_year": {
      const year = Number(today.slice(0, 4)) - 1;
      return [year + "-01-01", year + "-12-31"];
    }
    default: return [shiftDay(today, 1 - parseInt(value.id, 10)), today];
  }
}

function parseBr(text: string, today: string) {
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(text)) return "";
  const iso = text.split("/").reverse().join("-");
  const time = dayDate(iso);
  return iso >= "0001-01-01" && iso <= today && Number.isFinite(+time) && toDay(time) === iso ? iso : "";
}
const mask = (text: string) => text.replace(/\D/g, "").slice(0, 8)
  .replace(/^(\d{2})(\d)/, "$1/$2").replace(/^(\d{2}\/\d{2})(\d)/, "$1/$2");

function Month({ start, from, through, today, pick }: {
  start: string; from: string; through: string; today: string; pick: (day: string) => void;
}) {
  const day = dayDate(start);
  const total = Number(shiftDay(monthStart(start, 1), -1).slice(8));
  const last = start.slice(0, 8) + String(total);
  const target = [through, from, today].find(value => value >= start && value <= last) ?? start;
  function moveFocus(event: React.KeyboardEvent<HTMLDivElement>) {
    const current = event.target;
    if (!(current instanceof HTMLButtonElement)) return;
    const iso = current.dataset.day;
    if (!iso) return;
    const weekday = dayDate(iso).getUTCDay();
    const offsets: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7,
      Home: -weekday, End: 6 - weekday };
    const amount = offsets[event.key];
    if (amount === undefined) return;
    event.preventDefault();
    const next = Math.max(1, Math.min(total, Number(iso.slice(8)) + amount));
    const nextDay = start.slice(0, 8) + String(next).padStart(2, "0");
    event.currentTarget.querySelector<HTMLButtonElement>(`button[data-day="${nextDay}"]:not(:disabled)`)?.focus();
  }
  return <div className="period-month" role="group" aria-label={monthName.format(day)}>
    <h3>{monthName.format(day)}</h3>
    <div className="period-days" onKeyDown={moveFocus}>
      {["D", "S", "T", "Q", "Q", "S", "S"].map((label, index) => <small key={index} aria-hidden="true">{label}</small>)}
      {Array.from({ length: day.getUTCDay() }, (_, i) => <span aria-hidden="true" key={"blank" + i} />)}
      {Array.from({ length: total }, (_, index) => {
        const iso = start.slice(0, 8) + String(index + 1).padStart(2, "0");
        return <button type="button" key={iso} data-day={iso} tabIndex={iso === target ? 0 : -1} aria-label={br(iso)} aria-pressed={iso === from || iso === through}
          aria-current={iso === today ? "date" : undefined} disabled={iso > today}
          data-between={Boolean(from && iso > from && iso < through) || undefined}
          onClick={() => pick(iso)}>{index + 1}</button>;
      })}
    </div>
  </div>;
}

function Draft({ value, overall, apply, close }: {
  value: ReportPeriod; overall: boolean; apply: (next: ReportPeriod) => void; close: () => void;
}) {
  const today = civilToday.format(new Date());
  const [start, end] = presetRange(value, today);
  const [kind, setKind] = useState<PeriodId>(value.id);
  const [texts, setTexts] = useState<[string, string]>([br(start), br(end)]);
  const [view, setView] = useState(monthStart(end || today));
  const firstInput = useRef<HTMLInputElement>(null);
  const selected = useRef<HTMLButtonElement>(null);
  const from = parseBr(texts[0], today), through = parseBr(texts[1], today);
  const valid = Boolean(from && through && from <= through);
  const days = valid ? dayCount(from, through) : 0;
  const instructions = useId();
  function pick(day: string) {
    setKind("custom");
    if (from && !through) {
      const [first, last] = day < from ? [day, from] : [from, day];
      setTexts([br(first), br(last)]);
    } else setTexts([br(day), ""]);
  }
  function typeDate(index: number, text: string) {
    setKind("custom");
    const formatted = mask(text);
    setTexts(index === 0 ? [formatted, texts[1]] : [texts[0], formatted]);
    const day = parseBr(formatted, today);
    if (day) setView(monthStart(day));
  }
  const invalidDate = texts.some(text => text.length === 10 && !parseBr(text, today));
  let summary = "Escolha o início e o fim do período.";
  if (kind === "overall") summary = "Todo o período";
  else if (invalidDate) summary = "Informe uma data válida até hoje.";
  else if (from && through && from > through) summary = "A data final deve ser igual ou posterior à inicial.";
  else if (valid) summary = br(from) + " a " + br(through) + " · " + days + (days === 1 ? " dia" : " dias");
  else if (from) summary = "Escolha a data final.";

  return <Dialog.Content className="period-dialog" aria-describedby={instructions}
    onOpenAutoFocus={event => { if (selected.current) { event.preventDefault(); selected.current.focus(); } }}>
    <Dialog.Title>Selecionar período</Dialog.Title>
    <p className="sr-only" id={instructions}>Selecione um atalho ou informe as datas e escolha Aplicar. Horário de Brasília.</p>
    <div className="period-body">
      <div className="period-shortcuts" role="group" aria-label="Atalhos de período">
        {(Object.keys(shortcuts) as PeriodId[]).filter(id => overall || id !== "overall").map(id =>
          <button type="button" key={id} ref={id === value.id ? selected : undefined} aria-pressed={kind === id}
            onClick={() => {
              if (id === "custom") { setKind(id); firstInput.current?.focus(); }
              else apply({ id });
            }}>{shortcuts[id]}</button>)}
      </div>
      <div className="period-scroll">
        <div className="period-nav">
          <button type="button" aria-label="Ir ao mês anterior" disabled={view <= "0001-01-01"} onClick={() => setView(monthStart(view, -1))}><ChevronLeft /></button>
          <button type="button" aria-label="Ir ao próximo mês" disabled={view >= monthStart(today)} onClick={() => setView(monthStart(view, 1))}><ChevronRight /></button>
        </div>
        <div className="period-months">
          {view > "0001-01-01" && <div className="period-extra-month"><Month start={monthStart(view, -1)} {...{ from, through, today, pick }} /></div>}
          <Month start={view} {...{ from, through, today, pick }} />
        </div>
        <div className="period-inputs">
          {["Data inicial", "Data final"].map((label, index) => <label key={label}>{label}
            <input ref={index === 0 ? firstInput : undefined} value={texts[index]} placeholder="dd/mm/aaaa"
              inputMode="numeric" autoComplete="off" onChange={e => typeDate(index, e.currentTarget.value)} />
          </label>)}
        </div>
      </div>
    </div>
    <footer><span role="status">{summary}</span><div>
      <button type="button" onClick={close}>Cancelar</button>
      <button type="button" className="primary" disabled={!valid && kind !== "overall"}
        onClick={() => apply(kind === "custom" ? { id: "custom", from, through } : { id: kind })}>Aplicar</button>
    </div></footer>
  </Dialog.Content>;
}

export function ReportPeriodPicker({ value, onChange, overall = false, tour }: {
  value: ReportPeriod; onChange: (next: ReportPeriod) => void; overall?: boolean; tour: string;
}) {
  const [open, setOpen] = useState(false);
  const label = value.id === "custom" ? br(value.from) + " a " + br(value.through) : shortcuts[value.id];
  return <Dialog.Root open={open} onOpenChange={setOpen}>
    <Dialog.Trigger data-tour={tour} className="period-trigger" aria-label={"Período: " + label}>
      <CalendarDays size={18} aria-hidden="true" />{label}
    </Dialog.Trigger>
    <Dialog.Portal><Dialog.Overlay className="overlay" />
      <Draft {...{ value, overall }} close={() => setOpen(false)} apply={next => { onChange(next); setOpen(false); }} />
    </Dialog.Portal>
  </Dialog.Root>;
}
