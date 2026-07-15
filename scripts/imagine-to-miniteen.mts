/**
 * Convert high-res Grok Imagine MINITEEN pixel-art plates into 32×42 game
 * sprites (idle + walk/happy/sad/jump variants).
 *
 * Source plates: scripts/reference/miniteen/<id>.png
 * Background is exterior flood-fill (so white characters stay solid).
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { saveSprite } from './lib/save-sprite.mjs';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');

type RGBA = [number, number, number, number];
const OUT: RGBA = [0, 0, 0, 255];
const W = 32;
const H = 42;
const IDS = [
  'choitcherry','jjongtoram','shuasumi','ocl','tamtam','foxdungee','ppyopuli',
  'doa','kimja','thepalee','bboogyuli','nonver','chandalee',
] as const;
const ROOT = path.resolve('public/assets/npc/miniteen');
const REF = path.resolve('scripts/reference/miniteen');

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
  png.data[i] = c[0]; png.data[i + 1] = c[1]; png.data[i + 2] = c[2]; png.data[i + 3] = c[3];
}

/** Exterior flood-fill: near-uniform plate color reachable from the border. */
function removeExterior(src: InstanceType<typeof PNG>): InstanceType<typeof PNG> {
  const out = clone(src);
  const w = src.width, h = src.height;
  const exterior = new Uint8Array(w * h);
  const queue: number[] = [];
  // Sample corner colors as bg anchors
  const corners = [get(src, 2, 2), get(src, w - 3, 2), get(src, 2, h - 3), get(src, w - 3, h - 3)];
  const bgLike = (c: RGBA) => {
    if (c[3] < 20) return true;
    for (const bg of corners) {
      if (Math.hypot(c[0] - bg[0], c[1] - bg[1], c[2] - bg[2]) < 28) return true;
    }
    // Also pure-ish light grays/whites only if very close to corner avg
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
  for (let x = 0; x < w; x++) { enq(x, 0); enq(x, h - 1); }
  for (let y = 0; y < h; y++) { enq(0, y); enq(w - 1, y); }
  for (let qi = 0; qi < queue.length; qi++) {
    const i = queue[qi]!;
    const x = i % w, y = Math.floor(i / w);
    enq(x + 1, y); enq(x - 1, y); enq(x, y + 1); enq(x, y - 1);
  }
  for (let i = 0; i < w * h; i++) {
    if (exterior[i]) out.data.fill(0, i * 4, i * 4 + 4);
  }
  return out;
}

function contentBounds(src: InstanceType<typeof PNG>) {
  let x0 = src.width, y0 = src.height, x1 = 0, y1 = 0, n = 0;
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      if (get(src, x, y)[3] < 20) continue;
      n++;
      if (x < x0) x0 = x; if (y < y0) y0 = y;
      if (x > x1) x1 = x; if (y > y1) y1 = y;
    }
  }
  if (!n) return { x0: 0, y0: 0, x1: src.width - 1, y1: src.height - 1 };
  return {
    x0: Math.max(0, x0 - 1), y0: Math.max(0, y0 - 1),
    x1: Math.min(src.width - 1, x1 + 1), y1: Math.min(src.height - 1, y1 + 1),
  };
}

function quantize(c: RGBA): RGBA {
  if (c[3] < 20) return [0, 0, 0, 0];
  // Dark → pure outline
  if (c[0] + c[1] + c[2] < 100) return OUT;
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
  let dark = 0, total = 0, darkR = 0, darkG = 0, darkB = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const raw = get(src, x, y);
      if (raw[3] < 20) continue;
      total++;
      const lum = (raw[0] + raw[1] + raw[2]) / 3;
      if (lum < 70) {
        dark++;
        darkR += raw[0]; darkG += raw[1]; darkB += raw[2];
      }
      const c = quantize(raw);
      const k = c.join(',');
      const cur = votes.get(k);
      if (cur) cur.n++; else votes.set(k, { c, n: 1 });
    }
  }
  // Preserve eyes/mouth/brows: if enough dark ink in the cell, stamp outline
  if (total > 0 && dark / total >= 0.22) return OUT;
  let best: { c: RGBA; n: number } | null = null;
  for (const v of votes.values()) {
    const weight = v.n * (v.c[3] > 0 ? 10 : 1) + (v.c[0] + v.c[1] + v.c[2] > 100 ? 0.5 : 0);
    if (!best || weight > best.n) best = { c: v.c, n: weight };
  }
  return best?.c ?? [0, 0, 0, 0];
}

function toGameSprite(raw: InstanceType<typeof PNG>): InstanceType<typeof PNG> {
  const src = removeExterior(raw);
  const b = contentBounds(src);
  const cw = b.x1 - b.x0 + 1;
  const ch = b.y1 - b.y0 + 1;
  const maxW = W - 2, maxH = H - 2;
  const scale = Math.min(maxW / cw, maxH / ch);
  const tw = Math.max(8, Math.round(cw * scale));
  const th = Math.max(10, Math.round(ch * scale));
  const ox = Math.floor((W - tw) / 2);
  const oy = H - 1 - th;
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
  // Fill small interior holes
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      if (get(out, x, y)[3] > 0) continue;
      let n = 0; let sr = 0, sg = 0, sb = 0;
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]] as const) {
        const c = get(out, x + dx, y + dy);
        if (c[3] > 0 && c[0] + c[1] + c[2] > 100) { n++; sr += c[0]; sg += c[1]; sb += c[2]; }
      }
      if (n >= 3) set(out, x, y, [Math.round(sr / n), Math.round(sg / n), Math.round(sb / n), 255]);
    }
  }
  return out;
}

function shift(src: InstanceType<typeof PNG>, dx: number, dy: number) {
  const out = blank(src.width, src.height);
  for (let y = 0; y < src.height; y++)
    for (let x = 0; x < src.width; x++) {
      const c = get(src, x, y);
      if (c[3] > 0) set(out, x + dx, y + dy, c);
    }
  return out;
}

function walkVariant(idle: InstanceType<typeof PNG>, phase: 1 | 2) {
  const out = clone(idle);
  let yMax = 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (get(idle, x, y)[3] > 0) yMax = y;
  const footTop = yMax - 3;
  const leg = phase === 1 ? -1 : 1;
  const feet: { x: number; y: number; c: RGBA }[] = [];
  for (let y = footTop; y <= yMax; y++)
    for (let x = 0; x < W; x++) {
      const c = get(idle, x, y);
      if (c[3] > 0) { feet.push({ x, y, c }); set(out, x, y, [0, 0, 0, 0]); }
    }
  for (const p of feet) {
    const left = p.x < W / 2;
    set(out, p.x + (left ? leg : -leg), p.y, p.c);
  }
  return phase === 2 ? shift(out, 0, 1) : out;
}

function processOne(id: string, srcPath: string) {
  const src = PNG.sync.read(fs.readFileSync(srcPath));
  const idle = toGameSprite(src);
  const poses: Record<string, InstanceType<typeof PNG>> = {
    idle,
    walk1: walkVariant(idle, 1),
    walk2: walkVariant(idle, 2),
    happy: shift(idle, 0, -1),
    sad: shift(idle, 0, 1),
    jump: shift(idle, 0, -3),
  };
  const dir = path.join(ROOT, id);
  for (const [pose, png] of Object.entries(poses)) {
    saveSprite(png, path.join(dir, `${pose}.png`), { repairOutline: true, outline: OUT });
  }
  // opaque pixel count
  let n = 0;
  for (let i = 3; i < idle.data.length; i += 4) if (idle.data[i]! > 20) n++;
  console.log(`  ${id}: ${n} opaque px`);
}

console.log('MINITEEN Imagine → 32×42');
const fallback = '/tmp/pv-imagine/miniteen';
for (const id of IDS) {
  const found = [
    path.join(REF, `${id}.png`),
    path.join(fallback, `${id}.png`),
  ].find((p) => fs.existsSync(p));
  if (!found) { console.warn('skip', id); continue; }
  processOne(id, found);
}
console.log('Done.');
