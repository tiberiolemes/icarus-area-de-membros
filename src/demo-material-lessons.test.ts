import { beforeEach, expect, it, vi } from "vitest";

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

it("a demonstração vincula o material a várias aulas e o devolve para rascunho sem nenhuma", async () => {
  const rpc = await demo();
  const material = "00000000-0000-4000-8000-000000000062";
  const [first, second] = ["00000000-0000-4000-8000-000000000301", "00000000-0000-4000-8000-000000000302"];
  await rpc("app_admin_save", { p_entity: "materials", p_id: material, p_data: { status: "published", lesson_ids: [first, second] } });
  const listed = await rpc<{ items: { id: string; lesson_ids: string[] }[] }>("app_admin_list", { p_entity: "materials" });
  expect(listed.body.items.find(({ id }) => id === material)?.lesson_ids).toEqual([first, second]);
  expect((await rpc("app_admin_unlink_material", { p_material_id: material, p_lesson_id: first })).body)
    .toEqual({ id: material, status: "published" });
  expect((await rpc("app_admin_unlink_material", { p_material_id: material, p_lesson_id: second })).body)
    .toEqual({ id: material, status: "draft" });
  expect((await rpc("app_admin_unlink_material", { p_material_id: material, p_lesson_id: second })).ok).toBe(false);
});
