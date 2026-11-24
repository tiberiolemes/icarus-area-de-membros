import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { cache } from "./api";
import { Certificates } from "./pages/certificates";
import { LessonPage } from "./pages/learning";
import { NotificationBell, notificationListKey } from "./pages/notifications";

vi.hoisted(() => {
  vi.stubEnv("VITE_SUPABASE_URL", "http://127.0.0.1:58521");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-public-key");
});
vi.mock("./auth", async (original) => ({ ...await original<typeof import("./auth")>(),
  useAuth: () => ({ session: { user: { id: "titular" } } }),
}));

const lesson = { id: "lesson", title: "Aula certificável", slug: "aula", completed: false, can_access: true, type: "text", duration_seconds: 120 };
const course = { id: "course", slug: "curso", title: "Curso certificável", total_lessons: 1, required_lessons: 1, can_access: true };
const module = { id: "module", slug: "modulo", title: "Módulo", can_access: true,
  sections: [{ id: "section", title: "Seção", lessons: [lesson] }],
};
const otherMember = [...notificationListKey("outro"), 1];
const empty = { items: [], page: 1, page_size: 20, total: 0, unread_count: 0 };
const notice = {
  id: "notification", event_key: "certificate_issued", title: "Certificado emitido", subtitle: course.title,
  action_path: "/app/certificados", created_at: "2026-11-24T13:00:00Z", read_at: null,
};
const json = (data: unknown) => new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } });

function mount(entry: "certificate" | "lesson", issues = true, firstNotificationFetch?: Promise<Response>) {
  let issued = false, completed = false;
  let notificationFetches = 0;
  const requests: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const name = String(url).split("/").at(-1)!;
    requests.push(name);
    let data;
    switch (name) {
      case "app_notifications":
        if (++notificationFetches === 1 && firstNotificationFetch) return firstNotificationFetch;
        data = issued ? { ...empty, items: [notice], total: 1, unread_count: 1 } : empty;
        break;
      case "app_certificates": data = { items: [], courses: [{ ...course, title: course.title, completed_lessons: 1, progress_percent: 100, can_issue: !issued }] }; break;
      case "app_issue_certificate": issued = true; data = { certificate_code: "certificate" }; break;
      case "app_course": data = { course, modules: [module] }; break;
      case "app_lesson": data = { course, module, lesson, materials: [], can_access: true, position_seconds: 0, completed }; break;
      case "app_progress": {
        const { p_complete } = JSON.parse(String(init?.body));
        if (p_complete) completed = true;
        if (p_complete && issues) issued = true;
        data = { course_progress_percent: 100, certificate_code: issued ? "certificate" : null };
        break;
      }
      case "app_lesson_engagement": data = { saved: false, notes_count: 0, comments_count: 0 }; break;
      case "app_lesson_presentation": data = { presentation: null, checked_ids: [] }; break;
      default: throw new Error(`Requisição inesperada para ${name}`);
    }
    return json(data);
  }));
  cache.setQueryData(otherMember, empty);
  render(<QueryClientProvider client={cache}>
    <MemoryRouter initialEntries={[entry === "certificate" ? "/app/certificados" : "/app/cursos/curso/modulo/aula"]}>
      <NotificationBell memberId="titular" />
      <Routes>
        <Route path="/app/certificados" element={<Certificates />} />
        <Route path="/app/cursos/:curso/:modulo/:aula" element={<LessonPage />} />
      </Routes>
    </MemoryRouter>
  </QueryClientProvider>);
  return requests;
}

afterEach(() => { cleanup(); cache.clear(); vi.unstubAllGlobals(); });

// The browser hides the alternate responsive label with CSS.
const completionLabel = /^Marcar como concluída/;

it.each([
  ["certificate", "Emitir certificado"],
  ["lesson", completionLabel],
] as const)("atualiza o sino fechado do titular quando %s confirma a emissão", async (entry, button) => {
  const requests = mount(entry);
  expect(screen.getByRole("button", { name: "Notificações" })).toBeInTheDocument();
  fireEvent.click(await screen.findByRole("button", { name: button }));
  expect(await screen.findByRole("button", { name: "Notificações, 1 não lida" })).toHaveAttribute("aria-expanded", "false");
  expect(requests.filter((name) => name === "app_notifications")).toHaveLength(2);
  expect(cache.getQueryState(otherMember)?.isInvalidated).toBe(false);
});

it.each([
  ["certificate", "Emitir certificado"],
  ["lesson", completionLabel],
] as const)("descarta a primeira consulta quando %s emite antes da resposta inicial", async (entry, button) => {
  let releaseFirst!: (response: Response) => void;
  const first = new Promise<Response>((resolve) => { releaseFirst = resolve; });
  const staleResponse = json(empty);
  const decodeFirst = vi.spyOn(staleResponse, "text");
  const queryKey = [...notificationListKey("titular"), 1];
  const requests = mount(entry, true, first);
  const action = await screen.findByRole("button", { name: button });
  expect(requests.filter((name) => name === "app_notifications")).toHaveLength(1);
  expect(cache.getQueryData(queryKey)).toBeUndefined();

  fireEvent.click(action);
  await waitFor(() => expect(requests.filter((name) => name === "app_notifications")).toHaveLength(2));
  const bell = await screen.findByRole("button", { name: "Notificações, 1 não lida" });
  expect(bell).toHaveAttribute("aria-expanded", "false");

  await act(async () => releaseFirst(staleResponse));
  expect(decodeFirst).toHaveBeenCalledOnce();
  await act(async () => { await decodeFirst.mock.results[0].value; });
  expect(bell).toHaveAccessibleName("Notificações, 1 não lida");
  expect(cache.getQueryData(queryKey)).toMatchObject({ unread_count: 1, items: [{ id: notice.id, unread: true }] });
  expect(cache.getQueryState(otherMember)?.isInvalidated).toBe(false);
});

it("mantém o sino sem reconsulta ao salvar ou concluir uma aula sem emissão", async () => {
  const requests = mount("lesson", false);
  fireEvent.click(await screen.findByRole("button", { name: "Salvar ponto de retomada" }));
  await screen.findByText("Ponto de retomada confirmado pelo servidor.");
  fireEvent.click(screen.getByRole("button", { name: completionLabel }));
  await screen.findByText("Aula concluída");
  await waitFor(() => expect(requests.filter((name) => name === "app_notifications")).toHaveLength(1));
});
