import { useState } from "react";
import { ArrowRight, AudioLines, CalendarDays, CreditCard, Headset, MessagesSquare, Repeat2, TrendingUp, Users, Wallet } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { date, money, rpc } from "../api";
import { Empty, Heading, QueryState } from "../ui";
import "./admin-analytics.css";

const periods = [
  ["30d", "Últimos 30 dias"],
  ["90d", "Últimos 90 dias"],
  ["year", "Ano atual"],
] as const;

type Acquisition = {
  starts_on: string;
  ends_before: string;
  new_members: number;
  first_activations: number;
};
type Dashboard = {
  from_day: string;
  through_day: string;
  observed_at: string;
  new_members: number;
  first_activations: number;
  revenue_cents: number;
  mrr_cents: number;
  renewals_due: number;
  completions: number;
  completing_members_7d: number;
  completing_members_30d: number;
  posts: number;
  pending_posts: number;
  new_tickets: number;
  open_tickets: number;
  answered_tickets: number;
  first_response_seconds: number | null;
  acquisition: Acquisition[];
  payments: { method: "PIX" | "CREDIT_CARD"; orders: number; amount_cents: number }[];
};

const numbers = new Intl.NumberFormat("pt-BR");
const wholeReais = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const kpiMoney = (cents: number) => cents % 100 === 0 ? wholeReais.format(cents / 100) : money(cents);
const shortDate = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
const calendarDate = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "UTC" });
const civilDate = (value: string, format = shortDate) => format.format(new Date(value));
const dayBefore = (value: string) => shortDate.format(new Date(Date.parse(value) - 86_400_000));
const elapsed = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  if (minutes === 0) return `${seconds} s`;
  if (minutes < 60) return `${numbers.format(minutes)} min`;
  return `${numbers.format(Math.floor(minutes / 60))} h ${minutes % 60} min`;
};

function AcquisitionChart({ data }: { data: Dashboard }) {
  const max = Math.max(0, ...data.acquisition.map((point) => Math.max(point.new_members, point.first_activations)));
  const series = (["new_members", "first_activations"] as const).map((key) => ({
    key,
    points: data.acquisition.map((point, index) => ({
      x: data.acquisition.length === 1 ? 200 : 12 + index * 376 / (data.acquisition.length - 1),
      y: 140 - 128 * point[key] / Math.max(max, 1),
    })),
  }));
  return (
    <section className="reports-panel" id="dashboard-aquisicao">
      <h2>Membros novos e ativações pagas</h2>
      <p><strong>{numbers.format(data.new_members)}</strong> novos membros · <strong>{numbers.format(data.first_activations)}</strong> primeiras ativações</p>
      {max > 0 ? <>
        <div className="reports-legend">
          <span>Novos membros</span><span>Primeiras ativações</span>
        </div>
        <div className="reports-plot" aria-hidden="true">
          <div className="reports-scale"><span>{numbers.format(max)}</span><span>0</span></div>
          <svg viewBox="0 0 400 152" preserveAspectRatio="none">
            {series.map(({ key, points }) => <g key={key}>
              <polyline points={points.map(({ x, y }) => `${x},${y}`).join(" ")} />
              {points.map(({ x, y }) => <circle key={x} cx={x} cy={y} r="2.5" />)}
            </g>)}
          </svg>
        </div>
        <div className="reports-axis" aria-hidden="true"><span>{civilDate(data.from_day)}</span><span>{civilDate(data.through_day)}</span></div>
        <details>
          <summary>Ver dados do gráfico</summary>
          <table className="reports-table">
            <thead><tr><th scope="col">Faixa</th><th scope="col">Novos membros</th><th scope="col">Primeiras ativações</th></tr></thead>
            <tbody>{data.acquisition.map((point) => <tr key={point.starts_on}>
              <th scope="row">{civilDate(point.starts_on)} a {dayBefore(point.ends_before)}</th>
              <td>{numbers.format(point.new_members)}</td><td>{numbers.format(point.first_activations)}</td>
            </tr>)}</tbody>
          </table>
        </details>
      </> : <Empty>Nenhum cadastro de membro ou primeira ativação no período.</Empty>}
      <small>Primeiro acesso pago que chegou a vigorar, por membro. O plano no momento do cadastro ainda não tem histórico.</small>
    </section>
  );
}

export function AdminDashboard({ analyticsPath }: { analyticsPath: string }) {
  const [period, setPeriod] = useState<(typeof periods)[number][0]>("30d");
  const args = { p_period: period };
  const query = useQuery({
    queryKey: ["app_admin_dashboard", args],
    queryFn: () => rpc<Dashboard>("app_admin_dashboard", args),
    staleTime: 0,
    gcTime: 0,
  });
  const data = query.data;

  return (
    <div className="admin-reports admin-dashboard">
      <Heading title="Dashboard Executivo & Métricas" action={
        <div className="reports-periods" role="group" aria-label="Período do dashboard" id="dashboard-periodo" data-tour="dashboard-periodo">
          {periods.map(([value, label]) => <button type="button" key={value} aria-pressed={period === value}
            onClick={() => setPeriod(value)}>{label}</button>)}
        </div>
      }>Receita, aprendizagem, comunidade e atendimento em uma visão consolidada.</Heading>
      <QueryState query={query}>
        {data && <>
          <p className="reports-date" role="status" title={`Consulta em ${date(data.observed_at)} (Brasília)`}>
            <CalendarDays size={16} aria-hidden="true" />
            {civilDate(data.from_day, calendarDate)} a {civilDate(data.through_day, calendarDate)} · Horário de Brasília
          </p>
          <dl className="reports-kpis" id="dashboard-indicadores">
            <div><dt>MRR equivalente <Wallet aria-hidden="true" /></dt><dd className="reports-number reports-currency">{kpiMoney(data.mrr_cents)}</dd><dd className="reports-note">Vigências pagas atuais, valor mensalizado</dd></div>
            <div><dt>Membros ativos <Users aria-hidden="true" /></dt><dd>Sem medição</dd><dd className="reports-note">Atividade geral em 7 e 30 dias</dd></div>
            <div><dt>Community → Pro <TrendingUp aria-hidden="true" /></dt><dd>Sem medição</dd><dd className="reports-note">Histórico de transições de plano indisponível</dd></div>
            <div><dt>Receita de pedidos <CreditCard aria-hidden="true" /></dt><dd className="reports-number reports-currency">{kpiMoney(data.revenue_cents)}</dd><dd className="reports-note">Pagos no período, com status pago</dd></div>
            <div><dt>Vencimentos em 30 dias <Repeat2 aria-hidden="true" /></dt><dd className="reports-number">{numbers.format(data.renewals_due)}</dd><dd className="reports-note">Membros com acesso pago a vencer</dd></div>
          </dl>
          <div className="reports-overview">
            <AcquisitionChart data={data} />
            <section className="reports-panel" id="dashboard-aprendizagem">
              <h2>Progresso da aprendizagem</h2>
              <p><strong className="reports-large">{numbers.format(data.completions)}</strong> conclusões de aula no período</p>
              <dl className="reports-facts">
                <div><dt>Membros com conclusão em 7 dias</dt><dd>{numbers.format(data.completing_members_7d)}</dd></div>
                <div><dt>Membros com conclusão em 30 dias</dt><dd>{numbers.format(data.completing_members_30d)}</dd></div>
              </dl>
              <Link className="button reports-link" to={analyticsPath}>Analisar cursos <ArrowRight size={18} aria-hidden="true" /></Link>
            </section>
          </div>
          <div className="reports-operations" id="dashboard-operacao">
            <section className="reports-panel">
              <h2><Headset aria-hidden="true" /> Suporte ao aluno</h2>
              <dl className="reports-facts">
                <div><dt>Chamados abertos agora</dt><dd>{numbers.format(data.open_tickets)}</dd></div>
                <div><dt>Chamados criados no período</dt><dd>{numbers.format(data.new_tickets)}</dd></div>
                <div><dt>Média da primeira resposta</dt><dd>{data.first_response_seconds === null ? "Sem respostas" : elapsed(data.first_response_seconds)}</dd></div>
              </dl>
              <small>{numbers.format(data.answered_tickets)} chamados respondidos entre os criados no período.</small>
            </section>
            <section className="reports-panel">
              <h2><MessagesSquare aria-hidden="true" /> Comunidade</h2>
              <dl className="reports-facts">
                <div><dt>Posts criados no período</dt><dd>{numbers.format(data.posts)}</dd></div>
                <div><dt>Posts pendentes agora</dt><dd>{numbers.format(data.pending_posts)}</dd></div>
              </dl>
            </section>
            <section className="reports-panel">
              <h2><AudioLines aria-hidden="true" /> Telemetria de vídeo</h2>
              <p>Retenção por trecho e desempenho da entrega de vídeo ainda não têm medição disponível.</p>
            </section>
          </div>
          <section className="reports-panel" id="dashboard-pagamentos">
            <h2>Pagamentos por método</h2>
            <p>Pedidos do período com status pago na consulta.</p>
            {data.payments.length === 0 ? <Empty>Nenhum pedido pago no período.</Empty> :
              <table className="reports-table reports-payments">
                <thead><tr><th scope="col">Método</th><th scope="col">Pedidos</th><th scope="col">Valor</th></tr></thead>
                <tbody>{data.payments.map((item) => <tr key={item.method}>
                  <th scope="row">{item.method === "PIX" ? "Pix" : "Cartão de crédito"}</th>
                  <td>{numbers.format(item.orders)}</td><td>{money(item.amount_cents)}</td>
                </tr>)}</tbody>
              </table>}
          </section>
        </>}
      </QueryState>
    </div>
  );
}
