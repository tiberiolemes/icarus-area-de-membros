import { useRef, useState } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { edge, money, safeUrl, useRpc } from "../api";
import type { Plan } from "../api";
import { useAuth } from "../auth";
import { Field, Form, Heading, Notice, QueryState, value } from "../ui";
import { PublicFrame } from "./access";
import { statusName } from "./community";

type Capabilities = {
  asaas: boolean;
  bunny: boolean;
  storage: boolean;
  email: string;
  mode: string;
};
const receipts = new Map<string, string>();
export function Checkout() {
  const [params] = useSearchParams(),
    { session } = useAuth(),
    context = useRpc<{
      plans: Plan[];
      legal_ready: boolean;
      legal_versions: { id: string; kind: string }[];
    }>("app_public_context"),
    capabilities = useQuery({
      queryKey: ["capabilities"],
      queryFn: () => edge<Capabilities>("capabilities"),
    }),
    navigate = useNavigate(),
    attempt = useRef(crypto.randomUUID()),
    [method, setMethod] = useState("PIX"),
    plan = context.data?.plans.find(
      (p) => p.id === params.get("plano") || p.slug === params.get("plano"),
    );
  return (
    <PublicFrame>
      <Heading title="Sua assinatura" />
      <QueryState query={context}>
        <QueryState query={capabilities}>
          {plan ? (
            <div className="checkout-layout">
              <section>
                <h2>{plan.name}</h2>
                <p className="price">{money(plan.price_cents)}</p>
                <p>{plan.access_months} meses de acesso</p>
                <ul>
                  {plan.benefits.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </section>
              <section>
                {!capabilities.data?.asaas ? (
                  <Notice>
                    O pagamento está indisponível porque o provedor ainda não
                    foi configurado. Nenhuma cobrança será realizada.
                  </Notice>
                ) : !context.data?.legal_ready ? (
                  <Notice>
                    O checkout depende da publicação dos documentos legais da
                    academia.
                  </Notice>
                ) : (
                  <Form
                    label={
                      method === "PIX"
                        ? `Continuar com Pix · ${money(plan.price_cents)}`
                        : "Continuar para pagamento seguro"
                    }
                    onSave={async (data, form) => {
                      try {
                        const result = await edge<{
                          order_id: string;
                          status: string;
                          url?: string;
                          receipt_token?: string;
                        }>("checkout", {
                          plan_id: plan.id,
                          method,
                          installments:
                            method === "PIX"
                              ? 1
                              : Number(value(data, "installments") || 1),
                          attempt_key: attempt.current,
                          buyer: {
                            name: value(data, "name"),
                            email: session?.user.email ?? value(data, "email"),
                            document: value(data, "document"),
                            phone: value(data, "phone"),
                          },
                          legal_version_ids: context.data!.legal_versions.map(
                            (v) => v.id,
                          ),
                          marketing_opt_in: data.has("marketing"),
                        });
                        if (result.receipt_token)
                          receipts.set(result.order_id, result.receipt_token);
                        const url = safeUrl(result.url);
                        if (url) {
                          const host = new URL(url).hostname;
                          if (!/(^|\.)asaas\.com$/.test(host))
                            throw new Error(
                              "O servidor retornou um destino de pagamento não reconhecido.",
                            );
                          window.location.assign(url);
                        } else navigate("/pedido/" + result.order_id);
                      } finally {
                        form.querySelector<HTMLInputElement>(
                          "[name=document]",
                        )!.value = "";
                      }
                    }}
                  >
                    <Field label="Nome completo">
                      <input name="name" autoComplete="name" required />
                    </Field>
                    <Field label="Email">
                      <input
                        name="email"
                        type="email"
                        autoComplete="email"
                        required
                        readOnly={!!session}
                        defaultValue={session?.user.email ?? ""}
                      />
                    </Field>
                    <Field
                      label="CPF ou CNPJ"
                      hint="Usado pelo provedor de pagamento. Não será salvo como rascunho neste navegador."
                    >
                      <input
                        name="document"
                        inputMode="numeric"
                        required
                        minLength={11}
                        maxLength={18}
                        autoComplete="off"
                      />
                    </Field>
                    <Field label="Celular (opcional)">
                      <input name="phone" type="tel" autoComplete="tel" />
                    </Field>
                    <Field label="Forma de pagamento">
                      <select
                        name="method"
                        value={method}
                        onChange={(e) => setMethod(e.target.value)}
                      >
                        <option value="PIX">Pix</option>
                        <option value="CREDIT_CARD">
                          Cartão no ambiente seguro do provedor
                        </option>
                      </select>
                    </Field>
                    {method === "CREDIT_CARD" && (
                      <Field
                        label="Parcelas"
                        hint="Os valores e as condições finais aparecem no ambiente seguro do provedor, conforme as opções disponíveis até 12x."
                      >
                        <select name="installments">
                          <option value="1">À vista</option>
                          {Array.from(
                            { length: 11 },
                            (_, index) => index + 2,
                          ).map((count) => (
                            <option key={count} value={count}>
                              {count}x no provedor
                            </option>
                          ))}
                        </select>
                      </Field>
                    )}
                    <label className="check">
                      <input name="legal" type="checkbox" required />
                      Aceito os <Link to="/termos">Termos de uso</Link> e a{" "}
                      <Link to="/privacidade">Política de privacidade</Link>.
                    </label>
                    <label className="check">
                      <input name="marketing" type="checkbox" />
                      Aceito comunicações de marketing (opcional).
                    </label>
                    <p>
                      O acesso será liberado após a confirmação do pagamento
                      pelo servidor. Para uma compra nova, as instruções de
                      acesso chegam ao email informado.
                    </p>
                  </Form>
                )}
              </section>
            </div>
          ) : (
            <Notice>
              Nenhum plano ativo foi encontrado para este link.{" "}
              <Link to="/entrar">Voltar ao início</Link>
            </Notice>
          )}
        </QueryState>
      </QueryState>
    </PublicFrame>
  );
}
export function OrderStatus() {
  const { pedido } = useParams(),
    { session } = useAuth(),
    receipt = receipts.get(pedido!),
    query = useQuery({
      queryKey: ["order-status", pedido, session?.user.id],
      queryFn: () =>
        edge<{ status: string; amount_cents: number; access_granted: boolean }>(
          "order-status",
          { order_id: pedido, receipt_token: receipt },
        ),
      enabled: !!session || !!receipt,
    });
  return (
    <PublicFrame>
      <div className="reading">
        <Heading title="Acompanhe seu pedido" />
        {!session && !receipt ? (
          <Notice>
            Para proteger seus dados, entre com a conta vinculada à compra ou use
            as instruções recebidas por email. O recibo desta tentativa não está
            disponível nesta sessão. <Link to="/entrar">Entrar</Link>
          </Notice>
        ) : (
          <QueryState query={query}>
            {query.data && (
              <>
                <h2>{statusName(query.data.status)}</h2>
                <p>Valor: {money(query.data.amount_cents)}</p>
                <Notice>
                  {query.data.access_granted
                    ? "O acesso foi confirmado pelo servidor."
                    : query.data.status === "paid"
                      ? "Pagamento confirmado. A liberação de acesso ou o convite ainda está em processamento."
                      : "O pagamento ainda não confirmou o acesso. Aguarde a atualização do provedor."}
                </Notice>
                <div className="actions">
                  <button onClick={() => query.refetch()}>
                    Consultar novamente
                  </button>
                  {query.data.access_granted && (
                    <Link className="button primary" to="/app/cursos">
                      Abrir meus cursos
                    </Link>
                  )}
                </div>
              </>
            )}
          </QueryState>
        )}
      </div>
    </PublicFrame>
  );
}
