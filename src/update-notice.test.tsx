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
  return { cache, ...render(<QueryClientProvider client={cache}><main id="main" tabIndex={-1}><UpdateNotice /></main></QueryClientProvider>) };
}
const empty = () => expect(document.querySelector("main")).toBeEmptyDOMElement();
const waitRelease = (cache: QueryClient) => waitFor(() =>
  expect(cache.getQueryState(["latest-release", official])?.status).toBe("success"));

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
  mount();
  expect(fetchMock).not.toHaveBeenCalled();
  empty();
});

it.each([
  ["a mesma versão", () => Promise.resolve(release(`v${current}`))],
  ["uma versão anterior", () => Promise.resolve(release("v0.2.0"))],
  ["sem rede", () => Promise.reject(new TypeError("Failed to fetch"))],
  ["limite de requisições", () => Promise.resolve(Response.json({ message: "API rate limit exceeded" }, { status: 403 }))],
  ["resposta inesperada", () => Promise.resolve(Response.json({ tag_name: "v99.0.0", html_url: "javascript:alert(1)" }))],
])("não mostra nada com %s", async (_, answer) => {
  fetchMock.mockImplementation(answer);
  await waitRelease(mount().cache);
  expect(fetchMock).toHaveBeenCalledOnce();
  empty();
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
  expect(document.activeElement).toBe(document.querySelector("main"));
  first.unmount();
  const again = mount();
  await waitRelease(again.cache);
  empty();
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

it("guarda também a falha por 24 horas para não repetir a consulta a cada recarga", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-25T12:00:00Z"));
  fetchMock.mockResolvedValue(Response.json({ message: "API rate limit exceeded" }, { status: 403 }));
  const first = mount();
  await waitRelease(first.cache);
  expect(fetchMock).toHaveBeenCalledOnce();
  first.unmount();
  vi.setSystemTime(Date.now() + day - 60_000);
  const second = mount();
  await waitRelease(second.cache);
  expect(fetchMock).toHaveBeenCalledOnce();
  empty();
  second.unmount();
  vi.setSystemTime(Date.now() + 120_000);
  fetchMock.mockResolvedValue(release("v99.0.0"));
  mount();
  expect(await screen.findByText("Versão 99.0.0 disponível.")).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it.each([
  ["endereço fora do GitHub", { tag: "v99.0.0", url: "javascript:alert(1)", at: Date.now() }],
  ["data no futuro", { tag: "v99.0.0", url: `https://github.com/${official}/releases/tag/v99.0.0`, at: Date.now() + 10 * day }],
])("não confia em cache com %s", async (_, cached) => {
  localStorage.setItem(`icarus:release:${official}`, JSON.stringify(cached));
  fetchMock.mockResolvedValue(release("v0.2.0"));
  await waitRelease(mount().cache);
  expect(fetchMock).toHaveBeenCalledOnce();
  empty();
});

it.each([
  ["sem rede", () => Promise.reject(new TypeError("Failed to fetch"))],
  ["consulta abortada ao recarregar", () => Promise.reject(new DOMException("aborted", "AbortError"))],
])("não guarda a falha %s, que não chega ao GitHub", async (_, answer) => {
  fetchMock.mockImplementationOnce(answer);
  const first = mount();
  await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
  first.unmount();
  fetchMock.mockResolvedValue(release("v99.0.0"));
  mount();
  expect(await screen.findByText("Versão 99.0.0 disponível.")).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
