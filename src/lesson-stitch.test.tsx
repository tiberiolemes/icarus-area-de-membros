import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { cache } from "./api";
import { LessonPage } from "./pages/learning";

vi.hoisted(() => {
  vi.stubEnv("VITE_SUPABASE_URL", "http://127.0.0.1:58521");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-public-key");
});

const textLesson = { id: "6dd0a182-c806-412f-9aa5-ac7f819c7cb2", slug: "atual", title: "Aula atual de teste", duration_seconds: 180, type: "text", completed: false, can_access: true };
const nextLesson = { ...textLesson, id: "ff9bd951-cfc7-4722-aeaf-c29bcec9b84b", slug: "seguinte", title: "Próximo tópico" };
const lessonRoot = "/app/cursos/curso/modulo";
const material = { id: "material", name: "Material de teste", description: "", file_type: "application/pdf", size_bytes: 700, can_access: true };

function mount({ type = "text", allowed = true, cover = false, coverResponse = true, provider = "supabase",
  path = lessonRoot + "/atual", collision = false, nextAllowed = true, otherModule = false,
  progressFailure = Promise.resolve(false), mediaError = false } = {}) {
  if (type === "video" && provider === "supabase") {
    const tracks = Object.assign(new EventTarget(), { length: 0 }) as TextTrackList;
    vi.spyOn(HTMLMediaElement.prototype, "textTracks", "get").mockReturnValue(tracks);
  }
  const requests: { name: string; args: unknown }[] = [];
  const lesson = { ...textLesson, type, can_access: allowed };
  const following = { ...nextLesson, slug: collision ? lesson.slug : nextLesson.slug, can_access: nextAllowed };
  let completed = false;
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const name = String(input).split("/").at(-1)!;
    const args = JSON.parse(String(init?.body));
    requests.push({ name, args });
    const course = {
      id: "course", slug: "curso", title: "Curso de teste", total_lessons: 2,
      cover_url: cover ? "https://example.test/not-authorized-as-src.jpg" : null,
      completed_lessons: completed ? 1 : 0, required_lessons: 0, progress_percent: 0,
    };
    const mod = { id: "module", slug: "modulo", title: "Módulo de teste", can_access: true, sections: [
      { id: "section", title: "Seção de teste", lessons: collision ? [{ ...lesson, completed }] : [{ ...lesson, completed }, following] },
      ...(collision ? [{ id: "other-section", title: "Outra seção", lessons: [following] }] : []),
    ] };
    let body;
    switch (name) {
      case "app_course": body = { course, modules: otherModule
        ? [mod, { ...mod, id: "other", slug: "outro-modulo", sections: [] }] : [mod] }; break;
      case "app_lesson_engagement": body = { saved: false, notes_count: 0, comments_count: 2 }; break;
      case "app_lesson_notes": body = { items: [], total: 0, page: 1, page_size: 20 }; break;
      case "app_lesson": {
        const isFollowing = args.p_id === following.id;
        const selected = isFollowing ? following : lesson;
        body = {
          course, module: mod,
          lesson: { ...selected, body: isFollowing ? "<p>Leitura da segunda seção</p>" : "<p>Leitura autorizada de teste</p>" },
          materials: [material], position_seconds: 42, completed, can_access: selected.can_access,
          previous_id: isFollowing ? lesson.id : null, next_id: isFollowing ? null : following.id,
        };
        break;
      }
      case "media":
        if (args.kind === "course-cover") {
          if (!coverResponse) return new Response(JSON.stringify({ error: "Indisponível" }), { status: 404 });
          body = { url: "https://example.test/private/authorized-cover.jpg" };
        } else if (mediaError) {
          return new Response(JSON.stringify({ error: { code: "CONFIGURATION_REQUIRED", message: "Endereço público do arquivo não configurado." } }), { status: 503 });
        } else {
          body = {
            url: provider === "bunny" ? "https://player.mediadelivery.net/embed/1/video" : "https://example.test/private/test.mp3",
            provider, expires_at: "2099-01-01",
          };
        }
        break;
      case "app_progress":
        if (await progressFailure) return new Response(JSON.stringify({ message: "Progresso indisponível" }), { status: 503 });
        if (args.p_complete) completed = true;
        body = { course_progress_percent: completed ? 50 : 0 };
        break;
      default: throw new Error(`Requisição inesperada para ${name}`);
    }
    return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
  });
  vi.stubGlobal("fetch", fetch);
  render(
    <QueryClientProvider client={cache}>
      <MemoryRouter initialEntries={[path]}>
        <Routes><Route path="/app/cursos/:curso/:modulo/:aula" element={<LessonPage />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return requests;
}

afterEach(() => { cleanup(); cache.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("mantém o link antigo na primeira seção e navega à aula exata pelo currículo e entre aulas", async () => {
  const requests = mount({ collision: true });
  await screen.findByText("Leitura autorizada de teste");
  const aside = screen.getByRole("complementary", { name: "Conteúdo do curso" });
  expect(within(aside).getByRole("link", { current: "page" })).toHaveAttribute("href", lessonRoot + "/~" + textLesson.id);
  fireEvent.change(within(aside).getByRole("searchbox"), { target: { value: "Próximo" } });
  const following = within(aside).getByRole("link", { name: /Próximo tópico/ });
  expect(following).toHaveAttribute("href", lessonRoot + "/~" + nextLesson.id);
  expect(screen.getByRole("link", { name: "Próxima aula" })).toHaveAttribute("href", lessonRoot + "/~" + nextLesson.id);
  fireEvent.click(following);
  await screen.findByText("Leitura da segunda seção");
  expect(screen.getByRole("link", { name: "Aula anterior" })).toHaveAttribute("href", lessonRoot + "/~" + textLesson.id);
  expect(requests.filter(({ name }) => name === "app_lesson").map(({ args }) => args))
    .toEqual([{ p_id: textLesson.id }, { p_id: nextLesson.id }]);
});

it.each([true, false])("reabre por URL direta a segunda aula e usa o gate do servidor (acesso %s)", async (nextAllowed) => {
  const requests = mount({ collision: true, path: lessonRoot + "/~" + nextLesson.id, nextAllowed });
  if (nextAllowed) {
    expect(await screen.findByText("Leitura da segunda seção")).toBeVisible();
  } else {
    expect(await screen.findByRole("link", { name: "Ver planos disponíveis" })).toBeVisible();
    expect(screen.queryByText("Leitura da segunda seção")).not.toBeInTheDocument();
    expect(requests.map(({ name }) => name)).toEqual(["app_course", "app_lesson"]);
  }
  expect(requests.filter(({ name }) => name === "app_lesson").map(({ args }) => args))
    .toEqual([{ p_id: nextLesson.id }]);
});

it("rejeita o ID de uma aula em outro módulo", async () => {
  const requests = mount({ path: "/app/cursos/curso/outro-modulo/~" + nextLesson.id, otherModule: true });
  await screen.findByRole("heading", { name: "Aula indisponível" });
  expect(requests.map(({ name }) => name)).toEqual(["app_course"]);
});

it("preserva a descrição, foco das abas e lista filtrável ao alternar o modo foco", async () => {
  mount();
  await screen.findByText("Leitura autorizada de teste");
  expect(screen.getByRole("navigation", { name: "Navegação entre aulas" })).toContainElement(screen.getByRole("link", { name: "Próxima aula" }));
  const description = screen.getByRole("tab", { name: "Descrição da aula" });
  description.focus();
  fireEvent.keyDown(description, { key: "ArrowRight" });
  expect(screen.getByRole("tab", { name: "Materiais e downloads 1" })).toHaveFocus();
  expect(screen.getByText("Material de teste")).toBeVisible();
  fireEvent.keyDown(screen.getByRole("tab", { name: "Materiais e downloads 1" }), { key: "End" });
  expect(screen.getByRole("tab", { name: "Anotações pessoais" })).toHaveFocus();
  fireEvent.click(screen.getByRole("button", { name: "Fazer anotação" }));
  await waitFor(() => expect(screen.getByRole("textbox", { name: "Suas anotações pessoais" })).toHaveFocus());
  fireEvent.keyDown(screen.getByRole("tab", { name: "Anotações pessoais" }), { key: "Home" });
  expect(description).toHaveFocus();
  const sidebar = screen.getByRole("complementary", { name: "Conteúdo do curso" });
  expect(within(sidebar).getByRole("link", { current: "page" })).toHaveTextContent(textLesson.title);
  const input = within(sidebar).getByRole("searchbox");
  fireEvent.change(input, { target: { value: "Próximo" } });
  expect(within(sidebar).queryByText(textLesson.title)).toBeNull();
  expect(within(sidebar).getByRole("link", { name: /Próximo tópico/ })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Ocultar conteúdos" }));
  expect(sidebar).not.toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Mostrar conteúdos" }));
  expect(input).toBeVisible();
  expect(input).toHaveValue("Próximo");
});

it("mantém o gate antes de solicitar áudio ou exibir descrição, material ou conclusão", async () => {
  const requests = mount({ type: "audio", allowed: false });
  expect(await screen.findByRole("link", { name: "Ver planos disponíveis" })).toBeVisible();
  expect(requests.map(({ name }) => name)).toEqual(["app_course", "app_lesson"]);
  expect(screen.queryByText("Leitura autorizada de teste")).toBeNull();
  expect(screen.queryByRole("tab", { name: /Materiais/ })).toBeNull();
  expect(screen.queryByRole("button", { name: "Favoritar aula" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Marcar como concluída" })).toBeNull();
});

it("pede a capa pelo ID do curso após autorizar vídeo Storage e a retira no primeiro play", async () => {
  const requests = mount({ type: "video", cover: true });
  const video = await screen.findByLabelText(textLesson.title) as HTMLVideoElement;
  const image = await waitFor(() => {
    const image = document.querySelector(".stitch-lesson-cover img");
    expect(image).not.toBeNull();
    return image!;
  });
  expect(requests.filter(({ name }) => name === "media").map(({ args }) => args)).toEqual([
    { kind: "lesson", id: textLesson.id },
    { kind: "course-cover", id: "course" },
  ]);
  expect(image).toHaveAttribute("src", "https://example.test/private/authorized-cover.jpg");
  expect(image.parentElement).toHaveAttribute("hidden");
  fireEvent.load(image);
  expect(image.parentElement).not.toHaveAttribute("hidden");
  fireEvent.loadedMetadata(video);
  expect(video.currentTime).toBe(42);
  fireEvent.play(video);
  expect(document.querySelector(".stitch-lesson-cover")).toBeNull();
  fireEvent.pause(video);
  expect(document.querySelector(".stitch-lesson-cover")).toBeNull();
  expect(video).toHaveAttribute("src", "https://example.test/private/test.mp3");
});

it("volta ao vídeo se a imagem assinada falhar ao carregar", async () => {
  mount({ type: "video", cover: true });
  const video = await screen.findByLabelText(textLesson.title);
  await waitFor(() => expect(document.querySelector(".stitch-lesson-cover img")).not.toBeNull());
  fireEvent.error(document.querySelector(".stitch-lesson-cover img")!);
  expect(document.querySelector(".stitch-lesson-cover")).toBeNull();
  expect(video).toBeInTheDocument();
});

it("mantém o vídeo quando a Edge não libera a capa", async () => {
  const requests = mount({ type: "video", cover: true, coverResponse: false });
  const video = await screen.findByLabelText(textLesson.title);
  await waitFor(() => expect(requests).toContainEqual({ name: "media", args: { kind: "course-cover", id: "course" } }));
  expect(document.querySelector(".stitch-lesson-cover")).toBeNull();
  expect(video).toBeInTheDocument();
});

it.each([
  { type: "video", allowed: false, provider: "supabase" },
  { type: "audio", allowed: true, provider: "supabase" },
  { type: "video", allowed: true, provider: "bunny" },
])("não consulta a capa para $type, acesso $allowed, provedor $provider", async (scenario) => {
  const requests = mount({ ...scenario, cover: true });
  if (!scenario.allowed) await screen.findByRole("link", { name: "Ver planos disponíveis" });
  else if (scenario.provider === "bunny") await screen.findByText("Preparando controles do player…");
  else await screen.findByLabelText(textLesson.title);
  expect(requests).not.toContainEqual({ name: "media", args: { kind: "course-cover", id: "course" } });
  expect(document.querySelector(".stitch-lesson-cover")).toBeNull();
});

it("preserva os controles nativos no carregamento e sincroniza progresso e currículo com o vídeo", async () => {
  vi.spyOn(HTMLMediaElement.prototype, "currentSrc", "get").mockReturnValue("https://example.test/private/test.mp3");
  vi.spyOn(HTMLMediaElement.prototype, "readyState", "get").mockReturnValue(1);
  const requests = mount({ type: "video" });
  const video = await screen.findByLabelText(textLesson.title) as HTMLVideoElement;
  expect(requests).not.toContainEqual({ name: "media", args: { kind: "course-cover", id: "course" } });
  const current = screen.getByRole("link", { current: "page" });
  expect(video).toHaveAttribute("playsinline");
  expect(video.controls).toBe(true);
  fireEvent.loadedMetadata(video);
  expect(video.currentTime).toBe(42);
  expect(current).toHaveTextContent("Aula atual");
  video.currentTime = 48;
  fireEvent.click(screen.getByRole("button", { name: "Salvar ponto de retomada" }));
  await waitFor(() => expect(requests).toContainEqual({
    name: "app_progress", args: { p_lesson_id: textLesson.id, p_position_seconds: 48, p_complete: false },
  }));
  fireEvent.play(video);
  expect(current).toHaveTextContent("Em reprodução");
  video.currentTime = 57;
  fireEvent.timeUpdate(video);
  fireEvent.pause(video);
  expect(current).not.toHaveTextContent("Em reprodução");
  await waitFor(() => expect(requests).toContainEqual({
    name: "app_progress", args: { p_lesson_id: textLesson.id, p_position_seconds: 57, p_complete: false },
  }));
});

it("carrega áudio autorizado, restaura o ponto e confirma a conclusão via RPC", async () => {
  const requests = mount({ type: "audio" });
  const audio = await screen.findByLabelText(textLesson.title) as HTMLAudioElement;
  expect(audio.tagName).toBe("AUDIO");
  expect(requests).toContainEqual({ name: "media", args: { kind: "lesson", id: textLesson.id } });
  fireEvent.loadedMetadata(audio);
  expect(audio.currentTime).toBe(42);
  audio.currentTime = 57;
  fireEvent.timeUpdate(audio);
  const complete = screen.getByRole("button", { name: /Marcar como concluída/ });
  complete.focus();
  fireEvent.click(complete);
  expect(await screen.findByText("Aula concluída")).toHaveFocus();
  expect(await screen.findByLabelText("50% do curso concluído")).toBeVisible();
  await waitFor(() => expect(requests).toContainEqual({
    name: "app_progress", args: { p_lesson_id: textLesson.id, p_position_seconds: 57, p_complete: true },
  }));
});

it("mantém o foco na retomada enquanto envia e após o erro, sem duplicar o RPC", async () => {
  let fail!: (value: boolean) => void;
  const progressFailure = new Promise<boolean>((resolve) => { fail = resolve; });
  const requests = mount({ progressFailure });
  const resume = await screen.findByRole("button", { name: "Salvar ponto de retomada" });
  resume.focus();
  fireEvent.click(resume);
  expect(resume).toHaveFocus();
  expect(resume).toHaveAttribute("aria-disabled", "true");
  fireEvent.click(resume);
  fail(true);
  expect(await screen.findByText("Progresso indisponível")).toHaveAttribute("role", "alert");
  expect(resume).toHaveFocus();
  expect(resume).not.toHaveAttribute("aria-disabled");
  expect(requests.filter(({ name }) => name === "app_progress")).toHaveLength(1);
});

it("mostra ao aluno uma mensagem simples e a nova tentativa quando a mídia não está configurada", async () => {
  mount({ type: "video", mediaError: true });
  expect(await screen.findByText("Não foi possível carregar o vídeo agora. Tente de novo; se continuar, avise o suporte.")).toBeVisible();
  expect(screen.getByRole("button", { name: "Tentar carregar vídeo" })).toBeVisible();
  expect(screen.queryByText("Endereço público do arquivo não configurado.")).not.toBeInTheDocument();
});
