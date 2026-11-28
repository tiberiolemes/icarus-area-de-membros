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
  const input = screen.getByLabelText("Foto do perfil", { selector: "input" });
  fireEvent.change(input, { target: { files: [file] } });
  return input;
}

it("o seletor da foto aceita só JPG e PNG de até 20 MB", () => {
  render(<Upload kind="avatar" resourceId="pessoa-1" />);
  expect(screen.getByLabelText("Foto do perfil", { selector: "input" })).toHaveAttribute("accept", "image/jpeg,image/png");
  expect(screen.getByRole("button", { name: "Selecionar arquivo" })).toHaveAccessibleDescription("JPG ou PNG · até 20 MB");
});

it.each([
  ["course-cover", "PNG, JPG ou WebP · até 500 KB depois de otimizada · ideal 1600\u00a0×\u00a0900\u00a0px"],
  ["material", "PDF, imagem, ZIP, TXT ou MP3 · PDF até 5 MB e imagem até 500 KB depois de otimizados · ZIP, TXT e MP3 até 500 MB"],
  ["post-image", "PNG, JPG ou WebP · até 500 KB depois de otimizada"],
  ["ticket-attachment", "Imagem, PDF, ZIP, TXT ou MP3 · imagem até 500 KB e PDF até 5 MB depois de otimizados · demais até 20 MB"],
] as const)("%s mostra a área de arraste com a dica de tipos e limite", (kind, hint) => {
  render(<Upload kind={kind} resourceId="registro-1" />);
  expect(screen.getByText("Arraste o arquivo aqui")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Selecionar arquivo" })).toHaveAccessibleDescription(hint);
});

it("a capa aceita só imagem no seletor", () => {
  render(<Upload kind="course-cover" resourceId="curso-1" />);
  expect(screen.getByLabelText("Enviar arquivo", { selector: "input" })).toHaveAttribute("accept", "image/png,image/jpeg,image/webp");
});

it("material começa o envio ao escolher o arquivo, sem botão Enviar arquivo", async () => {
  let finish!: (file: File) => void;
  optimize.mockReturnValue(new Promise<File>((resolve) => { finish = resolve; }));
  edge.mockImplementation((_name: string, body: { action: string }) =>
    Promise.resolve(body.action === "reserve" ? { upload_id: "u1", bucket: "icarus-private", path: "material/m/u1.pdf", expires_at: "" } : {}));
  storageUpload.mockResolvedValue({ error: null });
  render(<Upload kind="material" resourceId="material-1" />);
  expect(screen.queryByRole("button", { name: "Enviar arquivo" })).not.toBeInTheDocument();
  const pdf = new File([new Uint8Array(1024)], "apostila.pdf", { type: "application/pdf" });
  fireEvent.change(screen.getByLabelText("Enviar arquivo", { selector: "input" }), { target: { files: [pdf] } });
  expect(await screen.findByText("Otimizando arquivo…")).toBeInTheDocument();
  expect(screen.getByText("apostila.pdf")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Trocar arquivo" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Cancelar envio" })).toBeInTheDocument();
  expect(screen.getByLabelText("Envio em andamento, sem estimativa percentual")).toBeInTheDocument();
  finish(pdf);
  expect(await screen.findByText("Arquivo enviado e associado ao registro.")).toBeInTheDocument();
  expect(edge.mock.calls.map(([, body]) => body.action)).toEqual(["reserve", "finalize"]);
  expect(screen.getByRole("button", { name: "Selecionar arquivo" })).toBeEnabled();
});

it("vídeo escolhido é recusado na tela com a frase do vídeo", async () => {
  render(<Upload kind="material" resourceId="material-1" />);
  const video = new File([new Uint8Array(64)], "aula.mp4", { type: "video/mp4" });
  const input = screen.getByLabelText("Enviar arquivo", { selector: "input" });
  fireEvent.change(input, { target: { files: [video] } });
  expect(await screen.findByRole("alert")).toHaveTextContent("A plataforma não recebe vídeo. Use o Bunny Stream ou o YouTube.");
  expect(input).toHaveValue("");
  fireEvent.drop(screen.getByRole("group", { name: "Enviar arquivo" }), { dataTransfer: { files: [video] } });
  expect(screen.getByRole("alert")).toHaveTextContent("A plataforma não recebe vídeo. Use o Bunny Stream ou o YouTube.");
  expect(optimize).not.toHaveBeenCalled();
  expect(edge).not.toHaveBeenCalled();
  expect(invoke).not.toHaveBeenCalled();
});

it("soltar a capa na área começa o envio", async () => {
  invoke.mockResolvedValue({ data: { uploaded: true }, error: null });
  render(<Upload kind="course-cover" resourceId="curso-1" />);
  const capa = new File([png], "capa.png", { type: "image/png" });
  fireEvent.drop(screen.getByRole("group", { name: "Enviar arquivo" }), { dataTransfer: { files: [capa] } });
  expect(await screen.findByText("Arquivo enviado e associado ao registro.")).toBeInTheDocument();
  expect(invoke.mock.calls[0][1].body.get("file")).toBe(capa);
});

it("recusa capa original acima de 20 MB antes de enviar e diz o motivo", async () => {
  render(<Upload kind="course-cover" resourceId="curso-1" />);
  const input = screen.getByLabelText("Enviar arquivo", { selector: "input" });
  fireEvent.change(input, { target: { files: [new File([jpeg(20971521)], "capa.jpg", { type: "image/jpeg" })] } });
  expect(await screen.findByText("O arquivo passa de 20 MB. Escolha um menor.")).toBeInTheDocument();
  expect(input).toHaveValue("");
  expect(screen.getByRole("button", { name: "Selecionar arquivo" })).toBeEnabled();
  expect(invoke).not.toHaveBeenCalled();
});

it("capa de 1 MB é aceita, otimizada e enviada já dentro de 500 KB", async () => {
  optimize.mockResolvedValue(new File([new Uint8Array(100 * 1024)], "capa.webp", { type: "image/webp" }));
  invoke.mockResolvedValue({ data: { uploaded: true }, error: null });
  render(<Upload kind="course-cover" resourceId="curso-1" />);
  fireEvent.change(screen.getByLabelText("Enviar arquivo", { selector: "input" }), {
    target: { files: [new File([jpeg(1024 * 1024)], "capa.jpg", { type: "image/jpeg" })] },
  });
  expect(await screen.findByText("Arquivo otimizado de 1024 KB para 100 KB e enviado.")).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect((invoke.mock.calls[0][1].body.get("file") as File).size).toBe(100 * 1024);
});

it("imagem que continua acima de 500 KB depois de otimizar é recusada sem envio", async () => {
  optimize.mockResolvedValue(new File([new Uint8Array(700 * 1024)], "capa.webp", { type: "image/webp" }));
  render(<Upload kind="course-cover" resourceId="curso-1" />);
  fireEvent.change(screen.getByLabelText("Enviar arquivo", { selector: "input" }), {
    target: { files: [new File([jpeg(3 * 1024 * 1024)], "capa.jpg", { type: "image/jpeg" })] },
  });
  expect(await screen.findByText("Mesmo otimizada, a imagem ficou com 700 KB. O limite é 500 KB.")).toBeInTheDocument();
  expect(invoke).not.toHaveBeenCalled();
  // O arquivo recusado sai do campo: escolher o mesmo arquivo de novo volta a disparar a escolha.
  expect(screen.getByLabelText("Enviar arquivo", { selector: "input" })).toHaveValue("");
  expect(screen.getByRole("button", { name: "Selecionar arquivo" })).toBeEnabled();
});

it("imagem de post original acima de 20 MB é recusada antes do envio", async () => {
  render(<Upload kind="post-image" resourceId="post-1" />);
  const input = screen.getByLabelText("Enviar arquivo", { selector: "input" });
  fireEvent.change(input, { target: { files: [new File([jpeg(20971521)], "foto.jpg", { type: "image/jpeg" })] } });
  expect(await screen.findByText("O arquivo passa de 20 MB. Escolha um menor.")).toBeInTheDocument();
  expect(input).toHaveValue("");
  expect(invoke).not.toHaveBeenCalled();
});

it("PDF de material: original acima de 20 MB é recusado na escolha; acima de 5 MB depois de otimizar, no envio", async () => {
  optimize.mockResolvedValue(new File([new Uint8Array(6 * 1024 * 1024)], "apostila.pdf", { type: "application/pdf" }));
  render(<Upload kind="material" resourceId="material-1" />);
  const input = screen.getByLabelText("Enviar arquivo", { selector: "input" });
  fireEvent.change(input, { target: { files: [new File([new Uint8Array(20971521)], "apostila.pdf", { type: "application/pdf" })] } });
  expect(await screen.findByText("O arquivo passa de 20 MB. Escolha um menor.")).toBeInTheDocument();
  expect(input).toHaveValue("");
  expect(optimize).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { files: [new File([new Uint8Array(8 * 1024 * 1024)], "apostila.pdf", { type: "application/pdf" })] } });
  expect(await screen.findByText("Mesmo otimizado, o PDF ficou com 6 MB. O limite é 5 MB.")).toBeInTheDocument();
  expect(edge).not.toHaveBeenCalled();
});

it("capa é otimizada antes do envio e mostra quanto diminuiu", async () => {
  let finish!: (file: File) => void;
  optimize.mockReturnValue(new Promise<File>((resolve) => { finish = resolve; }));
  invoke.mockResolvedValue({ data: { uploaded: true }, error: null });
  render(<Upload kind="course-cover" resourceId="curso-1" />);
  fireEvent.change(screen.getByLabelText("Enviar arquivo", { selector: "input" }), {
    target: { files: [new File([jpeg(400 * 1024)], "capa.png", { type: "image/png" })] },
  });
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
  fireEvent.click(await screen.findByRole("button", { name: "Cancelar envio" }));
  finish(original);
  expect(await screen.findByText(/Envio cancelado/)).toBeInTheDocument();
  expect(invoke).not.toHaveBeenCalled();
});

it("material reserva e envia o PDF e a imagem já otimizados", async () => {
  optimize.mockResolvedValueOnce(new File([new Uint8Array(1024)], "apostila.pdf", { type: "application/pdf" }));
  edge.mockImplementation((_name: string, body: { action: string }) =>
    Promise.resolve(body.action === "reserve" ? { upload_id: "u1", bucket: "icarus-private", path: "material/m/u1.pdf", expires_at: "" } : {}));
  storageUpload.mockResolvedValue({ error: null });
  const uploaded = vi.fn();
  const { unmount } = render(<Upload kind="material" resourceId="material-1" onUploaded={uploaded} />);
  const pick = (file: File) => fireEvent.change(screen.getByLabelText("Enviar arquivo", { selector: "input" }), { target: { files: [file] } });
  pick(new File([new Uint8Array(6 * 1024 * 1024)], "apostila.pdf", { type: "application/pdf" }));
  expect(await screen.findByText("Arquivo otimizado de 6144 KB para 1 KB e enviado.")).toBeInTheDocument();
  expect(edge.mock.calls[0][1]).toMatchObject({ action: "reserve", file_name: "apostila.pdf", content_type: "application/pdf", size_bytes: 1024 });
  expect((storageUpload.mock.calls[0][1] as File).size).toBe(1024);
  // O editor de material usa o arquivo final para atualizar o tipo exibido.
  expect(uploaded).toHaveBeenCalledWith(expect.objectContaining({ name: "apostila.pdf", size: 1024 }));
  unmount();
  optimize.mockResolvedValueOnce(new File([new Uint8Array(2048)], "mapa.webp", { type: "image/webp" }));
  render(<Upload kind="material" resourceId="material-1" />);
  pick(new File([jpeg(2 * 1024 * 1024)], "mapa.png", { type: "image/png" }));
  expect(await screen.findByText("Arquivo otimizado de 2048 KB para 2 KB e enviado.")).toBeInTheDocument();
  expect(edge.mock.calls.at(-2)?.[1]).toMatchObject({ file_name: "mapa.webp", content_type: "image/webp", size_bytes: 2048 });
});

it("o campo de material não lista MP4 na dica", () => {
  render(<Upload kind="material" resourceId="material-1" />);
  expect(screen.getByRole("button", { name: "Selecionar arquivo" })).not.toHaveAccessibleDescription(/MP4|vídeo/i);
});

it("foto de perfil espera o recorte e o Salvar foto", async () => {
  choose(new File([png], "foto.png", { type: "image/png" }));
  await screen.findByLabelText("Prévia do recorte quadrado da foto");
  expect(screen.getByRole("button", { name: "Salvar foto" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Trocar arquivo" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Cancelar envio" })).not.toBeInTheDocument();
  expect(invoke).not.toHaveBeenCalled();
  expect(optimize).not.toHaveBeenCalled();
});

it("recusa foto acima de 20 MB dizendo que o problema é o tamanho", async () => {
  const input = choose(new File([jpeg(20971521)], "grande.jpg", { type: "image/jpeg" }));
  expect(await screen.findByText("Esta foto passa de 20 MB. Escolha uma menor, em JPG ou PNG.")).toBeInTheDocument();
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
  expect(await screen.findByText("Escolha uma foto JPG ou PNG de até 20 MB.")).toBeInTheDocument();
  expect(input).toHaveValue("");
  expect(screen.queryByLabelText("Prévia do recorte quadrado da foto")).not.toBeInTheDocument();
  expect(invoke).not.toHaveBeenCalled();
});

it.each([
  ["JPG de 1 MB", new File([jpeg(1024 * 1024)], "foto.jpg", { type: "image/jpeg" })],
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
  fireEvent.change(screen.getByLabelText("Foto do perfil", { selector: "input" }), { target: { files: [new File([png], "foto.png", { type: "image/png" })] } });
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
