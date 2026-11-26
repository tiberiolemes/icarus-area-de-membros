import { useEffect, useRef, useState } from "react";
import { AppWindow, FileText, Globe, ImageUp, Palette } from "lucide-react";
import { Link } from "react-router-dom";
import { cache, client, edge, rpc } from "../api";
import { useAuth, useBootstrap } from "../auth";
import { acceptOf, BrandImage, BrandLogo, brandAssetUrl, brandRatio, checkImageFile, defaultIcon, defaultLogo, type AssetPreview, type AssetVariant } from "../brand";
import { Action, Field, Form, Notice, QueryState } from "../ui";
import "./admin-brand.css";

type NameDraft = { name: string; revision: number | null };
type NameSave = { name: string; revision: number; saved: boolean };
type Variant = "light" | "dark" | "icon";

const logoHint = "SVG, PNG ou WebP, até 500 KB. PNG e WebP precisam de pelo menos 240 × 60 px. Prefira fundo transparente.";
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
    empty: "Usando o ícone padrão do Icarus.", hint: "SVG ou PNG quadrado, até 500 KB. PNG precisa de pelo menos 180 × 180 px.",
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
  const ratios = { light: brandRatio(bootstrap.data?.settings.logo_light_ratio), dark: brandRatio(bootstrap.data?.settings.logo_dark_ratio) };
  return (
    <QueryState query={bootstrap}>
      {bootstrap.data && session && (typeof name === "string" && typeof revision === "number" ? (
        <BrandEditor key={session.access_token} actorId={session.user.id} token={session.access_token} name={name} revision={revision} logos={logos} ratios={ratios} />
      ) : <Notice error>A edição da marca está indisponível nesta versão da instalação.</Notice>)}
    </QueryState>
  );
}

/** Imagem da marca ou assinatura do curso: prévia, salvar, trocar e remover pela Edge upload, em AJAX. */
export function AssetCard({ variant, saved, savedRatio, draft: controlled, onDraft: setControlled, courseId, onChanged = refreshBrand }: {
  variant: AssetVariant;
  saved: string | null;
  savedRatio?: number;
  draft?: AssetPreview;
  onDraft?: (preview?: AssetPreview) => void;
  courseId?: string;
  onChanged?: () => Promise<unknown> | void;
}) {
  const copy = assetCopy[variant];
  const [own, setOwn] = useState<AssetPreview>();
  const draft = setControlled ? controlled : own;
  const onDraft = setControlled ?? setOwn;
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  const [removed, setRemoved] = useState(false);
  const [formVersion, setFormVersion] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const latest = useRef(0);
  useEffect(() => () => { if (draft) URL.revokeObjectURL(draft.url); }, [draft]);
  useEffect(() => () => { latest.current++; }, []);

  async function choose(file?: File) {
    // Só a última escolha vale: a validação de um arquivo já trocado é descartada.
    const pick = ++latest.current;
    setError("");
    setRemoved(false);
    onDraft(undefined);
    setChecking(Boolean(file));
    if (!file) return;
    try {
      const preview = await checkImageFile(file, variant);
      if (pick === latest.current) onDraft(preview);
      else URL.revokeObjectURL(preview.url);
    } catch (failure) {
      if (pick !== latest.current) return;
      if (input.current) input.current.value = "";
      setError(failure instanceof Error ? failure.message : "Não foi possível ler esta imagem.");
    } finally {
      if (pick === latest.current) setChecking(false);
    }
  }

  return (
    <section className="brand-logo-card" data-variant={variant} aria-labelledby={`brand-asset-${variant}`}>
      <h3 id={`brand-asset-${variant}`}>{copy.title}</h3>
      <p>{copy.use}</p>
      <div className="brand-logo-stage" data-theme={variant === "dark" ? "dark" : "light"}>
        {draft || saved
          ? <BrandImage src={draft?.url ?? saved!} alt={draft ? copy.preview : copy.current} ratio={draft?.ratio ?? savedRatio} />
          : <span>{copy.empty}</span>}
      </div>
      {checking && <p role="status">Preparando a prévia…</p>}
      {draft?.warnings.map((warning) => <Notice key={warning}>{warning}</Notice>)}
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
      {saved && !draft && !checking && (
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

function BrandEditor({ actorId, token, name, revision, logos, ratios }: { actorId: string; token: string; name: string; revision: number; logos: Record<Variant, string | null>; ratios: { light?: number; dark?: number } }) {
  const [logoDrafts, setLogoDrafts] = useState<Partial<Record<Variant, AssetPreview>>>({});
  const shown = {
    light: logoDrafts.light?.url ?? logos.light,
    dark: logoDrafts.dark?.url ?? logos.dark,
    ratios: { light: logoDrafts.light?.ratio ?? ratios.light, dark: logoDrafts.dark?.ratio ?? ratios.dark },
  };
  const shownIcon = logoDrafts.icon?.url ?? logos.icon ?? defaultIcon;
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
  const shownName = (draft && trimmedName(draft.name)) || name;
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
                <AssetCard key={variant} variant={variant} saved={logos[variant]} savedRatio={ratios[variant]} draft={logoDrafts[variant]}
                  onDraft={(url) => setLogoDrafts((current) => ({ ...current, [variant]: url }))} />
              ))}
            </div>
          </section>
          <section className="settings-panel" aria-labelledby="brand-icon-title">
            <header>
              <h2 id="brand-icon-title"><AppWindow size={20} aria-hidden="true" /> Ícone da plataforma</h2>
              <p>O favicon substitui o ícone do Icarus nas abas e nos atalhos. A assinatura do certificado fica em Configurações → Certificado.</p>
            </header>
            <AssetCard variant="icon" saved={logos.icon} savedRatio={1} draft={logoDrafts.icon}
              onDraft={(preview) => setLogoDrafts((current) => ({ ...current, icon: preview }))} />
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
            <p>Confira a marca nos dois temas antes de salvar. O PNG e o PDF do certificado têm fundo claro.</p>
          </header>
          <div className="brand-samples">
            {(["light", "dark"] as const).map((tone) => (
              <div key={tone} className="brand-sample" data-theme={tone}>
                <span>{tone === "light" ? "Tema claro" : "Tema escuro"}</span>
                <strong dir="auto">{shownName}</strong>
                <dl className="brand-preview-sizes">
                  {[
                    ["rail", "Menu lateral"], ["drawer", "Gaveta"], ["mobile", "Topo no celular"],
                    ["public", "Telas públicas"], ["admin", "Topo do painel"], ["certificate", "Certificado na tela"],
                    ...(tone === "light" ? [["export", "Certificado em PNG e PDF"]] : []),
                  ].map(([slot, label]) => (
                    <div key={slot} data-brand-slot={slot}>
                      <dt>{label}</dt>
                      <dd><BrandLogo {...shown} name={shownName}
                        fallback={shownName === "Icarus" ? <img src={defaultLogo} alt="Icarus" width="244" height="64" />
                          : <span className="installation-name" title={shownName}>{shownName}</span>} /></dd>
                    </div>
                  ))}
                  <div data-brand-slot="icon">
                    <dt>Aba do navegador</dt>
                    <dd><BrandImage src={shownIcon} alt="Ícone da plataforma" ratio={1} /></dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
