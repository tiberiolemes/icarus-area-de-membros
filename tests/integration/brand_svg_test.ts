import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1.0.19";
import { HttpError } from "../../supabase/functions/_shared/http.ts";
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
    // A margem de uma amostra da Edge também aparece na imagem reescalada para o tamanho do original.
    assert(Math.abs(cropped.width - 200) <= 4);
    assert(Math.abs(cropped.height - 100) <= 4);
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

Deno.test("SVG: recusa rapidamente 900 máscaras e limita o total de recortes", async () => {
  const cases = [
    [
      "900 máscaras",
      '<mask id="m"><rect width="400" height="200" fill="#fff"/></mask>',
      '<rect mask="url(#m)" width="400" height="200" fill="#123456"/>'.repeat(900),
    ],
    [
      "33 recortes",
      '<clipPath id="c"><rect width="400" height="200"/></clipPath>',
      '<rect clip-path="url(#c)" width="400" height="200"/>'.repeat(33),
    ],
  ];
  for (const [label, definition, shapes] of cases) {
    const started = performance.now();
    const error = await assertRejects(() => normalize(svg(`<defs>${definition}</defs>${shapes}`)), HttpError, "até 32 camadas de composição");
    const elapsed = performance.now() - started;
    assertEquals(error.status, 422);
    assert(elapsed < 1000, `${label}: ${elapsed} ms`);
    console.log(`${label}: HTTP ${error.status} em ${Math.round(elapsed)} ms`);
  }
});

Deno.test("SVG: conta cada SVG aninhado e opacidade de composição, inclusive em expansões de use", async () => {
  const nested = '<svg width="10" height="10"><rect width="10" height="10"/></svg>';
  const translucent = '<g style="opacity: 50%"><rect width="10" height="10"/></g>';
  const shapeOpacity = '<rect opacity="0.9" width="10" height="10"/>';
  for (const layer of [nested, translucent, shapeOpacity]) {
    await assertRejects(() => normalize(svg(layer.repeat(33))), HttpError, "até 32 camadas de composição");
    const template = `<defs><g id="layer">${layer}</g></defs>`;
    await assertRejects(() => normalize(svg(template + '<use href="#layer"/>'.repeat(33))), HttpError, "até 32 camadas de composição");
    assert((await normalize(svg(template + '<use href="#layer"/>'.repeat(32)))).ratio > 0);
  }
});

Deno.test("SVG: opacidade de pintura permanece com preenchimento e traço", async () => {
  const pieces = Array.from({ length: 40 }, (_, i) =>
    `<rect x="${i * 10}" y="1" width="7" height="20" fill="#fa1" stroke="#40f" fill-opacity="50%" stroke-opacity=".75"/>`);
  const cleaned = await normalize(svg(pieces.join("")));
  assert(cleaned.svg.includes('fill-opacity="0.5"'));
  assert(cleaned.svg.includes('stroke-opacity="0.75"'));

  const { Resvg } = await import("npm:@cf-wasm/resvg@0.4.0/node");
  const sample = '<rect x="16" y="16" width="68" height="68" fill="red" stroke="blue" stroke-width="16"';
  const root = 'viewBox="0 0 100 100"';
  for (const [markup, expected] of [
    [sample + ' fill-opacity="0.5" stroke-opacity="0.75"/>', [128, 223]],
    ['<g opacity="0.5">' + sample + '/></g>', [128, 128]],
  ] as const) {
    const tree = await Resvg.async(svg(markup, root));
    const image = tree.render();
    try {
      const alpha = (x: number) => image.pixels[(50 * image.width + x) * 4 + 3];
      assert([alpha(50), alpha(20)].every((value, i) => Math.abs(value - expected[i]) <= 1));
    } finally { image.free(); tree.free(); }
  }
});
