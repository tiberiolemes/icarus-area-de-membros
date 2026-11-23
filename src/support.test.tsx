import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
vi.hoisted(() => {
  vi.stubEnv("VITE_SUPABASE_URL", "http://127.0.0.1:58521");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-public-key");
});
import { cache } from "./api";
import { TicketPage } from "./pages/support";
afterEach(() => {
  cleanup();
  cache.clear();
  vi.unstubAllGlobals();
});
it("preserva o estado confirmado depois de responder e não duplica arquivo listado na mensagem e na conversa", async () => {
  let status = "open";
  const file = { id: "attachment-id", name: "DEMONSTRACAO.txt" };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const reply = String(input).includes("app_ticket_reply");
      if (reply) status = JSON.parse(String(init?.body)).p_status;
      return new Response(
        JSON.stringify(
          reply
            ? { id: "reply-id", status }
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
