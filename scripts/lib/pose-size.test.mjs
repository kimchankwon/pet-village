import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { contentBounds, normalizePoseSize } from './pose-animate.mjs';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');

function solid(w, h, color = [40, 160, 220, 255]) {
  const png = new PNG({ width: w, height: h });
  png.data.fill(0);
  // Draw a centered body with 2px margin
  for (let y = 2; y < h - 2; y++) {
    for (let x = 2; x < w - 2; x++) {
      const i = (w * y + x) << 2;
      png.data[i] = color[0];
      png.data[i + 1] = color[1];
      png.data[i + 2] = color[2];
      png.data[i + 3] = 255;
    }
  }
  return png;
}

test('normalizePoseSize matches idle height for same-scale content', () => {
  const idle = solid(40, 60);
  const walk = solid(40, 60);
  const ib = contentBounds(idle);
  const out = normalizePoseSize(walk, {
    refH: ib.y1 - ib.y0 + 1,
    refW: ib.x1 - ib.x0 + 1,
  });
  const ob = contentBounds(out);
  assert.equal(ob.y1 - ob.y0 + 1, ib.y1 - ib.y0 + 1);
});

test('normalizePoseSize clamps oversized walk width (no outline pulse)', () => {
  // Idle body ~36×56 content; walk drawn much wider (same height)
  const idle = solid(40, 60);
  const walkWide = solid(80, 60); // twice as wide
  const ib = contentBounds(idle);
  const refH = ib.y1 - ib.y0 + 1;
  const refW = ib.x1 - ib.x0 + 1;
  const out = normalizePoseSize(walkWide, { refH, refW, maxWidthRatio: 1.08 });
  const ob = contentBounds(out);
  const outW = ob.x1 - ob.x0 + 1;
  // Hard width ceiling (~1.2× idle) shrinks extreme plates so the outline
  // does not breathe — width must not stay near the oversized source.
  assert.ok(outW <= Math.ceil(refW * 1.2) + 2, `width ${outW} ≤ hard max ~${refW * 1.2}`);
  assert.ok(outW < 70, `width ${outW} should shrink from 76px-wide source content`);
});

test('normalizePoseSize pulls undersized poses back toward idle size', () => {
  const idle = solid(40, 60);
  const tiny = solid(20, 30);
  const ib = contentBounds(idle);
  const refH = ib.y1 - ib.y0 + 1;
  const refW = ib.x1 - ib.x0 + 1;
  const out = normalizePoseSize(tiny, { refH, refW, minWidthRatio: 0.9 });
  const ob = contentBounds(out);
  const outH = ob.y1 - ob.y0 + 1;
  // Height should lock near idle (primary).
  assert.ok(Math.abs(outH - refH) <= 3, `height ${outH} should ≈ ${refH}`);
});
