import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
vi.hoisted(() => {
  vi.stubEnv("VITE_SUPABASE_URL", "http://127.0.0.1:58521");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-public-key");
});
import { cache } from "./api";
import { AdminCommunity, AdminSettings } from "./pages/admin";

afterEach(() => { cleanup(); cache.clear(); vi.unstubAllGlobals(); });

const page = (items: unknown[]) => ({ items, total: items.length, page: 1, page_size: 20 });
const reports = page([
  { id: "r1", reason: "Fora do tema", status: "pending", created_at: "2026-11-25T12:00:00Z", reporter_name: "Bia Souza",
    target_type: "reply", post_id: "post-1", reply_id: "reply-1", title: "Rotina de estudos", excerpt: "Resposta com link suspeito.",
    author_name: "Ana Lima", author_id: "user-1", target_status: "approved" },
  { id: "r2", reason: "Conteúdo antigo", status: "resolved", created_at: "2026-11-24T12:00:00Z", reporter_name: "Bia Souza",
    target_type: "post", post_id: "post-2", reply_id: null, title: "Publicação removida", excerpt: "Texto removido.",
    author_name: "Ana Lima", author_id: "user-1", target_status: "removed" },
]);
const requests = page([
  { id: "q1", user_id: "user-1", full_name: "Ana Lima", kind: "export", status: "pending", created_at: "2026-11-25T12:00:00Z" },
  { id: "q2", user_id: "user-2", full_name: "", kind: "deletion", status: "completed", created_at: "2026-11-20T12:00:00Z" },
]);

function serve() {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const name = String(input).split("/").at(-1)!.split("?")[0];
    const args = init?.body ? JSON.parse(String(init.body)) : {};
    calls.push({ name, args });
    const body = name === "app_admin_reports" ? reports
      : name === "app_admin_privacy_requests" ? requests
      : name === "app_admin_set_privacy_request" ? { id: args.p_id, status: args.p_status }
      : name === "app_bootstrap" ? { profile: { id: "admin", role: "admin" } }
      : name === "app_public_context" ? {}
      : page([]);
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
  return calls;
}

it("mostra na denúncia o conteúdo, o autor e o caminho até a publicação, e só decide as pendentes", async () => {
  serve();
  render(<QueryClientProvider client={cache}><MemoryRouter initialEntries={["/admin/comunidade?aba=denuncias"]}><Routes>
    <Route path="/admin/comunidade" element={<AdminCommunity />} />
  </Routes></MemoryRouter></QueryClientProvider>);
  const pending = (await screen.findByText("Resposta com link suspeito.")).closest(".admin-row") as HTMLElement;
  expect(within(pending).getByText("Rotina de estudos")).toBeVisible();
  expect(within(pending).getByText(/Ana Lima/)).toBeVisible();
  expect(within(pending).getByText(/Fora do tema/)).toBeVisible();
  expect(within(pending).getByRole("link", { name: "Abrir publicação" })).toHaveAttribute("href", "/admin/comunidade/post-1");
  expect(within(pending).getByRole("button", { name: "Concluir análise" })).toBeVisible();
  const resolved = screen.getByText("Texto removido.").closest(".admin-row") as HTMLElement;
  expect(within(resolved).queryByRole("button", { name: "Concluir análise" })).not.toBeInTheDocument();
});

it("mostra o titular do pedido LGPD e registra o atendimento só enquanto ele está aberto", async () => {
  const calls = serve();
  render(<QueryClientProvider client={cache}><MemoryRouter initialEntries={["/admin/configuracoes?aba=privacidade"]}><Routes>
    <Route path="/admin/configuracoes" element={<AdminSettings />} />
  </Routes></MemoryRouter></QueryClientProvider>);
  const open = (await screen.findByText("Exportação de dados")).closest(".admin-row") as HTMLElement;
  expect(within(open).getByRole("link", { name: "Ana Lima" })).toHaveAttribute("href", "/admin/membros/user-1");
  const closed = screen.getByText("Exclusão de conta").closest(".admin-row") as HTMLElement;
  expect(within(closed).getByText(/Concluído/)).toBeVisible();
  expect(within(closed).queryByRole("button", { name: "Registrar atendimento" })).not.toBeInTheDocument();
  fireEvent.change(within(open).getByLabelText("Nova situação"), { target: { value: "processing" } });
  fireEvent.change(within(open).getByLabelText("Motivo do registro"), { target: { value: "Análise iniciada pela equipe." } });
  fireEvent.submit(within(open).getByRole("button", { name: "Registrar atendimento" }).closest("form")!);
  await waitFor(() => expect(calls).toContainEqual({ name: "app_admin_set_privacy_request", args: { p_id: "q1", p_status: "processing", p_reason: "Análise iniciada pela equipe." } }));
});
