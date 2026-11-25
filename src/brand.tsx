import { cloneElement, useEffect, type ReactElement } from "react";
import { supabase, useRpc } from "./api";

export const defaultLogo = import.meta.env.BASE_URL + "brand/icarus-horizontal-preto.svg";
export const defaultIcon = import.meta.env.BASE_URL + "brand/icarus-icone.svg";
export const defaultTouchIcon = import.meta.env.BASE_URL + "brand/icarus-icone-180.png";
const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const assetPath = new RegExp(`^(logo/(light|dark)-${uuid}\\.(png|webp)|(icon|signature)/${uuid}\\.png)$`);

/** URL pública de logo, ícone ou assinatura no bucket de marca; só aceita o caminho que o servidor gera. */
export function brandAssetUrl(path: unknown) {
  return typeof path === "string" && assetPath.test(path) && supabase ? supabase.storage.from("icarus-brand").getPublicUrl(path).data.publicUrl : null;
}

/** Troca o favicon e o ícone de atalho pelos da instalação; sem eles, ficam os do Icarus que vêm no index.html. */
export function InstallationIcon() {
  const icon = brandAssetUrl(useRpc<{ icon?: string | null }>("app_public_context").data?.icon);
  useEffect(() => {
    const links = document.head.querySelectorAll<HTMLLinkElement>('link[rel="icon"], link[rel="apple-touch-icon"]');
    for (const link of links) {
      const touch = link.rel === "apple-touch-icon";
      link.href = icon ?? (touch ? defaultTouchIcon : defaultIcon);
      if (!touch) link.type = icon ? "image/png" : "image/svg+xml";
    }
  }, [icon]);
  return null;
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

export type AssetVariant = "light" | "dark" | "icon" | "signature";
// As mesmas regras da Edge upload, que confere tudo de novo.
const assetRules: Record<AssetVariant, { webp: boolean; square: boolean; min: [number, number]; max: number; size: string; label: string }> = {
  light: { webp: true, square: false, min: [240, 60], max: 4096, size: "ter pelo menos 240 × 60 px e no máximo 4096 px de cada lado", label: "A logo" },
  dark: { webp: true, square: false, min: [240, 60], max: 4096, size: "ter pelo menos 240 × 60 px e no máximo 4096 px de cada lado", label: "A logo" },
  icon: { webp: false, square: true, min: [180, 180], max: 4096, size: "ser quadrado, com pelo menos 180 × 180 px e no máximo 4096 px", label: "O ícone" },
  signature: { webp: false, square: false, min: [200, 60], max: 2000, size: "ter pelo menos 200 × 60 px e no máximo 2000 px de cada lado", label: "A assinatura" },
};
export const acceptOf = (variant: AssetVariant) => assetRules[variant].webp ? "image/png,image/webp" : "image/png";

/** Confere tipo pelo conteúdo, tamanho e dimensões antes do envio e devolve a URL da prévia. O servidor confere tudo de novo. */
export async function checkImageFile(file: File, variant: AssetVariant) {
  const rule = assetRules[variant], kinds = rule.webp ? "PNG ou WebP" : "PNG";
  const type = ({ png: "image/png", webp: "image/webp" } as Record<string, string | undefined>)[file.name.split(".").pop()!.toLowerCase()];
  if (!type || file.type !== type || (type === "image/webp" && !rule.webp)) throw new Error(`${rule.label} precisa ser ${kinds}.`);
  if (!file.size || file.size > 512000) throw new Error(`${rule.label} precisa ter até 500 KB.`);
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer()), ascii = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
  const real = type === "image/png" ? [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte) : ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP";
  if (!real) throw new Error(`O conteúdo do arquivo não é um ${kinds} válido.`);
  let image: ImageBitmap;
  try {
    image = await createImageBitmap(file);
  } catch {
    throw new Error(`Não foi possível ler esta imagem. Escolha outro ${kinds}.`);
  }
  const { width, height } = image;
  image.close();
  if (width < rule.min[0] || height < rule.min[1] || width > rule.max || height > rule.max || (rule.square && width !== height)) {
    throw new Error(`${rule.label} precisa ${rule.size}.`);
  }
  return URL.createObjectURL(file);
}
