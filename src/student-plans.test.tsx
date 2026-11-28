import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { Settings } from "./pages/settings";

const { fixture } = vi.hoisted(() => ({
  fixture: {
    profile: { id: "aluna", full_name: "Aluna Teste", theme: "light", company: {}, bio: "", role: "member",
      plan_name: "", current_plan_id: null as string | null, onboarding_complete: true },
    plans: [] as object[],
    settings: {},
  },
}));
vi.mock("./auth", () => ({ useBootstrap: () => ({ data: fixture }), useAuth: () => ({ session: null }) }));

const plan = { id: "pro", name: "PRO", slug: "pro", price_cents: 58800, access_months: 12,
  benefits: ["Materiais e aulas exclusivas", "Aulas ao vivo"], active: true, interest_free: true };

function Destination() {
  const { pathname, search } = useLocation();
  return <h1>{pathname}{search}</h1>;
}

function mount(plans: object[], current: string | null = null) {
  fixture.plans = plans;
  fixture.profile.current_plan_id = current;
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={["/app/configuracoes?aba=assinatura"]}>
        <Routes>
          <Route path="/app/configuracoes" element={<Settings />} />
          <Route path="*" element={<Destination />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
const card = (name: string) => screen.getByRole("heading", { name, level: 3 }).closest("article")!;

afterEach(cleanup);

it("plano sem juros destaca 12x de R$ 49,00 sem juros e o valor à vista", () => {
  mount([plan]);
  const pro = card("PRO");
  expect(pro).toHaveTextContent("12x de R$ 49,00 sem juros");
  expect(pro).toHaveTextContent("ou R$ 588,00 à vista");
  expect(pro).toHaveTextContent("12 meses de acesso");
  expect(pro).not.toHaveTextContent("Valor final da parcela confirmado no pagamento.");
});

it("plano com juros diz em até 12x no cartão e avisa que o valor final é confirmado no pagamento", () => {
  mount([{ ...plan, interest_free: false }]);
  const pro = card("PRO");
  expect(pro).toHaveTextContent("em até 12x de R$ 49,00 no cartão");
  expect(pro).toHaveTextContent("ou R$ 588,00 à vista");
  expect(within(pro).getByText("Valor final da parcela confirmado no pagamento.")).toBeVisible();
  expect(pro).not.toHaveTextContent("sem juros");
});

it("plano gratuito mostra Gratuito sem parcela", () => {
  mount([{ ...plan, price_cents: 0 }]);
  const pro = card("PRO");
  expect(within(pro).getByText("Gratuito")).toBeVisible();
  expect(pro).not.toHaveTextContent("12x");
  expect(pro).not.toHaveTextContent("à vista");
});

it("plano atual mostra o selo no lugar de Assinar", () => {
  mount([plan, { ...plan, id: "platinum", name: "Platinum", slug: "platinum", price_cents: 116400 }], "pro");
  expect(within(card("PRO")).getByText("Seu plano atual")).toBeVisible();
  expect(within(card("PRO")).queryByRole("link", { name: "Assinar" })).toBeNull();
  expect(card("Platinum")).toHaveTextContent("12x de R$ 97,00 sem juros");
  expect(within(card("Platinum")).getByRole("link", { name: "Assinar" })).toBeVisible();
});

it("Assinar leva ao checkout do plano", () => {
  mount([plan]);
  fireEvent.click(within(card("PRO")).getByRole("link", { name: "Assinar" }));
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("/checkout?plano=pro");
});

it("benefícios aparecem com ícone de check", () => {
  mount([plan]);
  const items = within(card("PRO")).getAllByRole("listitem");
  expect(items.map((item) => item.textContent)).toEqual(plan.benefits);
  for (const item of items) expect(item.querySelector("svg.lucide-check[aria-hidden='true']")).not.toBeNull();
});
