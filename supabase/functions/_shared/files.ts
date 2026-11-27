export const formats: Record<string, { mime: string; max: number }> = {
  // Imagem até 500 KB e PDF até 5 MB, que o navegador otimiza antes do envio; o print do feedback tem teto próprio.
  pdf: { mime: "application/pdf", max: 5 * 1024 * 1024 }, zip: { mime: "application/zip", max: 500 * 1024 * 1024 },
  txt: { mime: "text/plain", max: 500 * 1024 * 1024 }, md: { mime: "text/plain", max: 500 * 1024 * 1024 }, skill: { mime: "text/plain", max: 500 * 1024 * 1024 },
  png: { mime: "image/png", max: 500 * 1024 }, jpg: { mime: "image/jpeg", max: 500 * 1024 }, jpeg: { mime: "image/jpeg", max: 500 * 1024 }, webp: { mime: "image/webp", max: 500 * 1024 },
  mp4: { mime: "video/mp4", max: 500 * 1024 * 1024 }, mp3: { mime: "audio/mpeg", max: 500 * 1024 * 1024 },
};
export function matchesSignature(mime: string, bytes: Uint8Array) {
  const ascii = (start: number, end: number) => new TextDecoder().decode(bytes.slice(start, end));
  if (mime === "application/pdf") return ascii(0, 5) === "%PDF-";
  if (mime === "image/png") return bytes[0] === 137 && ascii(1, 4) === "PNG" && bytes[4] === 13 && bytes[5] === 10 && bytes[6] === 26 && bytes[7] === 10;
  if (mime === "image/jpeg") return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (mime === "image/webp") return ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP";
  if (mime === "video/mp4") return ascii(4, 8) === "ftyp";
  if (mime === "application/zip") return ascii(0, 2) === "PK" && [[3, 4], [5, 6], [7, 8]].some(([a, b]) => bytes[2] === a && bytes[3] === b);
  if (mime === "audio/mpeg") return ascii(0, 3) === "ID3" || (bytes[0] === 255 && (bytes[1] & 224) === 224);
  if (mime === "text/plain") return bytes.length > 0 && bytes.every((b) => b >= 32 || [9, 10, 13].includes(b));
  return false;
}
/** Dimensões lidas do cabeçalho (PNG IHDR; WebP VP8, VP8L ou VP8X), sem decodificar a imagem. Precisa dos 30 primeiros bytes (31 no VP8X). */
export function imageSize(mime: string, bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 30) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), chunk = new TextDecoder().decode(bytes.slice(12, 16));
  if (mime === "image/png") return chunk === "IHDR" ? { width: view.getUint32(16), height: view.getUint32(20) } : null;
  if (mime !== "image/webp") return null;
  if (chunk === "VP8 " && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
  if (chunk === "VP8L" && bytes[20] === 0x2f) { const bits = view.getUint32(21, true); return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 }; }
  // A altura do VP8X é lida com getUint32 a partir do byte 27, então precisa de 31 bytes.
  if (chunk === "VP8X") return bytes.length < 31 ? null : { width: (view.getUint32(24, true) & 0xffffff) + 1, height: (view.getUint32(27, true) & 0xffffff) + 1 };
  return null;
}
