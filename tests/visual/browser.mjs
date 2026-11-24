import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
export const browserContext = {
  deviceScaleFactor: 1, colorScheme: 'light', locale: 'pt-BR',
  timezoneId: 'America/Sao_Paulo', reducedMotion: 'no-preference', serviceWorkers: 'block',
};

export async function launchChrome() {
  const packagePath = process.env.STITCH_PLAYWRIGHT || 'playwright';
  const { chromium } = require(packagePath);
  const executablePath = process.env.STITCH_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const headed = process.env.STITCH_HEADED !== '0';
  const chromeArgs = [
    '--force-device-scale-factor=1', '--disable-gpu', '--force-color-profile=srgb', '--disable-threaded-animation',
  ];
  const browser = await chromium.launch({ executablePath, headless: !headed, args: chromeArgs });
  return { browser, settings: {
    browser: browser.version(), node: process.version, os: process.platform + '/' + process.arch, executablePath, headed,
    playwright: require(packagePath + '/package.json').version, chromeArgs, browserContext,
  } };
}

export function pngSize(bytes) {
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', 'Assinatura do PNG');
  assert.equal(bytes.toString('ascii', 12, 16), 'IHDR', 'Cabeçalho do PNG');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

export async function fullScreenshot(cdp, viewport) {
  const { cssContentSize } = await cdp.send('Page.getLayoutMetrics');
  const full = { x: 0, y: 0, width: Math.ceil(cssContentSize.width), height: Math.ceil(cssContentSize.height), scale: 1 };
  assert(full.width >= viewport.width && full.height >= viewport.height, 'Retângulo integral menor que o viewport');
  const { data } = await cdp.send('Page.captureScreenshot', {
    format: 'png', fromSurface: true, captureBeyondViewport: true, clip: full,
  });
  const buffer = Buffer.from(data, 'base64');
  assert.deepEqual(pngSize(buffer), { width: full.width, height: full.height });
  return buffer;
}
