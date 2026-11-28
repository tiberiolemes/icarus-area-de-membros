import { actor, defaults, rpc, type Dependencies } from "../_shared/client.ts";
import { endpoint, HttpError, json, sha256, text, uuid } from "../_shared/http.ts";
import { bunnyConfig } from "../_shared/integrations.ts";
import { publicStorageUrl } from "../_shared/storage.ts";
export const createHandler = (d: Dependencies = defaults) => endpoint(async (req) => {
  const a = (await actor(req, d))!, body = await json(req);
  const kind = text(body.kind, 32);
  if (!["lesson", "material", "ticket-attachment", "post-image", "course-cover", "avatar", "feedback-screenshot"].includes(kind)) throw new HttpError(422, "INVALID_INPUT", "Tipo de arquivo inválido.");
  const id = uuid(body.id);
  const gate = kind === "feedback-screenshot"
    ? await rpc(a.admin, "app_feedback_screenshot_access", { p_actor_id: a.userInfo.id, p_id: id })
    : await rpc(a.admin, "app_media_access", { p_actor_id: a.userInfo.id, p_kind: kind, p_id: id });
  if (!gate?.can_access) throw new HttpError(403, "FORBIDDEN", "Acesso não permitido.");
  const expires = Math.floor(Date.now() / 1000) + 120;
  if (gate.video_id && gate.provider === "youtube") {
    if (!/^[A-Za-z0-9_-]{11}$/.test(gate.video_id)) throw new HttpError(503, "CONFIGURATION_REQUIRED", "Vídeo ainda não configurado.");
    return { url: `https://www.youtube-nocookie.com/embed/${gate.video_id}?rel=0&enablejsapi=1`, expires_at: new Date(expires * 1000).toISOString(), provider: "youtube" };
  }
  if (gate.video_id && gate.provider === "bunny") {
    const { playbackReady, fields } = await bunnyConfig(d, a.admin);
    if (!playbackReady || !/^[a-f0-9-]{36}$/i.test(gate.video_id)) throw new HttpError(503, "CONFIGURATION_REQUIRED", "Vídeo ainda não configurado.");
    const library = fields.library_id.value;
    const token = await sha256(fields.token_key.value! + gate.video_id + expires);
    return { url: `https://player.mediadelivery.net/embed/${library}/${gate.video_id}?token=${token}&expires=${expires}`, expires_at: new Date(expires * 1000).toISOString(), provider: "bunny" };
  }
  if (!gate.storage_path || gate.storage_path.includes("..") || gate.storage_path.startsWith("/")) throw new HttpError(503, "CONFIGURATION_REQUIRED", "Arquivo ainda não configurado.");
  const { data, error } = await a.admin.storage.from("icarus-private").createSignedUrl(gate.storage_path, 120);
  if (error || !data) throw new HttpError(404, "FILE_UNAVAILABLE", "Arquivo indisponível.");
  return { url: publicStorageUrl(data.signedUrl, d.env), expires_at: new Date(expires * 1000).toISOString(), provider: "supabase", ...(gate.focus ? { focus: gate.focus } : {}) };
}, d.env);
export const handler = createHandler();
if (import.meta.main) Deno.serve(handler);
