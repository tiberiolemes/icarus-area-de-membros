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
import { AdminSettings, CourseEditor } from "./pages/admin";

const signature = "signature/77777777-7777-4777-8777-777777777777.png";
const globalSignature = "signature/88888888-8888-4888-8888-888888888888.png";
const publicUrl = (path: string) => `http://127.0.0.1:58521/storage/v1/object/public/icarus-brand/${path}`;
let course: Record<string, unknown>;
let defaults: Record<string, unknown>;
const saves: unknown[] = [];
const defaultSaves: unknown[] = [];

beforeEach(() => {
  profile.role = "admin";
  saves.length = 0;
  defaultSaves.length = 0;
  defaults = { signer_name: "Ana Souza", signer_title: "Coordenação pedagógica", signature_path: globalSignature };
  course = { id: "c", title: "Curso", slug: "curso", status: "draft", certificate_enabled: true, signer_name: "Pessoa Responsável", signer_title: "Coordenação", signature_url: "", signature_path: null };
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input), body = init?.body ? JSON.parse(String(init.body)) : {};
    if (url.endsWith("/app_admin_save")) saves.push(body);
    if (url.endsWith("/app_admin_certificate_defaults")) return new Response(JSON.stringify(defaults), { headers: { "Content-Type": "application/json" } });
    if (url.endsWith("/app_admin_save_certificate_defaults")) {
      defaultSaves.push(body);
      defaults = { ...defaults, signer_name: body.p_signer_name, signer_title: body.p_signer_title };
      return new Response(JSON.stringify(defaults), { headers: { "Content-Type": "application/json" } });
    }
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
  expect(await screen.findByLabelText("Escolher assinatura", { selector: "input" })).toHaveAttribute("accept", "image/png");
  expect(screen.getByRole("radio", { name: "Personalizar só este curso" })).toBeChecked();
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
  expect(screen.getByLabelText("Trocar assinatura", { selector: "input" })).toBeInTheDocument();
});

it("instrutor vê o aviso e não o envio da assinatura", async () => {
  profile.role = "instructor";
  await openCertificate();
  expect(await screen.findByText("A assinatura do certificado é enviada por um administrador.")).toBeInTheDocument();
  expect(screen.queryByLabelText("Escolher assinatura", { selector: "input" })).not.toBeInTheDocument();
});

it("curso no modelo global mostra o modelo em leitura e salva sem responsável próprio", async () => {
  course.signer_name = null;
  course.signer_title = null;
  course.signature_path = signature;
  await openCertificate();
  expect(screen.getByRole("radio", { name: "Usar o modelo global" })).toBeChecked();
  expect(await screen.findByText("Ana Souza")).toBeInTheDocument();
  expect(screen.getByText("Coordenação pedagógica")).toBeInTheDocument();
  expect(screen.getByRole("img", { name: "Assinatura do modelo" })).toHaveAttribute("src", publicUrl(globalSignature));
  expect(screen.getByRole("link", { name: "Alterar o modelo em Configurações" })).toHaveAttribute("href", "/admin/configuracoes?aba=certificado");
  expect(screen.queryByLabelText("Nome do responsável")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Trocar assinatura", { selector: "input" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Salvar configuração do certificado" }));
  await screen.findByText("Salvo com sucesso.");
  expect(saves).toEqual([expect.objectContaining({ p_data: { certificate_enabled: true, signer_name: null, signer_title: null } })]);
});

it("modelo global vazio avisa que o curso ainda não tem responsável", async () => {
  course.signer_name = null;
  course.signer_title = null;
  defaults = { signer_name: "", signer_title: "", signature_path: null };
  await openCertificate();
  expect(await screen.findByText(/O modelo global ainda não tem responsável/)).toBeInTheDocument();
});

it("personalizar só este curso parte do modelo e grava o responsável próprio", async () => {
  course.signer_name = null;
  course.signer_title = null;
  await openCertificate();
  await screen.findByText("Ana Souza");
  fireEvent.click(screen.getByRole("radio", { name: "Personalizar só este curso" }));
  expect(screen.getByLabelText("Nome do responsável")).toHaveValue("Ana Souza");
  fireEvent.change(screen.getByLabelText("Nome do responsável"), { target: { value: "Carla Dias" } });
  fireEvent.change(screen.getByLabelText("Cargo do responsável"), { target: { value: "Tutoria" } });
  expect(screen.getByLabelText("Escolher assinatura", { selector: "input" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Salvar configuração do certificado" }));
  await screen.findByText("Salvo com sucesso.");
  expect(saves).toEqual([expect.objectContaining({ p_data: { certificate_enabled: true, signer_name: "Carla Dias", signer_title: "Tutoria" } })]);
});

it("instrutor no modelo global vê o modelo sem o atalho para Configurações", async () => {
  profile.role = "instructor";
  course.signer_name = null;
  course.signer_title = null;
  await openCertificate();
  expect(await screen.findByText("Ana Souza")).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Alterar o modelo em Configurações" })).not.toBeInTheDocument();
  expect(screen.getByText(/Um administrador altera o modelo/)).toBeInTheDocument();
});

it("Configurações → Certificado salva o modelo global e mostra a assinatura do modelo", async () => {
  render(
    <QueryClientProvider client={cache}>
      <MemoryRouter initialEntries={["/admin/configuracoes?aba=certificado"]}><AdminSettings /></MemoryRouter>
    </QueryClientProvider>,
  );
  expect(screen.getByRole("heading", { level: 1, name: "Modelo de certificado" })).toBeInTheDocument();
  const name = await screen.findByLabelText("Nome do responsável");
  expect(name).toHaveValue("Ana Souza");
  expect(screen.getByRole("img", { name: "Assinatura atual" })).toHaveAttribute("src", publicUrl(globalSignature));
  expect(screen.getByLabelText("Trocar assinatura", { selector: "input" })).toHaveAttribute("accept", "image/png");
  fireEvent.change(name, { target: { value: "Bruno Lima" } });
  fireEvent.click(screen.getByRole("button", { name: "Salvar modelo" }));
  await screen.findByText("Modelo de certificado salvo.");
  expect(defaultSaves).toEqual([{ p_signer_name: "Bruno Lima", p_signer_title: "Coordenação pedagógica" }]);
});
