import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";

vi.hoisted(() => {
  vi.stubEnv("VITE_SUPABASE_URL", "http://127.0.0.1:58521");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-public-key");
});

import { cache } from "./api";
import { AdminCourses, CourseEditor } from "./pages/admin";

const fixtures: Record<string, { id: string; [key: string]: unknown }[]> = {
  courses: [
    {
      id: "c",
      title: "Curso editorial",
      slug: "editorial",
      status: "published",
      access_mode: "plans",
      certificate_enabled: true,
    },
  ],
  modules: [
    {
      id: "m",
      course_id: "c",
      title: "Fundamentos",
      slug: "fundamentos",
      status: "published",
      order_index: 0,
    },
  ],
  sections: [
    {
      id: "s",
      module_id: "m",
      title: "Prática",
      status: "published",
      order_index: 0,
    },
  ],
  lessons: [
    {
      id: "a",
      section_id: "s",
      title: "Exercício",
      slug: "exercicio",
      type: "video",
      status: "published",
      order_index: 0,
    },
    {
      id: "b",
      section_id: "s",
      title: "Revisão",
      slug: "revisao",
      type: "text",
      status: "draft",
      order_index: 1,
    },
  ],
  // O editor da aula lista os materiais vinculados.
  materials: [],
};
let records: typeof fixtures;
let calls: { url: string; body: Record<string, unknown> }[];

beforeEach(() => {
  records = structuredClone(fixtures);
  calls = [];
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
      calls.push({ url, body });
      let response: unknown = {};
      let status = 200;
      if (url.endsWith("/app_admin_list")) {
        const items = records[body.p_entity];
        response = {
          items,
          total: items.length,
          page: body.p_page,
          page_size: 20,
        };
      }
      if (url.endsWith("/app_admin_save")) {
        if (body.p_data.title) {
          status = 400;
          response = { message: "Vídeo inválido." };
        } else {
          Object.assign(
            records[body.p_entity].find(({ id }) => id === body.p_id)!,
            body.p_data,
          );
          response = { id: body.p_id };
        }
      }
      return new Response(JSON.stringify(response), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
});

afterEach(() => {
  cleanup();
  cache.clear();
  vi.unstubAllGlobals();
});

function show(route: string) {
  render(
    <QueryClientProvider client={cache}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path="/admin/cursos" element={<AdminCourses />} />
          <Route path="/admin/cursos/:id" element={<CourseEditor />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

it("abre a estrutura pela listagem e preserva a ordem confirmada pelo servidor", async () => {
  show("/admin/cursos");
  expect(
    await screen.findByRole("heading", { name: "Cursos e aulas" }),
  ).toBeInTheDocument();
  fireEvent.click(
    await screen.findByRole("link", { name: "Estrutura e aulas" }),
  );
  expect(await screen.findByText("1 módulo · 2 aulas")).toBeInTheDocument();
  const summary = screen.getByRole("group", { name: "Situação do curso" });
  expect(summary).toHaveTextContent("Publicado");
  expect(summary).toHaveTextContent("Planos selecionados");
  expect(summary).toHaveTextContent("Certificado disponível");
  expect(screen.queryByRole("button", { name: "Subir Revisão" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Reordenar" }));
  fireEvent.click(screen.getByRole("button", { name: "Subir Revisão" }));
  await waitFor(() =>
    expect(screen.getAllByRole("article")[0]).toHaveTextContent("Revisão"),
  );
  expect(
    calls
      .filter(({ url }) => url.endsWith("/app_admin_save"))
      .map(({ body }) => body),
  ).toEqual([
    { p_entity: "lessons", p_id: "b", p_data: { order_index: 0 } },
    { p_entity: "lessons", p_id: "a", p_data: { order_index: 1 } },
  ]);
});

it("foca o editor, preserva entradas após erro e restaura o foco ao fechar", async () => {
  show("/admin/cursos/c?aba=estrutura");
  const [trigger] = await screen.findAllByRole("button", {
    name: /^Editar aula /,
  });
  trigger.focus();
  fireEvent.click(trigger);
  const heading = screen.getByRole("heading", { name: "Editar aula" });
  expect(heading).toHaveFocus();
  expect(trigger).toHaveAttribute("aria-current", "true");
  const panel = within(heading.closest("section")!);
  expect(
    panel.getByRole("link", { name: "Prévia autorizada da aula" }),
  ).toHaveAttribute("href", "/app/cursos/editorial/fundamentos/~a");
  expect(
    panel.getByRole("link", { name: "Editar apresentação" }),
  ).toHaveAttribute("href", "/admin/cursos/c/aulas/a/apresentacao");
  const media = within(panel.getByRole("group", { name: "Mídia da aula" }));
  expect(media.getByLabelText("Tipo de aula")).toHaveValue("video");
  expect(media.getByLabelText("Vídeo do Bunny ou link do YouTube")).toBeInTheDocument();
  // A plataforma não recebe vídeo: a aula só usa o Bunny ou o YouTube.
  expect(media.queryByRole("button", { name: "Enviar arquivo" })).toBeNull();
  expect(media.queryByText(/arquivo de vídeo/i)).toBeNull();
  const title = panel.getByLabelText("Título");
  fireEvent.change(title, { target: { value: "Exercício revisado" } });
  fireEvent.click(panel.getByRole("button", { name: "Salvar conteúdo" }));
  expect(await panel.findByRole("alert")).toHaveTextContent("Vídeo inválido.");
  expect(title).toHaveValue("Exercício revisado");
  const save = calls.find(({ url }) => url.endsWith("/app_admin_save"))?.body;
  expect(save).toMatchObject({
    p_entity: "lessons",
    p_id: "a",
    p_data: { title: "Exercício revisado" },
  });
  expect(save?.p_data).not.toHaveProperty("section_id");
  fireEvent.click(panel.getByRole("button", { name: "Fechar editor" }));
  expect(trigger).toHaveFocus();
});

it("devolve o foco ao último disparador quando a seleção muda", async () => {
  show("/admin/cursos/c?aba=estrutura");
  const [first, second] = await screen.findAllByRole("button", {
    name: /^Editar aula /,
  });
  fireEvent.click(first);
  expect(screen.getByRole("heading", { name: "Editar aula" })).toHaveFocus();
  fireEvent.click(second);
  expect(screen.getByRole("heading", { name: "Editar aula" })).toHaveFocus();
  expect(screen.getByRole("textbox", { name: "Título" })).toHaveValue("Revisão");
  fireEvent.click(screen.getByRole("button", { name: "Fechar editor" }));
  expect(second).toHaveFocus();
});

it("aceita o link do YouTube no vídeo da aula e grava só o ID", async () => {
  show("/admin/cursos/c?aba=estrutura");
  const [trigger] = await screen.findAllByRole("button", { name: /^Editar aula / });
  fireEvent.click(trigger);
  const field = screen.getByLabelText("Vídeo do Bunny ou link do YouTube");
  fireEvent.change(field, { target: { value: "https://youtu.be/dQw4w9WgXcQ?si=compartilhado" } });
  fireEvent.click(screen.getByRole("button", { name: "Salvar conteúdo" }));
  await waitFor(() => expect(calls.some(({ url }) => url.endsWith("/app_admin_save"))).toBe(true));
  expect(calls.find(({ url }) => url.endsWith("/app_admin_save"))?.body.p_data).toMatchObject({ video_id: "dQw4w9WgXcQ" });
});

it("mostra como link a aula que já usa vídeo do YouTube", async () => {
  records.lessons[0] = { ...records.lessons[0], video_id: "dQw4w9WgXcQ" } as (typeof records.lessons)[number];
  show("/admin/cursos/c?aba=estrutura");
  const [trigger] = await screen.findAllByRole("button", { name: /^Editar aula / });
  fireEvent.click(trigger);
  expect(screen.getByLabelText("Vídeo do Bunny ou link do YouTube")).toHaveValue("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
});

it("recusa antes de salvar o que não é link do YouTube nem ID do Bunny", async () => {
  show("/admin/cursos/c?aba=estrutura");
  const [trigger] = await screen.findAllByRole("button", { name: /^Editar aula / });
  fireEvent.click(trigger);
  fireEvent.change(screen.getByLabelText("Vídeo do Bunny ou link do YouTube"), { target: { value: "https://vimeo.com/123" } });
  fireEvent.click(screen.getByRole("button", { name: "Salvar conteúdo" }));
  expect(await screen.findByText("Cole um link do YouTube ou o ID do vídeo no Bunny.")).toBeInTheDocument();
  expect(calls.some(({ url }) => url.endsWith("/app_admin_save"))).toBe(false);
});
