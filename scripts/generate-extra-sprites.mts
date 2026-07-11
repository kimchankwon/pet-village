/**
 * Generates Cinnamoroll NPC frames and Club Penguin–style Puffle pet frames
 * inspired by the sprite sheets provided for Pet Village.
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
const OUT: [number, number, number, number] = [30, 30, 40, 255];
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

function drawPuffle(color: [number, number, number, number], pose: PufflePose, angry = false) {
  const png = blank(32, 32);
  const yOff = pose === 'jump' ? -3 : pose === 'walk2' ? 1 : 0;
  const cx = 16;
  const cy = 17 + yOff;
  circle(png, cx, cy, 9, color, OUT);
  // Hair tuft
  set(png, cx - 1, cy - 10, color);
  set(png, cx, cy - 11, color);
  set(png, cx + 1, cy - 10, color);
  set(png, cx, cy - 12, OUT);
  set(png, cx - 2, cy - 10, OUT);
  set(png, cx + 2, cy - 10, OUT);

  const eyeY = cy - 2;
  if (pose === 'sleep') {
    set(png, cx - 4, eyeY, OUT);
    set(png, cx - 3, eyeY, OUT);
    set(png, cx + 2, eyeY, OUT);
    set(png, cx + 3, eyeY, OUT);
  } else if (pose === 'sad' || angry) {
    set(png, cx - 4, eyeY - 1, OUT);
    set(png, cx - 3, eyeY, OUT);
    set(png, cx + 2, eyeY, OUT);
    set(png, cx + 3, eyeY - 1, OUT);
  } else if (pose === 'happy') {
    set(png, cx - 4, eyeY, OUT);
    set(png, cx - 3, eyeY - 1, OUT);
    set(png, cx - 2, eyeY, OUT);
    set(png, cx + 1, eyeY, OUT);
    set(png, cx + 2, eyeY - 1, OUT);
    set(png, cx + 3, eyeY, OUT);
  } else {
    // Big round eyes with pupils shifted by pose
    const px = pose === 'walk1' ? -1 : pose === 'walk2' ? 1 : 0;
    fill(png, cx - 5, eyeY - 2, cx - 2, eyeY + 1, W);
    fill(png, cx + 1, eyeY - 2, cx + 4, eyeY + 1, W);
    set(png, cx - 4 + px, eyeY, OUT);
    set(png, cx - 3 + px, eyeY, OUT);
    set(png, cx + 2 + px, eyeY, OUT);
    set(png, cx + 3 + px, eyeY, OUT);
  }
  // Mouth
  if (pose === 'sad') {
    set(png, cx - 1, cy + 4, OUT);
    set(png, cx, cy + 3, OUT);
    set(png, cx + 1, cy + 4, OUT);
  } else if (pose !== 'sleep') {
    set(png, cx - 1, cy + 3, OUT);
    set(png, cx, cy + 4, OUT);
    set(png, cx + 1, cy + 3, OUT);
  }
  // Bounce frame: slightly different tuft
  if (pose === 'neutral2') {
    set(png, cx, cy - 13, color);
  }
  return png;
}

// --- write files ---
const cinnaDir = path.join(ROOT, 'npc/cinnamoroll');
for (const pose of ['idle', 'walk1', 'walk2', 'happy', 'sad', 'jump'] as CinPose[]) {
  save(drawCinnamoroll(pose), path.join(cinnaDir, `${pose}.png`));
}

const poses: PufflePose[] = ['neutral1', 'neutral2', 'walk1', 'walk2', 'sad', 'happy', 'sleep', 'jump'];
for (const [name, color] of Object.entries(PUFFLE_COLORS)) {
  const dir = path.join(ROOT, `pet/puffle-${name}`);
  for (const pose of poses) {
    save(drawPuffle(color, pose, name === 'black'), path.join(dir, `${pose}.png`));
  }
}

console.log('Wrote Cinnamoroll + Puffle sprites');
