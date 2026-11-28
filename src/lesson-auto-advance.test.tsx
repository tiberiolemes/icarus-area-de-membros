import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { cache } from "./api";
import { LessonPage } from "./pages/learning";
import { watchYouTubeEnded } from "./youtube-ended";

vi.hoisted(() => {
  vi.stubEnv("VITE_SUPABASE_URL", "http://127.0.0.1:58521");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-public-key");
});
// useBootstrap lê o useAuth de dentro do módulo, então o teste troca os dois.
vi.mock("./auth", async (original) => {
  const { useQuery } = await import("@tanstack/react-query");
  const { rpc } = await import("./api");
  return { ...await original<typeof import("./auth")>(),
    useAuth: () => ({ session: { user: { id: "aluno" } } }),
    useBootstrap: () => useQuery({ queryKey: ["bootstrap", "aluno"], queryFn: () => rpc("app_bootstrap") }),
  };
});

const current = { id: "6dd0a182-c806-412f-9aa5-ac7f819c7cb2", slug: "atual", title: "Aula atual", duration_seconds: 180, type: "text", completed: false, can_access: true };
const following = { ...current, id: "ff9bd951-cfc7-4722-aeaf-c29bcec9b84b", slug: "seguinte", title: "Aula seguinte" };
const switchName = "Avançar para a próxima aula automaticamente";

function mount({ autoAdvance = false, type = "text", provider = "supabase", next = true, nextAllowed = true, certificate = false as false | "issued" | "existing" } = {}) {
  if (type === "video") {
    const tracks = Object.assign(new EventTarget(), { length: 0 }) as TextTrackList;
    vi.spyOn(HTMLMediaElement.prototype, "textTracks", "get").mockReturnValue(tracks);
  }
  const requests: { name: string; args: Record<string, unknown> }[] = [];
  let completed = false, preference = autoAdvance;
  const lesson = { ...current, type };
  const nextLesson = { ...following, can_access: nextAllowed };
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const name = String(input).split("/").at(-1)!;
    const args = JSON.parse(String(init?.body ?? "{}"));
    requests.push({ name, args });
    const course = { id: "course", slug: "curso", title: "Curso", total_lessons: 2, completed_lessons: 0, required_lessons: 0, progress_percent: 0 };
    const mod = { id: "module", slug: "modulo", title: "Módulo", can_access: true,
      sections: [{ id: "section", title: "Seção", lessons: next ? [{ ...lesson, completed }, nextLesson] : [{ ...lesson, completed }] }] };
    const profile = () => ({ id: "aluno", full_name: "Aluno", theme: "light", role: "member", auto_advance: preference });
    let body;
    switch (name) {
      case "app_bootstrap": body = { profile: profile(), plans: [], settings: {} }; break;
      case "app_profile": preference = args.p_data.auto_advance; body = profile(); break;
      case "app_course": body = { course, modules: [mod] }; break;
      case "app_lesson_engagement": body = { saved: false, notes_count: 0, comments_count: 0 }; break;
      case "app_lesson_presentation": body = { presentation: null, checked_ids: [] }; break;
      case "app_lesson": {
        const isNext = args.p_id === following.id;
        body = { course, module: mod, lesson: { ...(isNext ? nextLesson : lesson), body: isNext ? "<p>Texto da aula seguinte</p>" : "<p>Texto da aula atual</p>" },
          materials: [], position_seconds: 0, completed: isNext ? false : completed, can_access: isNext ? nextAllowed : true,
          previous_id: isNext ? current.id : null, next_id: isNext || !next ? null : following.id };
        break;
      }
      case "media":
        body = { url: provider === "bunny" ? "https://player.mediadelivery.net/embed/1/video" : "https://example.test/private/aula.mp4", provider, expires_at: "2099-01-01" };
        break;
      case "app_progress":
        if (args.p_complete) completed = true;
        // O servidor devolve o código também quando o certificado já existia; só certificate_issued diz se esta conclusão emitiu.
        body = { course_progress_percent: 50, certificate_code: certificate && args.p_complete ? "certificado" : null,
          certificate_issued: certificate === "issued" && args.p_complete === true };
        break;
      case "app_notifications": body = { items: [], page: 1, page_size: 20, total: 0, unread_count: 0 }; break;
      default: throw new Error(`Requisição inesperada para ${name}`);
    }
    return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
  }));
  render(
    <QueryClientProvider client={cache}>
      <MemoryRouter initialEntries={["/app/cursos/curso/modulo/atual"]}>
        <Routes><Route path="/app/cursos/:curso/:modulo/:aula" element={<LessonPage />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return requests;
}

const completions = (requests: { name: string; args: Record<string, unknown> }[]) =>
  requests.filter(({ name, args }) => name === "app_progress" && args.p_complete === true);

async function endVideo(provider: string) {
  if (provider === "bunny") {
    await waitFor(() => expect(bunnyListeners.has("ended")).toBe(true));
    act(() => bunnyListeners.get("ended")?.());
  } else {
    fireEvent.ended(await screen.findByLabelText("Aula atual", { selector: "video" }));
  }
}

const bunnyListeners = new Map<string, () => void>();
function stubBunny() {
  bunnyListeners.clear();
  vi.stubGlobal("playerjs", {
    Player: class {
      on = (event: string, handler: () => void) => bunnyListeners.set(event, handler);
      off = (event: string) => bunnyListeners.delete(event);
      receive = vi.fn();
      setCurrentTime = vi.fn();
    },
  });
}

afterEach(() => { vi.useRealTimers(); cleanup(); cache.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("interruptor grava a preferência no perfil", async () => {
  const requests = mount();
  const toggle = await screen.findByRole("switch", { name: switchName });
  expect(toggle).toHaveAttribute("aria-checked", "false");
  fireEvent.click(toggle);
  await waitFor(() => expect(screen.getByRole("switch", { name: switchName })).toHaveAttribute("aria-checked", "true"));
  expect(requests.filter(({ name }) => name === "app_profile").map(({ args }) => args)).toEqual([{ p_data: { auto_advance: true } }]);
});

it("com a opção ligada, Marcar como concluída leva à próxima aula", async () => {
  const requests = mount({ autoAdvance: true });
  await screen.findByText("Texto da aula atual");
  await waitFor(() => expect(screen.getByRole("switch", { name: switchName })).toHaveAttribute("aria-checked", "true"));
  fireEvent.click(screen.getByRole("button", { name: /^Marcar como concluída/ }));
  expect(await screen.findByText("Texto da aula seguinte")).toBeVisible();
  expect(completions(requests)).toHaveLength(1);
});

it("com a opção desligada, Marcar como concluída fica na aula", async () => {
  const requests = mount();
  await screen.findByText("Texto da aula atual");
  await screen.findByRole("switch", { name: switchName });
  fireEvent.click(screen.getByRole("button", { name: /^Marcar como concluída/ }));
  expect(await screen.findByText("Aula concluída")).toBeVisible();
  expect(screen.getByText("Texto da aula atual")).toBeVisible();
  expect(requests.filter(({ name }) => name === "app_lesson").every(({ args }) => args.p_id === current.id)).toBe(true);
});

it.each(["supabase", "bunny"])("fim do vídeo com a opção ligada conclui a aula e conta 5 segundos com Ir agora e Cancelar (%s)", async (provider) => {
  if (provider === "bunny") stubBunny();
  const requests = mount({ autoAdvance: true, type: "video", provider });
  await waitFor(() => expect(screen.getByRole("switch", { name: switchName })).toHaveAttribute("aria-checked", "true"));
  await endVideo(provider);
  expect(await screen.findByText("Próxima aula em 5 segundos")).toHaveAttribute("aria-live", "polite");
  expect(completions(requests)).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Ir agora" }));
  expect(await screen.findByText("Texto da aula seguinte")).toBeVisible();
});

it("Cancelar fica na aula", async () => {
  mount({ autoAdvance: true, type: "video" });
  await waitFor(() => expect(screen.getByRole("switch", { name: switchName })).toHaveAttribute("aria-checked", "true"));
  await endVideo("supabase");
  await screen.findByText("Próxima aula em 5 segundos");
  vi.useFakeTimers({ shouldAdvanceTime: true });
  fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
  await act(async () => { vi.advanceTimersByTime(6_000); });
  expect(screen.queryByText(/Próxima aula em/)).toBeNull();
  expect(screen.queryByText("Texto da aula seguinte")).toBeNull();
  expect(await screen.findByText("Aula concluída")).toBeVisible();
});

it("após 5 segundos a rota é a da próxima aula", async () => {
  mount({ autoAdvance: true, type: "video" });
  await waitFor(() => expect(screen.getByRole("switch", { name: switchName })).toHaveAttribute("aria-checked", "true"));
  vi.useFakeTimers({ shouldAdvanceTime: true });
  await endVideo("supabase");
  await screen.findByText("Próxima aula em 5 segundos");
  for (let second = 4; second >= 1; second--) {
    await act(async () => { vi.advanceTimersByTime(1_000); });
    expect(screen.getByText(`Próxima aula em ${second} ${second === 1 ? "segundo" : "segundos"}`)).toBeVisible();
  }
  await act(async () => { vi.advanceTimersByTime(1_000); });
  expect(await screen.findByText("Texto da aula seguinte")).toBeVisible();
});

it("fim do vídeo com a opção desligada não conclui nem avança", async () => {
  const requests = mount({ type: "video" });
  await screen.findByRole("switch", { name: switchName });
  await endVideo("supabase");
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(completions(requests)).toHaveLength(0);
  expect(screen.queryByText(/Próxima aula em/)).toBeNull();
});

it.each([
  ["sem próxima aula", { next: false }],
  ["próxima aula sem acesso", { nextAllowed: false }],
  ["conclusão que emite certificado", { certificate: "issued" as const }],
])("não avança sem próxima aula, para aula sem acesso ou quando sai certificado (%s)", async (_case, options) => {
  const requests = mount({ autoAdvance: true, type: "video", ...options });
  await waitFor(() => expect(screen.getByRole("switch", { name: switchName })).toHaveAttribute("aria-checked", "true"));
  await endVideo("supabase");
  await waitFor(() => expect(completions(requests)).toHaveLength(1));
  expect(await screen.findByText("Aula concluída")).toBeVisible();
  expect(screen.queryByText(/Próxima aula em/)).toBeNull();
  expect(screen.getByText("Texto da aula atual")).toBeVisible();
});

it("aluno já certificado avança na aula bônus", async () => {
  mount({ autoAdvance: true, certificate: "existing" });
  await waitFor(() => expect(screen.getByRole("switch", { name: switchName })).toHaveAttribute("aria-checked", "true"));
  fireEvent.click(screen.getByRole("button", { name: /^Marcar como concluída/ }));
  expect(await screen.findByText("Texto da aula seguinte")).toBeVisible();
  expect(screen.queryByText(/certificado emitido/)).toBeNull();
});

it("conclusão que emite certificado avisa a emissão e fica na aula", async () => {
  mount({ autoAdvance: true, certificate: "issued" });
  await waitFor(() => expect(screen.getByRole("switch", { name: switchName })).toHaveAttribute("aria-checked", "true"));
  fireEvent.click(screen.getByRole("button", { name: /^Marcar como concluída/ }));
  expect(await screen.findByText("Aula concluída e certificado emitido. Consulte seus certificados.")).toBeVisible();
  expect(screen.getByText("Texto da aula atual")).toBeVisible();
});

it("watchYouTubeEnded ignora mensagem de outra origem e chama onEnded no estado 0", () => {
  const iframe = document.createElement("iframe");
  document.body.append(iframe);
  const post = vi.spyOn(iframe.contentWindow!, "postMessage");
  const onEnded = vi.fn();
  const stop = watchYouTubeEnded(iframe, onEnded);
  iframe.dispatchEvent(new Event("load"));
  expect(post.mock.calls).toEqual([
    [JSON.stringify({ event: "listening" }), "https://www.youtube-nocookie.com"],
    [JSON.stringify({ event: "command", func: "addEventListener", args: ["onStateChange"] }), "https://www.youtube-nocookie.com"],
  ]);
  const send = (origin: string, data: unknown, source: MessageEventSource | null = iframe.contentWindow) =>
    window.dispatchEvent(new MessageEvent("message", { origin, source, data: JSON.stringify(data) }));
  send("https://evil.example", { event: "onStateChange", info: 0 });
  send("https://www.youtube-nocookie.com", { event: "onStateChange", info: 0 }, window);
  send("https://www.youtube-nocookie.com", { event: "onStateChange", info: 1 });
  expect(onEnded).not.toHaveBeenCalled();
  send("https://www.youtube-nocookie.com", { event: "onStateChange", info: 0 });
  expect(onEnded).toHaveBeenCalledTimes(1);
  stop();
  send("https://www.youtube-nocookie.com", { event: "onStateChange", info: 0 });
  expect(onEnded).toHaveBeenCalledTimes(1);
  iframe.remove();
});
