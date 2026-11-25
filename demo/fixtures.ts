import type { Material, Plan, Post, Profile, Ticket } from "../src/api";
import { demoAccounts } from "./accounts";

export type Row = Record<string, unknown> & { id: string };
export const demoId = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
export const date = new Date().toISOString();
export const futureDay = new Date(Date.now() + 7 * 86_400_000).toISOString();
export const event = {
  id: demoId(81), title: "Oficina · Planeje o primeiro curso", guest: "Equipe de demonstração",
  description: "Traga o tema da sua trilha para montar a primeira versão da ementa.",
  starts_at: futureDay, revision: 0, duration_minutes: 60,
  can_access: true, can_rsvp: true, status: "published", access_mode: "members", plan_ids: [], meeting_url: "",
};
const text = (content: string) => `<p>${content}</p>`;
const names = [
  ["estrutura-cursos", "Estratégia de cursos digitais", "Organize aulas, materiais e entregas para criar uma experiência de aprendizagem clara."],
  ["onboarding-equipes", "Onboarding de equipes", "Crie uma trilha de integração para a primeira semana de novas pessoas."],
  ["comunicacao-no-trabalho", "Comunicação no trabalho", "Transforme combinados em hábitos de comunicação que a equipe pode aplicar."],
  ["design-system", "Design System para produtos", "Documente os componentes e as decisões visuais de um produto digital."],
];
const profiles: Profile[] = demoAccounts.map((account, index) => ({
  id: demoId(index + 1), full_name: account.name, email: account.email,
  role: account.role, theme: "light", phone: "", bio: "", company: {},
  plan_name: "Membro Pro", access_ends_at: null, suspended: false, onboarding_complete: true,
}));
export const plans: Plan[] = [
  { id: demoId(21), name: "Membro Pro · Demonstração", slug: "pro-demo", price_cents: 0, access_months: 12,
    benefits: ["Cursos, materiais e comunidade de demonstração"], active: true },
];
export const spaces = [
  { id: demoId(31), name: "Geral", description: "Conversas e apresentações da comunidade de demonstração.", can_post: true },
  { id: demoId(32), name: "Dúvidas de cursos", description: "Compartilhe dúvidas e aprendizados do seu estudo.", can_post: true },
];
const posts: Post[] = [
  ["Bem-vindos à comunidade", "Use este espaço para compartilhar o que você está aprendendo e trocar experiências com outros participantes."],
  ["Como vocês organizam a ementa?", "Estou preparando uma trilha com vídeos, textos e atividades. O que funcionou melhor para vocês?"],
  ["Checklist para publicar um curso", "Revise o currículo, teste o acesso como aluno e confira os materiais antes de publicar."],
].map(([title, body], index) => ({
  id: demoId(40 + index), space_id: spaces[index % spaces.length].id,
  author_name: index === 1 ? "Bianca Reis" : "Rafael Almeida", author_id: demoId(index === 1 ? 3 : 2),
  author_role: index === 1 ? "member" : "admin", plan_name: "Membro Pro", title, body,
  status: index === 2 ? "pending" : "approved", created_at: date, vote_count: 6 - index,
  voted: false, reply_count: 0, can_edit: false,
}));
const tickets: Ticket[] = [{
  id: demoId(50), subject: "Onde encontro o roteiro de aula?", priority: "normal", status: "open",
  created_at: date, messages: [{ id: demoId(51), author_name: profiles[0].full_name,
    body: "Quero usar o roteiro para montar a minha trilha. Em qual pasta ele está?", created_at: date, attachments: [] }],
}];
const folder = { id: demoId(61), name: "Roteiros de curso", count: 1 };
export const material: Material = {
  id: demoId(62), folder_id: folder.id, lesson_id: demoId(301), name: "Roteiro de curso",
  description: "Modelo para planejar aulas, materiais e atividades.",
  file_type: "text/plain", size_bytes: 160, can_access: true,
};
export const videoUrl = new URL("./aula.mp4", import.meta.url).href;

export function seed() {
  const courses: Row[] = names.map(([slug, title, description], index) => ({
    id: demoId(100 + index), slug, title, description: text(description), status: "published",
    access_mode: index === 3 ? "plans" : "members", plan_ids: index === 3 ? [demoId(22)] : [],
    certificate_enabled: index === 0, order_index: index, has_cover: false,
  }));
  const modules: Row[] = courses.map((course, index) => ({
    id: demoId(200 + index), course_id: course.id, slug: "primeiros-passos",
    title: "Primeiros passos", status: "published", order_index: 0, access_mode: "inherit",
  }));
  const sections: Row[] = modules.map((module, index) => ({
    id: demoId(250 + index), module_id: module.id, title: "Fundamentos", status: "published", order_index: 0, is_bonus: false,
  }));
  const lessons: Row[] = sections.flatMap((section, index) => [
    ["objetivos", "Defina os objetivos da trilha", "text"],
    ["modulos-e-aulas", "Organize módulos e aulas", "video"],
    ["publique", "Revise a experiência do aluno", "text"],
  ].map(([slug, title, type], order) => ({
    id: demoId(300 + index * 10 + order), section_id: section.id, module_id: section.module_id,
    slug, title, type, status: "published", order_index: order, is_preview: false,
    duration_seconds: type === "video" ? 12 : 120,
    body: text("Use um objetivo por aula, um material de apoio quando necessário e uma atividade para aplicar o que aprendeu."),
    storage_path: type === "video" ? "simulacao/aula.mp4" : null,
  })));
  return {
    profiles: structuredClone(profiles), posts: structuredClone(posts), tickets: structuredClone(tickets),
    records: { courses, modules, sections, lessons, material_folders: [folder], materials: [material], events: [{ ...event }], spaces, plans } as Record<string, Row[]>,
    replies: [] as Row[], feedbacks: [] as Row[],
    alertsRead: [] as string[], launches: [] as string[], eventRsvps: [] as string[],
    progress: { [profiles[0].id]: { [demoId(300)]: { completed: true, position_seconds: 0 },
      [demoId(301)]: { completed: false, position_seconds: 4 } } } as Record<string, Record<string, { completed: boolean; position_seconds: number }>>,
    favorites: {} as Record<string, boolean>,
    lessonComments: [] as Row[], notes: [] as Row[], presentations: {
      [demoId(301)]: {
        subtitle: "Da ementa à primeira aula pronta",
        chapters: [{ title: "Defina o objetivo", start_seconds: 0, duration_seconds: 6 },
          { title: "Organize a sequência", start_seconds: 6, duration_seconds: 6 }],
        checklist: [{ id: "objetivo", label: "Defini o objetivo da aula" },
          { id: "atividade", label: "Planejei uma atividade prática" }],
      },
    } as Record<string, unknown>,
    checklists: {} as Record<string, string[]>,
    installation: { name: "Icarus", name_revision: 0, modules: {} as Record<string, boolean> },
  };
}

export const legalVersions = [
  { id: demoId(71), kind: "terms", title: "Termos da demonstração", body: text("Esta experiência usa dados fictícios e guarda alterações apenas nesta sessão do navegador."), version: "demo" },
  { id: demoId(72), kind: "privacy", title: "Privacidade da demonstração", body: text("Use apenas os dados de teste fornecidos na tela de entrada."), version: "demo" },
];
