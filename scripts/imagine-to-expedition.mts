/**
 * Convert high-res Grok Imagine Expedition boss plates into 40×56 game sprites.
 *
 * Source plates: scripts/reference/expedition/<id>/<pose>.png
 * Output:        public/assets/npc/expedition/<id>/<pose>.png
 *
 * Usage:
 *   npm run sprite:expedition
 *   npm run sprite:expedition -- gustave
 *   npm run sprite:expedition -- maelle idle windup
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { saveSprite } from './lib/save-sprite.mjs';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');

type RGBA = [number, number, number, number];
const W = 40;
const H = 56;
const IDS = ['gustave', 'maelle', 'renoir'] as const;
const POSES = ['idle', 'windup', 'strike', 'special', 'hurt', 'enraged', 'down'] as const;
type BossId = (typeof IDS)[number];
type Pose = (typeof POSES)[number];

const ROOT = path.resolve('public/assets/npc/expedition');
const REF = path.resolve('scripts/reference/expedition');

function parseCli(argv: string[]): { ids: BossId[]; poses: Pose[] | null } {
  const args = argv.filter((a) => a && !a.startsWith('-'));
  if (!args.length) return { ids: [...IDS], poses: null };
  const id = args[0] as BossId;
  if (!(IDS as readonly string[]).includes(id)) {
    console.error(`Unknown boss id: ${id}\nKnown: ${IDS.join(', ')}`);
    process.exit(1);
  }
  const poseArgs = args.slice(1) as Pose[];
  if (poseArgs.length) {
    const unknown = poseArgs.filter((p) => !(POSES as readonly string[]).includes(p));
    if (unknown.length) {
      console.error(`Unknown pose(s): ${unknown.join(', ')}\nKnown: ${POSES.join(', ')}`);
      process.exit(1);
    }
    return { ids: [id], poses: poseArgs };
  }
  return { ids: [id], poses: null };
}

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
    const y = Math.floor(i / w);
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
  if (!n) return null;
  return { x0, y0, x1, y1 };
}

function crop(src: InstanceType<typeof PNG>, b: { x0: number; y0: number; x1: number; y1: number }) {
  const w = b.x1 - b.x0 + 1;
  const h = b.y1 - b.y0 + 1;
  const out = blank(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      set(out, x, y, get(src, b.x0 + x, b.y0 + y));
    }
  }
  return out;
}

/** Majority-colour vote downsample into W×H. */
function downsample(src: InstanceType<typeof PNG>): InstanceType<typeof PNG> {
  const out = blank(W, H);
  const cellW = src.width / W;
  const cellH = src.height / H;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const votes = new Map<string, { c: RGBA; n: number }>();
      let best: { c: RGBA; n: number } | null = null;
      const x0 = Math.floor(x * cellW);
      const y0 = Math.floor(y * cellH);
      const x1 = Math.floor((x + 1) * cellW);
      const y1 = Math.floor((y + 1) * cellH);
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const c = get(src, sx, sy);
          if (c[3] < 40) continue;
          const key = `${c[0] >> 3},${c[1] >> 3},${c[2] >> 3}`;
          const q: RGBA = [c[0] & ~7, c[1] & ~7, c[2] & ~7, 255];
          const cur = votes.get(key) ?? { c: q, n: 0 };
          cur.n++;
          votes.set(key, cur);
          if (!best || cur.n > best.n) best = cur;
        }
      }
      if (best) set(out, x, y, best.c);
    }
  }
  return out;
}

function repairOutline(src: InstanceType<typeof PNG>): InstanceType<typeof PNG> {
  const out = clone(src);
  const OUT: RGBA = [20, 18, 30, 255];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (get(src, x, y)[3] < 20) continue;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const n = get(src, x + dx, y + dy);
        if (n[3] < 20) {
          set(out, x, y, OUT);
          break;
        }
      }
    }
  }
  return out;
}

function processPlate(id: BossId, pose: Pose): boolean {
  const srcPath = path.join(REF, id, `${pose}.png`);
  if (!fs.existsSync(srcPath)) {
    console.warn(`  skip ${id}/${pose} — no plate at ${srcPath}`);
    return false;
  }
  const raw = PNG.sync.read(fs.readFileSync(srcPath));
  const cut = removeExterior(raw);
  const bounds = contentBounds(cut);
  if (!bounds) {
    console.warn(`  skip ${id}/${pose} — empty after bg remove`);
    return false;
  }
  // Pad a little so outline repair has room.
  const pad = 4;
  const padded = {
    x0: Math.max(0, bounds.x0 - pad),
    y0: Math.max(0, bounds.y0 - pad),
    x1: Math.min(cut.width - 1, bounds.x1 + pad),
    y1: Math.min(cut.height - 1, bounds.y1 + pad),
  };
  const cropped = crop(cut, padded);
  const small = repairOutline(downsample(cropped));
  const outDir = path.join(ROOT, id);
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${pose}.png`);
  saveSprite(small, outPath, { repairOutline: true });
  console.log(`  wrote ${id}/${pose} → ${outPath}`);
  return true;
}

const { ids, poses } = parseCli(process.argv.slice(2));
let n = 0;
for (const id of ids) {
  const list = poses ?? [...POSES];
  console.log(`Expedition ${id}:`);
  for (const pose of list) {
    if (processPlate(id, pose)) n++;
  }
}
console.log(`Done — ${n} sprite(s).`);
