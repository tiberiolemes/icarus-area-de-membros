import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { version as current } from "../package.json";
import { newer, UpdateNotice } from "./update-notice";

const official = "tiberiolemes/icarus-area-de-membros";
const day = 86_400_000;
const fetchMock = vi.fn();
const release = (tag: string) => Response.json({ tag_name: tag, html_url: `https://github.com/${official}/releases/tag/${tag}` });

function mount() {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={cache}><UpdateNotice /></QueryClientProvider>);
}

beforeEach(() => {
  localStorage.clear();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("VITE_ICARUS_UPDATE_REPO", undefined);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

it("compara versões x.y.z numericamente e ignora tags fora do formato", () => {
  expect(newer("v2.10.0", "2.9.9")).toBe(true);
  expect(newer("3.0.0", "2.99.99")).toBe(true);
  expect(newer("v2.2.1", "2.2.1")).toBe(false);
  expect(newer("v2.2.0", "2.2.1")).toBe(false);
  expect(newer("v3.0.0-rc.1", "2.2.1")).toBe(false);
  expect(newer("latest", "2.2.1")).toBe(false);
});

it("mostra a versão nova do repositório oficial com notas e roteiro de atualização", async () => {
  fetchMock.mockResolvedValue(release("v99.0.0"));
  mount();
  expect(await screen.findByText("Versão 99.0.0 disponível.")).toBeInTheDocument();
  expect(screen.getByText(`Esta instalação usa a ${current}.`, { exact: false })).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledWith(`https://api.github.com/repos/${official}/releases/latest`, expect.anything());
  expect(screen.getByRole("link", { name: "Notas da versão" })).toHaveAttribute("href", `https://github.com/${official}/releases/tag/v99.0.0`);
  expect(screen.getByRole("link", { name: "Como atualizar" })).toHaveAttribute("href", `https://github.com/${official}/blob/v99.0.0/docs/operations.md#atualizar-de-versão`);
});

it("consulta o repositório configurado e não consulta nada quando a variável está vazia", async () => {
  vi.stubEnv("VITE_ICARUS_UPDATE_REPO", "outra-org/icarus-fork");
  fetchMock.mockResolvedValue(Response.json({ tag_name: "v99.0.0", html_url: "https://github.com/outra-org/icarus-fork/releases/tag/v99.0.0" }));
  const { unmount } = mount();
  expect(await screen.findByRole("link", { name: "Como atualizar" })).toHaveAttribute("href", "https://github.com/outra-org/icarus-fork/blob/v99.0.0/docs/operations.md#atualizar-de-versão");
  unmount();
  fetchMock.mockClear();
  vi.stubEnv("VITE_ICARUS_UPDATE_REPO", "");
  const { container } = mount();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(fetchMock).not.toHaveBeenCalled();
  expect(container).toBeEmptyDOMElement();
});

it.each([
  ["a mesma versão", () => Promise.resolve(release(`v${current}`))],
  ["uma versão anterior", () => Promise.resolve(release("v0.2.0"))],
  ["sem rede", () => Promise.reject(new TypeError("Failed to fetch"))],
  ["limite de requisições", () => Promise.resolve(Response.json({ message: "API rate limit exceeded" }, { status: 403 }))],
  ["resposta inesperada", () => Promise.resolve(Response.json({ tag_name: "v99.0.0", html_url: "javascript:alert(1)" }))],
])("não mostra nada com %s", async (_, answer) => {
  fetchMock.mockImplementation(answer);
  const { container } = mount();
  await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(container).toBeEmptyDOMElement();
});

it("guarda a consulta por 24 horas no navegador", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-25T12:00:00Z"));
  fetchMock.mockResolvedValue(release("v99.0.0"));
  const first = mount();
  await screen.findByText("Versão 99.0.0 disponível.");
  first.unmount();
  vi.setSystemTime(Date.now() + day - 60_000);
  const second = mount();
  await screen.findByText("Versão 99.0.0 disponível.");
  expect(fetchMock).toHaveBeenCalledOnce();
  second.unmount();
  vi.setSystemTime(Date.now() + 120_000);
  fetchMock.mockResolvedValue(release("v99.1.0"));
  mount();
  expect(await screen.findByText("Versão 99.1.0 disponível.")).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it("dispensa o aviso daquela versão e volta a avisar na seguinte", async () => {
  fetchMock.mockResolvedValue(release("v99.0.0"));
  const first = mount();
  fireEvent.click(await screen.findByRole("button", { name: "Dispensar esta versão" }));
  expect(screen.queryByText("Versão 99.0.0 disponível.")).not.toBeInTheDocument();
  first.unmount();
  const again = mount();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(again.container).toBeEmptyDOMElement();
  again.unmount();
  localStorage.removeItem(`icarus:release:${official}`);
  fetchMock.mockResolvedValue(release("v99.1.0"));
  mount();
  expect(await screen.findByText("Versão 99.1.0 disponível.")).toBeInTheDocument();
});

it("continua funcionando quando o navegador bloqueia o armazenamento", async () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new DOMException("bloqueado", "SecurityError"); });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("bloqueado", "SecurityError"); });
  fetchMock.mockResolvedValue(release("v99.0.0"));
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Dispensar esta versão" }));
  expect(screen.queryByText("Versão 99.0.0 disponível.")).not.toBeInTheDocument();
});
