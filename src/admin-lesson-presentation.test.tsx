import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { AdminLessonPresentation } from "./pages/admin-lesson-presentation";
import { draftStorageKey, readDraft } from "./draft";
import { DraftOwner } from "./ui";

vi.hoisted(() => {
  vi.stubEnv("VITE_SUPABASE_URL", "http://127.0.0.1:58126");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "fixture-public-key");
});

const lessonId = "916ac1ab-3236-41f6-b175-137947819010";
const read = "app_lesson_presentation";
const write = "app_admin_save_lesson_presentation";
const denied = () => Response.json({ code: "42501", message: "permission denied" }, { status: 403 });
const ack = () => Response.json({ lesson_id: lessonId });
const submit = () => fireEvent.click(screen.getByRole("button", { name: "Salvar apresentação" }));
const click = (name: string) => fireEvent.click(screen.getByRole("button", { name }));
const change = (label: string, value: string, container: Pick<typeof screen, "getByLabelText"> = screen) =>
  fireEvent.change(container.getByLabelText(label), { target: { value } });

function show(options: {
  presentation?: object; role?: string; id?: string; close?: () => void;
  load?: () => Response | Promise<Response>; save?: () => Response | Promise<Response>;
  owner?: string;
} = {}) {
  const requests: { name: string; args: Record<string, unknown> }[] = [];
  const client = new QueryClient();
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const name = String(input).split("/").at(-1)!;
    requests.push({ name, args: JSON.parse(String(init?.body)) });
    if (name === read) return options.load?.() ?? Response.json({ presentation: options.presentation ?? null, checked_ids: [] });
    if (name === write) return options.save?.() ?? ack();
    throw new Error(`RPC inesperada: ${name}`);
  }));
  client.setQueryData(["bootstrap", undefined], { profile: { role: options.role ?? "admin" } });
  const view = render(<QueryClientProvider client={client}><MemoryRouter>
    <DraftOwner.Provider value={options.owner ?? null}>
      <AdminLessonPresentation lessonId={options.id ?? lessonId} lessonTitle="Aula de demonstração" onClose={options.close} />
      <a href="/admin/conteudo">Voltar ao conteúdo</a>
    </DraftOwner.Provider>
  </MemoryRouter></QueryClientProvider>);
  return { ...view, requests, writes: () => requests.filter(({ name }) => name === write) };
}

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

it("reabre o rascunho da apresentação com os blocos e limpa depois de salvar", async () => {
  const owner = "editor";
  const key = draftStorageKey(owner, `/|Salvar apresentação|${lessonId}`);
  const first = show({ owner });
  await screen.findByLabelText("Subtítulo (opcional)");
  change("Subtítulo (opcional)", "Rascunho da aula");
  click("Adicionar capítulo");
  change("Título do capítulo", "Capítulo recuperado");
  change("Início em segundos", "0,5");
  await waitFor(() => expect(readDraft(key)?.fields[0][1]).toContain("Capítulo recuperado"));
  expect(first.writes()).toHaveLength(0);
  first.unmount();
  const reopened = show({ owner });
  fireEvent.click(await screen.findByRole("button", { name: "Recuperar rascunho" }));
  expect(screen.getByLabelText("Subtítulo (opcional)")).toHaveValue("Rascunho da aula");
  expect(screen.getByLabelText("Início em segundos")).toHaveValue("0,5");
  expect(reopened.writes()).toHaveLength(0);
  submit();
  expect(await screen.findByText("Apresentação salva.")).toBeVisible();
  expect(readDraft(key)).toBeNull();
});

it("carrega e salva os seis blocos para o instrutor, mantendo IDs e ordem do checklist", async () => {
  const { requests, writes } = show({ role: "instructor", presentation: {
    subtitle: "Original",
    checklist: [{ id: "primeiro", label: "Primeiro" }, { id: "segundo", label: "Segundo" }],
  } });
  expect(await screen.findByDisplayValue("Original")).toBeVisible();
  change("Subtítulo (opcional)", "  Revisado  ");
  click("Adicionar capítulo");
  change("Título do capítulo", "Introdução");
  change("Início em segundos", "0,5");
  change("Duração em segundos (opcional)", "1,5");
  click("Adicionar destaque");
  change("Ícone", "layers");
  change("Título do destaque", "Conceito");
  change("Texto do destaque", "Resumo");
  click("Adicionar fórmula");
  change("Nome da fórmula", "Taxa");
  change("Expressão", "A / B");
  click("Mover item 2 para cima");
  change("Texto do item", "Segundo revisado", within(screen.getByRole("group", { name: "Item 1" })));
  click("Adicionar chamada para ação");
  change("Título da chamada", "Convite");
  change("Texto da chamada", "Mensagem");
  change("Texto do botão", "Abrir grupo");
  change("Link do WhatsApp", "https://chat.whatsapp.com/DEMONSTRACAO");
  submit();
  expect(await screen.findByText("Apresentação salva.")).toBeVisible();
  expect(requests[0]).toEqual({ name: read, args: { p_lesson_id: lessonId, p_edit: true } });
  expect(writes()).toEqual([{ name: write, args: {
    p_lesson_id: lessonId,
    p_presentation: {
      subtitle: "  Revisado  ", chapters: [{ title: "Introdução", start_seconds: 0.5, duration_seconds: 1.5 }],
      takeaways: [{ icon: "layers", title: "Conceito", body: "Resumo" }],
      formula: { label: "Taxa", expression: "A / B" },
      checklist: [{ id: "segundo", label: "Segundo revisado" }, { id: "primeiro", label: "Primeiro" }],
      cta: { title: "Convite", body: "Mensagem", button: "Abrir grupo", url: "https://chat.whatsapp.com/DEMONSTRACAO" },
    },
  } }]);
});

it("valida ordem, sobreposição e limite de 24h e aceita limites decimais exatos", async () => {
  const { writes } = show({ presentation: { chapters: [
    { title: "Primeiro", start_seconds: 0.1, duration_seconds: 0.2 },
    { title: "Segundo", start_seconds: 0.3 },
  ] } });
  await screen.findByDisplayValue("Primeiro");
  click("Mover capítulo 2 para cima");
  submit();
  expect(screen.getByText("O início deve ser maior que o do capítulo anterior.")).toBeVisible();
  click("Mover capítulo 1 para baixo");
  const last = within(screen.getByRole("group", { name: "Capítulo 2" }));
  const start = last.getByLabelText("Início em segundos");
  change("Início em segundos", "0,25", last);
  submit();
  expect(screen.getByText("O capítulo anterior termina depois deste início.")).toBeVisible();
  await waitFor(() => expect(start).toHaveFocus());
  change("Início em segundos", "25", last);
  change("Duração em segundos (opcional)", "86400", last);
  submit();
  expect(screen.getByText("Informe uma duração positiva que termine em até 86.400 segundos.")).toBeVisible();
  expect(writes()).toHaveLength(0);
  change("Início em segundos", "0,3", last);
  change("Duração em segundos (opcional)", "", last);
  submit();
  expect(await screen.findByText("Apresentação salva.")).toBeVisible();
  expect(writes()).toHaveLength(1);
});

it("rejeita protocolo inseguro, porta até padrão, credenciais, subdomínio e escapes inválidos no CTA", async () => {
  const { writes } = show({ presentation: { cta: {
    title: "Convite", body: "Mensagem", button: "Abrir", url: "https://wa.me",
  } } });
  const link = await screen.findByLabelText("Link do WhatsApp");
  for (const url of [
    "http://wa.me", "https://wa.me:443", "https://nome@wa.me", "https://wa.me.exemplo.test",
    "https://test.whatsapp.com", "https://wa.me/?text=%OO", "https://wa.me\\x", "javascript:void(0)",
  ]) {
    change("Link do WhatsApp", url);
    submit();
    expect(link).toHaveAttribute("aria-invalid", "true");
    expect(writes()).toHaveLength(0);
  }
  change("Link do WhatsApp", "https://api.whatsapp.com/send?text=Ol%C3%A1");
  submit();
  expect(await screen.findByText("Apresentação salva.")).toBeVisible();
});

it("mantém o rascunho após erro do servidor e evita reenvio durante o salvamento", async () => {
  let answer!: (result: Response) => void;
  const pending = new Promise<Response>((resolve) => { answer = resolve; });
  const save = vi.fn().mockReturnValueOnce(pending).mockImplementation(ack);
  const close = vi.fn();
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  const { writes } = show({ save, close });
  await screen.findByLabelText("Subtítulo (opcional)");
  click("Adicionar item");
  change("Texto do item", "<b>Texto literal</b>");
  click("Fechar editor");
  expect(confirm).toHaveBeenCalledWith(expect.stringContaining("alterações não salvas"));
  expect(close).not.toHaveBeenCalled();
  submit();
  const pendingButton = await screen.findByRole("button", { name: "Salvando…" });
  expect(pendingButton).toBeDisabled();
  fireEvent.submit(pendingButton.closest("form")!);
  expect(writes()).toHaveLength(1);
  answer(denied());
  expect(await screen.findByRole("alert")).toHaveTextContent("Você não tem permissão");
  expect(screen.getByLabelText("Texto do item")).toHaveValue("<b>Texto literal</b>");
  expect(localStorage.getItem("icarus:draft:lesson-presentation")).toBeNull();
  submit();
  expect(await screen.findByText("Apresentação salva.")).toBeVisible();
  expect(writes()).toHaveLength(2);
  expect(writes()[1].args).toEqual(writes()[0].args);
  click("Fechar editor");
  expect(close).toHaveBeenCalledOnce();
  expect(confirm).toHaveBeenCalledOnce();
});

it("confirma remoção de item persistido e envia null para limpar o último bloco", async () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
  const { writes } = show({ presentation: { checklist: [{ id: "persistido", label: "Testar" }] } });
  await screen.findByDisplayValue("Testar");
  click("Remover item 1");
  submit();
  expect(confirm).toHaveBeenCalledWith(expect.stringContaining("marcações dos alunos"));
  expect(writes()).toHaveLength(0);
  submit();
  expect(await screen.findByText("Apresentação salva.")).toBeVisible();
  expect(writes()[0].args).toEqual({ p_lesson_id: lessonId, p_presentation: null });
});

it("protege alterações de ordem antes de editar qualquer texto", async () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  show({ presentation: { checklist: [{ id: "x", label: "Primeiro" }, { id: "y", label: "Segundo" }] } });
  await screen.findByDisplayValue("Primeiro");
  click("Mover item 2 para cima");
  const unload = new Event("beforeunload", { cancelable: true });
  expect(window.dispatchEvent(unload)).toBe(false);
  expect(fireEvent.click(screen.getByRole("link", { name: "Voltar ao conteúdo" }))).toBe(false);
  expect(confirm).toHaveBeenCalledOnce();
  expect(within(screen.getByRole("group", { name: "Item 1" })).getByLabelText("Texto do item")).toHaveValue("Segundo");
});

it("bloqueia o membro antes de carregar os dados editoriais", async () => {
  const { requests } = show({ role: "member" });
  expect(await screen.findByRole("alert")).toHaveTextContent("Você não tem permissão");
  expect(requests).toEqual([]);
});

it("bloqueia ID inválido e evita chamada ao servidor", async () => {
  const { requests } = show({ id: "aula-nao-salva" });
  expect(await screen.findByRole("alert")).toHaveTextContent("Selecione uma aula cadastrada");
  expect(requests).toEqual([]);
});

it("mostra carregamento, trata falha de leitura e permite tentar novamente", async () => {
  let answer!: (result: Response) => void;
  const pending = new Promise<Response>((resolve) => { answer = resolve; });
  show({ load: vi.fn().mockReturnValueOnce(pending).mockImplementation(() => Response.json({ presentation: null })) });
  expect(screen.getByRole("status", { name: "Carregando conteúdo" })).toBeVisible();
  answer(denied());
  expect(await screen.findByRole("alert")).toHaveTextContent("Você não tem permissão");
  click("Tentar novamente");
  expect(await screen.findByLabelText("Subtítulo (opcional)")).toBeVisible();
  expect(screen.getByRole("button", { name: "Salvar apresentação" })).toBeDisabled();
});
