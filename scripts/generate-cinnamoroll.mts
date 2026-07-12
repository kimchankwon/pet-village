/**
 * Cinnamoroll sprites matching the Sanrio pixel sheet:
 * white puppy, 1×2 blue eyes, pink cheek squares, soft blue-grey ear shade,
 * long floppy ears (hang idle / flare jump / droop sad / wink happy).
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');

const ROOT = path.resolve('public/assets');
const W = 32;
const H = 32;

type RGBA = [number, number, number, number];

const OUT: RGBA = [40, 40, 48, 255];
const WHITE: RGBA = [255, 255, 255, 255];
const SHADE: RGBA = [210, 220, 230, 255]; // ear / underside blue-grey
const BLUE: RGBA = [90, 170, 230, 255];
const PINK: RGBA = [255, 170, 190, 255];
const CREAM: RGBA = [255, 230, 200, 255];
const TAIL: RGBA = [255, 210, 180, 255];

function blank() {
  const png = new PNG({ width: W, height: H });
  png.data.fill(0);
  return png;
}

function set(png: InstanceType<typeof PNG>, x: number, y: number, rgba: RGBA) {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) return;
  const i = (png.width * y + x) << 2;
  png.data[i] = rgba[0];
  png.data[i + 1] = rgba[1];
  png.data[i + 2] = rgba[2];
  png.data[i + 3] = rgba[3];
}

function fill(png: InstanceType<typeof PNG>, x0: number, y0: number, x1: number, y1: number, rgba: RGBA) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(png, x, y, rgba);
}

function oval(
  png: InstanceType<typeof PNG>,
  cx: number,
  cy: number,
  a: number,
  b: number,
  fillC: RGBA,
  outline?: RGBA,
) {
  for (let y = -b - 1; y <= b + 1; y++) {
    for (let x = -a - 1; x <= a + 1; x++) {
      const n = (x * x) / (a * a) + (y * y) / (b * b);
      if (n <= 1) set(png, cx + x, cy + y, fillC);
      else if (outline && n <= 1.2) set(png, cx + x, cy + y, outline);
    }
  }
}

function save(png: InstanceType<typeof PNG>, file: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, PNG.sync.write(png));
}

type CinPose = 'idle' | 'walk1' | 'walk2' | 'happy' | 'sad' | 'jump';

/**
 * Ears:
 * - idle: hang straight down beside body (sheet IDLE)
 * - walk: slightly swept back
 * - jump: horizontal wing-ears
 * - sad: droop low / hurt
 * - happy: one up / swept (wink pose)
 */
function drawEars(png: InstanceType<typeof PNG>, pose: CinPose, bodyY: number) {
  if (pose === 'jump') {
    // Horizontal wing-ears
    fill(png, 1, bodyY - 3, 9, bodyY + 1, WHITE);
    fill(png, 2, bodyY - 2, 8, bodyY, SHADE);
    fill(png, 23, bodyY - 3, 31, bodyY + 1, WHITE);
    fill(png, 24, bodyY - 2, 30, bodyY, SHADE);
    for (let x = 1; x <= 9; x++) {
      set(png, x, bodyY - 4, OUT);
      set(png, x, bodyY + 2, OUT);
    }
    for (let x = 23; x <= 31; x++) {
      set(png, x, bodyY - 4, OUT);
      set(png, x, bodyY + 2, OUT);
    }
    set(png, 0, bodyY - 1, OUT);
    set(png, 31, bodyY - 1, OUT);
  } else if (pose === 'happy') {
    // Swept back / wink pose — left ear up a bit, right swept
    fill(png, 3, bodyY - 9, 8, bodyY - 1, WHITE);
    fill(png, 4, bodyY - 8, 7, bodyY - 2, SHADE);
    fill(png, 23, bodyY - 4, 29, bodyY + 6, WHITE);
    fill(png, 24, bodyY - 3, 28, bodyY + 5, SHADE);
    for (let y = bodyY - 9; y <= bodyY - 1; y++) {
      set(png, 2, y, OUT);
      set(png, 9, y, OUT);
    }
    for (let y = bodyY - 4; y <= bodyY + 6; y++) {
      set(png, 22, y, OUT);
      set(png, 30, y, OUT);
    }
  } else if (pose === 'sad') {
    // Low droopy ears
    fill(png, 2, bodyY - 1, 8, bodyY + 10, WHITE);
    fill(png, 3, bodyY, 7, bodyY + 9, SHADE);
    fill(png, 24, bodyY - 1, 30, bodyY + 10, WHITE);
    fill(png, 25, bodyY, 29, bodyY + 9, SHADE);
    for (let y = bodyY - 1; y <= bodyY + 10; y++) {
      set(png, 1, y, OUT);
      set(png, 9, y, OUT);
      set(png, 23, y, OUT);
      set(png, 31, y, OUT);
    }
    for (let x = 2; x <= 8; x++) set(png, x, bodyY + 11, OUT);
    for (let x = 24; x <= 30; x++) set(png, x, bodyY + 11, OUT);
  } else if (pose === 'walk1' || pose === 'walk2') {
    // Slightly swept back while walking
    const back = pose === 'walk2' ? 1 : 0;
    fill(png, 1, 9 + back, 7, 22 + back, WHITE);
    fill(png, 2, 10 + back, 6, 21 + back, SHADE);
    fill(png, 24, 8 + back, 30, 21 + back, WHITE);
    fill(png, 25, 9 + back, 29, 20 + back, SHADE);
    for (let y = 9; y <= 22; y++) {
      set(png, 0, y + back, OUT);
      set(png, 8, y + back, OUT);
      set(png, 23, y + back - 1, OUT);
      set(png, 31, y + back - 1, OUT);
    }
  } else {
    // IDLE — long floppy ears hanging down to the “floor”
    fill(png, 2, 10, 8, 24, WHITE);
    fill(png, 3, 11, 7, 23, SHADE);
    fill(png, 24, 10, 30, 24, WHITE);
    fill(png, 25, 11, 29, 23, SHADE);
    for (let y = 10; y <= 24; y++) {
      set(png, 1, y, OUT);
      set(png, 9, y, OUT);
      set(png, 23, y, OUT);
      set(png, 31, y, OUT);
    }
    for (let x = 2; x <= 8; x++) set(png, x, 25, OUT);
    for (let x = 24; x <= 30; x++) set(png, x, 25, OUT);
  }
}

function drawCinnamoroll(pose: CinPose) {
  const png = blank();
  const jump = pose === 'jump' ? -3 : 0;
  const bob = pose === 'walk2' ? 1 : 0;
  const bodyY = 15 + jump + bob;
  const foot = pose === 'walk1' ? -2 : pose === 'walk2' ? 2 : 0;

  drawEars(png, pose, bodyY);

  // Round white head/body
  oval(png, 16, bodyY, 7, 7, WHITE, OUT);
  // Soft underside shade
  fill(png, 12, bodyY + 2, 20, bodyY + 5, SHADE);

  // Eyes: vertical blue 1×2 (sheet style)
  if (pose === 'sad') {
    // Hurt — closed dashes
    fill(png, 11, bodyY - 1, 13, bodyY - 1, OUT);
    fill(png, 19, bodyY - 1, 21, bodyY - 1, OUT);
  } else if (pose === 'happy') {
    // Wink: left closed `>`, right open blue
    set(png, 13, bodyY - 2, OUT);
    set(png, 12, bodyY - 1, OUT);
    set(png, 13, bodyY, OUT);
    set(png, 19, bodyY - 2, BLUE);
    set(png, 19, bodyY - 1, BLUE);
    set(png, 20, bodyY - 2, BLUE);
    set(png, 20, bodyY - 1, OUT);
  } else {
    // Two vertical blue rectangles
    for (const ex of [12, 19]) {
      set(png, ex, bodyY - 2, BLUE);
      set(png, ex, bodyY - 1, BLUE);
    }
  }

  // Pink cheek squares under eyes
  set(png, 10, bodyY + 1, PINK);
  set(png, 11, bodyY + 1, PINK);
  set(png, 20, bodyY + 1, PINK);
  set(png, 21, bodyY + 1, PINK);

  // Mouth
  if (pose === 'sad') {
    fill(png, 15, bodyY + 2, 17, bodyY + 2, OUT); // flat dash
  } else if (pose === 'happy' || pose === 'idle') {
    set(png, 15, bodyY + 2, OUT);
    set(png, 16, bodyY + 3, OUT);
    set(png, 17, bodyY + 2, OUT);
  } else {
    set(png, 15, bodyY + 2, OUT);
    set(png, 16, bodyY + 3, OUT);
    set(png, 17, bodyY + 2, OUT);
  }

  // Cinnamon-roll tail (right side)
  set(png, 23, bodyY + 3, TAIL);
  set(png, 24, bodyY + 2, TAIL);
  set(png, 25, bodyY + 3, TAIL);
  set(png, 24, bodyY + 4, TAIL);
  set(png, 23, bodyY + 2, OUT);
  set(png, 25, bodyY + 4, OUT);

  // Stubby cream feet
  fill(png, 12 + foot, bodyY + 7, 14 + foot, bodyY + 8, CREAM);
  fill(png, 18 - foot, bodyY + 7, 20 - foot, bodyY + 8, CREAM);
  for (let x = 12 + foot; x <= 14 + foot; x++) set(png, x, bodyY + 9, OUT);
  for (let x = 18 - foot; x <= 20 - foot; x++) set(png, x, bodyY + 9, OUT);

  return png;
}

const POSES: CinPose[] = ['idle', 'walk1', 'walk2', 'happy', 'sad', 'jump'];
for (const pose of POSES) {
  save(drawCinnamoroll(pose), path.join(ROOT, 'npc/cinnamoroll', `${pose}.png`));
}

console.log('Regenerated Cinnamoroll sprites from sheet reference');
