import { AdminSurface } from "./admin-surface";
import { useState } from "react";
import { BookOpenCheck, PlayCircle, Route } from "lucide-react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { rpc } from "../api";
import type { Page } from "../api";
import { Empty, Pager, QueryState } from "../ui";
import "./admin-analytics.css";

type CourseOption = { id: string; title: string };
type LessonMetric = {
  id: string;
  title: string;
  module_title: string;
  duration_seconds: number;
  registered: number;
  completed: number;
};
type CourseAnalytics = {
  started: number;
  module_title: string | null;
  module_completed: number | null;
  course_completed: number | null;
  lessons: Page<LessonMetric>;
};

const count = new Intl.NumberFormat("pt-BR");
const ratio = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 });
const percent = (part: number, total: number) => total > 0 ? ratio.format(part / total) : "—";
const shareOfStarted = (part: number, total: number) => total > 0
  ? `${percent(part, total)} dos que iniciaram` : "Sem base de progresso";
const duration = (seconds: number) => seconds > 0
  ? `${count.format(Math.floor(seconds / 60))} min ${String(seconds % 60).padStart(2, "0")} s`
  : "—";

function CourseReport({ courseId }: { courseId: string }) {
  const [page, setPage] = useState(1);
  const args = { p_course_id: courseId, p_page: page };
  const query = useQuery({
    queryKey: ["app_admin_course_analytics", args],
    queryFn: () => rpc<CourseAnalytics>("app_admin_course_analytics", args),
    placeholderData: keepPreviousData,
    staleTime: 0,
    gcTime: 0,
  });
  const data = query.data;

  return (
    <QueryState query={query}>
      {data && <>
        <dl className="reports-kpis" id="analytics-indicadores">
          <div><dt>Iniciaram o curso <PlayCircle aria-hidden="true" /></dt><dd className="reports-number">{count.format(data.started)}</dd><dd className="reports-note">Com progresso registrado</dd></div>
          {data.module_completed !== null && <div><dt>Concluíram módulo 1 <Route aria-hidden="true" /></dt><dd className="reports-number">{count.format(data.module_completed)}</dd><dd className="reports-note">{shareOfStarted(data.module_completed, data.started)}</dd></div>}
          {data.course_completed !== null && <div><dt>Concluíram o curso <BookOpenCheck aria-hidden="true" /></dt><dd className="reports-number">{count.format(data.course_completed)}</dd><dd className="reports-note">{shareOfStarted(data.course_completed, data.started)}</dd></div>}
        </dl>
        <section className="reports-panel" id="analytics-funil">
          <h2>Jornada curricular</h2>
          <p>Etapas do currículo publicado. A base é o total de membros com progresso registrado no curso.</p>
          {data.started === 0 ? <Empty>Nenhum progresso registrado neste curso.</Empty> :
            <ol className="reports-funnel">
              {([
                ["Iniciaram o curso", data.started],
                [data.module_title ? `Concluíram módulo 1 · ${data.module_title}` : "Concluíram módulo 1", data.module_completed],
                ["Concluíram o curso", data.course_completed],
              ] as const).map(([label, total]) => <li key={label}>
                <span>{label}</span>
                <b>{total === null ? "Sem etapa disponível" : `${count.format(total)} · ${percent(total, data.started)}`}</b>
                {total !== null && <progress aria-hidden="true" max={data.started} value={total} />}
              </li>)}
            </ol>}
          <small>A conclusão de cada etapa exige as respectivas aulas obrigatórias. A conclusão do curso independe da emissão de certificado.</small>
        </section>
        <section className="reports-panel" id="analytics-aulas" aria-busy={query.isFetching}>
          <h2>Diagnóstico por aula</h2>
          <p>Conclusões registradas em relação aos membros com progresso na aula.</p>
          {data.lessons.items.length ? (
            <div className="reports-table-wrap" role="region" tabIndex={0} aria-label="Tabela de progresso por aula">
              <table className="reports-table reports-lesson-table">
                <thead><tr>
                  <th scope="col">Módulo / aula</th><th scope="col">Duração</th>
                  <th scope="col">Com progresso</th><th scope="col">Conclusões</th><th scope="col">Taxa de conclusão</th>
                </tr></thead>
                <tbody>{data.lessons.items.map((lesson) => <tr key={lesson.id}>
                  <th scope="row">{lesson.title}<small>{lesson.module_title}</small></th>
                  <td>{duration(lesson.duration_seconds)}</td>
                  <td>{count.format(lesson.registered)}</td>
                  <td>{count.format(lesson.completed)}</td>
                  <td>{percent(lesson.completed, lesson.registered)}</td>
                </tr>)}</tbody>
              </table>
            </div>
          ) : <Empty>{data.lessons.total ? "Nenhuma aula nesta página." : "Nenhuma aula publicada neste curso."}</Empty>}
          {data.lessons.total > data.lessons.page_size || data.lessons.page > 1
            ? <Pager label="Paginação de aulas" page={data.lessons.page} total={data.lessons.total} onChange={setPage} /> : null}
        </section>
      </>}
    </QueryState>
  );
}

export function AdminAnalytics({ dashboardPath }: { dashboardPath: string }) {
  const [coursePage, setCoursePage] = useState(1);
  const [courseId, setCourseId] = useState("");
  const args = { p_page: coursePage };
  const query = useQuery({
    queryKey: ["app_admin_analytics_courses", args],
    queryFn: () => rpc<Page<CourseOption>>("app_admin_analytics_courses", args),
    placeholderData: keepPreviousData,
    staleTime: 0,
    gcTime: 0,
  });
  const active = query.data?.items.find((course) => course.id === courseId) ?? query.data?.items[0];

  return (
    <AdminSurface className="admin-reports admin-analytics" section="analytics"
      trail={["Administração", { label: "Dashboard", to: dashboardPath }, "Analytics"]}
      title="Analytics de aprendizagem" description="Acompanhe o progresso pelo currículo publicado e as conclusões registradas.">
      <QueryState query={query}>
        <div className="reports-filters" id="analytics-curso" data-tour="analytics-curso" aria-busy={query.isFetching}>
          <label>
            <span>Curso selecionado</span>
            <span className="reports-select">
              <select value={active?.id ?? ""} disabled={!active} onChange={(event) => setCourseId(event.target.value)}>
                {!active && <option value="">Nenhum curso disponível</option>}
                {query.data?.items.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}
              </select>
            </span>
          </label>
          <div><span>Janela de observação</span><strong>Histórico disponível</strong></div>
          <div><span>Base analisada</span><strong>Membros com progresso</strong></div>
          {query.data && (query.data.total > query.data.page_size || query.data.page > 1)
            ? <Pager label="Paginação de cursos" page={query.data.page} total={query.data.total} onChange={setCoursePage} /> : null}
        </div>
        {active ? <CourseReport key={active.id} courseId={active.id} /> :
          <Empty>{coursePage === 1 ? "Publique um curso para acompanhar o progresso." : "Nenhum curso publicado nesta página."}</Empty>}
      </QueryState>
    </AdminSurface>
  );
}
