import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Bell, Building2, Camera, CreditCard, LockKeyhole, Shield, UserRound } from "lucide-react";
import { cache, downloadBlob, client, date, edge, money, rpc } from "../api";
import type { Profile } from "../api";
import { useAuth, useBootstrap } from "../auth";
import {
  Action,
  Field,
  Password,
  Form,
  Heading,
  Modal,
  NavigationTabs,
  Notice,
  value,
} from "../ui";
import { Upload } from "../upload";
import { PrivateImage } from "../media";
import { CompanyFields, companyData, companyKeys } from "./access";
import type { OnboardingQuestion } from "./access";
import { NotificationPreferences } from "./notifications";
import "./account-settings.css";

const settingsTabs = [
  ["perfil", "Meu perfil", UserRound],
  ["empresa", "Sua empresa", Building2],
  ["notificacoes", "Notificações", Bell],
  ["assinatura", "Assinatura", CreditCard],
  ["seguranca", "Segurança", LockKeyhole],
  ["privacidade", "Privacidade", Shield],
] as const;

function AccountOverview({ profile }: { profile: Profile }) {
  return (
    <aside className="student-account-overview" aria-label="Resumo da conta">
      <section className="student-account-panel">
        <CreditCard size={20} aria-hidden="true" />
        <h2>{profile.plan_name || "Sem plano ativo"}</h2>
        {profile.access_ends_at && <p>Validade: {date(profile.access_ends_at)}</p>}
        <Link className="text-action" to="?aba=assinatura">
          Consultar assinatura
        </Link>
      </section>
      <section className="student-account-panel">
        <LockKeyhole size={20} aria-hidden="true" />
        <h2>Segurança e senha</h2>
        <p>Gerencie email, senha, autenticadores e sessões.</p>
        <Link className="text-action" to="?aba=seguranca">
          Abrir segurança
        </Link>
      </section>
      <section className="student-account-panel">
        <Shield size={20} aria-hidden="true" />
        <h2>Gestão de dados</h2>
        <p>Exporte seus dados ou solicite a exclusão da conta.</p>
        <Link className="text-action" to="?aba=privacidade">
          Abrir privacidade
        </Link>
      </section>
    </aside>
  );
}

type ProfileField = "full_name" | "phone" | "bio";

function ProfileForm({ profile }: { profile: Profile }) {
  const [edits, setEdits] = useState<Partial<Record<ProfileField, string>>>({});
  const fields = Object.keys(edits);
  const bio = edits.bio ?? profile.bio ?? "";

  function edit(field: ProfileField, text: string) {
    setEdits((current) => {
      const next = { ...current };
      if (text === (profile[field] ?? "")) delete next[field];
      else next[field] = text;
      return next;
    });
  }

  return (
    <Form
      className="student-account-profile-form"
      label="Salvar perfil"
      submitDisabled={fields.length === 0}
      onSave={async (data) => {
        await rpc("app_profile", {
          p_data: Object.fromEntries(fields.map((field) => [field, value(data, field)])),
        });
        await cache.invalidateQueries({ queryKey: ["bootstrap", profile.id] });
        setEdits({});
      }}
    >
      <Field label="Nome completo">
        <input
          name="full_name"
          autoComplete="name"
          required
          value={edits.full_name ?? profile.full_name}
          onChange={(event) => edit("full_name", event.currentTarget.value)}
          maxLength={160}
        />
      </Field>
      <Field label="Email">
        <input disabled value={profile.email ?? ""} />
      </Field>
      <Field label="Telefone">
        <input
          name="phone"
          type="tel"
          autoComplete="tel"
          value={edits.phone ?? profile.phone ?? ""}
          onChange={(event) => edit("phone", event.currentTarget.value)}
          maxLength={32}
        />
      </Field>
      <Field
        label="Bio"
        hint={`${bio.length}/80 caracteres. Exibida junto ao seu nome na comunidade.`}
      >
        <textarea
          name="bio"
          maxLength={80}
          value={bio}
          onChange={(event) => edit("bio", event.currentTarget.value)}
        />
      </Field>
    </Form>
  );
}

function CompanyOverview({
  company,
  questions,
}: {
  company: Profile["company"];
  questions: OnboardingQuestion[];
}) {
  const rows = questions
    .filter(
      ({ active, key }) =>
        active &&
        companyKeys.some((allowed) => allowed === key) &&
        typeof company[key] === "string" &&
        company[key],
    )
    .sort((a, b) => a.order_index - b.order_index);
  return (
    <section className="student-account-panel">
      <h2>Dados da sua empresa</h2>
      {typeof company.name === "string" &&
        !rows.some(({ key }) => key === "name") && <p>{company.name}</p>}
      {rows.length > 0 && (
        <dl className="student-account-company">
          {rows.map(({ id, key, label }) => (
            <div key={id}>
              <dt>{label}</dt>
              <dd>{String(company[key])}</dd>
            </div>
          ))}
        </dl>
      )}
      <Link className="text-action" to="?aba=empresa">
        Rever respostas do onboarding
      </Link>
    </section>
  );
}

export function Settings() {
  const boot = useBootstrap(),
    p = boot.data!.profile,
    [params] = useSearchParams(),
    tab =
      settingsTabs.find(([id]) => id === params.get("aba"))?.[0] ?? "perfil",
    [message, setMessage] = useState("");
  return (
    <div className="student-account">
      <Heading title="Configurações da conta">
        Gerencie seu perfil, suas preferências e seu acesso à área de membros.
      </Heading>
      <NavigationTabs
        label="Configurações"
        selected={tab}
        items={settingsTabs.map(([id, label, Icon]) => ({
          id,
          to: `?aba=${id}`,
          onClick: () => setMessage(""),
          label: (
            <>
              <Icon size={16} aria-hidden="true" />
              {label}
            </>
          ),
        }))}
      />
      {message && <Notice>{message}</Notice>}
      <div className="student-account-layout" data-tour="settings">
        <div className="student-account-main">
          {tab === "perfil" && (
            <>
              <section
                className="student-account-panel student-account-identity"
                aria-label="Perfil atual"
              >
                {p.avatar_id ? (
                  <PrivateImage
                    kind="avatar"
                    id={p.avatar_id}
                    className="profile-photo"
                    alt="Sua foto de perfil"
                  />
                ) : (
                  <span className="student-account-avatar" aria-hidden="true">
                    <UserRound size={28} />
                  </span>
                )}
                <div>
                  <h2>{p.full_name}</h2>
                  {p.email && <p>{p.email}</p>}
                  {p.plan_name && <p>{p.plan_name}</p>}
                </div>
                <details className="student-account-photo">
                  <summary className="button">
                    <Camera size={16} aria-hidden="true" /> Alterar foto
                  </summary>
                  <Upload
                    kind="avatar"
                    resourceId={p.id}
                    onUploaded={() =>
                      void cache.invalidateQueries({ queryKey: ["bootstrap"] })
                    }
                  />
                </details>
              </section>
              <section className="student-account-panel">
                <h2>Informações pessoais</h2>
                <ProfileForm key={p.id} profile={p} />
              </section>
              <section className="student-account-panel">
                <h2>Aparência</h2>
                <Form
                  label="Salvar aparência"
                  onSave={async (data) => {
                    await rpc("app_profile", {
                      p_data: { theme: value(data, "theme") },
                    });
                    await cache.invalidateQueries({ queryKey: ["bootstrap"] });
                  }}
                >
                  <Field label="Tema">
                    <select
                      key={p.theme}
                      name="theme"
                      defaultValue={p.theme ?? "light"}
                    >
                      <option value="light">Claro</option>
                      <option value="dark">Escuro</option>
                    </select>
                  </Field>
                </Form>
              </section>
              <CompanyOverview
                company={p.company ?? {}}
                questions={
                  (boot.data!.settings.onboarding_questions as
                    | OnboardingQuestion[]
                    | undefined) ?? []
                }
              />
              <section className="student-account-panel">
                <NotificationPreferences key={p.id} memberId={p.id} />
              </section>
            </>
          )}
          {tab === "empresa" && (
            <section className="student-account-panel">
              <h2>Dados da sua empresa</h2>
              <Form
                label="Salvar dados da empresa"
                onSave={async (data) => {
                  await rpc("app_profile", {
                    p_data: { company: companyData(data) },
                  });
                  await cache.invalidateQueries({ queryKey: ["bootstrap"] });
                }}
              >
                <CompanyFields company={p.company} />
              </Form>
            </section>
          )}
          {tab === "notificacoes" && (
            <section className="student-account-panel">
              <NotificationPreferences key={p.id} memberId={p.id} />
            </section>
          )}
          {tab === "seguranca" && (
            <section className="student-account-panel student-account-security">
              <h2>Altere seu email</h2>
              <Form
                label="Solicitar alteração de email"
                onSave={async (data) => {
                  const { error } = await client().auth.updateUser(
                    { email: value(data, "email") },
                    { emailRedirectTo: location.origin + "/auth/callback" },
                  );
                  if (error) throw error;
                  setMessage(
                    "Solicitação registrada. Confirme a alteração pelos links enviados aos endereços envolvidos.",
                  );
                }}
              >
                <Field label="Novo email">
                  <input
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                  />
                </Field>
              </Form>
              <h2>Altere sua senha</h2>
              <Form
                label="Atualizar senha"
                onSave={async (data, form) => {
                  try {
                    if (value(data, "password") !== value(data, "confirm"))
                      throw new Error("As senhas precisam ser iguais.");
                    const { error } = await client().auth.updateUser({
                      password: value(data, "password"),
                    });
                    if (error) throw error;
                    setMessage("Senha atualizada.");
                  } finally {
                    form.reset();
                  }
                }}
              >
                <Password
                  label="Nova senha"
                  name="password"
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={128}
                  required
                />
                <Password
                  label="Confirme a nova senha"
                  name="confirm"
                  autoComplete="new-password"
                  required
                  minLength={12}
                />
              </Form>
              <Mfa recommended={p.role === "admin"} />
              <h2>Sessões</h2>
              <Action
                run={async () => {
                  const { error } = await client().auth.signOut({
                    scope: "others",
                  });
                  if (error) throw error;
                  setMessage("Outras sessões foram encerradas.");
                }}
              >
                Encerrar outras sessões
              </Action>
            </section>
          )}
          {tab === "assinatura" && (
            <section className="student-account-panel">
              <h2>Plano atual</h2>
              <p>{p.plan_name || "Sem plano ativo"}</p>
              {p.access_ends_at && <p>Validade: {date(p.access_ends_at)}</p>}
              <p>
                Pagamentos, confirmação de acesso e documentos fiscais dependem
                do provedor configurado.
              </p>
              <h2 className="student-account-plans">Planos disponíveis</h2>
              {boot
                .data!.plans.filter((plan) => plan.active)
                .map((plan) => (
                  <article className="plan-row" key={plan.id}>
                    <h3>{plan.name}</h3>
                    <p>
                      {money(plan.price_cents)} · {plan.access_months} meses de
                      acesso
                    </p>
                    <ul>
                      {plan.benefits.map((b) => (
                        <li key={b}>{b}</li>
                      ))}
                    </ul>
                    {p.current_plan_id === plan.id ? <span className="badge">Seu plano atual</span> : (
                      <Link className="button primary" to={"/checkout?plano=" + encodeURIComponent(plan.slug)}>
                        Assinar
                      </Link>
                    )}
                  </article>
                ))}
              {!boot.data!.plans.some((plan) => plan.active) && (
                <Notice>
                  Assinaturas indisponíveis no momento. Nenhum plano ativo foi
                  publicado.
                </Notice>
              )}
            </section>
          )}
          {tab === "privacidade" && (
            <section className="student-account-panel">
              <h2>Seus dados</h2>
              <p>
                Exporte os dados vinculados à sua conta ou solicite a exclusão.
                A equipe avaliará retenções legais antes de concluir o pedido.
              </p>
              <div className="actions">
                <Action
                  run={async () => {
                    const data = await rpc("app_export_data");
                    downloadBlob(
                      new Blob([JSON.stringify(data, null, 2)], {
                        type: "application/json",
                      }),
                      "meus-dados-icarus.json",
                    );
                  }}
                >
                  Exportar meus dados
                </Action>
                <Modal
                  title="Solicitar exclusão da conta"
                  description="A solicitação será analisada pela equipe. Ela não apaga a conta imediatamente."
                  trigger={<button>Solicitar exclusão</button>}
                >
                  <Form
                    label="Enviar solicitação"
                    onSave={async (data) => {
                      if (value(data, "confirm") !== "EXCLUIR")
                        throw new Error("Digite EXCLUIR para confirmar.");
                      const result = await rpc<{ status: string }>(
                        "app_privacy_request",
                        { p_kind: "deletion" },
                      );
                      setMessage(
                        `Solicitação registrada: ${result.status === "pending" ? "aguardando análise" : result.status}.`,
                      );
                    }}
                  >
                    <Field label="Digite EXCLUIR para confirmar">
                      <input name="confirm" required autoComplete="off" />
                    </Field>
                  </Form>
                </Modal>
              </div>
              <p>
                <Link className="text-action" to="/privacidade">
                  Consultar a política de privacidade
                </Link>
              </p>
            </section>
          )}
        </div>
        {tab === "perfil" && <AccountOverview profile={p} />}
      </div>
    </div>
  );
}
type Factor = {
  id: string;
  friendly_name?: string;
  status: string;
  factor_type: string;
};
export function Mfa({
  required = false,
  recommended = false,
  onVerified,
}: {
  required?: boolean;
  recommended?: boolean;
  onVerified?: () => void;
}) {
  const [factors, setFactors] = useState<Factor[] | null>(null),
    [qr, setQr] = useState<{ id: string; qr: string; secret: string } | null>(
      null,
    ),
    [ready, setReady] = useState(false),
    [message, setMessage] = useState("");
  async function load() {
    const { data, error } = await client().auth.mfa.listFactors();
    if (error) throw error;
    setFactors(data.totp);
    const level = await client().auth.mfa.getAuthenticatorAssuranceLevel();
    if (level.error) throw level.error;
    setReady(level.data.currentLevel === "aal2");
  }
  return (
    <section className="mfa">
      <h2>Verificação em duas etapas</h2>
      <p>
        {required
          ? "Confirme sua identidade para continuar."
          : recommended
            ? "Recomendamos ativar a verificação em duas etapas para proteger sua conta administrativa. Você pode configurar um autenticador quando quiser."
            : "Use um aplicativo autenticador para proteger sua conta."}
      </p>
      {message && <Notice>{message}</Notice>}
      {ready && (
        <Notice>
          Verificação de dois fatores confirmada para esta sessão.
        </Notice>
      )}
      <Action run={load}>Consultar autenticadores</Action>
      {factors !== null && (
        <>
          {factors
            .filter((f) => f.status === "verified")
            .map((factor) => (
              <div key={factor.id}>
                <h3>{factor.friendly_name ?? "Aplicativo autenticador"}</h3>
                <Form
                  label="Verificar código"
                  onSave={async (data) => {
                    const { error } =
                      await client().auth.mfa.challengeAndVerify({
                        factorId: factor.id,
                        code: value(data, "code"),
                      });
                    if (error) throw error;
                    setReady(true);
                    await cache.invalidateQueries();
                    onVerified?.();
                  }}
                >
                  <Field label="Código de seis dígitos">
                    <input
                      name="code"
                      inputMode="numeric"
                      pattern="[0-9]{6}"
                      autoComplete="one-time-code"
                      required
                    />
                  </Field>
                </Form>
                {!required && (
                  <Action
                    confirm="Remover este autenticador da conta?"
                    run={async () => {
                      const { error } = await client().auth.mfa.unenroll({
                        factorId: factor.id,
                      });
                      if (error) throw error;
                      setMessage("Autenticador removido.");
                      await load();
                    }}
                  >
                    Remover autenticador
                  </Action>
                )}
              </div>
            ))}
          {!qr && (
            <Action
              run={async () => {
                const { data, error } = await client().auth.mfa.enroll({
                  factorType: "totp",
                  friendlyName: "Icarus",
                });
                if (error) throw error;
                setQr({
                  id: data.id,
                  qr: data.totp.qr_code,
                  secret: data.totp.secret,
                });
              }}
            >
              Configurar aplicativo autenticador
            </Action>
          )}
        </>
      )}
      {qr && (
        <div>
          <p>
            Leia o QR Code com seu aplicativo. A chave abaixo aparece somente
            durante esta configuração.
          </p>
          <img
            className="mfa-qr"
            src={qr.qr}
            alt="QR Code para configurar autenticador"
          />
          <p>
            Chave de configuração: <code>{qr.secret}</code>
          </p>
          <Form
            label="Ativar verificação"
            onSave={async (data) => {
              const { error } = await client().auth.mfa.challengeAndVerify({
                factorId: qr.id,
                code: value(data, "code"),
              });
              if (error) throw error;
              setQr(null);
              await load();
              await cache.invalidateQueries();
              onVerified?.();
            }}
          >
            <Field label="Código de seis dígitos">
              <input
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                required
              />
            </Field>
          </Form>
          <Action
            run={async () => {
              const { error } = await client().auth.mfa.unenroll({
                factorId: qr.id,
              });
              if (error) throw error;
              setQr(null);
              await load();
            }}
          >
            Cancelar configuração
          </Action>
        </div>
      )}
    </section>
  );
}
export function Reauth({
  children,
}: {
  children: (token: string) => Promise<unknown>;
}) {
  const { session } = useAuth();
  return (
    <Modal
      title="Confirme sua identidade"
      trigger={<button>Autorizar alteração crítica</button>}
      description="A senha é enviada somente para validação. Esta autorização vale para uma ação e não é salva no navegador."
    >
      <Form
        label="Confirmar e executar"
        onSave={async (data, form) => {
          try {
            if (!session) throw new Error("Entre novamente.");
            const result = await edge<{ token: string; expires_at: string }>(
              "reauthenticate",
              { password: value(data, "password") },
            );
            await children(result.token);
          } finally {
            form.reset();
          }
        }}
      >
        <Password
          label="Senha atual"
          name="password"
          autoComplete="current-password"
          required
        />
      </Form>
    </Modal>
  );
}
