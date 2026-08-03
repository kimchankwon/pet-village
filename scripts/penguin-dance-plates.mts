/**
 * Build the penguin's dance plates at plate resolution from Grok Imagine sources.
 *
 * Sources (solid black bg, black outline):
 *   scripts/reference/penguin/imagine-dance/dance-{1,2,3,4}-source.png
 *
 * Classic Club Penguin dance loop (front-facing):
 *   1 = lean left, left flipper high
 *   2 = both flippers up (cheer bounce)
 *   3 = lean right, right flipper high
 *   4 = both flippers out at shoulder height
 *
 * Imagine sources sit on solid black and the character has a black outline, so
 * we key the exterior aggressively (outline may go with the bg), then restore a
 * one-pixel outline via `repairExternalOutline`. Scale is driven by **body
 * width** (max opaque row span), not total content height, so raised flippers
 * above the head do not shrink the torso.
 *
 * Output: public/assets/player/penguin/dance-{1,2,3,4}.png
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

const DIR = path.resolve('public/assets/player/penguin');
const REF = path.resolve('scripts/reference/penguin/imagine-dance');
const IDLE = path.join(DIR, 'down-0.png');
const TARGET_W = 477;
const TARGET_H = 513;
const OUTLINE: [number, number, number, number] = [0, 0, 0, 255];
const DANCE_FRAMES = [1, 2, 3, 4] as const;

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

/**
 * Opaque span of the torso (belly band), not the full silhouette.
 * Dance poses with arms out would otherwise treat wingspan as "body width"
 * and shrink the whole penguin to match idle torso width.
 */
function torsoWidth(png: InstanceType<typeof PNG>) {
  const b = contentBounds(png);
  const h = b.y1 - b.y0 + 1;
  // Belly band: halfway down to ~72% of the content — below flippers, above feet.
  const y0 = b.y0 + Math.floor(h * 0.5);
  const y1 = b.y0 + Math.floor(h * 0.72);
  let maxW = 0;
  for (let y = y0; y <= y1; y++) {
    let x0 = png.width;
    let x1 = 0;
    for (let x = b.x0; x <= b.x1; x++) {
      if (getPx(png, x, y)[3]! < 20) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
    }
    if (x1 >= x0) maxW = Math.max(maxW, x1 - x0 + 1);
  }
  // Fallback if the band was empty (shouldn't happen on a full penguin).
  if (maxW < 8) {
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
  }
  return maxW;
}

/** Full-content max row width — only used for logging. */
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
 * Scale from max body width so the torso matches idle; raised flippers may
 * extend above the idle head line and clip at the plate top rather than
 * shrinking the body.
 */
function imagineToPlate(
  raw: InstanceType<typeof PNG>,
  idleBottom: number,
  idleBodyW: number,
  idleBodyCx: number,
  idleContentH: number,
): InstanceType<typeof PNG> {
  const keyed = keyBlackBg(raw);
  const cleaned = asPng(repairExternalOutline(keyed, { outline: OUTLINE }));

  const full = contentBounds(cleaned);
  const cw = full.x1 - full.x0 + 1;
  const ch = full.y1 - full.y0 + 1;
  const bodyW = torsoWidth(cleaned);
  // Prefer torso-width lock (matches idle body). If a pose came out short in
  // the source (e.g. arms-out crop), boost scale so height stays near idle.
  let scale = idleBodyW / Math.max(1, bodyW);
  if (ch * scale < idleContentH * 0.9) {
    scale = (idleContentH * 0.95) / Math.max(1, ch);
  }

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

  const sizedB = contentBounds(sized);
  const contentH = sizedB.y1 - sizedB.y0 + 1;
  const bodyCx = bodyCenterX(sized);
  const plate = blank(TARGET_W, TARGET_H);
  const ox = Math.round(idleBodyCx - bodyCx);
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
  return asPng(repairExternalOutline(plate, { outline: OUTLINE }));
}

function hasImagineSources() {
  return DANCE_FRAMES.every((n) => fs.existsSync(path.join(REF, `dance-${n}-source.png`)));
}

function writeImagine() {
  if (!fs.existsSync(IDLE)) {
    console.error(`missing ${IDLE}`);
    process.exit(1);
  }
  const idle = PNG.sync.read(fs.readFileSync(IDLE));
  const idleB = contentBounds(idle);
  const idleBodyW = torsoWidth(idle);
  const idleBodyCx = bodyCenterX(idle);
  const idleContentH = idleB.y1 - idleB.y0 + 1;
  console.log(
    `Imagine dance plates → idle bodyW=${idleBodyW} bodyCx=${idleBodyCx.toFixed(1)} ` +
      `contentH=${idleContentH} feet y=${idleB.y1}, canvas ${TARGET_W}×${TARGET_H}`,
  );
  for (const frame of DANCE_FRAMES) {
    const srcPath = path.join(REF, `dance-${frame}-source.png`);
    const raw = PNG.sync.read(fs.readFileSync(srcPath));
    const plate = imagineToPlate(raw, idleB.y1, idleBodyW, idleBodyCx, idleContentH);
    const out = path.join(DIR, `dance-${frame}.png`);
    fs.writeFileSync(out, PNG.sync.write(plate));
    const b = contentBounds(plate);
    const bodyW = torsoWidth(plate);
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

if (!hasImagineSources()) {
  console.error(
    'missing Imagine sources under scripts/reference/penguin/imagine-dance/dance-{1..4}-source.png',
  );
  process.exit(1);
}
writeImagine();
