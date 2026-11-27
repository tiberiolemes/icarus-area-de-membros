// Tetos do arquivo otimizado, repetidos de propósito na função upload e em app_upload_access: o servidor não confia na tela.
// O original pode ter até 20 MB, o máximo que a função upload recebe; só o otimizado sobe.
export const limits = { image: 512000, pdf: 5242880, screenshot: 5242880, original: 20971520 };
const maxSide = 2560;
const qualities = [0.9, 0.85, 0.8];
const images = ["image/png", "image/jpeg", "image/webp"];
const pdfArgs = ["--object-streams=generate", "--compress-streams=y", "--recompress-flate", "--compression-level=9", "/in.pdf", "/out.pdf"];

export function overLimit(file: File): string | null {
  return (images.includes(file.type) || file.type === "application/pdf") && file.size > limits.original ? "O arquivo passa de 20 MB. Escolha um menor." : null;
}

/** Confere o arquivo já otimizado, que é o que o servidor guarda. */
export function finalLimit(file: File, screenshot = false): string | null {
  const mb = (bytes: number) => (Math.round((bytes / 1048576) * 10) / 10).toLocaleString("pt-BR");
  if (screenshot) return file.size > limits.screenshot ? `Mesmo otimizado, o print ficou com ${mb(file.size)} MB. O limite é 5 MB.` : null;
  if (images.includes(file.type) && file.size > limits.image) return `Mesmo otimizada, a imagem ficou com ${Math.round(file.size / 1024)} KB. O limite é 500 KB.`;
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
  // Acima de 2560 px o excesso não aparece nem em tela retina; reduzir é o que faz foto de celular caber sem perda visível.
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  let best: Blob | null = null;
  for (const quality of qualities) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
    // Navegador sem codificador WebP devolve PNG.
    if (blob?.type !== "image/webp") return null;
    if (!best || blob.size < best.size) best = blob;
    if (blob.size <= max) break;
  }
  return new File([best!], file.name.replace(/\.[^.]+$/, "") + ".webp", { type: "image/webp" });
}

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
