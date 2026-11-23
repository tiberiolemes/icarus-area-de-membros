import { Component, Suspense, lazy } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Link, Navigate, Route, Routes } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { cache } from "./api";
import { AuthProvider, Gate, RoleGate } from "./auth";
import {
  Access,
  Callback,
  Legal,
  Onboarding,
  PublicFrame,
} from "./pages/access";
import { Shell } from "./shell";
import { Loading, Heading, Notice } from "./ui";
import { Help } from "./pages/help";
import "./style.css";

const Catalog = lazy(() =>
    import("./pages/learning").then((m) => ({ default: m.Catalog })),
  ),
  CoursePage = lazy(() =>
    import("./pages/learning").then((m) => ({ default: m.CoursePage })),
  ),
  LessonPage = lazy(() =>
    import("./pages/learning").then((m) => ({ default: m.LessonPage })),
  ),
  Materials = lazy(() =>
    import("./pages/learning").then((m) => ({ default: m.Materials })),
  );
const Settings = lazy(() =>
    import("./pages/settings").then((m) => ({ default: m.Settings })),
  ),
  Community = lazy(() =>
    import("./pages/community").then((m) => ({ default: m.Community })),
  ),
  Composer = lazy(() =>
    import("./pages/community").then((m) => ({ default: m.Composer })),
  ),
  PostPage = lazy(() =>
    import("./pages/community").then((m) => ({ default: m.PostPage })),
  );
const Tickets = lazy(() =>
    import("./pages/support").then((m) => ({ default: m.Tickets })),
  ),
  NewTicket = lazy(() =>
    import("./pages/support").then((m) => ({ default: m.NewTicket })),
  ),
  TicketPage = lazy(() =>
    import("./pages/support").then((m) => ({ default: m.TicketPage })),
  );
const Certificates = lazy(() =>
    import("./pages/certificates").then((m) => ({ default: m.Certificates })),
  ),
  CertificatePage = lazy(() =>
    import("./pages/certificates").then((m) => ({
      default: m.CertificatePage,
    })),
  ),
  Checkout = lazy(() =>
    import("./pages/checkout").then((m) => ({ default: m.Checkout })),
  ),
  OrderStatus = lazy(() =>
    import("./pages/checkout").then((m) => ({ default: m.OrderStatus })),
  );
const AdminCourses = lazy(() =>
    import("./pages/admin").then((m) => ({ default: m.AdminCourses })),
  ),
  CourseEditor = lazy(() =>
    import("./pages/admin").then((m) => ({ default: m.CourseEditor })),
  ),
  AdminMaterials = lazy(() =>
    import("./pages/admin").then((m) => ({ default: m.AdminMaterials })),
  ),
  AdminMembers = lazy(() =>
    import("./pages/admin").then((m) => ({ default: m.AdminMembers })),
  ),
  MemberEditor = lazy(() =>
    import("./pages/admin").then((m) => ({ default: m.MemberEditor })),
  ),
  AdminPlans = lazy(() =>
    import("./pages/admin").then((m) => ({ default: m.AdminPlans })),
  ),
  AdminOrders = lazy(() =>
    import("./pages/admin").then((m) => ({ default: m.AdminOrders })),
  ),
  AdminCommunity = lazy(() =>
    import("./pages/admin").then((m) => ({ default: m.AdminCommunity })),
  ),
  AdminSettings = lazy(() =>
    import("./pages/admin").then((m) => ({ default: m.AdminSettings })),
  );
class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <PublicFrame>
        <Heading title="Não foi possível abrir esta tela" />
        <Notice error>
          Ocorreu uma falha inesperada. Seus dados no servidor foram
          preservados. Volte ao início e tente novamente.
        </Notice>
        <a className="button" href="/entrar">
          Voltar ao início
        </a>
      </PublicFrame>
    ) : (
      this.props.children
    );
  }
}
function NotFound() {
  return (
    <>
      <Heading title="Página não encontrada" />
      <p>O endereço pode ter mudado ou não estar mais disponível.</p>
      <Link className="button" to="/app/cursos">
        Voltar aos cursos
      </Link>
    </>
  );
}
const restricted = (roles: string[], children: ReactNode) => (
  <RoleGate roles={roles}>{children}</RoleGate>
);
function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={cache}>
        <BrowserRouter>
          <AuthProvider>
            <Suspense fallback={<Loading />}>
              <Routes>
                <Route
                  path="/"
                  element={<Navigate to="/app/cursos" replace />}
                />
                <Route path="/entrar" element={<Access mode="login" />} />
                <Route path="/cadastro" element={<Access mode="register" />} />
                <Route path="/recuperar" element={<Access mode="forgot" />} />
                <Route
                  path="/redefinir-senha"
                  element={<Access mode="reset" />}
                />
                <Route
                  path="/confirmar-email"
                  element={<Access mode="confirm" />}
                />
                <Route path="/auth/callback" element={<Callback />} />
                <Route
                  path="/onboarding"
                  element={
                    <Gate>
                      <Onboarding />
                    </Gate>
                  }
                />
                <Route path="/termos" element={<Legal kind="terms" />} />
                <Route path="/privacidade" element={<Legal kind="privacy" />} />
                <Route path="/ajuda" element={<Help />} />
                <Route path="/ajuda/:artigo" element={<Help />} />
                <Route path="/checkout" element={<Checkout />} />
                <Route path="/short-checkout" element={<Checkout />} />
                <Route path="/pedido/:pedido" element={<OrderStatus />} />
                <Route
                  path="/certificado/:codigo"
                  element={<CertificatePage />}
                />
                <Route
                  path="/verificar/:codigo"
                  element={<CertificatePage verify />}
                />
                <Route
                  path="/app"
                  element={
                    <Gate>
                      <Shell />
                    </Gate>
                  }
                >
                  <Route index element={<Navigate to="cursos" replace />} />
                  <Route path="cursos" element={<Catalog />} />
                  <Route path="cursos/:curso" element={<CoursePage />} />
                  <Route
                    path="cursos/:curso/:modulo"
                    element={<CoursePage />}
                  />
                  <Route
                    path="cursos/:curso/:modulo/:aula"
                    element={<LessonPage />}
                  />
                  <Route path="materiais" element={<Materials />} />
                  <Route path="materiais/:pasta" element={<Materials />} />
                  <Route path="certificados" element={<Certificates />} />
                  <Route path="configuracoes" element={<Settings />} />
                  <Route path="comunidade" element={<Community />} />
                  <Route path="comunidade/novo" element={<Composer />} />
                  <Route path="comunidade/:post" element={<PostPage />} />
                  <Route
                    path="comunidade/:post/editar"
                    element={<Composer />}
                  />
                  <Route path="suporte" element={<Tickets />} />
                  <Route path="suporte/novo" element={<NewTicket />} />
                  <Route path="suporte/:ticket" element={<TicketPage />} />
                  <Route path="*" element={<NotFound />} />
                </Route>
                <Route
                  path="/admin"
                  element={
                    <Gate
                      roles={["admin", "instructor", "moderator", "support"]}
                    >
                      <Shell />
                    </Gate>
                  }
                >
                  <Route
                    index
                    element={<Navigate to="/app/cursos" replace />}
                  />
                  <Route
                    path="cursos"
                    element={restricted(
                      ["admin", "instructor"],
                      <AdminCourses />,
                    )}
                  />
                  <Route
                    path="cursos/:id"
                    element={restricted(
                      ["admin", "instructor"],
                      <CourseEditor />,
                    )}
                  />
                  <Route
                    path="materiais"
                    element={restricted(
                      ["admin", "instructor"],
                      <AdminMaterials />,
                    )}
                  />
                  <Route
                    path="membros"
                    element={restricted(["admin"], <AdminMembers />)}
                  />
                  <Route
                    path="membros/:id"
                    element={restricted(["admin"], <MemberEditor />)}
                  />
                  <Route
                    path="planos"
                    element={restricted(["admin"], <AdminPlans />)}
                  />
                  <Route
                    path="pedidos"
                    element={restricted(["admin"], <AdminOrders />)}
                  />
                  <Route
                    path="pedidos/:id"
                    element={restricted(["admin"], <AdminOrders />)}
                  />
                  <Route
                    path="comunidade"
                    element={restricted(
                      ["admin", "moderator"],
                      <AdminCommunity />,
                    )}
                  />
                  <Route
                    path="comunidade/:post"
                    element={restricted(
                      ["admin", "moderator"],
                      <PostPage admin />,
                    )}
                  />
                  <Route
                    path="suporte"
                    element={restricted(
                      ["admin", "support"],
                      <Tickets admin />,
                    )}
                  />
                  <Route
                    path="suporte/:ticket"
                    element={restricted(
                      ["admin", "support"],
                      <TicketPage admin />,
                    )}
                  />
                  <Route
                    path="configuracoes"
                    element={restricted(["admin"], <AdminSettings />)}
                  />
                  <Route path="*" element={<NotFound />} />
                </Route>
                <Route
                  path="*"
                  element={
                    <PublicFrame>
                      <NotFound />
                    </PublicFrame>
                  }
                />
              </Routes>
            </Suspense>
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
