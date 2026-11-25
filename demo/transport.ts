import type { Certificate, Post, Profile, Ticket } from "../src/api";
import { demoAccounts } from "./accounts";
import roteiro from "./roteiro.txt?raw";
import { date, demoId, futureDay, legalVersions, material, plans, seed, spaces, videoUrl, type Row } from "./fixtures";
export { demoAccounts } from "./accounts";

export const url = "https://demo.icarus.invalid";
export const key = "simulacao-local-sem-credencial";
const stateKey = "icarus-static-demo-data-v3";
const state = (() => {
  try {
    const saved = sessionStorage.getItem(stateKey);
    return saved ? JSON.parse(saved) as ReturnType<typeof seed> : seed();
  } catch {
    return seed();
  }
})();

type Args = Record<string, unknown>;
const str = (value: unknown) => String(value ?? "");
const matches = (pattern: string, ...fields: unknown[]) =>
  fields.some((field) => str(field).toLocaleLowerCase("pt-BR").includes(pattern.toLocaleLowerCase("pt-BR")));
const paginate = <T>(all: T[], page: unknown = 1) => {
  const number = Math.max(1, Number(page) || 1);
  return { items: all.slice((number - 1) * 20, number * 20), total: all.length, page: number, page_size: 20 };
};
const store = () => sessionStorage.setItem(stateKey, JSON.stringify(state));
const expires = () => new Date(Date.now() + 3_600_000).toISOString();
let video: Promise<string> | undefined;
let attachment: string | undefined;
function getVideo() {
  return video ??= fetch(videoUrl).then(async (response) => {
    if (!response.ok) throw new Error("Vídeo de demonstração indisponível.");
    return URL.createObjectURL(await response.blob());
  }).catch((error) => {
    video = undefined;
    throw error;
  });
}
const fail = (message: string, status = 400, code = "P0001") => Response.json({ message, code }, { status });
const user = (profile: Profile) => ({
  id: profile.id, aud: "authenticated", role: "authenticated", email: profile.email,
  factors: [], app_metadata: { provider: "email", providers: ["email"] }, user_metadata: {},
  created_at: date, email_confirmed_at: date,
});
function token(profile: Profile) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const encode = (part: unknown) => btoa(JSON.stringify(part)).replace(/=+$/, "").replaceAll("+", "-").replaceAll("/", "_");
  const access_token = [
    encode({ alg: "HS256", typ: "JWT" }),
    encode({ sub: profile.id, aud: "authenticated", exp, aal: "aal1", amr: ["password"] }),
    encode("demo"),
  ].join(".");
  return { access_token, refresh_token: profile.id, token_type: "bearer", expires_in: 3600, expires_at: exp, user: user(profile) };
}

const progressOf = (profile: Profile) => state.progress[profile.id] ??= {};
function courseDetail(course: Row, profile: Profile) {
  const canAccess = course.access_mode !== "plans" || profile.role === "admin" ||
    (Array.isArray(course.plan_ids) && course.plan_ids.includes(plans[0].id));
  const progress = progressOf(profile);
  const modules = state.records.modules.filter((module) => module.course_id === course.id && module.status === "published").map((module) => ({
    ...module, can_access: canAccess,
    sections: state.records.sections.filter((section) => section.module_id === module.id).map((section) => ({
      ...section,
      lessons: state.records.lessons.filter((lesson) => lesson.section_id === section.id && lesson.status === "published")
        .map((lesson) => ({ ...lesson, can_access: canAccess || !!lesson.is_preview, completed: !!progress[lesson.id]?.completed })),
    })),
  }));
  const lessons = modules.flatMap((module) => module.sections.flatMap((section) => section.lessons));
  const done = lessons.filter((lesson) => lesson.completed).length;
  const dto = {
    ...course, can_access: canAccess, cover_url: null, certificate_enabled: !!course.certificate_enabled, required_lessons: lessons.length,
    total_lessons: lessons.length, completed_lessons: done,
    progress_percent: lessons.length ? Math.floor(done * 100 / lessons.length) : 0,
    duration_seconds: lessons.reduce((total, lesson) => total + Number((lesson as Row).duration_seconds ?? 0), 0),
  };
  return { course: dto, modules, lessons };
}
const publishedCourses = () => state.records.courses.filter((course) => course.status === "published");
const findLesson = (id: unknown, profile: Profile) => {
  for (const record of publishedCourses()) {
    const { course, modules } = courseDetail(record, profile);
    for (const module of modules) {
      const lessons = module.sections.flatMap((section) => section.lessons);
      const index = lessons.findIndex((lesson) => lesson.id === id);
      if (index < 0) continue;
      const lesson = lessons[index];
      return { course, module, lesson, can_access: lesson.can_access, reason: lesson.can_access ? null : "Acesso restrito",
        previous_id: lessons[index - 1]?.id ?? null, next_id: lessons[index + 1]?.id ?? null,
        position_seconds: progressOf(profile)[lesson.id]?.position_seconds ?? 0, completed: lesson.completed,
        materials: lesson.id === material.lesson_id ? [material] : [] };
    }
  }
  return null;
};
const certificate = (course: Row, profile: Profile): Certificate => ({
  id: course.id, code: profile.id.replaceAll("-", "") + course.id.replaceAll("-", "").slice(-16), student_name: profile.full_name,
  course_title: str(course.title), duration_minutes: Math.max(1, Math.ceil(Number(course.duration_seconds) / 60)),
  issued_at: date, revoked_at: null, demo: true, signer_name: "Equipe de demonstração",
});
const earned = (profile: Profile) => publishedCourses().map((record) => courseDetail(record, profile).course)
  .filter((course) => course.certificate_enabled && course.progress_percent === 100)
  .map((course) => certificate(course, profile));
const moderationStatus: Readonly<Record<string, string | undefined>> = {
  approve: "approved", reject: "rejected", hide: "hidden", remove: "removed",
};
const recordsFor = (entity: string) => {
  if (entity === "profiles") return state.profiles;
  if (entity === "posts") return state.posts;
  if (entity === "replies") return state.replies;
  if (entity === "tickets") return state.tickets;
  if (entity === "legal_versions") return legalVersions;
  return state.records[entity] ?? [];
};
const saveRow = (rows: Row[], values: Args, id: string) => {
  const row = rows.find((item) => item.id === id);
  if (row) Object.assign(row, values, { id });
  else rows.unshift({ ...values, id });
  return { id };
};

function dashboard(args: Args) {
  const through = str(args.p_through) || date.slice(0, 10);
  const from = str(args.p_from) || through.slice(0, 8) + "01";
  return {
    from_day: from, through_day: through, observed_at: date,
    new_members: 32, first_activations: 12, revenue_cents: 186000, mrr_cents: 62400, renewals_due: 4,
    completions: 38, completing_members_7d: 12, completing_members_30d: 26,
    posts: state.posts.length, pending_posts: state.posts.filter(({ status }) => status === "pending").length,
    new_tickets: state.tickets.length, open_tickets: state.tickets.filter(({ status }) => status === "open").length,
    answered_tickets: 1, first_response_seconds: 1800,
    acquisition: [8, 17, 7].map((count, index) => ({
      starts_on: from, ends_before: through, new_members: count, first_activations: [2, 7, 3][index],
    })),
    payments: [{ method: "PIX", orders: 12, amount_cents: 186000 }],
  };
}
function call(name: string, a: Args, profile: Profile) {
  const admin = profile.role === "admin";
  const query = str(a.p_query).trim();
  const page = (items: unknown[] = []) => paginate(items, a.p_page);
  const id = str(a.p_id) || crypto.randomUUID();
  const lessonId = str(a.p_lesson_id);
  const lessonKey = `${profile.id}:${lessonId}`;
  const progress = progressOf(profile);
  const ownedNotes = () => state.notes.filter((row) => row.owner === profile.id && row.lesson_id === lessonId);
  const comments = () => state.lessonComments.filter((row) => row.lesson_id === lessonId &&
    ((admin && a.p_review) || row.status === "approved" || row.owner === profile.id));
  const missing = () => fail("Conteúdo indisponível nesta demonstração.");
  if ((name.startsWith("app_admin_") || name.startsWith("app_moderate") || a.p_admin) && !admin)
    return fail("Você não tem permissão para esta ação.", 403, "42501");
  switch (name) {
    case "app_bootstrap": return { profile, plans, settings: state.installation };
    case "app_touch_session": return { expires_at: expires(), warning_seconds: 60 };
    case "app_profile":
      Object.assign(profile, a.p_data, { role: profile.role, id: profile.id });
      return profile;
    case "app_catalog_showcase":
    case "app_catalog": {
      const cards = publishedCourses().map((record) => {
        const { course, modules } = courseDetail(record, profile);
        const targets = modules.flatMap((module) => module.sections.flatMap((section) => section.lessons.filter((lesson) => lesson.can_access).map((lesson) => ({
          id: lesson.id, title: (lesson as Row).title, module_title: (module as Row).title,
          module_slug: (module as Row).slug, position_seconds: progress[lesson.id]?.position_seconds ?? 0,
          completed: lesson.completed,
        }))));
        const state = !course.can_access ? "restricted" : course.progress_percent === 100 ? "completed"
          : course.completed_lessons || targets.some((target) => target.position_seconds > 0) ? "ongoing" : "available";
        const target = targets.find((lesson) => lesson.position_seconds && !lesson.completed) ??
          targets.find((lesson) => !lesson.completed) ?? targets[0];
        return { ...course, state, module_count: modules.length, target: target ?? null };
      });
      if (a.p_sort === "title") cards.sort((left, right) => str((left as Row).title).localeCompare(str((right as Row).title), "pt-BR"));
      if (a.p_sort === "progress") cards.sort((left, right) => right.progress_percent - left.progress_percent);
      if (a.p_sort === "duration") cards.sort((left, right) => right.duration_seconds - left.duration_seconds);
      const found = cards.filter((course) => matches(query, (course as Row).title, (course as Row).description));
      return { ...page(found.filter((course) => !a.p_filter || a.p_filter === "all" || course.state === a.p_filter)),
        counts: { all: found.length, ongoing: found.filter((course) => course.state === "ongoing").length,
          completed: found.filter((course) => course.state === "completed").length, restricted: found.filter((course) => course.state === "restricted").length },
        resume: cards.find((course) => course.state === "ongoing" && course.target?.position_seconds) ?? null };
    }
    case "app_course": {
      const course = publishedCourses().find((row) => row.slug === a.p_slug);
      return course ? courseDetail(course, profile) : missing();
    }
    case "app_lesson": return findLesson(a.p_id, profile) ?? missing();
    case "app_progress": {
      const detail = findLesson(lessonId, profile);
      if (!detail?.can_access) return missing();
      const previous = progress[lessonId];
      const current = progress[lessonId] = {
        completed: !!a.p_complete || !!previous?.completed,
        position_seconds: Number(a.p_position_seconds ?? previous?.position_seconds ?? 0),
      };
      const after = findLesson(lessonId, profile)!;
      return { ...current, course_progress_percent: after.course.progress_percent,
        certificate_code: a.p_complete ? earned(profile).find((item) => item.id === after.course.id)?.code : undefined };
    }
    case "app_lesson_engagement": return { saved: !!state.favorites[lessonKey], notes_count: ownedNotes().length, comments_count: comments().length };
    case "app_lesson_favorite": return { saved: state.favorites[lessonKey] = !!a.p_saved };
    case "app_lesson_notes": return page(ownedNotes());
    case "app_save_lesson_note":
      if (a.p_id && !ownedNotes().some((row) => row.id === id)) return missing();
      return saveRow(state.notes, { owner: profile.id, lesson_id: lessonId, body: a.p_body, position_seconds: a.p_position_seconds, updated_at: new Date().toISOString() }, id);
    case "app_delete_lesson_note":
      state.notes = state.notes.filter((row) => !ownedNotes().includes(row) || row.id !== id);
      return { id };
    case "app_lesson_comments": return page(comments());
    case "app_save_lesson_comment": {
      const status = "pending";
      return { ...saveRow(state.lessonComments, { owner: profile.id, lesson_id: lessonId, author_name: profile.full_name,
        body: a.p_body, parent_id: a.p_parent_id, is_instructor: admin, status, created_at: new Date().toISOString() }, id), status };
    }
    case "app_moderate_lesson_comment": {
      const row = state.lessonComments.find((item) => item.id === id);
      if (!row) return missing();
      return { id, status: row.status = moderationStatus[str(a.p_decision)] ?? row.status };
    }
    case "app_lesson_presentation":
      return { presentation: state.presentations[lessonId] ?? null, checked_ids: state.checklists[lessonKey] ?? [] };
    case "app_admin_save_lesson_presentation":
      state.presentations[lessonId] = a.p_presentation;
      return { lesson_id: lessonId };
    case "app_lesson_checklist_item": {
      const item = str(a.p_item_id);
      const checked = !!a.p_checked;
      state.checklists[lessonKey] = [...new Set([...(state.checklists[lessonKey] ?? []).filter((id) => id !== item), ...(checked ? [item] : [])])];
      return { checked };
    }
    case "app_materials": return { ...page(state.records.materials.filter((row) => (!a.p_folder_id || row.folder_id === a.p_folder_id) && matches(query, row.name))), folders: state.records.material_folders };
    case "app_certificates": return { items: earned(profile), courses: publishedCourses().map((row) => courseDetail(row, profile).course).filter((course) => course.certificate_enabled) };
    case "app_issue_certificate": return { certificate_code: earned(profile).find((item) => item.id === a.p_course_id)?.code, reason: "Conclua todas as aulas obrigatórias." };
    case "app_member_search": return page(publishedCourses().flatMap((record) => {
      const { course, modules } = courseDetail(record, profile);
      const root = `/app/cursos/${record.slug}`;
      return [
        { title: record.title, kind: "course", path: root },
        ...modules.flatMap((module) => module.sections.flatMap((section) => section.lessons.filter((lesson) => lesson.can_access)
          .map((lesson) => ({ title: (lesson as Row).title, kind: "lesson", path: `${root}/${(module as Row).slug}/~${lesson.id}` })))),
      ].filter((item) => course.can_access && query.length >= 2 && matches(query, item.title));
    }));
    case "app_feed": {
      const visible = state.posts.filter((post) => (admin || post.status === "approved" || post.author_id === profile.id) &&
        (!a.p_space_id || post.space_id === a.p_space_id) && matches(query, post.title, post.body));
      return { ...page(visible.map((post) => ({ ...post, can_edit: post.author_id === profile.id, can_archive: post.author_id === profile.id }))), spaces };
    }
    case "app_post": {
      const post = state.posts.find((item) => item.id === id);
      if (!post || (!admin && post.status !== "approved" && post.author_id !== profile.id)) return missing();
      return { post: { ...post, can_edit: post.author_id === profile.id, can_archive: post.author_id === profile.id },
        replies: state.replies.filter((reply) => reply.post_id === id && (admin || reply.status === "approved" || reply.author_id === profile.id)),
        can_moderate: admin };
    }
    case "app_save_post": {
      const existing = state.posts.find((post) => post.id === id && post.author_id === profile.id);
      if (a.p_id && !existing) return missing();
      const record: Post = { id, space_id: str(a.p_space_id), author_name: profile.full_name, author_id: profile.id,
        author_role: profile.role, plan_name: profile.plan_name, title: str(a.p_title), body: str(a.p_body),
        status: "pending", created_at: new Date().toISOString(), vote_count: existing?.vote_count ?? 0,
        voted: false, reply_count: existing?.reply_count ?? 0, can_edit: true };
      if (existing) Object.assign(existing, record);
      else state.posts.unshift(record);
      return { id, status: record.status };
    }
    case "app_reply": {
      const status = "pending";
      return { ...saveRow(state.replies, { post_id: a.p_post_id, body: a.p_body, status, author_name: profile.full_name,
        author_id: profile.id, author_role: profile.role, created_at: new Date().toISOString(), vote_count: 0, voted: false }, id), status };
    }
    case "app_vote": {
      const post = state.posts.find((item) => item.id === a.p_target_id);
      if (!post) return missing();
      post.voted = !post.voted;
      post.vote_count += post.voted ? 1 : -1;
      return { voted: post.voted, vote_count: post.vote_count };
    }
    case "app_moderate": {
      const rows = a.p_target_type === "reply" ? state.replies : state.posts;
      const row = rows.find((item) => item.id === a.p_target_id);
      if (!row) return missing();
      return { id: row.id, status: row.status = moderationStatus[str(a.p_decision)] ?? row.status };
    }
    case "app_archive_post": {
      const post = state.posts.find((item) => item.id === id && item.author_id === profile.id);
      if (!post) return missing();
      return { id, status: post.status = a.p_archived ? "archived" : "pending", archived: !!a.p_archived };
    }
    case "app_tickets": return page(state.tickets);
    case "app_ticket": return state.tickets.find((ticket) => ticket.id === id) ?? missing();
    case "app_create_ticket": {
      const ticket: Ticket = { id, subject: str(a.p_subject), priority: str(a.p_priority), status: "open", created_at: new Date().toISOString(),
        messages: [{ id: crypto.randomUUID(), author_name: profile.full_name, body: str(a.p_body), created_at: new Date().toISOString(), attachments: [] }] };
      state.tickets.unshift(ticket);
      return { id };
    }
    case "app_ticket_reply": {
      const ticket = state.tickets.find((item) => item.id === id);
      if (!ticket) return missing();
      if (a.p_body) ticket.messages.push({ id: crypto.randomUUID(), author_name: profile.full_name, body: str(a.p_body), created_at: new Date().toISOString(), attachments: [] });
      if (a.p_status) ticket.status = str(a.p_status);
      return { id, status: ticket.status };
    }
    case "app_admin_list": return page(recordsFor(str(a.p_entity)).filter((row) =>
      matches(query, ...Object.values(row)) && (!a.p_status || !("status" in row) || row.status === a.p_status)));
    case "app_admin_save": {
      const entity = str(a.p_entity);
      if (!["courses", "modules", "sections", "lessons", "material_folders", "materials", "plans", "spaces"].includes(entity))
        return fail("Esta alteração exige uma instalação do Icarus.", 501);
      return saveRow(state.records[entity] ??= [], a.p_data as Args, id);
    }
    case "app_admin_member_detail": {
      const member = state.profiles.find((row) => row.id === id);
      return member ? { profile: member, orders: page(), subscriptions: page(), tickets: page(state.tickets),
        courses: page(publishedCourses().map((course) => courseDetail(course, member).course)) } : missing();
    }
    case "app_admin_dashboard": return dashboard(a);
    case "app_admin_analytics_courses": return page(publishedCourses().filter((course) => matches(query, course.title)));
    case "app_admin_course_analytics": {
      const course = publishedCourses().find((row) => row.id === a.p_course_id);
      const detail = course && courseDetail(course, profile);
      return { started: 32, module_title: "Primeiros passos", module_completed: 18, course_completed: 12,
        lessons: page(detail?.lessons.map((lesson) => ({ ...lesson, module_title: "Primeiros passos", registered: 32, completed: 18 }))) };
    }
    case "app_admin_set_module":
      // Sessões salvas antes da 2.5.0 não têm o campo; ausente conta como ligado.
      (state.installation.modules ??= {})[str(a.p_key)] = a.p_enabled === true;
      return state.installation.modules;
    case "app_admin_save_installation_name":
      state.installation.name = str(a.p_name);
      return { name: state.installation.name, revision: ++state.installation.name_revision, saved: true };
    case "app_admin_catalog_launch": return state.records.announcements?.find((row) => row.id === a.p_id) ?? null;
    case "app_admin_save_catalog_launch":
      return saveRow(state.records.announcements ??= [], { title: a.p_title, summary: a.p_summary, planned_on: a.p_planned_on, enabled: a.p_enabled }, id);
    case "app_catalog_launches":
      return a.p_course_slug ? [] : [{ key: demoId(84), title: "Facilitação de oficinas online",
        summary: "Aprenda a planejar um encontro com exercícios em pequenos grupos.",
        planned_on: futureDay.slice(0, 10), subscribed: state.launches.includes(profile.id) }];
    case "app_subscribe_catalog_launch":
      if (!state.launches.includes(profile.id)) state.launches.push(profile.id);
      return { subscribed: true };
    case "app_notifications": {
      const read = state.alertsRead.includes(profile.id);
      return { ...page([{ id: demoId(83), event_key: "catalog_launch", title: "Você já pode explorar os cursos",
        subtitle: "Veja o catálogo e retome a primeira aula.", action_path: "/app/cursos",
        created_at: date, read_at: read ? date : null }]), unread_count: read ? 0 : 1 };
    }
    case "app_notifications_read":
      if (!state.alertsRead.includes(profile.id)) state.alertsRead.push(profile.id);
      return { unread_count: 0 };
    case "app_notification_preferences": return { items: [] };
    case "app_live_events":
      return { items: a.p_recordings ? [] : state.records.events.filter((item) => item.status === "published")
        .map((item) => ({ ...item, can_access: true, can_rsvp: true, confirmed: state.eventRsvps.includes(`${profile.id}:${item.id}`) })), has_more: false };
    case "app_live_event_rsvp": {
      const signup = `${profile.id}:${id}`;
      state.eventRsvps = state.eventRsvps.filter((actor) => actor !== signup);
      if (a.p_confirmed) state.eventRsvps.push(signup);
      return !!a.p_confirmed;
    }
    case "app_live_event_link": return fail("A sala ao vivo é ilustrativa nesta demonstração.");
    case "app_admin_live_events": return { ...page(state.records.events), plans };
    case "app_admin_live_event_rsvps":
      return page(state.profiles.filter((actor) => state.eventRsvps.includes(`${actor.id}:${id}`)).map((actor) => ({ id: actor.id, full_name: actor.full_name, created_at: date })));
    case "app_admin_save_live_event":
      return saveRow(state.records.events ??= [], {
        title: a.p_title, guest: a.p_guest, starts_at: a.p_starts_at, description: a.p_description,
        duration_minutes: a.p_duration_minutes, status: a.p_status, access_mode: a.p_access_mode, plan_ids: a.p_plan_ids,
        revision: Number(a.p_revision ?? 0) + 1, meeting_url: "", recording_url: null,
      }, id);
    case "app_podcasts": return { ...page(), featured_id: null };
    case "app_ranking": {
      const items = [32, 24, 18].map((points, index) => ({ position: index + 1, points, tied: false, is_self: !admin && index === 1 }));
      return { ...page(items), starts_at: date, ends_at: futureDay, time_zone: "America/Sao_Paulo", prizes: null,
        rules: { post: 5, reply: 3, like: 1, lesson: 2, certificate: 10 }, podium: items,
        own: admin ? { status: "excluded" } : { ...items[1], status: "ranked" } };
    }
    case "app_help_feedback": return { ok: true };
    case "app_submit_feedback": return saveRow(state.feedbacks, { kind: a.p_kind, status: "new", body: a.p_body,
      excerpt: str(a.p_body).slice(0, 160), author_name: profile.full_name, created_at: new Date().toISOString(), revision: 0, has_screenshot: false }, id);
    case "app_admin_feedbacks": return { ...page(state.feedbacks), counts: {} };
    case "app_admin_feedback": return state.feedbacks.find((item) => item.id === id) ?? missing();
    case "app_admin_feedback_status": {
      const item = state.feedbacks.find((row) => row.id === id);
      if (!item) return missing();
      return { id, status: item.status = a.p_status, revision: item.revision = Number(item.revision) + 1 };
    }
    case "app_report": return saveRow(state.records.reports ??= [], {
      target_id: a.p_target_id, target_type: a.p_target_type, reason: a.p_reason, status: "pending", created_at: date,
    }, id);
    case "app_export_data": return { profile, progress, notes: state.notes.filter((item) => item.owner === profile.id) };
    default: return fail("Esta operação exige uma instalação do Icarus.", 501);
  }
}

export const transport: typeof fetch = async (input, init) => {
  const request = new Request(input, init);
  if (request.signal.aborted) throw new DOMException("Cancelado", "AbortError");
  const endpoint = new URL(request.url);
  if (endpoint.origin !== url) return fail("Destinos externos estão indisponíveis na demonstração.", 403);
  const session = request.headers.get("authorization")?.split(" ")[1]?.split(".")[1];
  let sub: string | undefined;
  try { sub = session && JSON.parse(atob(session.replaceAll("-", "+").replaceAll("_", "/"))).sub; } catch { /* Sem sessão. */ }
  const profile = state.profiles.find((item) => item.id === sub);
  const a: Args = request.headers.get("content-type")?.includes("application/json") ? await request.json() : {};
  const path = endpoint.pathname;
  if (path === "/auth/v1/token") {
    const account = demoAccounts.findIndex((item) => item.email === a.email && item.password === a.password);
    const actor = account >= 0 ? state.profiles[account] : state.profiles.find((item) => item.id === a.refresh_token);
    if (!actor) return fail("Invalid login credentials", 400, "invalid_credentials");
    return Response.json(token(actor));
  }
  if (path === "/auth/v1/logout") return new Response(null, { status: 204 });
  if (path === "/auth/v1/user" && request.method === "GET" && profile) return Response.json(user(profile));
  if (path === "/rest/v1/rpc/app_public_context")
    return Response.json({ name: state.installation.name, modules: state.installation.modules ?? {}, plans, legal_versions: legalVersions, legal_ready: true, registration_enabled: false });
  if (path === "/rest/v1/rpc/app_certificate") {
    const item = state.profiles.flatMap(earned).find((certificate) => certificate.code === a.p_code);
    return item ? Response.json(item) : fail("Certificado não encontrado.");
  }
  if (path === "/functions/v1/capabilities") return Response.json({ asaas: false, bunny: false, storage: true, email: "local", mode: "local" });
  if (!profile) return fail("Entre com uma conta da demonstração.", 401, "PGRST301");
  if (path === "/functions/v1/media") {
    const lesson = a.kind === "lesson" && findLesson(a.id, profile);
    const file = a.kind === "material" && a.id === material.id;
    if (lesson && !lesson.can_access) return fail("Aula indisponível.", 403);
    if (lesson || file) {
      const media = lesson ? await getVideo() : attachment ??= URL.createObjectURL(new Blob([roteiro], { type: "text/plain" }));
      return Response.json({ url: media, expires_at: expires(), provider: "storage" });
    }
    return fail("Arquivo indisponível nesta demonstração.", 404);
  }
  if (!path.startsWith("/rest/v1/rpc/") || request.method !== "POST") return fail("Esta operação exige uma instalação do Icarus.", 501);
  const result = call(path.split("/").at(-1)!, a, profile);
  if (result instanceof Response) return result;
  store();
  return Response.json(result);
};
