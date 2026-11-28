import { beforeEach, expect, it, vi } from "vitest";

beforeEach(() => {
  sessionStorage.clear();
  vi.resetModules();
});

async function demo(email = "admin@demo.icarus.test", password = "DemoAdmin123") {
  const { transport, url } = await import("../demo/transport");
  const { access_token } = await (await transport(url + "/auth/v1/token", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }),
  })).json();
  return async <T>(path: string, args: Record<string, unknown> = {}) => {
    const response = await transport(url + path, {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${access_token}` },
      body: JSON.stringify(args),
    });
    return { ok: response.ok, body: await response.json() as T };
  };
}
const ids = (rows: { items: { id: string }[] }) => rows.items.map(({ id }) => id);

it("a demonstração mostra o alcance e exclui o módulo com seções e aulas, devolvendo o material órfão a rascunho", async () => {
  const call = await demo();
  const module = "00000000-0000-4000-8000-000000000200", section = "00000000-0000-4000-8000-000000000250";
  const lessons = ["300", "301", "302"].map((n) => `00000000-0000-4000-8000-000000000${n}`);
  const material = "00000000-0000-4000-8000-000000000062";
  expect((await call("/rest/v1/rpc/app_admin_delete_preview", { p_entity: "modules", p_id: module })).body).toEqual({
    sections: 1, lessons: 3, materials: 0, folders: 0, students: 1, comments: 1, linked_materials: 0, orphaned_materials: 1,
  });
  expect((await call("/functions/v1/upload", { action: "delete", entity: "modules", id: module })).body)
    .toEqual({ deleted: true, files_removed: 0 });
  const list = async (entity: string) => (await call<{ items: { id: string; status?: string; lesson_ids?: string[] }[] }>("/rest/v1/rpc/app_admin_list", { p_entity: entity })).body;
  expect(ids(await list("modules"))).not.toContain(module);
  expect(ids(await list("sections"))).not.toContain(section);
  expect(ids(await list("lessons")).filter((id) => lessons.includes(id))).toEqual([]);
  expect((await list("materials")).items.find(({ id }) => id === material)).toMatchObject({ status: "draft", lesson_ids: [] });
  expect((await call("/functions/v1/upload", { action: "delete", entity: "modules", id: module })).ok).toBe(false);
});

it("a demonstração exclui a pasta com o material e recusa entidade fora da lista e quem não é admin", async () => {
  const call = await demo();
  const folder = "00000000-0000-4000-8000-000000000061";
  expect((await call("/rest/v1/rpc/app_admin_delete_preview", { p_entity: "material_folders", p_id: folder })).body)
    .toMatchObject({ folders: 0, materials: 1, linked_materials: 1, orphaned_materials: 0 });
  expect((await call("/functions/v1/upload", { action: "delete", entity: "courses", id: folder })).ok).toBe(false);
  expect((await call("/functions/v1/upload", { action: "delete", entity: "material_folders", id: folder })).ok).toBe(true);
  expect((await call<{ items: unknown[] }>("/rest/v1/rpc/app_admin_list", { p_entity: "materials" })).body.items).toEqual([]);
  vi.resetModules();
  const member = await demo("aluno@demo.icarus.test", "DemoAluno123");
  expect((await member("/functions/v1/upload", { action: "delete", entity: "lessons", id: "00000000-0000-4000-8000-000000000310" })).ok).toBe(false);
  expect((await member("/rest/v1/rpc/app_admin_delete_preview", { p_entity: "lessons", p_id: "00000000-0000-4000-8000-000000000310" })).ok).toBe(false);
});
