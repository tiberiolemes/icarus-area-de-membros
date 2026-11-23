import { Link, useParams } from "react-router-dom";
import { useRpc, date, rpc } from "../api";
import type { Certificate, Course } from "../api";
import { Action, Empty, Heading, Notice, Progress, QueryState } from "../ui";
import { PublicFrame } from "./access";
import { exportCertificate } from "../certificate";

export function Certificates() {
  const query = useRpc<{
    items: Certificate[];
    courses: (Course & { can_issue?: boolean; certificate_reason?: string })[];
  }>("app_certificates");
  return (
    <>
      <Heading title="Seus certificados">
        Sua trajetória de aprendizado, registrada após a conclusão do curso.
      </Heading>
      <QueryState query={query}>
        {query.data && (
          <div data-tour="certificates">
            {query.data.items.map((certificate) => (
              <article className="resource-row" key={certificate.id}>
                <div>
                  <h2>{certificate.course_title}</h2>
                  <p>
                    {certificate.demo ? "Demonstração · " : ""}
                    {certificate.revoked_at ? "Revogado" : "Emitido"} em{" "}
                    {date(certificate.issued_at)}
                  </p>
                  <p>Código: {certificate.code}</p>
                </div>
                <Link
                  className="button"
                  to={"/certificado/" + certificate.code}
                >
                  Ver certificado
                </Link>
              </article>
            ))}
            {query.data.courses.map((course) => (
              <article className="plan-row" key={course.id}>
                <h2>{course.title}</h2>
                <Progress
                  value={course.progress_percent}
                  done={course.completed_lessons}
                  total={course.required_lessons || course.total_lessons}
                />
                <div className="certificate-course-actions">
                {course.can_issue ? (
                  <Action
                    run={async () => {
                      const result = await rpc<{
                        certificate_code: string | null;
                        reason: string;
                      }>("app_issue_certificate", { p_course_id: course.id });
                      if (!result.certificate_code)
                        throw new Error(result.reason);
                      await query.refetch();
                    }}
                  >
                    Emitir certificado
                  </Action>
                ) : (
                  <p>
                    {course.certificate_reason ??
                      `Faltam ${Math.max(0, (course.required_lessons || course.total_lessons) - course.completed_lessons)} aulas obrigatórias. A emissão depende da conclusão e das regras do curso.`}
                  </p>
                )}
                <Link className="text-action" to={"/app/cursos/" + course.slug}>Abrir curso</Link>
                </div>
              </article>
            ))}
            {!query.data.items.length && !query.data.courses.length && (
              <Empty>Nenhum curso com certificado disponível no momento.</Empty>
            )}
          </div>
        )}
      </QueryState>
    </>
  );
}
export function CertificatePage({ verify = false }: { verify?: boolean }) {
  const { codigo } = useParams(),
    query = useRpc<Certificate>("app_certificate", { p_code: codigo });
  return (
    <PublicFrame>
      <Heading
        title={verify ? "Verifique um certificado" : "Certificado de conclusão"}
      />
      <QueryState query={query}>
        {query.data && (
          <>
            <Notice>
              {query.data.demo
                ? "Documento de demonstração, sem validade acadêmica."
                : query.data.revoked_at
                  ? "Certificado revogado. Consulte a academia para mais informações."
                  : "Certificado válido. A emissão foi confirmada pelo servidor da academia."}
            </Notice>
            <article className="certificate" data-tour="certificate">
              <img
                src="/brand/icarus-horizontal-preto.svg"
                width="244"
                height="64"
                alt="Icarus"
              />
              <h2>{query.data.student_name}</h2>
              <p>Concluiu o curso</p>
              <h3>{query.data.course_title}</h3>
              <p>Carga horária de {query.data.duration_minutes} minutos.</p>
              <p>Emissão: {date(query.data.issued_at)}</p>
              {query.data.signer_name && (
                <p className="signer">
                  <strong>{query.data.signer_name}</strong>
                  <br />
                  {query.data.signer_title}
                </p>
              )}
              <p>
                Código: <strong>{query.data.code}</strong>
              </p>
              {query.data.demo && (
                <strong>DEMONSTRAÇÃO · SEM VALIDADE ACADÊMICA</strong>
              )}
            </article>
            <div className="actions">
              {!query.data.revoked_at && (
                <>
                  <Action run={() => exportCertificate(query.data!, "pdf")}>
                    Baixar PDF
                  </Action>
                  <Action run={() => exportCertificate(query.data!, "png")}>
                    Baixar PNG
                  </Action>
                </>
              )}
              <Link to={(verify ? "/certificado/" : "/verificar/") + codigo}>
                {verify ? "Ver documento" : "Verificar autenticidade"}
              </Link>
              <Link to="/app/certificados">Meus certificados</Link>
            </div>
          </>
        )}
      </QueryState>
    </PublicFrame>
  );
}
