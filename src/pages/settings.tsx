import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { cache, downloadBlob, client, date, edge, money, rpc } from "../api";
import { useAuth, useBootstrap } from "../auth";
import {
  Action,
  Field,
  Password,
  Form,
  Heading,
  Modal,
  Notice,
  value,
} from "../ui";
import { Upload } from "../upload";
import { PrivateImage } from "../media";
import { CompanyFields, companyData } from "./access";

export function Settings() {
  const boot = useBootstrap(),
    p = boot.data!.profile,
    [params, setParams] = useSearchParams(),
    tab = params.get("aba") ?? "perfil",
    [message, setMessage] = useState("");
  return (
    <>
      <Heading title="Sua conta">
        Seus dados, segurança e acesso à academia.
      </Heading>
      <nav className="tabs" aria-label="Configurações">
        {[
          ["perfil", "Perfil"],
          ["empresa", "Sua empresa"],
          ["seguranca", "Segurança"],
          ["assinatura", "Assinatura"],
          ["privacidade", "Privacidade"],
        ].map(([id, label]) => (
          <button
            key={id}
            aria-current={tab === id ? "page" : undefined}
            onClick={() => setParams({ aba: id })}
          >
            {label}
          </button>
        ))}
      </nav>
      {message && <Notice>{message}</Notice>}
      <div className="reading" data-tour="settings">
        {tab === "perfil" && (
          <>
            {p.avatar_id && (
              <PrivateImage
                kind="avatar"
                id={p.avatar_id}
                className="profile-photo"
                alt="Sua foto de perfil"
              />
            )}
            <Upload
              kind="avatar"
              resourceId={p.id}
              onUploaded={() =>
                void cache.invalidateQueries({ queryKey: ["bootstrap"] })
              }
            />
            <Form
              onSave={async (data) => {
                await rpc("app_profile", {
                  p_data: {
                    full_name: value(data, "full_name"),
                    phone: value(data, "phone"),
                    bio: value(data, "bio"),
                  },
                });
                await cache.invalidateQueries({ queryKey: ["bootstrap"] });
              }}
            >
              <Field label="Nome completo">
                <input
                  name="full_name"
                  required
                  defaultValue={p.full_name}
                  maxLength={160}
                />
              </Field>
              <Field label="Email">
                <input disabled value={p.email ?? ""} />
              </Field>
              <Field label="Telefone">
                <input
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  defaultValue={p.phone ?? ""}
                  maxLength={32}
                />
              </Field>
              <Field
                label="Bio"
                hint="Até 80 caracteres. Exibida junto ao seu nome na comunidade."
              >
                <textarea
                  name="bio"
                  maxLength={80}
                  defaultValue={p.bio ?? ""}
                />
              </Field>
            </Form>
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
                <select name="theme" defaultValue={p.theme}>
                  <option value="light">Claro</option>
                  <option value="dark">Escuro</option>
                </select>
              </Field>
            </Form>
          </>
        )}
        {tab === "empresa" && (
          <Form
            onSave={async (data) => {
              await rpc("app_profile", {
                p_data: { company: companyData(data) },
              });
              await cache.invalidateQueries({ queryKey: ["bootstrap"] });
            }}
          >
            <CompanyFields company={p.company} />
          </Form>
        )}
        {tab === "seguranca" && (
          <>
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
            <Mfa />
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
          </>
        )}
        {tab === "assinatura" && (
          <>
            <h2>{p.plan_name || "Sem plano ativo"}</h2>
            <p>Validade: {date(p.access_ends_at)}</p>
            <p>
              Pagamentos, confirmação de acesso e documentos fiscais dependem do
              provedor configurado.
            </p>
            <h2>Planos disponíveis</h2>
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
                  <Link className="button" to={"/checkout?plano=" + plan.id}>
                    Consultar assinatura
                  </Link>
                </article>
              ))}
            {!boot.data!.plans.some((plan) => plan.active) && (
              <Notice>
                Assinaturas indisponíveis no momento. Nenhum plano ativo foi
                publicado.
              </Notice>
            )}
          </>
        )}
        {tab === "privacidade" && (
          <>
            <h2>Seus dados</h2>
            <p>
              Exporte os dados vinculados à sua conta ou solicite a exclusão. A
              equipe avaliará retenções legais antes de concluir o pedido.
            </p>
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
            <Link to="/privacidade">Consultar a política de privacidade</Link>
          </>
        )}
      </div>
    </>
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
  onVerified,
}: {
  required?: boolean;
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
