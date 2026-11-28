import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { cache } from "./api";
import { AdminEvents } from "./pages/admin-events";
import { eventCalendar, Events } from "./pages/events";
import { DraftOwner } from "./ui";

vi.hoisted(() => {
  vi.stubEnv("VITE_SUPABASE_URL", "http://127.0.0.1:59421");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-public-key");
});

const event = {
  id: "10d0fa80-49be-4276-b2a0-250abc8f2142",
  title: "Sessão de teste",
  guest: "Convidada de teste",
  starts_at: "2027-02-10T21:30:00Z",
  description: "Discussão de teste",
  duration_minutes: 90,
  can_access: true,
  can_rsvp: true,
};

function show(page: React.ReactNode) {
  render(<QueryClientProvider client={cache}><MemoryRouter>{page}</MemoryRouter></QueryClientProvider>);
}

function json(data: unknown) {
  return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } });
}

afterEach(() => {
  cleanup();
  cache.clear();
  localStorage.clear();
  vi.unstubAllGlobals();
});

it("oferece o rascunho apenas no encontro em que foi digitado", async () => {
  const first = { ...event, status: "draft", access_mode: "members", plan_ids: [] };
  const second = { ...first, id: "18e7b1a0-a898-4a5f-94ce-294197aced78", title: "Outro encontro" };
  vi.stubGlobal("fetch", vi.fn(async () => json({ items: [first, second], total: 2, plans: [] })));
  show(<DraftOwner.Provider value="editor"><AdminEvents /></DraftOwner.Provider>);

  async function open(title: string) {
    const card = (await screen.findByRole("heading", { name: title })).closest("article")!;
    fireEvent.click(within(card).getByRole("button", { name: "Editar" }));
    return within(screen.getByRole("dialog"));
  }

  let dialog = await open(first.title);
  fireEvent.input(dialog.getByLabelText("Título"), { target: { value: "Rascunho do primeiro encontro" } });
  await waitFor(() => expect(Object.keys(localStorage)).toHaveLength(1));
  fireEvent.click(dialog.getByRole("button", { name: "Fechar" }));

  dialog = await open(second.title);
  expect(dialog.queryByRole("button", { name: "Recuperar rascunho" })).toBeNull();
  expect(dialog.getByLabelText("Título")).toHaveValue(second.title);
  fireEvent.click(dialog.getByRole("button", { name: "Fechar" }));

  dialog = await open(first.title);
  fireEvent.click(dialog.getByRole("button", { name: "Recuperar rascunho" }));
  expect(dialog.getByLabelText("Título")).toHaveValue("Rascunho do primeiro encontro");
});

it("oferece a assinatura no encontro bloqueado e move o foco para gravações sem pedir links", async () => {
  const fetch = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
    const { p_recordings } = JSON.parse(String(init?.body));
    return json({ items: p_recordings ? [] : [{ id: event.id, starts_at: event.starts_at, title: event.title, guest: event.guest, can_access: false }], has_more: false });
  });
  vi.stubGlobal("fetch", fetch);
  show(<Events />);
  expect(await screen.findByRole("heading", { name: event.title })).toBeVisible();
  expect(screen.getByText(event.guest)).toBeVisible();
  expect(screen.getByRole("link", { name: "Ver planos disponíveis" })).toHaveAttribute("href", "/app/configuracoes?aba=assinatura");
  expect(screen.queryByRole("button", { name: "Confirmar presença" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Entrar na sala" })).toBeNull();
  const agenda = screen.getByRole("button", { name: "Próximos encontros" });
  const recordings = screen.getByRole("button", { name: "Gravações anteriores" });
  expect(agenda).toHaveAttribute("aria-current", "page");
  fireEvent.click(recordings);
  expect(await screen.findByText("Nenhuma gravação publicada.")).toBeVisible();
  expect(screen.getByRole("heading", { name: "Gravações anteriores do acervo" })).toHaveFocus();
  expect(recordings).toHaveAttribute("aria-current", "page");
  fireEvent.click(agenda);
  expect(screen.getByRole("heading", { name: "Agenda de encontros" })).toHaveFocus();
  expect(fetch.mock.calls.map(([url]) => String(url).split("/").at(-1))).toEqual(["app_live_events", "app_live_events"]);
});

it("apresenta o RSVP confirmado só depois de salvar e atualizar a agenda", async () => {
  let confirmed = false;
  const fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    if (String(url).endsWith("/app_live_event_rsvp")) {
      const body = JSON.parse(String(init?.body));
      if (body.p_id !== event.id) throw new Error("ID incorreto");
      confirmed = body.p_confirmed;
      return json(confirmed);
    }
    return json({ items: [{ ...event, confirmed }], has_more: false });
  });
  vi.stubGlobal("fetch", fetch);
  show(<Events />);
  fireEvent.click(await screen.findByRole("button", { name: "Confirmar presença" }));
  expect(await screen.findByText("Presença confirmada.")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Cancelar presença" }));
  expect(await screen.findByText("Confirme sua presença antes do início.")).toBeVisible();
  screen.getByText("Adicionar à agenda").closest("details")!.open = true;
  const google = new URL((screen.getByRole("link", { name: "Google Agenda" }) as HTMLAnchorElement).href);
  expect(google.pathname).toBe("/calendar/r/eventedit");
  expect(google.searchParams.get("dates")).toBe("20270210T213000Z/20270210T230000Z");
});

it("gera calendário UTC sem injeção de campos e dobra linhas UTF-8", () => {
  const ics = eventCalendar({ ...event, title: "Reunião; ação, revisão\\anotar\r\nURL:" + "á".repeat(90) }, 0);
  expect(ics).toContain("DTSTART:20270210T213000Z\r\nDTEND:20270210T230000Z");
  expect(ics.replace(/\r\n /g, "")).toContain("SUMMARY:Reunião\\; ação\\, revisão\\\\anotar\\nURL:");
  expect(ics).not.toContain("\r\nURL:");
  expect(ics.split("\r\n").every((line) => new TextEncoder().encode(line).length <= 75)).toBe(true);
});

it("cadastra um encontro no horário de Brasília, com plano explícito e sem recarga", async () => {
  const save = vi.fn();
  const fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    if (String(url).endsWith("/app_admin_save_live_event")) {
      save(JSON.parse(String(init?.body)));
      return json(1);
    }
    return json({ items: [], total: 0, plans: [{ id: "plan-test", name: "Plano de teste" }] });
  });
  vi.stubGlobal("fetch", fetch);
  show(<AdminEvents />);
  fireEvent.click(await screen.findByRole("button", { name: "Novo encontro" }));
  fireEvent.change(screen.getByLabelText("Título"), { target: { value: event.title } });
  fireEvent.change(screen.getByLabelText("Convidado"), { target: { value: event.guest } });
  fireEvent.change(screen.getByLabelText("Data e hora (horário de Brasília)"), { target: { value: "2027-02-10T18:30" } });
  fireEvent.change(screen.getByLabelText("Link da sala"), { target: { value: "https://meet.google.com/aab-bbcd-eee" } });
  fireEvent.click(screen.getByRole("checkbox", { name: "Plano de teste" }));
  fireEvent.click(screen.getByRole("button", { name: "Salvar encontro" }));
  await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({
    p_revision: 0, p_title: event.title, p_starts_at: "2027-02-10T18:30",
    p_access_mode: "plans", p_plan_ids: ["plan-test"], p_status: "draft",
  })));
  expect(await screen.findByText("Encontro salvo.")).toBeVisible();
});
