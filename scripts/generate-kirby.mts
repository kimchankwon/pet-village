/**
 * Kirby pet frames — GBA Nightmare-in-Dream-Land walk style.
 *
 * Walk cycle mirrors the classic pink-puffball GIF:
 *  - ~24×24 silhouette in a 32×32 canvas
 *  - 8-frame bob + elliptical feet + opposite arm nubs
 *  - Seamless hands (no inner outline between nub and face)
 *  - Pure black outer outline
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

// Palette from the walk GIF description
const OUT: RGBA = [0, 0, 0, 255];
const PINK: RGBA = [248, 168, 184, 255];
const SHADE: RGBA = [224, 120, 136, 255];
const DEEP: RGBA = [200, 88, 112, 255];
const BLUSH: RGBA = [248, 56, 136, 255];
const RED: RGBA = [208, 0, 48, 255];
const RED_H: RGBA = [248, 56, 88, 255];
const WHITE: RGBA = [255, 255, 255, 255];
const EYE_B: RGBA = [24, 24, 48, 255];

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

function fill(png: InstanceType<typeof PNG>, x0: number, y0: number, x1: number, y1: number, c: RGBA) {
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

/** Outer silhouette only — never paints into filled pink (seamless hands). */
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
 * 8-phase walk (GIF style).
 * Even phases = plant / low body; odd = pass / high body.
 * Feet move on an ellipse; arms opposite the feet; face shifts toward stride.
 */
function walkParams(phase: number) {
  const t = (phase / 8) * Math.PI * 2;
  // Body: lowest at mid-stride (phase 0,4), highest when feet pass (2,6)
  const bob = Math.round(Math.cos(t) * 1.2);
  // Left foot: forward at phase 0, back at phase 4
  const leftFootX = Math.round(Math.cos(t) * 4);
  const rightFootX = -leftFootX;
  const leftLift = Math.min(0, Math.round(Math.sin(t) * 3));
  const rightLift = Math.min(0, Math.round(Math.sin(t + Math.PI) * 3));
  // Arms opposite feet — nub “forward” when that side’s foot is back
  const armL = Math.round((1 - Math.cos(t)) * 0.5); // 0..1
  const armR = 1 - armL;
  const face = Math.cos(t) >= 0 ? 1 : -1;
  const squash = bob > 0 ? 0 : 0.4; // slightly flatter when low
  return { bob, leftFootX, rightFootX, leftLift, rightLift, armL, armR, face, squash };
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

/** Seamless hand nub — pink only, silhouette defines the hand. */
function handNub(
  png: InstanceType<typeof PNG>,
  side: -1 | 1,
  cx: number,
  cy: number,
  forward: number,
) {
  const ax = cx + side * (8 + forward);
  const ay = cy + 1 - forward;
  ellipseFill(png, ax, ay, 2.2, 2.4, PINK);
  // Bridge into body (no outline)
  fill(png, cx + side * 5, ay - 1, cx + side * (7 + forward), ay + 2, PINK);
  set(png, ax, ay + 2, SHADE);
}

function drawKirby(pose: Pose) {
  const png = blank();
  const phase = walkPhaseOf(pose);
  const wp = phase >= 0 ? walkParams(phase) : null;

  const raised = pose === 'happy' || pose === 'jump';
  const dy = pose === 'jump' ? -3 : pose === 'neutral2' ? 1 : wp ? wp.bob : 0;
  const faceShift = wp ? wp.face : 0;
  const cx = 16;
  const cy = 14 + dy;
  const rx = 8.6;
  const ry = 8.0 - (wp?.squash ?? 0);

  // --- Feet first (no outline yet; body will cover tops) ---
  const spread = pose === 'jump' ? 3 : 5;
  const lfx = cx - spread + (wp?.leftFootX ?? 0);
  const rfx = cx + spread + (wp?.rightFootX ?? 0);
  const ground = 25;
  const lfy = ground + (wp?.leftLift ?? 0) + Math.min(0, dy);
  const rfy = ground + (wp?.rightLift ?? 0) + Math.min(0, dy);
  ellipseFill(png, lfx, lfy, 3.6, 2.4, RED);
  ellipseFill(png, rfx, rfy, 3.6, 2.4, RED);
  fill(png, lfx - 2, lfy - 1, lfx, lfy, RED_H);
  fill(png, rfx - 2, rfy - 1, rfx, rfy, RED_H);

  // --- Body (covers upper foot overlap cleanly) ---
  ellipseFill(png, cx, cy, rx, ry, PINK);

  // Hands — continuous pink with body
  if (raised) {
    for (const side of [-1, 1] as const) {
      const ax = cx + side * 7;
      const ay = cy - 5;
      ellipseFill(png, ax, ay, 2.3, 2.5, PINK);
      fill(png, cx + side * 4, ay, cx + side * 7, ay + 3, PINK);
      set(png, ax - side, ay + 2, DEEP);
    }
  } else if (wp) {
    handNub(png, -1, cx, cy, wp.armL);
    handNub(png, 1, cx, cy, wp.armR);
  } else {
    handNub(png, -1, cx, cy, 0);
    handNub(png, 1, cx, cy, 0);
  }

  // Soft lower-right shading (skip hand nub region)
  for (let y = -Math.ceil(ry); y <= Math.ceil(ry); y++) {
    for (let x = -Math.ceil(rx); x <= Math.ceil(rx); x++) {
      const d = Math.hypot(x / rx, y / ry);
      if (d > 1 || d < 0.55) continue;
      if (Math.abs(x) >= 7 && Math.abs(y) < 4) continue;
      if (d > 0.75 && y > 1) set(png, cx + x, cy + y, x < 0 ? DEEP : SHADE);
    }
  }

  outlineSilhouette(png);

  // Shine
  fill(png, cx - 5 + faceShift, cy - 5, cx - 4 + faceShift, cy - 4, WHITE);
  set(png, cx - 6 + faceShift, cy - 4, WHITE);

  // Face — tall eyes: white top, deep bottom (GIF style)
  const eyeTop = cy - 3;
  const lx = cx - 3 + faceShift;
  const rxEye = cx + 3 + faceShift;
  if (pose === 'sleep') {
    for (const ex of [lx, rxEye]) {
      set(png, ex - 1, eyeTop + 3, OUT);
      set(png, ex, eyeTop + 4, OUT);
      set(png, ex + 1, eyeTop + 4, OUT);
    }
  } else if (pose === 'happy') {
    for (const ex of [lx, rxEye]) {
      set(png, ex - 1, eyeTop + 2, OUT);
      set(png, ex, eyeTop + 1, OUT);
      set(png, ex + 1, eyeTop + 2, OUT);
    }
  } else if (pose === 'sad') {
    for (const ex of [lx, rxEye]) {
      fill(png, ex - 1, eyeTop + 2, ex, eyeTop + 4, OUT);
      set(png, ex + (ex === lx ? -1 : 1), eyeTop + 1, OUT);
    }
  } else {
    for (const ex of [lx, rxEye]) {
      fill(png, ex - 1, eyeTop, ex, eyeTop + 4, EYE_B);
      fill(png, ex - 1, eyeTop, ex, eyeTop + 1, WHITE);
      set(png, ex - 1, eyeTop + 4, OUT);
      set(png, ex, eyeTop + 4, OUT);
    }
  }

  // Cheeks
  fill(png, lx - 3, cy + 2, lx - 2, cy + 2, BLUSH);
  fill(png, rxEye + 2, cy + 2, rxEye + 3, cy + 2, BLUSH);

  // Mouth
  if (pose === 'happy') {
    fill(png, cx - 1 + faceShift, cy + 3, cx + 1 + faceShift, cy + 4, BLUSH);
    set(png, cx - 2 + faceShift, cy + 3, OUT);
    set(png, cx + 2 + faceShift, cy + 3, OUT);
  } else if (pose === 'sad') {
    set(png, cx - 1 + faceShift, cy + 5, OUT);
    set(png, cx + faceShift, cy + 4, OUT);
    set(png, cx + 1 + faceShift, cy + 5, OUT);
  } else if (pose !== 'sleep') {
    set(png, cx + faceShift, cy + 4, OUT);
  }

  return png;
}

function save(png: InstanceType<typeof PNG>, file: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, PNG.sync.write(png));
}

for (const pose of POSES) {
  save(drawKirby(pose), path.join(ROOT, `${pose}.png`));
}
console.log('Wrote Kirby pet frames (GBA-style 8-frame walk)');
