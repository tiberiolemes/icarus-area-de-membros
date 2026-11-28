import { actor, clients, defaults, rpc, type Dependencies } from "../_shared/client.ts";
import { endpoint, HttpError, json, text } from "../_shared/http.ts";
import { asaasConfig, asaasEndpoints, asaasEnvironment, asaasHeaders, asaasWebhookUrl, bunnyConfig, masked, minuteCache, validCdnHost, validLibrary } from "../_shared/integrations.ts";

async function testConnection(d: Dependencies, url: string, headers: HeadersInit, provider: string) {
  const response = await d.fetch(url, { headers, redirect: "error", signal: AbortSignal.timeout(8_000) }).catch(() => null);
  await response?.body?.cancel().catch(() => {});
  if (response?.ok) return { ok: true, message: `Conexão com ${provider} confirmada.` };
  const message = response?.status === 401 || response?.status === 403
    ? `A API de ${provider} recusou a chave. Confira as credenciais salvas.`
    : response?.status === 404 ? `A API de ${provider} não encontrou o recurso. Confira a configuração.`
      : `A API de ${provider} está indisponível. Tente novamente.`;
  return { ok: false, message };
}

export const createHandler = (d: Dependencies = defaults) => {
  const flags = minuteCache<{ asaas: boolean; bunny: boolean; storage: boolean }>();
  return endpoint(async (req) => {
    const body = req.method === "POST" && req.body ? await json(req) : {};
    if (body.action === undefined) {
      return flags.get(async () => {
        const { admin } = clients(d);
        const [asaas, bunny] = await Promise.all([asaasConfig(d, admin), bunnyConfig(d, admin)]);
        return {
          asaas: asaas.configured && asaas.checkoutAllowed &&
            (d.env("ICARUS_MODE") !== "production" || Boolean(d.env("TURNSTILE_SECRET_KEY"))),
          bunny: bunny.playbackReady,
          storage: true,
        };
      });
    }

    const a = (await actor(req, d))!;
    if (body.action === "bunny-videos") {
      if (!["admin", "instructor"].includes(a.profile.role) || a.profile.password_setup_required || a.profile.demo) {
        throw new HttpError(403, "FORBIDDEN", "Somente administradores e instrutores podem buscar vídeos do Bunny.");
      }
      const { query, page } = body;
      if (typeof query !== "string" || query.length > 100 || typeof page !== "number" || !Number.isInteger(page) || page < 1 || page > 1000) {
        throw new HttpError(422, "INVALID_INPUT", "Confira a busca e a página.");
      }
      await rpc(a.admin, "app_staff_bunny_search_throttle", { p_actor_id: a.userInfo.id });
      const { fields } = await bunnyConfig(d, a.admin, true);
      if (!validLibrary(fields.library_id.value) || !fields.api_key.value) {
        throw new HttpError(409, "BUNNY_NOT_CONFIGURED", "Configure o Bunny Stream em Configurações > Integrações.");
      }
      const response = await d.fetch(
        `https://video.bunnycdn.com/library/${fields.library_id.value}/videos?page=${page}&itemsPerPage=20&orderBy=date&search=${encodeURIComponent(query.trim())}`,
        { headers: { AccessKey: fields.api_key.value }, redirect: "error", signal: AbortSignal.timeout(8_000) },
      ).catch(() => null);
      if (!response?.ok) await response?.body?.cancel().catch(() => {});
      if (response?.status === 401 || response?.status === 403) {
        throw new HttpError(502, "BUNNY_REJECTED", "A API do Bunny Stream recusou a chave. Confira as credenciais salvas.");
      }
      const data = response?.ok ? await response.json().catch(() => null) : null;
      if (!Array.isArray(data?.items)) throw new HttpError(502, "BUNNY_UNAVAILABLE", "A API do Bunny Stream está indisponível. Tente novamente.");
      return {
        items: data.items.map((video: Record<string, unknown>) => ({
          id: String(video.guid), title: String(video.title ?? ""), length: Number(video.length) || 0, ready: video.status === 4,
        })),
        total: Number(data.totalItems) || 0,
        page,
      };
    }
    if (a.profile.role !== "admin" || a.profile.password_setup_required || a.profile.demo) {
      throw new HttpError(403, "FORBIDDEN", "Somente administradores podem consultar as integrações.");
    }
    const provider = body.provider;
    if (provider !== "asaas" && provider !== "bunny") throw new HttpError(422, "INVALID_INPUT", "Selecione um provedor válido.");

    const services = {
      storage: true, email: d.env("EMAIL_CONFIGURED") === "true" ? "configured" : "local",
      mode: d.env("ICARUS_MODE") === "production" ? "production" : "local",
    };
    const canWrite = a.claims.aal === "aal2" && Boolean(a.userInfo.factors?.some((factor) => factor.status === "verified"));
    if (body.action === "integration-save") {
      if (!canWrite) throw new HttpError(403, "MFA_REQUIRED", "Ative e confirme o segundo fator para alterar a integração.");
      if (!body.fields || typeof body.fields !== "object" || Array.isArray(body.fields) || "webhook_token" in body.fields) {
        throw new HttpError(422, "INVALID_INPUT", "Confira os campos da integração.");
      }
      const fields = { ...body.fields } as Record<string, unknown>;
      if (provider === "asaas" && d.env("ASAAS_ENV") !== undefined) fields.env = d.env("ASAAS_ENV");
      await rpc(a.admin, "app_admin_save_integration", {
        p_actor_id: a.userInfo.id, p_provider: provider, p_fields: fields, p_reauth_token: text(body.reauth_token, 128),
      });
      flags.clear();
      return { saved: true };
    }

    if (body.action !== "integration-status" && body.action !== "integration-test" && body.action !== "integration-production") {
      throw new HttpError(422, "INVALID_INPUT", "Ação inválida.");
    }
    if (body.action === "integration-test") {
      if (!canWrite) throw new HttpError(403, "MFA_REQUIRED", "Ative e confirme o segundo fator para testar a integração.");
      await rpc(a.admin, "app_admin_integration_test_throttle", { p_actor_id: a.userInfo.id });
    }
    if (provider === "asaas") {
      const { fields, mode, configured, error, updated_at, updated_by, productionFingerprint, productionEnabled,
        productionTestValid, checkoutAllowed } = await asaasConfig(d, a.admin, { details: true });
      const env = asaasEnvironment(fields.env.value) ? fields.env.value : null;
      const testReady = Boolean(env && fields.api_key.value);
      if (body.action === "integration-production") {
        if (!canWrite) throw new HttpError(403, "MFA_REQUIRED", "Ative e confirme o segundo fator para alterar as cobranças.");
        if (typeof body.enabled !== "boolean") throw new HttpError(422, "INVALID_INPUT", "Informe a situação das cobranças em Produção.");
        if (body.enabled && (env !== "production" || !productionTestValid)) {
          throw new HttpError(409, "TEST_REQUIRED", "Faça um novo teste do Asaas em Produção com as credenciais atuais.");
        }
        await rpc(a.admin, "app_admin_asaas_production", {
          p_actor_id: a.userInfo.id, p_action: body.enabled ? "enable" : "disable", p_fingerprint: productionFingerprint,
          p_reauth_token: text(body.reauth_token, 128),
        });
        flags.clear();
        return { saved: true };
      }
      if (body.action === "integration-test") {
        if (!testReady) return { ok: false, message: "Salve o ambiente e a chave de API do Asaas para testar." };
        const result = await testConnection(d, `${asaasEndpoints[mode].api}/payments?limit=1`, asaasHeaders(fields.api_key.value!), "Asaas");
        if (productionFingerprint) {
          await rpc(a.admin, "app_admin_asaas_production", {
            p_actor_id: a.userInfo.id, p_action: result.ok ? "test" : "test-failed", p_fingerprint: productionFingerprint,
          });
        }
        return result;
      }
      return {
        configured, error, test_ready: testReady, can_write: canWrite, updated_at, updated_by, ...services,
        fields: { env: { source: fields.env.source, value: env }, api_key: masked(fields.api_key), webhook_token: masked(fields.webhook_token) },
        webhook_url: asaasWebhookUrl(d, mode), turnstile: Boolean(d.env("TURNSTILE_SECRET_KEY")),
        checkout_allowed: checkoutAllowed, production_enabled: productionEnabled, production_test_valid: productionTestValid,
      };
    }
    if (body.action === "integration-production") throw new HttpError(422, "INVALID_INPUT", "A liberação de cobranças está disponível no Asaas.");
    const { fields, configured, error, updated_at, updated_by } = await bunnyConfig(d, a.admin, true);
    const testReady = Boolean(validLibrary(fields.library_id.value) && fields.api_key.value);
    if (body.action === "integration-test") {
      return testReady
        ? await testConnection(d, `https://video.bunnycdn.com/library/${fields.library_id.value}/videos?itemsPerPage=1`, { AccessKey: fields.api_key.value! }, "Bunny Stream")
        : { ok: false, message: "Salve o ID da biblioteca e a chave da API do Stream para testar." };
    }
    return {
      configured, error, test_ready: testReady, can_write: canWrite, updated_at, updated_by, ...services,
      fields: {
        library_id: { source: fields.library_id.source, value: validLibrary(fields.library_id.value) ? fields.library_id.value : null },
        api_key: masked(fields.api_key),
        cdn_host: { source: fields.cdn_host.source, value: validCdnHost(fields.cdn_host.value) ? fields.cdn_host.value : null },
        token_key: masked(fields.token_key),
      },
    };
  }, d.env, true);
};
export const handler = createHandler();
if (import.meta.main) Deno.serve(handler);
