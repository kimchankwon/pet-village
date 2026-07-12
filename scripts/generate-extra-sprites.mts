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

function darken(c: [number, number, number, number], f = 0.72): [number, number, number, number] {
  return [Math.round(c[0] * f), Math.round(c[1] * f), Math.round(c[2] * f), 255];
}

/**
 * Club Penguin puffle, per the official art: a wide squat ball whose top
 * and sides are chunky fur spikes (smoother underneath), no limbs, huge
 * joined white eyes and a big smile.
 */
function drawPuffle(color: [number, number, number, number], pose: PufflePose, angry = false) {
  const png = blank(32, 32);
  const yOff = pose === 'jump' ? -3 : pose === 'walk2' ? 1 : 0;
  const cx = 16;
  const cy = 18 + yOff;
  void darken;
  // Face lines must stay visible on dark fur
  const luma = 0.299 * color[0] + 0.587 * color[1] + 0.114 * color[2];
  const INK: [number, number, number, number] = luma < 110 ? [235, 235, 245, 255] : OUT;

  // Fur silhouette: chunky spikes on the crown and sides, gentle bumps on
  // the belly. The spike phase shifts per frame so the fluff wiggles.
  const RX = 10;
  const RY = 9;
  const phase = pose === 'walk1' ? 0.7 : pose === 'walk2' ? -0.7 : pose === 'neutral2' ? 0.35 : 0;
  for (let y = -13; y <= 11; y++) {
    for (let x = -13; x <= 13; x++) {
      const a = Math.atan2(y / RY, x / RX);
      // -sin(a) is 1 at the crown, 0 at the equator, negative underneath:
      // big spikes up top, calm curve below. The +0.6 keeps a spike at the
      // very top instead of a dip.
      // Fur only on the upper part (not the sides); the belly and flanks
      // stay a clean round curve. Dips are clamped so no frame gets a
      // notch carved out of the crown.
      const amp = 0.24 * Math.max(0, -Math.sin(a) - 0.25) / 0.75;
      const wob = Math.max(amp * Math.sin(a * 9 + phase + 0.6), -0.05);
      const n = Math.hypot(x / RX, y / RY);
      if (n <= 0.86 + wob) set(png, cx + x, cy + y, color);
      else if (n <= 1.0 + wob) set(png, cx + x, cy + y, OUT);
    }
  }

  const eyeY = cy - 1;
  const px = pose === 'walk1' ? -1 : pose === 'walk2' ? 1 : 0;
  if (pose === 'sleep') {
    // Closed curved lids, no mask
    for (const s of [-1, 1]) {
      set(png, cx + s * 5, eyeY, INK);
      set(png, cx + s * 4, eyeY + 1, INK);
      set(png, cx + s * 3, eyeY + 1, INK);
      set(png, cx + s * 2, eyeY, INK);
    }
  } else {
    // Huge joined white eyes — two ovals touching in the middle (CP mask)
    for (const s of [-1, 1]) {
      for (let y = -4; y <= 4; y++) {
        for (let x = -3; x <= 3; x++) {
          const n = Math.hypot(x / 2.6, y / 2.9);
          const exx = cx + s * 3 + x;
          const eyy = eyeY + y;
          if (n <= 0.99) set(png, exx, eyy, W);
          else if (n <= 1.28) {
            // outline only where not overlapping the other eye's white
            const other = Math.hypot((exx - (cx - s * 3)) / 2.6, (eyy - eyeY) / 2.9);
            if (other > 0.99) set(png, exx, eyy, OUT);
          }
        }
      }
    }
    // Re-fill both whites so no outline crosses the shared middle
    for (const s of [-1, 1]) {
      for (let y = -4; y <= 4; y++) {
        for (let x = -3; x <= 3; x++) {
          if (Math.hypot(x / 2.6, y / 2.9) <= 0.99) set(png, cx + s * 3 + x, eyeY + y, W);
        }
      }
    }
    // Pupils sit low and toward the middle
    const pdy = pose === 'sad' ? 1 : 0;
    for (const s of [-1, 1]) {
      fill(png, cx + s * 2 - 1 + px, eyeY + pdy, cx + s * 2 + px, eyeY + pdy + 1, OUT);
    }
    // Brows: sad slants outward, the black puffle scowls
    if (pose === 'sad') {
      for (const s of [-1, 1]) {
        set(png, cx + s * 7, eyeY - 5, INK);
        set(png, cx + s * 6, eyeY - 4, INK);
      }
    } else if (angry) {
      for (const s of [-1, 1]) {
        set(png, cx + s * 6, eyeY - 6, INK);
        set(png, cx + s * 5, eyeY - 5, INK);
        set(png, cx + s * 4, eyeY - 5, INK);
      }
    }
  }

  // Big wide smile (flips on sad)
  const my = cy + 4;
  if (pose === 'sad') {
    set(png, cx - 3, my + 2, INK);
    set(png, cx - 2, my + 1, INK);
    fill(png, cx - 1, my, cx + 1, my, INK);
    set(png, cx + 2, my + 1, INK);
    set(png, cx + 3, my + 2, INK);
  } else if (pose !== 'sleep') {
    const wide = pose === 'happy' ? 4 : 3;
    set(png, cx - wide, my, INK);
    set(png, cx - wide + 1, my + 1, INK);
    fill(png, cx - wide + 2, my + 2, cx + wide - 2, my + 2, INK);
    set(png, cx + wide - 1, my + 1, INK);
    set(png, cx + wide, my, INK);
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
