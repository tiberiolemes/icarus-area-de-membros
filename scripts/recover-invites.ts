import { createClient } from "npm:@supabase/supabase-js@2.119.2";
import { deliverPaidInvite } from "../supabase/functions/_shared/payment.ts";
import { uuid } from "../supabase/functions/_shared/http.ts";
// Explicit operator recovery: the DB outbox remains the sole payment authority.
if (import.meta.main) {
  try {
    const url = Deno.env.get("SUPABASE_URL")!, key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (Deno.env.get("ICARUS_MODE") !== "local" || url !== "http://127.0.0.1:58521") throw Error();
    const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const id = uuid(Deno.args[0]);
    const result = await deliverPaidInvite(admin, id, Deno.env.get("APP_ORIGIN") || "http://127.0.0.1:8088");
    console.log(JSON.stringify(result));
  } catch { console.error("Recuperação não concluída; nenhuma cobrança foi criada."); Deno.exitCode = 1; }
}
