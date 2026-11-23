import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import {
  cache,
  client,
  signOut,
  edge,
  internalPath,
  isRecoveryLink,
  rpc,
  useRpc,
} from "../api";
import type { Profile } from "../api";
import { useAuth, useBootstrap } from "../auth";
import {
  Action,
  Field,
  Password,
  Form,
  Heading,
  Notice,
  QueryState,
  value,
} from "../ui";

type PublicContext = {
  name: string;
  registration_enabled: boolean;
  legal_ready: boolean;
  legal_versions: {
    id: string;
    kind: string;
    title?: string;
    body?: string;
    version?: string;
  }[];
  plans: unknown[];
};
export function PublicFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="public-layout">
      <header className="public-top">
        <Link to="/entrar" aria-label="Icarus, início">
          <img
            src="/brand/icarus-horizontal-preto.svg"
            alt="Icarus"
            width="244"
            height="64"
          />
        </Link>
        <Link to="/ajuda">Central de ajuda</Link>
      </header>
      <main id="main" className="public-main">
        {children}
      </main>
      <footer>
        <Link to="/termos">Termos de uso</Link>
        <Link to="/privacidade">Privacidade</Link>
      </footer>
    </div>
  );
}
export function PasswordSetup() {
  return (
    <PublicFrame>
      <div className="access">
        <Heading title="Defina sua primeira senha">
          Confirme uma senha para concluir seu convite e acessar a academia.
        </Heading>
        <Form
          label="Definir senha e continuar"
          onSave={async (data, form) => {
            try {
              const password = value(data, "password");
              if (password !== value(data, "confirm"))
                throw new Error("As senhas precisam ser iguais.");
              await edge("password-setup", { password });
              await cache.invalidateQueries({ queryKey: ["bootstrap"] });
            } finally {
              form.reset();
            }
          }}
        >
          <Password
            label="Nova senha"
            hint="Use pelo menos 12 caracteres, com letras e números."
            name="password"
            autoComplete="new-password"
            required
            minLength={12}
            maxLength={128}
          />
          <Password
            label="Confirme sua nova senha"
            name="confirm"
            autoComplete="new-password"
            required
            minLength={12}
          />
        </Form>
        <Action
          run={async () => {
            await signOut();
          }}
        >
          Sair e usar outra conta
        </Action>
      </div>
    </PublicFrame>
  );
}
export function Access({
  mode,
}: {
  mode: "login" | "register" | "forgot" | "reset" | "confirm";
}) {
  const [params] = useSearchParams(),
    navigate = useNavigate(),
    { session, loading } = useAuth(),
    [message, setMessage] = useState("");
  const target = internalPath(params.get("returnTo")),
    context = useRpc<PublicContext>("app_public_context");
  if (session && !loading && mode === "login")
    return <Navigate to={target} replace />;
  const titles = {
    login: "Entre na sua área de membros",
    register: "Crie sua conta",
    forgot: "Recupere seu acesso",
    reset: "Defina uma nova senha",
    confirm: "Confirme seu email",
  };
  return (
    <PublicFrame>
      <div className="access">
        <Heading title={titles[mode]} />
        {message && <Notice>{message}</Notice>}
        {mode === "register" && (
          <QueryState query={context}>
            {!context.data?.registration_enabled && (
              <Notice>O cadastro está indisponível nesta instalação.</Notice>
            )}
            {!context.data?.legal_ready && (
              <Notice>
                Os documentos legais ainda não foram publicados. O cadastro será
                liberado após essa configuração.
              </Notice>
            )}
          </QueryState>
        )}
        <Form
          label={
            {
              login: "Entrar",
              register: "Criar conta",
              forgot: "Solicitar recuperação",
              reset: "Salvar nova senha",
              confirm: "Reenviar confirmação",
            }[mode]
          }
          onSave={async (data, form) => {
            const email = value(data, "email"),
              password = value(data, "password");
            const auth = client().auth;
            try {
              if (mode === "login") {
                const { error } = await auth.signInWithPassword({
                  email,
                  password,
                });
                if (error) throw error;
                cache.clear();
                navigate(target, { replace: true });
              }
              if (mode === "register") {
                if (
                  !context.data?.registration_enabled ||
                  !context.data?.legal_ready
                )
                  throw new Error(
                    "Cadastro indisponível até a publicação dos documentos legais.",
                  );
                const { error } = await auth.signUp({
                  email,
                  password,
                  options: {
                    data: {
                      full_name: value(data, "full_name"),
                      phone: value(data, "phone"),
                      legal_version_ids: context.data.legal_versions.map(
                        (v) => v.id,
                      ),
                      marketing_opt_in: data.has("marketing"),
                    },
                    emailRedirectTo:
                      location.origin +
                      "/auth/callback?returnTo=" +
                      encodeURIComponent(target),
                  },
                });
                if (error) throw error;
                setMessage(
                  "Se o cadastro puder ser realizado, você receberá as instruções no email informado. Confira também a pasta de spam.",
                );
              }
              if (mode === "forgot") {
                const { error } = await auth.resetPasswordForEmail(email, {
                  redirectTo:
                    location.origin +
                    "/auth/callback?returnTo=/app/configuracoes?aba=seguranca",
                });
                if (error) throw error;
                setMessage(
                  "Se houver uma conta para esse email, você receberá as instruções de recuperação.",
                );
              }
              if (mode === "reset") {
                if (password !== value(data, "password_confirm"))
                  throw new Error("As senhas precisam ser iguais.");
                const { error } = await auth.updateUser({ password });
                if (error) throw error;
                setMessage("Senha atualizada.");
                navigate(target, { replace: true });
              }
              if (mode === "confirm") {
                const { error } = await auth.resend({
                  type: "signup",
                  email,
                  options: {
                    emailRedirectTo:
                      location.origin +
                      "/auth/callback?returnTo=" +
                      encodeURIComponent(target),
                  },
                });
                if (error) throw error;
                setMessage(
                  "Se houver uma confirmação pendente, as instruções serão enviadas ao email informado.",
                );
              }
            } finally {
              form
                .querySelectorAll<HTMLInputElement>(
                  "input[data-sensitive=password]",
                )
                .forEach((input) => (input.value = ""));
            }
          }}
        >
          {mode === "register" && (
            <>
              <Field label="Nome completo">
                <input
                  name="full_name"
                  autoComplete="name"
                  required
                  maxLength={160}
                />
              </Field>
              <Field label="Telefone">
                <input
                  name="phone"
                  autoComplete="tel"
                  type="tel"
                  maxLength={32}
                />
              </Field>
            </>
          )}
          {mode !== "reset" && (
            <Field label="Email">
              <input
                name="email"
                type="email"
                autoComplete="email"
                required
                maxLength={254}
              />
            </Field>
          )}
          {["login", "register", "reset"].includes(mode) && (
            <Password
              label="Senha"
              hint={
                mode === "login"
                  ? undefined
                  : "Use pelo menos 12 caracteres, com letras e números. A política do servidor também será verificada."
              }
              name="password"
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
              required
              minLength={mode === "login" ? 1 : 12}
              maxLength={128}
            />
          )}
          {mode === "reset" && (
            <Password
              label="Confirme a nova senha"
              name="password_confirm"
              autoComplete="new-password"
              required
              minLength={12}
            />
          )}
          {mode === "register" && (
            <>
              <label className="check">
                <input
                  type="checkbox"
                  name="legal"
                  required
                  disabled={!context.data?.legal_ready}
                />
                Li e aceito os <Link to="/termos">Termos de uso</Link> e a{" "}
                <Link to="/privacidade">Política de privacidade</Link>.
              </label>
              <label className="check">
                <input type="checkbox" name="marketing" />
                Quero receber comunicações de marketing (opcional).
              </label>
            </>
          )}
        </Form>
        <nav className="access-links">
          {mode === "login" ? (
            <>
              <Link to={"/recuperar?returnTo=" + encodeURIComponent(target)}>
                Esqueci minha senha
              </Link>
              <Link to={"/cadastro?returnTo=" + encodeURIComponent(target)}>
                Criar uma conta
              </Link>
              <Link to="/confirmar-email">Confirmar email</Link>
            </>
          ) : (
            <Link to={"/entrar?returnTo=" + encodeURIComponent(target)}>
              Voltar para entrar
            </Link>
          )}
        </nav>
      </div>
    </PublicFrame>
  );
}
export function Callback() {
  const navigate = useNavigate(),
    [params] = useSearchParams(),
    [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    async function complete() {
      try {
        const error = params.get("error_description");
        if (error)
          throw new Error(
            "O link de autenticação expirou ou é inválido. Solicite um novo link.",
          );
        const code = params.get("code");
        if (code) {
          const { error } = await client().auth.exchangeCodeForSession(code);
          if (error) throw error;
        }
        const { data, error: sessionError } = await client().auth.getSession();
        if (sessionError) throw sessionError;
        if (!data.session)
          throw new Error(
            "Não foi possível confirmar a sessão. Solicite um novo link.",
          );
        if (alive)
          navigate(
            isRecoveryLink || params.get("type") === "recovery"
              ? "/redefinir-senha"
              : internalPath(params.get("returnTo")),
            { replace: true },
          );
      } catch {
        if (alive)
          setError(
            "O link está inválido ou expirou. Solicite novamente a confirmação ou a recuperação.",
          );
      }
    }
    void complete();
    return () => {
      alive = false;
    };
  }, []);
  return (
    <PublicFrame>
      <Heading title="Confirmando seu acesso" />
      {error ? (
        <Notice error>
          {error} <Link to="/recuperar">Solicitar novo link</Link>
        </Notice>
      ) : (
        <p role="status">Aguarde a confirmação da sua sessão…</p>
      )}
    </PublicFrame>
  );
}
export type OnboardingQuestion = {
  id: string;
  key: string;
  label: string;
  type: "text" | "select" | "textarea";
  options: string[];
  required: boolean;
  active: boolean;
  order_index: number;
};
export const companyKeys = [
  "name",
  "segment",
  "role",
  "size",
  "stage",
  "revenue_range",
  "acquisition",
  "product_description",
] as const;
export function CompanyFields({
  company = {},
}: {
  company?: Record<string, unknown>;
}) {
  const boot = useBootstrap(),
    questions =
      (boot.data?.settings.onboarding_questions as
        | OnboardingQuestion[]
        | undefined) ?? [],
    onboarding = boot.data?.settings.onboarding as
      | { company_required?: boolean; company_label?: string }
      | undefined,
    companyRequired = onboarding?.company_required === true,
    hasName = questions.some(
      (question) => question.active && question.key === "name",
    );
  return (
    <>
      {companyRequired && !hasName && (
        <Field
          label={onboarding?.company_label || "Nome da empresa"}
          hint="Resposta obrigatória"
        >
          <input
            name="company_name"
            required
            defaultValue={String(company.name ?? "")}
            maxLength={500}
          />
        </Field>
      )}
      {questions
        .filter(
          (q) =>
            q.active &&
            companyKeys.includes(q.key as (typeof companyKeys)[number]),
        )
        .sort((a, b) => a.order_index - b.order_index)
        .map((question) => (
          <Field
            key={question.id}
            label={
              question.label +
              (question.required || (question.key === "name" && companyRequired)
                ? " *"
                : "")
            }
            hint={
              question.required || (question.key === "name" && companyRequired)
                ? "Resposta obrigatória"
                : undefined
            }
          >
            {question.type === "select" ? (
              <select
                name={"company_" + question.key}
                required={
                  question.required ||
                  (question.key === "name" && companyRequired)
                }
                defaultValue={String(company[question.key] ?? "")}
              >
                <option value="">Selecione</option>
                {question.options.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            ) : question.type === "textarea" ? (
              <textarea
                name={"company_" + question.key}
                required={
                  question.required ||
                  (question.key === "name" && companyRequired)
                }
                maxLength={1000}
                defaultValue={String(company[question.key] ?? "")}
              />
            ) : (
              <input
                name={"company_" + question.key}
                required={
                  question.required ||
                  (question.key === "name" && companyRequired)
                }
                maxLength={500}
                defaultValue={String(company[question.key] ?? "")}
              />
            )}
          </Field>
        ))}
      {!companyRequired && !questions.some((q) => q.active) && (
        <Notice>Nenhuma pergunta de empresa configurada pela academia.</Notice>
      )}
    </>
  );
}
export const companyData = (data: FormData) =>
  Object.fromEntries(
    companyKeys
      .filter((key) => data.has("company_" + key))
      .map((key) => [key, value(data, "company_" + key)]),
  );
export function Onboarding() {
  const boot = useBootstrap(),
    navigate = useNavigate(),
    [params] = useSearchParams();
  return (
    <PublicFrame>
      <div className="reading">
        <Heading title="Vamos conhecer você">
          Complete seu perfil para começar. Você pode atualizar os dados depois.
        </Heading>
        <QueryState query={boot}>
          {boot.data && (
            <Form
              label="Concluir e continuar"
              onSave={async (data) => {
                await rpc<Profile>("app_profile", {
                  p_data: {
                    full_name: value(data, "full_name"),
                    company: companyData(data),
                    onboarding_complete: true,
                  },
                });
                await cache.invalidateQueries({ queryKey: ["bootstrap"] });
                navigate(internalPath(params.get("returnTo")), {
                  replace: true,
                });
              }}
            >
              <Field label="Nome completo">
                <input
                  name="full_name"
                  required
                  defaultValue={boot.data.profile.full_name}
                  maxLength={160}
                />
              </Field>
              <CompanyFields company={boot.data.profile.company} />
            </Form>
          )}
        </QueryState>
      </div>
    </PublicFrame>
  );
}
export function Legal({ kind }: { kind: "terms" | "privacy" }) {
  const context = useRpc<PublicContext>("app_public_context"),
    docs =
      context.data?.legal_versions.filter(
        (doc) =>
          doc.kind === kind ||
          doc.kind === (kind === "terms" ? "termos" : "privacidade"),
      ) ?? [];
  return (
    <PublicFrame>
      <div className="reading">
        <Heading
          title={kind === "terms" ? "Termos de uso" : "Política de privacidade"}
        />
        <QueryState query={context}>
          {docs.length ? (
            docs.map((doc) => (
              <article key={doc.id}>
                <h2>{doc.title ?? `Versão ${doc.version ?? ""}`}</h2>
                <div className="prose">{doc.body}</div>
              </article>
            ))
          ) : (
            <Notice>
              Este documento ainda não foi publicado pela academia. Cadastro e
              checkout dependem da publicação dos documentos legais.
            </Notice>
          )}
        </QueryState>
      </div>
    </PublicFrame>
  );
}
