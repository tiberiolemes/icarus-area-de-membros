import type { SupabaseClient } from "npm:@supabase/supabase-js@2.119.2";
import { rpc, type Dependencies } from "./client.ts";
import { appOrigin, sha256 } from "./http.ts";

export const asaasEndpoints = {
  sandbox: { api: "https://api-sandbox.asaas.com/v3", checkout: "https://sandbox.asaas.com" },
  production: { api: "https://api.asaas.com/v3", checkout: "https://asaas.com" },
} as const;
export type AsaasEnvironment = keyof typeof asaasEndpoints;
export type Provider = "asaas" | "bunny";
type Vault = Record<string, string | undefined>;

export function asaasEnvironment(value: unknown): value is AsaasEnvironment {
  return value === "sandbox" || value === "production";
}

export const asaasHeaders = (apiKey: string) => ({ access_token: apiKey, "User-Agent": "Icarus/0.1" });
export const validWebhookToken = (token?: string) => Boolean(token && /^[!-~]{32,255}$/.test(token));
export const validLibrary = (id?: string) => Boolean(id && /^[1-9][0-9]{0,14}$/.test(id));
export const validCdnHost = (host?: string) => Boolean(host && host.length <= 253 &&
  /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*\.[a-z][a-z0-9]{1,62}$/.test(host));

function configured(env: string | undefined, stored: string | undefined) {
  return { value: env ?? stored, source: env !== undefined ? "environment" : stored !== undefined ? "vault" : null } as const;
}

async function credentials(admin: SupabaseClient, provider: Provider): Promise<Vault> {
  return await rpc(admin, "app_integration_credentials", { p_provider: provider });
}

function updated(stored: Vault) {
  return { updated_at: stored._updated_at ?? null, updated_by: stored._updated_by_name ?? stored._updated_by ?? null };
}

export async function asaasConfig(
  d: Dependencies,
  admin: SupabaseClient,
  options: { details?: boolean; webhookEnvironment?: AsaasEnvironment } = {},
) {
  const envMode = d.env("ASAAS_ENV"), envApiKey = d.env("ASAAS_API_KEY"), envToken = d.env("ASAAS_WEBHOOK_TOKEN");
  const fullyInEnvironment = envMode !== undefined && envApiKey !== undefined && envToken !== undefined &&
    (!options.webhookEnvironment || options.webhookEnvironment === envMode);
  const stored = options.details || envMode === "production" || !fullyInEnvironment ? await credentials(admin, "asaas") : {};
  const modeField = configured(envMode, stored.env);
  const configuredMode = asaasEnvironment(modeField.value) ? modeField.value : undefined;
  // Sem seletor, webhooks antigos com token no ambiente pertencem ao Sandbox.
  const mode = options.webhookEnvironment ?? configuredMode ?? "sandbox";
  const useEnvironment = mode === (configuredMode ?? "sandbox");
  const apiKey = configured(useEnvironment ? envApiKey : undefined, stored[`${mode}_api_key`]);
  const webhookToken = configured(useEnvironment ? envToken : undefined, stored[`${mode}_webhook_token`]);
  const productionFingerprint = mode === "production" && apiKey.value && validWebhookToken(webhookToken.value)
    ? await sha256(JSON.stringify([apiKey.value, webhookToken.value])) : null;
  const productionEnabled = Boolean(productionFingerprint && stored._production_active_hash === productionFingerprint);
  const productionTestValid = Boolean(productionFingerprint && stored._production_test_hash === productionFingerprint &&
    Date.parse(stored._production_tested_at ?? "") > Date.now() - 86_400_000);
  return {
    fields: { env: modeField, api_key: apiKey, webhook_token: webhookToken },
    mode,
    configured: Boolean(configuredMode && apiKey.value && validWebhookToken(webhookToken.value)),
    productionFingerprint, productionEnabled, productionTestValid,
    checkoutAllowed: mode === "sandbox" || productionEnabled,
    error: modeField.source && !configuredMode ? "Confira a variável ASAAS_ENV no servidor."
      : webhookToken.value && !validWebhookToken(webhookToken.value) ? "O token do webhook tem formato inválido." : null,
    ...updated(stored),
  };
}

export async function bunnyConfig(d: Dependencies, admin: SupabaseClient, details = false) {
  const library = d.env("BUNNY_LIBRARY_ID"), token = d.env("BUNNY_TOKEN_KEY"), domain = d.env("BUNNY_ALLOWED_DOMAIN");
  const cdn = d.env("BUNNY_CDN_HOST");
  const completeEnvironment = library !== undefined && token !== undefined && (domain !== undefined || cdn !== undefined);
  const stored = details || !completeEnvironment ? await credentials(admin, "bunny") : {};
  const fields = {
    library_id: configured(library, stored.library_id),
    api_key: configured(d.env("BUNNY_STREAM_API_KEY"), stored.api_key),
    cdn_host: configured(cdn, stored.cdn_host),
    token_key: configured(token, stored.token_key),
  };
  const domainAllowed = domain !== undefined ? new URL(appOrigin(d.env)).hostname === domain : validCdnHost(fields.cdn_host.value);
  const playbackReady = validLibrary(fields.library_id.value) && Boolean(fields.token_key.value) && domainAllowed;
  return {
    fields, playbackReady,
    configured: playbackReady && Boolean(fields.api_key.value) && validCdnHost(fields.cdn_host.value),
    error: fields.library_id.value && !validLibrary(fields.library_id.value) ? "O ID da biblioteca precisa ser numérico."
      : fields.cdn_host.value && !validCdnHost(fields.cdn_host.value) ? "O hostname da CDN está inválido."
      : domain !== undefined && !domainAllowed ? "BUNNY_ALLOWED_DOMAIN está diferente do domínio do Icarus." : null,
    ...updated(stored),
  };
}

export function masked(field: ReturnType<typeof configured>) {
  return { source: field.source, configured: Boolean(field.value), suffix: field.value && field.value.length > 4 ? field.value.slice(-4) : null };
}

export function asaasWebhookUrl(d: Dependencies, mode: AsaasEnvironment) {
  try {
    const url = new URL(d.env("SUPABASE_PUBLIC_URL") || d.env("ICARUS_PUBLIC_SUPABASE_URL") || d.env("SUPABASE_URL") || "");
    const loopback = d.env("ICARUS_MODE") === "local" && ["127.0.0.1", "localhost"].includes(url.hostname);
    if (!(url.protocol === "https:" || (loopback && url.protocol === "http:")) || url.username || url.password ||
      url.pathname !== "/" || url.search || url.hash) return null;
    return `${url.origin}/functions/v1/asaas-webhook?ambiente=${mode}`;
  } catch { return null; }
}
