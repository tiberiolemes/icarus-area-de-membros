import { QueryClientProvider } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { createRoot } from "react-dom/client";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import "../../src/style.css";
import "../../src/member-shell-stitch.css";

const params = new URLSearchParams(location.search);
document.documentElement.dataset.theme = params.get("theme") === "dark" ? "dark" : "light";
const api = new URL(import.meta.env.VITE_SUPABASE_URL);
if (api.origin !== location.origin || api.hostname !== "127.0.0.1") throw new Error("Use somente a URL local da fixture.");

const now = Date.now();
const examples = [
  ["course_published", "Novo curso disponível", "Um curso de demonstração foi publicado.", "/app/cursos/exemplo"],
  ["material_published", "Novo material disponível", "Um material de demonstração foi adicionado.", "/app/materiais"],
  ["certificate_issued", "Certificado desbloqueado", "Seu certificado de demonstração já está disponível.", "/app/certificados"],
  ["ticket_reply", "Resposta do suporte", "O time respondeu ao seu chamado de demonstração.", "/app/suporte/exemplo"],
  ["course_published", "Atualização anterior", "Um aviso já lido na demonstração.", null],
  ["material_published", "Material anterior", "Este aviso aparece na segunda página.", "/app/materiais"],
] as const;
let items = examples.map(([event_key, title, subtitle, action_path], index) => ({
  id: `48a538da-70ca-42c7-b4ef-7e275656aaa${index}`,
  event_key, title, subtitle, action_path,
  created_at: new Date(now - (index + 1) * 2_400_000).toISOString(),
  read_at: index < 3 ? null : new Date(now).toISOString(),
}));
if (params.has("empty")) items = [];
let preferences = examples.slice(0, 4).map(([event_key, label], index) => ({
  event_key, group: ["Conteúdo", "Conteúdo", "Progresso", "Suporte"][index], label,
  in_app: index !== 3, email: false, email_available: false,
}));
if (params.has("empty")) preferences = [];
let failure = params.get("fail");
const originalFetch = window.fetch.bind(window);

window.fetch = async (input, init) => {
  const request = new Request(input, init);
  const url = new URL(request.url);
  if (url.origin !== api.origin || !url.pathname.startsWith("/rest/v1/rpc/")) return originalFetch(input, init);
  const rpc = url.pathname.split("/").at(-1);
  const args = await request.json();
  const unread = () => items.filter((item) => item.read_at === null).length;
  if (rpc === failure) {
    failure = null;
    return Response.json({ message: "Falha simulada", code: "P0001" }, { status: 400 });
  }
  switch (rpc) {
    case "app_notifications": {
      const page = args.p_page;
      const start = (page - 1) * 5;
      return Response.json({ page, page_size: 5, total: items.length, items: items.slice(start, start + 5), unread_count: unread() });
    }
    case "app_notifications_read": {
      await new Promise((resolve) => setTimeout(resolve, 250));
      items = items.map((item) => args.p_id === null || args.p_id === item.id ? { ...item, read_at: new Date().toISOString() } : item);
      return Response.json({ unread_count: unread() });
    }
    case "app_notification_preferences": return Response.json({ items: preferences });
    case "app_set_notification_preference": {
      await new Promise((resolve) => setTimeout(resolve, 250));
      preferences = preferences.map((item) => item.event_key === args.p_event_key ? { ...item, in_app: args.p_in_app } : item);
      return Response.json(preferences.find((item) => item.event_key === args.p_event_key));
    }
    default: return Response.json({ message: "RPC fora do escopo da fixture" }, { status: 404 });
  }
};

const [{ cache }, { NotificationBell, NotificationHistory, NotificationPreferences }, { Heading, RouteFocus }] = await Promise.all([
  import("../../src/api"), import("../../src/pages/notifications"), import("../../src/ui"),
]);

const member = { memberId: "fixture-local" };
const paths = { history: "/app/notificacoes", preferences: "/app/configuracoes?aba=notificacoes", player: "/app/player" };
const initial = params.get("view") === "history" ? paths.history : params.get("view") === "preferences" ? paths.preferences : paths.player;

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={cache}>
    <MemoryRouter initialEntries={[initial]}>
      <div className="app-shell member-shell-stitch">
        <aside className="sidebar"><div className="rail-brand">Icarus</div></aside>
        <div className="workspace">
          <header className="topbar">
            <div className="member-quick-search"><Search size={18} aria-hidden="true" /><span>Busca rápida</span></div>
            <div className="topbar-tools">
              <NotificationBell {...member} />
              <Link className="account-link" to={paths.preferences} aria-label="Sua conta de demonstração">
                <span className="avatar" aria-hidden="true">D</span><span className="account-details">Demonstração<small>Área de membros</small></span>
              </Link>
            </div>
          </header>
          <main className="content">
            <RouteFocus />
            <Routes>
              <Route path={paths.history} element={<NotificationHistory {...member} />} />
              <Route path="/app/configuracoes" element={<><Heading title="Configurações da conta">Demonstração local</Heading>
                <NotificationPreferences {...member} /></>} />
              <Route path={paths.player} element={<Heading title="Player de aula">Demonstração local</Heading>} />
              <Route path="/app/*" element={<Heading title="Destino da notificação">Demonstração local</Heading>} />
            </Routes>
          </main>
        </div>
      </div>
    </MemoryRouter>
  </QueryClientProvider>,
);
