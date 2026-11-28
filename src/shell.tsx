import { useEffect, useId, useState } from "react";
import type { ReactNode } from "react";
import { Link, NavLink, Outlet, useLocation, useMatch } from "react-router-dom";
import * as Dialog from "@radix-ui/react-dialog";
import {
  BookOpen,
  CalendarDays,
  Files,
  Award,
  MessageSquare,
  MessagesSquare,
  MessageSquareText,
  LayoutDashboard,
  ChartColumn,
  Trophy,
  LifeBuoy,
  Settings,
  Users,
  CreditCard,
  ReceiptText,
  Menu,
  X,
  LogOut,
  HelpCircle,
  ArrowUpRight,
  FolderOpen,
  PlaneTakeoff,
  Podcast,
  Search,
  Sun,
  UserRound,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { roleLabel, rpc, safeUrl, signOut, type Profile } from "./api";
import { useBootstrap } from "./auth";
import { usePrivateImageQuery } from "./media";
import { NotificationBell } from "./pages/notifications";
import { FeedbackButton } from "./pages/feedback";
import { Action, AdminBadge, Empty, Field, Modal, Notice, RouteFocus } from "./ui";
import { Tour } from "./tour";
import { UpdateNotice } from "./update-notice";
import { MemberSearch } from "./pages/member-search";
import { BrandLogo, brandAssetUrl, brandRatio, defaultIcon, defaultLogo } from "./brand";
import { ModuleUnavailable, moduleLabel, moduleOfPath, pathOpen, useModules } from "./modules";
import "./member-shell-stitch.css";

const memberNav = [
  ["Cursos", "cursos", BookOpen],
  ["Comunidade", "comunidade", MessageSquare],
  ["Materiais", "materiais", FolderOpen],
  ["Podcasts", "podcasts", Podcast],
  ["Certificados", "certificados", Award],
  ["Ranking", "ranking", Trophy],
  ["Encontros ao vivo", "encontros-ao-vivo", CalendarDays],
  ["Suporte", "suporte", LifeBuoy],
] as const;
const mobilePrimary = ["cursos", "comunidade", "ranking", "configuracoes"];
const mobileExtra = ["materiais", "podcasts", "certificados", "encontros-ao-vivo", "suporte"];
const memberRoutes = [...memberNav, ["Perfil", "configuracoes", UserRound] as const];
const adminNav = [
  ["Visão geral", [
    ["Dashboard", "dashboard", LayoutDashboard, ["admin"]],
    ["Analytics", "analytics", ChartColumn, ["admin"]],
  ]],
  ["Conteúdo", [
    ["Cursos e aulas", "cursos", BookOpen, ["admin", "instructor"]],
    ["Materiais", "materiais", Files, ["admin", "instructor"]],
  ]],
  ["Alunos e vendas", [
    ["Membros", "membros", Users, ["admin"]],
    ["Planos", "planos", CreditCard, ["admin"]],
    ["Pedidos", "pedidos", ReceiptText, ["admin"]],
  ]],
  ["Engajamento", [
    ["Encontros ao vivo", "encontros", CalendarDays, ["admin"]],
    ["Podcasts", "podcasts", Podcast, ["admin"]],
    ["Comunidade", "comunidade", MessageSquare, ["admin", "moderator"]],
    ["Comentários de aula", "comentarios-aula", MessagesSquare, ["admin", "moderator"]],
  ]],
  ["Operações", [
    ["Suporte", "suporte", LifeBuoy, ["admin", "support"]],
    ["Feedbacks dos alunos", "feedbacks", MessageSquareText, ["admin"]],
  ]],
  ["Configurações", [
    ["Configurações", "configuracoes", Settings, ["admin"]],
  ]],
] as const;

function staffNavigation(role: Profile["role"]) {
  return adminNav.map(([label, routes]) => ({
    label, routes: routes.filter(([, , , roles]) => (roles as readonly string[]).includes(role)),
  })).filter(({ routes }) => routes.length);
}

function AdminSearch({ role }: { role: Profile["role"] }) {
  const [open, setOpen] = useState(false), [query, setQuery] = useState("");
  const normalize = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("pt-BR");
  const term = normalize(query.trim());
  const groups = staffNavigation(role).map(({ label, routes }) => ({
    label, routes: routes.filter(([name]) => normalize(`${label} ${name}`).includes(term)),
  })).filter(({ routes }) => routes.length);
  const close = (next: boolean) => {
    setOpen(next);
    if (!next) setQuery("");
  };
  return <Modal title="Buscar no painel" open={open} onOpenChange={close}
    trigger={<button type="button" className="icon-button" aria-label="Buscar no painel"><Search size={20} aria-hidden="true" /></button>}>
    <Field label="Nome da área"><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} /></Field>
    {groups.length ? groups.map(({ label, routes }) => <section key={label} className="admin-search-group">
      <h3>{label}</h3>
      <ul>{routes.map(([name, path]) => <li key={path}><Link to={`/admin/${path}`} onClick={() => close(false)}>{name}</Link></li>)}</ul>
    </section>) : <Empty>Nenhuma área corresponde à busca.</Empty>}
  </Modal>;
}

const staffEntryLabels: Readonly<Record<string, string | undefined>> = {
  admin: "Administração",
  instructor: "Painel de conteúdo",
  moderator: "Moderação",
  support: "Atendimento",
};

function AccountPhoto({ avatarId }: { avatarId: string }) {
  const { data } = usePrivateImageQuery("avatar", avatarId);
  const url = safeUrl(data?.url);
  const [loaded, setLoaded] = useState<string>();

  return url ? (
    <img className="member-account-photo" src={url} alt="" hidden={loaded !== url}
      referrerPolicy="no-referrer" onLoad={() => setLoaded(url)} onError={() => setLoaded(undefined)} />
  ) : null;
}

function AccountAvatar({ profile, initials, admin = false }: { profile: Profile; initials: string; admin?: boolean }) {
  return (
    <span className="avatar" aria-hidden="true">
      {admin ? <UserRound size={18} /> : initials}
      {!admin && profile.avatar_id && (
        <AccountPhoto key={JSON.stringify([profile.id, profile.avatar_id])} avatarId={profile.avatar_id} />
      )}
    </span>
  );
}

function threadInitials(fullName?: string) {
  const [first, ...rest] = (fullName ?? "").trim().normalize().split(/\s+/);
  const last = rest.at(-1) ?? "";
  return (([...first][0] ?? "I") + ([...last][0] ?? "")).toLocaleUpperCase("pt-BR");
}

export function useSidebarCollapsed(area: "admin" | "member"): [boolean, (next: boolean) => void] {
  const [choices, setChoices] = useState(() => {
    try {
      return {
        admin: localStorage.getItem("icarus:sidebar:admin") === "1",
        member: localStorage.getItem("icarus:sidebar:member") === "1",
      };
    } catch {
      return { admin: false, member: false };
    }
  });
  return [choices[area], (next) => {
    setChoices((current) => ({ ...current, [area]: next }));
    try {
      localStorage.setItem(`icarus:sidebar:${area}`, next ? "1" : "0");
    } catch {
      // A escolha continua valendo enquanto o painel estiver aberto.
    }
  }];
}

function ShellNavigation({ admin, profile, brand, brandIcon, onToggleTheme, onNavigate, drawerInitials, collapseToggle }: {
  admin: boolean;
  profile: Profile;
  brand: ReactNode;
  brandIcon: boolean;
  onToggleTheme: () => Promise<void>;
  onNavigate?: () => void;
  drawerInitials?: string;
  collapseToggle?: ReactNode;
}) {
  const dark = profile.theme === "dark";
  const modules = useModules();
  const staffGroups = staffNavigation(profile.role);
  const staffEntry = staffGroups[0]?.routes[0];
  const staffLabel = staffEntry && (staffEntryLabels[profile.role] ?? staffEntry[0]);
  const themeLabel = dark ? "Tema escuro" : "Tema claro";
  const help = (admin || modules.help) && (
    <NavLink to={admin ? "/ajuda" : "/app/ajuda"} onClick={onNavigate} data-label="Central de ajuda">
      <HelpCircle size={20} aria-hidden="true" />
      <span className="rail-label">Central de ajuda</span>
    </NavLink>
  );
  const brandLink = (
      <Link className="rail-brand" to={admin && staffEntry ? `/admin/${staffEntry[1]}` : "/app/cursos"} onClick={onNavigate}>
        {admin ? (
          <>
            {brandIcon && <PlaneTakeoff size={32} aria-hidden="true" />}
            <div className="installation-admin">
              {brand}
              <span>Painel admin</span>
            </div>
          </>
        ) : brand}
      </Link>
  );
  return (
    <>
      {collapseToggle ? <div className="rail-head">{brandLink}{collapseToggle}</div> : brandLink}
      {drawerInitials && (
        <div className="mobile-drawer-account">
          <AccountAvatar profile={profile} initials={drawerInitials} />
          <div>
            <strong>{profile.full_name || "Membro"}</strong>
            <small>{profile.role === "admin" ? <AdminBadge /> : profile.plan_name || "Sem plano ativo"}</small>
          </div>
        </div>
      )}
      {!admin && <span className="member-rail-label" aria-hidden="true">Plataforma</span>}
      <nav
        aria-label={admin ? "Administração" : "Área de membros"}
        data-tour="navigation"
      >
        {admin ? staffGroups.map(({ label, routes }) => (
          <div key={label} className="admin-nav-group" role="group" aria-label={label}>
            {label !== "Configurações" && <span aria-hidden="true">{label}</span>}
            {routes.map(([title, path, Icon]) => {
              const to = `/admin/${path}`;
              return <NavLink key={path} to={to} onClick={onNavigate} data-label={title}>
                <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
                <span className="rail-label">{title}</span>
                {!pathOpen(modules, to) && <> <small className="badge module-off-badge">Desativado</small></>}
              </NavLink>;
            })}
          </div>
        )) : memberNav.map(([title, path, Icon]) => {
          const to = "/app/" + path;
          return pathOpen(modules, to) && <NavLink key={path} to={to} onClick={onNavigate} data-label={title}>
            <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
            <span className="rail-label">{title}</span>
          </NavLink>;
        })}
        {!admin && help}
      </nav>
      <div className="rail-bottom">
        {!admin && (
          <NavLink to="/app/configuracoes" onClick={onNavigate} data-label="Configurações">
            <Settings size={20} aria-hidden="true" />
            <span className="rail-label">Configurações</span>
          </NavLink>
        )}
        {!admin && staffEntry && (
          <Link to={`/admin/${staffEntry[1]}`} onClick={onNavigate} data-label={staffLabel}>
            <ArrowUpRight size={20} aria-hidden="true" />
            <span className="rail-label">{staffLabel}</span>
          </Link>
        )}
        {!admin && (
          <Action run={onToggleTheme}>
            <Sun size={20} aria-hidden="true" />
            <span className="rail-label">{themeLabel}</span>
            <small className="member-theme-state" aria-hidden="true">Ativo</small>
            <span className="sr-only">. Mudar para tema {dark ? "claro" : "escuro"}</span>
            <span className="rail-hint" data-label={themeLabel} aria-hidden="true" />
          </Action>
        )}
        {admin && staffEntry && (
          <Link to="/app/cursos" onClick={onNavigate} data-label="Área do aluno">
            <ArrowUpRight size={20} aria-hidden="true" />
            <span className="rail-label">Área do aluno</span>
          </Link>
        )}
        {admin && help}
        <Action
          run={async () => {
            await signOut();
          }}
        >
          <LogOut size={20} aria-hidden="true" />
          <span className="rail-label">Sair</span>
          <span className="rail-hint" data-label="Sair" aria-hidden="true" />
        </Action>
      </div>
    </>
  );
}

export function Shell() {
  const boot = useBootstrap();
  const profile = boot.data!.profile;
  const name = boot.data?.settings?.name;
  const installationName = typeof name === "string" && name ? name : "Icarus";
  const logos = { light: brandAssetUrl(boot.data?.settings?.logo_light), dark: brandAssetUrl(boot.data?.settings?.logo_dark) };
  const ratios = { light: brandRatio(boot.data?.settings?.logo_light_ratio), dark: brandRatio(boot.data?.settings?.logo_dark_ratio) };
  const brandMark = (Text: "strong" | "span") => (
    <BrandLogo {...logos} ratios={ratios} name={installationName} fallback={installationName === "Icarus" ? <img src={defaultLogo} alt="Icarus" />
      : Text === "strong" ? <strong className="installation-name" title={installationName}>{installationName}</strong>
      : <span title={installationName}>{installationName}</span>} />
  );
  const brandIcon = installationName !== "Icarus" && !logos.light && !logos.dark;
  const { pathname, search } = useLocation();
  const admin = pathname.startsWith("/admin");
  const [collapsed, setCollapsed] = useSidebarCollapsed(admin ? "admin" : "member");
  const sidebarId = useId();
  const collapseLabel = collapsed ? "Expandir menu" : "Recolher menu";
  const CollapseIcon = collapsed ? PanelLeftOpen : PanelLeftClose;
  const sidebarIcon = brandAssetUrl(boot.data?.settings?.icon);
  const modules = useModules();
  const offModule = pathOpen(modules, pathname) ? undefined : moduleOfPath(pathname);
  const adminOrders = useMatch("/admin/pedidos/*");
  const adminTickets = useMatch("/admin/suporte/*");
  const adminFeedbacks = useMatch("/admin/feedbacks");
  const adminSettings = useMatch("/admin/configuracoes");
  const adminSettingsTab = adminSettings ? new URLSearchParams(search).get("aba") : null;
  const adminTeam = adminSettingsTab === "equipe" || adminSettingsTab === "auditoria";
  const accountInitials = threadInitials(profile.full_name);
  const adminView = adminOrders || adminTickets ? "operations" : adminTeam ? "team" : adminFeedbacks ? "feedback" : undefined;
  const [open, setOpen] = useState(false);
  const primary = mobilePrimary.filter((path) => pathOpen(modules, "/app/" + path));
  const [fifth, ...fallbacks] = mobileExtra.filter((path) => pathOpen(modules, "/app/" + path));
  const quickPaths = [...primary, ...fallbacks.slice(0, 4 - primary.length), ...(fifth ? [fifth] : [])];
  // Admin acessa todo o conteúdo sem plano, então a badge Admin ocupa o lugar do plano.
  const planBadge = profile.role === "admin"
    ? <small className="mobile-frame-plan" data-role="admin"><AdminBadge /></small>
    : profile.plan_name && <small className="mobile-frame-plan" title={profile.plan_name}>{profile.plan_name}</small>;

  useEffect(() => {
    document.documentElement.dataset.theme = profile.theme ?? "light";
  }, [profile.theme, profile.id]);
  useEffect(() => setOpen(false), [pathname]);

  async function toggleTheme() {
    await rpc("app_profile", { p_data: { theme: profile.theme === "dark" ? "light" : "dark" } });
    await boot.refetch({ throwOnError: true });
  }

  return (
    <div
      className={`app-shell stitch-shell ${admin ? "admin-shell-stitch" : "member-shell-stitch"}`}
      data-admin-view={adminView}
      data-sidebar={collapsed ? "collapsed" : undefined}
    >
      <a className="skip" href="#main" onClick={(event) => {
        event.preventDefault();
        document.getElementById("main")?.focus();
      }}>
        Pular para o conteúdo
      </a>
      <aside className="sidebar" id={sidebarId}>
        <ShellNavigation admin={admin} profile={profile} brand={collapsed
          ? <img className={sidebarIcon ? "rail-mark rail-mark-custom" : "rail-mark"} src={sidebarIcon ?? defaultIcon} alt={installationName} referrerPolicy="no-referrer" />
          : brandMark("strong")} brandIcon={!collapsed && brandIcon} onToggleTheme={toggleTheme}
          collapseToggle={<button type="button" className="icon-button rail-toggle" aria-label={collapseLabel}
            title={collapseLabel} aria-expanded={!collapsed} aria-controls={sidebarId} onClick={() => setCollapsed(!collapsed)}>
            <CollapseIcon size={20} aria-hidden="true" />
          </button>} />
      </aside>
      <div className="workspace">
        <header className="topbar">
          <Dialog.Root open={open} onOpenChange={setOpen}>
            <Dialog.Trigger
              className="icon-button mobile-menu"
              aria-label="Abrir navegação"
              data-tour="navigation"
            >
              <Menu aria-hidden="true" />
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="overlay" />
              <Dialog.Content
                className={`drawer stitch-shell-drawer ${admin ? "admin-shell-stitch" : "member-shell-drawer"}`}
                data-admin-view={adminView}
              >
                <Dialog.Title className="sr-only">Navegação</Dialog.Title>
                <Dialog.Description className="sr-only">
                  {admin ? "Navegue pelo painel administrativo." : "Navegue pela área de membros."}
                </Dialog.Description>
                <Dialog.Close
                  className="icon-button close"
                  aria-label="Fechar navegação"
                >
                  <X />
                </Dialog.Close>
                <ShellNavigation admin={admin} profile={profile} brand={brandMark("strong")} brandIcon={brandIcon} onToggleTheme={toggleTheme} onNavigate={() => setOpen(false)}
                  drawerInitials={admin ? undefined : accountInitials} />
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
          {!admin && (
            <div className="mobile-frame-label">
              {brandMark("span")}
              {planBadge}
            </div>
          )}
          {admin ? <>
            <span className="top-context">Administração</span>
            <div className="admin-topbar-brand">{brandMark("strong")}</div>
          </> : <MemberSearch actorId={profile.id} drawerOpen={open} />}
          <div className="topbar-tools">
            {admin && <AdminSearch role={profile.role} />}
            <Tour />
            {!admin && modules.feedback && <FeedbackButton key={JSON.stringify([profile.id, pathname])} />}
            {!admin && <NotificationBell key={profile.id} memberId={profile.id} />}
            <Link className="account-link" to="/app/configuracoes" aria-label={`Sua conta: ${profile.full_name || "Membro"}`}>
              <AccountAvatar profile={profile} initials={accountInitials} admin={admin} />
              <span className="account-details">
                {profile.full_name}
                <small>{profile.role === "admin" ? <AdminBadge /> : admin ? roleLabel(profile.role) : profile.plan_name || "Sem plano ativo"}</small>
              </span>
            </Link>
          </div>
        </header>
        <main id="main" className="content" tabIndex={-1}>
          <RouteFocus name={installationName} />
          {admin && profile.role === "admin" && <UpdateNotice />}
          {admin && offModule && (
            <Notice>
              <strong>O módulo {moduleLabel(offModule)} está desativado.</strong> Os alunos não veem este recurso. Você pode preparar o conteúdo aqui
              {profile.role === "admin" ? <> e ligar o módulo em <Link to="/admin/configuracoes?aba=modulos">Configurações &gt; Módulos</Link>.</> : "."}
            </Notice>
          )}
          {!admin && offModule && !(offModule === "help" && profile.role !== "member") ? <ModuleUnavailable /> : <Outlet />}
        </main>
      </div>
      {!admin && (
        <nav className="mobile-member-nav" aria-label="Navegação rápida">
          {quickPaths.map((path) => {
            const [title, , Icon] = memberRoutes.find((route) => route[1] === path)!;
            return <NavLink key={path} to={"/app/" + path}><Icon aria-hidden="true" />{title}</NavLink>;
          })}
        </nav>
      )}
    </div>
  );
}
