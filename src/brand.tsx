import { cloneElement, useEffect, type CSSProperties, type ReactElement } from "react";
import { edge, supabase, useRpc } from "./api";
import { useAuth } from "./auth";

export const defaultLogo = import.meta.env.BASE_URL + "brand/icarus-horizontal-preto.svg";
export const defaultIcon = import.meta.env.BASE_URL + "brand/icarus-icone.svg";
export const defaultTouchIcon = import.meta.env.BASE_URL + "brand/icarus-icone-180.png";
const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const assetPath = new RegExp(`^(logo/(light|dark)-${uuid}\\.(png|webp|svg)|icon/${uuid}\\.(png|svg)|signature/${uuid}\\.png)$`);

/** URL pública de logo, ícone ou assinatura no bucket de marca; só aceita o caminho que o servidor gera. */
export function brandAssetUrl(path: unknown) {
  return typeof path === "string" && assetPath.test(path) && supabase ? supabase.storage.from("icarus-brand").getPublicUrl(path).data.publicUrl : null;
}

/** Troca o favicon e o ícone de atalho pelos da instalação; sem eles, ficam os do Icarus que vêm no index.html. */
export function InstallationIcon() {
  // O login limpa o cache das consultas: remontar por sessão refaz a leitura do contexto público.
  const { session } = useAuth();
  return <AppliedIcon key={session?.user.id ?? ""} />;
}

function AppliedIcon() {
  const icon = brandAssetUrl(useRpc<{ icon?: string | null }>("app_public_context").data?.icon);
  useEffect(() => {
    const links = document.head.querySelectorAll<HTMLLinkElement>('link[rel="icon"], link[rel="apple-touch-icon"]');
    for (const link of links) {
      const touch = link.rel === "apple-touch-icon";
      link.href = icon ?? (touch ? defaultTouchIcon : defaultIcon);
      if (!touch) link.type = !icon || icon.endsWith(".svg") ? "image/svg+xml" : "image/png";
    }
  }, [icon]);
  return null;
}

/**
 * Logo da instalação. Com as duas versões, cada imagem leva o tom em que aparece e o CSS
 * mostra a do `data-theme` mais próximo; sem a branca, a colorida vale nos dois temas.
 */
export function brandRatio(value: unknown) {
  return typeof value === "number" && value >= 1 / 4096 && value <= 4096 ? value : undefined;
}

export function BrandImage({ src, alt, ratio, tone }: { src: string; alt: string; ratio?: number; tone?: "light" | "dark" }) {
  const style = ratio ? { "--brand-ratio": ratio } as CSSProperties : undefined;
  return <img className="brand-custom" src={src} alt={alt} style={style}
    data-brand-tone={tone} data-brand-shape={ratio ? ratio < 1.6 ? "compact" : "wide" : undefined}
    loading={tone && "lazy"} referrerPolicy="no-referrer" />;
}

export function BrandLogo({ light, dark, ratios, name, fallback }: {
  light: string | null;
  dark: string | null;
  ratios?: { light?: number; dark?: number };
  name: string;
  fallback: ReactElement<Record<string, unknown>>;
}) {
  if (!dark || dark === light) return light ? <BrandImage src={light} alt={name} ratio={ratios?.light} /> : fallback;
  return <>
    {light ? <BrandImage src={light} alt={name} ratio={ratios?.light} tone="light" />
      : cloneElement(fallback, { "data-brand-tone": "light" })}
    <BrandImage src={dark} alt={name} ratio={ratios?.dark} tone="dark" />
  </>;
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
export const acceptOf = (variant: AssetVariant) => [
  "image/png", ...(assetRules[variant].webp ? ["image/webp"] : []), ...(variant !== "signature" ? ["image/svg+xml"] : []),
].join(",");

export type AssetPreview = { url: string; ratio: number; warnings: string[] };

async function svgPreview(svg: string, ratio: number) {
  const previewError = "Não foi possível preparar a prévia da imagem.";
  try {
    const canvas = document.createElement("canvas");
    const size = 1024;
    canvas.width = Math.max(1, Math.round(size * Math.min(ratio, 1)));
    canvas.height = Math.max(1, Math.round(size * Math.min(1 / ratio, 1)));
    const context = canvas.getContext("2d");
    if (!context) throw new Error(previewError);

    // A fonte SVG fica em uma imagem fora do documento e com origem opaca.
    const image = new Image();
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    await image.decode();
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const raster = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!raster) throw new Error(previewError);
    return URL.createObjectURL(raster);
  } catch {
    throw new Error(previewError);
  }
}

/** Confere tipo pelo conteúdo, tamanho e dimensões antes do envio e devolve a URL da prévia. O servidor confere tudo de novo. */
export async function checkImageFile(file: File, variant: AssetVariant) {
  const rule = assetRules[variant], kinds = rule.webp ? "PNG ou WebP" : "PNG";
  const type = ({ png: "image/png", webp: "image/webp", svg: "image/svg+xml" } as Record<string, string | undefined>)[file.name.split(".").pop()!.toLowerCase()];
  const svg = type === "image/svg+xml";
  const mimeMatches = file.type === type || (svg && ["", "application/octet-stream"].includes(file.type));
  if (!type || !mimeMatches || !acceptOf(variant).split(",").includes(type)) {
    const expected = variant === "signature" ? "PNG" : rule.webp ? "PNG, WebP ou SVG" : "PNG ou SVG";
    throw new Error(`${rule.label} precisa ser ${expected}.`);
  }
  if (!file.size || file.size > 512000) throw new Error(`${rule.label} precisa ter até 500 KB.`);
  if (svg) {
    const body = new FormData();
    body.set("kind", "brand-asset-preview");
    body.set("variant", variant);
    body.set("file", file);
    const preview = await edge<{ svg: string; ratio: number; warnings: string[] }>("upload", body);
    return { url: await svgPreview(preview.svg, preview.ratio), ratio: preview.ratio, warnings: preview.warnings };
  }
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
  return { url: URL.createObjectURL(file), ratio: width / height, warnings: [] };
}
