import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
vi.hoisted(() => {
  vi.stubEnv("VITE_SUPABASE_URL", "http://127.0.0.1:58521");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-public-key");
});
import { cache } from "./api";
import { TicketPage, Tickets } from "./pages/support";
afterEach(() => {
  cleanup();
  cache.clear();
  vi.unstubAllGlobals();
});

it("abre os guias e a ajuda do atendimento sem sair do suporte", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ total: 0, items: [] })));
  render(
    <QueryClientProvider client={cache}>
      <MemoryRouter initialEntries={["/app/suporte"]}>
        <Routes>
          <Route path="/app/suporte" element={<Tickets />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  const shortcut = screen.getByRole("link", { name: /Central de ajuda/ });
  fireEvent.click(shortcut);
  const index = within(await screen.findByRole("dialog"));
  expect(await index.findByRole("searchbox", { name: "Buscar na ajuda" })).toBeVisible();
  fireEvent.click(index.getByRole("button", { name: "Fechar" }));
  expect(screen.getByRole("heading", { name: "Central de suporte" })).toBeVisible();
  fireEvent.click(screen.getByRole("link", { name: "Acompanhar chamados e anexos" }));
  const article = within(await screen.findByRole("dialog"));
  expect(article.getByRole("link", { name: "Abrir em uma nova janela" })).toHaveAttribute("href", "/ajuda/suporte");
});

it("preserva assunto, prioridade e mensagem após uma falha e abre o chamado confirmado pelo servidor", async () => {
  const submissions: unknown[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).endsWith("/app_create_ticket")) {
      submissions.push(JSON.parse(String(init?.body)));
      return submissions.length === 1
        ? Response.json({ message: "Falha na demonstração." }, { status: 422 })
        : Response.json({ id: "confirmed-ticket" });
    }
    if (String(input).endsWith("/app_tickets"))
      return Response.json({ total: 0, items: [] });
    throw new Error("RPC fora da fixture");
  }));
  render(
    <QueryClientProvider client={cache}>
      <MemoryRouter initialEntries={["/app/suporte"]}>
        <Routes>
          <Route path="/app/suporte" element={<Tickets />} />
          <Route
            path="/app/suporte/confirmed-ticket"
            element={<h1>Chamado confirmado</h1>}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  const subject = screen.getByLabelText("Assunto");
  const priority = screen.getByLabelText("Prioridade");
  const message = screen.getByLabelText("Mensagem");
  fireEvent.change(subject, { target: { value: "Demonstração de acesso" } });
  fireEvent.change(priority, { target: { value: "high" } });
  fireEvent.change(message, { target: { value: "Texto sintético do chamado." } });
  const form = screen.getByRole("button", { name: "Enviar chamado" }).closest("form")!;
  expect(fireEvent.submit(form)).toBe(false);
  const alert = await screen.findByRole("alert");
  await waitFor(() => expect(alert).toHaveFocus());
  expect(subject).toHaveValue("Demonstração de acesso");
  expect(priority).toHaveValue("high");
  expect(message).toHaveValue("Texto sintético do chamado.");
  expect(fireEvent.submit(form)).toBe(false);
  await screen.findByRole("heading", { name: "Chamado confirmado" });
  expect(submissions).toEqual(Array(2).fill({
    p_subject: "Demonstração de acesso",
    p_priority: "high",
    p_body: "Texto sintético do chamado.",
  }));
});

it("filtra os chamados da página e mantém o detalhe indisponível quando o servidor nega acesso", async () => {
  const sample = { priority: "normal", created_at: "2026-11-24T15:00:00Z" };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("app_tickets"))
        return Response.json({
          total: 2,
          items: [
            {
              ...sample,
              id: "open",
              subject: "Demonstração aberta",
              status: "open",
            },
            {
              ...sample,
              id: "resolved",
              subject: "Demonstração resolvida",
              status: "resolved",
            },
          ],
        });
      return Response.json(
        { code: "42501", message: "Ticket indisponível." },
        { status: 403 },
      );
    }),
  );
  render(
    <QueryClientProvider client={cache}>
      <MemoryRouter initialEntries={["/app/suporte"]}>
        <Routes>
          <Route path="/app/suporte" element={<Tickets />} />
          <Route path="/app/suporte/:ticket" element={<TicketPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Resolvidos" }));
  expect(
    screen.queryByRole("link", { name: /Demonstração aberta/ }),
  ).toBeNull();
  fireEvent.click(screen.getByRole("link", { name: /Demonstração resolvida/ }));
  expect(await screen.findByRole("alert")).toHaveTextContent("permissão");
  expect(screen.queryByLabelText("Sua resposta")).toBeNull();
  expect(screen.queryByLabelText("Anexar arquivo à conversa")).toBeNull();
});
it("preserva o estado confirmado depois de responder e não duplica arquivo listado na mensagem e na conversa", async () => {
  let status = "open";
  const file = { id: "attachment-id", name: "DEMONSTRACAO.txt" };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const reply = String(input).includes("app_ticket_reply");
      const list = String(input).includes("app_admin_ticket_queue");
      if (reply) status = JSON.parse(String(init?.body)).p_status;
      return new Response(
        JSON.stringify(
          reply
            ? { id: "reply-id", status }
            : list
              ? { items: [], total: 0 }
              : {
                  id: "ticket-id",
                  subject: "DEMONSTRAÇÃO ticket",
                  priority: "urgent",
                  status,
                  created_at: "2026-11-23T03:00:00Z",
                  messages: [
                    {
                      id: "message-id",
                      author_name: "DEMONSTRAÇÃO admin",
                      body: "Mensagem sintética",
                      created_at: "2026-11-23T03:00:00Z",
                      attachments: [file],
                    },
                  ],
                  attachments: [file],
                },
        ),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }),
  );
  render(
    <QueryClientProvider client={cache}>
      <MemoryRouter initialEntries={["/admin/suporte/ticket-id"]}>
        <Routes>
          <Route path="/admin/suporte/:ticket" element={<TicketPage admin />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await screen.findByRole("heading", { name: "DEMONSTRAÇÃO ticket" });
  expect(
    screen.getAllByRole("button", { name: "Baixar DEMONSTRACAO.txt" }),
  ).toHaveLength(1);
  fireEvent.change(screen.getByLabelText("Sua resposta"), {
    target: { value: "DEMONSTRAÇÃO resposta sem dados reais" },
  });
  fireEvent.change(screen.getByLabelText("Estado após a resposta"), {
    target: { value: "waiting_member" },
  });
  fireEvent.submit(
    screen.getByRole("button", { name: "Enviar resposta" }).closest("form")!,
  );
  await waitFor(() =>
    expect(screen.getByLabelText("Sua resposta")).toHaveValue(""),
  );
  await screen.findByText(/Urgente · Aguardando aluno/);
  expect(screen.getByLabelText("Estado após a resposta")).toHaveValue(
    "waiting_member",
  );
  expect(
    screen.getAllByRole("button", { name: "Baixar DEMONSTRACAO.txt" }),
  ).toHaveLength(1);
});
