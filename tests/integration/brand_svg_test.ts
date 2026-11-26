import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1.0.19";
import { normalizeBrandSvg } from "../../supabase/functions/upload/svg.ts";

const svg = (body: string, root = 'viewBox="0 0 400 200"') =>
  `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ${root}>${body}</svg>`;
const baseline = '<rect x="50" y="50" width="300" height="100" fill="#fff"/>';
const normalize = (source: string, variant: "light" | "dark" | "icon" = "light") =>
  normalizeBrandSvg(new TextEncoder().encode(source), variant);

Deno.test("SVG: conserva pintura, gradiente, recorte e use interno e corta a margem visível", async () => {
  const source = svg(`<defs>
    <linearGradient id="g"><stop stop-color="#f00"/><stop offset="1" stop-color="#00f"/></linearGradient>
    <clipPath id="c"><rect x="25%" y="25%" width="50%" height="50%"/></clipPath>
    <rect id="shape" width="100%" height="100%"/>
    </defs><use xlink:href="#shape" style="fill:url('#g');clip-path:url(#c)" />`,
    'viewBox="0 0 400 200" width="120" height="1000000000" preserveAspectRatio="none"');
  const result = await normalize(source);
  assert(Math.abs(result.ratio - 2) < 0.05, String(result.ratio));
  assert(result.svg.includes('<linearGradient id="g">'));
  assert(result.svg.includes('<clipPath id="c">'));
  assert(result.svg.includes('href="#shape"'));
  assert(result.svg.includes('fill="url(#g)"'));
  assert(result.svg.includes('viewBox="0 0 400 200"'));
  assert(!result.svg.includes('width="120"'));
  assert(!result.svg.includes('preserveAspectRatio="none"'));
});

Deno.test("SVG: mantém só elementos, atributos e referências de desenho permitidos", async () => {
  const result = await normalize(svg(`<!-- comentário --><title>Marca &amp; Cursos</title>
    <script>alert("teste")</script><foreignObject><p xmlns="http://www.w3.org/1999/xhtml">texto</p></foreignObject>
    <image href="https://example.test/imagem.svg"/><style>@import "https://example.test/fonte.css";</style>
    <animate attributeName="href" values="javascript:alert(1)"/>
    <g onload="alert(1)" style="stroke:url(https://example.test/x);font-family:externa">
      <use href="javascript:alert(1)"/><use xlink:href="https://example.test/x.svg#logo"/>${baseline}
    </g>`));
  for (const forbidden of ["<!--", "<script", "foreignObject", "<image", "@import", "<style", "<animate", "onload", "example.test", "javascript:", "font-family", "<use"]) {
    assert(!result.svg.includes(forbidden), forbidden);
  }
  assert(result.svg.includes("<title>Marca &amp; Cursos</title>"));
});

Deno.test("SVG: recusa DTD, XML malformado, HTML anexado, UTF-8 inválido e excesso de nós ou referências", async () => {
  for (const source of [
    '<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///fixture-inexistente">]>' + svg('&x;' + baseline),
    svg('<g><path></g>'),
    svg(baseline) + '<html><body>conteúdo</body></html>',
    svg('<rect width="1" height="1"/>'.repeat(1800)),
    svg('<defs><g id="cycle"><use href="#cycle"/></g></defs><use href="#cycle"/>' + baseline),
    svg('<g id="a"><use href="#b"/></g><g id="b"><use href="#a"/></g>' + baseline),
    svg('<rect width="1" height="1"/><rect id="x"/><rect id="x"/>'),
    svg('<rect width="1" height="1"/>', 'viewBox="0 0 0 200"'),
  ]) await assertRejects(() => normalize(source), Error, "SVG");
  await assertRejects(() => normalizeBrandSvg(Uint8Array.of(255, 255), "light"), Error, "SVG");
});

Deno.test("SVG: avisa sobre texto, proporção extrema e pouco contraste e centraliza o ícone", async () => {
  const source = svg('<text x="1" y="1">Marca</text><rect x="100" y="100" width="200" height="10" fill="#000"/>');
  const logo = await normalize(source, "dark");
  assert(logo.ratio > 12, String(logo.ratio));
  assertEquals(logo.warnings.length, 3);
  assert(!logo.svg.includes("<text"));
  const icon = await normalize(source, "icon");
  assertEquals(icon.ratio, 1);
  assert(icon.svg.includes('preserveAspectRatio="xMidYMid meet"'));
});

Deno.test("SVG: conserva visualmente degradê, clipPath e use e identifica magenta visível no escuro", async () => {
  const source = svg(`<defs>
    <linearGradient id="g" gradientUnits="userSpaceOnUse" x1="0" x2="400" y1="0" y2="0">
      <stop stop-color="#a000ef"/><stop offset="1" stop-color="#f000a0"/>
    </linearGradient>
    <clipPath id="c"><rect x="100" y="50" width="200" height="100"/></clipPath>
    <rect id="shape" width="400" height="200"/>
    </defs><use xlink:href="#shape" fill="url(#g)" clip-path="url(#c)"/>`);
  const cleaned = await normalize(source, "dark");
  assertEquals(cleaned.warnings, []);
  const { Resvg } = await import("npm:@cf-wasm/resvg@0.4.0/node");
  const originalImage = await Resvg.async(source);
  const cleanImage = await Resvg.async(cleaned.svg);
  const original = originalImage.render(), cropped = cleanImage.render();
  try {
    const sample = (image: typeof original, x: number, y: number) =>
      [...image.pixels.slice((y * image.width + x) * 4, (y * image.width + x) * 4 + 4)];
    assert(Math.abs(cropped.width - 200) <= 2);
    assert(Math.abs(cropped.height - 100) <= 2);
    for (const x of [20, 100, 180]) {
      const before = sample(original, x + 100, 100);
      const after = sample(cropped, x, 50);
      assertEquals(after[3], 255);
      assert(before.every((value, channel) => Math.abs(value - after[channel]) <= 2));
    }
  } finally {
    original.free(); cropped.free(); originalImage.free(); cleanImage.free();
  }
});
