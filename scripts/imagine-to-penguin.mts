/**
 * Convert Grok Imagine penguin plates into game-ready source-plate frames.
 *
 * Like MINITEEN `--plate` mode: keep Imagine resolution (capped), transparent
 * bg, shared bottom-aligned canvas so walk frames don't jitter.
 * Phaser scales them with nearest-neighbour — no majority-downsample crush.
 *
 * After keying, every plate is run through `repairExternalOutline` so side /
 * back / walk frames share the same clean 1px pure-black rim as the front idle.
 *
 * Source: scripts/reference/penguin/poses/{down,up,side}-{0,1,2}.png
 * Output: public/assets/player/penguin/{down,up,side}-{0,1,2}.png
 *
 * Frame layout (per facing):
 *   0 = idle plant (both feet flat — used when the player stops)
 *   1 = mid-stride, viewer's-left foot raised
 *   2 = mid-stride, viewer's-right foot raised
 * Walk anims cycle frames 1↔2 so steps truly alternate; stop snaps to 0.
 *
 *   npm run sprite:penguin
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { contentBounds as poseContentBounds, normalizePoseSize } from './lib/pose-animate.mjs';
import { repairExternalOutline } from './lib/pixel-outline.mjs';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');

type RGBA = [number, number, number, number];
const PLATE_MAX_SIDE = 512;
/** Shared with wave plates so walk ↔ wave swaps keep the same texture size. */
const TARGET_W = 477;
const TARGET_H = 513;
const REF = path.resolve('scripts/reference/penguin/poses');
const OUT = path.resolve('public/assets/player/penguin');
const FACINGS = ['down', 'up', 'side'] as const;
const FRAMES = [0, 1, 2] as const;
const OUTLINE: RGBA = [0, 0, 0, 255];

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
function asPng(image: { width: number; height: number; data: Buffer | Uint8Array }) {
  const png = blank(image.width, image.height);
  Buffer.from(image.data).copy(png.data);
  return png;
}

/** Magenta / corner-matched / near-white exterior key. */
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
    if (c[0]! > 180 && c[2]! > 140 && c[1]! < 120 && c[0]! - c[1]! > 60) return true;
    for (const bg of corners) {
      if (Math.hypot(c[0]! - bg[0]!, c[1]! - bg[1]!, c[2]! - bg[2]!) < 36) return true;
    }
    const avg = corners.reduce((s, b) => s + (b[0]! + b[1]! + b[2]!) / 3, 0) / corners.length;
    const lum = (c[0]! + c[1]! + c[2]!) / 3;
    const sat = Math.max(c[0]!, c[1]!, c[2]!) - Math.min(c[0]!, c[1]!, c[2]!);
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
      if (get(src, x, y)[3]! < 20) continue;
      n++;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
  }
  if (!n) {
    console.error('No opaque pixels after keying');
    process.exit(1);
  }
  return {
    x0: Math.max(0, x0 - 1),
    y0: Math.max(0, y0 - 1),
    x1: Math.min(src.width - 1, x1 + 1),
    y1: Math.min(src.height - 1, y1 + 1),
  };
}

function toPlateSprite(raw: InstanceType<typeof PNG>): InstanceType<typeof PNG> {
  const keyed = removeExterior(raw);
  // Restore a clean exterior rim (Imagine AA / keying can nibble outline blacks).
  const cleaned = asPng(repairExternalOutline(keyed, { outline: OUTLINE }));
  const b = contentBounds(cleaned);
  const pad = 6;
  const x0 = Math.max(0, b.x0 - pad);
  const y0 = Math.max(0, b.y0 - pad);
  const x1 = Math.min(cleaned.width - 1, b.x1 + pad);
  const y1 = Math.min(cleaned.height - 1, b.y1 + pad);
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
      const c = get(cleaned, sx, sy);
      if (c[3]! >= 20) set(out, gx, gy, [c[0]!, c[1]!, c[2]!, 255]);
    }
  }
  return asPng(repairExternalOutline(out, { outline: OUTLINE }));
}

function padBottomCenter(src: InstanceType<typeof PNG>, tw: number, th: number) {
  if (src.width === tw && src.height === th) return src;
  const out = blank(tw, th);
  const ox = Math.floor((tw - src.width) / 2);
  const oy = th - src.height;
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const c = get(src, x, y);
      if (c[3]! >= 20) set(out, ox + x, oy + y, c);
    }
  }
  return asPng(repairExternalOutline(out, { outline: OUTLINE }));
}

function findPose(facing: string, frame: number): string | null {
  const candidates = [
    path.join(REF, `${facing}-${frame}.png`),
    path.join(REF, `${facing}${frame}.png`),
    frame === 0 ? path.join(REF, `${facing}-idle.png`) : '',
  ].filter(Boolean);
  return candidates.find((p) => fs.existsSync(p)) ?? null;
}

function maxRowWidth(png: InstanceType<typeof PNG>) {
  const b = poseContentBounds(png);
  let maxW = 0;
  for (let y = b.y0; y <= b.y1; y++) {
    let x0 = png.width;
    let x1 = 0;
    for (let x = b.x0; x <= b.x1; x++) {
      if (get(png, x, y)[3]! < 20) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
    }
    if (x1 >= x0) maxW = Math.max(maxW, x1 - x0 + 1);
  }
  return maxW;
}

function blackPct(png: InstanceType<typeof PNG>) {
  let black = 0;
  let opaque = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    if (png.data[i + 3]! < 20) continue;
    opaque++;
    if ((png.data[i]! + png.data[i + 1]! + png.data[i + 2]!) / 3 < 40) black++;
  }
  return opaque ? (100 * black) / opaque : 0;
}

console.log(`Penguin Imagine → source plate (max ${PLATE_MAX_SIDE}px) + outline repair`);
fs.mkdirSync(OUT, { recursive: true });

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
const sizeRef = { refH: targetH, refW: targetW, maxWidthRatio: 1.12, minWidthRatio: 0.82 };

// Normalize all poses to the same content scale (height + width clamp), then
// pad onto the shared 477×513 canvas (same as wave plates).
const norms = new Map<FrameKey, InstanceType<typeof PNG>>();
for (const [key, plate] of rawPlates) {
  const n = asPng(normalizePoseSize(plate, sizeRef));
  const repaired = asPng(repairExternalOutline(n, { outline: OUTLINE }));
  norms.set(key, repaired);
}

for (const facing of FACINGS) {
  for (const frame of FRAMES) {
    const key: FrameKey = `${facing}-${frame}`;
    const padded = padBottomCenter(norms.get(key)!, TARGET_W, TARGET_H);
    const file = path.join(OUT, `${facing}-${frame}.png`);
    fs.writeFileSync(file, PNG.sync.write(padded));
    const b = poseContentBounds(padded);
    console.log(
      `  → ${path.relative(process.cwd(), file)} ${TARGET_W}×${TARGET_H} ` +
        `bodyW=${maxRowWidth(padded)} full ${b.x1 - b.x0 + 1}×${b.y1 - b.y0 + 1} ` +
        `feetY=${b.y1} black=${blackPct(padded).toFixed(1)}%`,
    );
  }
}
console.log(
  `Done. Shared canvas ${TARGET_W}×${TARGET_H}; contentH ${targetH}. ` +
    'Boot loads these as Imagine plates (nearest-neighbour scale in-game).',
);
