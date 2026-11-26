import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
vi.hoisted(() => {
  vi.stubEnv("VITE_SUPABASE_URL", "http://127.0.0.1:58521");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-public-key");
});
const { settings, edge } = vi.hoisted(() => ({
  settings: { name: "Icarus", name_revision: 0, logo_light: null as string | null, logo_dark: null as string | null, icon: null as string | null },
  edge: vi.fn(),
}));
vi.mock("./api", async (importOriginal) => ({ ...await importOriginal<typeof import("./api")>(), edge }));
vi.mock("./auth", () => ({
  useBootstrap: () => ({ data: { profile: { id: "admin-1", role: "admin" }, settings }, isPending: false, error: null, refetch: vi.fn() }),
  useAuth: () => ({ session: { access_token: "token", user: { id: "admin-1" } } }),
}));
import { cache } from "./api";
import { AdminBrand, AssetCard } from "./pages/admin-brand";

const dark = "logo/dark-22222222-2222-4222-8222-222222222222.png";
const pngBytes = (size = 64) => {
  const bytes = new Uint8Array(size);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
  return bytes;
};
let size = { width: 960, height: 240 };

beforeEach(() => {
  settings.logo_light = null;
  settings.logo_dark = null;
  settings.icon = null;
  size = { width: 960, height: 240 };
  edge.mockReset();
  edge.mockResolvedValue({ logo_light: null, logo_dark: null });
  Blob.prototype.arrayBuffer ??= function (this: Blob) {
    return new Promise<ArrayBuffer>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.readAsArrayBuffer(this);
    });
  };
  URL.createObjectURL = vi.fn(() => "blob:previa");
  URL.revokeObjectURL = vi.fn();
  vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ ...size, close: vi.fn() })));
});

function mount() {
  return render(
    <QueryClientProvider client={cache}>
      <MemoryRouter><AdminBrand /></MemoryRouter>
    </QueryClientProvider>,
  );
}
const choose = (label: string, file: File) => fireEvent.change(screen.getByLabelText(label), { target: { files: [file] } });

it("mostra formatos, tamanho e dimensões e recusa arquivos inválidos sem chamar o servidor", async () => {
  mount();
  const input = screen.getByLabelText("Escolher logo colorida");
  expect(input).toHaveAttribute("accept", "image/png,image/webp,image/svg+xml");
  expect(screen.getAllByText("SVG, PNG ou WebP, até 500 KB. PNG e WebP precisam de pelo menos 240 × 60 px. Prefira fundo transparente.")).toHaveLength(2);
  const jpeg = new Uint8Array(64); jpeg.set([255, 216, 255, 224]);
  for (const [file, message, dimensions] of [
    [new File([pngBytes(512001)], "grande.png", { type: "image/png" }), "A logo precisa ter até 500 KB.", size],
    [new File(["<svg/>"], "logo.xml", { type: "application/xml" }), "A logo precisa ser PNG, WebP ou SVG.", size],
    [new File([jpeg], "foto.png", { type: "image/png" }), "O conteúdo do arquivo não é um PNG ou WebP válido.", size],
    [new File([pngBytes()], "pequena.png", { type: "image/png" }), "A logo precisa ter pelo menos 240 × 60 px e no máximo 4096 px de cada lado.", { width: 239, height: 60 }],
    [new File([pngBytes()], "enorme.png", { type: "image/png" }), "A logo precisa ter pelo menos 240 × 60 px e no máximo 4096 px de cada lado.", { width: 4097, height: 300 }],
  ] as const) {
    size = dimensions;
    choose("Escolher logo colorida", file);
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(input).toHaveValue("");
    expect(screen.getByRole("button", { name: "Salvar logo colorida" })).toBeDisabled();
  }
  expect(edge).not.toHaveBeenCalled();
});

it("mostra a prévia nos dois temas antes de salvar e salva a colorida por AJAX", async () => {
  const invalidate = vi.spyOn(cache, "invalidateQueries");
  const file = new File([pngBytes()], "marca.png", { type: "image/png" });
  mount();
  choose("Escolher logo colorida", file);
  const preview = screen.getByRole("region", { name: "Prévia da identidade" });
  await waitFor(() => expect(within(preview).getAllByRole("img", { name: "Icarus" }).filter((img) => img.getAttribute("src") === "blob:previa")).toHaveLength(13));
  expect(edge).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Salvar logo colorida" }));
  expect(await screen.findByText("Logo colorida salva.")).toBeInTheDocument();
  const [name, body] = edge.mock.calls[0] as [string, FormData];
  expect(name).toBe("upload");
  expect([body.get("kind"), body.get("variant"), body.get("file"), body.get("course_id")]).toEqual(["brand-asset", "light", file, null]);
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ["bootstrap"] });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ["app_public_context"] });
});

it("cancelar descarta a prévia sem enviar", async () => {
  mount();
  choose("Escolher logo branca", new File([pngBytes()], "branca.png", { type: "image/png" }));
  fireEvent.click(await screen.findByRole("button", { name: "Cancelar" }));
  expect(screen.getByRole("button", { name: "Salvar logo branca" })).toBeDisabled();
  expect(screen.getByLabelText("Escolher logo branca")).toHaveValue("");
  expect(edge).not.toHaveBeenCalled();
});

it("remove a logo branca só depois da confirmação", async () => {
  settings.logo_dark = dark;
  const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
  mount();
  expect(screen.getByLabelText("Trocar logo branca")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Remover logo branca" }));
  expect(edge).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Remover logo branca" }));
  expect(await screen.findByText("Logo branca removida.")).toBeInTheDocument();
  expect(confirm).toHaveBeenLastCalledWith("Remover a logo branca? O tema escuro passa a usar a logo colorida, se houver.");
  expect(edge).toHaveBeenCalledWith("upload", { action: "brand-asset-remove", variant: "dark" });
});

it("avisa quando só a logo branca está cadastrada", () => {
  settings.logo_dark = dark;
  mount();
  expect(screen.getByText("Envie também a logo colorida. Sem ela, o tema claro, as telas de entrada e o certificado não mostram a sua logo.")).toBeInTheDocument();
});

it("uma validação atrasada não reabre a prévia de um arquivo trocado", async () => {
  let finish!: (bitmap: { width: number; height: number; close: () => void }) => void;
  vi.mocked(createImageBitmap).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve as typeof finish; }) as never);
  mount();
  choose("Escolher logo colorida", new File([pngBytes()], "lenta.png", { type: "image/png" }));
  await waitFor(() => expect(createImageBitmap).toHaveBeenCalledTimes(1));
  choose("Escolher logo colorida", new File(["<svg/>"], "logo.xml", { type: "application/xml" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("A logo precisa ser PNG, WebP ou SVG.");
  finish({ width: 960, height: 240, close: vi.fn() });
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(screen.queryByRole("img", { name: "Prévia da logo colorida" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Salvar logo colorida" })).toBeDisabled();
  expect(screen.getByRole("alert")).toHaveTextContent("A logo precisa ser PNG, WebP ou SVG.");
});

it("o ícone recusa WebP e exige PNG quadrado ou SVG", async () => {
  mount();
  const input = screen.getByLabelText("Escolher ícone");
  expect(input).toHaveAttribute("accept", "image/png,image/svg+xml");
  expect(screen.getByText("SVG ou PNG quadrado, até 500 KB. PNG precisa de pelo menos 180 × 180 px.")).toBeInTheDocument();
  choose("Escolher ícone", new File([new Uint8Array(64)], "icone.webp", { type: "image/webp" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("O ícone precisa ser PNG ou SVG.");
  size = { width: 512, height: 500 };
  choose("Escolher ícone", new File([pngBytes()], "icone.png", { type: "image/png" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("O ícone precisa ser quadrado, com pelo menos 180 × 180 px e no máximo 4096 px.");
  size = { width: 512, height: 512 };
  const file = new File([pngBytes()], "icone.png", { type: "image/png" });
  choose("Escolher ícone", file);
  await screen.findByRole("img", { name: "Prévia do ícone" });
  fireEvent.click(screen.getByRole("button", { name: "Salvar ícone" }));
  expect(await screen.findByText("Ícone salvo.")).toBeInTheDocument();
  const [, body] = edge.mock.calls[0] as [string, FormData];
  expect([body.get("kind"), body.get("variant"), body.get("file")]).toEqual(["brand-asset", "icon", file]);
});

it("a assinatura do certificado vai com o curso e remove pela mesma Edge", async () => {
  const onChanged = vi.fn();
  const view = render(<QueryClientProvider client={cache}><AssetCard variant="signature" courseId="curso-1" saved={null} onChanged={onChanged} /></QueryClientProvider>);
  expect(screen.getByText("PNG com fundo transparente, até 500 KB. Mínimo de 200 × 60 px e máximo de 2000 px de cada lado; recomendado 600 × 200 px.")).toBeInTheDocument();
  size = { width: 2400, height: 300 };
  choose("Escolher assinatura", new File([pngBytes()], "assinatura.png", { type: "image/png" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("A assinatura precisa ter pelo menos 200 × 60 px e no máximo 2000 px de cada lado.");
  size = { width: 600, height: 200 };
  const file = new File([pngBytes()], "assinatura.png", { type: "image/png" });
  choose("Escolher assinatura", file);
  await screen.findByRole("img", { name: "Prévia da assinatura" });
  fireEvent.click(screen.getByRole("button", { name: "Salvar assinatura" }));
  expect(await screen.findByText("Assinatura salva.")).toBeInTheDocument();
  const [, body] = edge.mock.calls[0] as [string, FormData];
  expect([body.get("kind"), body.get("variant"), body.get("course_id"), body.get("file")]).toEqual(["brand-asset", "signature", "curso-1", file]);
  expect(onChanged).toHaveBeenCalled();
  view.rerender(<QueryClientProvider client={cache}><AssetCard variant="signature" courseId="curso-1" saved="https://exemplo.test/a.png" onChanged={onChanged} /></QueryClientProvider>);
  vi.spyOn(window, "confirm").mockReturnValueOnce(true);
  fireEvent.click(screen.getByRole("button", { name: "Remover assinatura" }));
  expect(await screen.findByText("Assinatura removida.")).toBeInTheDocument();
  expect(edge).toHaveBeenLastCalledWith("upload", { action: "brand-asset-remove", variant: "signature", course_id: "curso-1" });
});

it("mostra apenas a prévia PNG do SVG sanitizado e salva o arquivo original", async () => {
  const original = new File(['<svg viewBox="0 0 100 100" onload="alert(1)"><rect width="90" height="90"/></svg>'], "logo.svg", { type: "image/svg+xml" });
  const clean = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 90 90"><rect width="90" height="90"/></svg>';
  const decode = vi.fn(async () => {});
  const image = Object.assign(document.createElement("img"), { decode });
  const drawImage = vi.fn();
  const frame = new Blob([pngBytes()], { type: "image/png" });
  const Image = vi.spyOn(window, "Image").mockImplementation(function () { return image; });
  const canvas = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D);
  const toBlob = vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => callback(frame));
  try {
    edge.mockResolvedValueOnce({ svg: clean, ratio: 1, warnings: ["O desenho tem pouco contraste no tema escuro."] });
    mount();
    choose("Escolher logo branca", original);
    expect(await screen.findByText("O desenho tem pouco contraste no tema escuro.")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Prévia da logo branca" })).toHaveAttribute("data-brand-shape", "compact");
    const [previewName, previewBody] = edge.mock.calls[0] as [string, FormData];
    expect([previewName, previewBody.get("kind"), previewBody.get("file")]).toEqual(["upload", "brand-asset-preview", original]);
    expect(image.src).toBe(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(clean)}`);
    expect(decode).toHaveBeenCalledOnce();
    expect(drawImage).toHaveBeenCalledWith(image, 0, 0, 1024, 1024);
    expect(URL.createObjectURL).toHaveBeenCalledExactlyOnceWith(frame);
    fireEvent.click(screen.getByRole("button", { name: "Salvar logo branca" }));
    expect(await screen.findByText("Logo branca salva.")).toBeInTheDocument();
    expect(edge.mock.calls[1][1].get("file")).toEqual(original);
  } finally {
    Image.mockRestore();
    canvas.mockRestore();
    toBlob.mockRestore();
  }
});
