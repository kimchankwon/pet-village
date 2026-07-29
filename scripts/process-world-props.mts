/**
 * Convert Grok Imagine ice-town world props into transparent PNGs for Phaser.
 *
 * Source: scripts/reference/world-props/*.jpg
 * Output: public/assets/world/*.png
 *
 *   npx tsx scripts/process-world-props.mts
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { execFileSync } from 'child_process';
import { cleanSpriteExterior } from './lib/clean-sprite.mjs';
import { repairExternalOutline } from './lib/pixel-outline.mjs';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');

const REF = path.resolve('scripts/reference/world-props');
const OUT = path.resolve('public/assets/world');
const TMP = path.resolve('scripts/tmp/imagine-world');

type RGBA = [number, number, number, number];
const OUTLINE: RGBA = [0, 0, 0, 255];

/** max edge after crop (keeps buildings large for big in-game scale). */
const TARGETS: Record<string, number> = {
  house: 320,
  shop: 320,
  cafe: 320,
  fountain: 260,
  'skiprope-booth': 280,
  'sled-hill': 280,
  'bump-arena': 280,
  arcade: 260,
  'get-arcade': 260,
  tree: 220,
  dock: 280,
  bench: 180,
  streetlamp: 200,
  mailbox: 140,
  barrel: 120,
  crate: 120,
  signpost: 140,
  rock: 120,
  bush: 130,
};

function blank(w: number, h: number) {
  const png = new PNG({ width: w, height: h });
  png.data.fill(0);
  return png;
}

function get(png: InstanceType<typeof PNG>, x: number, y: number): RGBA {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) return [0, 0, 0, 0];
  const i = (png.width * y + x) << 2;
  return [png.data[i]!, png.data[i + 1]!, png.data[i + 2]!, png.data[i + 3]!];
}

function set(png: InstanceType<typeof PNG>, x: number, y: number, c: RGBA) {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) return;
  const i = (png.width * y + x) << 2;
  png.data[i] = c[0];
  png.data[i + 1] = c[1];
  png.data[i + 2] = c[2];
  png.data[i + 3] = c[3];
}

function clone(src: InstanceType<typeof PNG>) {
  const out = blank(src.width, src.height);
  src.data.copy(out.data);
  return out;
}

/** Magenta / corner-matched exterior key (same idea as penguin plates). */
function removeExterior(src: InstanceType<typeof PNG>): InstanceType<typeof PNG> {
  const out = clone(src);
  const w = src.width;
  const h = src.height;
  const exterior = new Uint8Array(w * h);
  const queue: number[] = [];
  const corners = [get(src, 2, 2), get(src, w - 3, 2), get(src, 2, h - 3), get(src, w - 3, h - 3)];
  const bgLike = (c: RGBA) => {
    if (c[3]! < 20) return true;
    // Solid Imagine magenta / hot-pink key
    if (c[0]! > 180 && c[2]! > 140 && c[1]! < 140 && c[0]! - c[1]! > 40) return true;
    if (c[0]! > 200 && c[1]! < 80 && c[2]! > 160) return true;
    for (const bg of corners) {
      if (Math.hypot(c[0]! - bg[0]!, c[1]! - bg[1]!, c[2]! - bg[2]!) < 42) return true;
    }
    const avg = corners.reduce((s, b) => s + (b[0]! + b[1]! + b[2]!) / 3, 0) / corners.length;
    const lum = (c[0]! + c[1]! + c[2]!) / 3;
    const sat = Math.max(c[0]!, c[1]!, c[2]!) - Math.min(c[0]!, c[1]!, c[2]!);
    if (sat < 18 && Math.abs(lum - avg) < 28 && lum > 190) return true;
    return false;
  };
  const enq = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = y * w + x;
    if (exterior[i]) return;
    if (!bgLike(get(src, x, y))) return;
    exterior[i] = 1;
    queue.push(i);
  };
  for (let x = 0; x < w; x++) {
    enq(x, 0);
    enq(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    enq(0, y);
    enq(w - 1, y);
  }
  while (queue.length) {
    const i = queue.pop()!;
    const x = i % w;
    const y = (i / w) | 0;
    enq(x + 1, y);
    enq(x - 1, y);
    enq(x, y + 1);
    enq(x, y - 1);
  }
  for (let i = 0; i < w * h; i++) {
    if (!exterior[i]) continue;
    const o = i << 2;
    out.data[o] = 0;
    out.data[o + 1] = 0;
    out.data[o + 2] = 0;
    out.data[o + 3] = 0;
  }
  return out;
}

function contentBounds(png: InstanceType<typeof PNG>, alpha = 20) {
  let minX = png.width;
  let minY = png.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      if (png.data[(png.width * y + x) * 4 + 3]! < alpha) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  return { minX, minY, maxX, maxY };
}

function cropPad(src: InstanceType<typeof PNG>, pad = 6) {
  const b = contentBounds(src);
  if (!b) return src;
  const w = b.maxX - b.minX + 1 + pad * 2;
  const h = b.maxY - b.minY + 1 + pad * 2;
  const out = blank(w, h);
  for (let y = b.minY; y <= b.maxY; y++) {
    for (let x = b.minX; x <= b.maxX; x++) {
      set(out, x - b.minX + pad, y - b.minY + pad, get(src, x, y));
    }
  }
  return out;
}

function scaleToMax(src: InstanceType<typeof PNG>, maxSide: number) {
  const m = Math.max(src.width, src.height);
  if (m <= maxSide) return src;
  const scale = maxSide / m;
  const w = Math.max(1, Math.round(src.width * scale));
  const h = Math.max(1, Math.round(src.height * scale));
  const out = blank(w, h);
  // Nearest-neighbour so outlines stay crisp.
  for (let y = 0; y < h; y++) {
    const sy = Math.min(src.height - 1, Math.floor(y / scale));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(src.width - 1, Math.floor(x / scale));
      set(out, x, y, get(src, sx, sy));
    }
  }
  return out;
}

function jpgToPngBuffer(jpgPath: string): Buffer {
  fs.mkdirSync(TMP, { recursive: true });
  const tmpPng = path.join(TMP, `${path.basename(jpgPath, path.extname(jpgPath))}.raw.png`);
  // sips is available on macOS; converts to PNG without extra deps.
  execFileSync('sips', ['-s', 'format', 'png', jpgPath, '--out', tmpPng], { stdio: 'pipe' });
  return fs.readFileSync(tmpPng);
}

function processOne(name: string) {
  const srcPath = path.join(REF, `${name}.jpg`);
  if (!fs.existsSync(srcPath)) {
    console.warn(`skip missing ${name}`);
    return;
  }
  const buf = jpgToPngBuffer(srcPath);
  let png = PNG.sync.read(buf);
  // Flatten any residual alpha from sips to opaque pixels first.
  for (let i = 0; i < png.width * png.height; i++) {
    const o = i << 2;
    if (png.data[o + 3]! > 0 && png.data[o + 3]! < 255) png.data[o + 3] = 255;
  }
  png = removeExterior(png);
  png = cropPad(png, 8);
  const maxSide = TARGETS[name] ?? 200;
  png = scaleToMax(png, maxSide);
  // cleanSpriteExterior expects Buffer data.
  if (!(png.data instanceof Buffer)) png.data = Buffer.from(png.data);
  cleanSpriteExterior(png, { outline: OUTLINE, tolerance: 48, repairOutline: false });
  png = repairExternalOutline(png, { outline: OUTLINE, tolerance: 48 });
  fs.mkdirSync(OUT, { recursive: true });
  const outPath = path.join(OUT, `${name}.png`);
  fs.writeFileSync(outPath, PNG.sync.write(png));
  console.log(`wrote ${name}.png ${png.width}×${png.height}`);
}

const NAMES = Object.keys(TARGETS);
for (const name of NAMES) processOne(name);
console.log('done');
