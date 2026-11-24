import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { LessonCta, LessonDescription, useLessonPresentation } from "./lesson-presentation";
import type { Presentation } from "./lesson-presentation";

const { rpc, useAuth } = vi.hoisted(() => ({ rpc: vi.fn(), useAuth: vi.fn() }));
vi.mock("../api", async (load) => ({ ...(await load<typeof import("../api")>()), rpc }));
vi.mock("../auth", () => ({ useAuth }));

const cta = { title: "Comunidade", body: "Converse com os colegas.", button: "Entrar", url: "https://example.test/comunidade" };
const presentation: Presentation = {
  chapters: [{ start_seconds: 270, title: "Segunda parte", duration_seconds: 25 }],
  takeaways: [{ icon: "tune", title: "Ideia central", body: "<b>Texto editorial</b>" }],
  formula: { label: "Cálculo", reference: "Métrica 09", expression: "A + B", description: "Some os valores." },
  checklist: [{ id: "etapa", label: "Aplicar à sua aula" }, { id: "outra", label: "Revisar a aplicação" }],
  cta,
};

function Harness({ lessonId }: { lessonId?: string }) {
  const editorial = useLessonPresentation(lessonId);
  return (
    <>
      <LessonDescription {...editorial} body="<p>Objetivo <strong>rico</strong></p>" />
      <LessonCta cta={editorial.presentation?.cta} />
    </>
  );
}

function mount(lessonId?: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const page = (id?: string) => (
    <QueryClientProvider client={client}><Harness lessonId={id} /></QueryClientProvider>
  );
  const view = render(page(lessonId));
  return { client, changeLesson: (id?: string) => view.rerender(page(id)) };
}

beforeEach(() => {
  rpc.mockReset();
  useAuth.mockReturnValue({ session: { user: { id: "aluno" } } });
});

it("aguarda uma aula autorizada, preserva a descrição rica e omite os detalhes quando a RPC retorna nulo", async () => {
  rpc.mockResolvedValue({ presentation: null, checked_ids: [] });
  const { changeLesson } = mount();
  expect(screen.getByText("rico").tagName).toBe("STRONG");
  expect(rpc).not.toHaveBeenCalled();
  changeLesson("aula");
  await waitFor(() => expect(rpc).toHaveBeenCalledWith("app_lesson_presentation", { p_lesson_id: "aula", p_edit: false }));
  await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Entrar" })).not.toBeInTheDocument();
});

it("mostra a falha de leitura, permite nova tentativa e preserva o corpo existente", async () => {
  rpc.mockRejectedValueOnce(new Error("Acesso negado")).mockResolvedValue({ presentation, checked_ids: [] });
  mount("aula");
  expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível carregar");
  expect(screen.getByText("rico")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
  expect(await screen.findByRole("checkbox", { name: "Aplicar à sua aula" })).toBeVisible();
});

it("usa o timestamp exato quando existe seek e mantém o índice legível sem um player pronto", () => {
  const onSeek = vi.fn();
  const { rerender } = render(<LessonDescription body="<p>Texto<script>alert(1)</script></p>" presentation={presentation} onSeek={onSeek} />);
  expect(screen.getByRole("heading", { name: "Objetivo da Aula" })).toBeVisible();
  expect(screen.getByText("<b>Texto editorial</b>")).toBeVisible();
  expect(screen.queryByText("alert(1)")).not.toBeInTheDocument();
  expect(screen.getByText("A + B").tagName).toBe("CODE");
  fireEvent.click(screen.getByRole("button", { name: /04:30 · Segunda parte/ }));
  expect(onSeek).toHaveBeenCalledWith(270);
  rerender(<LessonDescription presentation={presentation} />);
  expect(screen.getByText(/04:30 · Segunda parte/)).toBeVisible();
  expect(screen.queryByRole("button", { name: /Segunda parte/ })).not.toBeInTheDocument();
});

it("mantém o estado anterior durante a gravação e a falha e aplica o retorno confirmado pelo servidor", async () => {
  let reject!: (error: Error) => void;
  let confirm!: (value: { checked: boolean }) => void;
  rpc.mockResolvedValueOnce({ presentation, checked_ids: ["outra"] })
    .mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }))
    .mockImplementationOnce(() => new Promise((resolve) => { confirm = resolve; }))
    .mockResolvedValueOnce({ checked: false });
  mount("aula");
  const checkbox = await screen.findByRole("checkbox", { name: "Aplicar à sua aula" });
  const other = screen.getByRole("checkbox", { name: "Revisar a aplicação" });
  checkbox.focus();
  fireEvent.click(checkbox);
  fireEvent.click(other);
  await waitFor(() => expect(rpc).toHaveBeenCalledTimes(2));
  expect(rpc).toHaveBeenLastCalledWith("app_lesson_checklist_item", {
    p_lesson_id: "aula", p_item_id: "etapa", p_checked: true,
  });
  expect(checkbox).not.toBeChecked();
  expect(checkbox).toHaveFocus();
  act(() => reject(new Error("Sessão inválida")));
  expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível salvar este item");
  expect(checkbox).not.toBeChecked();
  fireEvent.click(checkbox);
  await waitFor(() => expect(rpc).toHaveBeenCalledTimes(3));
  act(() => confirm({ checked: true }));
  await waitFor(() => expect(checkbox).toBeChecked());
  expect(other).toBeChecked();
  fireEvent.click(checkbox);
  await waitFor(() => expect(checkbox).not.toBeChecked());
  expect(other).toBeChecked();
});

it.each(["outro-aluno", "aluno"])("descarta a resposta tardia ao recriar o cache com a sessão %s", async (actor) => {
  let confirm!: (value: { checked: boolean }) => void;
  rpc.mockResolvedValueOnce({ presentation, checked_ids: [] })
    .mockImplementationOnce(() => new Promise((resolve) => { confirm = resolve; }))
    .mockResolvedValueOnce({ presentation, checked_ids: [] });
  const { client, changeLesson } = mount("aula");
  fireEvent.click(await screen.findByRole("checkbox", { name: "Aplicar à sua aula" }));
  await waitFor(() => expect(rpc).toHaveBeenCalledTimes(2));
  act(() => client.clear());
  useAuth.mockReturnValue({ session: { user: { id: actor } } });
  changeLesson("aula");
  await waitFor(() => expect(rpc).toHaveBeenCalledTimes(3));
  const checkbox = await screen.findByRole("checkbox", { name: "Aplicar à sua aula" });
  await act(async () => confirm({ checked: true }));
  expect(checkbox).not.toBeChecked();
  if (actor !== "aluno")
    expect(client.getQueryData(["app_lesson_presentation", { p_lesson_id: "aula", p_edit: false }, "aluno"])).toBeUndefined();
});

it("abre apenas o destino HTTPS configurado, sem referenciador ou janela de origem", () => {
  const { rerender } = render(<LessonCta cta={cta} />);
  const link = screen.getByRole("link", { name: "Entrar" });
  expect(link).toHaveAttribute("href", cta.url);
  expect(link).toHaveAttribute("target", "_blank");
  expect(link).toHaveAttribute("rel", "noopener noreferrer");
  for (const url of ["javascript:alert(1)", "data:text/html,teste", "http://example.test", "/app/cursos", "https://user:pass@example.test"]) {
    rerender(<LessonCta cta={{ ...cta, url }} />);
    expect(screen.queryByRole("link", { name: "Entrar" })).not.toBeInTheDocument();
  }
});
