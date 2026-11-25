import { useEffect, useState } from "react";
import type { ComponentProps } from "react";
import { Link, NavLink, Outlet, useLocation, useMatch } from "react-router-dom";
import * as Dialog from "@radix-ui/react-dialog";
import {
  BookOpen,
  ArrowLeft,
  CalendarDays,
  CirclePlay,
  GraduationCap,
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
  Menu,
  X,
  LogOut,
  HelpCircle,
  ArrowUpRight,
  FolderOpen,
  Moon,
  PlaneTakeoff,
  Podcast,
  Sun,
  UserRound,
} from "lucide-react";
import { roleLabel, rpc, safeUrl, signOut, type Profile } from "./api";
import { useBootstrap } from "./auth";
import { usePrivateImageQuery } from "./media";
import { NotificationBell } from "./pages/notifications";
import { FeedbackButton } from "./pages/feedback";
import { Action, AdminBadge, RouteFocus } from "./ui";
import { Tour } from "./tour";
import { UpdateNotice } from "./update-notice";
import { MemberSearch } from "./pages/member-search";
import { StitchIcon } from "./stitch-icon";
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
const adminNav = [
  ["Conteúdo", "cursos", BookOpen, ["admin", "instructor"]],
  ["Dashboard", "dashboard", LayoutDashboard, ["admin"]],
  ["Analytics", "analytics", ChartColumn, ["admin"]],
  ["Materiais", "materiais", Files, ["admin", "instructor"]],
  ["Membros", "membros", Users, ["admin"]],
  ["Planos", "planos", CreditCard, ["admin"]],
  ["Pedidos", "pedidos", CreditCard, ["admin"]],
  ["Encontros ao vivo", "encontros", CalendarDays, ["admin"]],
  ["Podcasts", "podcasts", Podcast, ["admin"]],
  ["Comunidade", "comunidade", MessageSquare, ["admin", "moderator"]],
  ["Suporte", "suporte", LifeBuoy, ["admin", "support"]],
  ["Feedbacks dos alunos", "feedbacks", MessageSquareText, ["admin"]],
  ["Configurações", "configuracoes", Settings, ["admin"]],
] as const;

const logoUrl = import.meta.env.BASE_URL + "brand/icarus-horizontal-preto.svg";

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

function ShellNavigation({ admin, profile, installationName, onToggleTheme, onNavigate, drawerInitials }: {
  admin: boolean;
  profile: Profile;
  installationName: string;
  onToggleTheme: () => Promise<void>;
  onNavigate?: () => void;
  drawerInitials?: string;
}) {
  const dark = profile.theme === "dark";
  const staffRoutes = adminNav.filter((item) =>
    (item[3] as readonly string[]).includes(profile.role),
  );
  const [staffEntry] = staffRoutes;
  const help = (
    <Link to="/ajuda" onClick={onNavigate}>
      <HelpCircle size={20} aria-hidden="true" />
      Central de ajuda
    </Link>
  );
  return (
    <>
      <Link className="rail-brand" to="/app/cursos" onClick={onNavigate}>
        {admin ? (
          <>
            {installationName !== "Icarus" && <PlaneTakeoff size={32} aria-hidden="true" />}
            <div className="installation-admin">
              {installationName === "Icarus" ? <img src={logoUrl} alt="Icarus" /> :
                <strong className="installation-name" title={installationName}>{installationName}</strong>}
              <span>Painel admin</span>
            </div>
          </>
        ) : installationName === "Icarus" ? (
          <img src={logoUrl} alt="Icarus" />
        ) : <strong className="installation-name" title={installationName}>{installationName}</strong>}
      </Link>
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
        {!admin && staffEntry && (
          <Link to={`/admin/${staffEntry[1]}`} onClick={onNavigate}>
            <ArrowUpRight size={20} aria-hidden="true" />
            {staffEntryLabels[profile.role] ?? staffEntry[0]}
          </Link>
        )}
        {(admin ? staffRoutes : memberNav).map(([title, path, Icon]) => (
          <NavLink key={path} to={(admin ? "/admin/" : "/app/") + path} onClick={onNavigate}>
            <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
            {title}
          </NavLink>
        ))}
        {!admin && help}
      </nav>
      <div className="rail-bottom">
        {!admin && (
          <NavLink to="/app/configuracoes" onClick={onNavigate}>
            <Settings size={20} aria-hidden="true" />
            Configurações
          </NavLink>
        )}
        {!admin && (
          <Action run={onToggleTheme}>
            {dark ? <Moon size={20} aria-hidden="true" /> : <Sun size={20} aria-hidden="true" />}
            Tema {dark ? "escuro" : "claro"}
            <small className="member-theme-state" aria-hidden="true">Ativo</small>
            <span className="sr-only">. Mudar para tema {dark ? "claro" : "escuro"}</span>
          </Action>
        )}
        {admin && staffRoutes.length > 0 && (
          <Link to="/app/cursos" onClick={onNavigate}>
            <ArrowUpRight size={20} aria-hidden="true" />
            Área do aluno
          </Link>
        )}
        {admin && help}
        <Action
          run={async () => {
            await signOut();
          }}
        >
          <LogOut size={20} aria-hidden="true" />
          Sair
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
  const { pathname, search } = useLocation();
  const admin = pathname.startsWith("/admin");
  const account = useMatch("/app/configuracoes");
  const catalog = useMatch("/app/cursos");
  const forum = useMatch("/app/comunidade");
  const lesson = useMatch("/app/cursos/:curso/:modulo/:aula");
  const mobileFrame = lesson ? "lesson" : catalog || forum ? "browse" : undefined;
  const modulePath = lesson?.pathnameBase.slice(0, lesson.pathnameBase.lastIndexOf("/"));
  const events = useMatch("/app/encontros-ao-vivo");
  const thread = useMatch("/app/comunidade/:post");
  const adminOrders = useMatch("/admin/pedidos/*");
  const adminTickets = useMatch("/admin/suporte/*");
  const adminFeedbacks = useMatch("/admin/feedbacks");
  const adminSettings = useMatch("/admin/configuracoes");
  const adminSettingsTab = adminSettings ? new URLSearchParams(search).get("aba") : null;
  const adminTeam = adminSettingsTab === "equipe" || adminSettingsTab === "auditoria";
  const memberView = catalog ? "catalog"
    : account || events ? "text-rail"
    : thread && thread.params.post !== "novo" ? "thread"
    : undefined;
  const accountInitials = memberView === "thread"
    ? threadInitials(profile.full_name)
    : profile.full_name?.slice(0, 1) || "I";
  const adminView = adminOrders || adminTickets ? "operations" : adminTeam ? "team" : adminFeedbacks ? "feedback" : undefined;
  const [open, setOpen] = useState(false);
  const [mobile, setMobile] = useState(false);
  const stitchFrameIcons = mobile && mobileFrame;
  const dark = profile.theme === "dark";
  const CourseIcon = dark ? GraduationCap : CirclePlay;
  const ForumIcon = dark ? MessagesSquare : Users;
  const RankingIcon = dark ? ChartColumn : Trophy;
  // Admin acessa todo o conteúdo sem plano, então a badge Admin ocupa o lugar do plano.
  const planBadge = profile.role === "admin"
    ? <small className="mobile-frame-plan" data-role="admin"><AdminBadge /></small>
    : profile.plan_name && <small className="mobile-frame-plan" title={profile.plan_name}>{profile.plan_name}</small>;

  function mobileIcon(name: ComponentProps<typeof StitchIcon>["name"], fallback: ComponentProps<typeof StitchIcon>["fallback"]) {
    return stitchFrameIcons ? <StitchIcon name={name} fallback={fallback} /> : fallback;
  }

  useEffect(() => {
    const media = window.matchMedia?.("(max-width: 639px)");
    if (!media) return;
    const update = () => setMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

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
      data-member-view={memberView}
      data-mobile-frame={mobileFrame}
      data-admin-view={adminView}
    >
      <a className="skip" href="#main" onClick={(event) => {
        event.preventDefault();
        document.getElementById("main")?.focus();
      }}>
        Pular para o conteúdo
      </a>
      <aside className="sidebar">
        <ShellNavigation admin={admin} profile={profile} installationName={installationName} onToggleTheme={toggleTheme} />
      </aside>
      <div className="workspace">
        <header className="topbar">
          <Dialog.Root open={open} onOpenChange={setOpen}>
            <Dialog.Trigger
              className="icon-button mobile-menu"
              aria-label="Abrir navegação"
              data-tour="navigation"
            >
              {mobileFrame === "browse" ? mobileIcon("menu", <Menu aria-hidden="true" />) : <Menu aria-hidden="true" />}
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="overlay" />
              <Dialog.Content
                className={`drawer stitch-shell-drawer ${admin ? "admin-shell-stitch" : "member-shell-drawer"}`}
                data-member-view={memberView}
                data-mobile-frame={mobileFrame}
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
                <ShellNavigation admin={admin} profile={profile} installationName={installationName} onToggleTheme={toggleTheme} onNavigate={() => setOpen(false)}
                  drawerInitials={mobileFrame === "browse" ? accountInitials : undefined} />
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
          {modulePath && (
            <Link className="icon-button mobile-lesson-back" to={modulePath} state={{ restoreScroll: true }} aria-label="Voltar ao módulo">
              {mobileIcon("arrow_back", <ArrowLeft size={20} aria-hidden="true" />)}
            </Link>
          )}
          {mobileFrame && (
            <div className="mobile-frame-label">
              {lesson ? <span>Aula</span> : installationName === "Icarus" ? (
                <img src={logoUrl} alt="Icarus" />
              ) : <span title={installationName}>{installationName}</span>}
              {!lesson && planBadge}
            </div>
          )}
          {admin ? <>
            <span className="top-context">Administração</span>
            <div className="admin-topbar-brand">
              {installationName === "Icarus" ? <img src={logoUrl} alt="Icarus" /> :
                <strong className="installation-name" title={installationName}>{installationName}</strong>}
            </div>
          </> : <MemberSearch actorId={profile.id} drawerOpen={open} />}
          <div className="topbar-tools">
            <Tour />
            {!admin && <FeedbackButton key={JSON.stringify([profile.id, pathname])} />}
            {lesson && planBadge}
            {!admin && <NotificationBell key={profile.id} memberId={profile.id} stitchIcon={stitchFrameIcons === "browse"} />}
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
          <RouteFocus />
          {admin && profile.role === "admin" && <UpdateNotice />}
          <Outlet />
        </main>
      </div>
      {mobileFrame === "browse" && (
        <nav className="mobile-member-nav" aria-label="Navegação rápida">
          <NavLink to="/app/cursos">{mobileIcon(dark ? "school" : "play_circle", <CourseIcon aria-hidden="true" />)}Cursos</NavLink>
          <NavLink to="/app/comunidade">{mobileIcon(dark ? "forum" : "groups", <ForumIcon aria-hidden="true" />)}Comunidade</NavLink>
          {dark && <NavLink to="/app/podcasts">{mobileIcon("podcasts", <Podcast aria-hidden="true" />)}Podcasts</NavLink>}
          <NavLink to="/app/ranking">{mobileIcon(dark ? "leaderboard" : "emoji_events", <RankingIcon aria-hidden="true" />)}Ranking</NavLink>
          {!dark && <NavLink to="/app/materiais">{mobileIcon("bookmarks", <FolderOpen aria-hidden="true" />)}Materiais</NavLink>}
          <NavLink to="/app/configuracoes">{dark ? mobileIcon("person", <UserRound aria-hidden="true" />) : <UserRound aria-hidden="true" />}Perfil</NavLink>
        </nav>
      )}
    </div>
  );
}
