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
 * 8-phase walk (GIF style) — body motion is the hero, not just the feet.
 * Mid-stride (0,4): body lowest + squashed, feet widest.
 * Pass (2,6): body highest + stretched, feet cross under.
 * Arms pump opposite the feet.
 * Face stays on sprite-right every frame so Pet.setFlipX mirrors it when
 * walking left (GIF: features always lean into travel — never oscillate).
 */
function walkParams(phase: number) {
  const t = (phase / 8) * Math.PI * 2;
  // Mild bob — big lifts leave a gap above planted feet
  const bob = Math.round(Math.cos(t) * 1.35); // -1..+1 mostly
  const squash = bob >= 1 ? -0.55 : bob <= -1 ? 0.85 : 0;
  const widen = bob <= -1 ? 0.7 : bob >= 1 ? -0.35 : 0;
  const lean = Math.round(Math.sin(t) * 0.75);
  // Small stride under the belly (large offsets look like detached shoes)
  const leftFootX = Math.round(Math.cos(t) * 2.2);
  const rightFootX = -leftFootX;
  const leftLift = Math.min(0, Math.round(Math.sin(t) * 2));
  const rightLift = Math.min(0, Math.round(Math.sin(t + Math.PI) * 2));
  const armL = Math.round((1 - Math.cos(t)) * 1.35);
  const armR = Math.round((1 + Math.cos(t)) * 1.35);
  const armLy = Math.round(Math.sin(t) * 1.1);
  const armRy = Math.round(Math.sin(t + Math.PI) * 1.1);
  // Constant forward bias + tiny step wobble (always ≥ 3 toward right)
  const face = 3 + (Math.sin(t) > 0.3 ? 1 : 0);
  return {
    bob,
    lean,
    leftFootX,
    rightFootX,
    leftLift,
    rightLift,
    armL,
    armR,
    armLy,
    armRy,
    face,
    squash,
    widen,
  };
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

/** Seamless hand nub — pink only; silhouette defines the hand. */
function handNub(
  png: InstanceType<typeof PNG>,
  side: -1 | 1,
  cx: number,
  cy: number,
  forward: number,
  lift: number,
) {
  const ax = cx + side * (7.5 + forward);
  const ay = cy + 1 - lift;
  ellipseFill(png, ax, ay, 2.6, 2.8, PINK);
  // Bridge into body (no outline between nub and face)
  fill(png, cx + side * 4, ay - 1, cx + side * (7 + Math.max(0, forward)), ay + 2, PINK);
  set(png, ax, ay + 2, SHADE);
  set(png, ax + side, ay + 1, DEEP);
}

function drawKirby(pose: Pose) {
  const png = blank();
  const phase = walkPhaseOf(pose);
  const wp = phase >= 0 ? walkParams(phase) : null;

  const raised = pose === 'happy' || pose === 'jump';
  const dy = pose === 'jump' ? -3 : pose === 'neutral2' ? 1 : wp ? wp.bob : 0;
  const lean = wp?.lean ?? 0;
  // Walk: face locked to sprite-right. Idle stays centered.
  const faceShift = wp ? wp.face : 0;
  const cx = 16 + lean;
  const rx = 8.6 + (wp?.widen ?? 0);
  const ry = 8.0 - (wp?.squash ?? 0);

  // Planted ground line — feet never float with the bob.
  const ground = pose === 'jump' ? 23 : 25;
  // Clamp belly onto the shoes so high-bob frames don't leave a gap
  // (jump keeps its air pose — feet are drawn higher via `ground`).
  let cy = 14 + dy;
  if (pose !== 'jump') {
    cy = Math.max(cy, ground - ry + 1.2);
  }

  // --- Feet under body center (same cx); small spread stays attached ---
  const spread = pose === 'jump' ? 3 : 3.6;
  const lfx = cx - spread + (wp?.leftFootX ?? 0);
  const rfx = cx + spread + (wp?.rightFootX ?? 0);
  const lfy = ground + (wp?.leftLift ?? 0);
  const rfy = ground + (wp?.rightLift ?? 0);
  ellipseFill(png, lfx, lfy, 3.5, 2.2, RED);
  ellipseFill(png, rfx, rfy, 3.5, 2.2, RED);
  fill(png, lfx - 2, lfy - 1, lfx, lfy, RED_H);
  fill(png, rfx - 2, rfy - 1, rfx, rfy, RED_H);

  // --- Body (covers foot tops; leans + squashes with the stride) ---
  ellipseFill(png, cx, cy, rx, ry, PINK);

  // Hands — continuous pink with body; pump opposite the feet
  if (raised) {
    for (const side of [-1, 1] as const) {
      const ax = cx + side * 7;
      const ay = cy - 5;
      ellipseFill(png, ax, ay, 2.3, 2.5, PINK);
      fill(png, cx + side * 4, ay, cx + side * 7, ay + 3, PINK);
      set(png, ax - side, ay + 2, DEEP);
    }
  } else if (wp) {
    handNub(png, -1, cx, cy, wp.armL, wp.armLy);
    handNub(png, 1, cx, cy, wp.armR, wp.armRy);
  } else {
    handNub(png, -1, cx, cy, 0, 0);
    handNub(png, 1, cx, cy, 0, 0);
  }

  // Soft lower shading (skip hand nub region)
  for (let y = -Math.ceil(ry); y <= Math.ceil(ry); y++) {
    for (let x = -Math.ceil(rx); x <= Math.ceil(rx); x++) {
      const d = Math.hypot(x / rx, y / ry);
      if (d > 1 || d < 0.55) continue;
      if (Math.abs(x) >= 7 && Math.abs(y) < 4) continue;
      if (d > 0.75 && y > 1) set(png, cx + x, cy + y, x < 0 ? DEEP : SHADE);
    }
  }

  outlineSilhouette(png);

  // Shine — left of face bias so it still reads when features sit right
  fill(png, cx - 5 + Math.min(1, faceShift), cy - 5, cx - 4 + Math.min(1, faceShift), cy - 4, WHITE);
  set(png, cx - 6 + Math.min(1, faceShift), cy - 4, WHITE);

  // Face — biased to sprite-right (walk-forward); flipX mirrors for left
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
