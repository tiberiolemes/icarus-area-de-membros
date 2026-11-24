import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";

vi.hoisted(() => {
  vi.stubEnv("VITE_SUPABASE_URL", "http://127.0.0.1:58521");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-public-key");
});

import { cache } from "./api";
import { AdminAnalytics } from "./pages/admin-analytics";

afterEach(() => {
  cleanup();
  cache.clear();
  vi.unstubAllGlobals();
});

function showReports(respond: (url: string, request: RequestInit) => Response) {
  const requests = vi.fn(async (url: string, request: RequestInit) => respond(url, request));
  vi.stubGlobal("fetch", requests);
  render(
    <QueryClientProvider client={cache}>
      <MemoryRouter>
        <AdminAnalytics dashboardPath="/admin" />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return requests;
}

it("explica catálogo vazio e não consulta um curso inexistente", async () => {
  const requests = showReports(() => Response.json({ items: [], total: 0, page: 1, page_size: 20 }));
  expect(await screen.findByText("Publique um curso para acompanhar o progresso.")).toBeVisible();
  expect(screen.getByRole("combobox", { name: "Curso selecionado" })).toBeDisabled();
  expect(requests).toHaveBeenCalledTimes(1);
});

it("mostra a recusa do servidor sem renderizar indicadores", async () => {
  showReports(() => Response.json(
    { code: "P0001", message: "Confirme o segundo fator para continuar." },
    { status: 400 },
  ));
  expect(await screen.findByRole("alert")).toHaveTextContent("Confirme o segundo fator");
  expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  expect(screen.queryByText("Iniciaram o curso")).not.toBeInTheDocument();
});

it("distingue a paginação de cursos da paginação de aulas e mantém cada recorte", async () => {
  showReports((url, request) => {
    const { p_page: page, p_course_id: course } = JSON.parse(String(request.body));
    if (url.endsWith("/app_admin_analytics_courses")) {
      return Response.json({ items: [{ id: `curso-${page}`, title: `Curso ${page}` }], total: 21, page, page_size: 20 });
    }
    return Response.json({
      started: 0, module_title: null, module_completed: null, course_completed: null,
      lessons: { items: [{
        id: `${course}-aula-${page}`, title: `Aula ${page} do ${course}`, module_title: "Módulo",
        duration_seconds: 60, registered: 0, completed: 0,
      }], total: 21, page, page_size: 20 },
    });
  });

  const courses = await screen.findByRole("navigation", { name: "Paginação de cursos" });
  const lessons = await screen.findByRole("navigation", { name: "Paginação de aulas" });
  fireEvent.click(within(lessons).getByRole("button", { name: "Próxima" }));
  expect(await screen.findByRole("rowheader", { name: /Aula 2 do curso-1/ })).toBeVisible();
  expect(screen.getByRole("combobox", { name: "Curso selecionado" })).toHaveValue("curso-1");

  fireEvent.click(within(courses).getByRole("button", { name: "Próxima" }));
  expect(await screen.findByRole("rowheader", { name: /Aula 1 do curso-2/ })).toBeVisible();
  expect(screen.getByRole("combobox", { name: "Curso selecionado" })).toHaveValue("curso-2");
});
