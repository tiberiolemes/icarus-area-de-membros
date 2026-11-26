import { beforeEach, expect, it, vi } from "vitest";
import type { Module } from "./api";

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

it("a demonstração cria a seção automática uma vez e a mantém antes das seções da equipe", async () => {
  const rpc = await demo();
  const moduleId = "00000000-0000-4000-8000-000000000201";
  const created = await rpc<string>("app_admin_default_section", { p_module_id: moduleId });
  expect(created.ok).toBe(true);
  expect((await rpc<string>("app_admin_default_section", { p_module_id: moduleId })).body).toBe(created.body);
  await rpc("app_admin_save", { p_entity: "lessons", p_id: null,
    p_data: { section_id: created.body, slug: "solta", title: "Aula solta", type: "text", status: "published", order_index: 0 } });
  const { body } = await rpc<{ modules: Module[] }>("app_course", { p_slug: "onboarding-equipes" });
  expect(body.modules[0].sections.map(({ title, is_default }) => [title, !!is_default]))
    .toEqual([["Aulas do módulo", true], ["Fundamentos", false]]);
  expect(body.modules[0].sections[0].lessons.map(({ title }) => title)).toEqual(["Aula solta"]);
  expect((await rpc("app_admin_default_section", { p_module_id: "inexistente" })).ok).toBe(false);
});

it("a demonstração já abre com um módulo sem seções visíveis", async () => {
  const rpc = await demo();
  const { body } = await rpc<{ modules: Module[] }>("app_course", { p_slug: "estrutura-cursos" });
  expect(body.modules[0].sections).toHaveLength(1);
  expect(body.modules[0].sections[0].is_default).toBe(true);
  expect(body.modules[0].sections[0].lessons.length).toBeGreaterThan(0);
});
