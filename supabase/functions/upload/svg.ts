import { SaxesParser } from "npm:saxes@6.0.0";
import { HttpError } from "../_shared/http.ts";

const ns = "http://www.w3.org/2000/svg";
const xlink = "http://www.w3.org/1999/xlink";
const shapes = new Set("path rect circle ellipse line polyline polygon g use".split(" "));
const elements = new Set([...shapes, ..."svg defs linearGradient radialGradient stop clipPath mask title".split(" ")]);
const geometry = new Set("x y x1 x2 y1 y2 width height cx cy r rx ry fx fy fr offset pathLength".split(" "));
const paint = new Set("fill stroke stop-color color".split(" "));
const lengths = new Set("stroke-width stroke-dashoffset stroke-miterlimit fill-opacity stroke-opacity stop-opacity opacity".split(" "));
const enums: Record<string, string> = {
  "fill-rule": "nonzero evenodd", "clip-rule": "nonzero evenodd",
  "stroke-linecap": "butt round square", "stroke-linejoin": "miter round bevel", "vector-effect": "none non-scaling-stroke",
  "display": "none inline block", "visibility": "visible hidden collapse",
  "gradientUnits": "userSpaceOnUse objectBoundingBox", "spreadMethod": "pad reflect repeat",
  "clipPathUnits": "userSpaceOnUse objectBoundingBox", "maskUnits": "userSpaceOnUse objectBoundingBox",
  "maskContentUnits": "userSpaceOnUse objectBoundingBox", "mask-type": "alpha luminance",
};
const numeric = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g;
const numberSyntax = numeric.source;
const lengthSyntax = new RegExp(`^${numberSyntax}(?:%|px|in|cm|mm|pt|pc)?$`);
const idSyntax = /^[A-Za-z0-9_.:-]{1,100}$/;
const localPaint = /^url\(\s*(['"]?)(#[A-Za-z0-9_.:-]{1,100})\1\s*\)$/i;
const color = /^(?:[A-Za-z]+|#[\da-f]{3,8}|(?:rgb|rgba|hsl|hsla)\([\d.%,+ /-]+\))$/i;
const coordinateLimit = 1_000_000;
const renderSize = 1024;
const maxBytes = 512_000;
const linear = Float32Array.from({ length: 256 }, (_, byte) => {
  const srgb = byte / 255;
  return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
});
type Node = { tag: string; attributes: Map<string, string>; children: Node[]; text: string };
type Box = [number, number, number, number];

const invalid = () => new HttpError(422, "INVALID_FILE", "O SVG está malformado ou usa uma estrutura insegura.");
const complex = () => new HttpError(422, "INVALID_FILE", "O SVG é complexo demais. Reduza a quantidade de formas e referências.");
const blank = () => new HttpError(422, "INVALID_FILE", "O SVG não tem desenho visível. Converta textos em curvas e confira a área da arte.");

function numbers(value: string) {
  const result = [...value.matchAll(numeric)].map(([n]) => Number(n));
  if (result.some((n) => !Number.isFinite(n) || Math.abs(n) > coordinateLimit)) throw complex();
  return result;
}

function numberList(value: string) {
  if (value.replace(numeric, "").replace(/[\s,]+/g, "")) return [];
  return numbers(value);
}

function viewBox(value: string): Box | undefined {
  if (value.length > 256) return;
  const list = numberList(value);
  if (list.length === 4 && list[2] >= 0.001 && list[3] >= 0.001) return list as Box;
}

function length(value: string) {
  return value.length <= 64 && lengthSyntax.test(value) && numbers(value).length === 1;
}

function presentation(name: string, value: string) {
  if (paint.has(name)) return color.test(value) ? value : cleanReference(name, value);
  if (name === "clip-path" || name === "mask") return value === "none" ? value : cleanReference(name, value);
  if (lengths.has(name)) return length(value) ? value : undefined;
  if (name === "stroke-dasharray") {
    if (value === "none" || (value.length <= 512 && value.split(/[\s,]+/).every(length))) return value;
  }
  if (Object.hasOwn(enums, name) && enums[name].split(" ").includes(value)) return value;
}

function cleanReference(name: string, value: string) {
  const internal = localPaint.exec(value);
  if (internal && name !== "color" && name !== "stop-color") return `url(${internal[2]})`;
}

function attribute(name: string, value: string) {
  if (name === "id") return idSyntax.test(value) ? value : undefined;
  if (name === "viewBox") return viewBox(value)?.join(" ");
  if (geometry.has(name)) return length(value) ? value : undefined;
  if (name === "d") {
    if (!/^[Mm]/.test(value) || /[^MmLlHhVvCcSsQqTtAaZz\s,]/.test(value.replace(numeric, ""))) return;
    if (numbers(value).length > 12_000) throw complex();
    return value;
  }
  if (name === "points") {
    const count = numberList(value).length;
    if (count > 12_000) throw complex();
    if (count && count % 2 === 0) return value;
  }
  if (value.length <= 1024 && ["transform", "gradientTransform"].includes(name)) {
    const parts = value.match(/(?:matrix|translate|scale|rotate|skewX|skewY)\([\dEe+.,\s-]+\)/g);
    if (parts && parts.length <= 16 && value.replaceAll(/(?:matrix|translate|scale|rotate|skewX|skewY)\([\dEe+.,\s-]+\)|[\s,]/g, "") === "") {
      numbers(value);
      return value;
    }
  }
  return presentation(name, value);
}

function parse(source: string) {
  const parser = new SaxesParser({ xmlns: true, forceXMLVersion: true, defaultXMLVersion: "1.0" });
  const stack: (Node | null)[] = [];
  let root: Node | undefined;
  let count = 0;
  let removedText = false;
  let namespace = ns;
  parser.on("error", () => { throw invalid(); });
  parser.on("doctype", () => { throw invalid(); });
  parser.on("processinginstruction", () => { throw invalid(); });
  parser.on("xmldecl", ({ version, encoding }) => {
    if (version !== "1.0" || (encoding && !/^utf-8$/i.test(encoding))) throw invalid();
  });
  parser.on("opentag", (tag) => {
    if (++count > 1500 || stack.length >= 24 || Object.keys(tag.attributes).length > 64) throw complex();
    const parent = stack.at(-1);
    if (!stack.length && !tag.uri && !tag.prefix) namespace = "";
    const svgTag = tag.uri === namespace;
    if (!stack.length && (!svgTag || tag.local !== "svg")) throw invalid();
    if (svgTag && tag.local === "text") removedText = true;
    if (!svgTag || !elements.has(tag.local) || parent === null || parent?.tag === "title") {
      stack.push(null);
      return;
    }
    const attributes = new Map<string, string>();
    const node: Node = { tag: tag.local, attributes, children: [], text: "" };
    let style = "";
    const fixedViewport = !parent && Object.values(tag.attributes).some((attr) => !attr.uri && attr.local === "viewBox");
    for (const attr of Object.values(tag.attributes)) {
      const value = attr.value.trim();
      if (attr.local === "href" && (!attr.uri || attr.uri === xlink) && !attributes.has("href") &&
          ["use", "linearGradient", "radialGradient"].includes(node.tag) && value.startsWith("#") && idSyntax.test(value.slice(1))) {
        attributes.set("href", value);
      }
      if (attr.uri || attr.local === "href") continue;
      if (attr.local === "style") { style = value; continue; }
      if (fixedViewport && ["width", "height"].includes(attr.local)) continue;
      if (parent && node.tag === "svg" && attr.local === "preserveAspectRatio" && /^(?:none|x(?:Min|Mid|Max)Y(?:Min|Mid|Max)(?:\s+(?:meet|slice))?)$/.test(value)) {
        attributes.set(attr.local, value);
        continue;
      }
      if (!parent && attr.local === "viewBox" && !viewBox(value)) throw invalid();
      const safe = attribute(attr.local, value);
      if (safe !== undefined) attributes.set(attr.local, safe);
    }
    for (const declaration of style.split(";")) {
      const separator = declaration.indexOf(":");
      if (separator < 0) continue;
      const name = declaration.slice(0, separator).trim().toLowerCase();
      const safe = presentation(name, declaration.slice(separator + 1).trim());
      if (safe !== undefined) attributes.set(name, safe);
    }
    if (parent) parent.children.push(node);
    else root = node;
    stack.push(node);
  });
  parser.on("closetag", () => { stack.pop(); });
  const title = (text: string) => {
    const node = stack.at(-1);
    if (node?.tag === "title") node.text = (node.text + text).slice(0, 240);
  };
  parser.on("text", title);
  parser.on("cdata", title);
  parser.write(source).close();
  if (!root) throw invalid();
  return { root, removedText };
}

function verifyReferences(root: Node) {
  const ids = new Map<string, Node>();
  function index(node: Node) {
    const id = node.attributes.get("id");
    if (id) {
      if (ids.has(id)) throw invalid();
      ids.set(id, node);
    }
    node.children.forEach(index);
  }
  index(root);
  let cost = 0;
  function verify(node: Node, seen: Set<Node>, effects: number) {
    if ((cost += 1 + (node.attributes.get("d")?.length ?? 0) / 100 + (node.attributes.get("points")?.length ?? 0) / 100) > 6000 || seen.size >= 48 || effects > 4) throw complex();
    if (seen.has(node)) throw invalid();
    seen.add(node);
    for (const name of ["href", "fill", "stroke", "clip-path", "mask"]) {
      const value = node.attributes.get(name);
      if (!value || (name !== "href" && !value.startsWith("url("))) continue;
      const target = ids.get(name === "href" ? value.slice(1) : value.slice(5, -1));
      const valid = target && (name === "href" && node.tag === "use" ? shapes.has(target.tag)
        : name === "clip-path" ? target.tag === "clipPath" : name === "mask" ? target.tag === "mask"
        : target.tag === "linearGradient" || target.tag === "radialGradient");
      if (valid) verify(target, seen, effects + Number(name === "clip-path" || name === "mask"));
      else node.attributes.delete(name);
    }
    node.children.forEach((child) => verify(child, seen, effects));
    seen.delete(node);
  }
  verify(root, new Set(), 0);
}

const escape = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
function serialize({ tag, attributes, children, text }: Node): string {
  if (tag === "use" && !attributes.has("href")) return "";
  const attrs = Array.from(attributes, ([key, value]) => ` ${key}="${escape(value)}"`).join("");
  return `<${tag}${attrs}>${escape(text)}${children.map(serialize).join("")}</${tag}>`;
}

function viewport(root: Node): Box {
  const box = viewBox(root.attributes.get("viewBox") ?? "");
  if (box) return box;
  const dimensions = ["width", "height"].map((name) => {
    const value = root.attributes.get(name);
    if (!value) return undefined;
    const match = new RegExp(`^(${numberSyntax})(px|in|cm|mm|pt|pc)?$`).exec(value);
    const units = { px: 1, in: 96, cm: 96 / 2.54, mm: 96 / 25.4, pt: 4 / 3, pc: 16 };
    return match ? Number(match[1]) * units[(match[2] || "px") as keyof typeof units] : undefined;
  });
  const [width, height] = dimensions;
  if (!width || !height || Math.min(width, height) < 0.001 || Math.max(width, height) > coordinateLimit) {
    throw new HttpError(422, "INVALID_FILE", "O SVG precisa de um viewBox válido ou de largura e altura positivas.");
  }
  return [0, 0, width, height];
}

function wrapped(box: Box, content: string) {
  return `<svg xmlns="${ns}" viewBox="${box.join(" ")}" preserveAspectRatio="xMidYMid meet">${content}</svg>`;
}

async function drawingBounds(source: string, box: Box) {
  const [x, y, width, height] = box;
  const scale = renderSize / Math.max(width, height);
  if (Math.min(width, height) * scale < 2) throw complex();
  // O módulo incorpora o WASM e funciona também no empacotamento da Edge via API.
  const { Resvg } = await import("npm:@cf-wasm/resvg@0.4.0/node");
  const renderOptions = { fitTo: { mode: width >= height ? "width" : "height", value: renderSize }, font: { loadSystemFonts: false } } as const;
  const renderer = await Resvg.async(source, renderOptions).catch(() => { throw invalid(); });
  try {
    const rendered = renderer.render();
    try {
      const pixels = rendered.pixels;
      let left = rendered.width, top = rendered.height, right = 0, bottom = 0, painted = 0, contrasting = 0;
      for (let row = 0; row < rendered.height; row++) {
        for (let col = 0; col < rendered.width; col++) {
          const i = (row * rendered.width + col) * 4;
          const alpha = pixels[i + 3];
          if (!alpha) continue;
          left = Math.min(left, col);
          top = Math.min(top, row);
          right = Math.max(right, col + 1);
          bottom = Math.max(bottom, row + 1);
          painted++;
          const luminance = 0.2126 * linear[pixels[i]] + 0.7152 * linear[pixels[i + 1]] + 0.0722 * linear[pixels[i + 2]];
          // Fundo escuro próximo de #151515 e contraste mínimo de 2:1 para a amostra.
          if ((luminance - linear[21]) * alpha / 255 >= linear[21] + 0.05) contrasting++;
        }
      }
      if (!painted) throw blank();
      // Uma amostra de folga mantém as bordas antisserrilhadas após o ajuste.
      const startX = Math.max(0, left - 1) / scale, startY = Math.max(0, top - 1) / scale;
      const endX = Math.min(width, (right + 1) / scale), endY = Math.min(height, (bottom + 1) / scale);
      return { bounds: [x + startX, y + startY, endX - startX, endY - startY] as Box, darkInvisible: contrasting < painted * 0.01 };
    } finally { rendered.free(); }
  } finally { renderer.free(); }
}

export async function normalizeBrandSvg(bytes: Uint8Array, variant: "light" | "dark" | "icon") {
  if (!bytes.length || bytes.length > maxBytes) throw new HttpError(422, "INVALID_FILE", "O SVG precisa ter até 500 KB.");
  let source: string;
  try { source = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { throw invalid(); }
  const { root, removedText } = parse(source);
  verifyReferences(root);
  const box = viewport(root);
  const [x, y, width, height] = box;
  // A viewport interna preserva a escala de porcentagens, recortes e gradientes ao cortar a externa.
  for (const [name, value] of Object.entries({ x, y, width, height, viewBox: box.join(" "), overflow: "hidden" })) {
    root.attributes.set(name, String(value));
  }
  const content = serialize(root);
  const result = await drawingBounds(wrapped(box, content), box);
  let [left, top, cropWidth, cropHeight] = result.bounds;
  const ratio = cropWidth / cropHeight;
  const warnings = [];
  if (removedText) warnings.push("Textos do SVG foram removidos. Converta o texto em curvas no editor antes de reenviar.");
  if (ratio > 12 || ratio < 0.5) warnings.push("A marca tem proporção extrema e pode ficar pequena nos espaços da plataforma.");
  if (variant !== "light" && result.darkInvisible) warnings.push("O desenho tem pouco contraste no tema escuro. Confira a prévia ou escolha uma versão mais clara.");
  if (variant === "icon") {
    const side = Math.max(cropWidth, cropHeight);
    left -= (side - cropWidth) / 2;
    top -= (side - cropHeight) / 2;
    cropWidth = cropHeight = side;
  }
  const svg = wrapped([left, top, cropWidth, cropHeight], content);
  if (new TextEncoder().encode(svg).length > maxBytes) throw complex();
  return { svg, ratio: variant === "icon" ? 1 : ratio, warnings };
}
