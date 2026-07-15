/**
 * Kirby pet frames — round pink puffball (Tenor kirby-walk GIF ref).
 *
 * Design goals (match scripts/reference/kirby/):
 *  - Near-perfect circular body, no pointy silhouette nubs
 *  - Soft round arm blobs + rounded red feet
 *  - Tall white eyes with black rim; large black pupils filling the lower half
 *    (classic Kirby look from the GIF frames)
 *  - Pink blush, small open smile + tongue
 *
 * Poses: neutral1, neutral2, walk1–walk8, sad, happy, sleep, jump.
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { repairExternalOutline } from './lib/pixel-outline.mjs';

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

// Classic Kirby palette (Tenor walk GIF)
const OUT: RGBA = [0, 0, 0, 255];
const PINK: RGBA = [255, 170, 200, 255];
const SHADE: RGBA = [240, 120, 160, 255];
const DEEP: RGBA = [220, 90, 130, 255];
const RED: RGBA = [200, 30, 70, 255];
const RED_H: RGBA = [236, 70, 110, 255];
const WHITE: RGBA = [255, 255, 255, 255];
const EYE: RGBA = [16, 16, 24, 255];
const BLUSH: RGBA = [255, 120, 160, 255];
const TONGUE: RGBA = [255, 100, 140, 255];

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

/** Filled ellipse with soft edge (no diamond/pointy pixels). */
function ellipseFill(
  png: InstanceType<typeof PNG>,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  c: RGBA,
) {
  const rxi = Math.ceil(rx) + 1;
  const ryi = Math.ceil(ry) + 1;
  for (let y = -ryi; y <= ryi; y++) {
    for (let x = -rxi; x <= rxi; x++) {
      // Slightly soft threshold → rounder silhouette, fewer stair-step points
      if ((x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1.02) set(png, cx + x, cy + y, c);
    }
  }
}

/** Perfect circle. */
function circleFill(png: InstanceType<typeof PNG>, cx: number, cy: number, r: number, c: RGBA) {
  ellipseFill(png, cx, cy, r, r, c);
}

/** Outer silhouette outline (4-connected), then peel 1px corner spikes. */
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

  // Drop lone outline diagonal spikes (1 opaque neighbor) so the ball stays round
  for (let pass = 0; pass < 2; pass++) {
    const doomed: [number, number][] = [];
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (!getA(png, x, y)) continue;
        const i = (W * y + x) << 2;
        const isBlack =
          png.data[i]! + png.data[i + 1]! + png.data[i + 2]! < 40 && png.data[i + 3]! >= 200;
        if (!isBlack) continue;
        let o4 = 0;
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          if (getA(png, x + dx, y + dy)) o4++;
        }
        if (o4 <= 1) doomed.push([x, y]);
      }
    }
    for (const [x, y] of doomed) {
      const i = (W * y + x) << 2;
      png.data.fill(0, i, i + 4);
    }
  }
}

function walkParams(phase: number) {
  const t = (phase / 8) * Math.PI * 2;
  const bob = Math.sin(t) * 0.9;
  // Keep nearly circular — only tiny squash
  const squash = Math.sin(t) * 0.28;
  const face = Math.round(Math.sin(t) * 1.2); // −1..1
  const lean = Math.round(Math.sin(t) * 0.5);
  const stride = Math.cos(t) * 2.0;
  const leftFootX = stride;
  const rightFootX = -stride;
  const leftLift = Math.min(0, Math.sin(t) * 1.4);
  const rightLift = Math.min(0, Math.sin(t + Math.PI) * 1.4);
  const armL = Math.max(0, -Math.sin(t)) * 0.8;
  const armR = Math.max(0, Math.sin(t)) * 0.8;
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

/** Soft round arm blob — pure circles, no pointed stubs. */
function handNub(
  png: InstanceType<typeof PNG>,
  side: -1 | 1,
  cx: number,
  cy: number,
  extend: number,
) {
  const ax = cx + side * (7.2 + extend * 0.4);
  const ay = cy + 1.0;
  circleFill(png, ax, ay, 2.8, PINK);
  // Soft bridge into body (still round)
  circleFill(png, cx + side * 5.2, ay + 0.3, 2.0, PINK);
  set(png, ax, ay + 1.5, SHADE);
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
  // Round red shoes under the ball (no pointed toes)
  const spread = 3.6;
  const lfx = cx - spread + leftX;
  const rfx = cx + spread + rightX;
  const lfy = bodyBottom + 0.4 + leftLift;
  const rfy = bodyBottom + 0.4 + rightLift;
  ellipseFill(png, lfx, lfy, 3.4, 2.2, RED);
  ellipseFill(png, rfx, rfy, 3.4, 2.2, RED);
  // Soft highlight
  set(png, lfx - 1, lfy - 1, RED_H);
  set(png, rfx - 1, rfy - 1, RED_H);
}

/**
 * Classic Kirby eyes from the Tenor GIF (f00/f04):
 * tall white oval, thin black rim, big black pupil sitting in the lower half
 * with a clear white upper “sclera” — not solid black ovals.
 *
 * Hand-tuned 3×6 pixel column (readable at 32×32):
 *
 *     # # #
 *   # w w w #
 *   # w w w #
 *   # b b b #
 *   # b b b #
 *     # # #
 */
function drawEye(png: InstanceType<typeof PNG>, ex: number, ey: number) {
  const x = Math.round(ex);
  const y = Math.round(ey);
  // Black rim
  const rim: [number, number][] = [
    [0, -3],
    [-1, -2],
    [0, -2],
    [1, -2],
    [-2, -1],
    [2, -1],
    [-2, 0],
    [2, 0],
    [-2, 1],
    [2, 1],
    [-2, 2],
    [2, 2],
    [-1, 3],
    [0, 3],
    [1, 3],
  ];
  for (const [dx, dy] of rim) set(png, x + dx, y + dy, EYE);
  // White upper (sclera) — two full rows
  for (const dy of [-1, 0]) {
    set(png, x - 1, y + dy, WHITE);
    set(png, x, y + dy, WHITE);
    set(png, x + 1, y + dy, WHITE);
  }
  // Black pupil lower half
  for (const dy of [1, 2]) {
    set(png, x - 1, y + dy, EYE);
    set(png, x, y + dy, EYE);
    set(png, x + 1, y + dy, EYE);
  }
  // Tiny glint in the white
  set(png, x, y - 1, WHITE);
}

function drawFace(png: InstanceType<typeof PNG>, fx: number, fy: number, pose: Pose) {
  const eyeCy = fy - 1.2;
  const lx = fx - 2.8;
  const rx = fx + 2.8;

  if (pose === 'sleep') {
    for (const ex of [lx, rx]) {
      // Soft closed lids (curved, not pointy)
      set(png, ex - 1, eyeCy + 1, EYE);
      set(png, ex, eyeCy + 1.5, EYE);
      set(png, ex + 1, eyeCy + 1, EYE);
    }
  } else if (pose === 'happy') {
    // Happy ^ ^ squints
    for (const ex of [lx, rx]) {
      set(png, ex - 1, eyeCy + 0.5, EYE);
      set(png, ex, eyeCy - 0.3, EYE);
      set(png, ex + 1, eyeCy + 0.5, EYE);
    }
  } else if (pose === 'sad') {
    for (const ex of [lx, rx]) {
      ellipseFill(png, ex, eyeCy + 0.3, 1.3, 2.0, EYE);
      ellipseFill(png, ex, eyeCy - 0.2, 0.7, 1.0, WHITE);
    }
  } else {
    drawEye(png, lx, eyeCy);
    drawEye(png, rx, eyeCy);
  }

  // Round blush ovals under the eyes
  ellipseFill(png, lx - 2.4, fy + 2.0, 1.6, 1.1, BLUSH);
  ellipseFill(png, rx + 2.4, fy + 2.0, 1.6, 1.1, BLUSH);

  // Mouth
  if (pose === 'happy') {
    set(png, fx - 2, fy + 3, EYE);
    fill(png, fx - 1, fy + 3.5, fx + 1, fy + 4.5, EYE);
    set(png, fx + 2, fy + 3, EYE);
    fill(png, fx - 1, fy + 3.5, fx + 1, fy + 4, TONGUE);
  } else if (pose === 'sad') {
    set(png, fx - 1, fy + 5, EYE);
    set(png, fx, fy + 4, EYE);
    set(png, fx + 1, fy + 5, EYE);
  } else if (pose !== 'sleep') {
    // Small open smile + tongue (GIF)
    set(png, fx - 2, fy + 3.2, EYE);
    set(png, fx - 1, fy + 4, EYE);
    set(png, fx, fy + 4.2, EYE);
    set(png, fx + 1, fy + 4, EYE);
    set(png, fx + 2, fy + 3.2, EYE);
    set(png, fx, fy + 3.4, TONGUE);
    set(png, fx, fy + 3.8, TONGUE);
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

  const squash = wp?.squash ?? (pose === 'neutral2' ? 0.15 : 0);
  // Nearly perfect circle (GIF is a round ball)
  const r = 8.6;
  const rx = r + squash * 0.35;
  const ry = r - squash * 0.35;

  const bob = wp?.bob ?? (pose === 'jump' ? -3.2 : pose === 'neutral2' ? 0.5 : 0);
  let cy = 14.2 + bob;
  const ground = pose === 'jump' ? 24 : 25.2;
  if (pose !== 'jump') {
    cy = Math.max(cy, ground - ry + 0.8);
  }
  const bodyBottom = cy + ry;

  // Feet under the ball
  drawFeet(
    png,
    cx,
    bodyBottom,
    wp?.leftFootX ?? -0.3,
    wp?.rightFootX ?? 0.3,
    wp?.leftLift ?? 0,
    wp?.rightLift ?? (pose === 'jump' ? -0.6 : 0),
  );

  // Circular body
  ellipseFill(png, cx, cy, rx, ry, PINK);

  // Soft lower rim shade (no hard edges)
  for (let y = -Math.ceil(ry); y <= Math.ceil(ry); y++) {
    for (let x = -Math.ceil(rx); x <= Math.ceil(rx); x++) {
      const d = Math.hypot(x / rx, y / ry);
      if (d > 1 || d < 0.55) continue;
      if (d > 0.78 && y > 1) set(png, cx + x, cy + y, x < -1 ? DEEP : SHADE);
    }
  }
  ellipseFill(png, cx, cy - 0.4, rx * 0.86, ry * 0.82, PINK);

  // Hands — pure round blobs
  if (raised) {
    for (const side of [-1, 1] as const) {
      const ax = cx + side * 7.2;
      const ay = cy - 4.5;
      circleFill(png, ax, ay, 2.6, PINK);
      circleFill(png, cx + side * 5.0, ay + 1.2, 2.0, PINK);
    }
  } else if (wp) {
    handNub(png, -1, cx, cy, wp.armL);
    handNub(png, 1, cx, cy, wp.armR);
  } else {
    handNub(png, -1, cx, cy, 0);
    handNub(png, 1, cx, cy, 0);
  }

  outlineSilhouette(png);

  // Soft top-left shine
  const shineX = cx - 3.8;
  circleFill(png, shineX, cy - 4.0, 1.4, WHITE);
  set(png, shineX + 1, cy - 3.2, WHITE);

  // Face
  drawFace(png, cx + faceShift, cy + 0.5, pose);

  return png;
}

fs.mkdirSync(ROOT, { recursive: true });
for (const pose of POSES) {
  const png = drawKirby(pose);
  // Repair outline but keep it one-pixel and round (no thick spikes)
  const repaired = repairExternalOutline(png, { outline: OUT, tolerance: 0 });
  fs.writeFileSync(path.join(ROOT, `${pose}.png`), PNG.sync.write(repaired));
}
console.log('Wrote Kirby pet frames (round body + classic tall eyes)');
