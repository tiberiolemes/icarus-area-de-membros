import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";

vi.hoisted(() => {
  vi.stubEnv("VITE_SUPABASE_URL", "http://127.0.0.1:58521");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-public-key");
});

import { cache } from "./api";
import { AdminLessonComments } from "./pages/admin-lesson-comments";

const root = "/admin/comentarios-aula";
const course = { id: "demo-course", slug: "curso-teste", title: "Curso de teste", can_access: false };
const lesson = { id: "916ac1ab-3236-41f6-b175-137947819010", title: "Aula de teste", can_access: true };
const locked = { id: "916ac1ab-3236-41f6-b175-137947819011", title: "Aula restrita", can_access: false };
const comment = {
  id: "916ac1ab-3236-41f6-b175-137947819012", author_name: "Pessoa de teste",
  body: "Dúvida para revisar.", parent_id: null, status: "pending", is_instructor: false,
  created_at: "2026-11-24T12:00:00Z",
};
const coursePath = `${root}/${course.slug}`;

function show(role: string, path: string, reviewDenied = false) {
  let pending = true;
  const requests: { name: string; args: Record<string, unknown> }[] = [];
  const page = (items: unknown[], p: unknown = 1) => Response.json({ items, total: items.length, page: p, page_size: 20 });
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const name = String(input).split("/").at(-1)!;
    const args = JSON.parse(String(init?.body));
    requests.push({ name, args });
    switch (name) {
      case "app_catalog":
        return page([course], args.p_page);
      case "app_course":
        return Response.json({ course, modules: [{
          title: "Módulo de teste", can_access: false,
          sections: [{ title: "Seção de teste", lessons: [lesson, locked] }],
        }] });
      case "app_lesson_comments":
        return reviewDenied
          ? Response.json({ code: "P0001", message: "Aula indisponível para seu acesso." }, { status: 400 })
          : page(pending ? [comment] : []);
      case "app_moderate_lesson_comment":
        pending = false;
        return Response.json({ id: args.p_id, status: args.p_decision === "approve" ? "approved" : "rejected" });
      default:
        throw new Error(`RPC inesperada: ${name}`);
    }
  }));
  cache.setQueryData(["bootstrap", undefined], { profile: { role } });
  render(
    <QueryClientProvider client={cache}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/admin/comentarios-aula/:curso?/:lessonId?" element={<AdminLessonComments />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return requests;
}

afterEach(() => {
  cleanup();
  cache.clear();
  vi.unstubAllGlobals();
});

it("permite ao moderador localizar a aula e voltar aos cursos com a busca preservada", async () => {
  const requests = show("moderator", root);
  const search = screen.getByRole("searchbox", { name: "Buscar" });
  fireEvent.change(search, { target: { value: "Curso de teste" } });
  fireEvent.submit(screen.getByRole("search"));
  fireEvent.click(await screen.findByRole("link", { name: course.title }));
  const preview = await screen.findByRole("link", { name: /Aula de teste/ });
  expect(screen.queryByText(locked.title)).toBeNull();
  fireEvent.click(preview);
  expect(await screen.findByText(comment.body)).toBeVisible();
  expect(screen.getByRole("heading", { level: 1, name: lesson.title })).toBeVisible();
  expect(requests).toContainEqual({ name: "app_catalog", args: { p_query: "Curso de teste", p_page: 1 } });
  expect(requests).toContainEqual({ name: "app_lesson_comments", args: { p_lesson_id: lesson.id, p_page: 1, p_review: true } });
  expect(requests.some(({ name }) => name === "app_moderate_lesson_comment")).toBe(false);
  fireEvent.click(screen.getByRole("link", { name: "Aulas do curso" }));
  fireEvent.click(screen.getByRole("link", { name: "Cursos para moderação" }));
  expect(screen.getByRole("searchbox", { name: "Buscar" })).toHaveValue("Curso de teste");
  expect(screen.getByRole("link", { name: "Administração da comunidade" })).toHaveAttribute("href", "/admin/comunidade");
});

it.each([
  ["admin", "approve", "Comentário aprovado."],
  ["moderator", "reject", "Comentário rejeitado."],
])("abre a fila por link direto para %s e encaminha a decisão ao servidor", async (role, decision, status) => {
  const requests = show(role, `${coursePath}/${lesson.id}`);
  const reason = await screen.findByRole("textbox", { name: "Motivo" });
  fireEvent.change(screen.getByRole("combobox", { name: "Decisão" }), { target: { value: decision } });
  fireEvent.input(reason, { target: { value: "Motivo de teste." } });
  fireEvent.click(screen.getByRole("button", { name: "Registrar decisão" }));
  expect(await screen.findByText(status)).toBeVisible();
  expect(await screen.findByText("Nenhum comentário aguardando moderação nesta aula.")).toBeVisible();
  expect(requests).toContainEqual({
    name: "app_moderate_lesson_comment",
    args: { p_lesson_id: lesson.id, p_id: comment.id, p_decision: decision, p_reason: "Motivo de teste." },
  });
});

it.each(["member", "instructor", "support"])("oculta a fila e suas consultas para %s", async (role) => {
  const requests = show(role, `${coursePath}/${lesson.id}`);
  expect(await screen.findByRole("alert")).toHaveTextContent("Você não tem permissão para esta área.");
  expect(requests).toHaveLength(0);
});

it.each([locked.id, "916ac1ab-3236-41f6-b175-137947819013", "id-invalido"])(
  "recusa link direto fora do currículo acessível (%s)", async (id) => {
    const requests = show("moderator", `${coursePath}/${id}`);
    expect(await screen.findByRole("alert")).toHaveTextContent("Aula indisponível para moderação neste curso.");
    expect(requests.map(({ name }) => name)).toEqual(id === "id-invalido" ? [] : ["app_course"]);
  },
);

it("exibe a negativa do servidor mesmo com aula acessível no currículo carregado", async () => {
  show("moderator", `${coursePath}/${lesson.id}`, true);
  expect(await screen.findByRole("alert")).toHaveTextContent("Aula indisponível para seu acesso.");
  expect(screen.queryByRole("button", { name: "Registrar decisão" })).toBeNull();
  expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeVisible();
});
