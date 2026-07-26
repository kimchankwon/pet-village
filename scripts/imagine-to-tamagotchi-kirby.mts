/**
 * Convert Grok Imagine plates for classic Tamagotchi pets (mimitchi / Memetchi
 * freckled style, kuchipatchi, violetchi) and Kirby into 32×32 pet sprites.
 *
 * Sources:
 *   scripts/reference/tamagotchi/<species>/idle-plate.png
 *   scripts/reference/tamagotchi/<species>/poses/walk{1,2}.png
 *   scripts/reference/kirby/user-ref-kirby.png + poses/*
 *
 * Run: npx tsx scripts/imagine-to-tamagotchi-kirby.mts
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { saveSprite } from './lib/save-sprite.mjs';
import { petPosesFromIdle, contentBounds as poseBounds, clonePng } from './lib/pose-animate.mjs';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');

type RGBA = [number, number, number, number];
const OUT: RGBA = [0, 0, 0, 255];
const W = 32;
const H = 32;

function blank(w = W, h = H) {
  const png = new PNG({ width: w, height: h });
  png.data.fill(0);
  return png;
}
function clone(src: InstanceType<typeof PNG>) {
  const out = blank(src.width, src.height);
  src.data.copy(out.data);
  return out;
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

/** Exterior flood-fill: plate bg (white / near-white) reachable from border. */
function removeExterior(src: InstanceType<typeof PNG>): InstanceType<typeof PNG> {
  const out = clone(src);
  const w = src.width;
  const h = src.height;
  const exterior = new Uint8Array(w * h);
  const queue: number[] = [];
  const corners = [get(src, 2, 2), get(src, w - 3, 2), get(src, 2, h - 3), get(src, w - 3, h - 3)];
  const bgLike = (c: RGBA) => {
    if (c[3] < 20) return true;
    // Near-black outline is never background
    if (c[0] + c[1] + c[2] < 90) return false;
    for (const bg of corners) {
      if (Math.hypot(c[0] - bg[0], c[1] - bg[1], c[2] - bg[2]) < 36) return true;
    }
    const lum = (c[0] + c[1] + c[2]) / 3;
    const sat = Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]);
    // Flat white/near-white plate
    if (sat < 18 && lum > 225) return true;
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
    if (!exterior[i]) continue;
    out.data.fill(0, i * 4, i * 4 + 4);
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
  if (!n) {
    throw new Error('No opaque foreground after background removal');
  }
  return {
    x0: Math.max(0, x0 - 1),
    y0: Math.max(0, y0 - 1),
    x1: Math.min(src.width - 1, x1 + 1),
    y1: Math.min(src.height - 1, y1 + 1),
  };
}

function quantize(c: RGBA): RGBA {
  if (c[3] < 20) return [0, 0, 0, 0];
  if (c[0] + c[1] + c[2] < 100) return OUT;
  const step = 12;
  return [
    Math.min(255, Math.round(c[0] / step) * step),
    Math.min(255, Math.round(c[1] / step) * step),
    Math.min(255, Math.round(c[2] / step) * step),
    255,
  ];
}

function majority(
  src: InstanceType<typeof PNG>,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): RGBA {
  const votes = new Map<string, { c: RGBA; n: number }>();
  let dark = 0;
  let total = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const raw = get(src, x, y);
      if (raw[3] < 20) continue;
      total++;
      const lum = (raw[0] + raw[1] + raw[2]) / 3;
      if (lum < 70) dark++;
      const c = quantize(raw);
      const k = c.join(',');
      const cur = votes.get(k);
      if (cur) cur.n++;
      else votes.set(k, { c, n: 1 });
    }
  }
  if (total > 0 && dark / total >= 0.28) return OUT;
  let best: { c: RGBA; n: number } | null = null;
  for (const v of votes.values()) {
    const weight = v.n + (v.c[0] + v.c[1] + v.c[2] > 100 ? 0.3 : 0);
    if (!best || weight > best.n) best = { c: v.c, n: weight };
  }
  return best?.c ?? [0, 0, 0, 0];
}

/**
 * Downsample Imagine plate → 32×32 bottom-aligned pet sprite.
 * Prefer nearest-neighbour after quantize so faces (eyes/mouths) stay sharp;
 * majority sampling was mashing pink mouths into black blobs.
 */
function toGameSprite(raw: InstanceType<typeof PNG>): InstanceType<typeof PNG> {
  const src = removeExterior(raw);
  const b = contentBounds(src);
  const cw = b.x1 - b.x0 + 1;
  const ch = b.y1 - b.y0 + 1;
  const maxW = W - 2;
  const maxH = H - 2;
  const scale = Math.min(maxW / cw, maxH / ch);
  const tw = Math.max(8, Math.round(cw * scale));
  const th = Math.max(10, Math.round(ch * scale));
  const ox = Math.floor((W - tw) / 2);
  const oy = H - 1 - th;
  const out = blank();
  for (let gy = 0; gy < th; gy++) {
    for (let gx = 0; gx < tw; gx++) {
      // Sample cell centre (nearest) — preserves blocky pixel art structure.
      const sx = b.x0 + Math.min(cw - 1, Math.floor(((gx + 0.5) / tw) * cw));
      const sy = b.y0 + Math.min(ch - 1, Math.floor(((gy + 0.5) / th) * ch));
      const rawPx = get(src, sx, sy);
      if (rawPx[3] < 20) {
        // Fallback: majority if centre is transparent (anti-aliased edge)
        const sx0 = b.x0 + Math.floor((gx / tw) * cw);
        const sx1 = b.x0 + Math.floor(((gx + 1) / tw) * cw);
        const sy0 = b.y0 + Math.floor((gy / th) * ch);
        const sy1 = b.y0 + Math.floor(((gy + 1) / th) * ch);
        const c = majority(src, sx0, sy0, Math.max(sx0 + 1, sx1), Math.max(sy0 + 1, sy1));
        if (c[3] > 0) set(out, ox + gx, oy + gy, c);
        continue;
      }
      set(out, ox + gx, oy + gy, quantize(rawPx));
    }
  }
  // Fill 1px interior holes
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      if (get(out, x, y)[3] > 0) continue;
      let n = 0;
      let sr = 0;
      let sg = 0;
      let sb = 0;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const c = get(out, x + dx, y + dy);
        if (c[3] > 0 && c[0] + c[1] + c[2] > 100) {
          n++;
          sr += c[0];
          sg += c[1];
          sb += c[2];
        }
      }
      if (n >= 3) set(out, x, y, [Math.round(sr / n), Math.round(sg / n), Math.round(sb / n), 255]);
    }
  }
  return out;
}

function readPlate(file: string): InstanceType<typeof PNG> {
  if (!fs.existsSync(file)) throw new Error(`Missing plate: ${file}`);
  return PNG.sync.read(fs.readFileSync(file));
}

function writePet(species: string, pose: string, png: InstanceType<typeof PNG>) {
  const dest = path.resolve('public/assets/pet', species, `${pose}.png`);
  saveSprite(png, dest, { repairOutline: true, outline: OUT });
  console.log('  wrote', dest);
}

// ─── Classic Tamagotchi (mimitchi / kuchipatchi / violetchi) ───

const CLASSICS = ['mimitchi', 'kuchipatchi', 'violetchi'] as const;

for (const species of CLASSICS) {
  console.log(`\n${species}`);
  const ref = path.resolve('scripts/reference/tamagotchi', species);
  const idlePlate = path.join(ref, 'idle-plate.png');
  const idle = toGameSprite(readPlate(idlePlate));
  writePet(species, 'neutral1', idle);

  // Authored Imagine walk plates when present; else procedural foot stride.
  const poses = petPosesFromIdle(idle, {
    ink: OUT,
    accent: [255, 150, 180, 255],
  });
  for (const walk of ['walk1', 'walk2'] as const) {
    const plate = path.join(ref, 'poses', `${walk}.png`);
    if (fs.existsSync(plate)) {
      writePet(species, walk, toGameSprite(readPlate(plate)));
    } else {
      writePet(species, walk, poses[walk]);
    }
  }
  for (const pose of ['neutral2', 'happy', 'sad', 'sleep', 'jump'] as const) {
    writePet(species, pose, poses[pose]);
  }
}

// ─── Kirby (user ref + Imagine pose plates) ───

console.log('\nkirby');
const kRef = path.resolve('scripts/reference/kirby');
const kPoses = path.join(kRef, 'poses');
const kirbyIdleSrc = fs.existsSync(path.join(kPoses, 'idle.png'))
  ? path.join(kPoses, 'idle.png')
  : path.join(kRef, 'user-ref-kirby.png');
const kirbyIdle = toGameSprite(readPlate(kirbyIdleSrc));
writePet('kirby', 'neutral1', kirbyIdle);

const kFallback = petPosesFromIdle(kirbyIdle, {
  ink: OUT,
  accent: [255, 140, 170, 255],
});
writePet('kirby', 'neutral2', kFallback.neutral2);

for (const walk of [
  'walk1',
  'walk2',
  'walk3',
  'walk4',
  'walk5',
  'walk6',
  'walk7',
  'walk8',
] as const) {
  const plate = path.join(kPoses, `${walk}.png`);
  if (fs.existsSync(plate)) writePet('kirby', walk, toGameSprite(readPlate(plate)));
  else {
    // Alternate procedural for missing mid-frames
    writePet('kirby', walk, walk.endsWith('1') || walk.endsWith('3') || walk.endsWith('5') || walk.endsWith('7')
      ? kFallback.walk1
      : kFallback.walk2);
  }
}

for (const pose of ['happy', 'sad', 'sleep', 'jump'] as const) {
  const plate = path.join(kPoses, `${pose}.png`);
  if (fs.existsSync(plate)) writePet('kirby', pose, toGameSprite(readPlate(plate)));
  else writePet('kirby', pose, kFallback[pose]);
}

// Sanity: content height should be reasonable
for (const species of [...CLASSICS, 'kirby']) {
  const n1 = PNG.sync.read(fs.readFileSync(path.resolve('public/assets/pet', species, 'neutral1.png')));
  const b = poseBounds(n1);
  console.log(`  ${species} idle bounds h=${b.y1 - b.y0 + 1} w=${b.x1 - b.x0 + 1}`);
}

console.log('\nDone.');
// silence unused
void clonePng;
