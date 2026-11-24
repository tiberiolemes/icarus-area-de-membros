import { useRef, useState } from "react";
import { FileText, Globe, Palette } from "lucide-react";
import { Link } from "react-router-dom";
import { cache, client, rpc } from "../api";
import { useAuth, useBootstrap } from "../auth";
import { Field, Form, Notice, QueryState } from "../ui";
import "./admin-brand.css";

type NameDraft = { name: string; revision: number | null };
type NameSave = { name: string; revision: number; saved: boolean };

const trimmedName = (name: string) => name.replace(/^\p{Zs}+|\p{Zs}+$/gu, "");
const visibleName = /[^\p{Zs}\p{Default_Ignorable_Code_Point}\u2800]/u;
const invalidName = /[\u0000-\u001F\u007F-\u009F\u061C\u200E-\u200F\u2028-\u202E\u2066-\u2069\uD800-\uDFFF]/u;

export function AdminBrand() {
  const bootstrap = useBootstrap();
  const { session } = useAuth();
  const name = bootstrap.data?.settings.name;
  const revision = bootstrap.data?.settings.name_revision;
  return (
    <QueryState query={bootstrap}>
      {bootstrap.data && session && (typeof name === "string" && typeof revision === "number" ? (
        <BrandEditor key={session.access_token} actorId={session.user.id} token={session.access_token} name={name} revision={revision} />
      ) : <Notice error>A edição da marca está indisponível nesta versão da instalação.</Notice>)}
    </QueryState>
  );
}

function BrandEditor({ actorId, token, name, revision }: { actorId: string; token: string; name: string; revision: number }) {
  const draftKey = `icarus:draft:${actorId}:installation-name`;
  const [draft, setDraft] = useState<NameDraft | null>(() => {
    try {
      const stored = JSON.parse(sessionStorage.getItem(draftKey) ?? "null");
      if (typeof stored?.name !== "string") return null;
      return { name: stored.name, revision: Number.isInteger(stored.revision) ? stored.revision : null };
    } catch {
      return null;
    }
  });
  const [formVersion, setFormVersion] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  function restoreFocus() {
    requestAnimationFrame(() => {
      if (document.activeElement === document.body) input.current?.focus();
    });
  }

  function preserve(next: NameDraft | null) {
    setDraft(next);
    try {
      if (next) sessionStorage.setItem(draftKey, JSON.stringify(next));
      else sessionStorage.removeItem(draftKey);
    } catch {
      /* The editor continues to hold the draft when browser storage is unavailable. */
    }
  }

  return (
    <>
      <section className="settings-panel brand-domain" aria-labelledby="brand-domain-title">
        <header>
          <h2 id="brand-domain-title"><Globe size={20} aria-hidden="true" /> Domínio da plataforma</h2>
          <p>O endereço público, o DNS e o certificado HTTPS são configurados na implantação.</p>
        </header>
      </section>
      <div className="brand-workspace" data-tour="admin-settings-brand">
        <div className="brand-column">
          <section className="settings-panel" aria-labelledby="brand-identity-title">
            <header>
              <h2 id="brand-identity-title"><Palette size={20} aria-hidden="true" /> Identidade da plataforma</h2>
              {draft && <p>Nome publicado <strong dir="auto">{name}</strong></p>}
            </header>
            <Form
              key={formVersion}
              label="Salvar nome"
              successMessage="Nome da instalação salvo."
              onDone={restoreFocus}
              secondaryAction={draft && (
                <button type="button" onClick={() => {
                  preserve(null);
                  setFormVersion(formVersion + 1);
                  restoreFocus();
                }}>Descartar rascunho</button>
              )}
              onSave={async (data, form) => {
                const proposed = trimmedName(String(data.get("installation_name") ?? ""));
                if (!visibleName.test(proposed) || invalidName.test(proposed) || Array.from(proposed).length > 80) {
                  throw new Error("Informe um nome de instalação visível, com até 80 caracteres e sem controles de formatação.");
                }
                const bootstrapFilter = { queryKey: ["bootstrap", actorId], exact: true };
                const bootstrap = cache.getQueryCache();
                const original = bootstrap.find(bootstrapFilter);
                const result = await rpc<NameSave>("app_admin_save_installation_name", {
                  p_name: proposed,
                  p_expected_revision: draft ? draft.revision : revision,
                });
                // Read back with the active session because this response may belong to a previous one.
                void cache.invalidateQueries({ queryKey: ["app_public_context"] });
                await cache.invalidateQueries({ queryKey: ["bootstrap"] });
                const { data: auth } = await client().auth.getSession();
                if (auth.session?.access_token !== token || !form.isConnected || bootstrap.find(bootstrapFilter) !== original) return;
                if (!result.saved) {
                  preserve({ name: draft?.name ?? proposed, revision: result.revision });
                  throw new Error("O nome publicado mudou em outra sessão. Revise o rascunho e salve novamente para substituí-lo.");
                }
                preserve(null);
              }}
            >
              <Field label="Nome da instalação" hint="Até 80 caracteres. O nome fica visível ao público após salvar.">
                <input
                  ref={input}
                  name="installation_name"
                  autoComplete="off"
                  required
                  value={draft?.name ?? name}
                  onChange={(event) => preserve({ name: event.currentTarget.value, revision: draft ? draft.revision : revision })}
                />
              </Field>
            </Form>
          </section>
          <section className="settings-panel brand-legal" aria-labelledby="brand-legal-title">
            <header>
              <h2 id="brand-legal-title"><FileText size={20} aria-hidden="true" /> Textos legais</h2>
              <p>Edite os Termos de Uso e a Política de Privacidade por versão. Os aceites ficam vinculados ao documento vigente em cada operação.</p>
            </header>
            <Link className="button" to="?aba=legal">Gerenciar documentos legais</Link>
          </section>
        </div>
        <section className="settings-panel brand-preview" aria-labelledby="brand-preview-title">
          <header>
            <h2 id="brand-preview-title">Prévia da identidade</h2>
            <p>Confira o nome e a marca Icarus nos dois temas.</p>
          </header>
          <div className="brand-samples">
            {(["light", "dark"] as const).map((tone) => (
              <div key={tone} className="brand-sample" data-brand-tone={tone}>
                <span>{tone === "light" ? "Tema claro" : "Tema escuro"}</span>
                <img src={import.meta.env.BASE_URL + "brand/icarus-horizontal-preto.svg"} alt="Icarus" width="244" height="64" />
                <strong dir="auto">{(draft && trimmedName(draft.name)) || name}</strong>
              </div>
            ))}
          </div>
          <p>O menu segue as seções da plataforma. Cada pessoa escolhe o tema no próprio perfil.</p>
        </section>
      </div>
    </>
  );
}
