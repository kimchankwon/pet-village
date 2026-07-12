/**
 * Kirby pet frames — GBA Nightmare-in-Dream-Land walk style.
 *
 * Walk cycle mirrors the classic pink-puffball GIF:
 *  - Round body with soft squash / stretch + bob
 *  - Face (eyes + blush + tiny mouth) slides across the sphere each step
 *  - Red feet stay glued to the belly (elliptical stride, no floating gap)
 *  - Dark rose outline, tall eyes with white glints
 *
 * Poses: neutral1, neutral2, walk1–walk8, sad, happy, sleep, jump.
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');

const ROOT = path.resolve('public/assets/pet/kirby');
const W = 32;
const H = 32;

type RGBA = [number, number, number, number];
type Pose =
  | 'neutral1'
  | 'neutral2'
  | 'walk1'
  | 'walk2'
  | 'walk3'
  | 'walk4'
  | 'walk5'
  | 'walk6'
  | 'walk7'
  | 'walk8'
  | 'sad'
  | 'happy'
  | 'sleep'
  | 'jump';

const POSES: Pose[] = [
  'neutral1',
  'neutral2',
  'walk1',
  'walk2',
  'walk3',
  'walk4',
  'walk5',
  'walk6',
  'walk7',
  'walk8',
  'sad',
  'happy',
  'sleep',
  'jump',
];

// Soft GBA palette (outline is rose, not pure black — matches the GIF)
const OUT: RGBA = [120, 40, 72, 255];
const PINK: RGBA = [252, 176, 196, 255];
const SHADE: RGBA = [236, 132, 156, 255];
const DEEP: RGBA = [212, 96, 124, 255];
const RED: RGBA = [196, 24, 72, 255];
const RED_H: RGBA = [236, 72, 108, 255];
const WHITE: RGBA = [255, 255, 255, 255];
const EYE: RGBA = [24, 24, 40, 255];
const BLUSH: RGBA = [252, 132, 164, 255];
const MOUTH: RGBA = [88, 16, 40, 255];

function blank() {
  const png = new PNG({ width: W, height: H });
  png.data.fill(0);
  return png;
}

function set(png: InstanceType<typeof PNG>, x: number, y: number, c: RGBA) {
  x = Math.round(x);
  y = Math.round(y);
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (W * y + x) << 2;
  png.data[i] = c[0];
  png.data[i + 1] = c[1];
  png.data[i + 2] = c[2];
  png.data[i + 3] = c[3];
}

function getA(png: InstanceType<typeof PNG>, x: number, y: number) {
  if (x < 0 || y < 0 || x >= W || y >= H) return 0;
  return png.data[((W * y + x) << 2) + 3];
}

function fill(
  png: InstanceType<typeof PNG>,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  c: RGBA,
) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(png, x, y, c);
}

function ellipseFill(
  png: InstanceType<typeof PNG>,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  c: RGBA,
) {
  const rxi = Math.ceil(rx);
  const ryi = Math.ceil(ry);
  for (let y = -ryi; y <= ryi; y++) {
    for (let x = -rxi; x <= rxi; x++) {
      if (Math.hypot(x / rx, y / ry) <= 1) set(png, cx + x, cy + y, c);
    }
  }
}

/** Outer silhouette only. */
function outlineSilhouette(png: InstanceType<typeof PNG>) {
  const add: [number, number][] = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
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
 * 8-phase walk matching the GIF:
 *  - Body bobs + squashes
 *  - Face slides across the sphere (sin) — the “features on a ball” look
 *  - Feet ride the belly with a short elliptical stride
 */
function walkParams(phase: number) {
  const t = (phase / 8) * Math.PI * 2;
  const bob = Math.sin(t) * 1.15;
  const squash = Math.sin(t) * 0.55; // + wide/short, − tall
  // Face stays on the leading half (sprite-right) and wobbles ±1–2px —
  // flipX mirrors the whole sprite when walking left.
  const face = 2 + Math.round(Math.sin(t) * 1.5); // ~1..3
  const lean = Math.round(Math.sin(t) * 0.7);
  // Feet: opposite elliptical path under the body
  const stride = Math.cos(t) * 2.4;
  const leftFootX = stride;
  const rightFootX = -stride;
  const leftLift = Math.min(0, Math.sin(t) * 1.8);
  const rightLift = Math.min(0, Math.sin(t + Math.PI) * 1.8);
  // Subtle arm nubs (GIF has soft silhouette wobble, not big pumps)
  const armL = Math.max(0, -Math.sin(t)) * 1.2;
  const armR = Math.max(0, Math.sin(t)) * 1.2;
  return { bob, squash, face, lean, leftFootX, rightFootX, leftLift, rightLift, armL, armR };
}

function walkPhaseOf(pose: Pose): number {
  const m: Partial<Record<Pose, number>> = {
    walk1: 0,
    walk2: 1,
    walk3: 2,
    walk4: 3,
    walk5: 4,
    walk6: 5,
    walk7: 6,
    walk8: 7,
  };
  return m[pose] ?? -1;
}

function handNub(
  png: InstanceType<typeof PNG>,
  side: -1 | 1,
  cx: number,
  cy: number,
  extend: number,
) {
  const ax = cx + side * (7.2 + extend);
  const ay = cy + 0.5;
  ellipseFill(png, ax, ay, 2.3, 2.5, PINK);
  fill(png, cx + side * 4, ay - 1, cx + side * (6.5 + extend), ay + 2, PINK);
  set(png, ax, ay + 2, SHADE);
}

function drawFeet(
  png: InstanceType<typeof PNG>,
  cx: number,
  bodyBottom: number,
  leftX: number,
  rightX: number,
  leftLift: number,
  rightLift: number,
) {
  // Feet parented to belly — lift pulls into the body, never opens a gap.
  const spread = 3.5;
  const lfx = cx - spread + leftX;
  const rfx = cx + spread + rightX;
  const lfy = bodyBottom - 0.4 + leftLift;
  const rfy = bodyBottom - 0.4 + rightLift;
  // Planted foot is flatter; lifted foot is rounder
  const lFlat = leftLift >= -0.2 ? 1.15 : 0.85;
  const rFlat = rightLift >= -0.2 ? 1.15 : 0.85;
  ellipseFill(png, lfx, lfy, 3.4 * lFlat, 2.15 / lFlat, RED);
  ellipseFill(png, rfx, rfy, 3.4 * rFlat, 2.15 / rFlat, RED);
  fill(png, lfx - 2, lfy - 1, lfx, lfy, RED_H);
  fill(png, rfx - 2, rfy - 1, rfx, rfy, RED_H);
}

function drawFace(
  png: InstanceType<typeof PNG>,
  fx: number,
  fy: number,
  pose: Pose,
) {
  const eyeTop = fy - 3;
  const lx = fx - 2.4;
  const rx = fx + 2.4;

  if (pose === 'sleep') {
    for (const ex of [lx, rx]) {
      set(png, ex - 1, eyeTop + 3, EYE);
      set(png, ex, eyeTop + 4, EYE);
      set(png, ex + 1, eyeTop + 4, EYE);
    }
  } else if (pose === 'happy') {
    for (const ex of [lx, rx]) {
      set(png, ex - 1, eyeTop + 2, EYE);
      set(png, ex, eyeTop + 1, EYE);
      set(png, ex + 1, eyeTop + 2, EYE);
    }
  } else if (pose === 'sad') {
    for (const ex of [lx, rx]) {
      fill(png, ex - 1, eyeTop + 2, ex, eyeTop + 4, EYE);
      set(png, ex + (ex === lx ? -1 : 1), eyeTop + 1, EYE);
    }
  } else {
    // Tall oval eyes + white glint (GIF)
    for (const ex of [lx, rx]) {
      ellipseFill(png, ex, eyeTop + 2, 1.15, 2.35, EYE);
      set(png, ex, eyeTop + 1, WHITE);
      set(png, ex - 0.3, eyeTop, WHITE);
    }
  }

  // Blush — rides with the face
  fill(png, lx - 3, fy + 1.5, lx - 1, fy + 2.5, BLUSH);
  fill(png, rx + 1, fy + 1.5, rx + 3, fy + 2.5, BLUSH);

  // Tiny mouth (GIF is subtle; skip when asleep)
  if (pose === 'happy') {
    fill(png, fx - 1, fy + 3, fx + 1, fy + 4, BLUSH);
    set(png, fx - 2, fy + 3, EYE);
    set(png, fx + 2, fy + 3, EYE);
  } else if (pose === 'sad') {
    set(png, fx - 1, fy + 5, EYE);
    set(png, fx, fy + 4, EYE);
    set(png, fx + 1, fy + 5, EYE);
  } else if (pose !== 'sleep') {
    ellipseFill(png, fx, fy + 3.6, 1.3, 0.9, MOUTH);
  }
}

function drawKirby(pose: Pose) {
  const png = blank();
  const phase = walkPhaseOf(pose);
  const wp = phase >= 0 ? walkParams(phase) : null;

  const raised = pose === 'happy' || pose === 'jump';
  const lean = wp?.lean ?? 0;
  const faceShift = wp?.face ?? 0;
  const cx = 16 + lean;

  const squash = wp?.squash ?? (pose === 'neutral2' ? 0.25 : 0);
  const rx = 8.4 + squash * 0.55;
  const ry = 8.0 - squash * 0.7;

  const bob = wp?.bob ?? (pose === 'jump' ? -3.5 : pose === 'neutral2' ? 0.8 : 0);
  let cy = 15 + bob;
  // Keep belly over the planted foot line so bob never opens a gap
  const ground = pose === 'jump' ? 24 : 25.2;
  if (pose !== 'jump') {
    cy = Math.max(cy, ground - ry + 1.35);
  }
  const bodyBottom = cy + ry;

  // Feet first (body paints over the tops)
  drawFeet(
    png,
    cx,
    bodyBottom,
    wp?.leftFootX ?? -0.4,
    wp?.rightFootX ?? 0.4,
    wp?.leftLift ?? 0,
    wp?.rightLift ?? (pose === 'jump' ? -0.8 : 0),
  );

  // Body
  ellipseFill(png, cx, cy, rx, ry, PINK);

  // Soft lower shading
  for (let y = -Math.ceil(ry); y <= Math.ceil(ry); y++) {
    for (let x = -Math.ceil(rx); x <= Math.ceil(rx); x++) {
      const d = Math.hypot(x / rx, y / ry);
      if (d > 1 || d < 0.55) continue;
      if (d > 0.78 && y > 1) set(png, cx + x, cy + y, x < 0 ? DEEP : SHADE);
    }
  }
  // Re-fill core so shading stays on the rim
  ellipseFill(png, cx, cy - 0.4, rx * 0.82, ry * 0.78, PINK);

  // Hands
  if (raised) {
    for (const side of [-1, 1] as const) {
      const ax = cx + side * 6.8;
      const ay = cy - 5.2;
      ellipseFill(png, ax, ay, 2.2, 2.4, PINK);
      fill(png, cx + side * 3.5, ay, cx + side * 6.5, ay + 3, PINK);
    }
  } else if (wp) {
    handNub(png, -1, cx, cy, wp.armL);
    handNub(png, 1, cx, cy, wp.armR);
  } else {
    handNub(png, -1, cx, cy, 0);
    handNub(png, 1, cx, cy, 0);
  }

  outlineSilhouette(png);

  // Shine (opposite the face slide so volume still reads)
  const shineX = cx - 4.5 + Math.min(1, faceShift * 0.25);
  fill(png, shineX, cy - 5, shineX + 1.2, cy - 3.8, WHITE);
  set(png, shineX - 1, cy - 4, WHITE);

  // Face slides with the walk; idle stays centered
  drawFace(png, cx + faceShift, cy, pose);

  return png;
}

fs.mkdirSync(ROOT, { recursive: true });
for (const pose of POSES) {
  const png = drawKirby(pose);
  fs.writeFileSync(path.join(ROOT, `${pose}.png`), PNG.sync.write(png));
}
console.log('Wrote Kirby pet frames (GIF-style 8-frame walk)');
