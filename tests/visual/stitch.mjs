import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { browserContext, fullScreenshot, launchChrome, pngSize } from './browser.mjs';
import { compareFiles, pixels, sha256 } from './pixels.mjs';

const source = resolve(process.env.STITCH_SOURCE || join(homedir(), 'Documents/Icarus'));
const mobileSource = resolve(process.env.STITCH_MOBILE_SOURCE || join(source, 'stitch_icarus'));
const prior = resolve(process.env.STITCH_PRIOR || join(homedir(), '.local/share/icarus-stitch-qa.26UERlQq/manifesto-v2.json'));
const rank = 'ranking_premia_o_mensal';
const thread = 'comunidade_post_thread_de_respostas';
const pilots = ['cursos_aprendizagem_tema_claro', 'cursos_aprendizagem', 'encontros_ao_vivo_masterminds'];
const clock = '2026-11-24T12:01:00.000Z';
const logoUrlHash = 'b91e2dba4faa450bd4b09bc41ff9bf27a462bbf9cd4a9cfe1678b648ba2186b3';
const logoHash = '1fd3c5a3c820d9b3074e4b3343af8e1f823fc87f56b710bf207e6683f3514b7d';
const threadAvatar = {
  urlSha256: 'b00f472d7115ed7ca288b6f058983822e22957a1eb31c5f7f7b0d28af9f72cb2',
  pngSha256: '93a90d773c5b4fcbf8e5127c8c24f05ebd708393bae8a508c551ffefc3348672',
  selector: 'header img[alt="Profile"]', profile: 'Alex Vance', initials: 'AV',
};
const threadAvatarPng = readFileSync(new URL('./fixtures/p4-thread-avatar-av.png', import.meta.url));
assert.equal(sha256(threadAvatarPng), threadAvatar.pngSha256, 'SHA do avatar aprovado');
const threadAvatarSize = pngSize(threadAvatarPng);
const guides = {
  monochrome_minimalist_saas: 'a635dc30ad3dc127f7bdb46228f15672f63d76a88fd57cb4e14b057f6e1487d7',
  monochrome_minimalist_saas_light_mode: 'd69b57e39a09b976498766b20f317bc8cba5f398c13c9460dfc1132771db6783',
};
const viewportPlan = JSON.parse(readFileSync(new URL('./viewports.json', import.meta.url)));
const packDirectory = pack => 'stitch_prd_interface_design' + (pack === 1 ? '' : ' ' + pack);
const json = value => JSON.stringify(value, null, 2) + '\n';
const writeJson = (path, value) => writeFileSync(path, json(value), { flag: 'wx' });

function inventory() {
  const bytes = readFileSync(prior);
  const priorHash = sha256(bytes);
  assert.equal(priorHash, '1b880e11c9384bf9174734678a8fb0be73c91358ff1819c1cc936672bdd41186', 'SHA do manifesto v2');
  const previous = JSON.parse(bytes);
  const screens = [];
  const designGuides = [];
  for (const pack of [1, 2, 3, 4]) {
    const dir = packDirectory(pack);
    const folders = readdirSync(join(source, dir), { withFileTypes: true }).filter(item => item.isDirectory());
    for (const { name: screen } of folders.sort((a, b) => a.name.localeCompare(b.name))) {
      const paths = join(dir, screen);
      const design = join(paths, 'DESIGN.md');
      if (existsSync(join(source, design))) {
        const hash = sha256(readFileSync(join(source, design)));
        assert.equal(hash, guides[screen], design);
        designGuides.push({ file: design, sha256: hash });
      }
      const htmlPath = join(paths, 'code.html');
      if (!existsSync(join(source, htmlPath))) continue;
      const html = readFileSync(join(source, htmlPath));
      const pngPath = join(paths, 'screen.png');
      const png = readFileSync(join(source, pngPath));
      const nativePng = pngSize(png);
      const entry = previous.inventory.find(item => item.pack === pack && item.screen === screen);
      assert(entry, htmlPath);
      const provenance = { htmlPath, htmlSha256: sha256(html), pngPath, pngSha256: sha256(png), nativePng };
      for (const key of Object.keys(provenance)) assert.deepEqual(provenance[key], entry[key], htmlPath + ' ' + key);
      const text = html.toString();
      const theme = text.match(/<html class="(light|dark)"/)?.[1];
      assert(theme, htmlPath + ' tema');
      const urlHashes = [...text.matchAll(/https:\/\/[^"'\s<>)]+/g)].map(([url]) => sha256(url));
      const logo = urlHashes.includes(logoUrlHash);
      assert.equal(urlHashes.filter(hash => hash === threadAvatar.urlSha256).length,
        pack === 4 && screen === thread ? 1 : 0, htmlPath + ' URL do avatar P4');
      screens.push({ pack, screen, ...provenance, route: entry.route, theme, logo,
        desktop: viewportPlan[screen]?.viewport || nativePng,
        viewportReason: viewportPlan[screen]?.reason || 'Viewport nativo do PNG exportado.',
        previous: previous.screens.find(item => item.screen === screen)?.authority || (entry.skip ? 'fora-do-manifesto-v2' : 'verificado-no-manifesto-v2'),
      });
    }
  }
  assert.deepEqual(screens.map(item => item.screen), previous.inventory.map(item => item.screen));
  assert.equal(screens.length, 28);
  assert.equal(screens.filter(item => item.logo).length, 10);
  assert.equal(designGuides.length, 5);
  assert.equal(new Set(designGuides.map(item => item.sha256)).size, 2);
  return { source, prior, priorSha256: priorHash, designGuides, screens };
}

function inventoryMobile() {
  const designGuides = Object.entries(guides).map(([directory, expected]) => {
    const file = join(directory, 'DESIGN.md');
    const hash = sha256(readFileSync(join(mobileSource, file)));
    assert.equal(hash, expected, file);
    return { file, sha256: hash };
  });
  const screens = readdirSync(mobileSource, { withFileTypes: true })
    .filter(item => item.isDirectory() && /^[a-z0-9_]+_mobile_360_tema_(claro|escuro)$/.test(item.name))
    .map(({ name: screen }) => {
      const htmlPath = join(screen, 'code.html');
      const html = readFileSync(join(mobileSource, htmlPath));
      const pngPath = join(screen, 'screen.png');
      const png = readFileSync(join(mobileSource, pngPath));
      const theme = screen.endsWith('_claro') ? 'light' : 'dark';
      assert.equal(html.toString().match(/<html class="(light|dark)"/)?.[1], theme, htmlPath);
      const logo = [...html.toString().matchAll(/https:\/\/[^"'\s<>)]+/g)].some(([url]) => sha256(url) === logoUrlHash);
      return {
        screen, theme, logo, route: '/mobile/' + screen + '/code.html',
        htmlPath, htmlSha256: sha256(html), pngPath, pngSha256: sha256(png), nativePng: pngSize(png),
      };
    })
    .sort((a, b) => a.screen.localeCompare(b.screen));
  assert(screens.length > 0, 'Nenhum export mobile 360 no pacote');
  return { source: mobileSource, designGuides, screens };
}

async function snapshot(page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    return {
      viewport: { width: innerWidth, height: innerHeight },
      document: { width: root.scrollWidth, height: root.scrollHeight },
      scroll: [scrollX, scrollY], dpr: devicePixelRatio, scale: visualViewport.scale,
      theme: root.dataset.theme || ['light', 'dark'].find(theme => root.classList.contains(theme)),
      focus: document.activeElement?.localName,
      hovered: [...document.querySelectorAll(':hover')].map(el => el.localName),
      ticker: document.getElementById('countdown-ticker')?.textContent.replace(/\s/g, '') || null,
      fonts: [...document.fonts].filter(font => font.status !== 'unloaded')
        .map(({ family, weight, status }) => ({ family, weight, status })),
      images: [...document.images].map(img => ({
        url: img.currentSrc || img.src, width: img.naturalWidth, height: img.naturalHeight,
        complete: img.complete, visible: img.getClientRects().length > 0,
      })),
      animations: document.getAnimations().map(animation => ({
        name: animation.animationName || animation.transitionProperty || 'web-animation',
        time: animation.currentTime, playState: animation.playState,
      })),
    };
  });
}

function resource(url, origin) {
  const parsed = new URL(url);
  return parsed.origin === origin ? { host: 'loopback', path: parsed.pathname }
    : { host: parsed.hostname || parsed.protocol, urlSha256: sha256(url) };
}

async function avatarBox(page) {
  const { url, profile, ...box } = await page.locator(threadAvatar.selector).evaluate(img => {
    const { x, y, width, height } = img.getBoundingClientRect();
    return { url: img.currentSrc, profile: img.parentElement.querySelector('span')?.textContent.trim(),
      x, y, width, height, borderRadius: getComputedStyle(img).borderRadius };
  }, undefined, { timeout: 2000 });
  assert.equal(sha256(url), threadAvatar.urlSha256, 'Origem do avatar no cabeçalho P4');
  assert.equal(profile, threadAvatar.profile, 'Perfil do avatar no cabeçalho P4');
  assert.deepEqual([box.width, box.height], [threadAvatarSize.width, threadAvatarSize.height]);
  return box;
}

async function render(browser, origin, item, viewport, svg, path) {
  const started = performance.now();
  const context = await browser.newContext({ ...browserContext, viewport, screen: viewport });
  try {
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: -1, y: -1 });
    await cdp.send('Input.setIgnoreInputEvents', { ignore: true });
    await cdp.send('Animation.enable');
    await cdp.send('Animation.setPlaybackRate', { playbackRate: 0 });
    const animationIds = new Set();
    cdp.on('Animation.animationStarted', ({ animation }) => animationIds.add(animation.id));
    cdp.on('Animation.animationCanceled', ({ id }) => animationIds.delete(id));
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    if (item.screen === rank) {
      await page.clock.install({ time: new Date('2026-11-24T12:00:00.000Z') });
      await page.clock.pauseAt(new Date(clock));
    }
    const requests = new Map();
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.name));
    page.on('request', req => requests.set(req, { type: req.resourceType(), ...resource(req.url(), origin), outcome: 'pending' }));
    page.on('requestfailed', req => Object.assign(requests.get(req), { outcome: 'failed', error: req.failure()?.errorText }));
    const bodyReads = [];
    page.on('requestfinished', req => bodyReads.push((async () => {
      const entry = requests.get(req);
      const reply = await req.response();
      const status = reply.status();
      entry.status = status;
      entry.outcome = status < 300 ? 'ok' : status < 400 ? 'redirect' : 'http-error';
      if (status < 300) {
        entry.mime = (await reply.headerValue('content-type'))?.split(';')[0];
        const bytes = await reply.body().catch(() => null);
        if (bytes) {
          entry.sha256 = sha256(bytes);
          if (entry.type === 'font' && entry.mime === 'text/html') entry.outcome = 'unexpected-font-response';
        } else {
          entry.outcome = 'body-unavailable';
        }
      }
    })()));
    let logoHits = 0;
    if (item.logo) await context.route(url => sha256(url.href) === logoUrlHash, async route => {
      assert.equal(route.request().resourceType(), 'image');
      logoHits++;
      await route.fulfill({ status: 200, contentType: 'image/svg+xml', body: svg });
    });
    let avatarHits = 0;
    if (item.screen === thread) await context.route(url => sha256(url.href) === threadAvatar.urlSha256, async route => {
      assert.equal(route.request().resourceType(), 'image');
      avatarHits++;
      await route.fulfill({ status: 200, contentType: 'image/png', body: threadAvatarPng });
    });
    const response = await page.goto(origin + item.route, { waitUntil: 'load', timeout: 16000 });
    assert.equal(response.status(), 200);
    assert.equal(sha256(await response.body()), item.htmlSha256, 'Bytes do HTML servido');
    await page.waitForLoadState('networkidle', { timeout: 9000 });
    const undecoded = await page.locator('body').evaluate(async body => {
      body.getBoundingClientRect();
      await document.fonts.ready;
      const images = [...document.images].filter(img => img.complete && img.naturalWidth);
      const decoded = await Promise.allSettled(images.map(img => img.decode()));
      return images.filter((_, index) => decoded[index].status === 'rejected').map(img => img.currentSrc || img.src);
    }, { timeout: 7000 });
    if (animationIds.size) {
      const animations = [...animationIds];
      await cdp.send('Animation.setPaused', { animations, paused: true });
      await cdp.send('Animation.seekAnimations', { animations, currentTime: 0 });
    }
    const before = await snapshot(page);
    assert.deepEqual(before.viewport, viewport);
    assert.deepEqual([before.dpr, before.scale, before.scroll, before.hovered, before.theme], [1, 1, [0, 0], [], item.theme]);
    assert(before.animations.every(animation => animation.time === 0 && animation.playState === 'paused'), 'Animação fora do instante inicial');
    if (item.screen === rank) assert.equal(before.ticker, '07:14:32:45');
    assert.equal(logoHits, item.logo ? 1 : 0);
    if (item.logo) {
      const logo = before.images.find(img => sha256(img.url) === logoUrlHash);
      assert.deepEqual([logo.complete, logo.width, logo.height, undecoded.includes(logo.url)], [true, 610, 160, false]);
    }
    let threadAvatarBox;
    if (item.screen === thread) {
      assert.equal(avatarHits, 1);
      threadAvatarBox = await avatarBox(page);
      const avatar = before.images.find(img => sha256(img.url) === threadAvatar.urlSha256);
      assert.deepEqual([avatar.complete, avatar.visible, avatar.width, avatar.height, undecoded.includes(avatar.url)],
        [true, true, threadAvatarSize.width, threadAvatarSize.height, false]);
    }
    const buffer = await fullScreenshot(cdp, viewport);
    const after = await snapshot(page);
    const changed = Object.keys(before).filter(key => key !== 'animations' && !isDeepStrictEqual(before[key], after[key]));
    assert(!changed.length, 'Estado mudou durante a captura: ' + changed.join(', '));
    // A captura pode retomar o playState nominal, com o tempo do compositor ainda parado.
    const phase = animations => animations.map(({ name, time }) => ({ name, time }));
    const { playbackRate } = await cdp.send('Animation.getPlaybackRate');
    assert.equal(playbackRate, 0, 'Relógio CSS avançou');
    assert.deepEqual(phase(after.animations), phase(before.animations), 'Fase CSS mudou durante a captura');
    if (threadAvatarBox) assert.deepEqual(await avatarBox(page), threadAvatarBox, 'Caixa do avatar mudou durante a captura');
    await Promise.all(bodyReads);
    const images = before.images.map(({ url, ...image }) => ({
      ...image, decoded: Boolean(image.complete && image.width && !undecoded.includes(url)), ...(url && resource(url, origin)),
    }));
    const state = { ...before, images, ...(threadAvatarBox && { threadAvatar: { hits: avatarHits, box: threadAvatarBox } }) };
    const resources = [...requests.values()].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    if (threadAvatarBox) {
      const avatar = resources.find(row => row.urlSha256 === threadAvatar.urlSha256);
      assert.deepEqual([avatar.status, avatar.mime, avatar.sha256], [200, 'image/png', threadAvatar.pngSha256]);
    }
    const unavailable = resources.filter(row => !['ok', 'redirect'].includes(row.outcome));
    const brokenImages = images.filter(img => img.visible && !img.decoded);
    writeFileSync(path, buffer, { flag: 'wx' });
    return {
      path, png: { ...pngSize(buffer), sha256: sha256(buffer) }, sourceSha256: item.htmlSha256,
      durationMs: Math.round(performance.now() - started),
      clock: item.screen === rank ? clock : null, logoHits, state, resources, pageErrors, unavailable, brokenImages,
      animationAfterCapture: { playbackRate, animations: after.animations },
    };
  } finally {
    await context.close();
  }
}

async function capture(out, selection, profile, mode) {
  assert(['RGB', 'RGBA'].includes(mode), 'Indique RGB ou RGBA.');
  const mobileExport = profile === 'mobile-export';
  const mobile = profile !== 'desktop';
  const referenceInventory = mobileExport ? inventoryMobile() : inventory();
  const { screens } = referenceInventory;
  if (mobileExport && selection === 'pilots') selection = 'all';
  const names = selection === 'pilots' ? pilots : selection === 'all' ? screens.map(item => item.screen) : selection.split(',');
  assert(names.every(name => screens.some(item => item.screen === name)), 'Tela desconhecida.');
  const logo = readFileSync(join(source, packDirectory(3), 'icarus_horizontal_preto.svg'));
  assert.equal(sha256(logo), logoHash);
  const cases = screens.filter(item => names.includes(item.screen));
  const documents = new Map(cases.map(item => [item.route, readFileSync(join(referenceInventory.source, item.htmlPath))]));
  const server = createServer((req, res) => {
    const html = documents.get(req.url);
    if (req.method !== 'GET' || !html) return res.writeHead(req.url === '/favicon.ico' ? 204 : 404).end();
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': html.length, 'Cache-Control': 'no-store' }).end(html);
  });
  mkdirSync(out, { mode: 0o700 });
  await new Promise((done, fail) => server.listen(0, '127.0.0.1', done).once('error', fail));
  const port = server.address().port;
  const origin = 'http://127.0.0.1:' + port;
  const started = performance.now();
  let browser;
  try {
    const launched = await launchChrome();
    browser = launched.browser;
    const run = {
      settings: launched.settings,
      commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), port, mobile, mode,
      logo: { urlSha256: logoUrlHash, svgSha256: logoHash },
      ...(mobileExport && { referencePackage: 'mobile-export' }),
      ...(names.includes(thread) && { threadAvatar }), results: [],
    };
    for (const item of cases) {
      const viewport = mobile ? { width: 360, height: 880 } : item.desktop;
      const result = { screen: item.screen, theme: item.theme, viewport, passes: [] };
      if (item.screen === thread && mobile) result.diagnosticOnly = true;
      for (const pass of ['a', 'b']) {
        try {
          const path = join(out, item.screen + '-' + pass + '.png');
          const evidence = await render(browser, origin, item, viewport, logo, path);
          result.passes.push(evidence);
          writeJson(path.replace(/\.png$/, '.json'), evidence);
        } catch (error) {
          result.passes.push({ error: error.message.split('\n')[0].replace(/https?:\/\/\S+/g, '[url]') });
        }
      }
      const [a, b] = result.passes;
      if ([a, b].some(pass => pass.error)) {
        result.status = 'falha-de-captura';
      } else if ([a, b].some(pass => pass.unavailable.length || pass.brokenImages.length || pass.pageErrors.length)) {
        result.status = 'referencia-indisponivel';
      } else if (!isDeepStrictEqual(a.state, b.state) || !isDeepStrictEqual(a.resources, b.resources)) {
        result.status = 'estado-ou-recursos-diferentes';
      } else {
        result.comparison = compareFiles(mode, a.path, b.path);
        result.status = result.comparison.result === 'identico' ? 'referencia-repetivel' : result.comparison.result;
        if (item.screen === thread && result.status === 'referencia-repetivel' && a.png.sha256 !== b.png.sha256) {
          result.status = 'bytes-do-png-diferentes';
        }
      }
      if (mobileExport && [a, b].some(pass => pass.state?.document.width > viewport.width)) {
        result.diagnosticOnly = true;
      }
      run.results.push(result);
      console.log(item.screen, result.status, result.comparison?.differentPixels ?? '', result.passes.map(p => p.durationMs ?? p.error));
    }
    run.durationMs = Math.round(performance.now() - started);
    writeJson(join(out, 'run.json'), run);
    if (run.results.some(result => result.status !== 'referencia-repetivel' || (mobileExport && result.diagnosticOnly))) {
      process.exitCode = 1;
    }
  } finally {
    await browser?.close();
    await new Promise(done => server.close(done));
  }
}

function compareCandidate(referenceRunPath, candidatePath, mode) {
  assert(['RGB', 'RGBA'].includes(mode), 'Indique RGB ou RGBA.');
  const run = JSON.parse(readFileSync(referenceRunPath));
  const candidate = JSON.parse(readFileSync(candidatePath));
  const reference = run.results.find(item => item.screen === candidate.screen);
  if (reference?.status !== 'referencia-repetivel') return { result: reference?.status || 'referencia-indisponivel', mode };
  if (reference.diagnosticOnly) return { result: 'referencia-mobile-em-diagnostico', mode };
  const [pass] = reference.passes;
  const reasons = [];
  if (candidate.referenceSha256 !== pass.png.sha256) reasons.push('SHA da referência');
  const evidence = candidate.stateProof?.evidence;
  if (candidate.stateProof?.equivalent !== true || !Array.isArray(evidence) ||
    !evidence.length || !evidence.every(item => typeof item === 'string' && item.trim())) {
    reasons.push('Evidência de equivalência dos dados, imagens, fontes e estado da UI');
  }
  if (!isDeepStrictEqual(run.settings, candidate.settings)) reasons.push('Configuração do navegador');
  if (pass.clock && pass.clock !== candidate.clock) reasons.push('Relógio fixado');
  for (const key of ['viewport', 'theme', 'dpr', 'scale', 'scroll', 'focus', 'hovered']) {
    if (!isDeepStrictEqual(pass.state[key], candidate.state?.[key])) reasons.push(key);
  }
  if (reasons.length) return { result: 'estado-nao-equivalente', mode, reasons, stateProof: candidate.stateProof };
  const readEvidence = (item, receipt) => {
    const path = join(dirname(receipt), basename(item.path));
    const bytes = readFileSync(path);
    assert.equal(sha256(bytes), item.png.sha256, path);
    return bytes;
  };
  const references = reference.passes.map(item => readEvidence(item, referenceRunPath));
  const qualification = pixels(...references, mode);
  if (qualification.result !== 'identico') return { result: 'referencia-nao-repetivel', mode, qualification };
  return pixels(references[0], readEvidence(candidate, candidatePath), mode);
}

process.umask(0o077);
const [command, arg, selection = 'pilots', profile = 'desktop', mode = 'RGBA'] = process.argv.slice(2);
if (command === 'inventory') process.stdout.write(json(inventory()));
else if (command === 'inventory-mobile') process.stdout.write(json(inventoryMobile()));
else if (command === 'capture' && arg && ['desktop', 'mobile', 'mobile-export'].includes(profile)) {
  await capture(resolve(arg), selection, profile, mode);
} else if (command === 'self-check') {
  const require = createRequire(import.meta.url);
  const { PNG } = require(process.env.STITCH_PNGJS || 'pngjs');
  const image = (r, g, b, a) => PNG.sync.write({ width: 1, height: 1, data: Buffer.from([r, g, b, a]) });
  assert.equal(pixels(image(3, 3, 3, 80), image(3, 3, 3, 81), 'RGBA').differentPixels, 1);
  assert.equal(pixels(image(3, 3, 3, 80), image(3, 3, 3, 81), 'RGB').differentPixels, 0);
  assert.equal(pixels(image(3, 3, 3, 80), image(3, 3, 4, 80), 'RGB').differentPixels, 1);
  assert.equal(pixels(image(3, 3, 3, 80), PNG.sync.write(new PNG({ width: 2, height: 1 })), 'RGBA').differentPixels, null);
  assert.equal(inventory().screens.length, 28);
  assert.deepEqual(threadAvatarSize, { width: 32, height: 32 });
  console.log('Métrica RGB/RGBA, recusa de dimensões incompatíveis e inventário conferidos.');
} else if (command === 'compare' && arg && ['RGB', 'RGBA'].includes(profile)) {
  const result = compareCandidate(arg, selection, profile);
  process.stdout.write(json(result));
  if (result.result !== 'identico') process.exitCode = 1;
} else {
  throw new Error('Uso: stitch.mjs inventory|inventory-mobile|self-check|capture DIRETORIO [pilots|all|TELA,...] [desktop|mobile|mobile-export] [RGBA|RGB] | compare RUN.json CANDIDATE.json RGB|RGBA');
}
