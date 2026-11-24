import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const require = createRequire(import.meta.url);

export function pixels(left, right, mode) {
  assert(['RGB', 'RGBA'].includes(mode), 'Indique RGB ou RGBA.');
  const { PNG } = require(process.env.STITCH_PNGJS || 'pngjs');
  const a = PNG.sync.read(left);
  const b = PNG.sync.read(right);
  const size = ({ width, height }) => [width, height];
  const base = { mode, dimensions: [size(a), size(b)], sha256: [sha256(left), sha256(right)] };
  if (a.width !== b.width || a.height !== b.height) {
    return { ...base, result: 'dimensoes-incompativeis', differentPixels: null };
  }
  let differentPixels = 0;
  let xMin = a.width;
  let yMin = a.height;
  let xMax = -1;
  let yMax = -1;
  for (let i = 0; i < a.data.length; i += 4) {
    if (a.data[i] === b.data[i] && a.data[i + 1] === b.data[i + 1] &&
      a.data[i + 2] === b.data[i + 2] && (mode === 'RGB' || a.data[i + 3] === b.data[i + 3])) continue;
    differentPixels++;
    const x = (i / 4) % a.width;
    const y = Math.floor(i / 4 / a.width);
    xMin = Math.min(xMin, x);
    yMin = Math.min(yMin, y);
    xMax = Math.max(xMax, x);
    yMax = Math.max(yMax, y);
  }
  return {
    ...base, result: differentPixels ? 'diferenca-real' : 'identico',
    totalPixels: a.width * a.height, differentPixels,
    diagnosticBounds: differentPixels ? [xMin, yMin, xMax, yMax] : null,
  };
}

export function compareFiles(mode, left, right) {
  return pixels(readFileSync(left), readFileSync(right), mode);
}
