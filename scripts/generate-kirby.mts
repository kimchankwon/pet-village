/**
 * Kirby pet frames — manual 8-frame walk matching the classic pink-puffball GIF.
 *
 * - 24–28px rounded pink body with true black outline
 * - tall narrow eyes, open mouth, red feet
 * - stride via lean, arm nubs, and foot offset
 * - derived poses: neutral1/neutral2, walk1–walk8, sad, happy, sleep, jump
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

const OUT: RGBA = [0, 0, 0, 255];
const PINK: RGBA = [252, 172, 188, 255];
const SHADE: RGBA = [228, 124, 144, 255];
const DEEP: RGBA = [204, 92, 116, 255];
const RED: RGBA = [212, 0, 52, 255];
const RED_H: RGBA = [252, 60, 92, 255];
const WHITE: RGBA = [255, 255, 255, 255];
const EYE_B: RGBA = [28, 28, 56, 255];

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

function ellipseFill(png: InstanceType<typeof PNG>, cx: number, cy: number, rx: number, ry: number, c: RGBA) {
  const rxi = Math.ceil(rx);
  const ryi = Math.ceil(ry);
  for (let y = -ryi; y <= ryi; y++) {
    for (let x = -rxi; x <= rxi; x++) {
      if (Math.hypot(x / rx, y / ry) <= 1) set(png, cx + x, cy + y, c);
    }
  }
}

function outline(png: InstanceType<typeof PNG>) {
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

function walkParams(phase: number) {
  const t = (phase / 8) * Math.PI * 2;
  const bob = Math.round(Math.sin(t) * 1.4);
  const lean = Math.round(Math.sin(t) * 0.85);
  const leftFootX = Math.round(Math.cos(t) * 2.3);
  const rightFootX = -leftFootX;
  const leftLift = Math.min(0, Math.round(Math.sin(t + Math.PI) * 1.8));
  const rightLift = Math.min(0, Math.round(Math.sin(t) * 1.8));
  const armL = Math.round(Math.sin(t) * 1.4);
  const armR = -armL;
  return {
    bob,
    lean,
    leftFootX,
    rightFootX,
    leftLift,
    rightLift,
    armL,
    armR,
  };
}

function handNub(
  png: InstanceType<typeof PNG>,
  side: -1 | 1,
  cx: number,
  cy: number,
  forward: number,
  lift: number,
) {
  const ax = cx + side * (7.5 + forward);
  const ay = cy - 4 - lift;
  ellipseFill(png, ax, ay, 2.4, 2.6, PINK);
  fill(png, cx + side * 4, ay - 1, cx + side * (7 + Math.max(0, forward)), ay + 2, PINK);
  set(png, ax, ay + 2, SHADE);
  set(png, ax + side, ay + 1, DEEP);
}

function eyes(png: InstanceType<typeof PNG>, cx: number, cy: number, closed = false) {
  for (const side of [-1, 1] as const) {
    const ex = Math.round(cx + side * 2.1);
    const ey = Math.round(cy - 1.6);
    if (closed) {
      fill(png, ex - 1, ey, ex + 1, ey, OUT);
    } else {
      ellipseFill(png, ex, ey, 1.1, 1.8, EYE_B);
      set(png, ex, ey - 1, WHITE);
    }
  }
}

function mouth(png: InstanceType<typeof PNG>, cx: number, cy: number, open = true) {
  if (!open) return;
  ellipseFill(png, cx + 1, cy + 1.4, 2.0, 1.3, OUT);
  fill(png, cx + 1, cy + 1, cx + 3, cy + 2, [92, 8, 24, 255]);
}

function blushMark(png: InstanceType<typeof PNG>, cx: number, cy: number) {
  for (const side of [-1, 1] as const) {
    const bx = Math.round(cx + side * 4.6);
    const by = Math.round(cy + 0.8);
    fill(png, bx - 1, by, bx + 1, by + 1, [252, 132, 164, 255]);
    fill(png, bx, by - 1, bx, by + 2, [252, 132, 164, 255]);
  }
}

function feet(png: InstanceType<typeof PNG>, ground: number, leftFootX: number, rightFootX: number, leftLift: number, rightLift: number) {
  const lfx = Math.round(15.5 + leftFootX);
  const rfx = Math.round(15.5 + rightFootX);
  const lfy = ground + leftLift;
  const rfy = ground + rightLift;
  ellipseFill(png, lfx, lfy, 3.6, 2.1, RED);
  ellipseFill(png, rfx, rfy, 3.6, 2.1, RED);
  fill(png, lfx - 2, lfy - 1, lfx, lfy, RED_H);
  fill(png, rfx - 2, rfy - 1, rfx, rfy, RED_H);
}

function body(png: InstanceType<typeof PNG>, cx: number, cy: number, rx: number, ry: number) {
  ellipseFill(png, cx, cy, rx, ry, PINK);
  for (let y = -Math.ceil(ry); y <= Math.ceil(ry); y++) {
    for (let x = -Math.ceil(rx); x <= Math.ceil(rx); x++) {
      if (Math.hypot(x / (rx + 0.4), y / (ry + 0.85)) <= 1) {
        set(png, cx + x, cy + y, SHADE);
      }
    }
  }
  ellipseFill(png, cx, cy, rx, ry, PINK);
}

function drawKirby(pose: Pose) {
  const png = blank();
  const phase = walkPhaseOf(pose);
  const wp = phase >= 0 ? walkParams(phase) : null;

  const raised = pose === 'happy' || pose === 'jump';
  const dy = pose === 'jump' ? -4 : pose === 'neutral2' ? 1 : wp ? wp.bob : 0;
  const lean = wp?.lean ?? 0;
  const cx = 16 + lean;

  const ground = pose === 'jump' ? 24 : 25;
  let cy = 14.5 + dy;
  if (pose !== 'jump') cy = Math.max(cy, ground - 9.0 + 1.1);

  const rx = pose === 'jump' ? 7.8 : 8.2;
  const ry = pose === 'neutral2' ? 8.3 : 7.8;

  if (wp) feet(png, ground, wp.leftFootX, wp.rightFootX, wp.leftLift, wp.rightLift);
  else if (pose !== 'jump') feet(png, ground, -0.6, 0.6, 0, 0);
  else feet(png, ground, -0.6, 0.6, -0.6, -0.6);

  body(png, cx, cy, rx, ry);

  if (raised) {
    for (const side of [-1, 1] as const) {
      const ax = cx + side * 7.2;
      const ay = cy - 5.6;
      ellipseFill(png, ax, ay, 2.3, 2.4, PINK);
      fill(png, cx + side * 4, ay - 1, cx + side * 7, ay + 2, PINK);
      set(png, ax - side, ay + 2, SHADE);
      set(png, ax + side, ay + 2, DEEP);
    }
  } else if (wp) {
    handNub(png, -1, cx, cy, wp.armL, wp.armLy);
    handNub(png, 1, cx, cy, wp.armR, wp.armRy);
  } else {
    handNub(png, -1, cx, cy, 0, 0);
    handNub(png, 1, cx, cy, 0, 0);
  }

  eyes(png, cx, cy, pose === 'sleep');
  mouth(png, cx, cy, pose !== 'sad' && pose !== 'sleep');
  blushMark(png, cx, cy);

  if (pose === 'sad') {
    const mouthY = Math.round(cy + 3.2);
    fill(png, Math.round(cx + 0.5), mouthY, Math.round(cx + 3.5), mouthY + 1, OUT);
  }

  outline(png);
  return png;
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

const frames = new Map<Pose, InstanceType<typeof PNG>>();
for (const pose of POSES) {
  const png = drawKirby(pose);
  frames.set(pose, png);
  fs.writeFileSync(path.join(ROOT, `${pose}.png`), PNG.sync.write(png));
  console.log(`${pose}: ${png.width}x${png.height}`);
}
console.log('Wrote Kirby pet frames');
