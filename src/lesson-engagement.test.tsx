import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cache } from "./api";
import type { LessonComment, LessonNote } from "./pages/lesson-engagement";
import {
  LessonCommentModeration, LessonComments, LessonEngagementActions, LessonEngagementTab,
  LessonNotes, useLessonEngagement,
} from "./pages/lesson-engagement";

vi.hoisted(() => {
  vi.stubEnv("VITE_SUPABASE_URL", "http://127.0.0.1:58521");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "fixture-key");
});

const lessonId = "6d5d8717-dead-4be1-ae75-7879e6ed78a8";
const otherLessonId = "4490dd94-6c4d-42a0-a198-9e103db85e36";
const date = "2026-11-23T10:00:00Z";
const root: LessonComment = {
  id: "root", author_name: "Pessoa instrutora", parent_id: null, status: "approved",
  is_instructor: true, created_at: date, body: "Uma resposta sobre esta aula.",
};
const review: LessonComment = {
  ...root, id: "review", author_name: "Outra pessoa", body: "Uma pergunta para revisão.",
  is_instructor: false, status: "pending",
};

function fixture() {
  let saved = false;
  let allowReview = true;
  let notes: LessonNote[] = [];
  const comments = [root, review];
  const requests: { name: string; args: Record<string, unknown> }[] = [];
  const failures = new Set<string>();
  let waitForFavorite: Promise<void> | undefined;
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const name = String(input).split("/").at(-1)!;
    const args = JSON.parse(String(init?.body));
    requests.push({ name, args });
    if (failures.has(name)) {
      return Response.json({ code: "42501", message: "Denied" }, { status: 403 });
    }
    const localNotes = args.p_lesson_id === lessonId ? notes : [];
    const page = <T,>(items: T[]) => {
      const requested = Number(args.p_page);
      return { items: items.slice((requested - 1) * 2, requested * 2), page: requested, page_size: 2, total: items.length };
    };
    switch (name) {
      case "app_lesson_engagement":
        return Response.json({ saved, notes_count: localNotes.length, comments_count: comments.length });
      case "app_lesson_favorite":
        await waitForFavorite;
        saved = args.p_saved;
        return Response.json({ saved });
      case "app_lesson_notes":
        return Response.json(page(localNotes));
      case "app_save_lesson_note": {
        const id = args.p_id ?? "note-created";
        notes = [{ id, body: args.p_body, position_seconds: args.p_position_seconds, updated_at: date }, ...notes.filter((note) => note.id !== id)];
        return Response.json({ id });
      }
      case "app_delete_lesson_note":
        notes = notes.filter((note) => note.id !== args.p_id);
        return Response.json({ id: args.p_id });
      case "app_lesson_comments":
        if (args.p_review && !allowReview) {
          return Response.json({ code: "42501" }, { status: 403 });
        }
        return Response.json(page(args.p_review ? comments.filter((item) => item.status === "pending") : comments));
      case "app_save_lesson_comment": {
        const id = "reply";
        comments.push({
          ...review, id, author_name: "Pessoa aluna", parent_id: args.p_parent_id, body: args.p_body,
        });
        return Response.json({ id, status: "pending" });
      }
      case "app_moderate_lesson_comment": {
        const status = args.p_decision === "approve" ? "approved" : "rejected";
        const index = comments.findIndex((item) => item.id === args.p_id);
        comments[index] = { ...comments[index], status };
        return Response.json({ id: args.p_id, status });
      }
      default:
        throw new Error(`RPC inesperada: ${name}`);
    }
  });
  vi.stubGlobal("fetch", fetch);
  return {
    requests, failures,
    rejectReview: () => { allowReview = false; },
    holdFavorite: (pending: Promise<void>) => { waitForFavorite = pending; },
    addNotes: (...items: LessonNote[]) => { notes.push(...items); },
  };
}

function scope(children: ReactNode) {
  return <QueryClientProvider client={cache}>{children}</QueryClientProvider>;
}

afterEach(() => { cache.clear(); vi.unstubAllGlobals(); });

it("confirma o favorito pelo servidor, bloqueia envio duplicado e mantém o estado na falha", async () => {
  const { requests, failures, holdFavorite } = fixture();
  let release: () => void = () => {};
  holdFavorite(new Promise<void>((resolve) => { release = resolve; }));
  const openNotes = vi.fn();
  render(scope(<LessonEngagementActions lessonId={lessonId} onOpenNotes={openNotes} />));
  const favorite = screen.getByRole("button", { name: "Favoritar aula" });
  await waitFor(() => expect(favorite).toHaveAttribute("aria-pressed", "false"));
  fireEvent.click(screen.getByRole("button", { name: "Fazer anotação" }));
  expect(openNotes).toHaveBeenCalledOnce();
  fireEvent.click(favorite);
  fireEvent.click(favorite);
  await waitFor(() => expect(favorite).toHaveAttribute("aria-busy", "true"));
  expect(favorite).toHaveAttribute("aria-pressed", "false");
  expect(requests.filter(({ name }) => name === "app_lesson_favorite")).toEqual([
    { name: "app_lesson_favorite", args: { p_lesson_id: lessonId, p_saved: true } },
  ]);
  await act(async () => { release(); });
  await waitFor(() => expect(favorite).toHaveAttribute("aria-pressed", "true"));
  await waitFor(() => expect(favorite).toHaveAttribute("aria-busy", "false"));
  failures.add("app_lesson_favorite");
  fireEvent.click(favorite);
  expect(await screen.findByRole("alert")).toHaveTextContent(/permissão/);
  expect(favorite).toHaveAttribute("aria-pressed", "true");
  expect(requests).toContainEqual({ name: "app_lesson_favorite", args: { p_lesson_id: lessonId, p_saved: false } });
});

it("mantém a anotação após erro AJAX, busca a posição ao salvar e permite editar, buscar e excluir", async () => {
  const { requests, failures } = fixture();
  let position = 1;
  const getPositionSeconds = () => position;
  const seek = vi.fn();
  render(scope(<LessonNotes lessonId={lessonId} getPositionSeconds={getPositionSeconds} onSeek={seek} focusRequest={1} />));
  const text = screen.getByRole("textbox", { name: "Suas anotações pessoais" });
  await waitFor(() => expect(text).toHaveFocus());
  fireEvent.input(text, { target: { value: "Minha anotação privada" } });
  const save = screen.getByRole("button", { name: "Salvar anotação" });
  failures.add("app_save_lesson_note");
  fireEvent.click(save);
  expect(await screen.findByRole("alert")).toHaveTextContent(/permissão/);
  await waitFor(() => expect(screen.getByRole("alert")).toHaveFocus());
  expect(text).toHaveValue("Minha anotação privada");
  expect(screen.queryByText("Anotação salva.")).toBeNull();
  failures.clear();
  position = 73.25;
  fireEvent.click(save);
  await screen.findByText("Anotação salva.");
  expect(requests).toContainEqual({
    name: "app_save_lesson_note",
    args: { p_lesson_id: lessonId, p_id: null, p_body: "Minha anotação privada", p_position_seconds: 73.25 },
  });
  expect(text).toHaveValue("");
  fireEvent.click(screen.getByRole("button", { name: "Ir para 01:13 na aula" }));
  expect(seek).toHaveBeenCalledWith(73.25);
  fireEvent.click(screen.getByRole("button", { name: "Editar" }));
  const edit = screen.getByRole("textbox", { name: "Editar anotação pessoal" });
  await waitFor(() => expect(edit).toHaveFocus());
  expect(edit).toHaveValue("Minha anotação privada");
  fireEvent.input(edit, { target: { value: "Anotação revisada" } });
  position = 95;
  fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
  await screen.findByText("Anotação revisada");
  expect(requests).toContainEqual({
    name: "app_save_lesson_note",
    args: { p_lesson_id: lessonId, p_id: "note-created", p_body: "Anotação revisada", p_position_seconds: 73.25 },
  });
  const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
  fireEvent.click(screen.getByRole("button", { name: "Excluir" }));
  expect(requests.some(({ name }) => name === "app_delete_lesson_note")).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Excluir" }));
  expect(await screen.findByText("Anotação excluída.")).toBeVisible();
  expect(await screen.findByText("Nenhuma anotação pessoal nesta aula.")).toBeVisible();
  expect(confirm).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(localStorage)).not.toContain("Anotação revisada");
  expect(JSON.stringify(sessionStorage)).not.toContain("Anotação revisada");
});

it("pagina pelas dimensões da resposta e remove o rascunho ao trocar de aula", async () => {
  const { requests, addNotes } = fixture();
  addNotes(...["Primeira", "Segunda", "Terceira"].map((body) => ({
    id: body, body, updated_at: date, position_seconds: null,
  })));
  const view = render(scope(<LessonNotes lessonId={lessonId} active={false} />));
  expect(requests).toEqual([]);
  view.rerender(scope(<LessonNotes lessonId={lessonId} />));
  await screen.findByText("Página 1 de 2");
  fireEvent.click(screen.getByRole("button", { name: "Próxima" }));
  expect(await screen.findByText("Terceira")).toBeVisible();
  expect(requests).toContainEqual({ name: "app_lesson_notes", args: { p_lesson_id: lessonId, p_page: 2 } });
  fireEvent.input(screen.getByRole("textbox"), { target: { value: "Texto da primeira aula" } });
  view.rerender(scope(<LessonNotes lessonId={otherLessonId} />));
  await screen.findByText("Nenhuma anotação pessoal nesta aula.");
  expect(screen.getByRole("textbox")).toHaveValue("");
  expect(screen.queryByText("Terceira")).toBeNull();
});

it("envia uma resposta para moderação, atualiza a contagem e mantém a paginação enviada pelo servidor", async () => {
  const { requests } = fixture();
  const open = vi.fn();
  function Tab() {
    const summary = useLessonEngagement(lessonId);
    return <LessonEngagementTab tab="comments" active count={summary.data?.comments_count}
      id="comments-tab" panelId="comments-panel" onOpen={open} />;
  }
  render(scope(<><Tab /><LessonComments lessonId={lessonId} authorName="Pessoa Aluna" /></>));
  const tab = await screen.findByRole("tab", { name: "Comentários 2" });
  expect(tab).toHaveAttribute("aria-controls", "comments-panel");
  fireEvent.click(tab);
  expect(open).toHaveBeenCalledOnce();
  fireEvent.click(await screen.findByRole("button", { name: "Responder" }));
  const reply = screen.getByRole("textbox", { name: "Resposta a Pessoa instrutora" });
  await waitFor(() => expect(reply).toHaveFocus());
  fireEvent.input(reply, { target: { value: "<b>Dúvida</b>" } });
  fireEvent.click(screen.getByRole("button", { name: "Enviar resposta" }));
  expect(await screen.findByText("Comentário enviado para moderação.")).toBeVisible();
  expect(await screen.findByRole("tab", { name: "Comentários 3" })).toBeVisible();
  expect(requests).toContainEqual({
    name: "app_save_lesson_comment",
    args: { p_lesson_id: lessonId, p_parent_id: root.id, p_body: "<b>Dúvida</b>" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Próxima" }));
  const item = (await screen.findByText("<b>Dúvida</b>")).closest("li")!;
  expect(within(item).getByText("Resposta")).toBeVisible();
  expect(within(item).getByText("Em moderação")).toBeVisible();
  expect(item.querySelector("b")).toBeNull();
});

it("rejeita comentário vazio e preserva o comentário principal quando o servidor recusa", async () => {
  const { requests, failures } = fixture();
  render(scope(<LessonComments lessonId={lessonId} />));
  const publish = await screen.findByRole("button", { name: "Publicar comentário" });
  await waitFor(() => expect(publish).toBeEnabled());
  const input = screen.getByRole("textbox", { name: "Seu comentário" });
  fireEvent.input(input, { target: { value: "   " } });
  fireEvent.click(publish);
  expect(await screen.findByRole("alert")).toHaveTextContent(/até 10.000 caracteres/);
  expect(requests.some(({ name }) => name === "app_save_lesson_comment")).toBe(false);

  failures.add("app_save_lesson_comment");
  fireEvent.input(input, { target: { value: "Minha dúvida na aula." } });
  fireEvent.click(publish);
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/permissão/));
  expect(input).toHaveValue("Minha dúvida na aula.");
  expect(screen.queryByText("Comentário enviado para moderação.")).toBeNull();
  expect(requests).toContainEqual({
    name: "app_save_lesson_comment",
    args: { p_lesson_id: lessonId, p_parent_id: null, p_body: "Minha dúvida na aula." },
  });
});

it("valida o motivo, mantém a decisão após falha e usa o modo de moderação do servidor", async () => {
  const { requests, failures } = fixture();
  render(scope(<LessonCommentModeration lessonId={lessonId} />));
  const reason = await screen.findByRole("textbox", { name: "Motivo" });
  fireEvent.change(screen.getByRole("combobox", { name: "Decisão" }), { target: { value: "reject" } });
  fireEvent.input(reason, { target: { value: " x " } });
  fireEvent.click(screen.getByRole("button", { name: "Registrar decisão" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Informe um motivo de 3 a 2.000 caracteres.");
  expect(requests.some(({ name }) => name === "app_moderate_lesson_comment")).toBe(false);
  failures.add("app_moderate_lesson_comment");
  fireEvent.input(reason, { target: { value: "O conteúdo está fora do assunto." } });
  fireEvent.click(screen.getByRole("button", { name: "Registrar decisão" }));
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/permissão/));
  expect(reason).toHaveValue("O conteúdo está fora do assunto.");
  failures.clear();
  fireEvent.click(screen.getByRole("button", { name: "Registrar decisão" }));
  expect(await screen.findByText("Comentário rejeitado.")).toBeVisible();
  expect(await screen.findByText("Nenhum comentário aguardando moderação nesta aula.")).toBeVisible();
  expect(requests).toContainEqual({
    name: "app_moderate_lesson_comment",
    args: { p_lesson_id: lessonId, p_id: review.id, p_decision: "reject", p_reason: "O conteúdo está fora do assunto." },
  });
  expect(requests).toContainEqual({ name: "app_lesson_comments", args: { p_lesson_id: lessonId, p_page: 1, p_review: true } });
});

it("exibe a negativa da consulta de revisão sem montar controles de moderação", async () => {
  fixture().rejectReview();
  render(scope(<LessonCommentModeration lessonId={lessonId} />));
  expect(await screen.findByRole("alert")).toHaveTextContent(/permissão/);
  expect(screen.queryByRole("button", { name: "Registrar decisão" })).toBeNull();
  expect(screen.queryByText(review.body)).toBeNull();
});
