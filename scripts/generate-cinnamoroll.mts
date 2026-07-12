/**
 * Cinnamoroll NPC frames matching the Sanrio-style sprite sheet reference:
 * white puppy, blue eyes, pink blush, long floppy ears (hang / fly / droop),
 * curly cinnamon-roll tail. Plus Cafe Cinnamon pet-clothes accessories he sells.
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');

const ROOT = path.resolve('public/assets');

type RGBA = [number, number, number, number];

const OUT: RGBA = [30, 30, 40, 255];
const W: RGBA = [255, 255, 255, 255];
const SHADE: RGBA = [230, 235, 245, 255];
const BLUE: RGBA = [90, 170, 230, 255];
const PINK: RGBA = [255, 170, 190, 255];
const CREAM: RGBA = [255, 230, 200, 255];
const TAIL: RGBA = [255, 210, 180, 255];
const APRON: RGBA = [240, 220, 200, 255];
const APRON_TRIM: RGBA = [210, 160, 130, 255];
const BOW: RGBA = [255, 150, 180, 255];
const CLOUD: RGBA = [200, 230, 255, 255];
const SCARF: RGBA = [255, 200, 170, 255];

function blank(w = 32, h = 32) {
  const png = new PNG({ width: w, height: h });
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

function circle(png: InstanceType<typeof PNG>, cx: number, cy: number, r: number, fillC: RGBA, outline?: RGBA) {
  for (let y = -r - 1; y <= r + 1; y++) {
    for (let x = -r - 1; x <= r + 1; x++) {
      const d = Math.hypot(x, y);
      if (d <= r) set(png, cx + x, cy + y, fillC);
      else if (outline && d <= r + 0.85) set(png, cx + x, cy + y, outline);
    }
  }
}

function oval(png: InstanceType<typeof PNG>, cx: number, cy: number, a: number, b: number, fillC: RGBA, outline?: RGBA) {
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

/** Ears: hang (idle), lift (walk), wings (jump/happy), droop/up (sad). */
function drawEars(png: InstanceType<typeof PNG>, pose: CinPose, bodyY: number) {
  if (pose === 'jump') {
    // Horizontal wing-ears
    fill(png, 1, bodyY - 4, 8, bodyY + 1, W);
    fill(png, 23, bodyY - 4, 30, bodyY + 1, W);
    for (let x = 1; x <= 8; x++) {
      set(png, x, bodyY - 5, OUT);
      set(png, x, bodyY + 2, OUT);
    }
    for (let x = 23; x <= 30; x++) {
      set(png, x, bodyY - 5, OUT);
      set(png, x, bodyY + 2, OUT);
    }
    set(png, 0, bodyY - 2, OUT);
    set(png, 31, bodyY - 2, OUT);
  } else if (pose === 'happy') {
    // One ear up, one droopy (wink pose)
    fill(png, 3, bodyY - 10, 8, bodyY - 1, W);
    fill(png, 23, bodyY - 2, 29, bodyY + 8, W);
    for (let y = bodyY - 10; y <= bodyY - 1; y++) {
      set(png, 2, y, OUT);
      set(png, 9, y, OUT);
    }
    for (let y = bodyY - 2; y <= bodyY + 8; y++) {
      set(png, 22, y, OUT);
      set(png, 30, y, OUT);
    }
  } else if (pose === 'sad') {
    // Ears angled up/worried
    fill(png, 4, bodyY - 11, 9, bodyY - 2, W);
    fill(png, 22, bodyY - 11, 27, bodyY - 2, W);
    for (let y = bodyY - 11; y <= bodyY - 2; y++) {
      set(png, 3, y, OUT);
      set(png, 10, y, OUT);
      set(png, 21, y, OUT);
      set(png, 28, y, OUT);
    }
  } else if (pose === 'walk1' || pose === 'walk2') {
    // Slightly lifted / breeze
    const lift = pose === 'walk2' ? -1 : 0;
    fill(png, 2, 8 + lift, 8, 20 + lift, W);
    fill(png, 23, 7 + lift, 29, 19 + lift, W);
    for (let y = 8; y <= 20; y++) {
      set(png, 1, y + lift, OUT);
      set(png, 9, y + lift, OUT);
      set(png, 22, y + lift - 1, OUT);
      set(png, 30, y + lift - 1, OUT);
    }
  } else {
    // Idle — long floppy ears hanging down
    fill(png, 2, 10, 8, 22, W);
    fill(png, 23, 10, 29, 22, W);
    fill(png, 3, 11, 7, 21, SHADE);
    fill(png, 24, 11, 28, 21, SHADE);
    for (let y = 10; y <= 22; y++) {
      set(png, 1, y, OUT);
      set(png, 9, y, OUT);
      set(png, 22, y, OUT);
      set(png, 30, y, OUT);
    }
    for (let x = 2; x <= 8; x++) set(png, x, 23, OUT);
    for (let x = 23; x <= 29; x++) set(png, x, 23, OUT);
  }
}

function drawCinnamoroll(pose: CinPose) {
  const png = blank();
  const jump = pose === 'jump' ? -3 : 0;
  const bob = pose === 'walk2' ? 1 : 0;
  const bodyY = 16 + jump + bob;
  const foot = pose === 'walk1' ? -2 : pose === 'walk2' ? 2 : 0;

  drawEars(png, pose, bodyY);

  // Round body
  oval(png, 16, bodyY, 8, 7, W, OUT);
  // Soft underside shade
  fill(png, 12, bodyY + 2, 20, bodyY + 5, SHADE);

  // Blue eyes (vertical) + pink blush
  if (pose === 'sad') {
    set(png, 12, bodyY - 1, OUT);
    set(png, 13, bodyY, OUT);
    set(png, 19, bodyY - 1, OUT);
    set(png, 18, bodyY, OUT);
  } else if (pose === 'happy') {
    // Wink: left closed, right open blue
    set(png, 11, bodyY - 1, OUT);
    set(png, 12, bodyY - 1, OUT);
    set(png, 13, bodyY - 1, OUT);
    set(png, 18, bodyY - 2, BLUE);
    set(png, 19, bodyY - 2, BLUE);
    set(png, 18, bodyY - 1, OUT);
    set(png, 19, bodyY - 1, OUT);
  } else {
    for (const ex of [12, 19]) {
      set(png, ex, bodyY - 2, BLUE);
      set(png, ex + 1, bodyY - 2, BLUE);
      set(png, ex, bodyY - 1, OUT);
      set(png, ex + 1, bodyY - 1, OUT);
    }
  }
  // Blush circles
  set(png, 10, bodyY + 1, PINK);
  set(png, 11, bodyY + 1, PINK);
  set(png, 20, bodyY + 1, PINK);
  set(png, 21, bodyY + 1, PINK);

  // Mouth
  if (pose === 'sad') {
    set(png, 15, bodyY + 3, OUT);
    set(png, 16, bodyY + 2, OUT);
    set(png, 17, bodyY + 3, OUT);
  } else if (pose === 'happy') {
    set(png, 15, bodyY + 2, OUT);
    set(png, 16, bodyY + 3, OUT);
    set(png, 17, bodyY + 2, OUT);
    set(png, 14, bodyY + 2, OUT);
    set(png, 18, bodyY + 2, OUT);
  } else {
    set(png, 15, bodyY + 2, OUT);
    set(png, 16, bodyY + 3, OUT);
    set(png, 17, bodyY + 2, OUT);
  }

  // Curly cinnamon-roll tail
  set(png, 24, bodyY + 3, TAIL);
  set(png, 25, bodyY + 2, TAIL);
  set(png, 26, bodyY + 3, TAIL);
  set(png, 25, bodyY + 4, TAIL);
  set(png, 24, bodyY + 2, OUT);
  set(png, 26, bodyY + 4, OUT);

  // Stubby feet
  fill(png, 11 + foot, bodyY + 7, 14 + foot, bodyY + 8, CREAM);
  fill(png, 17 - foot, bodyY + 7, 20 - foot, bodyY + 8, CREAM);
  for (let x = 11 + foot; x <= 14 + foot; x++) set(png, x, bodyY + 9, OUT);
  for (let x = 17 - foot; x <= 20 - foot; x++) set(png, x, bodyY + 9, OUT);

  return png;
}

function drawCloudBow() {
  const png = blank();
  // Soft pink bow on head-left
  fill(png, 6, 4, 10, 7, BOW);
  fill(png, 11, 5, 13, 6, BOW);
  fill(png, 14, 4, 18, 7, BOW);
  set(png, 12, 5, W);
  set(png, 12, 6, W);
  for (let x = 6; x <= 10; x++) {
    set(png, x, 3, OUT);
    set(png, x, 8, OUT);
  }
  for (let x = 14; x <= 18; x++) {
    set(png, x, 3, OUT);
    set(png, x, 8, OUT);
  }
  return png;
}

function drawEarCloud() {
  const png = blank();
  // Tiny cloud puff on head-right
  circle(png, 24, 5, 3, CLOUD, OUT);
  circle(png, 21, 6, 2, CLOUD, OUT);
  circle(png, 27, 6, 2, CLOUD, OUT);
  set(png, 24, 4, W);
  return png;
}

function drawCafeApron() {
  const png = blank();
  const bodyCy = 20;
  // Apron bib + skirt over pet torso
  fill(png, 11, bodyCy - 4, 21, bodyCy + 4, APRON);
  for (let x = 11; x <= 21; x++) {
    set(png, x, bodyCy - 5, APRON_TRIM);
    set(png, x, bodyCy + 5, OUT);
  }
  // Neck straps
  set(png, 12, bodyCy - 6, APRON_TRIM);
  set(png, 20, bodyCy - 6, APRON_TRIM);
  // Pocket
  fill(png, 14, bodyCy, 18, bodyCy + 2, APRON_TRIM);
  // Tiny cinnamon swirl mark
  set(png, 16, bodyCy - 2, TAIL);
  set(png, 17, bodyCy - 1, TAIL);
  return png;
}

function drawCinnamonScarf() {
  const png = blank();
  // Cream/peach swirl scarf around neck
  fill(png, 9, 14, 23, 17, SCARF);
  for (let x = 9; x <= 23; x++) {
    set(png, x, 13, OUT);
    set(png, x, 18, OUT);
  }
  // Trailing end
  fill(png, 22, 17, 26, 22, SCARF);
  for (let y = 17; y <= 22; y++) set(png, 27, y, OUT);
  set(png, 24, 19, TAIL);
  set(png, 25, 20, TAIL);
  return png;
}

const POSES: CinPose[] = ['idle', 'walk1', 'walk2', 'happy', 'sad', 'jump'];
for (const pose of POSES) {
  save(drawCinnamoroll(pose), path.join(ROOT, 'npc/cinnamoroll', `${pose}.png`));
}

save(drawCloudBow(), path.join(ROOT, 'accessories/cloud-bow.png'));
save(drawEarCloud(), path.join(ROOT, 'accessories/ear-cloud.png'));
save(drawCafeApron(), path.join(ROOT, 'accessories/cafe-apron.png'));
save(drawCinnamonScarf(), path.join(ROOT, 'accessories/cinnamon-scarf.png'));

console.log('Generated Cinnamoroll NPC frames + Cafe Cinnamon clothes');
