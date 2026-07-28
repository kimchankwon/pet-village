/**
 * Build the penguin's wave plates at plate resolution.
 *
 * Prefer Grok Imagine sources when present:
 *   scripts/reference/penguin/imagine-wave/wave-{1,2,3}-source.png
 *
 * Those are authored with Imagine from the front idle plate so the raised
 * flipper stays attached and matches Club Penguin proportions. Fallback is the
 * older procedural raiseFlipper path on `down-0.png` (kept for tests / offline).
 *
 * Output: public/assets/player/penguin/wave-{1,2,3}.png
 * Frame 0 of the wave animation is still the idle plate itself.
 *
 *   npm run sprite:penguin-wave
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { findFlipperBand, raiseFlipper, WAVE_ANGLES } from './lib/penguin-wave.mjs';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');

const DIR = path.resolve('public/assets/player/penguin');
const REF = path.resolve('scripts/reference/penguin/imagine-wave');
const IDLE = path.join(DIR, 'down-0.png');
const TARGET_W = 477;
const TARGET_H = 513;

function blank(w: number, h: number) {
  const p = new PNG({ width: w, height: h });
  p.data.fill(0);
  return p;
}

function get(png: InstanceType<typeof PNG>, x: number, y: number): [number, number, number, number] {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) return [0, 0, 0, 0];
  const i = (png.width * y + x) << 2;
  return [png.data[i]!, png.data[i + 1]!, png.data[i + 2]!, png.data[i + 3]!];
}

function set(
  png: InstanceType<typeof PNG>,
  x: number,
  y: number,
  c: [number, number, number, number],
) {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) return;
  const i = (png.width * y + x) << 2;
  png.data[i] = c[0];
  png.data[i + 1] = c[1];
  png.data[i + 2] = c[2];
  png.data[i + 3] = c[3];
}

function contentBounds(png: InstanceType<typeof PNG>) {
  let x0 = png.width;
  let y0 = png.height;
  let x1 = 0;
  let y1 = 0;
  let n = 0;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      if (get(png, x, y)[3] < 20) continue;
      n++;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
  }
  if (!n) throw new Error('empty plate content');
  return { x0, y0, x1, y1 };
}

/** Key exterior near-black as transparent; keep character outline blacks. */
function keyBlackBg(src: InstanceType<typeof PNG>) {
  const out = blank(src.width, src.height);
  const corners = [
    get(src, 2, 2),
    get(src, src.width - 3, 2),
    get(src, 2, src.height - 3),
    get(src, src.width - 3, src.height - 3),
  ];
  const isBg = (c: [number, number, number, number]) => {
    if (c[3] < 20) return true;
    const lum = (c[0] + c[1] + c[2]) / 3;
    if (lum < 28 && Math.max(c[0], c[1], c[2]) < 40) return true;
    for (const bg of corners) {
      if (Math.hypot(c[0] - bg[0], c[1] - bg[1], c[2] - bg[2]) < 22) return true;
    }
    return false;
  };
  const exterior = new Uint8Array(src.width * src.height);
  const queue: [number, number][] = [];
  const enq = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= src.width || y >= src.height) return;
    const i = y * src.width + x;
    if (exterior[i]) return;
    if (!isBg(get(src, x, y))) return;
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
      const c = get(src, x, y);
      if (c[3] < 20) continue;
      set(out, x, y, [c[0], c[1], c[2], 255]);
    }
  }
  return out;
}

/** Fit Imagine source onto the shared 477×513 canvas, matching idle content height. */
function imagineToPlate(
  raw: InstanceType<typeof PNG>,
  idleBottom: number,
  idleH: number,
): InstanceType<typeof PNG> {
  const keyed = keyBlackBg(raw);
  const b = contentBounds(keyed);
  const cw = b.x1 - b.x0 + 1;
  const ch = b.y1 - b.y0 + 1;
  const scale = idleH / ch;
  const nw = Math.max(8, Math.round(cw * scale));
  const nh = idleH;
  const sized = blank(nw, nh);
  for (let y = 0; y < nh; y++) {
    for (let x = 0; x < nw; x++) {
      const sx = b.x0 + Math.min(cw - 1, Math.floor((x / nw) * cw));
      const sy = b.y0 + Math.min(ch - 1, Math.floor((y / nh) * ch));
      const c = get(keyed, sx, sy);
      if (c[3] >= 20) set(sized, x, y, [c[0], c[1], c[2], 255]);
    }
  }
  const plate = blank(TARGET_W, TARGET_H);
  const ox = Math.floor((TARGET_W - nw) / 2);
  const oy = idleBottom - nh + 1;
  for (let y = 0; y < nh; y++) {
    for (let x = 0; x < nw; x++) {
      const c = get(sized, x, y);
      if (c[3] >= 20) set(plate, ox + x, oy + y, c);
    }
  }
  return plate;
}

function hasImagineSources() {
  return [1, 2, 3].every((n) => fs.existsSync(path.join(REF, `wave-${n}-source.png`)));
}

function writeProcedural() {
  if (!fs.existsSync(IDLE)) {
    console.error(`missing ${IDLE} — run the Imagine plate pipeline first`);
    process.exit(1);
  }
  const idle = PNG.sync.read(fs.readFileSync(IDLE));
  const band = findFlipperBand(idle);
  if (!band) {
    console.error('could not locate the flipper band in down-0.png');
    process.exit(1);
  }
  console.log(
    `procedural fallback: flipper rows ${band.rows[0]!.y}..${band.rows[band.rows.length - 1]!.y}`,
    `shoulder (${band.pivot.x},${band.pivot.y})`,
    `${band.pixels.length}px`,
  );
  WAVE_ANGLES.forEach((angle, index) => {
    const raised = raiseFlipper(idle, band, angle);
    const png = new PNG({ width: raised.width, height: raised.height });
    Buffer.from(raised.data).copy(png.data);
    const out = path.join(DIR, `wave-${index + 1}.png`);
    fs.writeFileSync(out, PNG.sync.write(png));
    console.log(`wrote ${path.relative(process.cwd(), out)} (${angle}° procedural)`);
  });
}

function writeImagine() {
  if (!fs.existsSync(IDLE)) {
    console.error(`missing ${IDLE}`);
    process.exit(1);
  }
  const idle = PNG.sync.read(fs.readFileSync(IDLE));
  const idleB = contentBounds(idle);
  const idleH = idleB.y1 - idleB.y0 + 1;
  console.log(`Imagine wave plates → match idle content H=${idleH}, canvas ${TARGET_W}×${TARGET_H}`);
  for (const frame of [1, 2, 3] as const) {
    const srcPath = path.join(REF, `wave-${frame}-source.png`);
    const raw = PNG.sync.read(fs.readFileSync(srcPath));
    const plate = imagineToPlate(raw, idleB.y1, idleH);
    const out = path.join(DIR, `wave-${frame}.png`);
    fs.writeFileSync(out, PNG.sync.write(plate));
    console.log(`wrote ${path.relative(process.cwd(), out)} (Imagine)`);
  }
}

if (hasImagineSources()) {
  writeImagine();
} else {
  console.log('no Imagine sources under scripts/reference/penguin/imagine-wave/ — using procedural');
  writeProcedural();
}
