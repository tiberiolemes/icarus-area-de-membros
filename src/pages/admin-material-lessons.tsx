import { useState } from "react";
import { Empty, Field, QueryState } from "../ui";
import { text, useAll, type Row } from "./admin-data";
import "./admin-material-lessons.css";

const byOrder = (a: Row, b: Row) => Number(a.order_index) - Number(b.order_index) || a.id.localeCompare(b.id);
const searchable = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("pt-BR");
const selection = (count: number) => `${count} ${count === 1 ? "aula selecionada" : "aulas selecionadas"}`;

/** Aulas do material por curso e módulo. A seção não aparece: a automática é invisível para a equipe. */
export function LessonLinks({ selected }: { selected: string[] }) {
  const queries = [useAll("courses"), useAll("modules"), useAll("sections"), useAll("lessons")];
  const [courses, modules, sections, lessons] = queries.map((query) => query.data ?? []);
  const [filter, setFilter] = useState(""), [count, setCount] = useState(selected.length);
  const term = searchable(filter.trim());
  const groups = [...courses].sort(byOrder).map((course) => ({
    course,
    modules: modules.filter((module) => module.course_id === course.id).sort(byOrder).map((module) => ({
      module,
      lessons: sections.filter((section) => section.module_id === module.id).sort(byOrder).flatMap((section) =>
        lessons.filter((lesson) => lesson.section_id === section.id && (lesson.status !== "archived" || selected.includes(lesson.id))).sort(byOrder)),
    })).filter((group) => group.lessons.length),
  })).filter((group) => group.modules.length);
  const shown = new Set(groups.flatMap((group) => group.modules.flatMap((module) => module.lessons.map((lesson) => lesson.id))));
  // A aula aparece quando o filtro bate no título dela, do módulo ou do curso.
  const visible = new Set(groups.flatMap(({ course, modules }) => modules.flatMap(({ module, lessons }) =>
    lessons.filter((lesson) => !term || [course, module, lesson].some((row) => searchable(text(row, "title")).includes(term)))
      .map((lesson) => lesson.id))));
  const anyVisible = (rows: Row[]) => rows.some((lesson) => visible.has(lesson.id));
  return (
    <fieldset
      className="lesson-links"
      onInput={(event) => setCount([...event.currentTarget.querySelectorAll<HTMLInputElement>('input[name="lesson_ids"]')]
        .filter((input) => input.checked || input.type === "hidden").length)}
    >
      <legend>Aulas vinculadas</legend>
      <Field label="Filtrar aulas">
        <input
          type="search"
          data-no-draft
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          // O filtro não é dado do material: não marca alteração nem envia o formulário com Enter.
          onInput={(event) => event.stopPropagation()}
          onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }}
        />
      </Field>
      <p className="lesson-links-count" aria-live="polite">{selection(count)}</p>
      {/* Vínculo sem caixa na tela (lista carregando ou com erro) segue no envio, para salvar não apagar o que não se vê. */}
      {selected.filter((id) => !shown.has(id)).map((id) => <input key={id} type="hidden" name="lesson_ids" value={id} />)}
      <QueryState query={{
        isPending: queries.some((query) => query.isPending),
        error: queries.find((query) => query.error)?.error ?? null,
        refetch: () => queries.forEach((query) => query.refetch()),
      }}>
        {groups.length ? (
          <div className="lesson-links-list">
            {groups.map(({ course, modules }) => (
              <fieldset key={course.id} hidden={!modules.some(({ lessons }) => anyVisible(lessons))}>
                <legend>{text(course, "title")}</legend>
                {modules.map(({ module, lessons }) => (
                  <fieldset key={module.id} hidden={!anyVisible(lessons)}>
                    <legend>{text(module, "title")}</legend>
                    {lessons.map((lesson) => (
                      <label className="check" key={lesson.id} hidden={!visible.has(lesson.id)}>
                        <input type="checkbox" name="lesson_ids" value={lesson.id} defaultChecked={selected.includes(lesson.id)} />
                        {text(lesson, "title")}
                        {lesson.status === "archived" && <> <span className="badge">Arquivado</span></>}
                      </label>
                    ))}
                  </fieldset>
                ))}
              </fieldset>
            ))}
            {!visible.size && <p role="status">Nenhuma aula encontrada.</p>}
          </div>
        ) : <Empty>Nenhuma aula cadastrada.</Empty>}
      </QueryState>
    </fieldset>
  );
}
