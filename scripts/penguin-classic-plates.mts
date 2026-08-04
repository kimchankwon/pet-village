/**
 * Build classic Club Penguin style idle + walk plates for the player penguin.
 *
 * The main penguin now matches the dance emote's art family (smooth CP sticker
 * look) instead of the older Grok Imagine pixel plates.
 *
 * Sources:
 *   Idle down  ← dance plate f00 (front stand)
 *   Idle side  ← dance plate f07 (side stand from the spin wind-up)
 *   Idle up    ← dance plate f08 (back stand from the spin)
 *   Walk       ← Tenor Club Penguin walk GIF (8 frames @ 60 ms)
 *                scripts/reference/penguin/cp-walk-gif/penguin-walk.gif
 *
 * Output (shared 220×214 cell, matching the dance sheet):
 *   public/assets/player/penguin/down-0.png          idle front
 *   public/assets/player/penguin/down-1..8.png        walk cycle
 *   public/assets/player/penguin/side-0.png           idle side
 *   public/assets/player/penguin/side-1..8.png        walk (GIF frames)
 *   public/assets/player/penguin/up-0.png             idle back
 *   public/assets/player/penguin/up-1..8.png          walk (GIF frames)
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
const DANCE_DIR = path.join(OUT, 'dance');
/** Standing poses harvested from the dance medley (same art family as the emote). */
const DANCE_IDLE = {
  down: path.join(DANCE_DIR, 'f00.png'), // front plant
  side: path.join(DANCE_DIR, 'f07.png'), // side plant mid-spin
  up: path.join(DANCE_DIR, 'f08.png'), // back plant mid-spin
} as const;

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

/**
 * Drop soft grey ground-shadow wedges under the feet (Tenor walk plate).
 * Applied on the full-res GIF frame and again after fit, so bilinear AA of the
 * shadow does not reappear as a floating grey/black squiggle under the feet.
 */
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
      // Orange beak/feet and dark-brown foot tops stay.
      const isOrange = c[0]! > 160 && c[1]! > 70 && c[2]! < 120 && c[0]! > c[2]! + 40;
      const isFootBrown =
        c[0]! > 70 && c[0]! < 160 && c[1]! > 30 && c[1]! < 100 && c[2]! < 50 && c[0]! > c[2]! + 30;
      if (isOrange || isFootBrown) continue;
      // Greys / desaturated midtones in the lower half = cast shadow (+ AA fringe).
      if (sat <= 28 && lum >= 40 && lum <= 210 && y > src.height * 0.5) {
        setPx(out, x, y, [0, 0, 0, 0]);
      }
    }
  }
  return out;
}

/**
 * Drop near-black / desaturated islands that do not touch the coloured body.
 * Catches both `repairExternalOutline` rims around deleted shadows and soft
 * grey shadow AA left under the feet after the walk GIF is keyed.
 */
function stripDisconnectedOutline(src: InstanceType<typeof PNG>) {
  const w = src.width;
  const h = src.height;
  /** Candidate junk: near-black OR desaturated midtone (shadow AA). */
  const isJunk = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return false;
    const c = getPx(src, x, y);
    if (c[3]! < 20) return false;
    const max = Math.max(c[0]!, c[1]!, c[2]!);
    const min = Math.min(c[0]!, c[1]!, c[2]!);
    const sat = max - min;
    const lum = (c[0]! + c[1]! + c[2]!) / 3;
    if (lum < 48) return true; // near-black
    if (sat <= 28 && lum <= 190) return true; // grey shadow residue
    return false;
  };
  /** Real body: saturated colour (blue / orange / brown / white belly). */
  const isBody = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return false;
    const c = getPx(src, x, y);
    if (c[3]! < 20) return false;
    if (isJunk(x, y)) return false;
    return true;
  };
  const keep = new Uint8Array(w * h);
  const queue: [number, number][] = [];
  // Seed: junk pixels that already touch a real body pixel.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!isJunk(x, y)) continue;
      const touchesBody = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
        [1, 1],
        [-1, -1],
        [1, -1],
        [-1, 1],
      ].some(([dx, dy]) => isBody(x + dx!, y + dy!));
      if (!touchesBody) continue;
      keep[y * w + x] = 1;
      queue.push([x, y]);
    }
  }
  // Grow through junk neighbours so a continuous rim around the body stays.
  for (let head = 0; head < queue.length; head++) {
    const [x, y] = queue[head]!;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (!isJunk(nx, ny)) continue;
      const idx = ny * w + nx;
      if (keep[idx]) continue;
      keep[idx] = 1;
      queue.push([nx, ny]);
    }
  }
  const out = clone(src);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (isJunk(x, y) && !keep[y * w + x]) setPx(out, x, y, [0, 0, 0, 0]);
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

/**
 * Fit content into the shared cell, feet planted near the bottom edge.
 * @param addOutline When true (dance idles), redraw a clean 1px rim. Walk GIF
 *   frames stay soft-edged — hard outline around residual foot/shadow AA draws
 *   floating black arcs under the feet that never read as part of the body.
 */
function fitBottomCenter(src: InstanceType<typeof PNG>, fillRatio = 0.9, addOutline = true) {
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
  if (!addOutline) {
    // Shadow AA can reappear after bilinear fit — strip again, then drop any
    // leftover near-black islands that never touch the coloured body.
    return stripDisconnectedOutline(removeGroundShadow(out));
  }
  const outlined = asPng(repairExternalOutline(out, { outline: OUTLINE }));
  return stripDisconnectedOutline(outlined);
}

/** Horizontal mirror — game side art must face right (`setFlipX(vx < 0)`). */
function flipHorizontal(src: InstanceType<typeof PNG>) {
  const out = blank(src.width, src.height);
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const c = getPx(src, x, y);
      if (c[3]! < 20) continue;
      setPx(out, src.width - 1 - x, y, c);
    }
  }
  return out;
}

/**
 * Dance idle plates (already keyed, hard-edged).
 * Side stand (f07) faces left in the GIF — mirror so it faces right, matching
 * every scene's `setFlipX(vx < 0)` convention (unflipped = east / SE / NE).
 */
function processDanceIdle(src: InstanceType<typeof PNG>, facing: 'down' | 'up' | 'side') {
  let img = normalizeBodyToDance(src);
  if (facing === 'side') img = flipHorizontal(img);
  return fitBottomCenter(img, 0.9, true);
}

/** Tenor walk frames — key white, strip ground shadow, no hard outline. */
function processWalkFrame(src: InstanceType<typeof PNG>) {
  let img = keyWhiteBg(src);
  img = removeGroundShadow(img);
  img = normalizeBodyToDance(img);
  return fitBottomCenter(img, 0.9, false);
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
  const plate = processWalkFrame(PNG.sync.read(fs.readFileSync(srcPath)));
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

// Idles — standing poses from the dance GIF (same body as the emote).
for (const [facing, srcPath] of Object.entries(DANCE_IDLE) as [keyof typeof DANCE_IDLE, string][]) {
  if (!fs.existsSync(srcPath)) {
    console.error(`missing ${srcPath} — run npm run sprite:penguin-dance first`);
    process.exit(1);
  }
  const plate = processDanceIdle(PNG.sync.read(fs.readFileSync(srcPath)), facing);
  fs.writeFileSync(path.join(OUT, `${facing}-0.png`), PNG.sync.write(plate));
  const note = facing === 'side' ? ' (mirrored → faces right)' : '';
  console.log(`  ${facing}-0 ← ${path.relative(process.cwd(), srcPath)}${note}`);
}

// Side/up walk: same GIF so walking is the Tenor cycle in every facing.
// Full 1..8 walk plates per facing keep Boot/anim code uniform.
for (let i = 0; i < WALK_FRAME_COUNT; i++) {
  const walkFile = path.join(WALK_OUT, `f${String(i).padStart(2, '0')}.png`);
  fs.copyFileSync(walkFile, path.join(OUT, `side-${i + 1}.png`));
  fs.copyFileSync(walkFile, path.join(OUT, `up-${i + 1}.png`));
}

console.log(`classic CP plates ready (${CLASSIC_CELL_W}×${CLASSIC_CELL_H}, walk ×${WALK_FRAME_COUNT})`);
