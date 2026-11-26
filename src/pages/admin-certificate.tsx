import { useState } from "react";
import { Award } from "lucide-react";
import { Link } from "react-router-dom";
import { cache, rpc, useRpc } from "../api";
import { BrandImage, brandAssetUrl } from "../brand";
import { AssetCard } from "./admin-brand";
import { Field, Form, Notice, QueryState, value } from "../ui";

type CertificateDefaults = { signer_name: string; signer_title: string; signature_path: string | null };
type CertificateCourse = { id: string; certificate_enabled?: unknown; signer_name?: unknown; signer_title?: unknown; signature_path?: unknown };

const defaultsRpc = "app_admin_certificate_defaults";
const useDefaults = () => useRpc<CertificateDefaults>(defaultsRpc);
const refreshDefaults = () => cache.invalidateQueries({ queryKey: [defaultsRpc] });
const signerFields = (name = "", title = "") => (
  <>
    <Field label="Nome do responsável">
      <input name="signer_name" defaultValue={name} maxLength={160} />
    </Field>
    <Field label="Cargo do responsável">
      <input name="signer_title" defaultValue={title} maxLength={160} />
    </Field>
  </>
);

/** Configurações → Certificado: responsável e assinatura que os cursos usam por padrão. */
export function CertificateDefaultsEditor() {
  const defaults = useDefaults();
  return (
    <QueryState query={defaults}>
      {defaults.data && (
        <section className="settings-panel" data-tour="admin-settings-certificate" aria-labelledby="certificate-defaults-title">
          <header>
            <h2 id="certificate-defaults-title"><Award size={20} aria-hidden="true" /> Responsável e assinatura</h2>
            <p>Os cursos em Usar o modelo global saem com estes dados. A mudança vale para os próximos certificados. Os já emitidos mantêm os dados da emissão.</p>
          </header>
          <Form
            label="Salvar modelo"
            successMessage="Modelo de certificado salvo."
            onSave={async (data) => {
              await rpc("app_admin_save_certificate_defaults", {
                p_signer_name: value(data, "signer_name"),
                p_signer_title: value(data, "signer_title"),
              });
              await refreshDefaults();
            }}
          >
            {signerFields(defaults.data.signer_name, defaults.data.signer_title)}
          </Form>
          <AssetCard variant="signature" saved={brandAssetUrl(defaults.data.signature_path)} onChanged={refreshDefaults} />
        </section>
      )}
    </QueryState>
  );
}

/** Aba Certificado do curso: usa o modelo global (nome e cargo nulos) ou personaliza só este curso. */
export function CourseCertificate({ course, admin, save }: {
  course: CertificateCourse;
  admin: boolean;
  save: (data: Record<string, unknown>) => Promise<unknown>;
}) {
  const defaults = useDefaults(),
    model = defaults.data,
    [custom, setCustom] = useState(course.signer_name != null),
    modelSignature = brandAssetUrl(model?.signature_path);
  return (
    <div className="reading content-panel">
      <Form
        submitInHeading
        label="Salvar configuração do certificado"
        onSave={(data) =>
          save({
            certificate_enabled: data.has("certificate_enabled"),
            signer_name: custom ? value(data, "signer_name") : null,
            signer_title: custom ? value(data, "signer_title") : null,
          })
        }
      >
        <label className="check">
          <input type="checkbox" name="certificate_enabled" defaultChecked={!!course.certificate_enabled} />
          Emitir certificado após as aulas obrigatórias
        </label>
        <fieldset>
          <legend>Responsável e assinatura</legend>
          <label className="check">
            <input type="radio" name="signer_mode" checked={!custom} onChange={() => setCustom(false)} />
            Usar o modelo global
          </label>
          <label className="check">
            <input type="radio" name="signer_mode" checked={custom} onChange={() => setCustom(true)} />
            Personalizar só este curso
          </label>
        </fieldset>
        {custom ? (
          // Personalizar parte do modelo quando o curso ainda não tem responsável próprio.
          signerFields(String(course.signer_name ?? model?.signer_name ?? ""), String(course.signer_title ?? model?.signer_title ?? ""))
        ) : (
          <QueryState query={defaults}>
            {model && (model.signer_name ? (
              <dl>
                <dt>Nome do responsável</dt><dd>{model.signer_name}</dd>
                <dt>Cargo do responsável</dt><dd>{model.signer_title}</dd>
                <dt>Assinatura</dt>
                <dd>{modelSignature
                  ? <div className="brand-logo-stage" data-theme="light"><BrandImage src={modelSignature} alt="Assinatura do modelo" /></div>
                  : "Nenhuma assinatura enviada."}</dd>
              </dl>
            ) : (
              <Notice>O modelo global ainda não tem responsável. Sem ele, o curso não publica com o certificado ligado.</Notice>
            ))}
            {admin
              ? <Link className="button" to="/admin/configuracoes?aba=certificado">Alterar o modelo em Configurações</Link>
              : <p>Um administrador altera o modelo em Configurações, na aba Certificado.</p>}
          </QueryState>
        )}
        <Notice>
          O certificado usa o nome do aluno, o curso e a carga horária do currículo obrigatório. Alterações não reescrevem
          documentos já emitidos. Cadastre dados reais ou identifique expressamente uma demonstração.
        </Notice>
      </Form>
      {custom && (admin ? (
        <AssetCard key={course.id} variant="signature" courseId={course.id}
          saved={brandAssetUrl(course.signature_path)} onChanged={() => cache.invalidateQueries({ queryKey: ["app_admin_list"] })} />
      ) : (
        <Notice>A assinatura do certificado é enviada por um administrador.</Notice>
      ))}
    </div>
  );
}
