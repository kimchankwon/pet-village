/**
 * Kirby pet frames — KSSU-style 32×32, colour-calibrated from reference.
 *
 * Hands are stubby nubs that share the body fill — NO internal outline
 * between arm and torso (classic Kirby silhouette). Outline is painted
 * once around the combined pink shape.
 *
 * Poses: neutral1, neutral2, walk1, walk2, sad, happy, sleep, jump.
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');

const ROOT = path.resolve('public/assets/pet/kirby');
type RGBA = [number, number, number, number];
type Pose = 'neutral1' | 'neutral2' | 'walk1' | 'walk2' | 'sad' | 'happy' | 'sleep' | 'jump';
const POSES: Pose[] = ['neutral1', 'neutral2', 'walk1', 'walk2', 'sad', 'happy', 'sleep', 'jump'];

const OUT: RGBA = [34, 20, 34, 255];
const PINK: RGBA = [244, 160, 238, 255];
const SHADE: RGBA = [234, 112, 224, 255];
const DEEP: RGBA = [210, 66, 196, 255];
const BLUSH: RGBA = [196, 20, 178, 255];
const RED: RGBA = [206, 8, 34, 255];
const RED_D: RGBA = [148, 0, 22, 255];
const WHITE: RGBA = [255, 255, 255, 255];
const MOUTH: RGBA = [92, 18, 52, 255];

function blank() {
  const png = new PNG({ width: 32, height: 32 });
  png.data.fill(0);
  return png;
}

function getA(png: InstanceType<typeof PNG>, x: number, y: number) {
  if (x < 0 || y < 0 || x >= 32 || y >= 32) return 0;
  return png.data[((32 * y + x) << 2) + 3];
}

function set(png: InstanceType<typeof PNG>, x: number, y: number, c: RGBA) {
  x = Math.round(x);
  y = Math.round(y);
  if (x < 0 || y < 0 || x >= 32 || y >= 32) return;
  const i = (32 * y + x) << 2;
  png.data[i] = c[0];
  png.data[i + 1] = c[1];
  png.data[i + 2] = c[2];
  png.data[i + 3] = c[3];
}

function fill(png: InstanceType<typeof PNG>, x0: number, y0: number, x1: number, y1: number, c: RGBA) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(png, x, y, c);
}

/** Filled ellipse only — no outline (used for body + seamless hands). */
function ellipseFill(png: InstanceType<typeof PNG>, cx: number, cy: number, rx: number, ry: number, c: RGBA) {
  for (let y = -ry; y <= ry; y++) {
    for (let x = -rx; x <= rx; x++) {
      if (Math.hypot(x / rx, y / ry) <= 1) set(png, cx + x, cy + y, c);
    }
  }
}

function ellipseOutlined(
  png: InstanceType<typeof PNG>,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  c: RGBA,
  outline: RGBA,
) {
  for (let y = -ry - 1; y <= ry + 1; y++) {
    for (let x = -rx - 1; x <= rx + 1; x++) {
      const d = Math.hypot(x / rx, y / ry);
      if (d <= 1 - 0.08) set(png, cx + x, cy + y, c);
      else if (d <= 1 + 0.07) set(png, cx + x, cy + y, outline);
    }
  }
}

/** Paint outline on empty neighbours of any filled pixel (outer silhouette only). */
function outlineSilhouette(png: InstanceType<typeof PNG>) {
  const add: [number, number][] = [];
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      if (!getA(png, x, y)) continue;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        if (!getA(png, x + dx, y + dy)) add.push([x + dx, y + dy]);
      }
    }
  }
  for (const [x, y] of add) set(png, x, y, OUT);
}

/**
 * Classic Kirby hand nub — pink fill continuous with the body.
 * Bridge pixels toward the torso so silhouette outline never paints a seam.
 * `raised` lifts arms for happy/jump (10 & 2 o'clock).
 */
function handNub(png: InstanceType<typeof PNG>, side: -1 | 1, cx: number, cy: number, raised: boolean) {
  if (raised) {
    // Raised stub — sit on the shoulder curve, not floating away
    const ax = cx + side * 8;
    const ay = cy - 5;
    ellipseFill(png, ax, ay, 2.4, 2.8, PINK);
    // Flat 2–3px crown (KSSU reference)
    fill(png, ax - 1, ay - 3, ax + 1, ay - 2, PINK);
    // Solid bridge into the body (kills the inner outline seam)
    fill(png, cx + side * 5, ay, cx + side * 8, ay + 3, PINK);
    fill(png, cx + side * 6, ay - 2, cx + side * 7, ay + 1, PINK);
  } else {
    // Mid-body stub — rounded protrusion, one silhouette with torso
    const ax = cx + side * 10;
    const ay = cy + 1;
    ellipseFill(png, ax, ay, 2.5, 2.8, PINK);
    // Bridge toward body so the join is solid pink (no gap for outline)
    fill(png, cx + side * 6, ay - 1, cx + side * 9, ay + 2, PINK);
    set(png, cx + side * 9, ay - 2, PINK);
    set(png, cx + side * 9, ay + 3, PINK);
  }
}

function save(png: InstanceType<typeof PNG>, file: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, PNG.sync.write(png));
}

function drawKirby(pose: Pose) {
  const png = blank();
  const dy = pose === 'jump' ? -3 : pose === 'neutral2' || pose === 'walk2' ? 1 : 0;
  const stride = pose === 'walk1' ? 2 : pose === 'walk2' ? -2 : 0;
  const cx = 16;
  const cy = 16 + dy;
  const raised = pose === 'happy' || pose === 'jump';

  // Feet first (own outline — they sit under the body)
  const spread = pose === 'jump' ? 4 : 6;
  ellipseOutlined(png, cx - spread + stride, 26 + dy, 4, 2.6, RED, OUT);
  ellipseOutlined(png, cx + spread - stride, 26 + dy, 4, 2.6, RED, OUT);
  fill(png, cx - spread + stride - 2, 27 + dy, cx - spread + stride + 2, 27 + dy, RED_D);
  fill(png, cx + spread - stride - 2, 27 + dy, cx + spread - stride + 2, 27 + dy, RED_D);

  // Body + hands as ONE pink fill (no outlines yet)
  ellipseFill(png, cx, cy, 9.5, 9, PINK);
  handNub(png, -1, cx, cy, raised);
  handNub(png, 1, cx, cy, raised);

  // Soft shading crescent (low on the body) — keep hands readable
  for (let y = -9; y <= 9; y++) {
    for (let x = -10; x <= 10; x++) {
      const d = Math.hypot(x / 9.5, y / 9);
      if (d > 1) continue;
      // Don't recolour the outer hand nubs
      if (Math.abs(x) >= 9 && Math.abs(y) < 5) continue;
      if (d > 0.68 && d <= 0.92 && y > 2) set(png, cx + x, cy + y, x < -2 ? DEEP : SHADE);
      else if (d > 0.92 && y > 0) set(png, cx + x, cy + y, DEEP);
    }
  }

  // Outer silhouette outline only — hands stay seamless with the torso
  outlineSilhouette(png);

  // White shine, upper left
  fill(png, cx - 5, cy - 7, cx - 4, cy - 6, WHITE);
  set(png, cx - 6, cy - 6, WHITE);

  // Eyes
  const eyeTop = cy - 5;
  if (pose === 'sleep') {
    for (const s of [-1, 1] as const) {
      set(png, cx + s * 4, eyeTop + 4, OUT);
      set(png, cx + s * 3, eyeTop + 5, OUT);
      set(png, cx + s * 2, eyeTop + 5, OUT);
    }
  } else if (pose === 'happy') {
    for (const s of [-1, 1] as const) {
      set(png, cx + s * 2, eyeTop + 3, OUT);
      set(png, cx + s * 3, eyeTop + 2, OUT);
      set(png, cx + s * 4, eyeTop + 3, OUT);
    }
  } else if (pose === 'sad') {
    for (const s of [-1, 1] as const) {
      fill(png, cx + s * 3 - 1 + (s > 0 ? 1 : 0), eyeTop + 3, cx + s * 3 + (s > 0 ? 1 : 0), eyeTop + 5, OUT);
      set(png, cx + s * 4, eyeTop + 2, OUT);
    }
  } else {
    for (const s of [-1, 1] as const) {
      const ex = cx + s * 3 + (s > 0 ? 1 : 0);
      fill(png, ex - 1, eyeTop, ex, eyeTop + 5, OUT);
      fill(png, ex - 1, eyeTop + 1, ex, eyeTop + 2, WHITE);
    }
  }

  // Magenta blush dashes
  fill(png, cx - 8, cy + 2, cx - 6, cy + 2, BLUSH);
  fill(png, cx + 6, cy + 2, cx + 8, cy + 2, BLUSH);

  // Mouth
  if (pose === 'happy') {
    fill(png, cx - 1, cy + 3, cx + 1, cy + 4, MOUTH);
    set(png, cx - 2, cy + 3, OUT);
    set(png, cx + 2, cy + 3, OUT);
  } else if (pose === 'sad') {
    set(png, cx - 1, cy + 5, OUT);
    set(png, cx, cy + 4, OUT);
    set(png, cx + 1, cy + 5, OUT);
  } else if (pose !== 'sleep') {
    set(png, cx, cy + 4, MOUTH);
  }

  return png;
}

for (const pose of POSES) {
  save(drawKirby(pose), path.join(ROOT, `${pose}.png`));
}
console.log('Wrote Kirby pet frames (seamless hand outline)');
