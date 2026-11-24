import assert from "node:assert/strict";
import { createHandler } from "../../supabase/functions/upload/index.ts";
import type { Dependencies } from "../../supabase/functions/_shared/client.ts";

const id = "11111111-1111-4111-8111-111111111111";
const path = `feedback-screenshot/${id}.png`;
const gate = { id, bucket: "icarus-private", path, status: "pending", expires_at: new Date(Date.now() + 900_000).toISOString() };

function fixture() {
  const calls: string[] = [];
  const client = {
    auth: {
      getUser: () => ({ data: { user: { id, email_confirmed_at: "2026-11-24" } } }),
      getClaims: () => ({ data: { claims: { sub: id, session_id: id, aal: "aal1" } } }),
    },
    rpc: (name: string) => {
      calls.push(name);
      if (name === "app_touch_session") return { data: {} };
      if (name === "app_bootstrap") return { data: { profile: { role: "member" } } };
      if (name === "app_upload_context" || name === "app_feedback_screenshot_reserve") return { data: gate };
      if (name === "app_upload_finalize") return { data: { id, path, state: "ready" } };
      throw new Error(`RPC fora da fixture: ${name}`);
    },
    storage: { from: () => ({
      upload: () => { calls.push("storage.upload"); return { data: { path } }; },
      createSignedUrl: () => { calls.push("storage.sign"); return { data: { signedUrl: "http://local.invalid/fixture" } }; },
    }) },
  };
  const d: Dependencies = { client: (() => client) as unknown as Dependencies["client"], env: () => "fixture",
    fetch: () => { throw new Error("A fixture não acessa a rede."); } };
  return { handler: createHandler(d), calls };
}

function multipart(name: string) {
  const body = new FormData();
  body.set("kind", "feedback-screenshot");
  body.set("resource_id", id);
  body.set("file", new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], name, { type: "image/png" }));
  return new Request("http://local.invalid/upload", { method: "POST", headers: { authorization: "Bearer fixture" }, body });
}

Deno.test("multipart de print exige nome e extensão reais antes de reservar", async () => {
  const { handler, calls } = fixture();
  for (const invalid of ["png", ".png", "foto.png.txt"]) {
    const response = await handler(multipart(invalid));
    assert.equal(response.status, 422);
    assert.equal((await response.json()).error.code, "INVALID_FILE");
  }
  assert(!calls.includes("app_feedback_screenshot_reserve"));
  assert(!calls.includes("storage.upload"));
  const response = await handler(multipart("foto.PNG"));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { id, uploaded: true });
  assert.deepEqual(calls.slice(-3), ["app_feedback_screenshot_reserve", "storage.upload", "app_upload_finalize"]);
});

Deno.test("finalização JSON recusa print próprio pelo namespace antes de assinar ou retornar path", async () => {
  const { handler, calls } = fixture();
  const response = await handler(new Request("http://local.invalid/upload", { method: "POST",
    headers: { authorization: "Bearer fixture", "content-type": "application/json" },
    body: JSON.stringify({ action: "finalize", upload_id: id }) }));
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error.code, "FORBIDDEN");
  assert.deepEqual(calls, ["app_touch_session", "app_bootstrap", "app_upload_context"]);
});
