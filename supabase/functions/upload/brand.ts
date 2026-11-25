import type { SupabaseClient } from "npm:@supabase/supabase-js@2.119.2";
import { rpc } from "../_shared/client.ts";
import { HttpError, text, uuid } from "../_shared/http.ts";
import { imageSize, matchesSignature } from "../_shared/files.ts";

type Actor = { admin: SupabaseClient; userInfo: { id: string }; profile: { role: string } };
const bucket = "icarus-brand";
const types: Record<string, string | undefined> = { png: "image/png", webp: "image/webp" };
// Logo horizontal, favicon quadrado e assinatura do certificado; o banco confere de novo tipo e caminho.
const rules = {
  light: { webp: true, square: false, min: [240, 60], max: 4096, size: "pelo menos 240 × 60 px e no máximo 4096 px de cada lado" },
  dark: { webp: true, square: false, min: [240, 60], max: 4096, size: "pelo menos 240 × 60 px e no máximo 4096 px de cada lado" },
  icon: { webp: false, square: true, min: [180, 180], max: 4096, size: "ser quadrado, com pelo menos 180 × 180 px e no máximo 4096 px" },
  signature: { webp: false, square: false, min: [200, 60], max: 2000, size: "pelo menos 200 × 60 px e no máximo 2000 px de cada lado" },
} as const;
type Variant = keyof typeof rules;
const label: Record<Variant, string> = { light: "A logo", dark: "A logo", icon: "O ícone", signature: "A assinatura" };

function variantOf(value: unknown): Variant {
  const variant = text(value, 16);
  if (!Object.hasOwn(rules, variant)) throw new HttpError(422, "INVALID_INPUT", "Escolha a logo, o ícone ou a assinatura.");
  return variant as Variant;
}
// Só a assinatura é de um curso.
function courseOf(variant: Variant, value: unknown) {
  return variant === "signature" ? uuid(value) : null;
}
// O banco confere de novo papel e AAL2; aqui só evita gravar no Storage por quem nunca poderia.
function requireAdmin(a: Actor) {
  if (a.profile.role !== "admin") throw new HttpError(403, "FORBIDDEN", "Só administradores alteram a marca e a assinatura.");
}

async function commit(a: Actor, variant: Variant, path: string | null, course: string | null) {
  const result = await rpc(a.admin, "app_brand_asset_commit", { p_actor_id: a.userInfo.id, p_variant: variant, p_path: path, p_course_id: course });
  // O anterior só sai depois de o banco apontar para o novo: uma falha aqui deixa um arquivo órfão, nunca uma imagem quebrada.
  if (typeof result?.previous === "string") await a.admin.storage.from(bucket).remove([result.previous]).catch(() => undefined);
  return variant === "signature"
    ? { signature_path: result?.signature_path ?? null }
    : { logo_light: result?.logo_light ?? null, logo_dark: result?.logo_dark ?? null, icon: result?.icon ?? null };
}

export async function saveBrandLogo(a: Actor, form: FormData) {
  const variant = variantOf(form.get("variant")), rule = rules[variant], course = courseOf(variant, form.get("course_id")), file = form.get("file");
  if (!(file instanceof File)) throw new HttpError(422, "INVALID_INPUT", "Escolha o arquivo da imagem.");
  const type = types[file.name.split(".").pop()!.toLowerCase()];
  if (!type || file.type !== type || (type === "image/webp" && !rule.webp)) throw new HttpError(422, "INVALID_FILE", `${label[variant]} precisa ser ${rule.webp ? "PNG ou WebP" : "PNG"}.`);
  if (file.size === 0 || file.size > 512000) throw new HttpError(422, "INVALID_FILE", `${label[variant]} precisa ter até 500 KB.`);
  const bytes = new Uint8Array(await file.slice(0, 32).arrayBuffer());
  const size = matchesSignature(type, bytes) ? imageSize(type, bytes) : null;
  if (!size) throw new HttpError(422, "INVALID_FILE", `O conteúdo do arquivo não é um ${rule.webp ? "PNG ou WebP" : "PNG"} válido.`);
  if (size.width < rule.min[0] || size.height < rule.min[1] || size.width > rule.max || size.height > rule.max || (rule.square && size.width !== size.height)) {
    throw new HttpError(422, "INVALID_FILE", `${label[variant]} precisa ${rule.size}.`);
  }
  requireAdmin(a);
  const path = await rpc(a.admin, "app_brand_asset_begin", { p_actor_id: a.userInfo.id, p_variant: variant, p_content_type: type });
  const prefix = variant === "light" || variant === "dark" ? `logo/${variant}-` : `${variant}/`;
  if (typeof path !== "string" || !path.startsWith(prefix) || path.includes("..")) throw new HttpError(503, "UPLOAD_FAILED", "Envio não confirmado. Tente novamente.");
  // Caminho novo a cada envio: a URL muda, então o cache pode ser longo sem servir imagem velha.
  const stored = await a.admin.storage.from(bucket).upload(path, file, { contentType: type, cacheControl: "31536000", upsert: false });
  if (stored.error) throw new HttpError(503, "UPLOAD_FAILED", "Envio não confirmado. Tente novamente.");
  try {
    return await commit(a, variant, path, course);
  } catch (error) {
    await a.admin.storage.from(bucket).remove([path]).catch(() => undefined);
    throw error;
  }
}

export async function removeBrandLogo(a: Actor, body: Record<string, unknown>) {
  const variant = variantOf(body.variant), course = courseOf(variant, body.course_id);
  requireAdmin(a);
  return await commit(a, variant, null, course);
}
