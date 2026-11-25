import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
vi.hoisted(() => {
  vi.stubEnv("VITE_SUPABASE_URL", "http://127.0.0.1:58521");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-public-key");
});
import { cache, client, internalPath, safeUrl, useRpc } from "./api";
import { AccountAssurance, AuthProvider, useAuth } from "./auth";
import { Action, Field, Form } from "./ui";
import { sanitizeRich, RichContent, RichEditor } from "./rich";
import { acceptsPlayerMessage, playerSeconds } from "./bunny";
import { Catalog, MaterialList } from "./pages/learning";
import { Moderate, Composer } from "./pages/community";
import { pdfWithImage } from "./certificate";
import { Mfa } from "./pages/settings";
import { Access, CompanyFields, PublicFrame, companyData } from "./pages/access";

function wrap(node: React.ReactNode) {
  return render(
    <QueryClientProvider client={cache}>
      <MemoryRouter>{node}</MemoryRouter>
    </QueryClientProvider>,
  );
}
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
beforeEach(() => {
  cache.clear();
  localStorage.clear();
  sessionStorage.clear();
  vi.restoreAllMocks();
});
afterEach(() => {
  cleanup();
  cache.clear();
  vi.unstubAllGlobals();
});
it("a moldura pública usa o nome publicado pela instalação", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => json({ name: "Academia de teste" })));
  wrap(<PublicFrame><p>Área pública</p></PublicFrame>);
  const brand = await screen.findByRole("link", { name: "Academia de teste, início" });
  expect(brand).toHaveTextContent("Academia de teste");
  expect(brand).toHaveAttribute("href", "/entrar");
});

it("a moldura pública troca o nome pela logo da instalação antes do login", async () => {
  const light = "logo/light-11111111-1111-4111-8111-111111111111.png";
  vi.stubGlobal("fetch", vi.fn(async () => json({ name: "Academia de teste", logo_light: light, logo_dark: null })));
  wrap(<PublicFrame><p>Área pública</p></PublicFrame>);
  const brand = await screen.findByRole("link", { name: "Academia de teste, início" });
  const logo = await screen.findByRole("img", { name: "Academia de teste" });
  expect(brand).toContainElement(logo);
  expect(logo).toHaveAttribute("src", `http://127.0.0.1:58521/storage/v1/object/public/icarus-brand/${light}`);
  expect(logo).toHaveClass("brand-custom");
});

describe("Formulários reais", () => {
  it("permite mostrar a senha, bloqueia o toggle no envio e limpa inclusive senha visível na falha", async () => {
    let resolve!: (response: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).includes("/auth/v1/token")
          ? await new Promise<Response>((r) => {
              resolve = r;
            })
          : json({
              name: "Icarus",
              registration_enabled: false,
              legal_ready: false,
              legal_versions: [],
              plans: [],
            }),
      ),
    );
    wrap(<AuthProvider><Access mode="login" /></AuthProvider>);
    await waitFor(() => expect(screen.getByRole("button", { name: "Entrar" })).toBeEnabled());
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "synthetic@example.test" },
    });
    fireEvent.change(screen.getByLabelText("Senha"), {
      target: { value: "synthetic-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Mostrar senha" }));
    expect(screen.getByLabelText("Senha")).toHaveAttribute("type", "text");
    fireEvent.submit(
      screen.getByRole("button", { name: "Entrar" }).closest("form")!,
    );
    expect(
      screen.getByRole("button", { name: "Ocultar senha" }),
    ).toBeDisabled();
    await waitFor(() => expect(resolve).toBeTypeOf("function"));
    await act(async () =>
      resolve(
        json(
          { message: "Invalid login credentials", code: "invalid_credentials" },
          400,
        ),
      ),
    );
    await screen.findByRole("alert");
    expect(screen.getByLabelText("Senha")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Ocultar senha" })).toBeEnabled();
  });
  it("indica o campo inválido em português e mantém o resumo acessível", async () => {
    const save = vi.fn();
    wrap(
      <Form onSave={save}>
        <Field label="Email obrigatório">
          <input name="email" type="email" required />
        </Field>
      </Form>,
    );
    fireEvent.submit(
      screen.getByRole("button", { name: "Salvar" }).closest("form")!,
    );
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Email obrigatório")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByText("Preencha este campo.")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("alert")).toHaveFocus());
  });
  it("usa o TipTap real e bloqueia edição por teclado durante envio", async () => {
    let reject!: (error: Error) => void;
    const save = vi.fn(
      () =>
        new Promise((_, r) => {
          reject = r;
        }),
    );
    const { container } = wrap(
      <Form onSave={save}>
        <RichEditor initial="<p><strong>Descrição rica</strong></p>" />
      </Form>,
    );
    expect(screen.getByRole("textbox", { name: "Descrição" })).toHaveAttribute(
      "contenteditable",
      "true",
    );
    expect(container.querySelector("input[name=description]")).toHaveValue(
      "<p><strong>Descrição rica</strong></p>",
    );
    fireEvent.submit(
      screen.getByRole("button", { name: "Salvar" }).closest("form")!,
    );
    await waitFor(() =>
      expect(
        screen.getByRole("textbox", { name: "Descrição" }),
      ).toHaveAttribute("contenteditable", "false"),
    );
    await act(async () => reject(new Error("Falha de rede")));
    await waitFor(() =>
      expect(
        screen.getByRole("textbox", { name: "Descrição" }),
      ).toHaveAttribute("contenteditable", "true"),
    );
    expect(screen.getByText("Descrição rica")).toBeInTheDocument();
  });
  it("bloqueia envios simultâneos e mantém texto em falha com foco no resumo", async () => {
    let reject!: (e: Error) => void;
    const save = vi.fn(
      () =>
        new Promise((_, r) => {
          reject = r;
        }),
    );
    wrap(
      <Form onSave={save}>
        <Field label="Mensagem">
          <textarea name="body" required defaultValue="Texto a preservar" />
        </Field>
      </Form>,
    );
    const form = screen
      .getByRole("button", { name: "Salvar" })
      .closest("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(save).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Enviando…" })).toBeDisabled();
    await act(async () =>
      reject(new Error("Sua sessão expirou. Entre novamente.")),
    );
    expect(screen.getByLabelText("Mensagem")).toHaveValue("Texto a preservar");
    await waitFor(() => expect(screen.getByRole("alert")).toHaveFocus());
    expect(screen.getByRole("button", { name: "Salvar" })).toBeEnabled();
  });
  it("libera uma ação para tentar novamente depois de erro de rede", async () => {
    const run = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce({});
    wrap(<Action run={run}>Confirmar</Action>);
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    await screen.findByRole("alert");
    expect(screen.getByRole("alert")).toHaveTextContent("Sem conexão");
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    await waitFor(() => expect(run).toHaveBeenCalledTimes(2));
  });
});
describe("Confiança na fronteira do browser", () => {
  it("só aceita tempo válido do iframe exato e da origem autorizada", () => {
    const iframe = document.createElement("iframe");
    document.body.append(iframe);
    expect(
      acceptsPlayerMessage(
        new MessageEvent("message", {
          origin: "https://player.mediadelivery.net",
          source: iframe.contentWindow,
        }),
        iframe,
        "https://player.mediadelivery.net",
      ),
    ).toBe(true);
    expect(
      acceptsPlayerMessage(
        new MessageEvent("message", {
          origin: "https://evil.example",
          source: iframe.contentWindow,
        }),
        iframe,
        "https://player.mediadelivery.net",
      ),
    ).toBe(false);
    expect(
      acceptsPlayerMessage(
        new MessageEvent("message", {
          origin: "https://player.mediadelivery.net",
          source: window,
        }),
        iframe,
        "https://player.mediadelivery.net",
      ),
    ).toBe(false);
    expect(playerSeconds('{"seconds":42}')).toBe(42);
    expect(playerSeconds({ seconds: -1 })).toBeNull();
    expect(playerSeconds({ seconds: Infinity })).toBeNull();
    expect(playerSeconds("{broken")).toBeNull();
    iframe.remove();
  });
  it("rejeita retorno externo, esquema ativo e barra invertida", () => {
    expect(internalPath("https://evil.example/app")).toBe("/app/cursos");
    expect(internalPath("//evil.example/app")).toBe("/app/cursos");
    expect(internalPath("/app\\evil.example")).toBe("/app/cursos");
    expect(internalPath("/app/cursos/curso/modulo/aula?q=ok")).toBe(
      "/app/cursos/curso/modulo/aula?q=ok",
    );
    expect(safeUrl("javascript:alert(1)")).toBeUndefined();
    expect(safeUrl("data:text/html,test")).toBeUndefined();
  });
  it("renderiza texto rico sem script, handlers, SVG ou links executáveis", () => {
    const content =
      '<p>Olá <strong>aluno</strong><img src=x onerror=alert(1)><a href="javascript:alert(1)">link</a><svg onload=alert(2)></svg><script>alert(3)</script></p>';
    const sanitized = sanitizeRich(content);
    expect(sanitized).not.toMatch(/script|onerror|onload|javascript|<svg|<img/);
    const { container } = wrap(<RichContent content={content} />);
    expect(container.querySelector("strong")).toHaveTextContent("aluno");
    expect(container.querySelector("a")).not.toHaveAttribute("href");
  });
});
describe("SDK e componentes do domínio com fetch controlado", () => {
  it.each([
    { hasFactor: false, aal: "aal1" },
    { hasFactor: true, aal: "aal1" },
    { hasFactor: true, aal: "aal2" },
  ])(
    "aplica o segundo fator quando a conta tem autenticador: $hasFactor/$aal",
    async ({ hasFactor, aal }) => {
      const id = "00000000-0000-4000-8000-000000000004",
        user = {
          id,
          aud: "authenticated",
          app_metadata: {},
          user_metadata: {},
          factors: hasFactor
            ? [{ id: "totp-factor", factor_type: "totp", status: "verified" }]
            : [],
          created_at: new Date().toISOString(),
        },
        token = [
          btoa('{"alg":"HS256"}'),
          btoa(
            JSON.stringify({
              sub: id,
              aal,
              exp: Math.floor(Date.now() / 1000) + 3600,
            }),
          ),
          btoa("signature"),
        ]
          .map((s) => s.replace(/=/g, ""))
          .join(".");
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => json(user)),
      );
      const session = await client().auth.setSession({
        access_token: token,
        refresh_token: "synthetic-refresh",
      });
      expect(session.error).toBeNull();
      wrap(
        <Routes>
          <Route path="/" element={<AccountAssurance><p>Conteúdo autorizado</p></AccountAssurance>} />
          <Route path="/entrar" element={<h1>Login no mesmo formulário</h1>} />
        </Routes>,
      );
      if (hasFactor && aal === "aal1") {
        await screen.findByRole("heading", { name: "Login no mesmo formulário" });
        expect(
          screen.queryByText("Conteúdo autorizado"),
        ).not.toBeInTheDocument();
      } else await screen.findByText("Conteúdo autorizado");
      await act(async () => {
        await client().auth.signOut({ scope: "local" });
      });
    },
  );
  it.each([false, true])(
    "respeita company_required com pergunta name ativa=%s no DTO de bootstrap real",
    async (hasQuestion) => {
      const id = "00000000-0000-4000-8000-000000000003",
        user = {
          id,
          aud: "authenticated",
          app_metadata: {},
          user_metadata: {},
          created_at: new Date().toISOString(),
        },
        token = [
          btoa('{"alg":"HS256"}'),
          btoa(
            JSON.stringify({
              sub: id,
              exp: Math.floor(Date.now() / 1000) + 3600,
            }),
          ),
          btoa("signature"),
        ]
          .map((s) => s.replace(/=/g, ""))
          .join(".");
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL) =>
          String(input).endsWith("/user")
            ? json(user)
            : json({
                profile: {
                  id,
                  full_name: "Aluno sintético",
                  role: "member",
                  theme: "light",
                  company: {},
                  onboarding_complete: false,
                },
                plans: [],
                settings: {
                  onboarding: {
                    company_required: true,
                    company_label: "Empresa obrigatória",
                  },
                  onboarding_questions: hasQuestion
                    ? [
                        {
                          id: "q1",
                          key: "name",
                          label: "Sua organização",
                          type: "text",
                          options: [],
                          required: false,
                          active: true,
                          order_index: 0,
                        },
                      ]
                    : [],
                },
              }),
        ),
      );
      await client().auth.setSession({
        access_token: token,
        refresh_token: "synthetic-refresh",
      });
      const save = vi.fn(async (_data: FormData) => {});
      wrap(
        <AuthProvider>
          <Form onSave={save}>
            <CompanyFields />
          </Form>
        </AuthProvider>,
      );
      const input = await screen.findByRole("textbox", {
        name: hasQuestion ? "Sua organização *" : "Empresa obrigatória",
      });
      expect(input).toBeRequired();
      fireEvent.submit(
        screen.getByRole("button", { name: "Salvar" }).closest("form")!,
      );
      expect(save).not.toHaveBeenCalled();
      fireEvent.change(input, { target: { value: "Empresa sintética" } });
      fireEvent.submit(
        screen.getByRole("button", { name: "Salvar" }).closest("form")!,
      );
      await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
      expect(companyData(save.mock.calls[0][0] as FormData)).toEqual({
        name: "Empresa sintética",
      });
      await act(async () => {
        await client().auth.signOut({ scope: "local" });
      });
    },
  );
  it("consulta busca e paginação no RPC real do SDK, sem lista de cursos fictícia", async () => {
    const fetcher = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(String(input)).toContain("/rest/v1/rpc/app_catalog_showcase");
        const args = JSON.parse(String(init?.body));
        return json({
          items: args.p_query
            ? [
                {
                  id: "course",
                  slug: "curso-real",
                  state: "ongoing", module_count: 1, target: null,
                  title: "Curso retornado pelo servidor",
                  description: "Descrição",
                  total_lessons: 2,
                  completed_lessons: 1,
                  progress_percent: 50,
                  duration_seconds: 120,
                  can_access: true,
                },
              ]
            : [],
          total: args.p_query ? 1 : 0,
          page: args.p_page,
          page_size: 20,
        });
      },
    );
    vi.stubGlobal("fetch", fetcher);
    wrap(<Catalog />);
    await screen.findByText(
      "Nenhum curso publicado para seu perfil. Os cursos liberados aparecerão aqui.",
    );
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "busca" },
    });
    fireEvent.submit(screen.getByRole("search"));
    await screen.findByRole("heading", {
      name: "Curso retornado pelo servidor",
    });
    expect(
      fetcher.mock.calls.some(
        ([, init]) => JSON.parse(String(init?.body)).p_query === "busca",
      ),
    ).toBe(true);
    expect(screen.getByText("1/2 aulas · 50%")).toBeInTheDocument();
  });
  it("não abre download quando o servidor nega a assinatura", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ message: "Acesso não permitido." }, 403)),
    );
    const open = vi.spyOn(window, "open");
    wrap(
      <MaterialList
        materials={[
          {
            id: "m",
            name: "Material privado",
            description: "",
            file_type: "application/pdf",
            size_bytes: 12,
            folder_id: "f",
            can_access: true,
          },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Baixar/ }));
    await screen.findByRole("alert");
    expect(open).not.toHaveBeenCalled();
  });
  it("só confirma moderação depois da RPC e atualiza o consumidor", async () => {
    let resolve!: (response: Response) => void;
    const fetcher = vi.fn(
      (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Promise<Response>((r) => {
          resolve = r;
        }),
    );
    vi.stubGlobal("fetch", fetcher);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const after = vi.fn();
    wrap(<Moderate id="post-id" type="post" after={after} />);
    fireEvent.click(screen.getByText("Moderação manual"));
    fireEvent.change(screen.getByLabelText("Motivo da decisão"), {
      target: { value: "Conteúdo revisado manualmente" },
    });
    fireEvent.submit(
      screen
        .getByRole("button", { name: "Confirmar decisão" })
        .closest("form")!,
    );
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    expect(after).not.toHaveBeenCalled();
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toMatchObject({
      p_target_type: "post",
      p_target_id: "post-id",
      p_decision: "approve",
    });
    await act(async () => resolve(json({ id: "post-id", status: "approved" })));
    await waitFor(() => expect(after).toHaveBeenCalledTimes(1));
  });
  it("mantém MFA no SDK nativo e exige challenge/verify antes de confirmar", async () => {
    const user = {
      id: "00000000-0000-4000-8000-000000000001",
      aud: "authenticated",
      email: "synthetic@example.test",
      app_metadata: {},
      user_metadata: {},
      created_at: new Date().toISOString(),
      factors: [
        {
          id: "factor-id",
          status: "verified",
          factor_type: "totp",
          friendly_name: "Teste",
        },
      ],
    };
    const token = (aal: string) =>
      btoa(JSON.stringify({ alg: "HS256", typ: "JWT" })).replace(/=/g, "") +
      "." +
      btoa(
        JSON.stringify({
          sub: user.id,
          exp: Math.floor(Date.now() / 1000) + 3600,
          aal,
        }),
      ).replace(/=/g, "") +
      "." +
      btoa("synthetic-signature").replace(/=/g, "");
    const requests: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        requests.push(url);
        if (url.endsWith("/user")) return json(user);
        if (url.endsWith("/challenge"))
          return json({
            id: "challenge-id",
            expires_at: Math.floor(Date.now() / 1000) + 60,
          });
        if (url.endsWith("/verify"))
          return json({
            access_token: token("aal2"),
            refresh_token: "synthetic-refresh",
            expires_in: 3600,
            token_type: "bearer",
            user,
          });
        return json({ message: "Unexpected request" }, 400);
      }),
    );
    const sessionResult = await client().auth.setSession({
      access_token: token("aal1"),
      refresh_token: "synthetic-refresh",
    });
    expect(sessionResult.error).toBeNull();
    const verified = vi.fn();
    wrap(<Mfa required onVerified={verified} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Consultar autenticadores" }),
    );
    await screen.findByLabelText("Código de seis dígitos");
    expect(verified).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Código de seis dígitos"), {
      target: { value: "123456" },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: "Verificar código" }).closest("form")!,
    );
    await waitFor(() => expect(verified).toHaveBeenCalledTimes(1));
    expect(
      requests.some((url) => url.includes("/factors/factor-id/challenge")),
    ).toBe(true);
    expect(
      requests.some((url) => url.includes("/factors/factor-id/verify")),
    ).toBe(true);
    await client().auth.signOut({ scope: "local" });
  });
  it("descarta cache e rascunho ao trocar ator, inclusive uma resposta antiga que chega depois", async () => {
    let active = "actor-a",
      resolveOld!: (value: Response) => void;
    const user = () => ({
      id: active,
      aud: "authenticated",
      app_metadata: {},
      user_metadata: {},
      created_at: new Date().toISOString(),
    });
    const token = () =>
      [
        btoa('{"alg":"HS256"}'),
        btoa(
          JSON.stringify({
            sub: active,
            exp: Math.floor(Date.now() / 1000) + 3600,
          }),
        ),
        btoa("signature"),
      ]
        .map((part) => part.replace(/=/g, ""))
        .join(".");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).endsWith("/user")) return json(user());
        if (String(input).includes("app_actor_test"))
          return active === "actor-a"
            ? await new Promise<Response>((resolve) => {
                resolveOld = resolve;
              })
            : json({ secret: "Conteúdo da conta B" });
        return json({});
      }),
    );
    function Probe() {
      const { session } = useAuth(),
        query = useRpc<{ secret: string }>("app_actor_test", {}, !!session);
      return (
        <div>
          {session?.user.id}
          <p>{query.data?.secret}</p>
        </div>
      );
    }
    wrap(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await act(async () => {
      await client().auth.setSession({
        access_token: token(),
        refresh_token: "synthetic-refresh",
      });
    });
    await waitFor(() => expect(resolveOld).toBeTypeOf("function"));
    sessionStorage.setItem("icarus:draft:actor-a:post:new", "Texto da conta A");
    active = "actor-b";
    await act(async () => {
      await client().auth.setSession({
        access_token: token(),
        refresh_token: "synthetic-refresh",
      });
    });
    await screen.findByText("Conteúdo da conta B");
    expect(sessionStorage.getItem("icarus:draft:actor-a:post:new")).toBeNull();
    await act(async () =>
      resolveOld(json({ secret: "Conteúdo privado da conta A" })),
    );
    expect(
      screen.queryByText("Conteúdo privado da conta A"),
    ).not.toBeInTheDocument();
    await act(async () => {
      await client().auth.signOut({ scope: "local" });
    });
    expect(screen.queryByText("Conteúdo da conta B")).not.toBeInTheDocument();
  });
});
describe("Arquivo PDF real", () => {
  it("gera documento PDF com catálogo, página, imagem e offsets xref consistentes", async () => {
    const pdf = pdfWithImage(new Uint8Array([255, 216, 255, 217]), 1600, 1120);
    expect(pdf.type).toBe("application/pdf");
    const reader = new FileReader();
    const content = await new Promise<string>((resolve, reject) => {
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsText(pdf);
    });
    expect(content.startsWith("%PDF-1.4")).toBe(true);
    expect(content).toContain("/Type /Catalog");
    expect(content).toContain("/Subtype /Image");
    expect(content).toContain("%%EOF");
    const offsets = [...content.matchAll(/(\d{10}) 00000 n/g)].map((m) =>
      Number(m[1]),
    );
    expect(offsets).toHaveLength(5);
    for (const [index, offset] of offsets.entries())
      expect(content.slice(offset, offset + 7)).toBe(`${index + 1} 0 obj`);
  });
});
