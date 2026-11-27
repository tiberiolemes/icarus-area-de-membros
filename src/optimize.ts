// Tetos repetidos de propósito na função upload e em app_upload_access: o servidor não confia na tela.
export const limits = { image: 512000, pdf: 5242880, screenshot: 5242880 };
const images = ["image/png", "image/jpeg", "image/webp"];
const pdfArgs = ["--object-streams=generate", "--compress-streams=y", "--recompress-flate", "--compression-level=9", "/in.pdf", "/out.pdf"];

export function overLimit(file: File): string | null {
  if (images.includes(file.type) && file.size > limits.image) return "A imagem passa de 500 KB. Escolha uma menor, em PNG, JPG ou WebP.";
  if (file.type === "application/pdf" && file.size > limits.pdf) return "O PDF passa de 5 MB. Escolha um arquivo menor.";
  return null;
}

/** Devolve uma versão menor e sem perda visível, ou o próprio arquivo quando não há ganho ou algo falha. */
export async function optimizeFile(file: File): Promise<File> {
  try {
    const result = images.includes(file.type) ? await image(file) : file.type === "application/pdf" ? await pdf(file) : null;
    return result && result.size < file.size ? result : file;
  } catch {
    return file;
  }
}

async function image(file: File) {
  const head = new TextDecoder("latin1").decode(await file.slice(0, 4096).arrayBuffer());
  // Canvas guarda só o primeiro quadro: APNG e WebP animado seguem como estão.
  if (head.includes("acTL") || head.includes("ANIM")) return null;
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.9));
  // Navegador sem codificador WebP devolve PNG.
  if (blob?.type !== "image/webp") return null;
  return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".webp", { type: "image/webp" });
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
