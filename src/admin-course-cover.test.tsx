import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.hoisted(() => {
  vi.stubEnv("VITE_SUPABASE_URL", "http://127.0.0.1:58521");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-public-key");
});

import { cache } from "./api";
import { CourseEditor } from "./pages/admin";

type Course = Record<string, unknown>;
let course: Course, saves: Record<string, unknown>[], mediaCalls: number, refuse: boolean, hold: Promise<void> | undefined;

beforeEach(() => {
  course = { id: "c", title: "Curso editorial", slug: "editorial", status: "draft", access_mode: "members",
    certificate_enabled: false, cover_url: "course-cover/c/primeira.jpg", cover_focus: "20% 70%" };
  saves = [];
  mediaCalls = 0;
  refuse = false;
  hold = undefined;
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input), body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
    if (url.endsWith("/functions/v1/media")) {
      mediaCalls += 1;
      return Response.json({ url: `https://media.example.test/${String(course.cover_url).split("/").pop()}`, expires_at: "2030-01-01", focus: course.cover_focus });
    }
    if (url.endsWith("/app_admin_course_cover_focus")) {
      if (refuse) return Response.json({ message: "Restaure o curso antes de mudar o foco da capa.", code: "P0001" }, { status: 400 });
      await hold;
      saves.push(body);
      course = { ...course, cover_focus: body.p_focus };
      return Response.json({ id: body.p_id, cover_focus: body.p_focus });
    }
    const items = url.endsWith("/app_admin_list") && body.p_entity === "courses" ? [course] : [];
    return Response.json({ items, total: items.length, page: 1, page_size: 20 });
  }));
});

afterEach(() => {
  cleanup();
  cache.clear();
  vi.unstubAllGlobals();
});

function show() {
  render(
    <QueryClientProvider client={cache}>
      <MemoryRouter initialEntries={["/admin/cursos/c"]}>
        <Routes><Route path="/admin/cursos/:id" element={<CourseEditor />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
const preview = (caption: string) => screen.getByText(caption).closest("figure")!.querySelector("img")!;
const previews = () => ["Lista de cursos e aula", "Página do curso", "Página do curso no tablet"].map(preview);
const leaving = () => {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
};

it("sem capa, o cartão orienta a enviar a imagem e não oferece ajuste", async () => {
  course = { ...course, cover_url: null, cover_focus: "50% 50%" };
  show();
  expect(await screen.findByText("Envie uma imagem para ver a prévia e ajustar o foco do corte.")).toBeInTheDocument();
  expect(screen.queryByLabelText("Foco horizontal")).not.toBeInTheDocument();
  expect(mediaCalls).toBe(0);
});

it("com capa, mostra as três prévias e os controles no foco já salvo", async () => {
  show();
  expect(await screen.findByLabelText("Foco horizontal")).toHaveValue("20");
  expect(screen.getByLabelText("Foco vertical")).toHaveValue("70");
  for (const image of previews()) {
    expect(image).toHaveAttribute("src", "https://media.example.test/primeira.jpg");
    expect(image).toHaveStyle({ objectPosition: "20% 70%" });
  }
  expect(screen.getByRole("img", { name: "Capa completa do curso" })).toHaveAttribute("src", "https://media.example.test/primeira.jpg");
  expect(screen.getByRole("button", { name: "Salvar foco" })).toBeDisabled();
  expect(leaving()).toBe(false);
});

it("mover os controles muda as prévias na hora, e salvar grava o foco no curso", async () => {
  show();
  fireEvent.change(await screen.findByLabelText("Foco horizontal"), { target: { value: "5" } });
  fireEvent.change(screen.getByLabelText("Foco vertical"), { target: { value: "100" } });
  for (const image of previews()) expect(image).toHaveStyle({ objectPosition: "5% 100%" });
  expect(saves).toEqual([]);
  await waitFor(() => expect(leaving()).toBe(true));
  fireEvent.click(screen.getByRole("button", { name: "Salvar foco" }));
  expect(await screen.findByText("Foco salvo.")).toBeInTheDocument();
  expect(saves).toEqual([{ p_id: "c", p_focus: "5% 100%" }]);
  expect(screen.getByRole("button", { name: "Salvar foco" })).toBeDisabled();
  await waitFor(() => expect(leaving()).toBe(false));
});

it("clicar na imagem leva o foco para o ponto clicado", async () => {
  show();
  const picker = (await screen.findByRole("img", { name: "Capa completa do curso" })).parentElement!;
  picker.getBoundingClientRect = () => ({ left: 100, top: 50, width: 400, height: 200, right: 500, bottom: 250, x: 100, y: 50, toJSON: () => ({}) });
  fireEvent.click(picker, { clientX: 200, clientY: 210 });
  expect(screen.getByLabelText("Foco horizontal")).toHaveValue("25");
  expect(screen.getByLabelText("Foco vertical")).toHaveValue("80");
  for (const image of previews()) expect(image).toHaveStyle({ objectPosition: "25% 80%" });
  // Um clique na borda não passa dos limites da imagem.
  fireEvent.click(picker, { clientX: 520, clientY: 40 });
  expect(screen.getByLabelText("Foco horizontal")).toHaveValue("100");
  expect(screen.getByLabelText("Foco vertical")).toHaveValue("0");
});

it("se o servidor recusar, mostra o motivo e mantém o ajuste para nova tentativa", async () => {
  refuse = true;
  show();
  fireEvent.change(await screen.findByLabelText("Foco horizontal"), { target: { value: "90" } });
  fireEvent.click(screen.getByRole("button", { name: "Salvar foco" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Restaure o curso antes de mudar o foco da capa.");
  expect(screen.getByLabelText("Foco horizontal")).toHaveValue("90");
  expect(screen.getByRole("button", { name: "Salvar foco" })).toBeEnabled();
  expect(screen.queryByText("Foco salvo.")).not.toBeInTheDocument();
});

it("depois de trocar a capa, a prévia busca a imagem nova", async () => {
  show();
  await screen.findByLabelText("Foco horizontal");
  expect(mediaCalls).toBe(1);
  course = { ...course, cover_url: "course-cover/c/segunda.jpg" };
  // O envio da capa só recarrega a lista de cursos. Quem busca a imagem nova é a prévia.
  cache.invalidateQueries({ queryKey: ["app_admin_list"] });
  await waitFor(() => expect(preview("Página do curso")).toHaveAttribute("src", "https://media.example.test/segunda.jpg"));
});

it("um clique na imagem durante o salvamento não troca o foco que está sendo gravado", async () => {
  let release!: () => void;
  hold = new Promise((resolve) => { release = resolve; });
  show();
  fireEvent.change(await screen.findByLabelText("Foco horizontal"), { target: { value: "5" } });
  fireEvent.click(screen.getByRole("button", { name: "Salvar foco" }));
  const picker = screen.getByRole("img", { name: "Capa completa do curso" }).parentElement!;
  picker.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 200, right: 400, bottom: 200, x: 0, y: 0, toJSON: () => ({}) });
  fireEvent.click(picker, { clientX: 360, clientY: 20 });
  expect(screen.getByLabelText("Foco horizontal")).toHaveValue("5");
  release();
  expect(await screen.findByText("Foco salvo.")).toBeInTheDocument();
  expect(saves).toEqual([{ p_id: "c", p_focus: "5% 70%" }]);
  expect(screen.getByRole("button", { name: "Salvar foco" })).toBeDisabled();
});

it("um clique antes de a imagem ter tamanho não muda o foco", async () => {
  show();
  const picker = (await screen.findByRole("img", { name: "Capa completa do curso" })).parentElement!;
  fireEvent.click(picker, { clientX: 10, clientY: 10 });
  expect(screen.getByLabelText("Foco horizontal")).toHaveValue("20");
  expect(screen.getByLabelText("Foco vertical")).toHaveValue("70");
});

it("quando o endereço temporário da imagem vence, a prévia busca outro uma vez", async () => {
  show();
  const image = await screen.findByRole("img", { name: "Capa completa do curso" });
  expect(mediaCalls).toBe(1);
  fireEvent.error(image);
  await waitFor(() => expect(mediaCalls).toBe(2));
  fireEvent.error(screen.getByRole("img", { name: "Capa completa do curso" }));
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(mediaCalls).toBe(2);
});
