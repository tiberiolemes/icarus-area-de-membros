import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { cache } from "./api";
import type { Certificate } from "./api";
import { CertificatePage, Certificates } from "./pages/certificates";
import { Materials } from "./pages/materials";

vi.hoisted(() => {
  vi.stubEnv("VITE_SUPABASE_URL", "http://127.0.0.1:58521");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-public-key");
});

const validCode = "ab".repeat(24);
const revokedCode = "cd".repeat(24);
const certificate = {
  id: "certificate", code: validCode, student_name: "Aluna de teste",
  course_title: "Curso de teste", duration_minutes: 90, issued_at: "2026-11-24T13:00:00Z",
  revoked_at: null, demo: false,
} satisfies Certificate;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function mount(path: string) {
  render(
    <QueryClientProvider client={cache}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/verificar/:codigo?" element={<CertificatePage verify />} />
          <Route path="/certificado/:codigo" element={<CertificatePage />} />
          <Route path="/app/certificados" element={<Certificates />} />
          <Route path="/app/materiais/:pasta?" element={<Materials />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  cache.clear();
  vi.unstubAllGlobals();
});


function mockCertificateFetch(request: (url: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  vi.stubGlobal("fetch", (url: RequestInfo | URL, init?: RequestInit) =>
    String(url).endsWith("/app_public_context") ? Promise.resolve(json({ name: "Icarus" })) : request(url, init)
  );
}

it("consulta somente após um código válido e remove a exportação de um certificado revogado", async () => {
  const fetch = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
    const { p_code } = JSON.parse(String(init?.body));
    if (p_code === validCode) return json(certificate);
    if (p_code === revokedCode)
      return json({ ...certificate, code: revokedCode, revoked_at: "2026-11-24T14:00:00Z" });
    return json({ code: "P0001", message: "Certificado indisponível." }, 400);
  });
  mockCertificateFetch(fetch);
  mount("/verificar");
  const input = screen.getByRole("textbox", { name: "Código de verificação" });
  const submit = () => fireEvent.click(screen.getByRole("button", { name: "Verificar certificado" }));
  fireEvent.change(input, { target: { value: "código inválido" } });
  submit();
  expect(await screen.findByRole("alert")).toHaveTextContent("48 caracteres");
  expect(input).toHaveValue("código inválido");
  expect(fetch).not.toHaveBeenCalled();

  fireEvent.change(input, { target: { value: validCode.toUpperCase() } });
  submit();
  await waitFor(() => expect(screen.getByRole("status", { name: "Situação do certificado" })).toHaveTextContent("Certificado válido"));
  expect(screen.getByRole("status", { name: "Situação do certificado" }).parentElement).toHaveFocus();
  expect(screen.getByRole("button", { name: "Baixar PDF" })).toBeInTheDocument();

  fireEvent.change(input, { target: { value: revokedCode } });
  submit();
  await waitFor(() => expect(screen.getByRole("status", { name: "Situação do certificado" })).toHaveTextContent("Certificado revogado"));
  expect(screen.queryByRole("button", { name: "Baixar PDF" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Baixar PNG" })).not.toBeInTheDocument();

  fireEvent.change(input, { target: { value: "ef".repeat(24) } });
  submit();
  expect(await screen.findByRole("alert")).toHaveTextContent("Certificado inválido");
  expect(screen.getByRole("alert").parentElement).toHaveFocus();
  expect(screen.queryByText("Aluna de teste")).not.toBeInTheDocument();
});

it("lida com código malformado no endereço sem consultar o certificado", async () => {
  const request = vi.fn();
  mockCertificateFetch(request);
  mount("/verificar/codigo-malformado");
  expect(await screen.findByRole("alert")).toHaveTextContent("Certificado inválido");
  expect(screen.getByRole("textbox", { name: "Código de verificação" })).toBeInTheDocument();
  expect(request).not.toHaveBeenCalled();
});

it("o documento do certificado usa a logo da instalação nos dois temas", async () => {
  const light = "logo/light-11111111-1111-4111-8111-111111111111.png", dark = "logo/dark-22222222-2222-4222-8222-222222222222.png";
  vi.stubGlobal("fetch", async (url: RequestInfo | URL) =>
    String(url).endsWith("/app_public_context") ? json({ name: "Academia de teste", logo_light: light, logo_dark: dark }) : json(certificate));
  mount("/verificar/" + validCode);
  await waitFor(() => expect(document.querySelectorAll('[data-tour="certificate"] img.brand-custom')).toHaveLength(2));
  const paper = document.querySelector('[data-tour="certificate"]')!;
  const [first, second] = paper.querySelectorAll("img.brand-custom");
  expect(first).toHaveAttribute("src", expect.stringMatching(new RegExp(`/icarus-brand/${light}$`)));
  expect(second).toHaveAttribute("data-brand-tone", "dark");
  expect(paper.querySelector('img[alt="Icarus"]')).toBeNull();
});

it("o certificado mostra a assinatura da emissão e o nome da instalação como emissor", async () => {
  const signature = "signature/55555555-5555-4555-8555-555555555555.png";
  vi.stubGlobal("fetch", async (url: RequestInfo | URL) =>
    String(url).endsWith("/app_public_context") ? json({ name: "Academia de teste" }) : json({ ...certificate, signer_name: "Pessoa Responsável", signature_path: signature }));
  mount("/verificar/" + validCode);
  const image = await screen.findByRole("img", { name: "Assinatura de Pessoa Responsável" });
  expect(image).toHaveAttribute("src", `http://127.0.0.1:58521/storage/v1/object/public/icarus-brand/${signature}`);
  await waitFor(() => expect(screen.getByText("Emitido por").nextElementSibling).toHaveTextContent("Academia de teste"));
});

it("a verificação pública não carrega a URL externa de assinatura de certificados antigos", async () => {
  vi.stubGlobal("fetch", async (url: RequestInfo | URL) =>
    String(url).endsWith("/app_public_context") ? json({ name: "Icarus" }) : json({ ...certificate, signer_name: "Pessoa Responsável", signature_url: "https://externo.example/rubrica.png" }));
  mount("/verificar/" + validCode);
  expect(await screen.findByText("Pessoa Responsável")).toBeInTheDocument();
  expect(screen.queryByRole("img", { name: "Assinatura de Pessoa Responsável" })).not.toBeInTheDocument();
});

it("revalida o código atual e distingue falha de consulta de revogação", async () => {
  const request = vi.fn()
    .mockImplementationOnce(async () => json(certificate))
    .mockImplementationOnce(async () => json({ code: "PGRST000", message: "Serviço temporariamente indisponível." }, 503))
    .mockImplementationOnce(async () => json({ ...certificate, revoked_at: "2026-11-24T14:00:00Z" }));
  mockCertificateFetch(request);
  mount("/verificar/" + validCode);
  await waitFor(() => expect(screen.getByRole("status", { name: "Situação do certificado" })).toHaveTextContent("Certificado válido"));

  fireEvent.change(screen.getByRole("textbox", { name: "Código de verificação" }), { target: { value: validCode } });
  fireEvent.click(screen.getByRole("button", { name: "Verificar certificado" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("O servidor não respondeu agora");
  expect(screen.queryByRole("button", { name: "Baixar PDF" })).not.toBeInTheDocument();
  expect(screen.queryByText("Certificado inválido")).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
  await waitFor(() => expect(screen.getByRole("status", { name: "Situação do certificado" })).toHaveTextContent("Certificado revogado"));
  expect(screen.getByRole("link", { name: "Ver documento" })).toHaveAttribute("href", "/certificado/" + validCode);
  expect(screen.queryByRole("button", { name: "Baixar PDF" })).not.toBeInTheDocument();
  expect(request).toHaveBeenCalledTimes(3);
});

it("só apresenta o certificado emitido após confirmação e atualização no servidor", async () => {
  let issued = false;
  const fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    if (String(url).endsWith("/app_issue_certificate")) {
      expect(JSON.parse(String(init?.body))).toEqual({ p_course_id: "course" });
      issued = true;
      return json({ certificate_code: validCode });
    }
    return json({
      items: issued ? [certificate] : [],
      courses: issued ? [] : [{
        id: "course", slug: "curso", title: "Curso elegível", can_issue: true,
        progress_percent: 100, required_lessons: 2, completed_lessons: 2,
      }],
    });
  });
  vi.stubGlobal("fetch", fetch);
  mount("/app/certificados");
  expect(screen.queryByText("Certificados emitidos")).not.toBeInTheDocument();
  fireEvent.click(await screen.findByRole("button", { name: "Emitir certificado" }));
  expect(await screen.findByText(certificate.student_name)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Verificar autenticidade" })).toHaveAttribute("href", "/verificar/" + validCode);
});

it("navega por pasta, pesquisa no servidor e só solicita mídia do arquivo liberado", async () => {
  const requests: unknown[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const args = JSON.parse(String(init?.body));
    requests.push(args);
    if (String(url).endsWith("/media")) return json({ message: "Acesso expirado." }, 403);
    return json({
      folders: args.p_folder_id ? [] : [{ id: "pasta", name: "Planilhas" }],
      total: args.p_folder_id ? 2 : 0, page: 1, page_size: 20,
      items: args.p_folder_id ? [
        { id: "allowed", name: "Planilha aberta", file_type: "XLSX", size_bytes: 2048, can_access: true },
        { id: "denied", name: "Planilha restrita", file_type: "XLSX", size_bytes: 2048, can_access: false },
      ] : [],
    });
  }));
  mount("/app/materiais");
  fireEvent.click(await screen.findByRole("button", { name: "Apenas arquivos da seção" }));
  expect(screen.queryByRole("link", { name: /Planilhas/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Pastas e arquivos" }));
  fireEvent.click(screen.getByRole("link", { name: /Planilhas/ }));
  await screen.findByText("Planilha aberta");
  const toolbarSearch = screen.getByRole("search", { name: "Buscar arquivos" });
  const search = screen.getByRole("searchbox", { name: "Buscar arquivos" });
  expect(toolbarSearch).toContainElement(search);
  fireEvent.change(search, { target: { value: "  planilha  " } });
  fireEvent.click(screen.getByRole("button", { name: "Buscar arquivos" }));
  await waitFor(() => expect(requests).toContainEqual({ p_folder_id: "pasta", p_query: "planilha", p_page: 1 }));
  expect(await screen.findByRole("link", { name: "Consultar acesso" })).toHaveAttribute("href", "/app/configuracoes?aba=assinatura");
  expect(screen.getAllByRole("button", { name: "Baixar" })).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Baixar" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Acesso expirado");
  expect(requests.at(-1)).toEqual({ kind: "material", id: "allowed" });
});
