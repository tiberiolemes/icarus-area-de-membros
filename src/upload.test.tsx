import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { Upload } from "./upload";

const { invoke, optimize, edge, storageUpload } = vi.hoisted(() => ({ invoke: vi.fn(), optimize: vi.fn(), edge: vi.fn(), storageUpload: vi.fn() }));
vi.mock("./optimize", async (importOriginal) => ({
  ...await importOriginal<typeof import("./optimize")>(),
  optimizeFile: optimize,
}));
vi.mock("./api", async (importOriginal) => ({
  ...await importOriginal<typeof import("./api")>(),
  client: () => ({ functions: { invoke } }),
  edge,
  uploadStorage: () => ({ from: () => ({ upload: storageUpload }) }),
}));

const jpeg = (size: number) => {
  const bytes = new Uint8Array(size);
  bytes.set([255, 216, 255, 224]);
  return bytes;
};
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13]);

beforeEach(() => {
  optimize.mockImplementation((file: File) => Promise.resolve(file));
  edge.mockReset();
  storageUpload.mockReset();
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

it("a capa mostra um seletor em português com o nome do arquivo e habilita o envio após a escolha", () => {
  render(<Upload kind="course-cover" resourceId="curso-1" />);
  const input = screen.getByLabelText("Enviar arquivo", { selector: "input" });
  const submit = screen.getByRole("button", { name: "Enviar arquivo" });
  expect(screen.getByText("Escolher arquivo")).toBeInTheDocument();
  expect(screen.getByText("Nenhum arquivo selecionado")).toBeInTheDocument();
  expect(input).toHaveAttribute("accept", "image/png,image/jpeg,image/webp");
  expect(input).toHaveAccessibleDescription("PNG, JPG ou WebP de até 500 KB, otimizado automaticamente. O ideal é 1600\u00a0×\u00a0900\u00a0px.");
  expect(submit).toBeDisabled();
  fireEvent.change(input, { target: { files: [new File([png], "capa.png", { type: "image/png" })] } });
  expect(screen.getByText("capa.png")).toBeInTheDocument();
  expect(submit).toBeEnabled();
  expect(invoke).not.toHaveBeenCalled();
});

it("recusa capa acima de 500 KB antes de enviar e diz o motivo", async () => {
  render(<Upload kind="course-cover" resourceId="curso-1" />);
  const input = screen.getByLabelText("Enviar arquivo", { selector: "input" });
  fireEvent.change(input, { target: { files: [new File([jpeg(500 * 1024 + 1)], "capa.jpg", { type: "image/jpeg" })] } });
  expect(await screen.findByText("A imagem passa de 500 KB. Escolha uma menor, em PNG, JPG ou WebP.")).toBeInTheDocument();
  expect(input).toHaveValue("");
  expect(screen.getByText("Nenhum arquivo selecionado")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Enviar arquivo" })).toBeDisabled();
  expect(invoke).not.toHaveBeenCalled();
});

it("capa de exatamente 500 KB segue para o envio", async () => {
  invoke.mockResolvedValue({ data: { uploaded: true }, error: null });
  render(<Upload kind="course-cover" resourceId="curso-1" />);
  fireEvent.change(screen.getByLabelText("Enviar arquivo", { selector: "input" }), {
    target: { files: [new File([jpeg(500 * 1024)], "capa.jpg", { type: "image/jpeg" })] },
  });
  fireEvent.click(screen.getByRole("button", { name: "Enviar arquivo" }));
  expect(await screen.findByText("Arquivo enviado e associado ao registro.")).toBeInTheDocument();
  expect(invoke).toHaveBeenCalledTimes(1);
});

it("imagem de post acima de 500 KB é recusada antes do envio, com a dica geral", async () => {
  render(<Upload kind="post-image" resourceId="post-1" />);
  const input = screen.getByLabelText("Enviar arquivo", { selector: "input" });
  expect(input).toHaveAccessibleDescription("Imagem PNG, JPG ou WebP até 500 KB e PDF até 5 MB, otimizados automaticamente. Outros anexos até 20 MiB.");
  fireEvent.change(input, { target: { files: [new File([jpeg(512001)], "foto.jpg", { type: "image/jpeg" })] } });
  expect(await screen.findByText("A imagem passa de 500 KB. Escolha uma menor, em PNG, JPG ou WebP.")).toBeInTheDocument();
  expect(input).toHaveValue("");
  expect(screen.getByRole("button", { name: "Enviar arquivo" })).toBeDisabled();
  expect(invoke).not.toHaveBeenCalled();
});

it("recusa PDF de material acima de 5 MB antes de enviar", async () => {
  render(<Upload kind="material" resourceId="material-1" />);
  const input = screen.getByLabelText("Enviar arquivo", { selector: "input" });
  expect(input).toHaveAccessibleDescription("PDF até 5 MB, otimizado automaticamente. Imagem até 500 KB. ZIP, TXT, MP4 e MP3 até 500 MiB. O andamento abaixo não estima percentual.");
  fireEvent.change(input, { target: { files: [new File([new Uint8Array(5242881)], "apostila.pdf", { type: "application/pdf" })] } });
  expect(await screen.findByText("O PDF passa de 5 MB. Escolha um arquivo menor.")).toBeInTheDocument();
  expect(input).toHaveValue("");
  expect(screen.getByRole("button", { name: "Enviar arquivo" })).toBeDisabled();
});

it("capa é otimizada antes do envio e mostra quanto diminuiu", async () => {
  let finish!: (file: File) => void;
  optimize.mockReturnValue(new Promise<File>((resolve) => { finish = resolve; }));
  invoke.mockResolvedValue({ data: { uploaded: true }, error: null });
  render(<Upload kind="course-cover" resourceId="curso-1" />);
  fireEvent.change(screen.getByLabelText("Enviar arquivo", { selector: "input" }), {
    target: { files: [new File([jpeg(400 * 1024)], "capa.png", { type: "image/png" })] },
  });
  fireEvent.click(screen.getByRole("button", { name: "Enviar arquivo" }));
  expect(await screen.findByText("Otimizando arquivo…")).toBeInTheDocument();
  finish(new File([new Uint8Array(100 * 1024)], "capa.webp", { type: "image/webp" }));
  expect(await screen.findByText("Arquivo otimizado de 400 KB para 100 KB e enviado.")).toBeInTheDocument();
  const sent = invoke.mock.calls[0][1].body.get("file") as File;
  expect([sent.name, sent.type]).toEqual(["capa.webp", "image/webp"]);
});

it("cancelar durante a otimização não envia nada", async () => {
  let finish!: (file: File) => void;
  optimize.mockReturnValue(new Promise<File>((resolve) => { finish = resolve; }));
  render(<Upload kind="course-cover" resourceId="curso-1" />);
  const original = new File([jpeg(1024)], "capa.jpg", { type: "image/jpeg" });
  fireEvent.change(screen.getByLabelText("Enviar arquivo", { selector: "input" }), { target: { files: [original] } });
  fireEvent.click(screen.getByRole("button", { name: "Enviar arquivo" }));
  fireEvent.click(await screen.findByRole("button", { name: "Cancelar envio" }));
  finish(original);
  expect(await screen.findByText(/Envio cancelado/)).toBeInTheDocument();
  expect(invoke).not.toHaveBeenCalled();
});

it("PDF de material reserva e envia o arquivo otimizado; imagem de material segue no formato original", async () => {
  optimize.mockResolvedValue(new File([new Uint8Array(1024)], "apostila.pdf", { type: "application/pdf" }));
  edge.mockImplementation((_name: string, body: { action: string }) =>
    Promise.resolve(body.action === "reserve" ? { upload_id: "u1", bucket: "icarus-private", path: "material/m/u1.pdf", expires_at: "" } : {}));
  storageUpload.mockResolvedValue({ error: null });
  const { unmount } = render(<Upload kind="material" resourceId="material-1" />);
  const pick = (file: File) => fireEvent.change(screen.getByLabelText("Enviar arquivo", { selector: "input" }), { target: { files: [file] } });
  pick(new File([new Uint8Array(4096)], "apostila.pdf", { type: "application/pdf" }));
  fireEvent.click(screen.getByRole("button", { name: "Enviar arquivo" }));
  expect(await screen.findByText("Arquivo otimizado de 4 KB para 1 KB e enviado.")).toBeInTheDocument();
  expect(edge.mock.calls[0][1]).toMatchObject({ action: "reserve", file_name: "apostila.pdf", content_type: "application/pdf", size_bytes: 1024 });
  expect((storageUpload.mock.calls[0][1] as File).size).toBe(1024);
  unmount();
  optimize.mockClear();
  render(<Upload kind="material" resourceId="material-1" />);
  pick(new File([png], "mapa.png", { type: "image/png" }));
  fireEvent.click(screen.getByRole("button", { name: "Enviar arquivo" }));
  expect(await screen.findByText("Arquivo enviado e associado ao registro.")).toBeInTheDocument();
  expect(optimize).not.toHaveBeenCalled();
  expect(edge.mock.calls.at(-2)?.[1]).toMatchObject({ file_name: "mapa.png", content_type: "image/png" });
});

it("vídeo da aula não passa pela otimização", async () => {
  render(<Upload kind="lesson" resourceId="aula-1" />);
  fireEvent.change(screen.getByLabelText("Arquivo de vídeo", { selector: "input" }), {
    target: { files: [new File([new Uint8Array(1024)], "aula.mp4", { type: "video/mp4" })] },
  });
  fireEvent.click(screen.getByRole("button", { name: "Enviar arquivo" }));
  await screen.findByRole("alert");
  expect(optimize).not.toHaveBeenCalled();
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
  await waitFor(() => {
    const leaving = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(leaving);
    expect(leaving.defaultPrevented).toBe(true);
  });
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
  expect(optimize).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Salvar foto" })).toBeDisabled();
  await waitFor(() => {
    const leaving = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(leaving);
    expect(leaving.defaultPrevented).toBe(false);
  });
});
