import { actor, defaults, rpc, type Dependencies } from "../_shared/client.ts";
import { boundedBody, endpoint, HttpError, json, sha256, text, uuid } from "../_shared/http.ts";
import { formats, matchesSignature } from "../_shared/files.ts";
const tooBig = (mime: string) => mime === "application/pdf" || mime.startsWith("image/") ? "Imagens aceitam até 500 KB e PDFs até 5 MB." : "Tipo ou tamanho de arquivo não permitido.";
// A aula usa o Bunny Stream ou o YouTube; vídeo nenhum sobe para o Storage.
const isVideo = (kind: string, mime: unknown) => kind === "lesson" || String(mime).startsWith("video/");
const noVideo = "A plataforma não recebe vídeo. Use o Bunny Stream ou o YouTube.";
import { objectExists } from "../_shared/storage.ts";
import { removeBrandLogo, saveBrandLogo } from "./brand.ts";
export const createHandler = (d: Dependencies = defaults) => endpoint(async (req) => {
  const a = (await actor(req, d))!;
  if (req.headers.get("content-type")?.startsWith("application/json")) {
    const body = await json(req);
    if (body.action === "finalize") {
      const id = uuid(body.upload_id);
      const gate = await rpc(a.admin, "app_upload_context", { p_actor_id: a.userInfo.id, p_id: id });
      if (!gate || gate.bucket !== "icarus-private" || typeof gate.path !== "string" || gate.path.startsWith("/") || gate.path.includes("..")) throw new HttpError(403, "FORBIDDEN", "Upload indisponível.");
      if (gate.path.startsWith("feedback-screenshot/")) throw new HttpError(403, "FORBIDDEN", "Envie o print pelo formulário de feedback.");
      if (gate.status !== "ready" && (!gate.expires_at || Date.parse(gate.expires_at) <= Date.now())) throw new HttpError(409, "UPLOAD_EXPIRED", "Prazo do upload expirado. Faça uma nova reserva.");
      const signed = await a.admin.storage.from("icarus-private").createSignedUrl(gate.path, 30);
      if (signed.error || !signed.data) throw new HttpError(409, "UPLOAD_PENDING", "Envio ainda não confirmado.");
      const result = await d.fetch(signed.data.signedUrl, { headers: { Range: "bytes=0-31" }, signal: AbortSignal.timeout(10_000) });
      if (![200, 206].includes(result.status)) { await result.body?.cancel(); throw new HttpError(409, "UPLOAD_PENDING", "Envio ainda não confirmado."); }
      const bytes = await boundedBody(result, 32);
      if (!matchesSignature(gate.content_type, bytes)) throw new HttpError(422, "INVALID_FILE", "Conteúdo incompatível; arquivo permanece indisponível.");
      return await rpc(a.admin, "app_upload_finalize", { p_actor_id: a.userInfo.id, p_id: id });
    }
    if (body.action === "brand-asset-remove") return await removeBrandLogo(a, body);
    if (body.action === "gravatar") return await saveGravatar(d, a);
    if (body.action === "delete") {
      const entity = text(body.entity, 32);
      if (!["lessons", "sections", "modules", "materials", "material_folders"].includes(entity)) throw new HttpError(422, "INVALID_INPUT", "Esta entidade não pode ser excluída.");
      const target = uuid(body.id);
      const { paths } = await rpc(a.admin, "app_admin_delete", { p_actor_id: a.userInfo.id, p_entity: entity, p_id: target });
      if (!paths.length) return { deleted: true, files_removed: 0 };
      // O banco já apagou: falha no Storage deixa arquivo órfão e vira aviso, nunca erro.
      const removed = await a.admin.storage.from("icarus-private").remove(paths).catch((error: Error) => ({ data: null, error }));
      if (!removed.error) return { deleted: true, files_removed: removed.data.length };
      console.error("Exclusão sem limpeza do Storage", { entity, id: target, files: paths.length, error: removed.error.message });
      return { deleted: true, files_removed: 0, warning: "O item foi excluído, mas alguns arquivos não foram apagados do armazenamento." };
    }
    if (body.action !== "reserve") throw new HttpError(422, "INVALID_INPUT", "Ação de upload inválida.");
    const kind = text(body.kind, 32), name = text(body.file_name, 180), format = formats[name.split(".").pop()!.toLowerCase()];
    if (isVideo(kind, body.content_type)) throw new HttpError(422, "INVALID_FILE", noVideo);
    if (kind !== "material" || !format || body.content_type !== format.mime || !Number.isSafeInteger(body.size_bytes) || Number(body.size_bytes) < 1) throw new HttpError(422, "INVALID_FILE", "Tipo ou tamanho de arquivo não permitido.");
    if (Number(body.size_bytes) > format.max) throw new HttpError(422, "INVALID_FILE", tooBig(format.mime));
    const gate = await rpc(a.admin, "app_upload_access", { p_actor_id: a.userInfo.id, p_kind: kind, p_resource_id: uuid(body.resource_id), p_file_name: name, p_content_type: format.mime, p_size_bytes: body.size_bytes });
    return { upload_id: gate.id, bucket: gate.bucket, path: gate.path, expires_at: gate.expires_at, method: "storage", max_size_bytes: format.max };
  }
  const raw = await boundedBody(req, 20 * 1024 * 1024 + 16384);
  let form: FormData;
  try { form = await new Request(req.url, { method: "POST", headers: { "content-type": req.headers.get("content-type") || "" }, body: raw }).formData(); }
  catch { throw new HttpError(422, "INVALID_INPUT", "Envie o arquivo com os metadados."); }
  const file = form.get("file"), kind = text(form.get("kind"), 32);
  if (kind === "brand-asset" || kind === "brand-asset-preview") return await saveBrandLogo(a, form, kind === "brand-asset-preview");
  const resourceId = uuid(form.get("resource_id"));
  const screenshot = kind === "feedback-screenshot";
  if (file instanceof File && isVideo(kind, file.type)) throw new HttpError(422, "INVALID_FILE", noVideo);
  if (!(file instanceof File) || !["course-cover", "material", "post-image", "ticket-attachment", "avatar", "feedback-screenshot"].includes(kind)) throw new HttpError(422, "INVALID_INPUT", "Arquivo inválido.");
  const name = text(file.name, 180), format = formats[name.split(".").pop()!.toLowerCase()];
  if (screenshot && !/^.+\.(png|jpe?g|webp)$/i.test(file.name)) throw new HttpError(422, "INVALID_FILE", "O print precisa ter extensão PNG, JPG ou WebP.");
  if (!format || file.type !== format.mime || file.size === 0 || (["post-image", "course-cover", "avatar", "feedback-screenshot"].includes(kind) && !file.type.startsWith("image/"))) throw new HttpError(422, "INVALID_FILE", "Tipo ou tamanho de arquivo não permitido.");
  if (kind === "avatar" && (!["image/jpeg", "image/png"].includes(file.type) || file.size > 500 * 1024)) throw new HttpError(422, "INVALID_FILE", "A foto precisa ser JPG ou PNG de até 500 KB.");
  if (kind === "course-cover" && file.size > 500 * 1024) throw new HttpError(422, "INVALID_FILE", "A capa precisa ser PNG, JPG ou WebP de até 500 KB.");
  if (file.size > (screenshot ? 5 * 1024 * 1024 : Math.min(format.max, 20 * 1024 * 1024))) throw new HttpError(422, "INVALID_FILE", screenshot ? "O print precisa ter até 5 MB." : tooBig(file.type));
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const matches = matchesSignature(file.type, bytes);
  if (!matches) throw new HttpError(422, "INVALID_FILE", "O conteúdo não corresponde ao tipo informado.");
  const gate = screenshot
    ? await rpc(a.admin, "app_feedback_screenshot_reserve", { p_actor_id: a.userInfo.id, p_attempt_key: resourceId, p_content_type: file.type, p_size_bytes: file.size })
    : await rpc(a.admin, "app_upload_access", { p_actor_id: a.userInfo.id, p_kind: kind, p_resource_id: resourceId, p_file_name: name, p_content_type: file.type, p_size_bytes: file.size });
  if (gate.bucket !== "icarus-private" || typeof gate.path !== "string" || gate.path.includes("..") || gate.path.startsWith("/")) throw new HttpError(403, "FORBIDDEN", "Upload não permitido.");
  if (screenshot && gate.status === "ready") return { id: gate.id, uploaded: true };
  const result = await a.admin.storage.from("icarus-private").upload(gate.path, file, { contentType: file.type, upsert: false, cacheControl: "120" });
  if (result.error) {
    const exists = await objectExists(a.admin, gate.path);
    if (!screenshot && !exists) await rpc(a.admin, "app_upload_cancel", { p_actor_id: a.userInfo.id, p_id: gate.id });
    if (!screenshot || !exists) throw new HttpError(503, "UPLOAD_FAILED", screenshot ? "Envio do print não confirmado. Tente novamente." : "Envio não confirmado. Consulte o recurso antes de tentar novamente.");
  }
  await rpc(a.admin, "app_upload_finalize", { p_actor_id: a.userInfo.id, p_id: gate.id });
  return screenshot ? { id: gate.id, uploaded: true } : { id: gate.id, storage_path: gate.path, uploaded: true };
}, d.env);
// O servidor busca e guarda a foto: quem vê o avatar não fala com o Gravatar.
async function saveGravatar(d: Dependencies, a: NonNullable<Awaited<ReturnType<typeof actor>>>) {
  const gate = await rpc(a.admin, "app_gravatar_context", { p_actor_id: a.userInfo.id });
  if (!gate?.check || typeof gate.email !== "string") return { avatar: false };
  const done = (uploadId: string | null) => rpc(a.admin, "app_gravatar_done", { p_actor_id: a.userInfo.id, p_upload_id: uploadId });
  let photo: Response;
  try {
    photo = await d.fetch(`https://gravatar.com/avatar/${await sha256(gate.email.trim().toLowerCase())}?s=160&d=404`, { redirect: "error", signal: AbortSignal.timeout(5_000) });
  } catch { return { avatar: false }; } // Rede ou tempo esgotado: a consulta volta no próximo acesso.
  if (photo.status === 404) { await photo.body?.cancel(); await done(null); return { avatar: false }; }
  if (!photo.ok) { await photo.body?.cancel(); return { avatar: false }; }
  const mime = photo.headers.get("content-type")?.split(";")[0].trim() ?? "";
  const bytes = ["image/jpeg", "image/png"].includes(mime) ? await boundedBody(photo, 100 * 1024).catch(() => null) : null;
  // Resposta definitiva com arquivo que não serve: marca como conferido para não repetir a cada acesso.
  if (!bytes?.length || !matchesSignature(mime, bytes)) { await photo.body?.cancel().catch(() => {}); await done(null); return { avatar: false }; }
  const reserved = await rpc(a.admin, "app_upload_access", { p_actor_id: a.userInfo.id, p_kind: "avatar", p_resource_id: a.userInfo.id, p_file_name: mime === "image/png" ? "gravatar.png" : "gravatar.jpg", p_content_type: mime, p_size_bytes: bytes.length });
  if (reserved.bucket !== "icarus-private" || typeof reserved.path !== "string" || reserved.path.includes("..") || reserved.path.startsWith("/")) throw new HttpError(403, "FORBIDDEN", "Upload não permitido.");
  const stored = await a.admin.storage.from("icarus-private").upload(reserved.path, new Blob([bytes], { type: mime }), { contentType: mime, upsert: false, cacheControl: "120" });
  if (stored.error) return { avatar: false }; // A reserva pendente expira sozinha; a consulta volta no próximo acesso.
  const result = await done(reserved.id);
  return { avatar: result?.avatar_id === reserved.id };
}
export const handler = createHandler();
if (import.meta.main) Deno.serve(handler);
