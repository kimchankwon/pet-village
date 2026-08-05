/**
 * Build Club Penguin emote sheets: wave + sit (from dance), breakdance + hip hop
 * (from Tenor GIFs). All cells are 220×214 dance-registration so the game draws
 * them with configureDancePenguin at the same size as the idle plant.
 *
 * Sources:
 *   Wave  ← dance f40–f41 flipper raise, repeated slowly (no sit / other-side)
 *   Sit   ← dance f34 (seated plant with feet forward), 2 identical cells
 *   Breakdance ← scripts/reference/penguin/cp-breakdance-gif/penguin-breakdance.gif
 *               https://tenor.com/view/club-penguin-gif-23754816
 *   Hip hop    ← scripts/reference/penguin/cp-hiphop-gif/penguin-hiphop.gif
 *               https://tenor.com/view/club-penguin-gif-16374127956260176203
 *
 * GIF frames share one uniform scale (height-only, never shrunk for wide arms)
 * so hip hop / breakdance do not pulse smaller when limbs stretch.
 *
 *   npm run sprite:penguin-emotes
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { contentBounds, getPx, setPx } from './lib/pose-animate.mjs';
import { repairExternalOutline } from './lib/pixel-outline.mjs';
import {
  PENGUIN_EMOTE_CONFIG,
  SIT_FROM_DANCE_FRAME,
  WAVE_FROM_DANCE_FRAMES,
} from '../src/systems/penguinEmotes.ts';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');
const omggif = require('omggif');

export const CELL_W = 220;
export const CELL_H = 214;
const OUTLINE: [number, number, number, number] = [0, 0, 0, 255];
const DANCE_BODY: [number, number, number] = [0, 153, 206];
const DANCE_SHADE: [number, number, number] = [1, 78, 107];
const DANCE_HI: [number, number, number] = [20, 160, 209];

const OUT = path.resolve('public/assets/player/penguin');
const DANCE_DIR = path.join(OUT, 'dance');
const REF = path.resolve('scripts/reference/penguin');

function blank(w: number, h: number) {
  const p = new PNG({ width: w, height: h });
  p.data.fill(0);
  return p;
}
function asPng(image: { width: number; height: number; data: Buffer | Uint8Array }) {
  const png = blank(image.width, image.height);
  Buffer.from(image.data).copy(png.data);
  return png;
}
function clone(src: InstanceType<typeof PNG>) {
  const out = blank(src.width, src.height);
  src.data.copy(out.data);
  return out;
}

function keyWhiteBg(src: InstanceType<typeof PNG>) {
  const out = blank(src.width, src.height);
  const isBg = (c: number[]) => {
    if (c[3]! < 20) return true;
    const min = Math.min(c[0]!, c[1]!, c[2]!);
    const max = Math.max(c[0]!, c[1]!, c[2]!);
    if (min > 235 && max - min < 18) return true;
    if (min > 220 && max - min < 25 && (c[0]! + c[1]! + c[2]!) / 3 > 230) return true;
    return false;
  };
  const exterior = new Uint8Array(src.width * src.height);
  const queue: [number, number][] = [];
  const enq = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= src.width || y >= src.height) return;
    const i = y * src.width + x;
    if (exterior[i]) return;
    if (!isBg(getPx(src, x, y))) return;
    exterior[i] = 1;
    queue.push([x, y]);
  };
  for (let x = 0; x < src.width; x++) {
    enq(x, 0);
    enq(x, src.height - 1);
  }
  for (let y = 0; y < src.height; y++) {
    enq(0, y);
    enq(src.width - 1, y);
  }
  for (let head = 0; head < queue.length; head++) {
    const [x, y] = queue[head]!;
    enq(x + 1, y);
    enq(x - 1, y);
    enq(x, y + 1);
    enq(x, y - 1);
  }
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      if (exterior[y * src.width + x]) continue;
      const c = getPx(src, x, y);
      if (c[3]! < 20) continue;
      setPx(out, x, y, [c[0]!, c[1]!, c[2]!, 255]);
    }
  }
  return out;
}

/**
 * True for recolourable body pixels on either dance-cyan or classic black Tenor
 * penguins. Skips outline, belly white, and orange beak/feet.
 */
function isRemapBody(r: number, g: number, b: number, a: number) {
  if (a < 20) return false;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lum = (r + g + b) / 3;
  // Pure outline / near-black stays black.
  if (lum < 28) return false;
  // White / light grey belly.
  if (max - min < 28 && lum > 150) return false;
  // Orange beak / feet.
  if (r > 160 && g > 70 && g < 210 && b < 110 && r > b + 40) return false;
  // Black-CP greys and dark blues (Tenor breakdance / hip hop).
  if (max - min <= 30 && lum >= 28 && lum < 210) return true;
  // Existing dance cyan family.
  if (b > 60 && b >= g - 20 && b > r + 5) return true;
  return false;
}

/**
 * Map body pixels onto the dance cyan palette. Tenor GIFs are nearly black —
 * bias midtones to DANCE_BODY (not shade) so the village penguin stays bright.
 */
function normalizeBodyToDance(src: InstanceType<typeof PNG>) {
  const out = clone(src);
  for (let i = 0; i < out.data.length; i += 4) {
    const r = out.data[i]!;
    const g = out.data[i + 1]!;
    const b = out.data[i + 2]!;
    const a = out.data[i + 3]!;
    if (!isRemapBody(r, g, b, a)) continue;
    const lum = (r + g + b) / (3 * 255);
    let dest = DANCE_BODY;
    // Only true highlights → HI; only deep form shadow → shade. Most of a black
    // GIF body is mid-dark and must land on the main body blue, not shade.
    if (lum > 0.52) dest = DANCE_HI;
    else if (lum < 0.12) dest = DANCE_SHADE;
    out.data[i] = dest[0];
    out.data[i + 1] = dest[1];
    out.data[i + 2] = dest[2];
  }
  return out;
}

function sampleBilinear(src: InstanceType<typeof PNG>, fx: number, fy: number): [number, number, number, number] {
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(src.width - 1, x0 + 1);
  const y1 = Math.min(src.height - 1, y0 + 1);
  const tx = fx - x0;
  const ty = fy - y0;
  const c00 = getPx(src, x0, y0);
  const c10 = getPx(src, x1, y0);
  const c01 = getPx(src, x0, y1);
  const c11 = getPx(src, x1, y1);
  const a =
    c00[3]! * (1 - tx) * (1 - ty) +
    c10[3]! * tx * (1 - ty) +
    c01[3]! * (1 - tx) * ty +
    c11[3]! * tx * ty;
  if (a < 20) return [0, 0, 0, 0];
  const blend = (ch: number) =>
    Math.round(
      (c00[ch]! * c00[3]! * (1 - tx) * (1 - ty) +
        c10[ch]! * c10[3]! * tx * (1 - ty) +
        c01[ch]! * c01[3]! * (1 - tx) * ty +
        c11[ch]! * c11[3]! * tx * ty) /
        Math.max(1, a),
    );
  return [blend(0), blend(1), blend(2), Math.min(255, Math.round(a))];
}

/** Target standing body height inside the dance cell (matches DANCE_STAND_HEIGHT_RATIO). */
const TARGET_STAND_H = Math.round(CELL_H * (131 / 214));
const FEET_ROW = Math.round(CELL_H * (155.5 / 214));

/**
 * Fit a single plate at a fixed scale (shared across an emote). Scale is
 * height-only — wide arm frames are never shrunk to fit width; they clip if
 * needed so the body does not pulse smaller mid-animation.
 */
function fitAtScale(src: InstanceType<typeof PNG>, scale: number) {
  const b = contentBounds(src);
  const cw = Math.max(1, b.x1 - b.x0 + 1);
  const ch = Math.max(1, b.y1 - b.y0 + 1);
  const nw = Math.max(1, Math.round(cw * scale));
  const nh = Math.max(1, Math.round(ch * scale));
  const scaled = blank(nw, nh);
  for (let y = 0; y < nh; y++) {
    for (let x = 0; x < nw; x++) {
      const sx = b.x0 + ((x + 0.5) / nw) * cw - 0.5;
      const sy = b.y0 + ((y + 0.5) / nh) * ch - 0.5;
      const c = sampleBilinear(
        src,
        Math.max(0, Math.min(src.width - 1, sx)),
        Math.max(0, Math.min(src.height - 1, sy)),
      );
      if (c[3]! >= 20) setPx(scaled, x, y, [c[0]!, c[1]!, c[2]!, 255]);
    }
  }
  const out = blank(CELL_W, CELL_H);
  const ox = Math.floor((CELL_W - nw) / 2);
  const oy = FEET_ROW - nh;
  for (let y = 0; y < nh; y++) {
    for (let x = 0; x < nw; x++) {
      const c = getPx(scaled, x, y);
      if (c[3]! < 20) continue;
      const dx = ox + x;
      const dy = oy + y;
      if (dx < 0 || dy < 0 || dx >= CELL_W || dy >= CELL_H) continue;
      setPx(out, dx, dy, c);
    }
  }
  return asPng(repairExternalOutline(out, { outline: OUTLINE }));
}

/**
 * Uniform scale for a whole GIF: based on the tallest frame's body height so
 * every frame of the loop shares one pixel scale (no jarring shrink on stretch).
 */
function uniformScaleForPlates(srcs: InstanceType<typeof PNG>[]) {
  let maxH = 1;
  for (const src of srcs) {
    const b = contentBounds(src);
    maxH = Math.max(maxH, b.y1 - b.y0 + 1);
  }
  return TARGET_STAND_H / maxH;
}

function extractGifFrames(gifPath: string, frameDir: string): number {
  if (!fs.existsSync(gifPath)) {
    console.error(`missing ${gifPath}`);
    process.exit(1);
  }
  fs.mkdirSync(frameDir, { recursive: true });
  const buf = fs.readFileSync(gifPath);
  const reader = new omggif.GifReader(buf);
  const w = reader.width;
  const h = reader.height;
  const n = reader.numFrames();
  let canvas = new Uint8ClampedArray(w * h * 4);
  let prev: {
    disposal: number;
    x: number;
    y: number;
    width: number;
    height: number;
    backup: Uint8ClampedArray | null;
  } | null = null;
  for (let i = 0; i < n; i++) {
    const info = reader.frameInfo(i);
    if (prev && prev.disposal === 2) {
      for (let y = prev.y; y < prev.y + prev.height; y++) {
        for (let x = prev.x; x < prev.x + prev.width; x++) {
          const o = (y * w + x) * 4;
          canvas[o] = canvas[o + 1] = canvas[o + 2] = canvas[o + 3] = 0;
        }
      }
    } else if (prev && prev.disposal === 3 && prev.backup) {
      canvas.set(prev.backup);
    }
    let backup: Uint8ClampedArray | null = null;
    if (info.disposal === 3) backup = canvas.slice();
    const frame = new Uint8ClampedArray(w * h * 4);
    reader.decodeAndBlitFrameRGBA(i, frame);
    for (let p = 0; p < frame.length; p += 4) {
      if (frame[p + 3]! > 0) {
        canvas[p] = frame[p]!;
        canvas[p + 1] = frame[p + 1]!;
        canvas[p + 2] = frame[p + 2]!;
        canvas[p + 3] = frame[p + 3]!;
      }
    }
    const png = blank(w, h);
    Buffer.from(canvas).copy(png.data);
    fs.writeFileSync(path.join(frameDir, `f${String(i).padStart(3, '0')}.png`), PNG.sync.write(png));
    prev = {
      disposal: info.disposal,
      x: info.x,
      y: info.y,
      width: info.width,
      height: info.height,
      backup,
    };
  }
  console.log(`extracted ${n} frames ${w}×${h} → ${path.relative(process.cwd(), frameDir)}`);
  return n;
}

function packSheet(plates: InstanceType<typeof PNG>[], cols: number, outPath: string) {
  const rows = Math.ceil(plates.length / cols);
  const sheet = blank(CELL_W * cols, CELL_H * rows);
  for (let i = 0; i < plates.length; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const plate = plates[i]!;
    const ox = col * CELL_W;
    const oy = row * CELL_H;
    for (let y = 0; y < CELL_H; y++) {
      for (let x = 0; x < CELL_W; x++) {
        const c = getPx(plate, x, y);
        if (c[3]! < 20) continue;
        setPx(sheet, ox + x, oy + y, [c[0]!, c[1]!, c[2]!, 255]);
      }
    }
  }
  fs.writeFileSync(outPath, PNG.sync.write(sheet));
  console.log(
    `  sheet ${path.relative(process.cwd(), outPath)} ${sheet.width}×${sheet.height} (${cols}×${rows}, ${plates.length} cells)`,
  );
}

function writeIndividuals(dir: string, plates: InstanceType<typeof PNG>[]) {
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(dir)) {
    if (f.endsWith('.png')) fs.unlinkSync(path.join(dir, f));
  }
  for (let i = 0; i < plates.length; i++) {
    fs.writeFileSync(path.join(dir, `f${String(i).padStart(2, '0')}.png`), PNG.sync.write(plates[i]!));
  }
}

function loadDanceFrame(index: number) {
  const p = path.join(DANCE_DIR, `f${String(index).padStart(2, '0')}.png`);
  if (!fs.existsSync(p)) {
    console.error(`missing ${p} — run npm run sprite:penguin-dance first`);
    process.exit(1);
  }
  return PNG.sync.read(fs.readFileSync(p));
}

// ---- Wave: first flipper raise only, repeated slowly ----
{
  const cfg = PENGUIN_EMOTE_CONFIG.wave;
  if (WAVE_FROM_DANCE_FRAMES.length !== cfg.frameCount) {
    console.error(`wave frame list ${WAVE_FROM_DANCE_FRAMES.length} ≠ config ${cfg.frameCount}`);
    process.exit(1);
  }
  const plates = WAVE_FROM_DANCE_FRAMES.map((i) => {
    // Dance plates are already keyed + outlined; keep registration so scale matches.
    return normalizeBodyToDance(loadDanceFrame(i));
  });
  const dir = path.join(OUT, 'wave');
  writeIndividuals(dir, plates);
  packSheet(plates, plates.length, path.join(OUT, 'wave-sheet.png'));
  console.log(`wave ← dance f40–f41 ×4 @ ${cfg.frameMs}ms (${plates.length} cells)`);
}

// ---- Sit: seated plant with feet forward (2 identical cells) ----
{
  const cfg = PENGUIN_EMOTE_CONFIG.sit;
  const plate = normalizeBodyToDance(loadDanceFrame(SIT_FROM_DANCE_FRAME));
  const plates = Array.from({ length: cfg.frameCount }, () => plate);
  const dir = path.join(OUT, 'sit');
  writeIndividuals(dir, plates);
  packSheet(plates, plates.length, path.join(OUT, 'sit-sheet.png'));
  console.log(`sit ← dance f${String(SIT_FROM_DANCE_FRAME).padStart(2, '0')} ×${cfg.frameCount}`);
}

// ---- Breakdance + hip hop from Tenor GIFs (uniform scale, bright body) ----
function buildFromGif(
  name: 'breakdance' | 'hiphop',
  gifRel: string,
  expectedFrames: number,
) {
  const gifPath = path.join(REF, gifRel);
  const frameDir = path.join(path.dirname(gifPath), 'frames');
  const n = extractGifFrames(gifPath, frameDir);
  if (n !== expectedFrames) {
    console.error(`${name}: GIF has ${n} frames, expected ${expectedFrames}`);
    process.exit(1);
  }
  const keyed: InstanceType<typeof PNG>[] = [];
  for (let i = 0; i < n; i++) {
    const raw = PNG.sync.read(fs.readFileSync(path.join(frameDir, `f${String(i).padStart(3, '0')}.png`)));
    keyed.push(normalizeBodyToDance(keyWhiteBg(raw)));
  }
  // One scale for the whole loop — never shrink a frame because arms went wide.
  const scale = uniformScaleForPlates(keyed);
  const plates = keyed.map((src) => fitAtScale(src, scale));
  const dir = path.join(OUT, name);
  writeIndividuals(dir, plates);
  const cols = name === 'hiphop' ? 10 : 8;
  packSheet(plates, cols, path.join(OUT, `${name}-sheet.png`));
  console.log(`${name} ← ${gifRel} (${n} frames, uniform scale ${scale.toFixed(3)})`);
}

buildFromGif('breakdance', 'cp-breakdance-gif/penguin-breakdance.gif', PENGUIN_EMOTE_CONFIG.breakdance.frameCount);
buildFromGif('hiphop', 'cp-hiphop-gif/penguin-hiphop.gif', PENGUIN_EMOTE_CONFIG.hiphop.frameCount);

console.log('emote plates ready (220×214 dance registration)');
