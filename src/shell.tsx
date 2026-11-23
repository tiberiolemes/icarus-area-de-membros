import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import * as Dialog from "@radix-ui/react-dialog";
import {
  BookOpen,
  Files,
  Award,
  MessageSquare,
  LifeBuoy,
  Settings,
  Users,
  CreditCard,
  Menu,
  X,
  LogOut,
  HelpCircle,
  ArrowUpRight,
} from "lucide-react";
import { signOut } from "./api";
import { useBootstrap } from "./auth";
import { Action, RouteFocus } from "./ui";
import { Tour } from "./tour";

const memberNav = [
  ["Cursos", "cursos", BookOpen],
  ["Materiais", "materiais", Files],
  ["Certificados", "certificados", Award],
  ["Comunidade", "comunidade", MessageSquare],
  ["Suporte", "suporte", LifeBuoy],
  ["Configurações", "configuracoes", Settings],
] as const;
const adminNav = [
  ["Conteúdo", "cursos", BookOpen, ["admin", "instructor"]],
  ["Materiais", "materiais", Files, ["admin", "instructor"]],
  ["Membros", "membros", Users, ["admin"]],
  ["Planos", "planos", CreditCard, ["admin"]],
  ["Pedidos", "pedidos", CreditCard, ["admin"]],
  ["Comunidade", "comunidade", MessageSquare, ["admin", "moderator"]],
  ["Suporte", "suporte", LifeBuoy, ["admin", "support"]],
  ["Configurações", "configuracoes", Settings, ["admin"]],
] as const;
export function Shell() {
  const boot = useBootstrap(),
    profile = boot.data!.profile,
    { pathname } = useLocation(),
    admin = pathname.startsWith("/admin"),
    [open, setOpen] = useState(false);
  useEffect(() => {
    document.documentElement.dataset.theme = profile.theme ?? "light";
  }, [profile.theme, profile.id]);
  useEffect(() => setOpen(false), [pathname]);
  const nav = (
    <>
      <Link className="rail-brand" to="/app/cursos">
        Icarus<span>Área de membros</span>
      </Link>
      <nav
        aria-label={admin ? "Administração" : "Área de membros"}
        data-tour="navigation"
      >
        {(admin
          ? adminNav.filter((item) =>
              (item[3] as readonly string[]).includes(profile.role),
            )
          : memberNav
        ).map(([title, path, Icon]) => (
          <NavLink key={path} to={(admin ? "/admin/" : "/app/") + path}>
            <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
            {title}
          </NavLink>
        ))}
      </nav>
      <div className="rail-bottom">
        {profile.role !== "member" && (
          <Link
            to={
              admin
                ? "/app/cursos"
                : adminNav.find((item) =>
                      (item[3] as readonly string[]).includes(profile.role),
                    )
                  ? "/admin/" +
                    adminNav.find((item) =>
                      (item[3] as readonly string[]).includes(profile.role),
                    )![1]
                  : "/app/cursos"
            }
          >
            <ArrowUpRight size={20} />
            {admin ? "Área do aluno" : "Administração"}
          </Link>
        )}
        <Link to="/ajuda">
          <HelpCircle size={20} />
          Central de ajuda
        </Link>
        <Action
          run={async () => {
            await signOut();
          }}
        >
          <LogOut size={20} />
          Sair
        </Action>
      </div>
    </>
  );
  return (
    <div className="app-shell">
      <a className="skip" href="#main">
        Pular para o conteúdo
      </a>
      <aside className="sidebar">{nav}</aside>
      <div className="workspace">
        <header className="topbar">
          <Dialog.Root open={open} onOpenChange={setOpen}>
            <Dialog.Trigger
              className="icon-button mobile-menu"
              aria-label="Abrir navegação"
            >
              <Menu />
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="overlay" />
              <Dialog.Content className="drawer">
                <Dialog.Title className="sr-only">Navegação</Dialog.Title>
                <Dialog.Description className="sr-only">
                  Navegue pela área de membros.
                </Dialog.Description>
                {nav}
                <Dialog.Close
                  className="icon-button close"
                  aria-label="Fechar navegação"
                >
                  <X />
                </Dialog.Close>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
          <span className="top-context">
            {admin ? "Administração" : "Seu espaço de aprendizado"}
          </span>
          <Tour />
          <Link className="account-link" to="/app/configuracoes">
            <span className="avatar" aria-hidden="true">
              {profile.full_name?.slice(0, 1) || "I"}
            </span>
            <span>
              {profile.full_name}
              <small>{profile.plan_name || "Sem plano ativo"}</small>
            </span>
          </Link>
        </header>
        <main id="main" className="content">
          <RouteFocus />
          <Outlet />
        </main>
      </div>
    </div>
  );
}
