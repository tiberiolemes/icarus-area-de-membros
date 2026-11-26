import { beforeEach, expect, it, vi } from "vitest";
import type { Certificate } from "./api";

beforeEach(() => {
  sessionStorage.clear();
  vi.resetModules();
});

async function demo() {
  const { transport, url } = await import("../demo/transport");
  const { access_token } = await (await transport(url + "/auth/v1/token", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "admin@demo.icarus.test", password: "DemoAdmin123" }),
  })).json();
  return async <T>(name: string, args: Record<string, unknown> = {}) => {
    const response = await transport(`${url}/rest/v1/rpc/${name}`, {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${access_token}` },
      body: JSON.stringify(args),
    });
    return { ok: response.ok, body: await response.json() as T };
  };
}

it("a demonstração usa o modelo global no certificado e respeita o curso personalizado", async () => {
  const rpc = await demo();
  const course = "00000000-0000-4000-8000-000000000100";
  expect((await rpc("app_admin_certificate_defaults")).body).toEqual({ signer_name: "Equipe de demonstração", signer_title: "Coordenação pedagógica", signature_path: null });
  expect((await rpc("app_admin_save_certificate_defaults", { p_signer_name: "Ab", p_signer_title: "Direção" })).ok).toBe(false);
  expect((await rpc("app_admin_save_certificate_defaults", { p_signer_name: " Ana Souza ", p_signer_title: "Direção" })).body)
    .toEqual({ signer_name: "Ana Souza", signer_title: "Direção", signature_path: null });
  for (const lesson of ["300", "301", "302"]) await rpc("app_progress", { p_lesson_id: `00000000-0000-4000-8000-000000000${lesson}`, p_complete: true });
  const issued = async () => (await rpc<{ items: Certificate[] }>("app_certificates")).body.items.find((item) => item.id === course);
  expect(await issued()).toMatchObject({ signer_name: "Ana Souza", signer_title: "Direção" });
  await rpc("app_admin_save", { p_entity: "courses", p_id: course, p_data: { signer_name: "Carla Dias", signer_title: "Tutoria" } });
  expect(await issued()).toMatchObject({ signer_name: "Carla Dias", signer_title: "Tutoria" });
});
