export const formats: Record<string, { mime: string; max: number }> = {
  pdf: { mime: "application/pdf", max: 500 * 1024 * 1024 }, zip: { mime: "application/zip", max: 500 * 1024 * 1024 },
  txt: { mime: "text/plain", max: 500 * 1024 * 1024 }, md: { mime: "text/plain", max: 500 * 1024 * 1024 }, skill: { mime: "text/plain", max: 500 * 1024 * 1024 },
  png: { mime: "image/png", max: 5 * 1024 * 1024 }, jpg: { mime: "image/jpeg", max: 5 * 1024 * 1024 }, jpeg: { mime: "image/jpeg", max: 5 * 1024 * 1024 }, webp: { mime: "image/webp", max: 5 * 1024 * 1024 },
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
