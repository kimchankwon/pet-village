/**
 * Convert Grok Imagine puffle plates into 32×32 pet sprites for all 10 colors.
 * Blue is the base silhouette; orange / black / green plates override personality
 * faces when present. Other colors recolor the blue body while keeping the face.
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { saveSprite } from './lib/save-sprite.mjs';
import { petPosesFromIdle } from './lib/pose-animate.mjs';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');

type RGBA = [number, number, number, number];
const OUT: RGBA = [20, 20, 28, 255];
const W = 32;
const H = 32;
const ROOT = path.resolve('public/assets/pet');
const REF = path.resolve('scripts/reference/puffle');

const COLORS: Record<string, RGBA> = {
  blue: [80, 170, 255, 255],
  pink: [255, 130, 190, 255],
  green: [70, 210, 90, 255],
  black: [88, 90, 102, 255],
  purple: [170, 90, 230, 255],
  red: [230, 55, 55, 255],
  yellow: [255, 215, 50, 255],
  white: [248, 248, 252, 255],
  orange: [255, 140, 40, 255],
  brown: [150, 95, 50, 255],
};

type Pose = 'neutral1' | 'neutral2' | 'walk1' | 'walk2' | 'sad' | 'happy' | 'sleep' | 'jump';
const POSES: Pose[] = ['neutral1', 'neutral2', 'walk1', 'walk2', 'sad', 'happy', 'sleep', 'jump'];

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

function removeExterior(src: InstanceType<typeof PNG>): InstanceType<typeof PNG> {
  const out = clone(src);
  const w = src.width,
    h = src.height;
  const exterior = new Uint8Array(w * h);
  const queue: number[] = [];
  const corners = [get(src, 2, 2), get(src, w - 3, 2), get(src, 2, h - 3), get(src, w - 3, h - 3)];
  const bgLike = (c: RGBA) => {
    if (c[3] < 20) return true;
    for (const bg of corners) {
      if (Math.hypot(c[0] - bg[0], c[1] - bg[1], c[2] - bg[2]) < 30) return true;
    }
    const avg = corners.reduce((s, b) => s + (b[0] + b[1] + b[2]) / 3, 0) / corners.length;
    const lum = (c[0] + c[1] + c[2]) / 3;
    const sat = Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]);
    return sat < 16 && Math.abs(lum - avg) < 24 && lum > 200;
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
    const x = i % w,
      y = Math.floor(i / w);
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
  let x0 = src.width,
    y0 = src.height,
    x1 = 0,
    y1 = 0;
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      if (get(src, x, y)[3] < 20) continue;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
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
  // Keep near-white for eyes/teeth
  if (c[0] > 220 && c[1] > 220 && c[2] > 220) return [255, 255, 255, 255];
  const step = 16;
  return [
    Math.min(255, Math.round(c[0] / step) * step),
    Math.min(255, Math.round(c[1] / step) * step),
    Math.min(255, Math.round(c[2] / step) * step),
    255,
  ];
}

function majority(src: InstanceType<typeof PNG>, x0: number, y0: number, x1: number, y1: number): RGBA {
  const votes = new Map<string, { c: RGBA; n: number }>();
  let dark = 0,
    total = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const raw = get(src, x, y);
      if (raw[3] < 20) continue;
      total++;
      if ((raw[0] + raw[1] + raw[2]) / 3 < 70) dark++;
      const c = quantize(raw);
      const k = c.join(',');
      const cur = votes.get(k);
      if (cur) cur.n++;
      else votes.set(k, { c, n: 1 });
    }
  }
  if (total > 0 && dark / total >= 0.2) return OUT;
  let best: { c: RGBA; n: number } | null = null;
  for (const v of votes.values()) {
    const weight = v.n * (v.c[3] > 0 ? 10 : 1);
    if (!best || weight > best.n) best = { c: v.c, n: weight };
  }
  return best?.c ?? [0, 0, 0, 0];
}

function toSprite(raw: InstanceType<typeof PNG>): InstanceType<typeof PNG> {
  const src = removeExterior(raw);
  const b = contentBounds(src);
  const cw = b.x1 - b.x0 + 1;
  const ch = b.y1 - b.y0 + 1;
  const maxW = W - 2,
    maxH = H - 2;
  const scale = Math.min(maxW / cw, maxH / ch);
  const tw = Math.max(10, Math.round(cw * scale));
  const th = Math.max(10, Math.round(ch * scale));
  const ox = Math.floor((W - tw) / 2);
  const oy = Math.floor((H - th) / 2) + 1; // slight bottom bias
  const out = blank();
  for (let gy = 0; gy < th; gy++) {
    for (let gx = 0; gx < tw; gx++) {
      const sx0 = b.x0 + Math.floor((gx / tw) * cw);
      const sx1 = b.x0 + Math.floor(((gx + 1) / tw) * cw);
      const sy0 = b.y0 + Math.floor((gy / th) * ch);
      const sy1 = b.y0 + Math.floor(((gy + 1) / th) * ch);
      const c = majority(src, sx0, sy0, Math.max(sx0 + 1, sx1), Math.max(sy0 + 1, sy1));
      if (c[3] > 0) set(out, ox + gx, oy + gy, c);
    }
  }
  return out;
}

function isFaceFeature(c: RGBA): boolean {
  if (c[3] < 20) return false;
  // white eyes/teeth or black ink
  if (c[0] > 220 && c[1] > 220 && c[2] > 220) return true;
  if (c[0] + c[1] + c[2] < 120) return true;
  // light gray eye shading
  if (Math.abs(c[0] - c[1]) < 20 && Math.abs(c[1] - c[2]) < 20 && c[0] > 160 && c[0] < 230) return true;
  return false;
}

function isBody(c: RGBA): boolean {
  return c[3] > 20 && !isFaceFeature(c);
}

/** Recolor body pixels to target while preserving face/outline. */
function recolor(src: InstanceType<typeof PNG>, color: RGBA): InstanceType<typeof PNG> {
  const out = clone(src);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const c = get(src, x, y);
      if (!isBody(c)) continue;
      // Keep slight luminance variation from source
      const lum = (c[0] + c[1] + c[2]) / 3 / 255;
      const shade = 0.75 + lum * 0.35;
      set(out, x, y, [
        Math.min(255, Math.round(color[0] * shade)),
        Math.min(255, Math.round(color[1] * shade)),
        Math.min(255, Math.round(color[2] * shade)),
        255,
      ]);
    }
  }
  return out;
}

function shift(src: InstanceType<typeof PNG>, dx: number, dy: number) {
  const out = blank();
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const c = get(src, x, y);
      if (c[3] > 0) set(out, x + dx, y + dy, c);
    }
  }
  return out;
}

/**
 * Classic Club Penguin puffle crown: fuzzy spikes all the way across the
 * top (and a couple of side tufts). Imagine plates often deliver a smooth
 * ball (green especially) or only one weak tuft — stamp a consistent mane.
 */
function stampCrownHair(
  src: InstanceType<typeof PNG>,
  color: RGBA,
  style: 'default' | 'orange' = 'default',
): InstanceType<typeof PNG> {
  const out = clone(src);

  // Silhouette bounds (body only — skip tiny isolated face bits)
  let x0 = W,
    x1 = 0,
    y0 = H,
    y1 = 0,
    n = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (get(out, x, y)[3] < 20) continue;
      n++;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (n < 20) return out;

  const cx = Math.round((x0 + x1) / 2);
  // Highest opaque y per column (crown surface)
  const topAt = new Int16Array(W).fill(H);
  for (let x = x0; x <= x1; x++) {
    for (let y = 0; y < H; y++) {
      if (get(out, x, y)[3] >= 20) {
        topAt[x] = y;
        break;
      }
    }
  }

  // Sample a mid-body fill color (prefer the target palette color)
  const body: RGBA = [color[0], color[1], color[2], 255];

  const paint = (x: number, y: number, c: RGBA) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    set(out, x, y, c);
  };
  /** Fill a short vertical spike tip, outlined. */
  const spike = (sx: number, tipY: number, height: number, halfW = 1) => {
    for (let h = 0; h < height; h++) {
      const y = tipY + h;
      const w = h === 0 ? 0 : halfW; // tip is 1px
      for (let dx = -w; dx <= w; dx++) paint(sx + dx, y, body);
    }
    // Outline around the spike
    for (let h = 0; h < height; h++) {
      const y = tipY + h;
      const w = h === 0 ? 0 : halfW;
      paint(sx - w - 1, y, OUT);
      paint(sx + w + 1, y, OUT);
    }
    paint(sx, tipY - 1, OUT);
    if (halfW > 0) {
      paint(sx - 1, tipY, OUT);
      paint(sx + 1, tipY, OUT);
    }
  };

  // Spikes evenly across the crown (left → right). Classic CP mane, not a
  // single center tuft.
  const spanL = x0 + 2;
  const spanR = x1 - 2;
  const spikeXs: number[] = [];
  const count = 7;
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    spikeXs.push(Math.round(spanL + t * (spanR - spanL)));
  }

  for (let i = 0; i < spikeXs.length; i++) {
    const sx = spikeXs[i]!;
    // Base the tip on the local crown height so spikes sit on the head.
    const surface = topAt[sx] === H ? y0 : topAt[sx]!;
    // Alternating heights read as fluffy; middle ones slightly taller.
    const mid = Math.abs(i - (count - 1) / 2);
    const height = mid < 1 ? 4 : mid < 2 ? 3 : 3;
    const tipY = Math.max(1, surface - height);
    const halfW = mid < 1.5 ? 1 : 0;
    spike(sx, tipY, height, halfW);
  }

  // Side tufts (classic puffle silhouette) — mid-height, outward
  for (const s of [-1, 1] as const) {
    const sx = s < 0 ? x0 : x1;
    const midY = Math.round(y0 + (y1 - y0) * 0.38);
    for (let k = 0; k < 3; k++) {
      paint(sx + s * (k + 1), midY - 1 + (k % 2), body);
      paint(sx + s * (k + 1), midY + (k % 2), body);
      paint(sx + s * (k + 2), midY - 1 + (k % 2), OUT);
    }
    // Extra upper-side fluff
    paint(sx + s * 2, midY - 3, body);
    paint(sx + s * 2, midY - 4, OUT);
    paint(sx + s * 1, midY - 3, body);
  }

  // Orange: curly tufts on top (personality) in addition to the mane
  if (style === 'orange') {
    const top = Math.min(...Array.from(topAt).filter((v) => v < H));
    const curls: [number, number][] = [
      [cx - 3, top - 2],
      [cx - 1, top - 4],
      [cx + 1, top - 3],
      [cx + 3, top - 2],
      [cx + 2, top - 5],
    ];
    for (const [x, y] of curls) {
      for (let dy = 0; dy <= 2; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (Math.hypot(dx, dy - 1) <= 1.2) paint(x + dx, y + dy, body);
        }
      }
      paint(x, y - 1, OUT);
      paint(x - 2, y + 1, OUT);
      paint(x + 2, y + 1, OUT);
    }
  }

  return out;
}

function posesFromIdle(idle: InstanceType<typeof PNG>): Record<Pose, InstanceType<typeof PNG>> {
  // Face morphs + foot shuffle / bob (not mere whole-sprite shifts)
  return petPosesFromIdle(idle, { ink: OUT, accent: [255, 150, 190, 255] }) as Record<
    Pose,
    InstanceType<typeof PNG>
  >;
}

function loadPlate(name: string): InstanceType<typeof PNG> | null {
  for (const dir of [REF, '/tmp/pv-imagine/puffle']) {
    for (const ext of ['.png', '.jpg']) {
      const p = path.join(dir, name + ext);
      if (fs.existsSync(p)) return PNG.sync.read(fs.readFileSync(p));
    }
  }
  return null;
}

// --- main ---
fs.mkdirSync(REF, { recursive: true });
// Import Imagine plates from session if not already in REF
const session = '/Users/xtectra/.grok/sessions/%2FUsers%2Fxtectra/019f6363-27b6-7041-8c41-5c4258f4c66e/images';
const plateMap: Record<string, string> = {
  blue: path.join(session, '17.jpg'),
  orange: path.join(session, '14.jpg'),
  green: path.join(session, '15.jpg'),
  black: path.join(session, '16.jpg'),
};
for (const [name, src] of Object.entries(plateMap)) {
  if (!fs.existsSync(src)) continue;
  const dest = path.join(REF, `${name}.png`);
  if (!fs.existsSync(dest)) {
    // convert via sips-equivalent: read not possible for jpg without decoder —
    // shell converts first
  }
}

const bluePlate = loadPlate('blue');
if (!bluePlate) {
  console.error('Need scripts/reference/puffle/blue.png (run sips convert first)');
  process.exit(1);
}

const baseBlue = toSprite(bluePlate);
const special: Record<string, InstanceType<typeof PNG>> = { blue: baseBlue };
for (const name of ['orange', 'green', 'black'] as const) {
  const plate = loadPlate(name);
  if (plate) special[name] = toSprite(plate);
}

console.log('Puffles Imagine → 32×32');
for (const [name, color] of Object.entries(COLORS)) {
  const idle = special[name] ?? recolor(baseBlue, color);
  // Ensure black puffle face ink is light enough
  let body = idle;
  if (name === 'black') {
    body = clone(idle);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const c = get(body, x, y);
        if (isBody(c)) set(body, x, y, color);
      }
    }
  } else if (!special[name]) {
    body = recolor(baseBlue, color);
  } else if (name !== 'blue') {
    // Personality plate already has correct body color-ish; snap body to palette
    body = recolor(special[name]!, color);
    // Restore face from special plate
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const face = get(special[name]!, x, y);
        if (isFaceFeature(face)) set(body, x, y, face);
      }
    }
  }

  // Classic CP mane across the crown (fixes smooth green plate, thin blue tuft, etc.)
  body = stampCrownHair(body, color, name === 'orange' ? 'orange' : 'default');

  const dir = path.join(ROOT, `puffle-${name}`);
  const frames = posesFromIdle(body);
  for (const pose of POSES) {
    saveSprite(frames[pose], path.join(dir, `${pose}.png`), { repairOutline: true, outline: OUT });
  }
  console.log(`  puffle-${name}`);
}
console.log('Done.');
