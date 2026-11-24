import { useEffect, useId, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Award, BookOpenCheck, Crown, Heart, MessageSquare, Reply, Timer, Trophy, UserRound } from "lucide-react";
import { rpc } from "../api";
import { Empty, Heading, Loading, Notice, Pager } from "../ui";
import { periodArgs, ReportPeriodPicker, type ReportPeriod } from "../report-period";
import "./ranking.css";

const actions = {
  post: { label: "Post aprovado", Icon: MessageSquare },
  reply: { label: "Resposta aprovada", Icon: Reply },
  like: { label: "Curtida recebida em post", Icon: Heart },
  lesson: { label: "Aula concluída", Icon: BookOpenCheck },
  certificate: { label: "Certificado emitido", Icon: Award },
};
type Placement = { position: number; points: number; tied: boolean };
type Entry = Placement & { is_self: boolean };
type OwnPlacement = ({ status: "ranked" } & Placement) | { status: "excluded" | "unranked" };
export type RankingSnapshot = {
  starts_at: string | null;
  ends_at: string | null;
  time_zone: "America/Sao_Paulo";
  prizes: null;
  rules: Record<keyof typeof actions, number>;
  podium: Entry[];
  own: OwnPlacement;
  items: Entry[];
  page: number;
  total: number;
};

const number = new Intl.NumberFormat("pt-BR");
const month = new Intl.DateTimeFormat("pt-BR", {
  month: "long", year: "numeric", timeZone: "America/Sao_Paulo",
});
const civilDate = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Sao_Paulo" });
const pointsLabel = (points: number) => `${number.format(points)} ${points === 1 ? "ponto" : "pontos"}`;

function Countdown({ endsAt, onEnd }: { endsAt: string; onEnd: () => void }) {
  const [now, setNow] = useState(Date.now);
  const end = Date.parse(endsAt);
  const remaining = Math.max(0, Math.ceil((end - now) / 1000));
  const running = remaining > 0;
  useEffect(() => {
    if (!running) {
      onEnd();
      return;
    }
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [endsAt, running, onEnd]);
  const parts = [Math.floor(remaining / 86400), Math.floor(remaining / 3600) % 24,
    Math.floor(remaining / 60) % 60, remaining % 60];
  return (
    <div className="ranking-clock">
      <Timer size={22} aria-hidden="true" />
      <div>
        <span>{running ? "Encerramento em" : "Período encerrado"}</span>
        {running && (
          <>
            <strong aria-hidden="true">{parts.map((n) => String(n).padStart(2, "0")).join(":")}</strong>
            <span>{parts[0]} dias · {parts[1]} horas · {parts[2]} minutos</span>
          </>
        )}
      </div>
    </div>
  );
}

function Podium({ entries }: { entries: Entry[] }) {
  return (
    <section className="ranking-section">
      <h2><Trophy size={20} aria-hidden="true" /> Pódio</h2>
      {entries.length === 0 ? <Empty>Sem colocações individuais no pódio.</Empty> : (
        <ol className="ranking-podium">
          {entries.map(({ position, points, is_self }) => (
            <li className="ranking-card" data-position={position} key={position}>
              <span className="ranking-medal">
                {position === 1 && <Crown size={16} aria-hidden="true" />}
                {position}º lugar
              </span>
              <span className="ranking-avatar" aria-hidden="true">
                <UserRound size={28} />
              </span>
              <h3>{is_self ? "Você" : "Membro"}</h3>
              <strong className="ranking-score">{pointsLabel(points)}</strong>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function OwnStanding({ own, rulesId }: { own: OwnPlacement; rulesId: string }) {
  return (
    <section className="ranking-card ranking-own">
      {own.status === "ranked" && <span className="ranking-place" aria-hidden="true">{own.position}º</span>}
      <div>
        <h2>Sua colocação</h2>
        <p>{own.status === "ranked"
          ? `${own.position}º lugar${own.tied ? " (empate)" : ""} · ${pointsLabel(own.points)}`
          : own.status === "excluded" ? "A equipe fica fora da classificação."
          : "Você está sem colocação neste período."}</p>
      </div>
      <a className="button" href={`#${rulesId}`}>Como pontuar</a>
    </section>
  );
}

export function Ranking({ memberId }: { memberId: string }) {
  const rulesId = `ranking-regras-${useId()}`;
  const listHeading = useRef<HTMLHeadingElement>(null);
  const focusList = useRef(false);
  const [selection, setSelection] = useState<{ period: ReportPeriod; page: number }>({ period: { id: "current" }, page: 1 });
  const { period, page } = selection;
  const query = useQuery({
    queryKey: ["app_ranking", memberId, period, page],
    queryFn: () => rpc<RankingSnapshot>("app_ranking", { ...periodArgs(period), p_page: page }),
  });
  const data = query.data;
  useEffect(() => {
    if (!query.isSuccess || !focusList.current) return;
    focusList.current = false;
    listHeading.current?.focus();
  }, [query.isSuccess, page]);
  const monthly = period.id === "current" || period.id === "previous";
  const monthLabel = monthly && data?.starts_at && month.format(new Date(data.starts_at));
  const title = monthLabel ? `Ranking mensal · ${monthLabel}` : period.id === "overall" ? "Ranking geral" : monthly ? "Ranking mensal" : "Ranking do período";

  return (
    <div className="ranking-page">
      <Heading title={title} action={period.id === "current" && data?.ends_at
        ? <Countdown endsAt={data.ends_at} onEnd={query.refetch} /> : undefined}>Classificação preliminar</Heading>
      <ReportPeriodPicker tour="ranking" value={period} overall onChange={next => {
        focusList.current = false;
        setSelection({ period: next, page: 1 });
      }} />
      {!monthly && data?.starts_at && data.ends_at && <p role="status">
        {civilDate.format(new Date(data.starts_at))} a {civilDate.format(new Date(Date.parse(data.ends_at) - 1))} · Horário de Brasília
      </p>}
      {query.isPending && <Loading />}
      {query.isError && (
        <div>
          <Notice error>Não foi possível carregar o ranking.</Notice>
          <button type="button" onClick={() => void query.refetch()}>Tentar novamente</button>
        </div>
      )}
      {data && !query.isError && (
        <>
          {monthLabel && (
            <section className="ranking-section">
              <h2><Award size={20} aria-hidden="true" /> Premiação de {monthLabel}</h2>
              <div className="ranking-card">Sem premiação configurada para este mês.</div>
            </section>
          )}
          <Podium entries={data.podium} />
          <OwnStanding own={data.own} rulesId={rulesId} />
          <section className="ranking-card ranking-section">
            <h2 id={rulesId} tabIndex={-1}>Regras de pontuação</h2>
            <dl className="ranking-rules">
              {(Object.keys(actions) as (keyof typeof actions)[]).map((key) => {
                const { label, Icon } = actions[key];
                return (
                  <div key={key}>
                    <dt><Icon size={20} aria-hidden="true" />{label}</dt>
                    <dd>+{pointsLabel(data.rules[key])}</dd>
                  </div>
                );
              })}
            </dl>
          </section>
          <section className="ranking-card ranking-section">
            <h2 ref={listHeading} tabIndex={-1}>Lista de classificação</h2>
            {data.items.length > 0 ? (
              <table className="ranking-table">
                <thead><tr><th scope="col">Posição</th><th scope="col">Membro</th><th scope="col">Pontos</th></tr></thead>
                <tbody>
                  {data.items.map(({ position, points, tied, is_self }, index) => (
                    <tr key={index} data-self={is_self || undefined}>
                      <td>{position}º{tied && <small>Empate</small>}</td>
                      <td>{is_self ? "Você" : "Membro"}</td>
                      <td>{number.format(points)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <Empty>{page === 1 ? "Sem colocações adicionais neste período." : "Sem colocações nesta página."}</Empty>}
            {(data.total > 20 || page > 1) && <Pager page={page} total={data.total}
              onChange={(next) => {
                focusList.current = true;
                setSelection({ period, page: next });
              }} />}
          </section>
        </>
      )}
    </div>
  );
}
