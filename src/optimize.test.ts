import { beforeEach, expect, it, vi } from "vitest";
import { finalLimit, limits, optimizeFile, overLimit } from "./optimize";

const qpdf = vi.hoisted(() => ({
  load: vi.fn(),
  callMain: vi.fn(),
  output: new Uint8Array(),
  args: [] as string[],
}));
vi.mock("@neslinesli93/qpdf-wasm", () => ({
  default: (...options: unknown[]) => {
    qpdf.load(...options);
    const files = new Map<string, Uint8Array>();
    return Promise.resolve({
      FS: { writeFile: (path: string, data: Uint8Array) => files.set(path, data), readFile: () => qpdf.output },
      callMain: (args: string[]) => {
        qpdf.args = args;
        return qpdf.callMain(args);
      },
    });
  },
}));
vi.mock("@neslinesli93/qpdf-wasm/dist/qpdf.wasm?url", () => ({ default: "/assets/qpdf.wasm" }));

const ascii = (text: string) => new TextEncoder().encode(text);
const sized = (head: Uint8Array, size: number) => {
  const bytes = new Uint8Array(size);
  bytes.set(head);
  return bytes;
};
const png = (size: number, extra = "") => sized(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, ...ascii("\0\0\0\rIHDR" + extra)]), size);
const jpeg = (size: number) => sized(new Uint8Array([255, 216, 255, 224]), size);
const pdf = (size: number, body = "") => sized(ascii("%PDF-1.7\n" + body), size);
let encoded: Blob | null;
let sizes: Record<string, number> | null;
const canvases: { width: number; height: number; quality: number }[] = [];
const bitmap = vi.fn();

beforeEach(() => {
  // O jsdom não tem Blob.arrayBuffer, que os navegadores suportam.
  Blob.prototype.arrayBuffer ??= function (this: Blob) {
    return new Promise<ArrayBuffer>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.readAsArrayBuffer(this);
    });
  };
  encoded = null;
  sizes = null;
  canvases.length = 0;
  bitmap.mockReset().mockResolvedValue({ width: 1600, height: 900, close: vi.fn() });
  vi.stubGlobal("createImageBitmap", bitmap);
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ drawImage: vi.fn() })) as never;
  HTMLCanvasElement.prototype.toBlob = vi.fn(function (this: HTMLCanvasElement, callback: BlobCallback, _type?: string, quality?: number) {
    canvases.push({ width: this.width, height: this.height, quality: quality! });
    callback(sizes ? new Blob([new Uint8Array(sizes[String(quality)])], { type: "image/webp" }) : encoded);
  }) as never;
  qpdf.load.mockReset();
  qpdf.callMain.mockReset().mockReturnValue(0);
});

it("regrava PNG em WebP menor e troca a extensão", async () => {
  encoded = new Blob([new Uint8Array(100 * 1024)], { type: "image/webp" });
  const original = new File([png(400 * 1024)], "capa.final.PNG", { type: "image/png" });
  const result = await optimizeFile(original);
  expect(result.name).toBe("capa.final.webp");
  expect(result.type).toBe("image/webp");
  expect(result.size).toBe(100 * 1024);
  expect(HTMLCanvasElement.prototype.toBlob).toHaveBeenCalledWith(expect.any(Function), "image/webp", 0.9);
});

it("mantém o original quando o WebP fica maior", async () => {
  encoded = new Blob([new Uint8Array(500 * 1024)], { type: "image/webp" });
  const original = new File([jpeg(300 * 1024)], "foto.jpg", { type: "image/jpeg" });
  expect(await optimizeFile(original)).toBe(original);
});

it("mantém o original quando o navegador não gera WebP", async () => {
  encoded = new Blob([new Uint8Array(10)], { type: "image/png" });
  const original = new File([png(400 * 1024)], "capa.png", { type: "image/png" });
  expect(await optimizeFile(original)).toBe(original);
});

it("não mexe em PNG animado nem em WebP animado", async () => {
  encoded = new Blob([new Uint8Array(10)], { type: "image/webp" });
  const apng = new File([png(400 * 1024, "\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\bacTL")], "a.png", { type: "image/png" });
  const webp = new File([sized(ascii("RIFF\0\0\0\0WEBPVP8X\n\0\0\0\x02\0\0\0\0\0\0\0\0\0ANIM"), 400 * 1024)], "a.webp", { type: "image/webp" });
  expect(await optimizeFile(apng)).toBe(apng);
  expect(await optimizeFile(webp)).toBe(webp);
  expect(bitmap).not.toHaveBeenCalled();
});

it("comprime PDF sem perda com qpdf", async () => {
  qpdf.output = pdf(1024 * 1024);
  const original = new File([pdf(4 * 1024 * 1024)], "apostila.pdf", { type: "application/pdf" });
  const result = await optimizeFile(original);
  expect(result.size).toBe(1024 * 1024);
  expect(result.type).toBe("application/pdf");
  expect(result.name).toBe("apostila.pdf");
  expect(qpdf.args).toEqual(["--object-streams=generate", "--compress-streams=y", "--recompress-flate", "--compression-level=9", "/in.pdf", "/out.pdf"]);
});

it("não toca PDF assinado nem criptografado", async () => {
  const signed = new File([pdf(1024, "/ByteRange [0 10 20 30]")], "assinado.pdf", { type: "application/pdf" });
  const locked = new File([pdf(1024, "/Encrypt 5 0 R")], "senha.pdf", { type: "application/pdf" });
  expect(await optimizeFile(signed)).toBe(signed);
  expect(await optimizeFile(locked)).toBe(locked);
  expect(qpdf.load).not.toHaveBeenCalled();
});

it("envia o original quando o qpdf falha", async () => {
  const original = new File([pdf(4096)], "apostila.pdf", { type: "application/pdf" });
  qpdf.callMain.mockReturnValue(2);
  qpdf.output = pdf(10);
  expect(await optimizeFile(original)).toBe(original);
  // Simula a CSP sem 'wasm-unsafe-eval': o carregamento do WASM falha.
  qpdf.load.mockImplementation(() => {
    throw new Error("CompileError");
  });
  expect(await optimizeFile(original)).toBe(original);
});

it("outros tipos passam direto", async () => {
  const original = new File(["texto"], "notas.txt", { type: "text/plain" });
  expect(await optimizeFile(original)).toBe(original);
});

it("reduz o lado maior a 2560 px mantendo a proporção", async () => {
  bitmap.mockResolvedValue({ width: 4000, height: 3000, close: vi.fn() });
  encoded = new Blob([new Uint8Array(300 * 1024)], { type: "image/webp" });
  const result = await optimizeFile(new File([jpeg(6 * 1024 * 1024)], "foto.jpg", { type: "image/jpeg" }));
  expect(canvases[0]).toMatchObject({ width: 2560, height: 1920 });
  expect(result.size).toBe(300 * 1024);
});

it("baixa a qualidade em degraus até caber em 500 KB", async () => {
  sizes = { "0.9": 700 * 1024, "0.85": 560 * 1024, "0.8": 450 * 1024 };
  const result = await optimizeFile(new File([jpeg(3 * 1024 * 1024)], "foto.jpg", { type: "image/jpeg" }));
  expect(canvases.map((c) => c.quality)).toEqual([0.9, 0.85, 0.8]);
  expect(result.size).toBe(450 * 1024);
});

it("fica com o menor resultado quando nenhum degrau cabe", async () => {
  sizes = { "0.9": 900 * 1024, "0.85": 800 * 1024, "0.8": 700 * 1024 };
  const result = await optimizeFile(new File([jpeg(3 * 1024 * 1024)], "foto.jpg", { type: "image/jpeg" }));
  expect(result.size).toBe(700 * 1024);
});

it("com o teto do print, para no primeiro degrau que cabe em 5 MB", async () => {
  sizes = { "0.9": 2 * 1024 * 1024, "0.85": 1024, "0.8": 1024 };
  const result = await optimizeFile(new File([jpeg(4 * 1024 * 1024)], "tela.png", { type: "image/png" }), limits.screenshot);
  expect(canvases.map((c) => c.quality)).toEqual([0.9]);
  expect(result.size).toBe(2 * 1024 * 1024);
});

it("overLimit recusa só original acima de 20 MB", () => {
  const file = (size: number, name: string, type: string) => new File([new Uint8Array(size)], name, { type });
  expect(overLimit(file(20971520, "a.png", "image/png"))).toBeNull();
  expect(overLimit(file(20971521, "a.jpg", "image/jpeg"))).toBe("O arquivo passa de 20 MB. Escolha um menor.");
  expect(overLimit(file(20971521, "a.pdf", "application/pdf"))).toBe("O arquivo passa de 20 MB. Escolha um menor.");
  expect(overLimit(file(30 * 1024 * 1024, "a.zip", "application/zip"))).toBeNull();
});

it("finalLimit aplica 500 KB à imagem e 5 MB ao PDF e ao print depois de otimizar", () => {
  const file = (size: number, name: string, type: string) => new File([new Uint8Array(size)], name, { type });
  expect(finalLimit(file(512000, "a.webp", "image/webp"))).toBeNull();
  expect(finalLimit(file(700 * 1024, "a.webp", "image/webp"))).toBe("Mesmo otimizada, a imagem ficou com 700 KB. O limite é 500 KB.");
  expect(finalLimit(file(5242880, "a.pdf", "application/pdf"))).toBeNull();
  expect(finalLimit(file(6.2 * 1024 * 1024, "a.pdf", "application/pdf"))).toBe("Mesmo otimizado, o PDF ficou com 6,2 MB. O limite é 5 MB.");
  expect(finalLimit(file(4 * 1024 * 1024, "a.webp", "image/webp"), true)).toBeNull();
  expect(finalLimit(file(5.5 * 1024 * 1024, "a.webp", "image/webp"), true)).toBe("Mesmo otimizado, o print ficou com 5,5 MB. O limite é 5 MB.");
  expect(finalLimit(file(30 * 1024 * 1024, "a.zip", "application/zip"))).toBeNull();
});
