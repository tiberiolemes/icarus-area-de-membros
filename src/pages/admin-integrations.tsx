import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { KeyRound, Shield } from "lucide-react";
import { cache, date, edge, errorMessage } from "../api";
import { Field, Form, Modal, Notice, value } from "../ui";

export type IntegrationProvider = "asaas" | "bunny";
type Source = "environment" | "vault" | null;
type FieldStatus = { source: Source; value?: string | null; suffix?: string | null; configured?: boolean };
export type IntegrationStatus = {
  configured: boolean;
  can_write: boolean;
  test_ready: boolean;
  error: string | null;
  fields: Record<string, FieldStatus | undefined>;
  updated_at: string | null;
  updated_by: string | null;
  webhook_url?: string | null;
  turnstile?: boolean;
  checkout_allowed?: boolean;
  production_enabled?: boolean;
  production_test_valid?: boolean;
  mode?: "local" | "production";
  email?: "local" | "configured";
  storage?: boolean;
  demo?: boolean;
};
type TestResult = { ok: boolean; message: string };

export const integrationKey = (provider: IntegrationProvider) => ["admin-integration", provider];

function sourceHint(field?: FieldStatus) {
  const source = field?.source === "environment" ? "Variável de ambiente"
    : field?.source === "vault" ? "Cofre do Supabase" : "Não configurado";
  return field?.suffix ? `${source}, termina em ${field.suffix}.` : source;
}

function IntegrationField({ name, label, field, secret = false }: {
  name: string; label: string; field?: FieldStatus; secret?: boolean;
}) {
  return (
    <Field label={label} hint={sourceHint(field)}>
      <input key={field?.value} name={name} type={secret ? "password" : "text"} defaultValue={secret ? "" : field?.value ?? ""}
        autoComplete="off" spellCheck={false} autoCapitalize="none" data-sensitive={secret ? "credential" : undefined}
        disabled={field?.source === "environment"} maxLength={secret ? 512 : name === "library_id" ? 15 : 253}
        inputMode={name === "library_id" ? "numeric" : undefined}
        pattern={name === "library_id" ? "[1-9][0-9]*" : undefined}
        placeholder={secret && field?.configured
          ? field.source === "environment" ? "Definida no servidor" : "Em branco para manter"
          : undefined} />
    </Field>
  );
}

function CopyValue({ label, value }: { label: string; value: string }) {
  const [message, setMessage] = useState("");
  return (
    <div className="settings-copy">
      <Field label={label}><input value={value} readOnly autoComplete="off" onFocus={(e) => e.currentTarget.select()} /></Field>
      <button type="button" onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setMessage("Copiado.");
        } catch { setMessage("Selecione o campo e copie manualmente."); }
      }}>Copiar {label}</button>
      <span role="status">{message}</span>
    </div>
  );
}

function ConfirmPassword() {
  return (
    <Field label="Senha atual" hint="Confirme sua senha para gravar a configuração.">
      <input name="password" type="password" autoComplete="current-password" data-sensitive="password" required />
    </Field>
  );
}

function takePassword(data: FormData, form: HTMLFormElement) {
  const password = String(data.get("password") ?? "");
  const passwordInput = form.elements.namedItem("password");
  if (passwordInput instanceof HTMLInputElement) passwordInput.value = "";
  return password;
}

function configurationChanged(provider: IntegrationProvider, form: HTMLFormElement) {
  form.reset();
  void cache.invalidateQueries({ queryKey: integrationKey(provider) });
  void cache.invalidateQueries({ queryKey: ["capabilities"] });
}

async function updateIntegration(provider: IntegrationProvider, payload: Record<string, unknown>,
  data: FormData, form: HTMLFormElement) {
  const { token } = await edge<{ token: string }>("reauthenticate", { password: takePassword(data, form) });
  await edge("capabilities", { ...payload, provider, reauth_token: token });
  configurationChanged(provider, form);
}

function RotateWebhook({ environment }: { environment: string }) {
  const [generated, setGenerated] = useState("");
  if (generated) return (
    <>
      <Notice>Copie o token e atualize o webhook no Asaas agora. Ele só aparece nesta janela.</Notice>
      <CopyValue label="token do webhook" value={generated} />
    </>
  );
  return (
    <Form label="Confirmar e gerar token" successMessage="" onSave={async (data, form) => {
      const result = await edge<{ webhook_token: string }>("reauthenticate", {
        action: "rotate-asaas-webhook", environment, password: takePassword(data, form),
      });
      configurationChanged("asaas", form);
      setGenerated(result.webhook_token);
    }}>
      <ConfirmPassword />
    </Form>
  );
}

function ProductionApproval({ settings }: { settings: IntegrationStatus }) {
  const [open, setOpen] = useState(false);
  const enabled = Boolean(settings.production_enabled);
  const eligible = enabled || (settings.fields.env?.value === "production" && settings.production_test_valid);
  return (
    <section className="settings-panel" aria-labelledby="integration-production">
      <h2 id="integration-production">Cobranças em produção</h2>
      <p id="integration-production-description">{enabled ? "Ativas. O checkout pode gerar cobranças reais."
        : "Desativadas. Para ativar, salve as credenciais de Produção e obtenha um teste aprovado nas últimas 24 horas."}</p>
      <Modal open={open} onOpenChange={setOpen}
        title={enabled ? "Desativar cobranças em produção" : "Ativar cobranças em produção"}
        description={enabled ? "O checkout deixará de criar novos pedidos neste ambiente."
          : "A partir da confirmação, novas compras em Produção poderão gerar cobranças reais."}
        trigger={<button type="button" className="notification-switch" role="switch" aria-checked={enabled} aria-labelledby="integration-production"
          aria-describedby="integration-production-description" disabled={!settings.can_write || !eligible}>
          <span aria-hidden="true" />
        </button>}>
        <Form label={enabled ? "Desativar cobranças" : "Ativar cobranças"} onSave={async (data, form) => {
          await updateIntegration("asaas", { action: "integration-production", enabled: !enabled }, data, form);
          setOpen(false);
        }}><ConfirmPassword /></Form>
      </Modal>
    </section>
  );
}

export function useIntegrationTest(provider: IntegrationProvider) {
  return useMutation({
    mutationFn: () => edge<TestResult>("capabilities", { action: "integration-test", provider }),
    onSuccess: () => cache.invalidateQueries({ queryKey: integrationKey(provider) }),
  });
}

export function IntegrationCards({ provider, settings, onSave }: {
  provider: IntegrationProvider; settings: IntegrationStatus; onSave: () => void;
}) {
  const asaas = provider === "asaas", fields = settings.fields;
  const environment = fields.env?.value;
  return (
    <div className="settings-provider-grid">
      <section className="settings-panel" aria-labelledby="integration-fields">
        <h2 id="integration-fields"><KeyRound size={20} aria-hidden="true" /> {asaas ? "Ambiente e chave de API" : "Biblioteca e credenciais"}</h2>
        {settings.demo ? <p>Configure provedores na sua instalação do Icarus.</p> : !settings.can_write &&
          <p>Para alterar as credenciais, ative a verificação em duas etapas em Sua conta → Segurança e entre com o segundo fator.</p>}
        <Form disabled={!settings.can_write} label="Salvar configuração" successMessage="Configuração salva." onSave={async (data, form) => {
          const patch: Record<string, string> = {};
          if (asaas) patch.env = fields.env?.source === "environment" ? environment ?? "" : value(data, "env");
          for (const key of asaas ? ["api_key"] : ["library_id", "api_key", "cdn_host", "token_key"]) {
            const next = value(data, key);
            if (next && next !== fields[key]?.value) patch[key] = key === "cdn_host" ? next.toLowerCase() : next;
          }
          if (!Object.keys(patch).length) throw new Error("Informe pelo menos um campo para atualizar.");
          await updateIntegration(provider, { action: "integration-save", fields: patch }, data, form);
          onSave();
        }}>
          {asaas ? (
            <>
              <Field label="Ambiente" hint={sourceHint(fields.env)}>
                <select key={environment} name="env" defaultValue={environment ?? "sandbox"} disabled={fields.env?.source === "environment"}>
                  <option value="sandbox">Sandbox</option>
                  <option value="production">Produção</option>
                </select>
              </Field>
              <p>O Sandbox e a Produção têm chaves próprias.</p>
            </>
          ) : <IntegrationField name="library_id" label="ID da biblioteca" field={fields.library_id} />}
          <IntegrationField name="api_key" label={asaas ? "Chave de API" : "Chave de API do Stream"} field={fields.api_key} secret />
          {!asaas && <>
            <IntegrationField name="cdn_host" label="Hostname da CDN" field={fields.cdn_host} />
            <IntegrationField name="token_key" label="Chave de autenticação do player" field={fields.token_key} secret />
          </>}
          {settings.can_write && <ConfirmPassword />}
        </Form>
        {settings.updated_at && <p>Última alteração em {date(settings.updated_at)}{settings.updated_by ? ` por ${settings.updated_by}` : ""}.</p>}
      </section>
      {asaas ? (
        <div className="settings-provider">
          <section className="settings-panel" aria-labelledby="integration-webhook">
            <h2 id="integration-webhook"><Shield size={20} aria-hidden="true" /> Webhook do Asaas</h2>
            <p>Cadastre a URL e o token no painel do Asaas, no mesmo ambiente.</p>
            {settings.webhook_url ? <CopyValue label="URL do webhook" value={settings.webhook_url} />
              : <p>Configure a URL pública da API do Supabase no servidor.</p>}
            <p>Token do webhook. {sourceHint(fields.webhook_token)}</p>
            <Modal title={fields.webhook_token?.configured ? "Rotacionar token do webhook" : "Gerar token do webhook"}
              description="Salve primeiro o ambiente. Um novo token substitui o anterior assim que é gerado."
              trigger={<button type="button" disabled={!settings.can_write || !environment || fields.webhook_token?.source === "environment"}>
                {fields.webhook_token?.configured ? "Rotacionar token" : "Gerar token"}
              </button>}>
              {environment && <RotateWebhook environment={environment} />}
            </Modal>
          </section>
          <section className="settings-panel" aria-labelledby="integration-turnstile">
            <h2 id="integration-turnstile">Turnstile do checkout</h2>
            <p>{settings.turnstile ? "Segredo configurado no servidor." : "Segredo não configurado no servidor."}</p>
          </section>
          <ProductionApproval settings={settings} />
        </div>
      ) : (
        <section className="settings-panel" aria-labelledby="integration-playback">
          <h2 id="integration-playback"><Shield size={20} aria-hidden="true" /> Reprodução protegida</h2>
          <p>Em Segurança da biblioteca no Bunny Stream, autorize o domínio do Icarus e ative a autenticação por token do player.</p>
          <p>O teste verifica a chave da API e o ID da biblioteca. Para conferir a chave do player, abra uma aula com vídeo.</p>
        </section>
      )}
    </div>
  );
}

export function IntegrationTestMessage({ test }: { test: ReturnType<typeof useIntegrationTest> }) {
  if (test.isError) return <Notice error>{errorMessage(test.error)}</Notice>;
  if (!test.data) return null;
  return test.data.ok ? <p role="status">{test.data.message}</p> : <Notice error>{test.data.message}</Notice>;
}
