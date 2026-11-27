// Tetos do arquivo otimizado, repetidos de propósito na função upload e em app_upload_access: o servidor não confia na tela.
// O original pode ter até 20 MB, o máximo que a função upload recebe; só o otimizado sobe.
export const limits = { image: 512000, pdf: 5242880, screenshot: 5242880, original: 20971520 };
// Área máxima em pixels, tentada em ordem até caber: 2560², 1920² e 1600². Pela área, print alto não perde legibilidade.
const areas = [2560 * 2560, 1920 * 1920, 1600 * 1600];
const qualities = [0.9, 0.85, 0.8];
const images = ["image/png", "image/jpeg", "image/webp"];
const pdfArgs = ["--object-streams=generate", "--compress-streams=y", "--recompress-flate", "--compression-level=9", "/in.pdf", "/out.pdf"];

export function overLimit(file: File): string | null {
  return (images.includes(file.type) || file.type === "application/pdf") && file.size > limits.original ? "O arquivo passa de 20 MB. Escolha um menor." : null;
}

/** Confere o arquivo já otimizado, que é o que o servidor guarda. */
export function finalLimit(file: File, screenshot = false): string | null {
  // Arredonda para cima: 512.001 bytes não podem aparecer como "500 KB" ao lado do limite de 500 KB.
  const mb = (bytes: number) => (Math.ceil((bytes / 1048576) * 10) / 10).toLocaleString("pt-BR");
  if (screenshot) return file.size > limits.screenshot ? `Mesmo otimizado, o print ficou com ${mb(file.size)} MB. O limite é 5 MB.` : null;
  if (images.includes(file.type) && file.size > limits.image) return `Mesmo otimizada, a imagem ficou com ${Math.ceil(file.size / 1024)} KB. O limite é 500 KB.`;
  if (file.type === "application/pdf" && file.size > limits.pdf) return `Mesmo otimizado, o PDF ficou com ${mb(file.size)} MB. O limite é 5 MB.`;
  return null;
}

/** Devolve uma versão menor e sem perda visível, ou o próprio arquivo quando não há ganho ou algo falha. */
export async function optimizeFile(file: File, max = limits.image): Promise<File> {
  try {
    const result = images.includes(file.type) ? await image(file, max) : file.type === "application/pdf" ? await pdf(file) : null;
    return result && result.size < file.size ? result : file;
  } catch {
    return file;
  }
}

async function image(file: File, max: number) {
  const head = new TextDecoder("latin1").decode(await file.slice(0, 4096).arrayBuffer());
  // Canvas guarda só o primeiro quadro: APNG e WebP animado seguem como estão.
  if (head.includes("acTL") || head.includes("ANIM")) return null;
  const bitmap = await createImageBitmap(file);
  try {
    // Safari não gera WebP no canvas: lá a saída é JPEG.
    const mime = (await encode(Object.assign(document.createElement("canvas"), { width: 1, height: 1 }), "image/webp", 0.9))?.type === "image/webp" ? "image/webp" : "image/jpeg";
    let best: Blob | null = null, last = 0;
    for (const area of areas) {
      const scale = Math.min(1, Math.sqrt(area / (bitmap.width * bitmap.height)));
      if (scale === last) continue;
      last = scale;
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      const ctx = canvas.getContext("2d")!;
      // JPEG não guarda transparência: sem fundo, ela viraria preto.
      if (mime === "image/jpeg") {
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      for (const quality of qualities) {
        const blob = await encode(canvas, mime, quality);
        if (blob?.type !== mime) return null;
        if (!best || blob.size < best.size) best = blob;
        if (blob.size <= max) return named(blob, file.name, mime);
      }
    }
    return best && named(best, file.name, mime);
  } finally {
    bitmap.close();
  }
}

const encode = (canvas: HTMLCanvasElement, mime: string, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, quality));
// A Edge recusa nome acima de 180 caracteres; a extensão nova pode ser mais longa que a original.
const named = (blob: Blob, name: string, mime: string) =>
  new File([blob], name.replace(/\.[^.]+$/, "").slice(0, 175) + (mime === "image/webp" ? ".webp" : ".jpg"), { type: mime });

async function pdf(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const text = new TextDecoder("latin1").decode(bytes);
  // Regravar invalida a assinatura digital; criptografado exigiria a senha.
  if (text.includes("/ByteRange") || text.includes("/Encrypt")) return null;
  const [{ default: createModule }, { default: wasmUrl }] = await Promise.all([
    import("@neslinesli93/qpdf-wasm"),
    import("@neslinesli93/qpdf-wasm/dist/qpdf.wasm?url"),
  ]);
  const qpdf = (await (createModule as (options: object) => Promise<unknown>)({ locateFile: () => wasmUrl, noInitialRun: true })) as {
    FS: { writeFile: (path: string, data: Uint8Array) => void; readFile: (path: string) => Uint8Array };
    callMain: (args: string[]) => number;
  };
  qpdf.FS.writeFile("/in.pdf", bytes);
  if (qpdf.callMain(pdfArgs) !== 0) return null;
  return new File([qpdf.FS.readFile("/out.pdf") as Uint8Array<ArrayBuffer>], file.name, { type: "application/pdf" });
}
