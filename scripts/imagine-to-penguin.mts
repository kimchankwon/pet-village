/**
 * Convert Grok Imagine penguin plates into game-ready source-plate frames.
 *
 * Like MINITEEN `--plate` mode: keep Imagine resolution (capped), transparent
 * bg, shared bottom-aligned canvas per facing so walk frames don't jitter.
 * Phaser scales them with nearest-neighbour — no majority-downsample crush.
 *
 * Source: scripts/reference/penguin/poses/{down,up,side}-{0,1}.png
 * Output: public/assets/player/penguin/{down,up,side}-{0,1}.png
 *
 *   npm run sprite:penguin
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { normalizePoseSize } from './lib/pose-animate.mjs';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');

type RGBA = [number, number, number, number];
const PLATE_MAX_SIDE = 512;
const REF = path.resolve('scripts/reference/penguin/poses');
const OUT = path.resolve('public/assets/player/penguin');
const FACINGS = ['down', 'up', 'side'] as const;
const FRAMES = [0, 1] as const;

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

function removeExterior(src: InstanceType<typeof PNG>): InstanceType<typeof PNG> {
  const out = clone(src);
  const w = src.width;
  const h = src.height;
  const exterior = new Uint8Array(w * h);
  const queue: number[] = [];
  const corners = [get(src, 2, 2), get(src, w - 3, 2), get(src, 2, h - 3), get(src, w - 3, h - 3)];
  const bgLike = (c: RGBA) => {
    if (c[3] < 20) return true;
    for (const bg of corners) {
      if (Math.hypot(c[0] - bg[0], c[1] - bg[1], c[2] - bg[2]) < 28) return true;
    }
    const avg = corners.reduce((s, b) => s + (b[0] + b[1] + b[2]) / 3, 0) / corners.length;
    const lum = (c[0] + c[1] + c[2]) / 3;
    const sat = Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]);
    if (sat < 14 && Math.abs(lum - avg) < 22 && lum > 200) return true;
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
  for (let qi = 0; qi < queue.length; qi++) {
    const i = queue[qi]!;
    const x = i % w;
    const y = (i / w) | 0;
    enq(x + 1, y);
    enq(x - 1, y);
    enq(x, y + 1);
    enq(x, y - 1);
  }
  for (let i = 0; i < w * h; i++) {
    if (exterior[i]) out.data.fill(0, i * 4, i * 4 + 4);
  }
  return out;
}

function contentBounds(src: InstanceType<typeof PNG>) {
  let x0 = src.width;
  let y0 = src.height;
  let x1 = 0;
  let y1 = 0;
  let n = 0;
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      if (get(src, x, y)[3] < 20) continue;
      n++;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
  }
  if (!n) throw new Error('No opaque pixels after keying');
  return {
    x0: Math.max(0, x0 - 1),
    y0: Math.max(0, y0 - 1),
    x1: Math.min(src.width - 1, x1 + 1),
    y1: Math.min(src.height - 1, y1 + 1),
  };
}

function toPlateSprite(raw: InstanceType<typeof PNG>): InstanceType<typeof PNG> {
  const keyed = removeExterior(raw);
  const b = contentBounds(keyed);
  const pad = 6;
  const x0 = Math.max(0, b.x0 - pad);
  const y0 = Math.max(0, b.y0 - pad);
  const x1 = Math.min(keyed.width - 1, b.x1 + pad);
  const y1 = Math.min(keyed.height - 1, b.y1 + pad);
  const cw = x1 - x0 + 1;
  const ch = y1 - y0 + 1;
  const fit = Math.min(1, PLATE_MAX_SIDE / Math.max(cw, ch));
  const tw = Math.max(8, Math.round(cw * fit));
  const th = Math.max(10, Math.round(ch * fit));
  const out = blank(tw, th);
  for (let gy = 0; gy < th; gy++) {
    for (let gx = 0; gx < tw; gx++) {
      const sx = x0 + Math.min(cw - 1, Math.floor((gx / tw) * cw));
      const sy = y0 + Math.min(ch - 1, Math.floor((gy / th) * ch));
      const c = get(keyed, sx, sy);
      if (c[3] >= 20) set(out, gx, gy, [c[0], c[1], c[2], 255]);
    }
  }
  return out;
}

function padBottomCenter(src: InstanceType<typeof PNG>, tw: number, th: number) {
  if (src.width === tw && src.height === th) return src;
  const out = blank(tw, th);
  const ox = Math.floor((tw - src.width) / 2);
  const oy = th - src.height;
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const c = get(src, x, y);
      if (c[3] >= 20) set(out, ox + x, oy + y, c);
    }
  }
  return out;
}

function findPose(facing: string, frame: number): string | null {
  const candidates = [
    path.join(REF, `${facing}-${frame}.png`),
    path.join(REF, `${facing}${frame}.png`),
    // idle plate as frame 0 fallback
    frame === 0 ? path.join(REF, `${facing}-idle.png`) : '',
  ].filter(Boolean);
  return candidates.find((p) => fs.existsSync(p)) ?? null;
}

console.log(`Penguin Imagine → source plate (max ${PLATE_MAX_SIDE}px)`);
fs.mkdirSync(OUT, { recursive: true });

// First pass: load/crop every pose, measure global content height (from front idle).
type FrameKey = `${(typeof FACINGS)[number]}-${(typeof FRAMES)[number]}`;
const rawPlates = new Map<FrameKey, InstanceType<typeof PNG>>();
for (const facing of FACINGS) {
  for (const frame of FRAMES) {
    const p = findPose(facing, frame);
    if (!p) {
      console.error(`Missing ${facing}-${frame}.png under ${REF}`);
      process.exit(1);
    }
    console.log(`  ${facing}-${frame} ← ${path.relative(process.cwd(), p)}`);
    rawPlates.set(`${facing}-${frame}`, toPlateSprite(PNG.sync.read(fs.readFileSync(p))));
  }
}
const front0 = rawPlates.get('down-0')!;
const frontB = contentBounds(front0);
const targetH = frontB.y1 - frontB.y0 + 1;
const targetW = frontB.x1 - frontB.x0 + 1;
const sizeRef = { refH: targetH, refW: targetW };

// Normalize all poses to the same content scale (height + width clamp), then
// pad onto one shared canvas so facing/walk swaps don't pulse the silhouette.
const norms = new Map<FrameKey, InstanceType<typeof PNG>>();
let maxW = 0;
let maxH = 0;
for (const [key, plate] of rawPlates) {
  const n = normalizePoseSize(plate, sizeRef);
  norms.set(key, n);
  if (n.width > maxW) maxW = n.width;
  if (n.height > maxH) maxH = n.height;
}
maxW += 8;
maxH += 8;

for (const facing of FACINGS) {
  for (const frame of FRAMES) {
    const key: FrameKey = `${facing}-${frame}`;
    const padded = padBottomCenter(norms.get(key)!, maxW, maxH);
    const file = path.join(OUT, `${facing}-${frame}.png`);
    fs.writeFileSync(file, PNG.sync.write(padded));
    console.log(`  → ${path.relative(process.cwd(), file)} ${maxW}×${maxH}`);
  }
}
console.log(
  `Done. Shared canvas ${maxW}×${maxH}; contentH ${targetH}. ` +
    'Boot loads these as Imagine plates (nearest-neighbour scale in-game).',
);
