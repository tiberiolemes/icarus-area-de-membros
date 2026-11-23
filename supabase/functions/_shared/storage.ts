import type { SupabaseClient } from "npm:@supabase/supabase-js@2.119.2";
import { HttpError, type Env } from "./http.ts";
export function publicStorageUrl(signed: string, get: Env) {
  const source = new URL(signed), internal = new URL(get("SUPABASE_URL") || "");
  const configured = get("SUPABASE_PUBLIC_URL") || get("ICARUS_PUBLIC_SUPABASE_URL");
  const nativeLoopback = get("ICARUS_MODE") === "local" && ["http://127.0.0.1:58521", "http://localhost:58521"].includes(internal.origin);
  const destination = new URL(configured || (internal.protocol === "https:" || nativeLoopback ? internal.origin : "http://invalid"));
  const local = get("ICARUS_MODE") === "local" && ["http://127.0.0.1:58521", "http://localhost:58521"].includes(destination.origin);
  if (source.origin !== internal.origin || !source.pathname.startsWith("/storage/v1/object/sign/icarus-private/") || destination.username || destination.password || destination.pathname !== "/" || destination.search || destination.hash || (!local && destination.protocol !== "https:")) throw new HttpError(503, "CONFIGURATION_REQUIRED", "Endereço público do arquivo não configurado.");
  return destination.origin + source.pathname + source.search;
}
export async function objectExists(admin: SupabaseClient, path: string) {
  const separator = path.lastIndexOf("/"), folder = separator < 0 ? "" : path.slice(0, separator), name = path.slice(separator + 1);
  // Listing works across local Storage versions whose info/exists endpoint differs; never infer absence from an auth/network error.
  const result = await admin.storage.from("icarus-private").list(folder, { search: name, limit: 100 });
  if (result.error || !result.data || (result.data.length === 100 && !result.data.some((file) => file.name === name))) throw new HttpError(503, "STORAGE_UNAVAILABLE", "Não foi possível conferir o envio.");
  return result.data.some((file) => file.name === name && file.id !== null);
}
