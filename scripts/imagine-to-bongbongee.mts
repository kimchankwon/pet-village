/**
 * Convert a Grok Imagine Bongbongee pixel-art plate into 32×32 pet + NPC sprites.
 *
 * Source plate: scripts/reference/bongbongee/idle-plate.png
 * (regenerate with Imagine from scripts/reference/bongbongee/plush-front.png)
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { saveSprite } from './lib/save-sprite.mjs';
import { petPosesFromIdle } from './lib/pose-animate.mjs';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');

type RGBA = [number, number, number, number];
const OUT: RGBA = [0, 0, 0, 255];
const W = 32;
const H = 32;
const REF = path.resolve('scripts/reference/bongbongee');
const ROOT = path.resolve('public/assets');

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

/** Exterior flood-fill: near-uniform plate color reachable from the border. */
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
    throw new Error(
      'No opaque foreground pixels after background removal — plate may be empty or fully keyed as exterior',
    );
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
  const maxW = W - 2;
  const maxH = H - 2;
  const scale = Math.min(maxW / cw, maxH / ch);
  const tw = Math.max(8, Math.round(cw * scale));
  const th = Math.max(10, Math.round(ch * scale));
  const ox = Math.floor((W - tw) / 2);
  const oy = H - 1 - th; // bottom-aligned like other pets
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

/** Optional Grok Imagine pose plates under scripts/reference/bongbongee/poses/ */
function findPosePlate(pose: string): string | null {
  const candidates = [
    path.join(REF, 'poses', `${pose}.png`),
    path.join(REF, `${pose}-plate.png`),
    pose === 'idle' || pose === 'neutral1' ? path.join(REF, 'idle-plate.png') : '',
    pose === 'idle' || pose === 'neutral1' ? path.join(REF, 'idle.png') : '',
  ].filter(Boolean);
  return candidates.find((p) => fs.existsSync(p)) ?? null;
}

/**
 * Keep Imagine plate almost as-is for in-game NPC (nearest-neighbour scaled).
 * Max side 512; transparent exterior; bottom-pad so walk frames share a canvas.
 */
const PLATE_MAX_SIDE = 512;
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
      if (c[3] > 20) set(out, gx, gy, [c[0], c[1], c[2], 255]);
    }
  }
  return out;
}

function padBottomCenter(
  src: InstanceType<typeof PNG>,
  tw: number,
  th: number,
): InstanceType<typeof PNG> {
  if (src.width === tw && src.height === th) return src;
  const out = blank(tw, th);
  const ox = Math.floor((tw - src.width) / 2);
  const oy = th - src.height;
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const c = get(src, x, y);
      if (c[3] > 20) set(out, ox + x, oy + y, c);
    }
  }
  return out;
}

function matchContentHeight(
  src: InstanceType<typeof PNG>,
  targetH: number,
): InstanceType<typeof PNG> {
  const b = contentBounds(src);
  const cw = b.x1 - b.x0 + 1;
  const ch = b.y1 - b.y0 + 1;
  if (ch <= 0) return src;
  const scale = targetH / ch;
  if (Math.abs(scale - 1) < 0.03) {
    const out = blank(cw, ch);
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        const c = get(src, b.x0 + x, b.y0 + y);
        if (c[3] > 20) set(out, x, y, c);
      }
    }
    return out;
  }
  const tw = Math.max(1, Math.round(cw * scale));
  const th = Math.max(1, Math.round(ch * scale));
  const out = blank(tw, th);
  for (let gy = 0; gy < th; gy++) {
    for (let gx = 0; gx < tw; gx++) {
      const sx = b.x0 + Math.min(cw - 1, Math.floor((gx / tw) * cw));
      const sy = b.y0 + Math.min(ch - 1, Math.floor((gy / th) * ch));
      const c = get(src, sx, sy);
      if (c[3] > 20) set(out, gx, gy, [c[0], c[1], c[2], 255]);
    }
  }
  return out;
}

const plateCandidates = [
  path.join(REF, 'poses', 'idle.png'),
  path.join(REF, 'idle-plate.png'),
  path.join(REF, 'idle.png'),
];
// Optional local Imagine drop folder (not committed)
const localImagine = path.join('/tmp', 'pv-imagine', 'bong-pixel-plate.png');
if (fs.existsSync(localImagine)) plateCandidates.push(localImagine);

const platePath = plateCandidates.find((p) => fs.existsSync(p));
if (!platePath) {
  console.error(
    `Missing Bongbongee plate. Expected one of:\n  ${plateCandidates.join('\n  ')}`,
  );
  process.exit(1);
}

/**
 * Build pose set at a given convert function (32×32 chibi or hi-res plate crop).
 * Prefer Imagine walk1/walk2 plates when present.
 *
 * @param normalizeContent When true (plate mode), scale every pose's content to
 *   idle height then pad to a shared canvas. Classic 32×32 already shares a
 *   fixed canvas from toGameSprite — skip normalize so we keep 32×32.
 */
function buildPoses(
  convert: (raw: InstanceType<typeof PNG>) => InstanceType<typeof PNG>,
  opts: { padEdge: number; normalizeContent: boolean; fixedCanvas?: { w: number; h: number } },
): {
  poses: Record<string, InstanceType<typeof PNG>>;
  sources: string[];
  contentH: number;
  maxW: number;
  maxH: number;
} {
  const idleRaw = convert(PNG.sync.read(fs.readFileSync(platePath!)));
  const idleB = contentBounds(idleRaw);
  const contentH = idleB.y1 - idleB.y0 + 1;
  const idle = opts.normalizeContent ? matchContentHeight(idleRaw, contentH) : idleRaw;
  const procedural = petPosesFromIdle(idle, { ink: OUT, accent: [255, 176, 196, 255] });

  const POSE_KEYS = [
    'neutral1',
    'neutral2',
    'walk1',
    'walk2',
    'happy',
    'sad',
    'sleep',
    'jump',
  ] as const;

  const poses: Record<string, InstanceType<typeof PNG>> = {};
  const sources: string[] = [];
  for (const pose of POSE_KEYS) {
    const plate =
      pose === 'neutral1'
        ? findPosePlate('idle') ?? findPosePlate('neutral1')
        : findPosePlate(pose);
    if (plate && (pose === 'neutral1' || pose === 'walk1' || pose === 'walk2')) {
      const converted = convert(PNG.sync.read(fs.readFileSync(plate)));
      poses[pose] = opts.normalizeContent
        ? matchContentHeight(converted, contentH)
        : converted;
      sources.push(`${pose}←imagine`);
    } else if (pose === 'neutral1') {
      poses[pose] = idle;
      sources.push('neutral1←plate');
    } else {
      poses[pose] = opts.normalizeContent
        ? matchContentHeight(procedural[pose]!, contentH)
        : procedural[pose]!;
      sources.push(`${pose}←animate`);
    }
  }

  let maxW = opts.fixedCanvas?.w ?? 0;
  let maxH = opts.fixedCanvas?.h ?? 0;
  if (!opts.fixedCanvas) {
    for (const png of Object.values(poses)) {
      if (png.width > maxW) maxW = png.width;
      if (png.height > maxH) maxH = png.height;
    }
    maxW += opts.padEdge * 2;
    maxH += opts.padEdge * 2;
  }
  for (const pose of POSE_KEYS) {
    poses[pose] = padBottomCenter(poses[pose]!, maxW, maxH);
  }
  return { poses, sources, contentH, maxW, maxH };
}

// Pet keeps classic 32×32; NPC uses Imagine plate crops so town art matches the reference.
console.log('Bongbongee Imagine from', path.relative(process.cwd(), platePath));
const petBuilt = buildPoses(toGameSprite, {
  padEdge: 0,
  normalizeContent: false,
  fixedCanvas: { w: W, h: H },
});
const npcBuilt = buildPoses(toPlateSprite, { padEdge: 4, normalizeContent: true });

const petDir = path.join(ROOT, 'pet/bongbongee');
const npcDir = path.join(ROOT, 'npc/bongbongee');
fs.mkdirSync(petDir, { recursive: true });
fs.mkdirSync(npcDir, { recursive: true });

for (const [pose, png] of Object.entries(petBuilt.poses)) {
  saveSprite(png, path.join(petDir, `${pose}.png`), { repairOutline: true, outline: OUT });
}

// NPC names mirror the previous procedural generator mapping
const npcMap: Record<string, string> = {
  idle: 'neutral1',
  walk1: 'walk1',
  walk2: 'walk2',
  happy: 'happy',
  sad: 'sad',
  jump: 'jump',
  sleep: 'sleep',
  neutral1: 'neutral1',
  neutral2: 'neutral2',
};
for (const [npc, petPose] of Object.entries(npcMap)) {
  const png = npcBuilt.poses[petPose];
  if (!png) continue;
  // Plate frames: skip outline repair (keeps Imagine edges)
  saveSprite(png, path.join(npcDir, `${npc}.png`), { repairOutline: false, outline: OUT });
}

console.log(
  `  pet 32×32: ${petBuilt.maxW}×${petBuilt.maxH} · ${petBuilt.sources.join(' ')}`,
);
console.log(
  `  npc plate: ${npcBuilt.maxW}×${npcBuilt.maxH} · contentH ${npcBuilt.contentH} · ${npcBuilt.sources.join(' ')}`,
);
console.log('Done.');
