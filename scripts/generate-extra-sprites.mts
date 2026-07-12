/**
 * Club Penguin–style Puffle pet frames for Pet Village.
 * Cinnamoroll lives in `scripts/generate-cinnamoroll.mts` (reference-sheet tracer).
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');

const ROOT = path.resolve('public/assets');

function blank(w: number, h: number) {
  const png = new PNG({ width: w, height: h });
  png.data.fill(0);
  return png;
}

function set(png: InstanceType<typeof PNG>, x: number, y: number, rgba: [number, number, number, number]) {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) return;
  const i = (png.width * y + x) << 2;
  png.data[i] = rgba[0];
  png.data[i + 1] = rgba[1];
  png.data[i + 2] = rgba[2];
  png.data[i + 3] = rgba[3];
}

function fill(png: InstanceType<typeof PNG>, x0: number, y0: number, x1: number, y1: number, rgba: [number, number, number, number]) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(png, x, y, rgba);
}

function circle(png: InstanceType<typeof PNG>, cx: number, cy: number, r: number, rgba: [number, number, number, number], outline?: [number, number, number, number]) {
  for (let y = -r; y <= r; y++) {
    for (let x = -r; x <= r; x++) {
      const d = Math.hypot(x, y);
      if (d <= r - 0.6) set(png, cx + x, cy + y, rgba);
      else if (outline && d <= r + 0.4) set(png, cx + x, cy + y, outline);
    }
  }
}

function save(png: InstanceType<typeof PNG>, file: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, PNG.sync.write(png));
}

const W: [number, number, number, number] = [255, 255, 255, 255];
const OUT: [number, number, number, number] = [0, 0, 0, 255];
const BLUE: [number, number, number, number] = [90, 160, 230, 255];
const PINK: [number, number, number, number] = [255, 170, 190, 255];
const CREAM: [number, number, number, number] = [255, 230, 200, 255];
const TAIL: [number, number, number, number] = [255, 210, 180, 255];

type CinPose = 'idle' | 'walk1' | 'walk2' | 'happy' | 'sad' | 'jump';

function drawCinnamoroll(pose: CinPose) {
  const png = blank(32, 32);
  const earLift = pose === 'jump' ? -3 : pose === 'sad' ? 2 : 0;
  const bodyY = pose === 'jump' ? 15 : pose === 'walk2' ? 17 : 16;
  const footShift = pose === 'walk1' ? -2 : pose === 'walk2' ? 2 : 0;

  // Ears (long, droopy / flared)
  if (pose === 'jump' || pose === 'happy') {
    fill(png, 4, 4 + earLift, 9, 14 + earLift, W);
    fill(png, 22, 4 + earLift, 27, 14 + earLift, W);
    for (let x = 4; x <= 9; x++) set(png, x, 3 + earLift, OUT);
    for (let x = 22; x <= 27; x++) set(png, x, 3 + earLift, OUT);
  } else {
    fill(png, 2, 10 + earLift, 8, 20 + earLift, W);
    fill(png, 23, 10 + earLift, 29, 20 + earLift, W);
    for (let y = 10; y <= 20; y++) {
      set(png, 1, y + earLift, OUT);
      set(png, 30, y + earLift, OUT);
    }
  }
  // Ear outline sides
  for (let y = 4; y <= 14; y++) {
    if (pose === 'jump' || pose === 'happy') {
      set(png, 3, y + earLift, OUT);
      set(png, 10, y + earLift, OUT);
      set(png, 21, y + earLift, OUT);
      set(png, 28, y + earLift, OUT);
    }
  }

  // Body
  circle(png, 16, bodyY, 8, W, OUT);
  // Cheeks
  set(png, 10, bodyY + 1, PINK);
  set(png, 11, bodyY + 1, PINK);
  set(png, 20, bodyY + 1, PINK);
  set(png, 21, bodyY + 1, PINK);
  // Eyes
  if (pose === 'sad') {
    set(png, 12, bodyY - 2, OUT);
    set(png, 13, bodyY - 1, OUT);
    set(png, 19, bodyY - 2, OUT);
    set(png, 18, bodyY - 1, OUT);
  } else if (pose === 'happy') {
    set(png, 12, bodyY - 1, OUT);
    set(png, 13, bodyY - 2, OUT);
    set(png, 14, bodyY - 1, OUT);
    set(png, 18, bodyY - 1, OUT);
    set(png, 19, bodyY - 2, OUT);
    set(png, 20, bodyY - 1, OUT);
  } else {
    set(png, 12, bodyY - 2, BLUE);
    set(png, 13, bodyY - 2, BLUE);
    set(png, 12, bodyY - 1, OUT);
    set(png, 13, bodyY - 1, OUT);
    set(png, 18, bodyY - 2, BLUE);
    set(png, 19, bodyY - 2, BLUE);
    set(png, 18, bodyY - 1, OUT);
    set(png, 19, bodyY - 1, OUT);
  }
  // Mouth
  if (pose === 'sad') {
    set(png, 15, bodyY + 3, OUT);
    set(png, 16, bodyY + 2, OUT);
    set(png, 17, bodyY + 3, OUT);
  } else {
    set(png, 15, bodyY + 2, OUT);
    set(png, 16, bodyY + 3, OUT);
    set(png, 17, bodyY + 2, OUT);
  }
  // Cinnamon-roll tail
  set(png, 24, bodyY + 4, TAIL);
  set(png, 25, bodyY + 3, TAIL);
  set(png, 26, bodyY + 4, TAIL);
  set(png, 25, bodyY + 5, TAIL);
  set(png, 24, bodyY + 3, OUT);
  set(png, 26, bodyY + 5, OUT);
  // Feet
  fill(png, 11 + footShift, bodyY + 7, 14 + footShift, bodyY + 8, CREAM);
  fill(png, 17 - footShift, bodyY + 7, 20 - footShift, bodyY + 8, CREAM);
  return png;
}

const PUFFLE_COLORS: Record<string, [number, number, number, number]> = {
  blue: [70, 150, 255, 255],
  pink: [255, 120, 180, 255],
  green: [80, 200, 100, 255],
  black: [45, 45, 55, 255],
  purple: [170, 100, 230, 255],
  red: [230, 70, 70, 255],
  yellow: [255, 210, 60, 255],
  white: [245, 245, 250, 255],
};

type PufflePose = 'neutral1' | 'neutral2' | 'walk1' | 'walk2' | 'sad' | 'happy' | 'sleep' | 'jump';

function darken(c: [number, number, number, number], f = 0.72): [number, number, number, number] {
  return [Math.round(c[0] * f), Math.round(c[1] * f), Math.round(c[2] * f), 255];
}

/**
 * Classic Club Penguin puffle: round fluffy ball, spiky left/top and smoother
 * bottom/right, one large white face with tall rectangular eyes and a wide smile.
 */
function drawPuffle(color: [number, number, number, number], pose: PufflePose, angry = false) {
  const png = blank(32, 32);
  const yOff = pose === 'jump' ? -3 : pose === 'walk2' ? 1 : 0;
  const cx = 16;
  const cy = 17 + yOff;
  const shade = darken(color, 0.78);
  const FACE_INK: [number, number, number, number] = OUT;

  // Asymmetric silhouette: chunky fur clumps on the top-left, calm curve
  // on the bottom-right — matches the classic CP "puffle blob".
  const phase = pose === 'walk1' ? 0.55 : pose === 'walk2' ? -0.55 : pose === 'neutral2' ? 0.28 : 0;
  const RX = 11;
  const RY = 10;
  for (let y = -14; y <= 12; y++) {
    for (let x = -14; x <= 13; x++) {
      const a = Math.atan2(y / RY, x / RX);
      // Left/top get strong spikes; right/bottom stay near round.
      const leftBias = Math.max(0, -x / RX); // 0..1 on the left
      const topBias = Math.max(0, -y / RY); // 0..1 on the top
      const spikeZone = Math.min(1, leftBias * 1.15 + topBias * 0.95);
      const amp = 0.38 * spikeZone;
      // ~5 distinct clumps along the top-left quadrant
      const clumps = Math.sin(a * 5.2 + phase + 0.9) * 0.55 + Math.sin(a * 9.1 + phase * 1.3) * 0.25;
      const wob = amp * Math.max(clumps, -0.15);
      // Slight rightward squash so the face can sit a touch off-center
      const n = Math.hypot((x - 0.4) / RX, y / RY);
      const inside = 0.88 + wob;
      if (n <= inside) {
        // Subtle shade in the denser left/top tufts
        const tuft = spikeZone > 0.55 && clumps > 0.35 && n > inside - 0.22;
        set(png, cx + x, cy + y, tuft ? shade : color);
      } else if (n <= inside + 0.12) {
        set(png, cx + x, cy + y, OUT);
      }
    }
  }

  // Large white face (~half the front), slightly right of center, soft M-top
  const fx = cx + 1;
  const fy = cy + 1;
  const facePx = pose === 'walk1' ? -1 : pose === 'walk2' ? 1 : 0;
  for (let y = -7; y <= 7; y++) {
    for (let x = -8; x <= 8; x++) {
      // Heart/M dip along the top edge
      const topDip = y < -3 ? (Math.abs(x) < 2.2 ? -0.22 : Math.abs(x) < 4.5 ? 0.08 : 0) : 0;
      const n = Math.hypot(x / 7.4, (y + topDip) / 6.6);
      if (n > 0.98) continue;
      const wx = fx + x + facePx;
      const wy = fy + y;
      if (wx < 0 || wy < 0 || wx >= png.width || wy >= png.height) continue;
      const i = (png.width * wy + wx) << 2;
      if (png.data[i + 3] === 0) continue; // stay inside the fur silhouette
      set(png, wx, wy, W);
    }
  }

  const eyeY = fy - 2;
  if (pose === 'sleep') {
    // Simple closed lids (— —) on the white face
    fill(png, fx - 4 + facePx, eyeY + 1, fx - 1 + facePx, eyeY + 1, FACE_INK);
    fill(png, fx + 1 + facePx, eyeY + 1, fx + 4 + facePx, eyeY + 1, FACE_INK);
  } else {
    // Tall rectangular eyes: 2×4 with a 2px white gap (fx-1 and fx)
    const pdy = pose === 'sad' ? 1 : 0;
    fill(png, fx - 3 + facePx, eyeY + pdy, fx - 2 + facePx, eyeY + pdy + 3, FACE_INK);
    fill(png, fx + 1 + facePx, eyeY + pdy, fx + 2 + facePx, eyeY + pdy + 3, FACE_INK);
    if (pose === 'sad') {
      for (const s of [-1, 1] as const) {
        set(png, fx + s * 6 + facePx, eyeY - 2, FACE_INK);
        set(png, fx + s * 5 + facePx, eyeY - 3, FACE_INK);
      }
    } else if (angry) {
      for (const s of [-1, 1] as const) {
        set(png, fx + s * 5 + facePx, eyeY - 3, FACE_INK);
        set(png, fx + s * 4 + facePx, eyeY - 2, FACE_INK);
        set(png, fx + s * 3 + facePx, eyeY - 2, FACE_INK);
      }
    }
  }

  // Wide smile on the face (~11px), outer corners one row higher
  const my = fy + 4;
  if (pose === 'sad') {
    set(png, fx - 4 + facePx, my + 2, FACE_INK);
    set(png, fx - 3 + facePx, my + 1, FACE_INK);
    fill(png, fx - 2 + facePx, my, fx + 2 + facePx, my, FACE_INK);
    set(png, fx + 3 + facePx, my + 1, FACE_INK);
    set(png, fx + 4 + facePx, my + 2, FACE_INK);
  } else if (pose !== 'sleep') {
    const half = 5;
    set(png, fx - half + facePx, my, FACE_INK);
    set(png, fx + half + facePx, my, FACE_INK);
    fill(png, fx - half + 1 + facePx, my + 1, fx + half - 1 + facePx, my + 1, FACE_INK);
  }

  // Tiny sparkle (neutral / happy) — classic CP accent
  if (pose === 'neutral1' || pose === 'happy' || pose === 'jump') {
    const sx = cx + 11;
    const sy = cy - 10;
    set(png, sx, sy, W);
    set(png, sx - 1, sy, W);
    set(png, sx + 1, sy, W);
    set(png, sx, sy - 1, W);
    set(png, sx, sy + 1, W);
  }

  // Guarantee a continuous true-black silhouette (spike edges can leave gaps).
  const add: [number, number][] = [];
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      const i = (32 * y + x) << 2;
      if (png.data[i + 3] < 200) continue;
      // Already black outline
      if (png.data[i] === 0 && png.data[i + 1] === 0 && png.data[i + 2] === 0) continue;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= 32 || ny >= 32) {
          add.push([x, y]);
          break;
        }
        const ni = (32 * ny + nx) << 2;
        if (png.data[ni + 3] < 200) {
          add.push([x, y]);
          break;
        }
      }
    }
  }
  for (const [x, y] of add) set(png, x, y, OUT);

  return png;
}

// --- write files ---
const poses: PufflePose[] = ['neutral1', 'neutral2', 'walk1', 'walk2', 'sad', 'happy', 'sleep', 'jump'];
for (const [name, color] of Object.entries(PUFFLE_COLORS)) {
  const dir = path.join(ROOT, `pet/puffle-${name}`);
  for (const pose of poses) {
    save(drawPuffle(color, pose, name === 'black'), path.join(dir, `${pose}.png`));
  }
}

console.log('Wrote Puffle sprites');
