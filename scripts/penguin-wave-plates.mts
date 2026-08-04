/**
 * Build Club Penguin wave plates from the authentic Tenor wave GIF.
 *
 * Source:
 *   https://tenor.com/view/club-penguin-wave-gif-25809655
 *   scripts/reference/penguin/cp-wave-gif/penguin-wave.gif
 *
 * The GIF is a black penguin on white with a blue greeting platform and
 * caption text. We key the white plate, drop the platform + captions, remap
 * body greys onto the dance cyan so colourways recolour, and pack into the
 * shared 220×214 classic cell.
 *
 * Output:
 *   public/assets/player/penguin/wave/f00.png … f15.png
 *   public/assets/player/penguin/wave-sheet.png   (16-wide row)
 *
 *   npm run sprite:penguin-wave
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { contentBounds, getPx, setPx } from './lib/pose-animate.mjs';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');
const omggif = require('omggif');

/** Must match classic idle / dance / walk cell. */
export const WAVE_CELL_W = 220;
export const WAVE_CELL_H = 214;
/** Tenor wave GIF frame count. */
export const WAVE_FRAME_COUNT = 16;
/**
 * Source delays are 7–8 cs (~70–80 ms). Use 75 ms for a steady one-shot.
 * Must match WAVE_FRAME_MS in multiplayerPresentation.ts.
 */
export const WAVE_FRAME_MS = 75;

const DANCE_BODY: [number, number, number] = [0, 153, 206];
const DANCE_SHADE: [number, number, number] = [1, 78, 107];
const DANCE_HI: [number, number, number] = [20, 160, 209];

const ROOT = path.resolve('scripts/reference/penguin/cp-wave-gif');
const GIF = path.join(ROOT, 'penguin-wave.gif');
const FRAME_DIR = path.join(ROOT, 'frames');
const OUT = path.resolve('public/assets/player/penguin');
const WAVE_OUT = path.join(OUT, 'wave');
const SHEET_OUT = path.join(OUT, 'wave-sheet.png');

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

/** Flood-key near-white exterior. */
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

/** Blue greeting ring under the feet. */
function isPlatformBlue(c: number[]) {
  // ~#4098f0 style cyan-blue ring
  return c[2]! > 160 && c[1]! > 100 && c[0]! < 120 && c[2]! > c[0]! + 40;
}

/** Grey disc inside the ring (and soft AA). */
function isPlatformGrey(c: number[]) {
  const max = Math.max(c[0]!, c[1]!, c[2]!);
  const min = Math.min(c[0]!, c[1]!, c[2]!);
  const sat = max - min;
  const lum = (c[0]! + c[1]! + c[2]!) / 3;
  return sat < 30 && lum > 140 && lum < 240;
}

/**
 * Drop caption glyphs + greeting platform so contentBounds is the penguin only.
 * Text sits in the top/bottom margins; the platform is a blue ring + grey disc.
 */
function removeCaptionsAndPlatform(src: InstanceType<typeof PNG>) {
  const out = clone(src);
  const w = src.width;
  const h = src.height;
  // Aggressive band wipe for captions (including soft AA fringes).
  const topBand = Math.floor(h * 0.18);
  const bottomBand = Math.floor(h * 0.82);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = getPx(src, x, y);
      if (c[3]! < 20) continue;
      if (isPlatformBlue(c) || isPlatformGrey(c)) {
        setPx(out, x, y, [0, 0, 0, 0]);
        continue;
      }
      if (y < topBand || y > bottomBand) {
        // Anything in the caption bands that isn't saturated orange/blue body
        // is caption residue (dark glyphs + light AA).
        const max = Math.max(c[0]!, c[1]!, c[2]!);
        const min = Math.min(c[0]!, c[1]!, c[2]!);
        const sat = max - min;
        if (sat < 55) setPx(out, x, y, [0, 0, 0, 0]);
      }
    }
  }
  // Second pass: exterior flood of leftover greys/blues (platform AA, caption AA)
  // so isolated rings under the feet do not survive into the fit bounds.
  const exterior = new Uint8Array(w * h);
  const queue: [number, number][] = [];
  const isRemovable = (c: number[]) => {
    if (c[3]! < 20) return true;
    if (isPlatformBlue(c)) return true;
    const max = Math.max(c[0]!, c[1]!, c[2]!);
    const min = Math.min(c[0]!, c[1]!, c[2]!);
    const sat = max - min;
    const lum = (c[0]! + c[1]! + c[2]!) / 3;
    // Platform greys only — never the white belly (lum ≳ 235) or dark body.
    if (sat < 35 && lum > 130 && lum < 230) return true;
    return false;
  };
  const enq = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = y * w + x;
    if (exterior[i]) return;
    if (!isRemovable(getPx(out, x, y))) return;
    exterior[i] = 1;
    queue.push([x, y]);
  };
  for (let x = 0; x < w; x++) {
    enq(x, 0);
    enq(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    enq(0, y);
    enq(w - 1, y);
  }
  for (let head = 0; head < queue.length; head++) {
    const [x, y] = queue[head]!;
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

/** Black/grey penguin body → dance cyan so game recolour works. */
function remapBlackBodyToDance(src: InstanceType<typeof PNG>) {
  const out = clone(src);
  for (let i = 0; i < out.data.length; i += 4) {
    const r = out.data[i]!;
    const g = out.data[i + 1]!;
    const b = out.data[i + 2]!;
    const a = out.data[i + 3]!;
    if (a < 20) continue;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const sat = max - min;
    const lum = (r + g + b) / 3;
    // Orange beak / feet
    if (r > 160 && g > 70 && g < 210 && b < 120 && r > b + 40) continue;
    // White / light grey belly
    if (sat < 30 && lum > 170) continue;
    // Soft belly grey shadow under chin
    if (sat < 30 && lum > 110 && lum <= 170) continue;
    // Dark grey / black body + flippers
    if (sat < 45 && lum < 110) {
      let dest = DANCE_BODY;
      if (lum > 70) dest = DANCE_HI;
      else if (lum < 35) dest = DANCE_SHADE;
      out.data[i] = dest[0];
      out.data[i + 1] = dest[1];
      out.data[i + 2] = dest[2];
    }
  }
  return out;
}

function sampleBilinear(
  src: InstanceType<typeof PNG>,
  fx: number,
  fy: number,
): [number, number, number, number] {
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

function fitBottomCenter(src: InstanceType<typeof PNG>, fillRatio = 0.9) {
  const b = contentBounds(src);
  const cw = b.x1 - b.x0 + 1;
  const ch = b.y1 - b.y0 + 1;
  const scale = Math.min((WAVE_CELL_W * fillRatio) / cw, (WAVE_CELL_H * fillRatio) / ch);
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
  const out = blank(WAVE_CELL_W, WAVE_CELL_H);
  const ox = Math.floor((WAVE_CELL_W - nw) / 2);
  const oy = WAVE_CELL_H - nh - 2;
  for (let y = 0; y < nh; y++) {
    for (let x = 0; x < nw; x++) {
      const c = getPx(scaled, x, y);
      if (c[3]! >= 20) setPx(out, ox + x, oy + y, c);
    }
  }
  // Drop residual platform-ring AA (thin white arcs under the feet).
  return stripExteriorLightFringe(out);
}

/**
 * Exterior flood of near-white / light-grey fringe left by the greeting
 * platform. Stops at saturated body colour so the white belly stays intact
 * (belly is enclosed, not exterior-connected once the ring is gone).
 */
function stripExteriorLightFringe(src: InstanceType<typeof PNG>) {
  const w = src.width;
  const h = src.height;
  const isFringe = (c: number[]) => {
    if (c[3]! < 20) return true;
    const max = Math.max(c[0]!, c[1]!, c[2]!);
    const min = Math.min(c[0]!, c[1]!, c[2]!);
    const sat = max - min;
    const lum = (c[0]! + c[1]! + c[2]!) / 3;
    // Near-white platform AA only — not white belly (enclosed) or orange feet.
    return sat < 25 && lum > 200;
  };
  const exterior = new Uint8Array(w * h);
  const queue: [number, number][] = [];
  const enq = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = y * w + x;
    if (exterior[i]) return;
    if (!isFringe(getPx(src, x, y))) return;
    exterior[i] = 1;
    queue.push([x, y]);
  };
  for (let x = 0; x < w; x++) {
    enq(x, 0);
    enq(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    enq(0, y);
    enq(w - 1, y);
  }
  for (let head = 0; head < queue.length; head++) {
    const [x, y] = queue[head]!;
    enq(x + 1, y);
    enq(x - 1, y);
    enq(x, y + 1);
    enq(x, y - 1);
  }
  const out = clone(src);
  for (let i = 0; i < w * h; i++) {
    if (!exterior[i]) continue;
    // Only clear fringe that is actually opaque (keep true transparent).
    if (out.data[i * 4 + 3]! < 20) continue;
    out.data.fill(0, i * 4, i * 4 + 4);
  }
  return out;
}

function processFrame(raw: InstanceType<typeof PNG>) {
  let img = keyWhiteBg(raw);
  img = removeCaptionsAndPlatform(img);
  img = remapBlackBodyToDance(img);
  return fitBottomCenter(img, 0.88);
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

const existing = fs.existsSync(FRAME_DIR)
  ? fs.readdirSync(FRAME_DIR).filter((f) => /^f\d{2}\.png$/.test(f)).length
  : 0;
if (existing < WAVE_FRAME_COUNT) extractGifFrames();
else console.log(`using ${existing} existing frames in ${path.relative(process.cwd(), FRAME_DIR)}`);

fs.mkdirSync(WAVE_OUT, { recursive: true });
// Drop legacy 3-frame Imagine/procedural plates so Boot never loads stale art.
for (const n of [1, 2, 3]) {
  const legacy = path.join(OUT, `wave-${n}.png`);
  if (fs.existsSync(legacy)) fs.unlinkSync(legacy);
}

const plates: InstanceType<typeof PNG>[] = [];
const count = Math.min(
  WAVE_FRAME_COUNT,
  fs.readdirSync(FRAME_DIR).filter((f) => /^f\d{2}\.png$/.test(f)).length,
);
for (let i = 0; i < count; i++) {
  const srcPath = path.join(FRAME_DIR, `f${String(i).padStart(2, '0')}.png`);
  const plate = processFrame(PNG.sync.read(fs.readFileSync(srcPath)));
  plates.push(plate);
  const name = `f${String(i).padStart(2, '0')}.png`;
  fs.writeFileSync(path.join(WAVE_OUT, name), PNG.sync.write(plate));
  const b = contentBounds(plate);
  console.log(`  wave ${name} body ${b.x1 - b.x0 + 1}×${b.y1 - b.y0 + 1} feetY=${b.y1}`);
}

const sheet = blank(WAVE_CELL_W * count, WAVE_CELL_H);
for (let i = 0; i < plates.length; i++) {
  const p = plates[i]!;
  for (let y = 0; y < WAVE_CELL_H; y++) {
    for (let x = 0; x < WAVE_CELL_W; x++) {
      const c = getPx(p, x, y);
      if (c[3]! >= 20) setPx(sheet, i * WAVE_CELL_W + x, y, c);
    }
  }
}
fs.writeFileSync(SHEET_OUT, PNG.sync.write(sheet));
console.log(
  `wave plates ready: ${count} × ${WAVE_CELL_W}×${WAVE_CELL_H}, sheet ${sheet.width}×${sheet.height}`,
);
console.log(`  individuals → ${path.relative(process.cwd(), WAVE_OUT)}`);
console.log(`  sheet       → ${path.relative(process.cwd(), SHEET_OUT)}`);
