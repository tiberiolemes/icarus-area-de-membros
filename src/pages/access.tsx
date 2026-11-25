import { useEffect, useId, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Briefcase, Check, ClipboardList, ListChecks, TrendingUp, Users } from "lucide-react";
import "./onboarding.css";
import {
  cache,
  client,
  demoAccounts,
  signOut,
  edge,
  internalPath,
  isRecoveryLink,
  rpc,
  useRpc,
} from "../api";
import type { Profile } from "../api";
import { useAuth, useBootstrap } from "../auth";
import { Captcha, captchaToken, resetCaptcha } from "../captcha";
import {
  Action,
  Field,
  Password,
  Form,
  Heading,
  Loading,
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
  const context = useRpc<PublicContext>("app_public_context");
  const name = context.data?.name || "Icarus";
  return (
    <div className="public-layout">
      <header className="public-top">
        <Link to="/entrar" aria-label={`${name}, início`} className={name === "Icarus" ? undefined : "public-installation-name"}>
          {name === "Icarus" ? (
            <img src={import.meta.env.BASE_URL + "brand/icarus-horizontal-preto.svg"} alt="Icarus" width="244" height="64" />
          ) : <strong className="installation-name" title={name}>{name}</strong>}
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
          Conclua o convite para acessar a área de membros.
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
function Login({ target }: { target: string }) {
  const { session, loading } = useAuth(), navigate = useNavigate();
  const destination = import.meta.env.MODE === "demo" && target === "/app/cursos" &&
    demoAccounts?.some((account) => account.role === "admin" && account.email === session?.user.email)
      ? "/admin/dashboard" : target;
  const [factors, setFactors] = useState<
    { id: string; friendly_name?: string }[]
  >([]);
  const [checking, setChecking] = useState(false),
    [failure, setFailure] = useState(""),
    [needsConfirmation, setNeedsConfirmation] = useState(false);
  const codeInput = useRef<HTMLInputElement>(null),
    remembering = useRef(false);
  useEffect(() => {
    let active = true;
    setFactors([]);
    setFailure("");
    if (!session) {
      setChecking(false);
      return;
    }
    setChecking(true);
    async function check() {
      try {
        const { data, error } = await client().auth.mfa
          .getAuthenticatorAssuranceLevel();
        if (error) throw error;
        if (!active) return;
        if (
          data.currentLevel === "aal2" ||
          (data.currentLevel === "aal1" && data.nextLevel === "aal1")
        ) {
          // Com a caixa marcada, quem navega é o envio, depois de tentar lembrar, para levar o aviso de falha.
          if (!remembering.current) navigate(destination, { replace: true });
          return;
        }
        const result = await client().auth.mfa.listFactors();
        if (result.error) throw result.error;
        if (!active) return;
        const verified = result.data.totp.filter((factor) =>
          factor.status === "verified"
        );
        if (!verified.length) {
          throw new Error(
            "Não foi possível consultar seu autenticador. Tente novamente.",
          );
        }
        setFactors(verified);
      } catch (error) {
        if (active) {
          setFailure(
            error instanceof Error
              ? error.message
              : "Não foi possível verificar seu acesso.",
          );
        }
      } finally {
        if (active) setChecking(false);
      }
    }
    void check();
    return () => {
      active = false;
    };
  }, [session?.access_token, destination, navigate]);
  useEffect(() => {
    if (factors.length) codeInput.current?.focus();
  }, [factors]);
  return (
    <PublicFrame>
      <div className="access" data-tour="login">
        <Heading title="Entre na sua área de membros" />
        {import.meta.env.MODE === "demo" && demoAccounts && <Notice>
          <p>Demonstração com dados fictícios. Escolha um perfil ou use as credenciais abaixo.</p>
          <div className="actions">
            {demoAccounts.map(({ email, password, label, role }) => <Action key={role} run={async () => {
              const { error } = await client().auth.signInWithPassword({ email, password });
              if (error) throw error;
            }}>Entrar como {label.toLocaleLowerCase("pt-BR")}</Action>)}
          </div>
          <dl>{demoAccounts.map(({ email, password, label }) =>
            <div key={email}><dt>{label}</dt><dd>{email} · <code>{password}</code></dd></div>
          )}</dl>
        </Notice>}
        {failure && <Notice error>{failure}</Notice>}
        <Form
          label={factors.length ? "Verificar e entrar" : "Entrar"}
          successMessage=""
          disabled={loading || checking || (!!session && !factors.length)}
          onSave={async (data, form) => {
            try {
              if (factors.length) {
                const factorId = factors.length === 1
                  ? factors[0].id
                  : value(data, "factor");
                const remember = data.get("remember") === "on";
                let notRemembered = false;
                remembering.current = remember;
                try {
                  const { error } = await client().auth.mfa.challengeAndVerify({
                    factorId,
                    code: value(data, "code"),
                  });
                  if (error) throw error;
                } catch (error) {
                  remembering.current = false;
                  throw error;
                }
                // O código já passou: se lembrar falhar, a pessoa entra com a sessão comum e recebe o aviso.
                if (remember) notRemembered = await rpc("app_remember_session").then(() => false, () => true);
                navigate(destination, { replace: true, state: notRemembered ? { notRemembered } : undefined });
              } else {
                setNeedsConfirmation(false);
                const { error } = await client().auth.signInWithPassword({
                  email: value(data, "email"),
                  password: String(data.get("password") ?? ""),
                  options: { captchaToken: captchaToken(data) },
                });
                if (error?.code === "email_not_confirmed") {
                  setNeedsConfirmation(true);
                  throw new Error("Confirme seu email antes de entrar. Você pode solicitar um novo link abaixo.");
                }
                if (error) throw error;
              }
            } finally {
              resetCaptcha();
              form.querySelectorAll<HTMLInputElement>(
                "input[data-sensitive=password], input[name=code]",
              ).forEach((input) => {
                input.value = "";
              });
            }
          }}
        >
          <>
            {checking && <Loading />}
            {factors.length
              ? (
                <>
                  <p role="status">
                    Informe o código do seu aplicativo autenticador para
                    concluir o acesso.
                  </p>
                  {factors.length > 1 && (
                    <Field label="Autenticador">
                      <select name="factor">
                        {factors.map((factor) => (
                          <option key={factor.id} value={factor.id}>
                            {factor.friendly_name || "Aplicativo autenticador"}
                          </option>
                        ))}
                      </select>
                    </Field>
                  )}
                  <Field label="Código de seis dígitos">
                    <input
                      ref={codeInput}
                      name="code"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="[0-9]{6}"
                      minLength={6}
                      maxLength={6}
                      required
                    />
                  </Field>
                  <label className="check">
                    <input type="checkbox" name="remember" />
                    Lembrar por 15 dias
                  </label>
                </>
              )
              : (
                <>
                  <Field label="Email">
                    <input
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      maxLength={254}
                      onChange={() => setNeedsConfirmation(false)}
                    />
                  </Field>
                  <div className="login-password">
                    <Password
                      label="Senha"
                      name="password"
                      autoComplete="current-password"
                      required
                      maxLength={128}
                    />
                    {!session && (
                      <div className="login-recovery">
                        <Link className="text-action" to={"/recuperar?returnTo=" + encodeURIComponent(target)}>
                          Esqueci minha senha
                        </Link>
                      </div>
                    )}
                  </div>
                  <Captcha />
                </>
              )}
          </>
        </Form>
        {session
          ? (
            <Action
              run={async () => {
                await signOut();
              }}
            >
              Voltar para email e senha
            </Action>
          )
          : (
            <>
              {needsConfirmation && (
                <p className="login-confirmation">
                  <Link className="text-action" to={"/confirmar-email?returnTo=" + encodeURIComponent(target)}>
                    Reenviar confirmação de email
                  </Link>
                </p>
              )}
              <p className="login-signup">
                Ainda não tem conta?{" "}
                <Link className="text-action" to={"/cadastro?returnTo=" + encodeURIComponent(target)}>
                  Criar conta
                </Link>
              </p>
            </>
          )}
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
    [message, setMessage] = useState("");
  const target = internalPath(params.get("returnTo")),
    context = useRpc<PublicContext>("app_public_context");
  if (mode === "login") return <Login target={target} />;
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
                    captchaToken: captchaToken(data),
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
                  captchaToken: captchaToken(data),
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
                    captchaToken: captchaToken(data),
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
              if (mode !== "reset") resetCaptcha();
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
          {["register", "reset"].includes(mode) && (
            <Password
              label="Senha"
              hint={
                "Use pelo menos 12 caracteres, com letras e números. A política do servidor também será verificada."
              }
              name="password"
              autoComplete={
                "new-password"
              }
              required
              minLength={12}
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
          {mode !== "reset" && <Captcha />}
        </Form>
        <nav className="access-links">
          <Link to={"/entrar?returnTo=" + encodeURIComponent(target)}>Voltar para entrar</Link>
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
      <div className="access">
        <Heading title="Confirmando seu acesso" />
        {error ? (
          <Notice error>
            <p>{error}</p>
            <Link className="button" to="/recuperar">Solicitar novo link</Link>
          </Notice>
        ) : (
          <p role="status">Aguarde a confirmação da sua sessão…</p>
        )}
      </div>
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

function OnboardingChoices({
  question,
  current,
  required,
}: {
  question: OnboardingQuestion;
  current: string;
  required: boolean;
}) {
  const id = useId();
  const [invalid, setInvalid] = useState(false);
  const options = [...new Set(question.options)];
  const Icon = { role: Briefcase, size: Users, stage: TrendingUp }[
    question.key
  ];
  const selected = options.includes(current) ? current : "";
  return (
    <fieldset
      className="student-onboarding-choice"
      data-question={question.key}
      aria-describedby={required ? id + "-hint" : undefined}
      onInvalid={() => setInvalid(true)}
      onChange={() => setInvalid(false)}
    >
      <legend>{question.label}</legend>
      {required && (
        <small
          id={id + "-hint"}
          className={invalid ? "field-error" : undefined}
        >
          {invalid
            ? "Selecione uma opção para continuar."
            : "Resposta obrigatória"}
        </small>
      )}
      <div className="student-onboarding-options">
        {(required ? options : [...options, ""]).map((option) => (
          <label key={option}>
            <input
              type="radio"
              name={"company_" + question.key}
              value={option}
              defaultChecked={selected === option}
              required={required}
            />
            <span>
              {Icon && <Icon size={16} aria-hidden="true" />}
              {option || "Sem resposta"}
              <Check
                className="student-onboarding-check"
                size={14}
                aria-hidden="true"
              />
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function CompanyFields({
  company = {},
  choiceCards = false,
}: {
  company?: Record<string, unknown>;
  choiceCards?: boolean;
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
        .map((question) =>
          choiceCards &&
          question.type === "select" &&
          question.options.length > 0 &&
          question.options.length <= 8 ? (
            <OnboardingChoices
              key={question.id}
              question={question}
              current={String(company[question.key] ?? "")}
              required={
                question.required ||
                (question.key === "name" && companyRequired)
              }
            />
          ) : (
            <Field
              key={question.id}
              label={
                question.label +
                (question.required ||
                (question.key === "name" && companyRequired)
                  ? " *"
                  : "")
              }
              hint={
                question.required ||
                (question.key === "name" && companyRequired)
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
          ),
        )}
      {!companyRequired && !questions.some((q) => q.active) && (
        <Notice>Não há perguntas sobre a empresa.</Notice>
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
    <div
      className="student-onboarding"
      data-theme={boot.data?.profile.theme ?? "light"}
    >
      <PublicFrame>
        <div className="student-onboarding-content">
          <div className="student-onboarding-progress">
            <div>
              <ClipboardList size={20} aria-hidden="true" />
              <strong>Configuração inicial</strong>
              <span>Etapa 2 de 2 · Perfil</span>
            </div>
            <progress
              aria-label="Etapas concluídas"
              max={2}
              value={boot.data?.profile.onboarding_complete ? 2 : 1}
            />
          </div>
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
                <div className="student-onboarding-questions">
                  <Heading title="Complete seu perfil">
                    Preencha os campos abaixo para acessar sua área de membros.
                  </Heading>
                  <Field label="Nome completo" hint="Resposta obrigatória">
                    <input
                      name="full_name"
                      autoComplete="name"
                      required
                      defaultValue={boot.data.profile.full_name}
                      maxLength={160}
                    />
                  </Field>
                  <CompanyFields
                    company={boot.data.profile.company}
                    choiceCards
                  />
                </div>
                <aside className="student-onboarding-guide">
                  <ListChecks size={22} aria-hidden="true" />
                  <h2>Antes de continuar</h2>
                  <p>
                    Preencha os campos obrigatórios e selecione a opção que
                    melhor descreve sua empresa.
                  </p>
                  <p>
                    Você pode atualizar as respostas em Configurações, na aba
                    Sua empresa.
                  </p>
                </aside>
              </Form>
            )}
          </QueryState>
        </div>
      </PublicFrame>
    </div>
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
              A equipe responsável ainda precisa publicar este documento. O cadastro
              e o pagamento só ficam disponíveis após a publicação dos documentos legais.
            </Notice>
          )}
        </QueryState>
      </div>
    </PublicFrame>
  );
}
