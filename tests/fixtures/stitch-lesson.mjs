import { createReadStream, statSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createServer } from "vite";
import { initialLessonChecklist, lessonObjective, lessonPresentation } from "./lesson-presentation/content.mjs";
import { mobileLesson } from "./lesson-presentation/mobile-content.mjs";

const [directory, root = process.cwd(), portText = "8097", posterMode] = process.argv.slice(2);
if (!directory) throw new Error("Informe o diretório temporário dos vídeos da fixture.");
const port = Number(portText);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Porta inválida para a fixture.");
const origin = `http://127.0.0.1:${port}`;
const referencePoster = posterMode === "reference";
const mobile = posterMode === "mobile-cover";
const referenceCover = posterMode === "cover" || mobile;
const route = "/app/cursos/marketing-para-saas/pricing/arquitetura-de-planos";
const user = { id: "936e8600-06e1-4621-9cef-83c13df2d23a", aud: "authenticated", role: "authenticated" };
const expires = Math.floor(Date.now() / 1000) + 3600;
const token = [
  { alg: "HS256", typ: "JWT" },
  { sub: user.id, exp: expires, aal: "aal1" },
  "synthetic-signature",
].map((part) => Buffer.from(JSON.stringify(part)).toString("base64url")).join(".");
const session = { access_token: token, refresh_token: "fixture-only", expires_at: expires, expires_in: 3600, token_type: "bearer", user };
process.env.VITE_SUPABASE_URL = origin;
process.env.VITE_SUPABASE_ANON_KEY = "fixture-only";

const scenarios = mobile ? { light: mobileLesson("light"), dark: mobileLesson("dark") } : {
  light: { duration: 1125, position: 614, course: "Aprenda Marketing para seu SaaS", lesson: "Aula 3.2: Arquitetura de Planos e Curva de Valor LTV" },
  dark: { duration: 868, position: 536, course: "Marketing para SaaS", lesson: "Arquitetura de Planos: Como Precificar com Base no Valor Percebido" },
};

for (const [theme, scenario] of Object.entries(scenarios)) {
  const brightness = theme === "light" ? 0.85 : 0.60;
  const input = referencePoster
    ? ["-loop", "1", "-framerate", "1", "-i", `${directory}/${theme}-poster.qa`]
    : ["-f", "lavfi", "-i", "color=c=0xcccccc:s=1920x1080:r=1"];
  const frameFilter = referencePoster
    ? `scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,format=rgb24,colorchannelmixer=rr=${brightness}:gg=${brightness}:bb=${brightness}`
    : "lutyuv=y=186:u=128:v=129";
  const video = spawnSync("ffmpeg", [
    "-loglevel", "error", "-y", ...input,
    "-t", String(scenario.duration), "-an", "-c:v", "libx264", "-preset", "ultrafast",
    "-vf", frameFilter,
    "-pix_fmt", "yuv420p", "-colorspace", "bt709", "-color_primaries", "bt709",
    "-color_trc", "iec61966-2-1", "-movflags", "+faststart", `${directory}/${theme}.mp4`,
  ], { stdio: "inherit" });
  if (video.status !== 0) throw new Error("ffmpeg não gerou o vídeo sintético.");
}

function fixture(theme) {
  const scenario = scenarios[theme];
  const moduleNames = ["Fundamentos de Growth B2B", "Canais Orgânicos & Engenharia de Conteúdo", "Pricing & Embalagem Estratégica", "Templates Notion de Negociação", "Engenharia de Expansão e Churn Zero", "Masterclass: De $0 a $1M ARR"];
  const moduleDefinitions = scenario.modules ?? moduleNames.map((name, index) => [name, [5, 3, 3, 1, 1, 2][index]]);
  const modules = moduleDefinitions.map(([title, count], index) => {
    const allowed = index < (mobile ? 3 : 4);
    const lessons = Array.from({ length: count }, (_, lessonIndex) => ({
      id: `lesson-${index}-${lessonIndex}`, slug: `aula-${lessonIndex + 1}`,
      title: `Aula ${lessonIndex + 1} de ${title}`, duration_seconds: 600,
      type: "video", order_index: lessonIndex, can_access: allowed, completed: index < 2,
    }));
    if (index === 2 && scenario.lessons) {
      scenario.lessons.forEach(([title, duration_seconds], lessonIndex) => {
        Object.assign(lessons[lessonIndex], { title, duration_seconds, completed: lessonIndex === 0,
          can_access: theme === "dark" || lessonIndex < 2 });
      });
      lessons[1].slug = "arquitetura-de-planos";
    } else if (index === 2) {
      Object.assign(lessons[0], { title: "Anatomia do Willingness-to-Pay", duration_seconds: 675, completed: true });
      Object.assign(lessons[1], { slug: "arquitetura-de-planos", title: scenario.lesson, duration_seconds: scenario.duration });
      Object.assign(lessons[2], { title: "Testes A/B de Tabela de Preços", duration_seconds: 1120 });
    }
    return { id: `module-${index}`, slug: index === 2 ? "pricing" : `modulo-${index + 1}`, title, order_index: index,
      can_access: allowed, sections: [{ id: `section-${index}`, title, order_index: 0, is_bonus: index === 3, lessons }] };
  });
  const totalLessons = modules.reduce((total, module) => total + module.sections[0].lessons.length, 0);
  const completedLessons = modules.reduce((total, module) => total + module.sections[0].lessons.filter(({ completed }) => completed).length, 0);
  const course = { id: "course", slug: "marketing-para-saas", title: scenario.course, description: "", cover_url: referenceCover ? "fixture/course-cover" : null,
    status: "published", access_mode: "plans", plan_ids: ["pro"], certificate_enabled: false,
    required_lessons: totalLessons, total_lessons: totalLessons, completed_lessons: completedLessons,
    progress_percent: Math.round(completedLessons * 100 / totalLessons), duration_seconds: 9193, can_access: true };
  const materials = [
    ["Calculadora WTP.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", 2400000],
    ["Playbook de Pricing.pdf", "application/pdf", 8100000],
    ["Slides Apresentados.key", "application/vnd.apple.keynote", 14000000],
  ].map(([name, file_type, size_bytes], index) => ({
    id: `material-${index}`, name, description: "", file_type, size_bytes, folder_id: "folder", lesson_ids: ["lesson-2-1"], can_access: true,
  }));
  const comments = Array.from({ length: 12 }, (_, index) => ({
    id: `comment-${index + 1}`,
    author_name: index ? `Participante da fixture ${index + 1}` : "Rafael Meneghel",
    body: index ? `Comentário sintético de teste ${index + 1} sobre a aula.`
      : "Como vocês lidam com a resistência inicial dos clientes antigos ao fazer a transição de plano único para planos com métrica de consumo?",
    parent_id: null, status: "approved", is_instructor: false, created_at: "2026-11-22T15:00:00Z",
  }));
  return {
    course, modules, materials, position: scenario.position, saved: false, comments, notes: [],
    objective: scenario.objective ?? lessonObjective,
    presentation: scenario.presentation ?? lessonPresentation(theme === "dark"),
    checkedIds: [...(scenario.checkedIds ?? initialLessonChecklist)],
  };
}

const state = { light: fixture("light"), dark: fixture("dark") };
const send = (response, data, status = 200) => {
  response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  response.end(JSON.stringify(data));
};
function serveVideo(request, response, theme) {
  const file = `${directory}/${theme}.mp4`;
  const size = statSync(file).size;
  const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range ?? "");
  const start = range ? Number(range[1]) : 0;
  const end = range && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
  if (start > end) {
    response.writeHead(416, { "Content-Range": `bytes */${size}` });
    response.end();
    return;
  }
  response.writeHead(range ? 206 : 200, {
    "Content-Type": "video/mp4", "Accept-Ranges": "bytes", "Content-Length": end - start + 1,
    ...(range ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {}),
  });
  createReadStream(file, { start, end }).pipe(response);
}

const server = await createServer({
  root,
  cacheDir: resolve(directory, "vite-cache"),
  server: { host: "127.0.0.1", port, strictPort: true, hmr: false },
  plugins: [{
    name: "stitch-lesson-fixture",
    configureServer(vite) {
      vite.middlewares.use(async (request, response, next) => {
        const url = new URL(request.url, origin);
        const path = url.pathname;
        const theme = request.headers.cookie?.includes("stitch-theme=dark") ? "dark" : "light";
        const data = state[theme];
        if (path === "/__stitch/open") {
          const selected = url.searchParams.get("theme") === "dark" ? "dark" : "light";
          state[selected] = fixture(selected);
          response.writeHead(200, {
            "Content-Type": "text/html; charset=UTF-8",
            "Set-Cookie": `stitch-theme=${selected}; Path=/; SameSite=Strict`,
            "Cache-Control": "no-store",
          });
          response.end(`<!doctype html><script>localStorage.setItem("sb-127-auth-token", JSON.stringify(${JSON.stringify(session)})); location.replace(${JSON.stringify(route)});</script>`);
          return;
        }
        if (path === "/__stitch/video") return serveVideo(request, response, theme);
        if (path === "/__stitch/cover" && referenceCover) {
          response.writeHead(200, { "Content-Type": "image/jpeg", "Cache-Control": "no-store" });
          createReadStream(`${directory}/${theme}-poster.qa`).pipe(response);
          return;
        }
        if (path === "/auth/v1/user") return send(response, user);
        if (path === "/rest/v1/rpc/app_touch_session") return send(response, {
          expires_at: new Date(expires * 1000).toISOString(), warning_seconds: 60,
        });
        if (path === "/rest/v1/rpc/app_bootstrap") return send(response, {
          profile: { id: user.id, full_name: "Alex Vance", phone: "", bio: "", company: {}, role: "member", theme,
            plan_name: "Membro Pro", access_ends_at: null, suspended: false, onboarding_complete: true },
          plans: [], settings: {},
        });
        if (path === "/rest/v1/rpc/app_catalog") return send(response, { items: [data.course], total: 1, page: 1, page_size: 12 });
        if (path === "/rest/v1/rpc/app_course") return send(response, { course: data.course, modules: data.modules });
        if (path === "/rest/v1/rpc/app_notifications") {
          const unread = theme === "dark" ? 3 : 1;
          const items = Array.from({ length: unread }, (_, index) => ({
            id: `fixture-notification-${index}`, event_key: "lesson_comment_approved",
            title: "Comentário aprovado na fixture", subtitle: null, action_path: route,
            created_at: "2026-11-24T12:00:00Z", read_at: null,
          }));
          return send(response, { items, total: unread, page: 1, page_size: 20, unread_count: unread });
        }
        if (!path.startsWith("/rest/v1/") && !path.startsWith("/functions/v1/")) return next();

        let raw = "";
        for await (const chunk of request) raw += chunk;
        const args = raw ? JSON.parse(raw) : {};
        if (path === "/functions/v1/media" && args.kind === "course-cover" && referenceCover && args.id === data.course.id) {
          return send(response, { url: `${origin}/__stitch/cover`, provider: "supabase", expires_at: new Date(Date.now() + 900000).toISOString() });
        }
        if (path === "/rest/v1/rpc/app_lesson") {
          const module = data.modules.find((item) => item.sections[0].lessons.some((lesson) => lesson.id === args.p_id));
          const lessons = module?.sections[0].lessons ?? [];
          const index = lessons.findIndex((lesson) => lesson.id === args.p_id);
          const lesson = lessons[index];
          if (!lesson) return send(response, { message: "Aula inexistente na fixture." }, 404);
          const current = lesson.id === "lesson-2-1";
          return send(response, {
            lesson: lesson.can_access ? { ...lesson, body: current ? data.objective : "" } : lesson,
            course: data.course, module, materials: current ? data.materials : [], position_seconds: current ? data.position : 0,
            completed: lesson.completed, previous_id: lessons[index - 1]?.id ?? null, next_id: lessons[index + 1]?.id ?? null,
            can_access: lesson.can_access,
          });
        }
        if (path === "/functions/v1/media" && args.kind === "lesson") {
          const lesson = data.modules.flatMap((module) => module.sections[0].lessons).find(({ id }) => id === args.id);
          return lesson?.can_access
            ? send(response, { url: `${origin}/__stitch/video?lesson=${lesson.id}`, provider: "supabase", expires_at: new Date(Date.now() + 900000).toISOString() })
            : send(response, { message: "Acesso negado pela fixture." }, 403);
        }
        if (path.startsWith("/rest/v1/rpc/") && args.p_lesson_id) {
          const lesson = data.modules.flatMap((module) => module.sections[0].lessons).find(({ id }) => id === args.p_lesson_id);
          if (!lesson?.can_access) return send(response, { message: "Acesso negado pela fixture." }, 403);
          const isCurrent = lesson.id === "lesson-2-1";
          const page = (items) => ({ items, total: items.length, page: args.p_page ?? 1, page_size: 20 });
          switch (path.split("/").at(-1)) {
            case "app_lesson_presentation":
              if (args.p_edit !== false) return send(response, { message: "Edição fora do recorte da fixture." }, 403);
              return send(response, {
                presentation: isCurrent ? data.presentation : null,
                checked_ids: isCurrent ? data.checkedIds : [],
              });
            case "app_lesson_checklist_item":
              if (!isCurrent || !data.presentation.checklist.some(({ id }) => id === args.p_item_id) || typeof args.p_checked !== "boolean")
                return send(response, { message: "Item de checklist inválido." }, 422);
              data.checkedIds = data.checkedIds.filter((id) => id !== args.p_item_id);
              if (args.p_checked) data.checkedIds.push(args.p_item_id);
              return send(response, { checked: args.p_checked });
            case "app_lesson_engagement":
              return send(response, { saved: isCurrent && data.saved, notes_count: isCurrent ? data.notes.length : 0, comments_count: isCurrent ? data.comments.length : 0 });
            case "app_lesson_comments": return send(response, page(isCurrent ? data.comments : []));
            case "app_lesson_notes": return send(response, page(isCurrent ? data.notes : []));
            case "app_lesson_favorite":
              data.saved = args.p_saved === true;
              return send(response, { saved: data.saved });
            case "app_save_lesson_note": {
              const note = { id: args.p_id ?? crypto.randomUUID(), body: args.p_body, position_seconds: args.p_position_seconds, updated_at: new Date().toISOString() };
              data.notes = [note, ...data.notes.filter(({ id }) => id !== note.id)];
              return send(response, { id: note.id });
            }
            case "app_save_lesson_comment": {
              const comment = { id: crypto.randomUUID(), author_name: "Alex Vance", body: args.p_body, parent_id: args.p_parent_id,
                status: "pending", is_instructor: false, created_at: new Date().toISOString() };
              data.comments = [comment, ...data.comments];
              return send(response, { id: comment.id, status: comment.status });
            }
            case "app_delete_lesson_note":
              data.notes = data.notes.filter(({ id }) => id !== args.p_id);
              return send(response, { id: args.p_id });
          }
        }
        if (path === "/rest/v1/rpc/app_progress") {
          const lesson = data.modules.flatMap((module) => module.sections[0].lessons).find(({ id }) => id === args.p_lesson_id);
          if (!lesson?.can_access) return send(response, { message: "Acesso negado pela fixture." }, 403);
          if (args.p_lesson_id === "lesson-2-1") data.position = args.p_position_seconds;
          if (args.p_complete && !lesson.completed) {
            lesson.completed = true;
            data.course.completed_lessons += 1;
            data.course.progress_percent = Math.round(data.course.completed_lessons / data.course.total_lessons * 100);
          }
          return send(response, { course_progress_percent: data.course.progress_percent });
        }
        return send(response, { message: "Operação fora do recorte da fixture." }, 501);
      });
    },
  }],
});
await server.listen();
console.log(`${origin}/__stitch/open?theme=light  |  ${origin}/__stitch/open?theme=dark`);
