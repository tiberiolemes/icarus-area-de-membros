import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, CircleAlert, Copy, Download, Hourglass, Image, ShieldCheck, UserRound } from "lucide-react";
import { Link, useHref, useNavigate, useParams } from "react-router-dom";
import { useRpc, date, rpc } from "../api";
import type { Certificate, Course } from "../api";
import { useAuth } from "../auth";
import { Action, Empty, Field, Form, Heading, Notice, Progress, QueryState, value } from "../ui";
import { PublicFrame } from "./access";
import { RichContent } from "../rich";
import { exportCertificate } from "../certificate";
import { BrandLogo, brandAssetUrl, defaultLogo } from "../brand";
import { readModules } from "../modules";
import { notificationListKey, reconcileNotificationQueries } from "./notifications";
import "./student-resources.css";

const verificationPath = (code: string) => "/verificar/" + encodeURIComponent(code);
const documentPath = (code: string) => "/certificado/" + encodeURIComponent(code);
const certificateCode = /^[a-f0-9]{48}$/i;

function certificateStatus(certificate: Certificate) {
  if (certificate.revoked_at) return "Certificado revogado";
  return certificate.demo ? "Demonstração sem validade" : "Certificado válido";
}

type PublicBrand = { name?: string; logo_light?: string | null; logo_dark?: string | null; modules?: unknown };

function CertificateDocument({ certificate }: { certificate: Certificate }) {
  const brand = useRpc<PublicBrand>("app_public_context").data;
  // Só a assinatura enviada ao bucket de marca: a URL externa de certificados antigos não é carregada na página pública.
  const signature = brandAssetUrl(certificate.signature_path);
  return (
    <article className="certificate-document" data-tour="certificate">
      <header className="certificate-document-header">
        <span className="certificate-brand">
          <BrandLogo light={brandAssetUrl(brand?.logo_light)} dark={brandAssetUrl(brand?.logo_dark)} name={brand?.name || "Icarus"}
            fallback={<img src={defaultLogo} alt="Icarus" width="244" height="64" />} />
        </span>
        <span className="certificate-code">Código de verificação <code>{certificate.code}</code></span>
      </header>
      <div className="certificate-document-body">
        <p>Certificado de conclusão</p>
        <h2>{certificate.student_name}</h2>
        <p>Concluiu o curso</p>
        <h3>{certificate.course_title}</h3>
      </div>
      <dl className="certificate-facts">
        <div><dt>Carga horária</dt><dd>{certificate.duration_minutes} minutos</dd></div>
        <div><dt>Emissão</dt><dd>{date(certificate.issued_at)}</dd></div>
        {certificate.revoked_at && (
          <div><dt>Revogação</dt><dd>{date(certificate.revoked_at)}</dd></div>
        )}
      </dl>
      {certificate.signer_name && (
        <div className="certificate-signer">
          {signature && <img className="certificate-signature" src={signature} alt={`Assinatura de ${certificate.signer_name}`} referrerPolicy="no-referrer" />}
          <strong>{certificate.signer_name}</strong>
          {certificate.signer_title && <span>{certificate.signer_title}</span>}
        </div>
      )}
      {(certificate.demo || certificate.revoked_at) && (
        <p className="certificate-status"><strong>{certificateStatus(certificate)}</strong></p>
      )}
    </article>
  );
}

function CertificateActions({ certificate }: { certificate: Certificate }) {
  const [copied, setCopied] = useState(false);
  const verifyHref = useHref(verificationPath(certificate.code));
  const verificationUrl = new URL(verifyHref, window.location.href).href;
  // O arquivo exportado tem fundo branco: usa a logo colorida ou, sem ela, a do Icarus.
  const brand = useRpc<PublicBrand>("app_public_context").data;
  const exported = { logoUrl: brandAssetUrl(brand?.logo_light), issuer: brand?.name || "Icarus" };
  return (
    <div className="certificate-actions">
      {!certificate.revoked_at && (
        <>
          <Action primary run={() => exportCertificate(certificate, "pdf", verificationUrl, exported)}>
            <Download size={18} aria-hidden="true" /> Baixar PDF
          </Action>
          <Action run={() => exportCertificate(certificate, "png", verificationUrl, exported)}>
            <Image size={18} aria-hidden="true" /> Baixar PNG
          </Action>
        </>
      )}
      <Action run={async () => {
        await navigator.clipboard.writeText(verificationUrl);
        setCopied(true);
      }}>
        <Copy size={18} aria-hidden="true" /> Copiar link de verificação
      </Action>
      {copied && <span role="status">Link copiado.</span>}
    </div>
  );
}

function CertificateRecord({ certificate, publicResult = false }: { certificate: Certificate; publicResult?: boolean }) {
  const issuer = useRpc<PublicBrand>("app_public_context").data?.name || "Icarus";
  return (
    <section className="certificate-panel certificate-record" aria-label="Registro de emissão">
      {publicResult && (
        <div className="certificate-record-holder">
          <span className="resource-icon"><UserRound size={20} aria-hidden="true" /></span>
          <div>
            <h2>Titular do certificado</h2>
            <strong>{certificate.student_name}</strong>
          </div>
        </div>
      )}
      <dl>
        <div><dt>Emitido por</dt><dd dir="auto">{issuer}</dd></div>
        <div><dt>Data de emissão</dt><dd>{date(certificate.issued_at)}</dd></div>
        <div><dt>Carga horária</dt><dd>{certificate.duration_minutes} minutos</dd></div>
      </dl>
      {publicResult && certificate.revoked_at && (
        <Notice>Consulte o responsável pela emissão para saber mais sobre a revogação.</Notice>
      )}
    </section>
  );
}

export function Certificates() {
  const memberId = useAuth().session?.user.id;
  const queryClient = useQueryClient();
  const query = useRpc<{
    items: Certificate[];
    courses: (Course & { can_issue?: boolean; certificate_reason?: string })[];
  }>("app_certificates");
  const counts = query.data && !query.error && {
    issued: query.data.items.length,
    inProgress: query.data.courses.filter((course) => course.progress_percent < 100).length,
  };
  return (
    <div className="student-certificates">
      <Heading title="Certificados e habilitações" action={counts && (
        <div className="certificate-summary">
          <span><strong>{counts.issued}</strong> {counts.issued === 1 ? "certificado emitido" : "certificados emitidos"}</span>
          <span><strong>{counts.inProgress}</strong> em andamento</span>
        </div>
      )}>
        Acompanhe a conclusão dos cursos, baixe seus certificados e compartilhe o link de verificação.
      </Heading>
      <QueryState query={query}>
        {query.data && (
          <div className="resource-sections" data-tour="certificates">
            {query.data.items.length > 0 && (
              <section aria-labelledby="issued-certificates">
                <div className="resource-section-heading">
                  <h2 id="issued-certificates" tabIndex={-1}><BadgeCheck size={18} aria-hidden="true" /> Certificados emitidos</h2>
                </div>
                <div className="resource-sections">
                  {query.data.items.map((certificate) => (
                    <div className="certificate-feature" key={certificate.id}>
                      <div className="certificate-stage"><CertificateDocument certificate={certificate} /></div>
                      <div className="certificate-feature-side">
                        <div className="certificate-panel">
                          <h3>{certificate.revoked_at ? "Verificação pública" : "Opções de exportação"}</h3>
                          <CertificateActions certificate={certificate} />
                          <div className="certificate-panel-links">
                            <Link className="text-action" to={verificationPath(certificate.code)}>Verificar autenticidade</Link>
                            <Link className="text-action" to={documentPath(certificate.code)}>Abrir certificado</Link>
                          </div>
                        </div>
                        <CertificateRecord certificate={certificate} />
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
            {query.data.courses.length > 0 && (
              <section aria-labelledby="certificate-courses">
                <div className="resource-section-heading">
                  <h2 id="certificate-courses"><Hourglass size={18} aria-hidden="true" /> Trilha de habilitação</h2>
                </div>
                <div className="certificate-courses">
                  {query.data.courses.map((course) => {
                    const total = course.required_lessons || course.total_lessons;
                    return (
                      <article className="certificate-panel" key={course.id}>
                        <h3>{course.title}</h3>
                        {course.description && <RichContent content={course.description} />}
                        <Progress value={course.progress_percent} done={course.completed_lessons} total={total} />
                        <div className="certificate-course-actions">
                          {course.can_issue ? (
                            <Action primary run={async () => {
                              const result = await rpc<{ certificate_code: string | null; reason: string }>(
                                "app_issue_certificate", { p_course_id: course.id },
                              );
                              if (!result.certificate_code) throw new Error(result.reason);
                              if (memberId) {
                                void reconcileNotificationQueries(queryClient, { queryKey: notificationListKey(memberId) });
                              }
                              await query.refetch({ throwOnError: true });
                              requestAnimationFrame(() => document.getElementById("issued-certificates")?.focus());
                            }}>
                              Emitir certificado
                            </Action>
                          ) : (
                            <p>{course.certificate_reason ??
                              `Faltam ${Math.max(0, total - course.completed_lessons)} aulas obrigatórias. A emissão depende da conclusão e das regras do curso.`}</p>
                          )}
                          <Link className="text-action" to={"/app/cursos/" + course.slug}>Abrir curso</Link>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            )}
            {query.data.items.length === 0 && query.data.courses.length === 0 && (
              <Empty>Nenhum curso com certificado disponível no momento.</Empty>
            )}
          </div>
        )}
      </QueryState>
      <section className="certificate-portal">
        <div>
          <h2><ShieldCheck size={20} aria-hidden="true" /> Verificação pública</h2>
          <p>Qualquer pessoa com o código pode consultar a situação do certificado sem entrar na plataforma.</p>
        </div>
        <Link className="button" to="/verificar">Verificar certificado</Link>
      </section>
    </div>
  );
}

function CertificateLookup({ onLookup }: { onLookup: (code: string) => Promise<void> }) {
  return (
    <section className="certificate-panel" aria-labelledby="certificate-lookup">
      <h2 id="certificate-lookup">Consultar por código</h2>
      <p>Use o código de verificação que aparece no certificado.</p>
      <Form label="Verificar certificado" successMessage="" onSave={async (data) => {
        const code = value(data, "codigo");
        if (!certificateCode.test(code)) throw new Error("Informe o código de 48 caracteres do certificado.");
        await onLookup(code.toLowerCase());
      }}>
        <Field label="Código de verificação">
          <input name="codigo" required autoComplete="off" autoCapitalize="none" spellCheck={false} />
        </Field>
      </Form>
    </section>
  );
}

export function CertificatePage({ verify = false }: { verify?: boolean }) {
  const modules = readModules(useRpc<PublicBrand>("app_public_context").data?.modules);
  const { codigo } = useParams();
  const navigate = useNavigate();
  const code = codigo?.toLowerCase();
  const validCode = code !== undefined && certificateCode.test(code);
  const args = { p_code: code };
  const query = useQuery({
    queryKey: ["app_certificate", args],
    queryFn: () => rpc<Certificate>("app_certificate", args),
    enabled: validCode,
    networkMode: "always",
    staleTime: 0,
  });
  const rpcError = query.error as (Error & { code?: string }) | null;
  const unavailable = (code !== undefined && !validCode)
    || (rpcError?.code === "P0001" && rpcError.message === "Certificado indisponível.");
  const certificate = !query.isFetching && !query.error ? query.data : undefined;
  const pendingLookup = useRef<string | null>(null);
  const result = useRef<HTMLDivElement>(null);
  const settled = Boolean(certificate || unavailable || query.error);
  useEffect(() => {
    if (code && pendingLookup.current === code && settled && !query.isFetching) {
      pendingLookup.current = null;
      result.current?.focus();
    }
  }, [code, settled, query.isFetching, query.dataUpdatedAt, query.errorUpdatedAt]);

  return (
    <PublicFrame>
      <div className="certificate-public">
        {certificate ? (
          <div ref={result} tabIndex={-1} className="certificate-register">
            <div>
              <h1>{verify ? "Verificação de certificado" : "Certificado de conclusão"}</h1>
              <code>{certificate.code}</code>
            </div>
            <strong role="status" aria-label="Situação do certificado">
              {certificate.revoked_at || certificate.demo ? <CircleAlert size={20} aria-hidden="true" /> : <BadgeCheck size={20} aria-hidden="true" />}
              {certificateStatus(certificate)}
            </strong>
          </div>
        ) : (
          <Heading title={verify ? "Verificação de certificado" : "Certificado de conclusão"} />
        )}
        <div className={code !== undefined ? "certificate-public-grid" : "certificate-public-entry"}>
          {code !== undefined && (
            <div ref={certificate ? undefined : result} tabIndex={certificate ? undefined : -1} className="certificate-public-result">
              {unavailable ? (
                <Notice error><strong>Certificado inválido</strong><p>Certificado indisponível. Confira o código e tente novamente.</p></Notice>
              ) : (
                <QueryState query={{ ...query, isPending: query.isPending || query.isFetching }}>
                  {certificate && (
                    <>
                      <CertificateDocument certificate={certificate} />
                      <CertificateActions key={certificate.code} certificate={certificate} />
                      <Link className="text-action" to={verify ? documentPath(certificate.code) : verificationPath(certificate.code)}>
                        {verify ? "Ver documento" : "Verificar autenticidade"}
                      </Link>
                    </>
                  )}
                </QueryState>
              )}
            </div>
          )}
          <div className="certificate-public-side">
            {certificate && <CertificateRecord certificate={certificate} publicResult />}
            <CertificateLookup onLookup={async (nextCode) => {
              pendingLookup.current = nextCode;
              if (verify && code === nextCode) await query.refetch();
              else navigate(verificationPath(nextCode));
            }} />
            {modules.help && <Link className="text-action" to="/ajuda/certificados">Ajuda sobre certificados</Link>}
            <Link className="text-action" to="/app/certificados">Meus certificados</Link>
          </div>
        </div>
      </div>
    </PublicFrame>
  );
}
