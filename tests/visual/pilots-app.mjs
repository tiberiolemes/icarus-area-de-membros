import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createServer } from 'vite';
import { browserContext, fullScreenshot, launchChrome, pngSize } from './browser.mjs';
import { sha256 } from './pixels.mjs';

process.umask(0o077);
const [outArg] = process.argv.slice(2);
assert(outArg, 'Uso: node tests/visual/pilots-app.mjs DIRETORIO');
const out = resolve(outArg);
const port = Number(process.env.STITCH_APP_PORT || 8247);
assert(Number.isInteger(port) && port >= 1024 && port <= 65535 && ![8088, 8097, 8100, 8197, 8200].includes(port));
const origin = 'http://127.0.0.1:' + port;
const clock = '2026-11-24T12:01:00.000Z';
const expiry = Date.parse(clock) / 1000 + 3600;
const user = { id: '936e8600-06e1-4621-9cef-83c13df2d23a', aud: 'authenticated', role: 'authenticated' };
const token = [{ alg: 'HS256', typ: 'JWT' }, { sub: user.id, exp: expiry, aal: 'aal1' }, 'fixture']
  .map(part => Buffer.from(JSON.stringify(part)).toString('base64url')).join('.');
const session = { access_token: token, refresh_token: 'fixture-only', expires_at: expiry, expires_in: 3600, token_type: 'bearer', user };

const courses = {
  light: 'Aprenda Marketing para seu SaaS',
  dark: 'Marketing para SaaS',
};
const event = {
  id: '10000000-0000-4000-8000-000000000001', title: 'Hot Seat Executivo: Como Estruturar Máquina de Vendas Outbound Enterprise de R$ 0 a R$ 10M ARR',
  guest: 'Convidada da fixture', starts_at: '2026-11-28T22:30:00Z', duration_minutes: 90,
  description: 'Agenda sintética do ensaio local.', can_access: true, can_rsvp: true,
};
const restricted = { id: '10000000-0000-4000-8000-000000000002', starts_at: '2026-12-12T22:30:00Z', can_access: false, can_rsvp: false };
const paths = { catalog: '/app/cursos', events: '/app/encontros-ao-vivo' };

async function prepare(browser, viewport, theme) {
  const context = await browser.newContext({ ...browserContext, viewport, screen: viewport });
  const course = {
    id: 'course', slug: 'marketing-para-saas', title: courses[theme], description: '', cover_url: null,
    status: 'published', access_mode: 'plans', plan_ids: ['pro'], certificate_enabled: false,
    required_lessons: 15, total_lessons: 15, completed_lessons: 9, progress_percent: 60, duration_seconds: 9193, can_access: true,
  };
  let confirmed = false;
  const calls = [];
  const unexpected = [];
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin) {
      unexpected.push(url.hostname);
      return route.abort();
    }
    if (!/^\/(rest|auth|functions)\/v1\//.test(url.pathname)) return route.continue();
    const name = url.pathname.split('/').at(-1);
    const args = request.postDataJSON();
    calls.push({ name, args });
    const reply = json => route.fulfill({ json });
    switch (name) {
      case 'user': return reply(user);
      case 'app_bootstrap': return reply({
        profile: { id: user.id, full_name: 'Alex Vance', avatar_id: null, phone: '', bio: '', company: {}, role: 'member',
          theme, plan_name: 'Membro Pro', access_ends_at: null, suspended: false, onboarding_complete: true },
        plans: [], settings: {},
      });
      case 'app_touch_session': return reply({ expires_at: new Date(expiry * 1000).toISOString(), warning_seconds: 60 });
      case 'app_catalog_showcase': {
        const card = { ...course, state: 'ongoing', module_count: 1, target: {id:'10000000-0000-4000-8000-000000000003',
          title:'Arquitetura de planos', module_title:'Pricing e embalagem', module_slug:'pricing', position_seconds:614} };
        const available = {...course, id:'new', slug:'ia', title:'Fundamentos de IA para Engenharia de Produto',
          completed_lessons:0, progress_percent:0, state:'available', module_count:1, target:{...card.target, position_seconds:0}};
        const restricted = {...course,id:'locked',slug:'design',title:'Design System e UI Avançado',can_access:false,
          state:'restricted',completed_lessons:0,progress_percent:0,module_count:1,target:null};
        return reply({items:[card, available, restricted], total:3, page:1, page_size:20,
          resume:card, counts:{all:3,ongoing:1,completed:0,restricted:1}});
      }
      case 'app_course': return reply({ course, modules: [] });
      case 'app_catalog_launches': return reply([]);
      case 'app_notifications': return reply({ items: [], total: 0, page: 1, page_size: 20, unread_count: 0 });
      case 'app_live_events': return reply({
        items: args.p_recordings ? [] : [{ ...event, confirmed }, restricted], has_more: false,
      });
      case 'app_live_event_rsvp':
        if (args.p_id !== event.id || typeof args.p_confirmed !== 'boolean') break;
        confirmed = args.p_confirmed;
        return reply(confirmed);
    }
    unexpected.push(name);
    return route.fulfill({ status: 501, json: { message: 'Operação fora da fixture.' } });
  });
  await context.addInitScript(value => {
    localStorage.setItem('sb-127-auth-token', JSON.stringify(value));
  }, session);
  const page = await context.newPage();
  await page.clock.setFixedTime(new Date(clock));
  const errors = [];
  page.on('pageerror', error => errors.push(error.name));
  return { context, page, calls, unexpected, errors };
}

async function state(page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    return {
      viewport: { width: innerWidth, height: innerHeight },
      documentWidth: root.scrollWidth,
      scroll: [scrollX, scrollY], dpr: devicePixelRatio, scale: visualViewport.scale,
      theme: root.dataset.theme, focus: document.activeElement?.localName,
      hovered: [...document.querySelectorAll(':hover')].map(element => element.localName),
      fonts: [...document.fonts].filter(font => font.status === 'loaded').map(font => font.family),
    };
  });
}

async function shellTargets(locator) {
  return locator.evaluate(element => Math.min(...[...element.querySelectorAll('button, a, input')]
    .filter(item => item.getClientRects().length && getComputedStyle(item).visibility === 'visible' && !item.classList.contains('skip'))
    .flatMap(item => {
      const { width, height } = item.getBoundingClientRect();
      return [width, height];
    })));
}

async function exercise(browser, settings, commit, target, theme, mobile) {
  const started = performance.now();
  const height = target === 'catalog' ? (theme === 'light' ? 2249 : 2210) : 2237;
  const viewport = mobile ? { width: 360, height: 880 } : { width: 1280, height };
  const { context, page, calls, unexpected, errors } = await prepare(browser, viewport, theme);
  try {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: -1, y: -1 });
    await page.goto(origin + paths[target], { waitUntil: 'load', timeout: 25000 });
    const heading = page.locator('.content h1');
    const name = target === 'catalog' ? courses[theme] : event.title;
    await page.getByRole('heading', { name, exact: true }).waitFor({ timeout: 12000 });
    await page.waitForFunction(() => document.activeElement === document.querySelector('.content h1'));
    await page.waitForLoadState('networkidle');
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].filter(image => image.getClientRects().length).map(image => image.decode()));
    });
    const observed = await state(page);
    assert.deepEqual([observed.theme, observed.viewport, observed.documentWidth, observed.dpr, observed.scroll, observed.hovered],
      [theme, viewport, viewport.width, 1, [0, 0], []]);
    const topbarTarget = await shellTargets(page.locator('.topbar'));
    assert(Number.isFinite(topbarTarget) && topbarTarget >= 44, 'Alvo do cabeçalho menor que 44 px');
    assert.equal(await page.locator('a[href^="/admin"]').count(), 0);

    const prefix = join(out, [target, theme, mobile ? 'mobile' : 'desktop'].join('-'));
    const path = prefix + '.png';
    const png = await fullScreenshot(cdp, viewport);
    writeFileSync(path, png, { flag: 'wx' });
    const result = {
      settings, commit, theme, mobile, role: 'member', state: observed, clock, path,
      png: { ...pngSize(png), sha256: sha256(png) },
      screen: target === 'catalog' ? (theme === 'light' ? 'cursos_aprendizagem_vitrine_eficiente_tema_claro' : 'cursos_aprendizagem_vitrine_eficiente_tema_escuro')
        : theme === 'dark' ? 'encontros_ao_vivo_masterminds' : null,
      stateProof: { equivalent: false, evidence: target === 'catalog' ?
        ['Fixture com três cursos sem capas e sem lançamentos; estados de acesso e retomada simulados.'] :
        ['Fixture com dois encontros, um restrito, e acervo vazio. HTML escuro tem outros dados, gravações e mídia.'] },
      heading: await heading.innerText(), topbarTarget, adminLinks: 0,
    };

    if (mobile) {
      const trigger = page.getByRole('button', { name: 'Abrir navegação' });
      const drawer = page.getByRole('dialog', { name: 'Navegação' });
      await trigger.press('Enter');
      await drawer.waitFor();
      await page.waitForFunction(() => document.querySelector('[role="dialog"]')?.contains(document.activeElement));
      assert.equal(await drawer.getByRole('link', { name: target === 'catalog' ? 'Cursos' : 'Encontros ao vivo', exact: true }).getAttribute('aria-current'), 'page');
      assert.equal(await drawer.locator('a[href^="/admin"]').count(), 0);
      const drawerTarget = await shellTargets(drawer);
      assert(Number.isFinite(drawerTarget) && drawerTarget >= 44, 'Alvo da gaveta menor que 44 px');
      await page.keyboard.press('Escape');
      await drawer.waitFor({ state: 'detached' });
      await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Abrir navegação');
      Object.assign(result, { drawerTarget, drawerKeyboard: true, drawerFocusRestored: true });
    }
    if (target === 'catalog') {
      const link = page.getByRole('link', { name: 'Retomar aula (10:14)' });
      assert.equal(await link.getAttribute('href'), '/app/cursos/marketing-para-saas/pricing/~10000000-0000-4000-8000-000000000003');
      assert.equal(await page.locator('.showcase-grid article').count(), 3);
      await page.getByRole('link', {name:'Começar curso'}).waitFor();
      await page.getByRole('link', {name:'Consultar acesso'}).waitFor();
    }
    if (target === 'events') {
      const restrictedCard = page.locator('article').filter({ has: page.getByRole('heading', { name: 'Encontro restrito' }) });
      await restrictedCard.getByRole('link', { name: 'Ver planos disponíveis' }).waitFor();
      assert.equal(await restrictedCard.getByRole('button', { name: /confirmar presença|entrar na sala/i }).count(), 0);
      const timeOrigin = await page.evaluate(() => performance.timeOrigin);
      await page.getByRole('button', { name: 'Confirmar presença' }).press('Enter');
      await page.getByRole('button', { name: 'Cancelar presença' }).waitFor();
      await page.getByRole('button', { name: 'Cancelar presença' }).press('Enter');
      await page.getByRole('button', { name: 'Confirmar presença' }).waitFor();
      assert.equal(await page.evaluate(() => performance.timeOrigin), timeOrigin);
      assert.deepEqual(calls.filter(call => call.name === 'app_live_event_rsvp').map(({ args }) => args), [
        { p_id: event.id, p_confirmed: true }, { p_id: event.id, p_confirmed: false },
      ]);
      Object.assign(result, { planGate: true, rsvpWithoutReload: true });
    }
    await page.goto(origin + '/admin/encontros');
    await page.getByText('Acesso restrito. Você não tem permissão para abrir esta área.').waitFor();
    assert(!calls.some(call => call.name.startsWith('app_admin')));
    assert.deepEqual(unexpected, []);
    assert.deepEqual(errors, []);
    Object.assign(result, { directAdminDenied: true, durationMs: Math.round(performance.now() - started) });
    writeFileSync(prefix + '.json', JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
    return result;
  } finally {
    await context.close();
  }
}

mkdirSync(out, { mode: 0o700 });
process.env.VITE_SUPABASE_URL = origin;
process.env.VITE_SUPABASE_ANON_KEY = 'fixture-only';
process.env.VITE_ICARUS_UPDATE_REPO = ""; // fixtures recusam hosts externos: sem consulta às Releases do GitHub
const vite = await createServer({
  cacheDir: join(out, 'vite-cache'), clearScreen: false,
  server: { host: '127.0.0.1', port, strictPort: true, hmr: false, watch: null },
});
let browser;
try {
  await vite.listen();
  const launched = await launchChrome();
  browser = launched.browser;
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const results = [];
  for (const target of ['catalog', 'events']) {
    for (const theme of ['light', 'dark']) {
      for (const mobile of [false, true]) {
        const result = await exercise(browser, launched.settings, commit, target, theme, mobile);
        results.push(result);
        console.log(target, theme, mobile ? '360 px' : 'desktop', result.durationMs + ' ms');
      }
    }
  }
  writeFileSync(join(out, 'app.json'), JSON.stringify({ port, results }, null, 2) + '\n', { flag: 'wx' });
} finally {
  await browser?.close();
  await vite.close();
}
