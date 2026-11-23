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
import { AuthProvider, Gate } from "./auth";
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
    headers: { "content-type": "application/json" },
  });
function Location() {
  return (
    <output data-testid="location">
      {useLocation().pathname + useLocation().search}
    </output>
  );
}
function setup(hasFactor: boolean, failCode = false) {
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
        return json({
          profile: {
            id,
            role: "admin",
            onboarding_complete: true,
            suspended: false,
            password_setup_required: false,
          },
        });
      }
      if (url.includes("app_touch_session")) {
        return json({
          expires_at: new Date(Date.now() + 1800000).toISOString(),
          warning_seconds: 60,
        });
      }
      if (url.includes("app_public_context")) {
        return json({ registration_enabled: false, legal_ready: false });
      }
      if (url.endsWith("/user")) {
        return json(user);
      }
      if (url.includes("grant_type=password")) return json(session("aal1"));
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
      <MemoryRouter initialEntries={["/entrar?returnTo=/admin/cursos"]}>
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
  localStorage.clear();
  sessionStorage.clear();
  cache.clear();
});
afterEach(async () => {
  await client().auth.signOut({ scope: "local" });
  cleanup();
  vi.unstubAllGlobals();
  cache.clear();
});
async function password() {
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Entrar" })).toBeEnabled()
  );
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: "admin@example.test" },
  });
  fireEvent.change(screen.getByLabelText("Senha"), {
    target: { value: "synthetic-password" },
  });
  fireEvent.submit(
    screen.getByRole("button", { name: "Entrar" }).closest("form")!,
  );
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

it.each(["Criar uma conta", "Esqueci minha senha", "Confirmar email"])(
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
