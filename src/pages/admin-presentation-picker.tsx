import { Link } from "react-router-dom";
import { ArrowRight, Presentation } from "lucide-react";
import { Empty, Modal, QueryState } from "../ui";
import { text, useAll, type Row } from "./admin-data";

const byOrder = (a: Row, b: Row) => Number(a.order_index) - Number(b.order_index);

/** A apresentação é de cada aula: o botão da lista de cursos abre a escolha da aula. */
export function PresentationPicker({ course }: { course: Row }) {
  return (
    <Modal
      title="Escolha a aula"
      description={`A apresentação é de cada aula. Escolha a aula de ${text(course, "title")} que você quer editar.`}
      trigger={
        <button type="button">
          <Presentation size={18} aria-hidden="true" />
          Editar apresentação
        </button>
      }
    >
      <CourseLessons course={course} />
    </Modal>
  );
}

/** Só monta com o modal aberto, para a lista de cursos não carregar a estrutura à toa. */
function CourseLessons({ course }: { course: Row }) {
  const modules = useAll("modules"),
    sections = useAll("sections"),
    lessons = useAll("lessons");
  const editor = `/admin/cursos/${encodeURIComponent(course.id)}`;
  const groups = (modules.data ?? [])
    .filter((module) => module.course_id === course.id)
    .sort(byOrder)
    .map((module) => ({
      module,
      lessons: (sections.data ?? [])
        .filter((section) => section.module_id === module.id)
        // A seção automática guarda as aulas postas direto no módulo, que vêm antes das seções, como na estrutura.
        .sort((a, b) => Number(!!b.is_default) - Number(!!a.is_default) || byOrder(a, b))
        .flatMap((section) =>
          (lessons.data ?? [])
            .filter((lesson) => lesson.section_id === section.id && lesson.status !== "archived")
            .sort(byOrder),
        ),
    }))
    .filter((group) => group.lessons.length);
  return (
    <QueryState query={modules}>
      <QueryState query={sections}>
        <QueryState query={lessons}>
          {groups.length ? (
            <div className="presentation-picker">
              {groups.map(({ module, lessons: own }) => (
                <section key={module.id}>
                  <h3>{text(module, "title")}</h3>
                  <ul>
                    {own.map((lesson) => (
                      <li key={lesson.id}>
                        <Link to={`${editor}/aulas/${encodeURIComponent(lesson.id)}/apresentacao`}>
                          {text(lesson, "title")}
                          <ArrowRight size={18} aria-hidden="true" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          ) : (
            <div className="presentation-picker">
              <Empty>Este curso ainda não tem aulas.</Empty>
              <Link className="button" to={`${editor}?aba=estrutura`}>
                Estrutura e aulas
              </Link>
            </div>
          )}
        </QueryState>
      </QueryState>
    </QueryState>
  );
}
