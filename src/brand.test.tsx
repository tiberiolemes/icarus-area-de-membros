import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
vi.hoisted(() => {
  vi.stubEnv("VITE_SUPABASE_URL", "http://127.0.0.1:58521");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-public-key");
});
import { BrandLogo, brandLogoUrl, logoBox } from "./brand";

const light = "logo/light-11111111-1111-4111-8111-111111111111.png";
const dark = "logo/dark-22222222-2222-4222-8222-222222222222.webp";
const fallback = <strong className="installation-name">Academia</strong>;

it("monta a URL pública só para caminhos de logo gerados pelo servidor", () => {
  expect(brandLogoUrl(light)).toBe(`http://127.0.0.1:58521/storage/v1/object/public/icarus-brand/${light}`);
  expect(brandLogoUrl(dark)).toBe(`http://127.0.0.1:58521/storage/v1/object/public/icarus-brand/${dark}`);
  for (const path of [null, undefined, "", "../icarus-private/x.png", "https://exemplo.test/logo.png", "logo/light-x.png", "logo/light-11111111-1111-4111-8111-111111111111.svg"]) {
    expect(brandLogoUrl(path)).toBeNull();
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
