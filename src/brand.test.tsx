import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
vi.hoisted(() => {
  vi.stubEnv("VITE_SUPABASE_URL", "http://127.0.0.1:58521");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-public-key");
});
import { render as renderNode, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createContext, memo } from "react";
const { SessionContext } = vi.hoisted(() => ({ SessionContext: { current: null as unknown } }));
vi.mock("./auth", async () => {
  const React = await import("react");
  const context = createContextForTest(React);
  SessionContext.current = context;
  return { useAuth: () => React.useContext(context) };
});
function createContextForTest(React: typeof import("react")) {
  return React.createContext<{ session: { user: { id: string } } | null }>({ session: null });
}
import { BrandLogo, brandAssetUrl, defaultIcon, defaultTouchIcon, InstallationIcon, logoBox } from "./brand";

const light = "logo/light-11111111-1111-4111-8111-111111111111.png";
const dark = "logo/dark-22222222-2222-4222-8222-222222222222.webp";
const fallback = <strong className="installation-name">Academia</strong>;

it("monta a URL pública só para caminhos de marca gerados pelo servidor", () => {
  for (const path of ["icon/33333333-3333-4333-8333-333333333333.png", "signature/44444444-4444-4444-8444-444444444444.png"]) {
    expect(brandAssetUrl(path)).toBe(`http://127.0.0.1:58521/storage/v1/object/public/icarus-brand/${path}`);
  }
  for (const path of ["icon/33333333-3333-4333-8333-333333333333.webp", "signature/x.png", "avatar/33333333-3333-4333-8333-333333333333.png"]) {
    expect(brandAssetUrl(path)).toBeNull();
  }
  expect(brandAssetUrl(light)).toBe(`http://127.0.0.1:58521/storage/v1/object/public/icarus-brand/${light}`);
  expect(brandAssetUrl(dark)).toBe(`http://127.0.0.1:58521/storage/v1/object/public/icarus-brand/${dark}`);
  for (const path of [null, undefined, "", "../icarus-private/x.png", "https://exemplo.test/logo.png", "logo/light-x.png", "logo/light-11111111-1111-4111-8111-111111111111.svg"]) {
    expect(brandAssetUrl(path)).toBeNull();
  }
});

it("sem logo própria mostra o padrão", () => {
  render(<BrandLogo light={null} dark={null} name="Academia" fallback={fallback} />);
  expect(screen.getByText("Academia")).toBeInTheDocument();
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
});

it("só com a colorida usa a mesma imagem nos dois temas", () => {
  render(<BrandLogo light="/a.png" dark={null} name="Academia" fallback={fallback} />);
  const logo = screen.getByRole("img", { name: "Academia" });
  expect(logo).toHaveAttribute("src", "/a.png");
  expect(logo).toHaveClass("brand-custom");
  expect(logo).not.toHaveAttribute("data-brand-tone");
  expect(screen.queryByText("Academia")).not.toBeInTheDocument();
});

it("com as duas, cada imagem fica marcada com o tema em que aparece", () => {
  render(<BrandLogo light="/a.png" dark="/b.png" name="Academia" fallback={fallback} />);
  const [first, second] = screen.getAllByRole("img", { name: "Academia" });
  expect(first).toHaveAttribute("data-brand-tone", "light");
  expect(first).toHaveAttribute("src", "/a.png");
  expect(second).toHaveAttribute("data-brand-tone", "dark");
  expect(second).toHaveAttribute("src", "/b.png");
});

it("só com a branca, o tema claro volta ao padrão", () => {
  render(<BrandLogo light={null} dark="/b.png" name="Academia" fallback={fallback} />);
  expect(screen.getByText("Academia")).toHaveAttribute("data-brand-tone", "light");
  expect(screen.getByRole("img", { name: "Academia" })).toHaveAttribute("data-brand-tone", "dark");
});

it("encaixa a logo na área do certificado sem distorcer", () => {
  expect(logoBox(960, 240)).toEqual({ x: 100, y: 96, width: 305, height: 76.25 });
  expect(logoBox(240, 240)).toEqual({ x: 100, y: 96, width: 80, height: 80 });
  expect(logoBox(4096, 60)).toEqual({ x: 100, y: 96, width: 305, height: 305 * 60 / 4096 });
});

it("aplica o favicon da instalação nas abas e volta ao padrão do Icarus sem ele", async () => {
  document.head.innerHTML = `<link rel="icon" href="${defaultIcon}" type="image/svg+xml"><link rel="apple-touch-icon" href="${defaultTouchIcon}">`;
  const icon = "icon/33333333-3333-4333-8333-333333333333.png";
  let context: Record<string, unknown> = { name: "Academia", icon };
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(context), { headers: { "content-type": "application/json" } })));
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = renderNode(<QueryClientProvider client={cache}><InstallationIcon /></QueryClientProvider>);
  const link = (rel: string) => document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`)!;
  await waitFor(() => expect(link("icon").getAttribute("href")).toBe(`http://127.0.0.1:58521/storage/v1/object/public/icarus-brand/${icon}`));
  expect(link("icon").type).toBe("image/png");
  expect(link("apple-touch-icon").getAttribute("href")).toBe(link("icon").getAttribute("href"));
  context = { name: "Academia", icon: null };
  await cache.invalidateQueries();
  await waitFor(() => expect(link("icon").getAttribute("href")).toBe(defaultIcon));
  expect(link("icon").type).toBe("image/svg+xml");
  expect(link("apple-touch-icon").getAttribute("href")).toBe(defaultTouchIcon);
  view.unmount();
  vi.unstubAllGlobals();
});

it("depois do login, que limpa o cache, o favicon refaz a leitura com a nova sessão", async () => {
  await import("./auth");
  document.head.innerHTML = `<link rel="icon" href="${defaultIcon}" type="image/svg+xml"><link rel="apple-touch-icon" href="${defaultTouchIcon}">`;
  const first = "icon/33333333-3333-4333-8333-333333333333.png", second = "icon/66666666-6666-4666-8666-666666666666.png";
  let icon = first;
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ name: "Academia", icon }), { headers: { "content-type": "application/json" } })));
  const Session = SessionContext.current as ReturnType<typeof createContext<{ session: { user: { id: string } } | null }>>;
  const Icon = memo(InstallationIcon);
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree = (id: string | null) => <QueryClientProvider client={cache}><Session.Provider value={{ session: id ? { user: { id } } : null }}><Icon /></Session.Provider></QueryClientProvider>;
  const href = () => document.head.querySelector<HTMLLinkElement>('link[rel="icon"]')!.getAttribute("href");
  const view = renderNode(tree(null));
  await waitFor(() => expect(href()).toMatch(new RegExp(`${first}$`)));
  icon = second;
  cache.clear();
  view.rerender(tree("admin-1"));
  await waitFor(() => expect(href()).toMatch(new RegExp(`${second}$`)));
  view.unmount();
  vi.unstubAllGlobals();
});
