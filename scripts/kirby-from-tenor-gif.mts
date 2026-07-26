/**
 * Kirby pet frames traced from the Tenor walk GIF.
 *
 * Source GIF: https://tenor.com/view/kirby-walk-gif-19699240
 *   scripts/reference/kirby/tenor-kirby-walk.gif (128×128, 10 frames)
 * User ref (matches GIF f0): scripts/reference/kirby/user-walk-frame.png
 *
 * Pipeline:
 *   1) Extract frames: python3 scripts/extract-kirby-gif-frames.py
 *   2) This script: 4×4 majority downsample → 32×32, walk1–walk10 + idles/expressions
 *
 * Run: npx tsx scripts/kirby-from-tenor-gif.mts
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { saveSprite } from './lib/save-sprite.mjs';
import {
  clonePng,
  contentBounds,
  getPx,
  setPx,
  shiftSprite,
  happyPose,
  sadPose,
  sleepPose,
  jumpPose,
} from './lib/pose-animate.mjs';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');

type RGBA = [number, number, number, number];
const OUT: RGBA = [0, 0, 0, 255];
const W = 32;
const H = 32;
const GIF_FRAMES = 10;
const REF = path.resolve('scripts/reference/kirby');
const FRAME_DIR = path.join(REF, 'gif-frames');
const ROOT = path.resolve('public/assets/pet/kirby');

function blank(w = W, h = H) {
  const png = new PNG({ width: w, height: h });
  png.data.fill(0);
  return png;
}

function isBg(c: RGBA): boolean {
  if (c[3] < 20) return true;
  const lum = (c[0] + c[1] + c[2]) / 3;
  const sat = Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]);
  return sat < 22 && lum > 230;
}

function quant(c: RGBA): RGBA {
  if (c[0] + c[1] + c[2] < 90) return OUT;
  return [
    Math.min(255, Math.round(c[0] / 8) * 8),
    Math.min(255, Math.round(c[1] / 8) * 8),
    Math.min(255, Math.round(c[2] / 8) * 8),
    255,
  ];
}

/** Dominant non-bg color in a block; outline if ≥35% of opaque cells are dark. */
function blockMajority(
  src: InstanceType<typeof PNG>,
  x0: number,
  y0: number,
  size: number,
): RGBA | null {
  const votes = new Map<string, { c: RGBA; n: number }>();
  let dark = 0;
  let total = 0;
  for (let y = y0; y < y0 + size && y < src.height; y++) {
    for (let x = x0; x < x0 + size && x < src.width; x++) {
      const raw = getPx(src, x, y) as RGBA;
      if (isBg(raw)) continue;
      total++;
      if (raw[0] + raw[1] + raw[2] < 90) dark++;
      const c = quant(raw);
      const k = c.join(',');
      const cur = votes.get(k);
      if (cur) cur.n++;
      else votes.set(k, { c, n: 1 });
    }
  }
  if (total === 0) return null;
  if (dark / total >= 0.35) return OUT;
  let best: { c: RGBA; n: number } | null = null;
  for (const v of votes.values()) {
    if (!best || v.n > best.n) best = v;
  }
  return best?.c ?? null;
}

function gifFrameToSprite(src: InstanceType<typeof PNG>): InstanceType<typeof PNG> {
  if (src.width !== 128 || src.height !== 128) {
    throw new Error(`Expected 128×128 GIF frame, got ${src.width}×${src.height}`);
  }
  const grid: (RGBA | null)[][] = Array.from({ length: 32 }, () => Array(32).fill(null));
  for (let gy = 0; gy < 32; gy++) {
    for (let gx = 0; gx < 32; gx++) {
      grid[gy]![gx] = blockMajority(src, gx * 4, gy * 4, 4);
    }
  }
  let x0 = 32;
  let y0 = 32;
  let x1 = 0;
  let y1 = 0;
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      if (!grid[y]![x]) continue;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
  }
  const dy = 30 - y1;
  const cx = (x0 + x1) / 2;
  const dx = Math.round(15.5 - cx);
  const out = blank();
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      const c = grid[y]![x];
      if (!c) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      setPx(out, nx, ny, c);
    }
  }
  // Fill 1px interior holes
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      if ((getPx(out, x, y) as RGBA)[3] > 0) continue;
      let n = 0;
      let sr = 0;
      let sg = 0;
      let sb = 0;
      for (const [ox, oy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const c = getPx(out, x + ox, y + oy) as RGBA;
        if (c[3] > 0 && c[0] + c[1] + c[2] > 100) {
          n++;
          sr += c[0];
          sg += c[1];
          sb += c[2];
        }
      }
      if (n >= 3) setPx(out, x, y, [Math.round(sr / n), Math.round(sg / n), Math.round(sb / n), 255]);
    }
  }
  return out;
}

function readFrame(i: number): InstanceType<typeof PNG> {
  const p = path.join(FRAME_DIR, `f${String(i).padStart(3, '0')}.png`);
  if (!fs.existsSync(p)) {
    throw new Error(
      `Missing ${p}. Run: python3 scripts/extract-kirby-gif-frames.py`,
    );
  }
  return PNG.sync.read(fs.readFileSync(p));
}

function write(pose: string, png: InstanceType<typeof PNG>) {
  const dest = path.join(ROOT, `${pose}.png`);
  // Light outline repair only — majority already encodes the GIF outline.
  saveSprite(png, dest, { repairOutline: true, outline: OUT, cleanExterior: true });
  console.log('wrote', dest);
}

fs.mkdirSync(ROOT, { recursive: true });
const walkSprites: InstanceType<typeof PNG>[] = [];
for (let i = 0; i < GIF_FRAMES; i++) {
  const sprite = gifFrameToSprite(readFrame(i));
  walkSprites.push(sprite);
  write(`walk${i + 1}`, sprite);
}

const idle = clonePng(walkSprites[0]!);
write('neutral1', idle);
const b = contentBounds(idle);
const neutral2 = b.y1 < H - 1 ? shiftSprite(idle, 0, 1) : clonePng(idle);
write('neutral2', neutral2);

const opts = { ink: OUT, accent: [255, 140, 170, 255] as RGBA };
write('happy', happyPose(idle, opts));
write('sad', sadPose(idle, opts));
write('sleep', sleepPose(idle, opts));
write('jump', jumpPose(idle, opts));

for (const pose of ['neutral1', 'walk1', 'walk5', 'walk10'] as const) {
  const png = PNG.sync.read(fs.readFileSync(path.join(ROOT, `${pose}.png`)));
  const bb = contentBounds(png);
  console.log(`  ${pose}: ${bb.x1 - bb.x0 + 1}×${bb.y1 - bb.y0 + 1}`);
}
console.log('Done — Tenor GIF f0–f9 → walk1–walk10 (user ref = f0 / walk1).');
