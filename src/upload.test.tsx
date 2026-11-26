import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { Upload } from "./upload";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("./api", async (importOriginal) => ({
  ...await importOriginal<typeof import("./api")>(),
  client: () => ({ functions: { invoke } }),
}));

const jpeg = (size: number) => {
  const bytes = new Uint8Array(size);
  bytes.set([255, 216, 255, 224]);
  return bytes;
};
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13]);

beforeEach(() => {
  // O jsdom não tem Blob.arrayBuffer, que os navegadores suportam.
  Blob.prototype.arrayBuffer ??= function (this: Blob) {
    return new Promise<ArrayBuffer>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.readAsArrayBuffer(this);
    });
  };
  URL.createObjectURL = vi.fn(() => "blob:previa");
  URL.revokeObjectURL = vi.fn();
  HTMLCanvasElement.prototype.getContext = vi.fn(() => null);
});

function choose(file: File) {
  render(<Upload kind="avatar" resourceId="pessoa-1" />);
  const input = screen.getByLabelText("Foto do perfil");
  fireEvent.change(input, { target: { files: [file] } });
  return input;
}

it("o seletor da foto aceita só JPG e PNG de até 500 KB", () => {
  render(<Upload kind="avatar" resourceId="pessoa-1" />);
  expect(screen.getByLabelText("Foto do perfil")).toHaveAttribute("accept", "image/jpeg,image/png");
  expect(screen.getByText("JPG ou PNG de até 500 KB.")).toBeInTheDocument();
});

it("recusa foto acima de 500 KB dizendo que o problema é o tamanho", async () => {
  const input = choose(new File([jpeg(500 * 1024 + 1)], "grande.jpg", { type: "image/jpeg" }));
  expect(await screen.findByText("Esta foto passa de 500 KB. Escolha uma menor, em JPG ou PNG.")).toBeInTheDocument();
  expect(input).toHaveValue("");
  expect(screen.queryByLabelText("Prévia do recorte quadrado da foto")).not.toBeInTheDocument();
  expect(invoke).not.toHaveBeenCalled();
});

it.each([
  ["GIF", new File([new TextEncoder().encode("GIF89a")], "animacao.gif", { type: "image/gif" })],
  ["WEBP", new File([new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ")], "imagem.webp", { type: "image/webp" })],
  ["texto renomeado para .jpg", new File([new TextEncoder().encode("isto não é uma imagem")], "falsa.jpg", { type: "image/jpeg" })],
])("recusa foto %s sem prévia nem envio", async (_, file) => {
  const input = choose(file);
  expect(await screen.findByText("Escolha uma foto JPG ou PNG de até 500 KB.")).toBeInTheDocument();
  expect(input).toHaveValue("");
  expect(screen.queryByLabelText("Prévia do recorte quadrado da foto")).not.toBeInTheDocument();
  expect(invoke).not.toHaveBeenCalled();
});

it.each([
  ["JPG de 500 KB", new File([jpeg(500 * 1024)], "foto.jpg", { type: "image/jpeg" })],
  ["PNG", new File([png], "foto.png", { type: "image/png" })],
])("%s mostra a prévia, avisa que falta salvar e protege a saída da tela", async (_, file) => {
  choose(file);
  expect(await screen.findByText("Foto escolhida, ainda não salva. Ajuste o recorte e clique em Salvar foto.")).toBeInTheDocument();
  expect(screen.getByLabelText("Prévia do recorte quadrado da foto")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Salvar foto" })).toHaveClass("primary");
  const leaving = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(leaving);
  expect(leaving.defaultPrevented).toBe(true);
  expect(invoke).not.toHaveBeenCalled();
});

it("seleção esvaziada remove a prévia e volta a desabilitar Salvar foto", async () => {
  const input = choose(new File([png], "foto.png", { type: "image/png" }));
  await screen.findByLabelText("Prévia do recorte quadrado da foto");
  fireEvent.change(input, { target: { files: [] } });
  await waitFor(() => expect(screen.queryByLabelText("Prévia do recorte quadrado da foto")).not.toBeInTheDocument());
  expect(screen.getByRole("button", { name: "Salvar foto" })).toBeDisabled();
});

it("Salvar foto envia o recorte em JPEG com fundo branco, confirma e encerra a pendência", async () => {
  const fills: string[] = [];
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    set fillStyle(color: string) { fills.push(color); },
    fillRect: vi.fn(),
    drawImage: vi.fn(),
  })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.toBlob = function (callback) { callback(new Blob([jpeg(64)], { type: "image/jpeg" })); };
  const loads: (() => void)[] = [];
  vi.stubGlobal("Image", class { onload: (() => void) | null = null; onerror = null; width = 800; height = 600; set src(_: string) { loads.push(() => this.onload?.()); } });
  invoke.mockResolvedValue({ error: null });
  const onUploaded = vi.fn();
  render(<Upload kind="avatar" resourceId="pessoa-1" onUploaded={onUploaded} />);
  expect(screen.getByRole("button", { name: "Salvar foto" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Foto do perfil"), { target: { files: [new File([png], "foto.png", { type: "image/png" })] } });
  await screen.findByLabelText("Prévia do recorte quadrado da foto");
  loads.forEach((load) => load());
  expect(fills).toEqual(["#fff"]);
  fireEvent.click(screen.getByRole("button", { name: "Salvar foto" }));
  expect(await screen.findByText("Foto salva.")).toBeInTheDocument();
  const sent = invoke.mock.calls[0][1].body.get("file") as File;
  expect([invoke.mock.calls[0][0], sent.name, sent.type]).toEqual(["upload", "avatar.jpg", "image/jpeg"]);
  expect(onUploaded).toHaveBeenCalledOnce();
  expect(screen.getByRole("button", { name: "Salvar foto" })).toBeDisabled();
  await waitFor(() => {
    const leaving = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(leaving);
    expect(leaving.defaultPrevented).toBe(false);
  });
});
