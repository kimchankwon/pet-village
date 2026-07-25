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
  const out = normalizePoseSize(walkWide, { refH, refW, maxWidthRatio: 1.08, maxHeightDrift: 0.04 });
  const ob = contentBounds(out);
  const outW = ob.x1 - ob.x0 + 1;
  const outH = ob.y1 - ob.y0 + 1;
  // Height is never sacrificed beyond maxHeightDrift; width is reduced as far
  // as that allows (not left at the full 2× source width).
  assert.ok(outW < 76, `width ${outW} should shrink vs ~76px source content`);
  assert.ok(Math.abs(outH - refH) / refH <= 0.05, `height ${outH} within ~4% of idle ${refH}`);
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

import { walkPose } from './pose-animate.mjs';

/** Build a simple biped: body + left/right feet at bottom. */
function biped() {
  const png = new PNG({ width: 32, height: 40 });
  png.data.fill(0);
  // body
  for (let y = 4; y < 30; y++) {
    for (let x = 10; x < 22; x++) {
      const i = (32 * y + x) << 2;
      png.data[i] = 80; png.data[i + 1] = 160; png.data[i + 2] = 220; png.data[i + 3] = 255;
    }
  }
  // left foot (cols 10-14), right foot (cols 17-21), rows 34-38
  for (let y = 34; y <= 38; y++) {
    for (let x of [10, 11, 12, 13, 14, 17, 18, 19, 20, 21]) {
      const i = (32 * y + x) << 2;
      png.data[i] = 40; png.data[i + 1] = 100; png.data[i + 2] = 180; png.data[i + 3] = 255;
    }
  }
  return png;
}

function footRaise(png) {
  const b = contentBounds(png);
  const mid = b.cx;
  let lMax = 0, rMax = 0, lMin = 1e9, rMin = 1e9;
  for (let y = b.y1 - 6; y <= b.y1; y++) {
    for (let x = b.x0; x <= b.x1; x++) {
      const i = (png.width * y + x) << 2;
      if (png.data[i + 3] < 20) continue;
      if (x < mid) { lMax = Math.max(lMax, y); lMin = Math.min(lMin, y); }
      else { rMax = Math.max(rMax, y); rMin = Math.min(rMin, y); }
    }
  }
  // higher foot = smaller maxY
  if (lMax < rMax - 0.5) return 'L';
  if (rMax < lMax - 0.5) return 'R';
  return 'even';
}

test('walkPose phase 1 and 2 raise opposite feet', () => {
  const idle = biped();
  const w1 = walkPose(idle, 1);
  const w2 = walkPose(idle, 2);
  const r1 = footRaise(w1);
  const r2 = footRaise(w2);
  assert.notEqual(r1, 'even', `walk1 should raise a foot, got ${r1}`);
  assert.notEqual(r2, 'even', `walk2 should raise a foot, got ${r2}`);
  assert.notEqual(r1, r2, `walk phases must alternate feet (got ${r1}/${r2})`);
});
