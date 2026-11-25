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
