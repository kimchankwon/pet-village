/**
 * Build Club Penguin dance plates + grid spritesheet from the reference GIF.
 *
 * Source (Tenor classic dance, 76 unique frames @ ~10 fps):
 *   scripts/reference/penguin/cp-dance-gif/penguin-dance.gif
 *   scripts/reference/penguin/cp-dance-gif/frames/f000.png … f075.png
 *
 * The GIF is the real 76-frame Club Penguin emote medley (idle wind-up, spin,
 * arms-overhead dance, waves, tumble). We key the white plate, keep native
 * 220×214 registration so the loop lands cleanly, and pack a multi-row sheet
 * so WebGL texture size stays well under MAX_TEXTURE_SIZE.
 *
 * Output:
 *   public/assets/player/penguin/dance/f00.png … f75.png  (individual frames)
 *   public/assets/player/penguin/dance-sheet.png          (10×8 grid, 76 cells)
 *
 *   npm run sprite:penguin-dance
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { contentBounds, getPx, setPx } from './lib/pose-animate.mjs';
import { repairExternalOutline } from './lib/pixel-outline.mjs';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');
const omggif = require('omggif');

const ROOT = path.resolve('scripts/reference/penguin/cp-dance-gif');
const GIF = path.join(ROOT, 'penguin-dance.gif');
const FRAME_DIR = path.join(ROOT, 'frames');
const OUT_DIR = path.resolve('public/assets/player/penguin/dance');
const SHEET_OUT = path.resolve('public/assets/player/penguin/dance-sheet.png');
const OUTLINE: [number, number, number, number] = [0, 0, 0, 255];

/** Must match DANCE_FRAME_COUNT in multiplayerPresentation.ts */
export const DANCE_FRAME_COUNT = 76;
/** Grid columns for the spritesheet (rows = ceil(count / cols)). */
export const DANCE_SHEET_COLS = 10;
const DANCE_SHEET_ROWS = Math.ceil(DANCE_FRAME_COUNT / DANCE_SHEET_COLS);

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

/** Flood-key near-white exterior (Tenor GIF plate is ~#fefefe). */
function keyWhiteBg(src: InstanceType<typeof PNG>) {
  const out = blank(src.width, src.height);
  const isBg = (c: number[]) => {
    if (c[3]! < 20) return true;
    const min = Math.min(c[0]!, c[1]!, c[2]!);
    const max = Math.max(c[0]!, c[1]!, c[2]!);
    // Near-white plate (and soft AA fringe).
    if (min > 235 && max - min < 18) return true;
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
  // Runtime asks for frames 0..75 unconditionally, so a short GIF is a hard error.
  if (n !== DANCE_FRAME_COUNT) {
    console.error(`GIF has ${n} frames; expected exactly ${DANCE_FRAME_COUNT}`);
    process.exit(1);
  }
  let canvas = new Uint8ClampedArray(w * h * 4);
  let prev: { disposal: number; x: number; y: number; width: number; height: number; backup: Uint8ClampedArray | null } | null =
    null;
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
    fs.writeFileSync(path.join(FRAME_DIR, `f${String(i).padStart(3, '0')}.png`), PNG.sync.write(png));
    prev = { disposal: info.disposal, x: info.x, y: info.y, width: info.width, height: info.height, backup };
  }
  console.log(`extracted ${n} frames ${w}×${h} → ${path.relative(process.cwd(), FRAME_DIR)}`);
  return { w, h, n };
}

function processPlates(frameCount: number) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  // Clear stale plates.
  for (const f of fs.readdirSync(OUT_DIR)) {
    if (f.endsWith('.png')) fs.unlinkSync(path.join(OUT_DIR, f));
  }
  // Also drop the old 4-frame Imagine plates if present.
  for (const n of [1, 2, 3, 4]) {
    const legacy = path.resolve('public/assets/player/penguin', `dance-${n}.png`);
    if (fs.existsSync(legacy)) fs.unlinkSync(legacy);
  }

  let cellW = 0;
  let cellH = 0;
  const plates: InstanceType<typeof PNG>[] = [];
  let minFeetY = Infinity;
  let maxFeetY = -Infinity;

  for (let i = 0; i < frameCount; i++) {
    const srcPath = path.join(FRAME_DIR, `f${String(i).padStart(3, '0')}.png`);
    if (!fs.existsSync(srcPath)) {
      console.error(`missing frame ${srcPath} — re-extract the GIF`);
      process.exit(1);
    }
    const raw = PNG.sync.read(fs.readFileSync(srcPath));
    const keyed = keyWhiteBg(raw);
    // Light outline pass keeps silhouettes crisp against the game snow.
    const cleaned = asPng(repairExternalOutline(keyed, { outline: OUTLINE }));
    cellW = cleaned.width;
    cellH = cleaned.height;
    plates.push(cleaned);
    const b = contentBounds(cleaned);
    if (b.y1 >= b.y0) {
      minFeetY = Math.min(minFeetY, b.y1);
      maxFeetY = Math.max(maxFeetY, b.y1);
    }
    const out = path.join(OUT_DIR, `f${String(i).padStart(2, '0')}.png`);
    fs.writeFileSync(out, PNG.sync.write(cleaned));
  }

  // Multi-row sheet: col-major fill left→right, top→bottom (Phaser default).
  const sheet = blank(cellW * DANCE_SHEET_COLS, cellH * DANCE_SHEET_ROWS);
  for (let i = 0; i < plates.length; i++) {
    const col = i % DANCE_SHEET_COLS;
    const row = Math.floor(i / DANCE_SHEET_COLS);
    const plate = plates[i]!;
    const ox = col * cellW;
    const oy = row * cellH;
    for (let y = 0; y < cellH; y++) {
      for (let x = 0; x < cellW; x++) {
        const c = getPx(plate, x, y);
        if (c[3]! < 20) continue;
        setPx(sheet, ox + x, oy + y, [c[0]!, c[1]!, c[2]!, 255]);
      }
    }
  }
  fs.writeFileSync(SHEET_OUT, PNG.sync.write(sheet));

  // Geometry sanity: feet Y should not drift wildly across upright frames.
  // (Tumbles intentionally sit higher — only log overall range.)
  console.log(
    `wrote ${frameCount} plates ${cellW}×${cellH} + sheet ` +
      `${sheet.width}×${sheet.height} (${DANCE_SHEET_COLS}×${DANCE_SHEET_ROWS}) ` +
      `feetY ${minFeetY}..${maxFeetY}`,
  );
  console.log(`  individuals → ${path.relative(process.cwd(), OUT_DIR)}`);
  console.log(`  sheet       → ${path.relative(process.cwd(), SHEET_OUT)}`);
}

/** Names the frames f000..f075 that are missing from FRAME_DIR. */
function missingFrames(): string[] {
  if (!fs.existsSync(FRAME_DIR)) return [`(no ${path.relative(process.cwd(), FRAME_DIR)})`];
  const have = new Set(fs.readdirSync(FRAME_DIR));
  const gaps: string[] = [];
  for (let i = 0; i < DANCE_FRAME_COUNT; i++) {
    const name = `f${String(i).padStart(3, '0')}.png`;
    if (!have.has(name)) gaps.push(name);
  }
  return gaps;
}

// Prefer pre-extracted frames; re-extract from GIF when any of f000..f075 is missing.
if (missingFrames().length > 0) {
  extractGifFrames();
} else {
  console.log(`using ${DANCE_FRAME_COUNT} existing frames in ${path.relative(process.cwd(), FRAME_DIR)}`);
}
// Never build a short sheet: the game plays frames 0..75 and would draw blanks.
const gaps = missingFrames();
if (gaps.length > 0) {
  console.error(`missing ${gaps.length} dance frame(s): ${gaps.slice(0, 8).join(', ')}`);
  process.exit(1);
}
processPlates(DANCE_FRAME_COUNT);
