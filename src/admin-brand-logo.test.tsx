import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
vi.hoisted(() => {
  vi.stubEnv("VITE_SUPABASE_URL", "http://127.0.0.1:58521");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-public-key");
});
const { settings, edge } = vi.hoisted(() => ({
  settings: { name: "Icarus", name_revision: 0, logo_light: null as string | null, logo_dark: null as string | null },
  edge: vi.fn(),
}));
vi.mock("./api", async (importOriginal) => ({ ...await importOriginal<typeof import("./api")>(), edge }));
vi.mock("./auth", () => ({
  useBootstrap: () => ({ data: { profile: { id: "admin-1", role: "admin" }, settings }, isPending: false, error: null, refetch: vi.fn() }),
  useAuth: () => ({ session: { access_token: "token", user: { id: "admin-1" } } }),
}));
import { cache } from "./api";
import { AdminBrand } from "./pages/admin-brand";

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
  expect(input).toHaveAttribute("accept", "image/png,image/webp");
  expect(screen.getAllByText("PNG ou WebP, até 500 KB. Mínimo de 240 × 60 px; recomendado 960 × 240 px (proporção 4:1), com fundo transparente.")).toHaveLength(2);
  const jpeg = new Uint8Array(64); jpeg.set([255, 216, 255, 224]);
  for (const [file, message, dimensions] of [
    [new File([pngBytes(512001)], "grande.png", { type: "image/png" }), "A logo precisa ter até 500 KB.", size],
    [new File(["<svg xmlns='http://www.w3.org/2000/svg'/>"], "logo.svg", { type: "image/svg+xml" }), "A logo precisa ser PNG ou WebP.", size],
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
  await waitFor(() => expect(within(preview).getAllByRole("img", { name: "Icarus" }).map((img) => img.getAttribute("src"))).toEqual(["blob:previa", "blob:previa"]));
  expect(edge).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Salvar logo colorida" }));
  expect(await screen.findByText("Logo colorida salva.")).toBeInTheDocument();
  const [name, body] = edge.mock.calls[0] as [string, FormData];
  expect(name).toBe("upload");
  expect([body.get("kind"), body.get("variant"), body.get("file")]).toEqual(["brand-logo", "light", file]);
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
  expect(edge).toHaveBeenCalledWith("upload", { action: "brand-logo-remove", variant: "dark" });
});

it("avisa quando só a logo branca está cadastrada", () => {
  settings.logo_dark = dark;
  mount();
  expect(screen.getByText("Envie também a logo colorida. Sem ela, o tema claro, as telas de entrada e o certificado não mostram a sua logo.")).toBeInTheDocument();
});
