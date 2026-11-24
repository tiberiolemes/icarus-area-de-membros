import { Check, CreditCard, LockKeyhole, Zap } from "lucide-react";
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
import {
  loadReceipt,
  prepareReceipt,
  receiptHash,
  saveReceipt,
} from "../checkout-receipt";
import { Field, Form, Heading, Notice, QueryState, value } from "../ui";
import { PublicFrame } from "./access";
import { statusName } from "./community";

import "./checkout.css";

type Capabilities = {
  asaas: boolean;
  bunny: boolean;
  storage: boolean;
  email: string;
  mode: string;
};
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
    attempts = useRef(
      new Map<string, {
        id: string;
        receipt?: Awaited<ReturnType<typeof prepareReceipt>>;
      }>(),
    ),
    [method, setMethod] = useState("PIX"),
    plan = context.data?.plans.find(
      (p) => p.id === params.get("plano") || p.slug === params.get("plano"),
    );
  return (
    <PublicFrame>
      <div className="icarus-checkout">
        <QueryState query={context}>
          <QueryState query={capabilities}>
            {plan ? (
              <div className="icarus-checkout-layout" key={plan.id}>
                <section className="icarus-checkout-offer">
                  <Heading title={plan.name}>
                    {plan.access_months}{" "}
                    {plan.access_months === 1 ? "mês" : "meses"} de acesso
                  </Heading>
                  {!!plan.benefits.length && (
                    <ul>
                      {plan.benefits.map((item, index) => (
                        <li key={index}>
                          <Check size={18} aria-hidden="true" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="icarus-checkout-note">
                    <LockKeyhole size={20} aria-hidden="true" />O pagamento é
                    concluído no ambiente seguro do provedor. O acesso depende
                    da confirmação pelo servidor.
                  </p>
                </section>
                <section
                  className="icarus-checkout-panel"
                  aria-label="Resumo e pagamento"
                >
                  <div className="icarus-checkout-summary">
                    <h2>{plan.name}</h2>
                    <strong>{money(plan.price_cents)}</strong>
                  </div>
                  {!capabilities.data?.asaas ? (
                    <Notice>
                      O pagamento está indisponível porque o provedor ainda não
                      foi configurado. Nenhuma cobrança será realizada.
                    </Notice>
                  ) : !context.data?.legal_ready ? (
                    <Notice>
                      O pagamento ficará disponível após a publicação dos documentos legais.
                    </Notice>
                  ) : (
                    <Form
                      className="icarus-checkout-form"
                      label={
                        method === "PIX"
                          ? `Continuar com Pix · ${money(plan.price_cents)}`
                          : "Continuar para pagamento seguro"
                      }
                      onSave={async (data, form) => {
                        const scope = (session?.user.id ?? "") + ":" + plan.id;
                        let attempt = attempts.current.get(scope);
                        if (!attempt) {
                          attempt = { id: crypto.randomUUID() };
                          attempts.current.set(scope, attempt);
                        }
                        try {
                          if (!session)
                            attempt.receipt ??= await prepareReceipt(attempt.id);
                          const result = await edge<{
                            order_id: string;
                            status: string;
                            url?: string;
                          }>("checkout", {
                            plan_id: plan.id,
                            method,
                            installments:
                              method === "PIX"
                                ? 1
                                : Number(value(data, "installments") || 1),
                            attempt_key: attempt.id,
                            ...(attempt.receipt && {
                              receipt_hash: await receiptHash(attempt.receipt),
                            }),
                            buyer: {
                              name: value(data, "name"),
                              email:
                                session?.user.email ?? value(data, "email"),
                              document: value(data, "document"),
                              phone: value(data, "phone"),
                            },
                            legal_version_ids: context.data!.legal_versions.map(
                              (v) => v.id,
                            ),
                            marketing_opt_in: data.has("marketing"),
                          });
                          if (attempt.receipt)
                            await saveReceipt(
                              result.order_id,
                              attempt.id,
                              attempt.receipt,
                            );
                          if (result.url) {
                            const url = safeUrl(result.url);
                            if (
                              !url ||
                              new URL(url).origin !==
                                "https://sandbox.asaas.com"
                            )
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
                      <h3 className="icarus-checkout-step">
                        Dados do assinante
                      </h3>
                      <div className="icarus-checkout-buyer">
                        <Field label="Nome completo">
                          <input
                            name="name"
                            autoComplete="name"
                            required
                            maxLength={120}
                          />
                        </Field>
                        <Field label="Email">
                          <input
                            key={session?.user.id}
                            name="email"
                            type="email"
                            autoComplete="email"
                            required
                            maxLength={254}
                            readOnly={!!session}
                            defaultValue={session?.user.email ?? ""}
                          />
                        </Field>
                        <Field
                          label="CPF ou CNPJ"
                          hint="Usado pelo provedor de pagamento."
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
                          <input
                            name="phone"
                            type="tel"
                            autoComplete="tel"
                            maxLength={20}
                          />
                        </Field>
                      </div>
                      <fieldset className="icarus-checkout-method">
                        <legend className="icarus-checkout-step">
                          Forma de pagamento
                        </legend>
                        <div className="icarus-checkout-buyer">
                          <label>
                            <input
                              type="radio"
                              name="method"
                              value="PIX"
                              checked={method === "PIX"}
                              onChange={() => setMethod("PIX")}
                            />
                            <Zap size={18} aria-hidden="true" /> Pix
                          </label>
                          <label>
                            <input
                              type="radio"
                              name="method"
                              value="CREDIT_CARD"
                              checked={method === "CREDIT_CARD"}
                              onChange={() => setMethod("CREDIT_CARD")}
                            />
                            <CreditCard size={18} aria-hidden="true" /> Cartão
                            de crédito
                          </label>
                        </div>
                      </fieldset>
                      <p className="icarus-checkout-note">
                        {method === "PIX"
                          ? "Pague à vista no ambiente do provedor."
                          : "Informe os dados do cartão no ambiente do provedor."}
                      </p>
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
                      <div className="icarus-checkout-total">
                        <span>
                          {method === "PIX"
                            ? "Total à vista"
                            : "Valor do plano"}
                        </span>
                        <strong>{money(plan.price_cents)}</strong>
                      </div>
                      <div className="icarus-checkout-consent">
                        <div className="icarus-checkout-documents">
                          <Link to="/termos">Termos de uso</Link>
                          <Link to="/privacidade">Política de privacidade</Link>
                        </div>
                        <label className="check">
                          <input name="legal" type="checkbox" required />
                          Aceito os Termos de uso e a Política de privacidade.
                        </label>
                      </div>
                      <label className="check">
                        <input name="marketing" type="checkbox" />
                        Aceito comunicações de marketing (opcional).
                      </label>
                      <p>
                        Para uma compra nova, as instruções de acesso chegam ao
                        email informado após a confirmação.
                      </p>
                    </Form>
                  )}
                </section>
              </div>
            ) : (
              <>
                <Heading title="Sua assinatura" />
                <Notice>
                  Nenhum plano ativo foi encontrado para este link.{" "}
                  <Link to="/entrar">Voltar ao início</Link>
                </Notice>
              </>
            )}
          </QueryState>
        </QueryState>
      </div>
    </PublicFrame>
  );
}
export function OrderStatus() {
  const { pedido } = useParams(),
    { session } = useAuth(),
    query = useQuery({
      queryKey: ["order-status", pedido, session?.user.id],
      staleTime: 0,
      gcTime: 0,
      queryFn: async () => {
        const receipt = await loadReceipt(pedido!);
        if (!session && !receipt) return null;
        return edge<{
          status: string;
          amount_cents: number;
          access_granted: boolean;
        }>("order-status", { order_id: pedido, receipt_token: receipt });
      },
    });
  return (
    <PublicFrame>
      <div className="icarus-checkout icarus-order-status">
        <Heading title="Acompanhe seu pedido" />
        <section
          className="icarus-checkout-panel"
          aria-label="Situação do pedido"
        >
          {query.data === null ? (
            <Notice>
              Para proteger seus dados, entre com a conta vinculada à compra ou
              use as instruções recebidas por email. O recibo desta tentativa não
              está disponível neste navegador ou expirou.{" "}
              <Link to="/entrar">Entrar</Link>
            </Notice>
          ) : (
            <QueryState query={query}>
              {query.data && (
                <>
                  <div className="icarus-checkout-summary" role="status">
                    <h2>
                      {statusName(query.data.status === "pending" ? "pending_payment" : query.data.status)}
                    </h2>
                    <strong>{money(query.data.amount_cents)}</strong>
                  </div>
                  <Notice>
                    {query.data.access_granted
                      ? "O acesso foi confirmado pelo servidor."
                      : query.data.status === "paid"
                        ? "Pagamento confirmado. A liberação de acesso ou o convite ainda está em processamento."
                        : "O pagamento ainda não confirmou o acesso. Aguarde a atualização do provedor."}
                  </Notice>
                  <div className="actions">
                    <button
                      aria-disabled={query.isFetching}
                      onClick={() => void query.refetch({ cancelRefetch: false })}
                    >
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
        </section>
      </div>
    </PublicFrame>
  );
}
