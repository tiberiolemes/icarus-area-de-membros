import { cloneElement, type ReactElement } from "react";
import { supabase } from "./api";

export const defaultLogo = import.meta.env.BASE_URL + "brand/icarus-horizontal-preto.svg";
const logoPath = /^logo\/(light|dark)-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|webp)$/;

/** URL pública da logo no bucket de marca; só aceita o caminho que o servidor gera. */
export function brandLogoUrl(path: unknown) {
  return typeof path === "string" && logoPath.test(path) && supabase ? supabase.storage.from("icarus-brand").getPublicUrl(path).data.publicUrl : null;
}

/**
 * Logo da instalação. Com as duas versões, cada imagem leva o tom em que aparece e o CSS
 * mostra a do `data-theme` mais próximo; sem a branca, a colorida vale nos dois temas.
 */
export function BrandLogo({ light, dark, name, fallback }: {
  light: string | null;
  dark: string | null;
  name: string;
  fallback: ReactElement<Record<string, unknown>>;
}) {
  const logo = (src: string, tone?: "light" | "dark") => (
    <img className="brand-custom" src={src} alt={name} data-brand-tone={tone} loading={tone && "lazy"} />
  );
  if (!dark || dark === light) return light ? logo(light) : fallback;
  return <>{light ? logo(light, "light") : cloneElement(fallback, { "data-brand-tone": "light" })}{logo(dark, "dark")}</>;
}

/** Área da logo no certificado exportado (305 × 80 px a partir de 100, 96), sem distorcer. */
export function logoBox(width: number, height: number) {
  return width / height >= 305 / 80
    ? { x: 100, y: 96, width: 305, height: (305 * height) / width }
    : { x: 100, y: 96, width: (80 * width) / height, height: 80 };
}

export const logoHint = "PNG ou WebP, até 500 KB. Mínimo de 240 × 60 px; recomendado 960 × 240 px (proporção 4:1), com fundo transparente.";

/** Confere tipo pelo conteúdo, tamanho e dimensões antes do envio e devolve a URL da prévia. O servidor confere tudo de novo. */
export async function checkLogoFile(file: File) {
  const type = ({ png: "image/png", webp: "image/webp" } as Record<string, string | undefined>)[file.name.split(".").pop()!.toLowerCase()];
  if (!type || file.type !== type) throw new Error("A logo precisa ser PNG ou WebP.");
  if (!file.size || file.size > 512000) throw new Error("A logo precisa ter até 500 KB.");
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer()), ascii = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
  const real = type === "image/png" ? [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte) : ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP";
  if (!real) throw new Error("O conteúdo do arquivo não é um PNG ou WebP válido.");
  let image: ImageBitmap;
  try {
    image = await createImageBitmap(file);
  } catch {
    throw new Error("Não foi possível ler esta imagem. Escolha outro PNG ou WebP.");
  }
  const { width, height } = image;
  image.close();
  if (width < 240 || height < 60 || width > 4096 || height > 4096) throw new Error("A logo precisa ter pelo menos 240 × 60 px e no máximo 4096 px de cada lado.");
  return URL.createObjectURL(file);
}
