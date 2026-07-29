/**
 * Convert Grok Imagine ice-town assets into transparent / tile PNGs for Phaser.
 *
 * Source: scripts/reference/world-props/*
 * Output: public/assets/world/*.png
 *
 *   npx tsx scripts/process-world-props.mts
 *   npx tsx scripts/process-world-props.mts --only shop,smoke,tile-path
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

/** Isolated props: max edge after crop. */
const PROP_TARGETS: Record<string, number> = {
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
  smoke: 80,
  wildflower: 120,
  mushroom: 110,
  stump: 120,
  fence: 140,
  'clothes-rack': 180,
  // furniture
  'item-bed': 180,
  'item-chair': 140,
  'item-table': 140,
  'item-rug': 160,
  'item-lamp': 160,
  'item-bookshelf': 180,
  'item-tv': 140,
  'item-plant': 140,
  'item-flower': 140,
  'item-lightstick': 140,
  // games / items
  bin: 140,
  paperball: 80,
  'catch-bowl': 140,
  rod: 200,
  bobber: 64,
  ripple: 100,
  'music-note-crotchet': 90,
  'music-note-quaver': 90,
  'music-note-double-quaver': 100,
  fish: 100,
  bait: 80,
  cookie: 80,
  coin: 64,
  heart: 64,
  poop: 80,
  'oceanfish-common': 110,
  'oceanfish-uncommon': 110,
  'oceanfish-rare': 110,
};

const TILE_KEYS = [
  'tile-grass',
  'tile-snow',
  'tile-path',
  'tile-plaza',
  'tile-sand',
  'tile-ocean',
  'tile-ocean2',
  'tile-floor',
  'tile-wall',
] as const;
const TILE_SIZE = 48; // matches makeTile(size=16) * SCALE(3)

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

function jpgToPngBuffer(jpgPath: string): Buffer {
  fs.mkdirSync(TMP, { recursive: true });
  const tmpPng = path.join(TMP, `${path.basename(jpgPath, path.extname(jpgPath))}.raw.png`);
  execFileSync('sips', ['-s', 'format', 'png', jpgPath, '--out', tmpPng], { stdio: 'pipe' });
  return fs.readFileSync(tmpPng);
}

function loadRef(name: string): InstanceType<typeof PNG> | null {
  for (const ext of ['.jpg', '.jpeg', '.png']) {
    const p = path.join(REF, name + ext);
    if (!fs.existsSync(p)) continue;
    const buf = ext === '.png' ? fs.readFileSync(p) : jpgToPngBuffer(p);
    return PNG.sync.read(buf);
  }
  return null;
}

function removeExterior(src: InstanceType<typeof PNG>): InstanceType<typeof PNG> {
  const out = clone(src);
  const w = src.width;
  const h = src.height;
  const exterior = new Uint8Array(w * h);
  const queue: number[] = [];
  const corners = [get(src, 2, 2), get(src, w - 3, 2), get(src, 2, h - 3), get(src, w - 3, h - 3)];
  const bgLike = (c: RGBA) => {
    if (c[3]! < 20) return true;
    // Lime / pure green key (#00FF00) — preferred; does not eat pink art.
    if (c[1]! > 160 && c[1]! - c[0]! > 50 && c[1]! - c[2]! > 50) return true;
    if (c[1]! > 200 && c[0]! < 90 && c[2]! < 90) return true;
    // Magenta / hot pink key (legacy plates)
    if (c[0]! > 180 && c[2]! > 140 && c[1]! < 120 && c[0]! - c[1]! > 50) return true;
    if (c[0]! > 200 && c[1]! < 70 && c[2]! > 160) return true;
    // Corner-matched exterior only (do NOT key pure black — eats booth interiors).
    for (const bg of corners) {
      if (Math.hypot(c[0]! - bg[0]!, c[1]! - bg[1]!, c[2]! - bg[2]!) < 38) return true;
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
  // Green key trapped inside closed outlines (bench plank gaps, booth sides)
  // must also go transparent so the game snow shows through, not lime green.
  for (let i = 0; i < w * h; i++) {
    const o = i << 2;
    if (out.data[o + 3]! < 20) continue;
    const r = out.data[o]!;
    const g = out.data[o + 1]!;
    const b = out.data[o + 2]!;
    if (g > 160 && g - r > 50 && g - b > 50) {
      out.data[o] = 0;
      out.data[o + 1] = 0;
      out.data[o + 2] = 0;
      out.data[o + 3] = 0;
    }
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
  for (let y = 0; y < h; y++) {
    const sy = Math.min(src.height - 1, Math.floor(y / scale));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(src.width - 1, Math.floor(x / scale));
      set(out, x, y, get(src, sx, sy));
    }
  }
  return out;
}

function scaleExact(src: InstanceType<typeof PNG>, w: number, h: number) {
  const out = blank(w, h);
  for (let y = 0; y < h; y++) {
    const sy = Math.min(src.height - 1, Math.floor((y / h) * src.height));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(src.width - 1, Math.floor((x / w) * src.width));
      set(out, x, y, get(src, sx, sy));
    }
  }
  return out;
}

function writePng(name: string, png: InstanceType<typeof PNG>) {
  fs.mkdirSync(OUT, { recursive: true });
  if (!(png.data instanceof Buffer)) png.data = Buffer.from(png.data);
  fs.writeFileSync(path.join(OUT, `${name}.png`), PNG.sync.write(png));
  console.log(`wrote ${name}.png ${png.width}×${png.height}`);
}

function finalizeProp(name: string, png: InstanceType<typeof PNG>) {
  let out = cropPad(png, 8);
  out = scaleToMax(out, PROP_TARGETS[name] ?? 140);
  if (!(out.data instanceof Buffer)) out.data = Buffer.from(out.data);
  cleanSpriteExterior(out, { outline: OUTLINE, tolerance: 48, repairOutline: false });
  out = repairExternalOutline(out, { outline: OUTLINE, tolerance: 48 });
  writePng(name, out);
}

function processSingleProp(name: string) {
  const src = loadRef(name);
  if (!src) {
    console.warn(`skip missing ${name}`);
    return;
  }
  for (let i = 0; i < src.width * src.height; i++) {
    const o = i << 2;
    if (src.data[o + 3]! > 0 && src.data[o + 3]! < 255) src.data[o + 3] = 255;
  }
  finalizeProp(name, removeExterior(src));
}

/** Opaque tiles: resize full image to TILE_SIZE (no chroma key). */
function processTile(name: string) {
  const src = loadRef(name);
  if (!src) {
    console.warn(`skip missing tile ${name}`);
    return;
  }
  // Force opaque
  for (let i = 0; i < src.width * src.height; i++) {
    const o = i << 2;
    src.data[o + 3] = 255;
  }
  const out = scaleExact(src, TILE_SIZE, TILE_SIZE);
  writePng(name, out);
}

type Component = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  pixels: number[];
  area: number;
};

/** Segment opaque islands after magenta keying; largest first then reading order. */
function segmentComponents(src: InstanceType<typeof PNG>, minArea = 400): Component[] {
  const keyed = removeExterior(src);
  const w = keyed.width;
  const h = keyed.height;
  const seen = new Uint8Array(w * h);
  const comps: Component[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const start = y * w + x;
      if (seen[start] || keyed.data[start * 4 + 3]! < 20) continue;
      const queue = [start];
      seen[start] = 1;
      let qi = 0;
      let minX = x;
      let minY = y;
      let maxX = x;
      let maxY = y;
      const pixels: number[] = [];
      while (qi < queue.length) {
        const i = queue[qi++]!;
        pixels.push(i);
        const cx = i % w;
        const cy = (i / w) | 0;
        if (cx < minX) minX = cx;
        if (cy < minY) minY = cy;
        if (cx > maxX) maxX = cx;
        if (cy > maxY) maxY = cy;
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const ni = ny * w + nx;
          if (seen[ni] || keyed.data[ni * 4 + 3]! < 20) continue;
          seen[ni] = 1;
          queue.push(ni);
        }
      }
      if (pixels.length < minArea) continue;
      comps.push({ minX, minY, maxX, maxY, pixels, area: pixels.length });
    }
  }
  return comps.map((c) => {
    const out = blank(src.width, src.height);
    for (const i of c.pixels) {
      const o = i << 2;
      out.data[o] = keyed.data[o]!;
      out.data[o + 1] = keyed.data[o + 1]!;
      out.data[o + 2] = keyed.data[o + 2]!;
      out.data[o + 3] = keyed.data[o + 3]!;
    }
    return { ...c, png: out };
  }) as (Component & { png: InstanceType<typeof PNG> })[];
}

function readingOrderSort(comps: (Component & { png: InstanceType<typeof PNG> })[]) {
  // Band by relative height so two rows stay separate.
  const heights = comps.map((c) => c.maxY - c.minY + 1);
  const medianH = heights.sort((a, b) => a - b)[Math.floor(heights.length / 2)] ?? 80;
  const band = Math.max(40, medianH * 0.55);
  return [...comps].sort((a, b) => {
    const ay = (a.minY + a.maxY) / 2;
    const by = (b.minY + b.maxY) / 2;
    const row = Math.floor(ay / band) - Math.floor(by / band);
    if (row !== 0) return row;
    return a.minX - b.minX;
  });
}

function processSheet(sheetName: string, names: string[], minArea = 500) {
  const src = loadRef(sheetName);
  if (!src) {
    console.warn(`skip missing sheet ${sheetName}`);
    return;
  }
  let comps = segmentComponents(src, minArea);
  // Keep the largest N islands (drop sparkle freckles), then reading order.
  comps = [...comps]
    .sort((a, b) => b.area - a.area)
    .slice(0, names.length);
  comps = readingOrderSort(comps as (Component & { png: InstanceType<typeof PNG> })[]);
  console.log(`sheet ${sheetName}: using ${comps.length}/${names.length} largest components`);
  const n = Math.min(comps.length, names.length);
  for (let i = 0; i < n; i++) {
    const name = names[i]!;
    const comp = comps[i]! as Component & { png: InstanceType<typeof PNG> };
    finalizeProp(name, comp.png);
  }
  if (comps.length < names.length) {
    console.warn(`  missing names: ${names.slice(comps.length).join(', ')}`);
  }
}

// --- run ---
const onlyArg = process.argv.find((a) => a.startsWith('--only='));
const only = onlyArg
  ? new Set(onlyArg.slice(7).split(',').map((s) => s.trim()).filter(Boolean))
  : null;
const want = (name: string) => !only || only.has(name);

// Tiles
for (const t of TILE_KEYS) {
  if (want(t)) processTile(t);
}

// Existing singles + new singles
for (const name of Object.keys(PROP_TARGETS)) {
  if (!want(name)) continue;
  // Skip names that only come from sheets unless a single file exists
  const single = loadRef(name);
  if (single) processSingleProp(name);
}

// Sheets (always process if sheet file exists and any name wanted)
if (!only || namesWantedAny(['wildflower', 'mushroom', 'stump', 'fence'])) {
  processSheet('outdoor-sheet', ['wildflower', 'mushroom', 'stump', 'fence'], 800);
}
if (
  !only ||
  namesWantedAny([
    'item-bed',
    'item-chair',
    'item-table',
    'item-rug',
    'item-lamp',
    'item-bookshelf',
    'item-tv',
    'item-plant',
    'item-flower',
    'item-lightstick',
  ])
) {
  processSheet(
    'furniture-sheet',
    [
      'item-bed',
      'item-chair',
      'item-table',
      'item-rug',
      'item-lamp',
      'item-bookshelf',
      'item-tv',
      'item-plant',
      'item-flower',
      'item-lightstick',
    ],
    600,
  );
}
if (
  !only ||
  namesWantedAny([
    'bin',
    'paperball',
    'catch-bowl',
    'rod',
    'music-note-crotchet',
    'music-note-quaver',
    'music-note-double-quaver',
    'ripple',
    'fish',
    'bait',
    'cookie',
    'coin',
    'heart',
    'poop',
  ])
) {
  // Order from visual sheet layout (row-major):
  // row0: bin, paperball, catch-bowl, rod(+bobber)
  // row1: notes ×3, ripple (ripple may be under rod)
  // row2: fish, bait, cookie, coin, heart, poop
  processSheet(
    'game-sheet',
    [
      'bin',
      'paperball',
      'catch-bowl',
      'rod',
      'music-note-crotchet',
      'music-note-quaver',
      'music-note-double-quaver',
      'ripple',
      'fish',
      'bait',
      'cookie',
      'coin',
      'heart',
      'poop',
    ],
    400,
  );
}
if (!only || namesWantedAny(['oceanfish-common', 'oceanfish-uncommon', 'oceanfish-rare'])) {
  processSheet('fish-sheet', ['oceanfish-common', 'oceanfish-uncommon', 'oceanfish-rare'], 500);
}

// Bobber: crop from rod tip if no standalone file — use a small red-white circle fallback from rod sheet component.
if (want('bobber') && !fs.existsSync(path.join(OUT, 'bobber.png'))) {
  // Build a simple bobber from scratch if missing (fallback so fishing still works).
  const b = blank(48, 48);
  for (let y = 8; y < 40; y++) {
    for (let x = 14; x < 34; x++) {
      const dx = x - 24;
      const dy = y - 20;
      if (dx * dx + dy * dy > 100) continue;
      const top = y < 20;
      set(b, x, y, top ? [220, 50, 60, 255] : [245, 245, 250, 255]);
    }
  }
  // outline
  finalizeProp('bobber', b);
}

function namesWantedAny(names: string[]) {
  return names.some((n) => want(n));
}

console.log('done');
