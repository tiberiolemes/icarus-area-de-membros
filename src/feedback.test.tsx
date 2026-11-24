import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { onlineManager, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";

vi.hoisted(() => {
  vi.stubEnv("VITE_SUPABASE_URL", "http://127.0.0.1:58521");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-public-key");
});

import { cache } from "./api";
import { AdminFeedbacks } from "./pages/admin-feedbacks";
import { FeedbackButton } from "./pages/feedback";

afterEach(() => {
  cleanup();
  cache.clear();
  onlineManager.setOnline(true);
  vi.unstubAllGlobals();
});

it("preserva o relato e a tentativa até o servidor confirmar, sem enviar identificadores da rota", async () => {
  const calls: unknown[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    calls.push(JSON.parse(String(init?.body)));
    return calls.length === 1
      ? Response.json({ code: "P0001", message: "Envio indisponível." }, { status: 400 })
      : Response.json({ id: "feedback-teste" });
  }));
  render(<MemoryRouter initialEntries={["/app/cursos/curso/trecho/aula-especifica?teste=sensivel#marcador"]}><FeedbackButton /></MemoryRouter>);
  const open = screen.getByRole("button", { name: "Enviar feedback" });
  fireEvent.click(open);
  const dialog = screen.getByRole("dialog", { name: "Envie seu feedback" });
  const type = within(dialog).getByLabelText("Tipo");
  const description = within(dialog).getByLabelText("Descrição");
  fireEvent.change(type, { target: { value: "bug" } });
  fireEvent.input(description, { target: { value: "   Relato sintético   " } });
  const form = within(dialog).getByRole("button", { name: "Enviar feedback" }).closest("form")!;
  expect(fireEvent.submit(form)).toBe(false);
  const error = await within(dialog).findByRole("alert");
  await waitFor(() => expect(error).toHaveFocus());
  expect(type).toHaveValue("bug");
  expect(description).toHaveValue("   Relato sintético   ");
  expect(fireEvent.submit(form)).toBe(false);
  expect(await within(dialog).findByText("Feedback enviado.")).toBeVisible();
  expect(calls[0]).toEqual({
    p_attempt_key: expect.any(String), p_kind: "bug", p_body: "Relato sintético", p_screenshot_id: null,
    p_page_path: "/app/cursos/:curso/:modulo/:aula", p_browser_family: "Outro",
  });
  expect(calls[1]).toEqual(calls[0]);
  expect(description).toHaveValue("");
  fireEvent.keyDown(dialog, { key: "Escape" });
  await waitFor(() => expect(open).toHaveFocus());
});

it.each(["upload", "feedback"])("recupera a versão original após perda da resposta de %s e envia o rascunho só em novo clique", async (failure) => {
  const uploads: { name: string; key: string }[] = [];
  const submitted: Record<string, unknown>[] = [];
  const stored = new Map<unknown, Record<string, unknown>>();
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).endsWith("/upload")) {
      const data = init?.body as FormData;
      const name = (data.get("file") as File).name;
      uploads.push({ name, key: String(data.get("resource_id")) });
      if (failure === "upload" && uploads.length === 1) return Response.json({ error: { message: "Resposta do upload perdida." } }, { status: 503 });
      return Response.json({ id: name === "original.png" ? "print-original" : "print-revisado" });
    }
    const body = JSON.parse(String(init?.body));
    submitted.push(body);
    if (!stored.has(body.p_attempt_key)) stored.set(body.p_attempt_key, body);
    if (failure === "feedback" && submitted.length === 1) throw new TypeError("Failed to fetch");
    return Response.json({ id: body.p_attempt_key });
  }));
  render(<MemoryRouter initialEntries={["/app/suporte"]}><FeedbackButton /></MemoryRouter>);
  fireEvent.click(screen.getByRole("button", { name: "Enviar feedback" }));
  const dialog = within(screen.getByRole("dialog", { name: "Envie seu feedback" }));
  const type = dialog.getByLabelText("Tipo");
  const description = dialog.getByLabelText("Descrição");
  const file = dialog.getByLabelText("Print (opcional)") as HTMLInputElement;
  const original = new File(["original"], "original.png", { type: "image/png" });
  const revised = new File(["revisado"], "revisado.png", { type: "image/png" });
  fireEvent.change(type, { target: { value: "bug" } });
  fireEvent.input(description, { target: { value: "Versão inicial" } });
  fireEvent.change(file, { target: { files: [original] } });
  fireEvent.click(dialog.getByRole("button", { name: "Enviar feedback" }));
  await dialog.findByRole("alert");
  fireEvent.change(type, { target: { value: "suggestion" } });
  fireEvent.input(description, { target: { value: "" } });
  fireEvent.change(file, { target: { files: [revised] } });
  fireEvent.click(dialog.getByRole("button", { name: "Confirmar envio anterior" }));
  expect(await dialog.findByText("Feedback anterior confirmado. Seu rascunho continua aqui.")).toBeVisible();
  expect(type).toHaveValue("suggestion");
  expect(description).toHaveValue("");
  expect(file.files?.[0]).toBe(revised);
  expect(uploads.map(({ name }) => name)).toEqual(failure === "upload" ? ["original.png", "original.png"] : ["original.png"]);
  expect(new Set(uploads.map(({ key }) => key)).size).toBe(1);
  expect(stored.size).toBe(1);
  expect(submitted[0]).toMatchObject({ p_kind: "bug", p_body: "Versão inicial", p_screenshot_id: "print-original" });
  if (failure === "feedback") expect(submitted[1]).toEqual(submitted[0]);

  fireEvent.input(description, { target: { value: "Versão editada" } });
  fireEvent.click(dialog.getByRole("button", { name: "Enviar rascunho como novo feedback" }));
  expect(await dialog.findByText("Feedback enviado.")).toBeVisible();
  expect(uploads.at(-1)?.name).toBe("revisado.png");
  expect(uploads.at(-1)?.key).not.toBe(uploads[0].key);
  expect(submitted.at(-1)).toMatchObject({ p_kind: "suggestion", p_body: "Versão editada", p_screenshot_id: "print-revisado" });
  expect(stored.size).toBe(2);
});

it.each([
  { code: "INVALID_FILE", status: 422, lost: false },
  { code: "INVALID_FILE", status: 422, lost: true },
  { code: "INVALID_INPUT", status: 422, lost: true },
  { code: "TOO_LARGE", status: 413, lost: true },
])("libera o rascunho após $code antes da reserva (resposta anterior perdida: $lost)", async ({ code, status, lost }) => {
  const uploads: { name: string; key: string }[] = [];
  const submissions: Record<string, unknown>[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).endsWith("/upload")) {
      const data = init?.body as FormData;
      const name = (data.get("file") as File).name;
      uploads.push({ name, key: String(data.get("resource_id")) });
      if (lost && uploads.length === 1) throw new TypeError("Failed to fetch");
      return name === "invalido.png"
        ? Response.json({ error: { code, message: "Print rejeitado antes da reserva." } }, { status })
        : Response.json({ id: "print-válido" });
    }
    submissions.push(JSON.parse(String(init?.body)));
    return Response.json({ id: "feedback-confirmado" });
  }));
  render(<MemoryRouter><FeedbackButton /></MemoryRouter>);
  fireEvent.click(screen.getByRole("button", { name: "Enviar feedback" }));
  const dialog = within(screen.getByRole("dialog", { name: "Envie seu feedback" }));
  const type = dialog.getByLabelText("Tipo");
  const description = dialog.getByLabelText("Descrição");
  const print = dialog.getByLabelText("Print (opcional)") as HTMLInputElement;
  fireEvent.change(type, { target: { value: "bug" } });
  fireEvent.input(description, { target: { value: "Relato inicial" } });
  fireEvent.change(print, { target: { files: [new File(["inválido"], "invalido.png", { type: "image/png" })] } });
  fireEvent.click(dialog.getByRole("button", { name: "Enviar feedback" }));
  await dialog.findByRole("alert");
  const valid = new File(["válido"], "valido.png", { type: "image/png" });
  fireEvent.change(type, { target: { value: "suggestion" } });
  fireEvent.input(description, { target: { value: "Relato revisto" } });
  fireEvent.change(print, { target: { files: [valid] } });
  if (lost) fireEvent.click(dialog.getByRole("button", { name: "Confirmar envio anterior" }));
  expect(await dialog.findByText("Print rejeitado antes da reserva.")).toBeVisible();
  expect(type).toHaveValue("suggestion");
  expect(description).toHaveValue("Relato revisto");
  expect(print.files?.[0]).toBe(valid);
  expect(submissions).toHaveLength(0);
  if (lost) expect(uploads[1]).toEqual(uploads[0]);
  fireEvent.click(dialog.getByRole("button", { name: "Enviar feedback" }));
  expect(await dialog.findByText("Feedback enviado.")).toBeVisible();
  expect(uploads.map(({ name }) => name)).toEqual(lost ? ["invalido.png", "invalido.png", "valido.png"] : ["invalido.png", "valido.png"]);
  expect(uploads.at(-1)?.key).not.toBe(uploads[0].key);
  expect(submissions).toEqual([expect.objectContaining({ p_kind: "suggestion", p_body: "Relato revisto", p_screenshot_id: "print-válido" })]);
});

it("filtra a fila no servidor e atualiza a situação confirmada com revisão", async () => {
  const item = { id: "feedback-a", author_name: "Aluno de teste", kind: "bug", status: "new", excerpt: "Resumo sintético",
    created_at: "2026-11-24T15:00:00Z", has_screenshot: false, page_path: "/app/cursos" };
  const calls: { name: string; body: Record<string, unknown> }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const name = String(input).split("/").at(-1)!;
    const body = JSON.parse(String(init?.body));
    calls.push({ name, body });
    if (name === "app_admin_feedbacks") return Response.json({ items: [item], counts: { new: 1 }, total: 1 });
    if (name === "app_admin_feedback") return Response.json({ ...item, body: "Descrição inteira.", browser_family: "Firefox", revision: 2 });
    if (name === "app_admin_feedback_status") return Response.json({ status: "planned", revision: 3 });
    throw new Error("Rota fora da fixture");
  }));
  render(<QueryClientProvider client={cache}><AdminFeedbacks /></QueryClientProvider>);
  fireEvent.change(screen.getByLabelText("Tipo"), { target: { value: "bug" } });
  fireEvent.change(screen.getByLabelText("Situação"), { target: { value: "new" } });
  fireEvent.click(await screen.findByRole("button", { name: /Ver feedback de Aluno de teste/ }));
  const dialog = screen.getByRole("dialog", { name: "Detalhe do feedback" });
  expect(await within(dialog).findByText("Descrição inteira.")).toBeVisible();
  fireEvent.change(within(dialog).getByLabelText(/Situação atual/), { target: { value: "planned" } });
  const form = within(dialog).getByRole("button", { name: "Salvar situação" }).closest("form")!;
  expect(fireEvent.submit(form)).toBe(false);
  expect(await within(dialog).findByText("Situação atual · Planejado")).toBeVisible();
  expect(calls).toContainEqual({ name: "app_admin_feedbacks", body: { p_kind: "bug", p_status: "new", p_page: 1 } });
  expect(calls).toContainEqual({ name: "app_admin_feedback_status", body: { p_id: "feedback-a", p_status: "planned", p_revision: 2 } });
});

it("repõe a seleção após conflito e exige escolher novamente antes de salvar", async () => {
  const item = { id: "feedback-concorrente", author_name: "Aluno de teste", kind: "bug", status: "new", excerpt: "Triagem concorrente",
    created_at: "2026-11-24T15:00:00Z", has_screenshot: false, page_path: "/app/cursos" };
  const updates: Record<string, unknown>[] = [];
  const stored = { status: "new", revision: 1 };
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const name = String(input).split("/").at(-1)!;
    if (name === "app_admin_feedbacks") return Response.json({ items: [item], counts: { new: 1 }, total: 1 });
    if (name === "app_admin_feedback") return Response.json({ ...item, ...stored, body: "Triagem concorrente" });
    if (name !== "app_admin_feedback_status") throw new Error("Rota fora da fixture");
    updates.push(JSON.parse(String(init?.body)));
    if (updates.length === 1) {
      Object.assign(stored, { status: "reviewing", revision: 2 });
      return Response.json({ code: "P0001", message: "A situação mudou. Atualize o detalhe e tente novamente." }, { status: 400 });
    }
    return Response.json({ status: "planned", revision: 3 });
  }));
  render(<QueryClientProvider client={cache}><AdminFeedbacks /></QueryClientProvider>);
  fireEvent.click(await screen.findByRole("button", { name: /Ver feedback de Aluno de teste/ }));
  const dialog = within(screen.getByRole("dialog", { name: "Detalhe do feedback" }));
  fireEvent.change(await dialog.findByLabelText(/Situação atual/), { target: { value: "planned" } });
  fireEvent.click(dialog.getByRole("button", { name: "Salvar situação" }));
  await dialog.findByRole("alert");
  expect(dialog.getByLabelText("Situação atual · Em análise")).toHaveValue("reviewing");
  const save = dialog.getByRole("button", { name: "Salvar situação" });
  expect(save).toBeDisabled();
  expect(fireEvent.submit(save.closest("form")!)).toBe(false);
  expect(updates).toHaveLength(1);
  fireEvent.change(dialog.getByLabelText(/Situação atual/), { target: { value: "planned" } });
  fireEvent.click(save);
  await dialog.findByText("Situação atual · Planejado");
  expect(updates).toEqual([
    { p_id: item.id, p_status: "planned", p_revision: 1 },
    { p_id: item.id, p_status: "planned", p_revision: 2 },
  ]);
});

it.each([
  { order: "leitura antiga chega depois da confirmação", revision: 2, status: "planned", label: "Planejado" },
  { order: "leitura mais recente chega antes da confirmação", revision: 3, status: "reviewing", label: "Em análise" },
])("preserva a revisão mais nova quando $order", async ({ revision, status, label }) => {
  const item = { id: "feedback-reconexao", author_name: "Aluno de teste", kind: "bug", status: "new", excerpt: "Relato para triagem",
    created_at: "2026-11-24T15:00:00Z", has_screenshot: false, page_path: "/app/cursos" };
  const previous = { ...item, body: item.excerpt, revision: 1 };
  const detailKey = ["app_admin_feedback", { p_id: item.id }];
  let finishSave!: (response: Response) => void;
  let finishRead!: (response: Response) => void;
  const saveResult = new Promise<Response>((resolve) => { finishSave = resolve; });
  const pendingRead = new Promise<Response>((resolve) => { finishRead = resolve; });
  const save = vi.fn(() => saveResult);
  const readDetail = vi.fn().mockResolvedValueOnce(Response.json(previous)).mockReturnValueOnce(pendingRead);
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const name = String(input).split("/").at(-1)!;
    if (name === "app_admin_feedback") return readDetail();
    if (name === "app_admin_feedback_status") return save();
    if (name === "app_admin_feedbacks") return Response.json({ items: [item], counts: { new: 1 }, total: 1 });
    throw new Error("Rota fora da fixture");
  }));
  render(<QueryClientProvider client={cache}><AdminFeedbacks /></QueryClientProvider>);
  fireEvent.click(await screen.findByRole("button", { name: /Ver feedback de Aluno de teste/ }));
  const dialog = within(screen.getByRole("dialog", { name: "Detalhe do feedback" }));
  fireEvent.change(await dialog.findByLabelText("Situação atual · Novo"), { target: { value: "planned" } });
  act(() => {
    cache.setQueryData(detailKey, previous, { updatedAt: 0 });
    onlineManager.setOnline(false);
    onlineManager.setOnline(true);
  });
  await waitFor(() => expect(readDetail).toHaveBeenCalledTimes(2));
  fireEvent.click(dialog.getByRole("button", { name: "Salvar situação" }));
  if (revision === 3) {
    await act(async () => { finishRead(Response.json({ ...previous, status, revision })); });
    await dialog.findByLabelText("Situação atual · Em análise");
  }
  await act(async () => { finishSave(Response.json({ id: item.id, status: "planned", revision: 2 })); });
  await dialog.findByText("Salvo com sucesso.");
  if (revision === 2) await act(async () => { finishRead(Response.json(previous)); });
  expect(cache.getQueryData(detailKey)).toMatchObject({ revision, status });
  expect(dialog.getByLabelText(`Situação atual · ${label}`)).toHaveValue(status);
  const submit = dialog.getByRole("button", { name: "Salvar situação" });
  expect(submit).toBeDisabled();
  fireEvent.submit(submit.closest("form")!);
  expect(save).toHaveBeenCalledTimes(1);
});
