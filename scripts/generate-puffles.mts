/**
 * Club Penguin–style Puffle pets (10 colors) + puffle-only dig-list clothes.
 *
 * Preferred pet sprite pipeline (Grok Imagine → 32×32):
 *   npx tsx scripts/imagine-to-puffles.mts
 *   plates: scripts/reference/puffle/{blue,orange,green,black}.png
 *
 * This script is the procedural fallback and still owns dig-list clothes.
 */
import path from 'path';
import { createRequire } from 'module';
import { saveSprite } from './lib/save-sprite.mjs';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');

const ROOT = path.resolve('public/assets');

type RGBA = [number, number, number, number];

const OUT: RGBA = [20, 20, 28, 255];
const W: RGBA = [255, 255, 255, 255];

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

function save(png: InstanceType<typeof PNG>, file: string, repairOutline = false) {
  saveSprite(png, file, { repairOutline, outline: OUT });
}

const COLORS: Record<string, RGBA> = {
  blue: [80, 170, 255, 255],
  pink: [255, 130, 190, 255],
  green: [70, 210, 90, 255],
  black: [50, 50, 58, 255],
  purple: [170, 90, 230, 255],
  red: [230, 55, 55, 255],
  yellow: [255, 215, 50, 255],
  white: [248, 248, 252, 255],
  orange: [255, 140, 40, 255],
  brown: [150, 95, 50, 255],
};

type Pose = 'neutral1' | 'neutral2' | 'walk1' | 'walk2' | 'sad' | 'happy' | 'sleep' | 'jump';
type Style = 'default' | 'black' | 'orange' | 'green' | 'brown';

function inkFor(color: RGBA): RGBA {
  const luma = 0.299 * color[0] + 0.587 * color[1] + 0.114 * color[2];
  return luma < 110 ? [235, 235, 245, 255] : OUT;
}

function drawPuffle(color: RGBA, pose: Pose, style: Style) {
  const png = blank();
  const yOff = pose === 'jump' ? -3 : pose === 'walk2' ? 1 : 0;
  const cx = 16;
  const cy = 18 + yOff;
  const INK = inkFor(color);
  const RX = 10;
  const RY = 9;
  const phase = pose === 'walk1' ? 0.7 : pose === 'walk2' ? -0.7 : pose === 'neutral2' ? 0.35 : 0;

  // Fuzzy round body — spikes on crown/sides, smoother belly
  for (let y = -13; y <= 11; y++) {
    for (let x = -13; x <= 13; x++) {
      const a = Math.atan2(y / RY, x / RX);
      const amp = 0.32 * Math.max(0, (-Math.sin(a) + 0.35) / 1.35);
      const wob = Math.max(amp * Math.sin(a * 8 + phase + 0.6), -0.06);
      const n = Math.hypot(x / RX, y / RY);
      if (n <= 0.86 + wob) set(png, cx + x, cy + y, color);
      else if (n <= 1.0 + wob) set(png, cx + x, cy + y, OUT);
    }
  }

  // Orange: extra curly tuft on top
  if (style === 'orange') {
    circle(png, cx - 2, cy - 11, 2, color, OUT);
    circle(png, cx + 1, cy - 12, 2, color, OUT);
    circle(png, cx + 3, cy - 10, 2, color, OUT);
  }

  const eyeY = cy - 1;
  const px = pose === 'walk1' ? -1 : pose === 'walk2' ? 1 : 0;
  const eyesClosed = pose === 'sleep' || (style === 'green' && (pose === 'happy' || pose === 'neutral1'));

  if (eyesClosed) {
    // Closed lids / green’s toothy-grin squint
    for (const s of [-1, 1] as const) {
      set(png, cx + s * 5, eyeY, INK);
      set(png, cx + s * 4, eyeY + 1, INK);
      set(png, cx + s * 3, eyeY + 1, INK);
      set(png, cx + s * 2, eyeY, INK);
    }
  } else {
    // Huge joined white eyes
    for (const s of [-1, 1] as const) {
      for (let y = -4; y <= 4; y++) {
        for (let x = -3; x <= 3; x++) {
          if (Math.hypot(x / 3.1, y / 2.9) <= 0.99) set(png, cx + s * 3 + x, eyeY + y, W);
        }
      }
    }
    for (const s of [-1, 1] as const) {
      for (let y = -4; y <= 4; y++) {
        for (let x = -3; x <= 3; x++) {
          const n = Math.hypot(x / 3.1, y / 2.9);
          if (n > 0.99 && n <= 1.28) {
            const other = Math.hypot((cx + s * 3 + x - (cx - s * 3)) / 3.1, (eyeY + y - eyeY) / 2.9);
            if (other > 0.99) set(png, cx + s * 3 + x, eyeY + y, OUT);
          }
        }
      }
    }
    for (const s of [-1, 1] as const) {
      for (let y = -4; y <= 4; y++) {
        for (let x = -3; x <= 3; x++) {
          if (Math.hypot(x / 3.1, y / 2.9) <= 0.99) set(png, cx + s * 3 + x, eyeY + y, W);
        }
      }
    }
    const pdy = pose === 'sad' || style === 'black' ? 1 : 0;
    for (const s of [-1, 1] as const) {
      fill(png, cx + s * 2 - 1 + px, eyeY + pdy, cx + s * 2 + px, eyeY + pdy + 1, OUT);
    }
    if (pose === 'sad' || style === 'black') {
      for (const s of [-1, 1] as const) {
        set(png, cx + s * 6, eyeY - 6, INK);
        set(png, cx + s * 5, eyeY - 5, INK);
        set(png, cx + s * 4, eyeY - 5, INK);
      }
    }
  }

  const my = cy + 4;
  if (pose === 'sad' || (style === 'black' && pose !== 'happy' && pose !== 'sleep')) {
    // Flat / frown
    set(png, cx - 3, my + 2, INK);
    set(png, cx - 2, my + 1, INK);
    fill(png, cx - 1, my, cx + 1, my, INK);
    set(png, cx + 2, my + 1, INK);
    set(png, cx + 3, my + 2, INK);
  } else if (pose === 'sleep') {
    // soft line
    fill(png, cx - 2, my + 1, cx + 2, my + 1, INK);
  } else if (style === 'orange') {
    // Wide smile + buck teeth
    const wide = 4;
    set(png, cx - wide, my, INK);
    set(png, cx - wide + 1, my + 1, INK);
    fill(png, cx - wide + 2, my + 2, cx + wide - 2, my + 2, INK);
    set(png, cx + wide - 1, my + 1, INK);
    set(png, cx + wide, my, INK);
    set(png, cx - 1, my + 3, W);
    set(png, cx, my + 3, W);
    set(png, cx + 1, my + 3, W);
    set(png, cx - 1, my + 4, OUT);
    set(png, cx + 1, my + 4, OUT);
  } else if (style === 'green' && (pose === 'happy' || pose === 'neutral1')) {
    // Big open toothy grin
    fill(png, cx - 4, my, cx + 4, my + 2, INK);
    fill(png, cx - 3, my + 1, cx + 3, my + 1, W);
    set(png, cx - 2, my + 1, OUT);
    set(png, cx, my + 1, OUT);
    set(png, cx + 2, my + 1, OUT);
  } else {
    const wide = pose === 'happy' ? 4 : 3;
    set(png, cx - wide, my, INK);
    set(png, cx - wide + 1, my + 1, INK);
    fill(png, cx - wide + 2, my + 2, cx + wide - 2, my + 2, INK);
    set(png, cx + wide - 1, my + 1, INK);
    set(png, cx + wide, my, INK);
  }

  return png;
}

function styleFor(name: string): Style {
  if (name === 'black') return 'black';
  if (name === 'orange') return 'orange';
  if (name === 'green') return 'green';
  if (name === 'brown') return 'brown';
  return 'default';
}

const POSES: Pose[] = ['neutral1', 'neutral2', 'walk1', 'walk2', 'sad', 'happy', 'sleep', 'jump'];
for (const [name, color] of Object.entries(COLORS)) {
  const dir = path.join(ROOT, `pet/puffle-${name}`);
  for (const pose of POSES) {
    save(drawPuffle(color, pose, styleFor(name)), path.join(dir, `${pose}.png`), true);
  }
}

// --- Puffle-only dig-list clothes (32×32 overlays) ---
const RED: RGBA = [220, 50, 50, 255];
const BLUE: RGBA = [70, 140, 230, 255];
const GREEN: RGBA = [50, 190, 80, 255];
const PINK: RGBA = [255, 130, 190, 255];
const PURPLE: RGBA = [170, 90, 230, 255];
const YELLOW: RGBA = [255, 210, 60, 255];
const CREAM: RGBA = [255, 240, 210, 255];
const BROWN: RGBA = [120, 70, 40, 255];
const GOLD: RGBA = [230, 180, 50, 255];

function drawPuffleTee() {
  const png = blank();
  // Mini tee over lower body
  fill(png, 9, 20, 23, 27, BLUE);
  fill(png, 7, 20, 9, 23, BLUE);
  fill(png, 23, 20, 25, 23, BLUE);
  for (let x = 9; x <= 23; x++) set(png, x, 19, OUT);
  for (let x = 9; x <= 23; x++) set(png, x, 28, OUT);
  // Tiny puffle face on tee
  circle(png, 16, 23, 2, W, OUT);
  set(png, 15, 23, OUT);
  set(png, 17, 23, OUT);
  return png;
}

function drawPuffleCape() {
  const png = blank();
  // Cape draping behind/sides
  fill(png, 6, 14, 10, 28, RED);
  fill(png, 22, 14, 26, 28, RED);
  fill(png, 8, 12, 24, 16, RED);
  for (let y = 14; y <= 28; y++) {
    set(png, 5, y, OUT);
    set(png, 27, y, OUT);
  }
  for (let x = 8; x <= 24; x++) set(png, x, 11, OUT);
  set(png, 16, 12, GOLD);
  return png;
}

function drawFeatherBoa() {
  const png = blank();
  const cols: RGBA[] = [PINK, PURPLE, YELLOW, BLUE, GREEN];
  for (let i = 0; i < 10; i++) {
    const x = 6 + i * 2;
    const c = cols[i % cols.length]!;
    circle(png, x, 18 + (i % 2), 2, c, OUT);
  }
  return png;
}

function drawPropellerHat() {
  const png = blank();
  // Red propeller beanie
  fill(png, 10, 4, 22, 10, RED);
  for (let x = 10; x <= 22; x++) set(png, x, 3, OUT);
  for (let x = 10; x <= 22; x++) set(png, x, 11, OUT);
  // Propeller
  fill(png, 8, 2, 14, 3, YELLOW);
  fill(png, 18, 2, 24, 3, YELLOW);
  set(png, 16, 1, OUT);
  set(png, 16, 2, GOLD);
  set(png, 16, 3, GOLD);
  return png;
}

function drawNewspaperHat() {
  const png = blank();
  fill(png, 8, 5, 24, 11, CREAM);
  for (let x = 8; x <= 24; x++) {
    set(png, x, 4, OUT);
    set(png, x, 12, OUT);
  }
  // Print lines
  fill(png, 10, 7, 22, 7, OUT);
  fill(png, 10, 9, 20, 9, OUT);
  set(png, 12, 6, BLUE);
  return png;
}

function drawSnorkel() {
  const png = blank();
  // Mask + tube (pink dig find)
  fill(png, 10, 12, 22, 16, GREEN);
  for (let x = 10; x <= 22; x++) {
    set(png, x, 11, OUT);
    set(png, x, 17, OUT);
  }
  fill(png, 12, 13, 14, 15, [120, 220, 255, 255]);
  fill(png, 18, 13, 20, 15, [120, 220, 255, 255]);
  // Tube up left
  fill(png, 8, 4, 10, 14, GREEN);
  for (let y = 4; y <= 14; y++) {
    set(png, 7, y, OUT);
    set(png, 11, y, OUT);
  }
  circle(png, 9, 3, 2, GREEN, OUT);
  return png;
}

function drawGlamGlasses() {
  const png = blank();
  // Star glam glasses
  for (const cx of [11, 21]) {
    fill(png, cx - 3, 12, cx + 3, 16, PINK);
    set(png, cx, 11, YELLOW);
    set(png, cx - 2, 12, YELLOW);
    set(png, cx + 2, 12, YELLOW);
    set(png, cx, 17, YELLOW);
    fill(png, cx - 2, 13, cx + 2, 15, [180, 240, 255, 255]);
  }
  fill(png, 14, 14, 18, 14, PINK);
  return png;
}

function drawBrownGoggles() {
  const png = blank();
  // Red-rimmed goggles from the group reference
  for (const cx of [11, 21]) {
    for (let y = -3; y <= 3; y++) {
      for (let x = -4; x <= 4; x++) {
        const d = Math.hypot(x / 4, y / 3);
        if (d <= 0.85) set(png, cx + x, 14 + y, [160, 220, 255, 255]);
        else if (d <= 1.15) set(png, cx + x, 14 + y, RED);
      }
    }
  }
  fill(png, 14, 14, 18, 15, RED);
  return png;
}

function drawBigSunglasses() {
  const png = blank();
  fill(png, 7, 12, 15, 17, OUT);
  fill(png, 17, 12, 25, 17, OUT);
  fill(png, 15, 14, 17, 15, OUT);
  fill(png, 9, 13, 13, 16, [40, 40, 50, 255]);
  fill(png, 19, 13, 23, 16, [40, 40, 50, 255]);
  set(png, 10, 13, W);
  set(png, 20, 13, W);
  return png;
}

save(drawPuffleTee(), path.join(ROOT, 'accessories/puffle-tee.png'));
save(drawPuffleCape(), path.join(ROOT, 'accessories/puffle-cape.png'));
save(drawFeatherBoa(), path.join(ROOT, 'accessories/feather-boa.png'));
save(drawPropellerHat(), path.join(ROOT, 'accessories/propeller-hat.png'));
save(drawNewspaperHat(), path.join(ROOT, 'accessories/newspaper-hat.png'));
save(drawSnorkel(), path.join(ROOT, 'accessories/snorkel.png'));
save(drawGlamGlasses(), path.join(ROOT, 'accessories/glam-glasses.png'));
save(drawBrownGoggles(), path.join(ROOT, 'accessories/brown-goggles.png'));
save(drawBigSunglasses(), path.join(ROOT, 'accessories/big-sunglasses.png'));

console.log('Generated 10 puffle species + 9 puffle-only dig clothes');
