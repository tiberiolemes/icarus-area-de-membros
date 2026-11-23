import { defaults, type Dependencies } from "../_shared/client.ts";
import { endpoint } from "../_shared/http.ts";
export const createHandler = (d: Dependencies = defaults) => endpoint(async () => ({
  asaas: Boolean(d.env("ASAAS_API_KEY") && d.env("ASAAS_WEBHOOK_TOKEN") && d.env("ASAAS_ENV") === "sandbox" && d.env("ASAAS_ITEM_IMAGE_BASE64")),
  bunny: Boolean(d.env("BUNNY_LIBRARY_ID") && d.env("BUNNY_TOKEN_KEY") && d.env("BUNNY_ALLOWED_DOMAIN")),
  storage: true, email: d.env("EMAIL_CONFIGURED") === "true" ? "configured" : "local",
  mode: d.env("ICARUS_MODE") === "production" ? "production" : "local",
}), d.env, true);
export const handler = createHandler();
if (import.meta.main) Deno.serve(handler);
