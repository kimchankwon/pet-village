/**
 * Build classic Club Penguin style idle + walk plates for the player penguin.
 *
 * The main penguin now matches the dance emote's art family (smooth CP sticker
 * look) instead of the older Grok Imagine pixel plates.
 *
 * Sources:
 *   Idle down  ← dance plate f00 (same art as the dance emote)
 *   Idle side  ← scripts/reference/penguin/cp-side-angle.png
 *   Idle up    ← scripts/reference/penguin/cp-back-angle.png
 *   Walk       ← Tenor Club Penguin walk GIF (8 frames @ 60 ms)
 *                scripts/reference/penguin/cp-walk-gif/penguin-walk.gif
 *
 * Output (shared 220×214 cell, matching the dance sheet):
 *   public/assets/player/penguin/down-0.png          idle front
 *   public/assets/player/penguin/down-1..8.png        walk cycle
 *   public/assets/player/penguin/side-0.png           idle side
 *   public/assets/player/penguin/side-1.png, side-2   walk (GIF frames)
 *   public/assets/player/penguin/up-0.png             idle back
 *   public/assets/player/penguin/up-1.png, up-2       walk (GIF frames)
 *   public/assets/player/penguin/walk/f00..f07.png    walk cells
 *   public/assets/player/penguin/walk-sheet.png       8-wide row
 *
 *   npm run sprite:penguin-classic
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { contentBounds, getPx, setPx } from './lib/pose-animate.mjs';
import { repairExternalOutline } from './lib/pixel-outline.mjs';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');
const omggif = require('omggif');

/** Must match dance sheet cell size so idle ↔ dance swaps stay size-stable. */
export const CLASSIC_CELL_W = 220;
export const CLASSIC_CELL_H = 214;
/** Walk GIF frame count (Tenor club-penguin-penguin-chat walking). */
export const WALK_FRAME_COUNT = 8;
/** GIF delay is 6 cs = 60 ms → ~16.7 fps. */
export const WALK_FRAME_MS = 60;

const OUTLINE: [number, number, number, number] = [0, 0, 0, 255];
// Dance body blues so idle / walk / dance share one base colourway.
const DANCE_BODY: [number, number, number] = [0, 153, 206];
const DANCE_SHADE: [number, number, number] = [1, 78, 107];
const DANCE_HI: [number, number, number] = [20, 160, 209];

const REF = path.resolve('scripts/reference/penguin');
const ROOT = path.join(REF, 'cp-walk-gif');
const GIF = path.join(ROOT, 'penguin-walk.gif');
const FRAME_DIR = path.join(ROOT, 'frames');
const OUT = path.resolve('public/assets/player/penguin');
const WALK_OUT = path.join(OUT, 'walk');
const SHEET_OUT = path.join(OUT, 'walk-sheet.png');
const DANCE_F00 = path.join(OUT, 'dance', 'f00.png');

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

/** Flood-key near-white exterior (Tenor / CP sticker plates). */
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

/** Drop soft grey ground shadow wedges under the feet. */
function removeGroundShadow(src: InstanceType<typeof PNG>) {
  const out = clone(src);
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const c = getPx(src, x, y);
      if (c[3]! < 20) continue;
      const max = Math.max(c[0]!, c[1]!, c[2]!);
      const min = Math.min(c[0]!, c[1]!, c[2]!);
      const sat = max - min;
      const lum = (c[0]! + c[1]! + c[2]!) / 3;
      // Pure greys in the lower half of the plate = cast shadow, not belly.
      if (sat <= 8 && lum >= 70 && lum <= 170 && y > src.height * 0.55) {
        setPx(out, x, y, [0, 0, 0, 0]);
      }
    }
  }
  return out;
}

function isBodyBlue(r: number, g: number, b: number, a: number) {
  if (a < 20) return false;
  if (r + g + b < 90) return false;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max - min < 28 && r > 150) return false;
  if (r > 160 && g > 70 && g < 210 && b < 110 && r > b + 40) return false;
  return b > 70 && b >= g - 15 && b > r + 5;
}

/** Remap body blues onto the dance palette so colourways recolour cleanly. */
function normalizeBodyToDance(src: InstanceType<typeof PNG>) {
  const out = clone(src);
  for (let i = 0; i < out.data.length; i += 4) {
    const r = out.data[i]!;
    const g = out.data[i + 1]!;
    const b = out.data[i + 2]!;
    const a = out.data[i + 3]!;
    if (!isBodyBlue(r, g, b, a)) continue;
    const lum = (r + g + b) / (3 * 255);
    let dest = DANCE_BODY;
    if (lum > 0.55) dest = DANCE_HI;
    else if (lum < 0.28) dest = DANCE_SHADE;
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

/** Fit content into the shared cell, feet planted near the bottom edge. */
function fitBottomCenter(src: InstanceType<typeof PNG>, fillRatio = 0.9) {
  const b = contentBounds(src);
  const cw = b.x1 - b.x0 + 1;
  const ch = b.y1 - b.y0 + 1;
  const scale = Math.min((CLASSIC_CELL_W * fillRatio) / cw, (CLASSIC_CELL_H * fillRatio) / ch);
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
  const out = blank(CLASSIC_CELL_W, CLASSIC_CELL_H);
  const ox = Math.floor((CLASSIC_CELL_W - nw) / 2);
  const oy = CLASSIC_CELL_H - nh - 2;
  for (let y = 0; y < nh; y++) {
    for (let x = 0; x < nw; x++) {
      const c = getPx(scaled, x, y);
      if (c[3]! >= 20) setPx(out, ox + x, oy + y, c);
    }
  }
  return asPng(repairExternalOutline(out, { outline: OUTLINE }));
}

function processPlate(src: InstanceType<typeof PNG>, alreadyKeyed = false) {
  let img = src;
  if (!alreadyKeyed) {
    img = keyWhiteBg(img);
    img = removeGroundShadow(img);
  } else {
    img = removeGroundShadow(img);
  }
  img = normalizeBodyToDance(img);
  return fitBottomCenter(img, 0.9);
}

function extractGifFrames() {
  if (!fs.existsSync(GIF)) {
    console.error(`missing ${GIF}`);
    process.exit(1);
  }
  fs.mkdirSync(FRAME_DIR, { recursive: true });
  const buf = fs.readFileSync(GIF);
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
    fs.writeFileSync(path.join(FRAME_DIR, `f${String(i).padStart(2, '0')}.png`), PNG.sync.write(png));
    prev = {
      disposal: info.disposal,
      x: info.x,
      y: info.y,
      width: info.width,
      height: info.height,
      backup,
    };
  }
  console.log(`extracted ${n} frames ${w}×${h} → ${path.relative(process.cwd(), FRAME_DIR)}`);
  return n;
}

// Prefer pre-extracted frames; re-extract when missing.
const existing = fs.existsSync(FRAME_DIR)
  ? fs.readdirSync(FRAME_DIR).filter((f) => /^f\d{2}\.png$/.test(f)).length
  : 0;
if (existing < WALK_FRAME_COUNT) extractGifFrames();
else console.log(`using ${existing} existing frames in ${path.relative(process.cwd(), FRAME_DIR)}`);

fs.mkdirSync(WALK_OUT, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

const walkPlates: InstanceType<typeof PNG>[] = [];
for (let i = 0; i < WALK_FRAME_COUNT; i++) {
  const srcPath = path.join(FRAME_DIR, `f${String(i).padStart(2, '0')}.png`);
  if (!fs.existsSync(srcPath)) {
    console.error(`missing ${srcPath}`);
    process.exit(1);
  }
  const plate = processPlate(PNG.sync.read(fs.readFileSync(srcPath)));
  walkPlates.push(plate);
  const name = `f${String(i).padStart(2, '0')}.png`;
  fs.writeFileSync(path.join(WALK_OUT, name), PNG.sync.write(plate));
  // down-1..8 = walk cycle (sheet frame 0 is idle)
  fs.writeFileSync(path.join(OUT, `down-${i + 1}.png`), PNG.sync.write(plate));
  const b = contentBounds(plate);
  console.log(
    `  walk ${name} body ${b.x1 - b.x0 + 1}×${b.y1 - b.y0 + 1} feetY=${b.y1}`,
  );
}

// Single-row walk sheet for inspection / optional Boot load.
const sheet = blank(CLASSIC_CELL_W * WALK_FRAME_COUNT, CLASSIC_CELL_H);
for (let i = 0; i < WALK_FRAME_COUNT; i++) {
  const p = walkPlates[i]!;
  for (let y = 0; y < CLASSIC_CELL_H; y++) {
    for (let x = 0; x < CLASSIC_CELL_W; x++) {
      const c = getPx(p, x, y);
      if (c[3]! >= 20) setPx(sheet, i * CLASSIC_CELL_W + x, y, c);
    }
  }
}
fs.writeFileSync(SHEET_OUT, PNG.sync.write(sheet));
console.log(`  walk-sheet → ${path.relative(process.cwd(), SHEET_OUT)}`);

// Idles
if (!fs.existsSync(DANCE_F00)) {
  console.error(`missing ${DANCE_F00} — run npm run sprite:penguin-dance first`);
  process.exit(1);
}
{
  const plate = processPlate(PNG.sync.read(fs.readFileSync(DANCE_F00)), true);
  fs.writeFileSync(path.join(OUT, 'down-0.png'), PNG.sync.write(plate));
  console.log('  down-0 ← dance f00');
}
{
  const plate = processPlate(PNG.sync.read(fs.readFileSync(path.join(REF, 'cp-side-angle.png'))));
  fs.writeFileSync(path.join(OUT, 'side-0.png'), PNG.sync.write(plate));
  console.log('  side-0 ← cp-side-angle');
}
{
  const plate = processPlate(PNG.sync.read(fs.readFileSync(path.join(REF, 'cp-back-angle.png'))));
  fs.writeFileSync(path.join(OUT, 'up-0.png'), PNG.sync.write(plate));
  console.log('  up-0 ← cp-back-angle');
}

// Side/up walk: same GIF so walking is the Tenor cycle in every facing.
// Full 1..8 walk plates per facing keep Boot/anim code uniform.
for (let i = 0; i < WALK_FRAME_COUNT; i++) {
  const walkFile = path.join(WALK_OUT, `f${String(i).padStart(2, '0')}.png`);
  fs.copyFileSync(walkFile, path.join(OUT, `side-${i + 1}.png`));
  fs.copyFileSync(walkFile, path.join(OUT, `up-${i + 1}.png`));
}

console.log(`classic CP plates ready (${CLASSIC_CELL_W}×${CLASSIC_CELL_H}, walk ×${WALK_FRAME_COUNT})`);
