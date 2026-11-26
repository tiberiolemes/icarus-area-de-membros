import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
vi.hoisted(() => {
  vi.stubEnv("VITE_SUPABASE_URL", "http://127.0.0.1:58521");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-public-key");
});
import { cache, client } from "./api";
import { AuthProvider, Gate, RoleGate } from "./auth";
import { Access } from "./pages/access";
const id = "00000000-0000-4000-8000-000000000090";
const factor = {
  id: "factor-login",
  status: "verified",
  factor_type: "totp",
  friendly_name: "Meu autenticador",
};
const token = (aal: string) =>
  [
    btoa('{"alg":"HS256","typ":"JWT"}'),
    btoa(
      JSON.stringify({
        sub: id,
        aal,
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ),
    btoa("synthetic-signature"),
  ].map((s) => s.replace(/=/g, "")).join(".");
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "x-supabase-api-version": "2024-01-01" },
  });
function Location() {
  return (
    <output data-testid="location">
      {useLocation().pathname + useLocation().search}
    </output>
  );
}
let touchReply: { seconds: number; remembered?: boolean } = { seconds: 1800 };
let profileOverride: Record<string, unknown> = {};
let bootstrapError = false;
let startAt = "/entrar?returnTo=/admin/cursos";
function setup(hasFactor: boolean, failCode = false, loginError?: string, rememberFails = false) {
  const user = {
    id,
    aud: "authenticated",
    app_metadata: {},
    user_metadata: {},
    created_at: new Date().toISOString(),
    factors: hasFactor ? [factor] : [],
  };
  const session = (aal: string) => ({
    access_token: token(aal),
    refresh_token: "synthetic-refresh",
    expires_in: 3600,
    token_type: "bearer",
    user,
  });
  const requests: string[] = [];
  let codes = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      requests.push(url);
      if (url.includes("app_bootstrap")) {
        if (bootstrapError) return json({ code: "P0001", message: "Acesso indisponível." }, 400);
        return json({
          profile: {
            id,
            role: "admin",
            onboarding_complete: true,
            suspended: false,
            password_setup_required: false,
            ...profileOverride,
          },
        });
      }
      if (url.includes("app_touch_session")) {
        return json({
          expires_at: new Date(Date.now() + touchReply.seconds * 1000).toISOString(),
          warning_seconds: 60,
          remembered: touchReply.remembered ?? false,
        });
      }
      if (url.includes("app_remember_session")) {
        return rememberFails
          ? json({ message: "Confirme o código do autenticador para manter este navegador conectado.", code: "P0001" }, 400)
          : json({ expires_at: new Date(Date.now() + 15 * 86400000).toISOString() });
      }
      if (url.includes("app_public_context")) {
        return json({ registration_enabled: false, legal_ready: false });
      }
      if (url.endsWith("/user")) {
        return json(user);
      }
      if (url.includes("grant_type=password")) return loginError
        ? json({msg:loginError === "email_not_confirmed" ? "Email not confirmed" : "Invalid login credentials",code:loginError},400)
        : json(session("aal1"));
      if (url.endsWith("/challenge")) {
        return json({
          id: "challenge-login",
          expires_at: Math.floor(Date.now() / 1000) + 60,
        });
      }
      if (url.endsWith("/verify")) {
        return ++codes === 1 && failCode
          ? json(
            { msg: "Código inválido", code: "mfa_verification_failed" },
            422,
          )
          : json(session("aal2"));
      }
      if (url.includes("/logout")) return json({});
      throw Error("Unexpected test transport path");
    }),
  );
  const result = render(
    <QueryClientProvider client={cache}>
      <MemoryRouter initialEntries={[startAt]}>
        <AuthProvider>
          <Location />
          <Routes>
            <Route path="/entrar" element={<Access mode="login" />} />
            <Route path="/cadastro" element={<Access mode="register" />} />
            <Route path="/recuperar" element={<Access mode="forgot" />} />
            <Route
              path="/confirmar-email"
              element={<Access mode="confirm" />}
            />
            <Route
              path="/admin/membros"
              element={
                <Gate>
                  <RoleGate roles={["admin"]}><h1>Membros</h1></RoleGate>
                </Gate>
              }
            />
            <Route
              path="/admin/cursos"
              element={
                <Gate>
                  <h1>Destino autorizado</h1>
                </Gate>
              }
            />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...result, requests };
}
beforeEach(() => {
  touchReply = { seconds: 1800 };
  profileOverride = {};
  bootstrapError = false;
  startAt = "/entrar?returnTo=/admin/cursos";
  localStorage.clear();
  sessionStorage.clear();
  cache.clear();
});
afterEach(async () => {
  cleanup();
  try {
    await client().auth.signOut({ scope: "local" });
  } finally {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    cache.clear();
  }
});
async function password() {
  const submit = await screen.findByText("Entrar", { selector: "button" });
  expect(submit).toHaveAccessibleName("Entrar");
  await waitFor(() => expect(submit).toBeEnabled());
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: "admin@example.test" },
  });
  fireEvent.change(screen.getByLabelText("Senha"), {
    target: { value: "synthetic-password" },
  });
  fireEvent.submit(submit.closest("form")!);
}
it("sem fator ativo entra após a senha e preserva o destino interno", async () => {
  const { requests } = setup(false);
  await password();
  await screen.findByText("Destino autorizado");
  expect(requests.some((url) => url.endsWith("/challenge"))).toBe(false);
});
it("mantém o mesmo formulário e endereço no desafio, foca o código e permite corrigir sem repetir a senha", async () => {
  const { container, requests } = setup(true, true);
  const form = container.querySelector("form");
  await password();
  const code = await screen.findByLabelText("Código de seis dígitos");
  expect(container.querySelector("form")).toBe(form);
  expect(screen.getByTestId("location")).toHaveTextContent(
    "/entrar?returnTo=/admin/cursos",
  );
  expect(code).toHaveFocus();
  expect(screen.queryByLabelText("Senha")).not.toBeInTheDocument();
  fireEvent.change(code, { target: { value: "123456" } });
  fireEvent.submit(form!);
  await screen.findByRole("alert");
  expect(screen.getByTestId("location")).toHaveTextContent("/entrar");
  expect(code).toHaveValue("");
  fireEvent.change(code, { target: { value: "654321" } });
  fireEvent.submit(form!);
  await screen.findByText("Destino autorizado");
  expect(requests.filter((url) => url.includes("grant_type=password")))
    .toHaveLength(1);
  expect(requests.filter((url) => url.endsWith("/verify"))).toHaveLength(2);
});
it("permite voltar à senha encerrando a sessão incompleta sem acesso ao destino", async () => {
  const { requests } = setup(true);
  await password();
  await screen.findByLabelText("Código de seis dígitos");
  fireEvent.click(
    screen.getByRole("button", { name: "Voltar para email e senha" }),
  );
  await screen.findByLabelText("Senha");
  expect(requests.some((url) => url.includes("/logout"))).toBe(true);
  expect(screen.queryByText("Destino autorizado")).not.toBeInTheDocument();
});

it.each(["Criar conta", "Esqueci minha senha"])(
  "preserva returnTo ao abrir %s e voltar para entrar",
  async (name) => {
    setup(false);
    fireEvent.click(await screen.findByRole("link", { name }));
    expect(screen.getByTestId("location").textContent).toContain(
      "returnTo=%2Fadmin%2Fcursos",
    );
    fireEvent.click(
      await screen.findByRole("link", { name: "Voltar para entrar" }),
    );
    expect(screen.getByTestId("location").textContent).toContain(
      "/entrar?returnTo=%2Fadmin%2Fcursos",
    );
    await password();
    await screen.findByText("Destino autorizado");
  },
);

it("oferece confirmação somente após a resposta nativa e preserva o destino sem enviar email automaticamente", async () => {
  const {requests}=setup(false,false,"email_not_confirmed");
  expect(screen.queryByRole("link",{name:"Reenviar confirmação de email"})).not.toBeInTheDocument();
  await password();
  const link=await screen.findByRole("link",{name:"Reenviar confirmação de email"});
  expect(screen.getByRole("alert")).toHaveTextContent("Confirme seu email antes de entrar");
  expect(screen.getByLabelText("Email")).toHaveValue("admin@example.test");
  expect(screen.getByLabelText("Senha")).toHaveValue("");
  expect(requests.some(url=>url.includes("/resend"))).toBe(false);
  fireEvent.click(link);
  expect(screen.getByTestId("location")).toHaveTextContent("/confirmar-email?returnTo=%2Fadmin%2Fcursos");
  fireEvent.click(await screen.findByRole("link",{name:"Voltar para entrar"}));
  expect(screen.getByTestId("location")).toHaveTextContent("/entrar?returnTo=%2Fadmin%2Fcursos");
});

it("não sugere confirmação para credenciais inválidas", async () => {
  setup(false,false,"invalid_credentials");
  await password();
  expect(await screen.findByRole("alert")).toHaveTextContent("Email ou senha inválidos");
  expect(screen.queryByRole("link",{name:"Reenviar confirmação de email"})).not.toBeInTheDocument();
});

it("descarta o contexto de confirmação quando o email é alterado", async () => {
  setup(false,false,"email_not_confirmed");
  await password();
  await screen.findByRole("link",{name:"Reenviar confirmação de email"});
  fireEvent.change(screen.getByLabelText("Email"),{target:{value:"outra@example.test"}});
  expect(screen.queryByRole("link",{name:"Reenviar confirmação de email"})).not.toBeInTheDocument();
});

async function code(remember: boolean) {
  const input = await screen.findByLabelText("Código de seis dígitos");
  const box = screen.getByRole("checkbox", { name: "Lembrar por 15 dias" });
  expect(box).not.toBeChecked();
  if (remember) fireEvent.click(box);
  fireEvent.change(input, { target: { value: "123456" } });
  fireEvent.submit(input.closest("form")!);
}
it("oferece lembrar por 15 dias só no código e marca a sessão no servidor depois da verificação", async () => {
  const { requests } = setup(true);
  await waitFor(() => expect(screen.getByRole("button", { name: "Entrar" })).toBeEnabled());
  expect(screen.queryByRole("checkbox", { name: "Lembrar por 15 dias" })).not.toBeInTheDocument();
  await password();
  await code(true);
  await screen.findByText("Destino autorizado");
  const verify = requests.findIndex((url) => url.endsWith("/verify")),
    remember = requests.findIndex((url) => url.includes("app_remember_session"));
  expect(remember).toBeGreaterThan(verify);
  expect(requests.filter((url) => url.includes("app_remember_session"))).toHaveLength(1);
});
it("sem a caixa marcada entra como antes, sem lembrar a sessão", async () => {
  const { requests } = setup(true);
  await password();
  await code(false);
  await screen.findByText("Destino autorizado");
  expect(requests.some((url) => url.includes("app_remember_session"))).toBe(false);
});
it("entra com a sessão comum e avisa quando o lembrar falha depois do código", async () => {
  const { requests } = setup(true, false, undefined, true);
  await password();
  await code(true);
  await screen.findByText("Destino autorizado");
  expect(screen.getByTestId("location")).toHaveTextContent("/admin/cursos");
  expect(await screen.findByText(/Você entrou, mas este navegador não ficou lembrado por 15 dias/)).toBeInTheDocument();
  expect(requests.filter((url) => url.includes("app_remember_session"))).toHaveLength(1);
});
it("não mostra o aviso de lembrar quando a marcação dá certo", async () => {
  setup(true);
  await password();
  await code(true);
  await screen.findByText("Destino autorizado");
  expect(screen.queryByText(/não ficou lembrado/)).not.toBeInTheDocument();
});

it.each([
  [false, "Sua sessão termina em", true],
  [true, "Os 15 dias desta sessão terminam em", false],
])("no último minuto avisa a sessão lembrada (%s) sem oferecer prolongar o que não prolonga", async (remembered, text, extend) => {
  // A limpeza restaura o relógio depois de encerrar a sessão simulada.
  vi.setSystemTime(new Date("2026-11-26T14:00:00Z"));
  touchReply = { seconds: 30, remembered };
  setup(false);
  await password();
  await screen.findByText("Destino autorizado");
  expect((await screen.findByText(new RegExp(text))).closest('[role="alert"]')).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Continuar conectado" }) !== null).toBe(extend);
});

it("conta suspensa vê título, orientação e a saída, que encerra a sessão", async () => {
  profileOverride = { suspended: true };
  const { requests } = setup(false);
  await password();
  expect(await screen.findByRole("heading", { level: 1, name: "Acesso indisponível" })).toBeVisible();
  expect(screen.queryByText("Destino autorizado")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Sair e usar outra conta" }));
  await waitFor(() => expect(requests.some((url) => url.includes("/logout"))).toBe(true));
});
it("papel sem permissão vê título e o caminho para a própria área do painel", async () => {
  profileOverride = { role: "moderator" };
  startAt = "/entrar?returnTo=/admin/membros";
  setup(false);
  await password();
  const heading = await screen.findByText("Acesso restrito", { selector: "h1" });
  expect(heading).toBeVisible();
  expect(heading).toHaveAccessibleName("Acesso restrito");
  expect(screen.getByRole("alert")).toHaveTextContent("Você não tem permissão para esta área.");
  expect(screen.getByRole("link", { name: "Voltar ao painel" })).toHaveAttribute("href", "/admin/comunidade");
});

it("cadastro fechado mostra um aviso com a saída e não oferece o formulário", async () => {
  startAt = "/cadastro";
  setup(false);
  expect(await screen.findByText(/Os documentos legais ainda não foram publicados/)).toBeVisible();
  expect(document.querySelectorAll(".notice")).toHaveLength(1);
  expect(screen.getByRole("link", { name: "Voltar para entrar" })).toHaveAttribute("href", expect.stringContaining("/entrar"));
  expect(screen.queryByRole("button", { name: "Criar conta" })).not.toBeInTheDocument();
});

it("conta suspensa recusada pelo servidor vê a explicação com moldura e a saída", async () => {
  bootstrapError = true;
  const { requests } = setup(false);
  await password();
  expect(await screen.findByRole("heading", { level: 1, name: "Acesso indisponível" })).toBeVisible();
  expect(screen.getByText(/conta está suspensa ou sem acesso/)).toBeVisible();
  expect(screen.queryByRole("button", { name: "Tentar novamente" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Sair e usar outra conta" }));
  await waitFor(() => expect(requests.some((url) => url.includes("/logout"))).toBe(true));
});
