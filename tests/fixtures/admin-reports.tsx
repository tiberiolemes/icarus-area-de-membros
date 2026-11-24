import { QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { MemoryRouter, NavLink, Route, Routes } from "react-router-dom";
import "../../src/style.css";
import "../../src/member-shell-stitch.css";
import { cache } from "../../src/api";
import { AdminDashboard } from "../../src/pages/admin-dashboard";
import { AdminAnalytics } from "../../src/pages/admin-analytics";
import { RouteFocus } from "../../src/ui";

const api = new URL(import.meta.env.VITE_SUPABASE_URL);
if (api.origin !== location.origin || api.hostname !== "127.0.0.1") throw new Error("Fixture somente em loopback.");

const params = new URLSearchParams(location.search);
document.documentElement.dataset.theme = params.get("theme") === "dark" ? "dark" : "light";
const paths = { dashboard: "/admin", analytics: "/admin/analytics" };

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={cache}>
    <MemoryRouter initialEntries={[params.get("view") === "analytics" ? paths.analytics : paths.dashboard]}>
      <div className="app-shell stitch-shell admin-shell-stitch">
        <aside className="sidebar">
          <div className="rail-brand">Icarus</div>
          <nav className="rail-nav" aria-label="Navegação da fixture">
            <NavLink to={paths.dashboard} end>Dashboard executivo</NavLink>
            <NavLink to={paths.analytics}>Analytics de aprendizagem</NavLink>
          </nav>
        </aside>
        <div className="workspace">
          <header className="topbar"><strong>Icarus</strong><span>Dados sintéticos · Fixture de teste</span></header>
          <main id="main" className="content">
            <RouteFocus />
            <Routes>
              <Route path={paths.dashboard} element={<AdminDashboard analyticsPath={paths.analytics} />} />
              <Route path={paths.analytics} element={<AdminAnalytics dashboardPath={paths.dashboard} />} />
            </Routes>
          </main>
        </div>
      </div>
    </MemoryRouter>
  </QueryClientProvider>,
);
