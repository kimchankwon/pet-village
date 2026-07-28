/**
 * Build the penguin's wave plates at plate resolution.
 *
 * Prefer Grok Imagine sources when present:
 *   scripts/reference/penguin/imagine-wave/wave-{1,2,3}-source.png
 *
 * Imagine sources sit on solid black and the character has a black outline, so
 * we key the exterior aggressively (outline may go with the bg), then restore a
 * one-pixel outline via `repairExternalOutline`. Scale is driven by **body
 * width** (max opaque row span), not total content height, so a raised flipper
 * above the head does not shrink the torso.
 *
 * Fallback: procedural `raiseFlipper` on `down-0.png` (unit-tested).
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
import { contentBounds, getPx, setPx } from './lib/pose-animate.mjs';
import { repairExternalOutline } from './lib/pixel-outline.mjs';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');

const DIR = path.resolve('public/assets/player/penguin');
const REF = path.resolve('scripts/reference/penguin/imagine-wave');
const IDLE = path.join(DIR, 'down-0.png');
const TARGET_W = 477;
const TARGET_H = 513;
const OUTLINE: [number, number, number, number] = [0, 0, 0, 255];

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

/**
 * Flood-key near-black exterior as transparent.
 * Outline blacks contiguous with the plate will be removed; call
 * `repairExternalOutline` afterward to redraw a clean 1px rim.
 */
function keyBlackBg(src: InstanceType<typeof PNG>) {
  const out = blank(src.width, src.height);
  const isBg = (c: number[]) => {
    if (c[3]! < 20) return true;
    const lum = (c[0]! + c[1]! + c[2]!) / 3;
    // Solid black plate (and near-black AA fringe of the plate, not body blues).
    if (lum < 28 && Math.max(c[0]!, c[1]!, c[2]!) < 40) return true;
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

/** Max opaque span across any row — stable body-width measure. */
function maxRowWidth(png: InstanceType<typeof PNG>) {
  const b = contentBounds(png);
  let maxW = 0;
  for (let y = b.y0; y <= b.y1; y++) {
    let x0 = png.width;
    let x1 = 0;
    for (let x = b.x0; x <= b.x1; x++) {
      if (getPx(png, x, y)[3]! < 20) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
    }
    if (x1 >= x0) maxW = Math.max(maxW, x1 - x0 + 1);
  }
  return maxW;
}

/** Horizontal center of the widest opaque row — stable body/torso anchor. */
function bodyCenterX(png: InstanceType<typeof PNG>) {
  const b = contentBounds(png);
  let bestW = -1;
  let cx = (b.x0 + b.x1) / 2;
  for (let y = b.y0; y <= b.y1; y++) {
    let x0 = png.width;
    let x1 = 0;
    for (let x = b.x0; x <= b.x1; x++) {
      if (getPx(png, x, y)[3]! < 20) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
    }
    if (x1 >= x0) {
      const w = x1 - x0 + 1;
      if (w > bestW) {
        bestW = w;
        cx = (x0 + x1) / 2;
      }
    }
  }
  return cx;
}

/**
 * Fit Imagine source onto the shared 477×513 canvas.
 * Scale from max body width so the torso matches idle; raised flipper may
 * extend above the idle head line and clip at the plate top rather than
 * shrinking the body.
 */
function imagineToPlate(
  raw: InstanceType<typeof PNG>,
  idleBottom: number,
  idleBodyW: number,
  idleBodyCx: number,
): InstanceType<typeof PNG> {
  // 1) Aggressive key — silhouette outline may be eaten with the solid black plate.
  const keyed = keyBlackBg(raw);
  // 2) Redraw a clean 1px exterior outline; keep enclosed blacks (eyes, beak).
  const cleaned = asPng(repairExternalOutline(keyed, { outline: OUTLINE }));

  // 3) Scale so max body width matches idle (not total height with raised flipper).
  // Never shrink for height: a tall wave pose clips at the plate top instead.
  const full = contentBounds(cleaned);
  const cw = full.x1 - full.x0 + 1;
  const ch = full.y1 - full.y0 + 1;
  const bodyW = maxRowWidth(cleaned);
  const scale = idleBodyW / Math.max(1, bodyW);

  const nw = Math.max(8, Math.round(cw * scale));
  const nh = Math.max(10, Math.round(ch * scale));
  const sized = blank(nw, nh);
  for (let y = 0; y < nh; y++) {
    for (let x = 0; x < nw; x++) {
      const sx = full.x0 + Math.min(cw - 1, Math.floor((x / nw) * cw));
      const sy = full.y0 + Math.min(ch - 1, Math.floor((y / nh) * ch));
      const c = getPx(cleaned, sx, sy);
      if (c[3]! >= 20) setPx(sized, x, y, [c[0]!, c[1]!, c[2]!, 255]);
    }
  }

  // 4) Bottom-align feet with idle feet line; anchor X on body center (not
  // full content bbox, which is biased by a raised flipper).
  const sizedB = contentBounds(sized);
  const contentH = sizedB.y1 - sizedB.y0 + 1;
  const bodyCx = bodyCenterX(sized);
  const plate = blank(TARGET_W, TARGET_H);
  const ox = Math.round(idleBodyCx - bodyCx);
  // Feet on idle bottom; flipper may extend above y=0 and be clipped by setPx.
  const oy = idleBottom - contentH + 1 - sizedB.y0;
  let wrote = 0;
  let clipped = 0;
  for (let y = sizedB.y0; y <= sizedB.y1; y++) {
    for (let x = sizedB.x0; x <= sizedB.x1; x++) {
      const c = getPx(sized, x, y);
      if (c[3]! < 20) continue;
      const dx = ox + x;
      const dy = oy + y;
      if (dx < 0 || dy < 0 || dx >= TARGET_W || dy >= TARGET_H) {
        clipped++;
        continue;
      }
      setPx(plate, dx, dy, [c[0]!, c[1]!, c[2]!, 255]);
      wrote++;
    }
  }
  if (wrote === 0) {
    console.error('imagineToPlate: fitted content missed the canvas entirely');
    process.exit(1);
  }
  if (clipped > 0) {
    console.log(`  (clipped ${clipped}px above/beside plate — body size preserved)`);
  }
  // Final outline pass (nearest-neighbour can nibble the rim; clipping may open edges).
  return asPng(repairExternalOutline(plate, { outline: OUTLINE }));
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
  const idleBodyW = maxRowWidth(idle);
  const idleBodyCx = bodyCenterX(idle);
  console.log(
    `Imagine wave plates → idle bodyW=${idleBodyW} bodyCx=${idleBodyCx.toFixed(1)} ` +
      `feet y=${idleB.y1}, canvas ${TARGET_W}×${TARGET_H} (width-lock + re-outline)`,
  );
  for (const frame of [1, 2, 3] as const) {
    const srcPath = path.join(REF, `wave-${frame}-source.png`);
    const raw = PNG.sync.read(fs.readFileSync(srcPath));
    const plate = imagineToPlate(raw, idleB.y1, idleBodyW, idleBodyCx);
    const out = path.join(DIR, `wave-${frame}.png`);
    fs.writeFileSync(out, PNG.sync.write(plate));
    const b = contentBounds(plate);
    const bodyW = maxRowWidth(plate);
    // black % of opaque
    let black = 0;
    let opaque = 0;
    for (let i = 0; i < plate.data.length; i += 4) {
      if (plate.data[i + 3]! < 20) continue;
      opaque++;
      if ((plate.data[i]! + plate.data[i + 1]! + plate.data[i + 2]!) / 3 < 40) black++;
    }
    console.log(
      `wrote ${path.relative(process.cwd(), out)} ` +
        `bodyW=${bodyW} full ${b.x1 - b.x0 + 1}×${b.y1 - b.y0 + 1} ` +
        `feetY=${b.y1} black=${opaque ? ((100 * black) / opaque).toFixed(1) : 0}%`,
    );
  }
}

if (hasImagineSources()) {
  writeImagine();
} else {
  console.log('no Imagine sources under scripts/reference/penguin/imagine-wave/ — using procedural');
  writeProcedural();
}
