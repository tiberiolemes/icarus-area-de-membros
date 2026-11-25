import { useEffect, useRef, useState } from "react";
import { AppWindow, FileText, Globe, ImageUp, Palette } from "lucide-react";
import { Link } from "react-router-dom";
import { cache, client, edge, rpc } from "../api";
import { useAuth, useBootstrap } from "../auth";
import { acceptOf, BrandLogo, brandAssetUrl, checkImageFile, defaultLogo, type AssetVariant } from "../brand";
import { Action, Field, Form, Notice, QueryState } from "../ui";
import "./admin-brand.css";

type NameDraft = { name: string; revision: number | null };
type NameSave = { name: string; revision: number; saved: boolean };
type Variant = "light" | "dark";

const logoHint = "PNG ou WebP, até 500 KB. Mínimo de 240 × 60 px; recomendado 960 × 240 px (proporção 4:1), com fundo transparente.";
const assetCopy: Record<AssetVariant, { title: string; noun: string; preview: string; current: string; use: string; empty: string; hint: string; confirm: string; saved: string; removed: string }> = {
  light: {
    title: "Logo colorida", noun: "logo colorida", preview: "Prévia da logo colorida", current: "Logo colorida atual",
    use: "Para fundo claro. Aparece no tema claro, nas telas de entrada e no certificado.",
    empty: "Nenhuma logo enviada.", hint: logoHint,
    confirm: "Remover a logo colorida? O tema claro, as telas de entrada e o certificado deixam de mostrar a sua logo.",
    saved: "Logo colorida salva.", removed: "Logo colorida removida.",
  },
  dark: {
    title: "Logo branca", noun: "logo branca", preview: "Prévia da logo branca", current: "Logo branca atual",
    use: "Para fundo escuro. Aparece no tema escuro; sem ela, a colorida vale nos dois temas.",
    empty: "Nenhuma logo enviada. O tema escuro usa a colorida, se houver.", hint: logoHint,
    confirm: "Remover a logo branca? O tema escuro passa a usar a logo colorida, se houver.",
    saved: "Logo branca salva.", removed: "Logo branca removida.",
  },
  icon: {
    title: "Ícone (favicon)", noun: "ícone", preview: "Prévia do ícone", current: "Ícone atual",
    use: "Aparece na aba do navegador e no atalho da tela inicial do celular, em todas as telas, inclusive antes do login.",
    empty: "Usando o ícone padrão do Icarus.", hint: "PNG quadrado, até 500 KB. Mínimo de 180 × 180 px; recomendado 512 × 512 px.",
    confirm: "Remover o ícone? As abas voltam ao ícone padrão do Icarus.",
    saved: "Ícone salvo.", removed: "Ícone removido.",
  },
  signature: {
    title: "Assinatura", noun: "assinatura", preview: "Prévia da assinatura", current: "Assinatura atual",
    use: "Aparece acima do nome do responsável no certificado: na tela, na verificação pública e no PNG e PDF. Certificados já emitidos mantêm a assinatura da emissão. A imagem fica pública: envie uma rubrica feita para certificados, não a assinatura de contratos.",
    empty: "Nenhuma assinatura enviada.", hint: "PNG com fundo transparente, até 500 KB. Mínimo de 200 × 60 px e máximo de 2000 px de cada lado; recomendado 600 × 200 px.",
    confirm: "Remover a assinatura? Os próximos certificados saem sem a imagem; os já emitidos mantêm a deles.",
    saved: "Assinatura salva.", removed: "Assinatura removida.",
  },
};

const refreshBrand = () => Promise.all([
  cache.invalidateQueries({ queryKey: ["bootstrap"] }),
  cache.invalidateQueries({ queryKey: ["app_public_context"] }),
]);

const trimmedName = (name: string) => name.replace(/^\p{Zs}+|\p{Zs}+$/gu, "");
const visibleName = /[^\p{Zs}\p{Default_Ignorable_Code_Point}\u2800]/u;
const invalidName = /[\u0000-\u001F\u007F-\u009F\u061C\u200E-\u200F\u2028-\u202E\u2066-\u2069\uD800-\uDFFF]/u;

export function AdminBrand() {
  const bootstrap = useBootstrap();
  const { session } = useAuth();
  const name = bootstrap.data?.settings.name;
  const revision = bootstrap.data?.settings.name_revision;
  const logos = { light: brandAssetUrl(bootstrap.data?.settings.logo_light), dark: brandAssetUrl(bootstrap.data?.settings.logo_dark), icon: brandAssetUrl(bootstrap.data?.settings.icon) };
  return (
    <QueryState query={bootstrap}>
      {bootstrap.data && session && (typeof name === "string" && typeof revision === "number" ? (
        <BrandEditor key={session.access_token} actorId={session.user.id} token={session.access_token} name={name} revision={revision} logos={logos} />
      ) : <Notice error>A edição da marca está indisponível nesta versão da instalação.</Notice>)}
    </QueryState>
  );
}

/** Imagem da marca ou assinatura do curso: prévia, salvar, trocar e remover pela Edge upload, em AJAX. */
export function AssetCard({ variant, saved, draft: controlled, onDraft: setControlled, courseId, onChanged = refreshBrand }: {
  variant: AssetVariant;
  saved: string | null;
  draft?: string;
  onDraft?: (url?: string) => void;
  courseId?: string;
  onChanged?: () => Promise<unknown> | void;
}) {
  const copy = assetCopy[variant];
  const [own, setOwn] = useState<string>();
  const draft = setControlled ? controlled : own;
  const onDraft = setControlled ?? setOwn;
  const [error, setError] = useState("");
  const [removed, setRemoved] = useState(false);
  const [formVersion, setFormVersion] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const latest = useRef(0);
  useEffect(() => () => { if (draft) URL.revokeObjectURL(draft); }, [draft]);

  async function choose(file?: File) {
    // Só a última escolha vale: a validação de um arquivo já trocado é descartada.
    const pick = ++latest.current;
    setError("");
    setRemoved(false);
    onDraft(undefined);
    if (!file) return;
    try {
      const url = await checkImageFile(file, variant);
      if (pick === latest.current) onDraft(url);
      else URL.revokeObjectURL(url);
    } catch (failure) {
      if (pick !== latest.current) return;
      if (input.current) input.current.value = "";
      setError(failure instanceof Error ? failure.message : "Não foi possível ler esta imagem.");
    }
  }

  return (
    <section className="brand-logo-card" data-variant={variant} aria-labelledby={`brand-asset-${variant}`}>
      <h3 id={`brand-asset-${variant}`}>{copy.title}</h3>
      <p>{copy.use}</p>
      <div className="brand-logo-stage" data-theme={variant === "dark" ? "dark" : "light"}>
        {draft || saved
          ? <img className="brand-custom" src={draft ?? saved!} alt={draft ? copy.preview : copy.current} />
          : <span>{copy.empty}</span>}
      </div>
      <Form
        key={formVersion}
        label={`Salvar ${copy.noun}`}
        successMessage={copy.saved}
        submitDisabled={!draft}
        secondaryAction={draft && (
          <button type="button" onClick={() => { latest.current++; onDraft(undefined); setFormVersion(formVersion + 1); }}>Cancelar</button>
        )}
        onSave={async (data, form) => {
          const body = new FormData();
          body.set("kind", "brand-asset");
          body.set("variant", variant);
          if (courseId) body.set("course_id", courseId);
          body.set("file", data.get("file") as File);
          await edge("upload", body);
          form.reset();
          onDraft(undefined);
          await onChanged();
        }}
      >
        <Field label={`${saved ? "Trocar" : "Escolher"} ${copy.noun}`} hint={copy.hint}>
          <input ref={input} name="file" type="file" accept={acceptOf(variant)} onChange={(event) => void choose(event.currentTarget.files?.[0])} />
        </Field>
        {error && <Notice error>{error}</Notice>}
      </Form>
      {saved && !draft && (
        <Action confirm={copy.confirm} run={async () => {
          await edge("upload", { action: "brand-asset-remove", variant, ...(courseId ? { course_id: courseId } : {}) });
          await onChanged();
          setRemoved(true);
        }}>Remover {copy.noun}</Action>
      )}
      {removed && <p role="status">{copy.removed}</p>}
    </section>
  );
}

function BrandEditor({ actorId, token, name, revision, logos }: { actorId: string; token: string; name: string; revision: number; logos: Record<Variant | "icon", string | null> }) {
  const [logoDrafts, setLogoDrafts] = useState<Partial<Record<Variant, string>>>({});
  const shown = { light: logoDrafts.light ?? logos.light, dark: logoDrafts.dark ?? logos.dark };
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
          <section className="settings-panel" aria-labelledby="brand-logo-title">
            <header>
              <h2 id="brand-logo-title"><ImageUp size={20} aria-hidden="true" /> Logo da plataforma</h2>
              <p>Envie a versão colorida, para fundo claro, e a branca, para fundo escuro. A logo substitui a do Icarus em toda a plataforma, inclusive nas telas de entrada.</p>
            </header>
            {!logos.light && logos.dark && (
              <Notice>Envie também a logo colorida. Sem ela, o tema claro, as telas de entrada e o certificado não mostram a sua logo.</Notice>
            )}
            <div className="brand-logos">
              {(["light", "dark"] as const).map((variant) => (
                <AssetCard key={variant} variant={variant} saved={logos[variant]} draft={logoDrafts[variant]}
                  onDraft={(url) => setLogoDrafts((current) => ({ ...current, [variant]: url }))} />
              ))}
            </div>
          </section>
          <section className="settings-panel" aria-labelledby="brand-icon-title">
            <header>
              <h2 id="brand-icon-title"><AppWindow size={20} aria-hidden="true" /> Ícone da plataforma</h2>
              <p>O favicon substitui o ícone do Icarus nas abas e nos atalhos. A assinatura do certificado fica em cada curso, em Conteúdo → Certificado.</p>
            </header>
            <AssetCard variant="icon" saved={logos.icon} />
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
            <p>Confira o nome e a logo nos dois temas, antes e depois de salvar.</p>
          </header>
          <div className="brand-samples">
            {(["light", "dark"] as const).map((tone) => (
              <div key={tone} className="brand-sample" data-theme={tone}>
                <span>{tone === "light" ? "Tema claro" : "Tema escuro"}</span>
                <BrandLogo {...shown} name={(draft && trimmedName(draft.name)) || name}
                  fallback={<img src={defaultLogo} alt="Icarus" width="244" height="64" />} />
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
