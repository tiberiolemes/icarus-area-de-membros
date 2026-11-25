import type { SupabaseClient } from "npm:@supabase/supabase-js@2.119.2";
import { rpc } from "../_shared/client.ts";
import { HttpError, text } from "../_shared/http.ts";
import { imageSize, matchesSignature } from "../_shared/files.ts";

type Actor = { admin: SupabaseClient; userInfo: { id: string }; profile: { role: string } };
const bucket = "icarus-brand";
const types: Record<string, string | undefined> = { png: "image/png", webp: "image/webp" };

function variantOf(value: unknown) {
  const variant = text(value, 8);
  if (variant !== "light" && variant !== "dark") throw new HttpError(422, "INVALID_INPUT", "Escolha a logo colorida ou a branca.");
  return variant;
}
// O banco confere de novo papel e AAL2; aqui só evita gravar no Storage por quem nunca poderia.
function requireAdmin(a: Actor) {
  if (a.profile.role !== "admin") throw new HttpError(403, "FORBIDDEN", "Só administradores alteram a logo.");
}

async function commit(a: Actor, variant: string, path: string | null) {
  const result = await rpc(a.admin, "app_brand_logo_commit", { p_actor_id: a.userInfo.id, p_variant: variant, p_path: path });
  // A anterior só sai depois de o banco apontar para a nova: uma falha aqui deixa um arquivo órfão, nunca uma logo quebrada.
  if (typeof result?.previous === "string") await a.admin.storage.from(bucket).remove([result.previous]).catch(() => undefined);
  return { logo_light: result?.logo_light ?? null, logo_dark: result?.logo_dark ?? null };
}

export async function saveBrandLogo(a: Actor, form: FormData) {
  const variant = variantOf(form.get("variant")), file = form.get("file");
  if (!(file instanceof File)) throw new HttpError(422, "INVALID_INPUT", "Escolha o arquivo da logo.");
  const type = types[file.name.split(".").pop()!.toLowerCase()];
  if (!type || file.type !== type) throw new HttpError(422, "INVALID_FILE", "A logo precisa ser PNG ou WebP.");
  if (file.size === 0 || file.size > 512000) throw new HttpError(422, "INVALID_FILE", "A logo precisa ter até 500 KB.");
  const bytes = new Uint8Array(await file.slice(0, 32).arrayBuffer());
  const size = matchesSignature(type, bytes) ? imageSize(type, bytes) : null;
  if (!size) throw new HttpError(422, "INVALID_FILE", "O conteúdo do arquivo não é um PNG ou WebP válido.");
  if (size.width < 240 || size.height < 60 || size.width > 4096 || size.height > 4096) {
    throw new HttpError(422, "INVALID_FILE", "A logo precisa ter pelo menos 240 × 60 px e no máximo 4096 px de cada lado.");
  }
  requireAdmin(a);
  const path = await rpc(a.admin, "app_brand_logo_begin", { p_actor_id: a.userInfo.id, p_variant: variant, p_content_type: type });
  if (typeof path !== "string" || !path.startsWith(`logo/${variant}-`) || path.includes("..")) throw new HttpError(503, "UPLOAD_FAILED", "Envio não confirmado. Tente novamente.");
  // Caminho novo a cada envio: a URL muda, então o cache pode ser longo sem servir logo velha.
  const stored = await a.admin.storage.from(bucket).upload(path, file, { contentType: type, cacheControl: "31536000", upsert: false });
  if (stored.error) throw new HttpError(503, "UPLOAD_FAILED", "Envio não confirmado. Tente novamente.");
  try {
    return await commit(a, variant, path);
  } catch (error) {
    await a.admin.storage.from(bucket).remove([path]).catch(() => undefined);
    throw error;
  }
}

export async function removeBrandLogo(a: Actor, value: unknown) {
  const variant = variantOf(value);
  requireAdmin(a);
  return await commit(a, variant, null);
}
