import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
vi.hoisted(() => {
  vi.stubEnv("VITE_SUPABASE_URL", "http://127.0.0.1:58521");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-public-key");
});
const { profile } = vi.hoisted(() => ({ profile: { id: "admin-1", role: "admin" } }));
vi.mock("./auth", () => ({
  useBootstrap: () => ({ data: { profile, settings: {} }, isPending: false, error: null, refetch: vi.fn() }),
  useAuth: () => ({ session: { access_token: "token", user: { id: profile.id } } }),
}));
import { cache } from "./api";
import { CourseEditor } from "./pages/admin";

const signature = "signature/77777777-7777-4777-8777-777777777777.png";
let course: Record<string, unknown>;
const saves: unknown[] = [];

beforeEach(() => {
  profile.role = "admin";
  saves.length = 0;
  course = { id: "c", title: "Curso", slug: "curso", status: "draft", certificate_enabled: true, signer_name: "Pessoa Responsável", signer_title: "Coordenação", signature_url: "", signature_path: null };
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input), body = init?.body ? JSON.parse(String(init.body)) : {};
    if (url.endsWith("/app_admin_save")) saves.push(body);
    const response = url.endsWith("/app_admin_list") ? { items: body.p_entity === "courses" ? [course] : [], total: body.p_entity === "courses" ? 1 : 0, page: 1, page_size: 20 } : { id: "c" };
    return new Response(JSON.stringify(response), { headers: { "Content-Type": "application/json" } });
  }));
});
afterEach(() => {
  cleanup();
  cache.clear();
  vi.unstubAllGlobals();
});

async function openCertificate() {
  render(
    <QueryClientProvider client={cache}>
      <MemoryRouter initialEntries={["/admin/cursos/c"]}>
        <Routes><Route path="/admin/cursos/:id" element={<CourseEditor />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Certificado" }));
}

it("curso sem assinatura, mesmo com a URL antiga vazia, oferece o envio do PNG", async () => {
  await openCertificate();
  expect(await screen.findByLabelText("Escolher assinatura")).toHaveAttribute("accept", "image/png");
  expect(screen.queryByRole("img", { name: "Assinatura atual" })).not.toBeInTheDocument();
  expect(screen.queryByLabelText("URL da assinatura (opcional)")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Salvar configuração do certificado" }));
  await screen.findByText("Salvo com sucesso.");
  expect(saves).toEqual([expect.objectContaining({ p_data: { certificate_enabled: true, signer_name: "Pessoa Responsável", signer_title: "Coordenação" } })]);
});

it("curso com assinatura mostra a atual e oferece a troca", async () => {
  course.signature_path = signature;
  await openCertificate();
  expect(await screen.findByRole("img", { name: "Assinatura atual" })).toHaveAttribute("src", `http://127.0.0.1:58521/storage/v1/object/public/icarus-brand/${signature}`);
  expect(screen.getByLabelText("Trocar assinatura")).toBeInTheDocument();
});

it("instrutor vê o aviso e não o envio da assinatura", async () => {
  profile.role = "instructor";
  await openCertificate();
  expect(await screen.findByText("A assinatura do certificado é enviada por um administrador.")).toBeInTheDocument();
  expect(screen.queryByLabelText("Escolher assinatura")).not.toBeInTheDocument();
});
