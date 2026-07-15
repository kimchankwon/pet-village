/**
 * Pixel art for Bongbongee (SEVENTEEN CARAT mascot) + equippable accessories.
 * Reference: official plush — pink head cap, white face, "17" cheeks,
 * aqua Carat diamond, mint pom, light-blue "NEW" tee, deco band.
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { saveSprite } from './lib/save-sprite.mjs';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');

const ROOT = path.resolve('public/assets');
const W = 32;
const H = 32;

type RGBA = [number, number, number, number];

const OUT: RGBA = [0, 0, 0, 255];
const WHITE: RGBA = [255, 255, 255, 255];
const PINK: RGBA = [255, 176, 196, 255];
const PINK_DEEP: RGBA = [245, 150, 175, 255];
const CHEEK: RGBA = [255, 170, 190, 255];
const BLACK: RGBA = [24, 24, 28, 255];
const AQUA: RGBA = [120, 220, 220, 255];
const AQUA_DEEP: RGBA = [70, 180, 185, 255];
const MINT: RGBA = [150, 230, 200, 255];
const MINT_DEEP: RGBA = [100, 200, 170, 255];
const TEE: RGBA = [150, 205, 235, 255];
const TEE_DEEP: RGBA = [110, 175, 215, 255];
const BAND: RGBA = [130, 200, 235, 255];

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

/** Soft oval (a=x radius, b=y radius). */
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
      else if (outline && n <= 1.18) set(png, cx + x, cy + y, outline);
    }
  }
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

type Pose = 'neutral1' | 'neutral2' | 'walk1' | 'walk2' | 'sad' | 'happy' | 'sleep' | 'jump';

/** Base Bongbongee — no accessories (those layer on top). */
function drawBong(pose: Pose) {
  const png = blank();
  const jump = pose === 'jump' ? -3 : 0;
  const bob = pose === 'neutral2' || pose === 'walk2' ? 1 : 0;
  const foot = pose === 'walk1' ? -1 : pose === 'walk2' ? 1 : 0;
  const headCy = 11 + jump + bob;
  const bodyCy = 24 + jump + bob;

  // Head (horizontal oval / mochi)
  oval(png, 16, headCy, 11, 9, WHITE, OUT);

  // Pink cap on top half of head
  for (let y = headCy - 9; y <= headCy - 1; y++) {
    for (let x = 5; x <= 27; x++) {
      const i = (W * y + x) << 2;
      if (png.data[i + 3] < 200) continue;
      const n = ((x - 16) * (x - 16)) / 121 + ((y - headCy) * (y - headCy)) / 81;
      if (n > 1) continue;
      // Cap seam roughly at mid-head; leave face white below.
      if (y <= headCy - 2) set(png, x, y, y === headCy - 2 ? PINK_DEEP : PINK);
    }
  }
  // Soft crown bump
  fill(png, 12, headCy - 10, 20, headCy - 9, PINK);
  // Sky-blue pom sitting on the cap's top-right (per the pixel chart)
  const POM: RGBA = [128, 190, 235, 255];
  const POM_DEEP: RGBA = [92, 156, 210, 255];
  circle(png, 22, headCy - 8, 3, POM, OUT);
  set(png, 21, headCy - 9, WHITE);
  set(png, 23, headCy - 7, POM_DEEP);
  set(png, 22, headCy - 6, POM_DEEP);

  // Eyes — big rounded blacks with a 2x2 glint + spare sparkle (chart style)
  const eyeY = headCy + 1 + (pose === 'sad' ? 1 : 0);
  const eyeOpen = pose !== 'sleep';
  if (eyeOpen) {
    for (const ex of [11, 21]) {
      fill(png, ex - 2, eyeY - 2, ex + 2, eyeY + 2, BLACK);
      // round the corners
      set(png, ex - 2, eyeY - 2, WHITE);
      set(png, ex + 2, eyeY - 2, WHITE);
      set(png, ex - 2, eyeY + 2, WHITE);
      set(png, ex + 2, eyeY + 2, WHITE);
      // 2x2 glint top-left + small glint bottom-right
      fill(png, ex - 1, eyeY - 1, ex, eyeY, WHITE);
      set(png, ex + 1, eyeY + 1, WHITE);
    }
  } else {
    // Sleep: closed curves
    for (const ex of [11, 21]) {
      set(png, ex - 1, eyeY, OUT);
      set(png, ex, eyeY + 1, OUT);
      set(png, ex + 1, eyeY, OUT);
    }
  }

  // Small ω mouth (chart) — inverts on sad
  const mouthY = eyeY + 4;
  if (pose === 'sad') {
    set(png, 15, mouthY + 1, BLACK);
    set(png, 16, mouthY, BLACK);
    set(png, 17, mouthY + 1, BLACK);
  } else {
    set(png, 14, mouthY, BLACK);
    set(png, 15, mouthY + 1, BLACK);
    set(png, 16, mouthY, BLACK);
    set(png, 17, mouthY + 1, BLACK);
    set(png, 18, mouthY, BLACK);
  }

  // “17” cheek marks (slanted pink)
  for (const side of [-1, 1] as const) {
    const cx = 16 + side * 7;
    const cy = mouthY + 1;
    // stylized 1
    set(png, cx - 1, cy - 1, CHEEK);
    set(png, cx - 1, cy, CHEEK);
    set(png, cx - 1, cy + 1, CHEEK);
    // stylized 7
    set(png, cx + 1, cy - 1, CHEEK);
    set(png, cx + 2, cy - 1, CHEEK);
    set(png, cx + 2, cy, CHEEK);
    set(png, cx + 1, cy + 1, CHEEK);
  }

  // Stubby white body
  oval(png, 16, bodyCy, 7, 5, WHITE, OUT);
  // Arms
  circle(png, 8, bodyCy - 1, 2, WHITE, OUT);
  circle(png, 24, bodyCy - 1, 2, WHITE, OUT);
  // Feet
  circle(png, 13 + foot, bodyCy + 4, 2, WHITE, OUT);
  circle(png, 19 - foot, bodyCy + 4, 2, WHITE, OUT);

  return png;
}

function drawMintPom() {
  const png = blank();
  // Top-left of head (matches base head at cy≈11)
  circle(png, 8, 4, 3, MINT, OUT);
  set(png, 7, 3, MINT_DEEP);
  set(png, 9, 4, WHITE);
  set(png, 8, 2, MINT_DEEP);
  return png;
}

function drawCaratDiamond() {
  const png = blank();
  // Top-right gem on pink cap
  const cx = 24;
  const cy = 4;
  // Diamond silhouette
  const pts: [number, number][] = [
    [cx, cy - 3],
    [cx + 3, cy],
    [cx, cy + 3],
    [cx - 3, cy],
  ];
  for (let y = cy - 3; y <= cy + 3; y++) {
    for (let x = cx - 3; x <= cx + 3; x++) {
      const dx = Math.abs(x - cx);
      const dy = Math.abs(y - cy);
      if (dx + dy <= 3) set(png, x, y, AQUA);
    }
  }
  // Facet lines
  for (let i = -3; i <= 3; i++) {
    set(png, cx + i, cy - (3 - Math.abs(i)), OUT);
    set(png, cx + i, cy + (3 - Math.abs(i)), OUT);
  }
  set(png, cx, cy - 3, OUT);
  set(png, cx, cy + 3, OUT);
  set(png, cx - 3, cy, OUT);
  set(png, cx + 3, cy, OUT);
  set(png, cx, cy, AQUA_DEEP);
  set(png, cx - 1, cy - 1, WHITE);
  void pts;
  return png;
}

function drawBlueTee() {
  const png = blank();
  const bodyCy = 24;
  // Shirt torso over body oval
  for (let y = bodyCy - 5; y <= bodyCy + 2; y++) {
    for (let x = 9; x <= 23; x++) {
      const n = ((x - 16) * (x - 16)) / 49 + ((y - bodyCy) * (y - bodyCy)) / 25;
      if (n <= 1) set(png, x, y, TEE);
    }
  }
  // Short sleeves
  fill(png, 6, bodyCy - 3, 9, bodyCy, TEE);
  fill(png, 23, bodyCy - 3, 26, bodyCy, TEE);
  for (let x = 6; x <= 9; x++) set(png, x, bodyCy - 4, OUT);
  for (let x = 23; x <= 26; x++) set(png, x, bodyCy - 4, OUT);
  // Hem
  for (let x = 10; x <= 22; x++) set(png, x, bodyCy + 2, TEE_DEEP);
  // “NEW” in white (tiny cursive-ish)
  // N
  set(png, 12, bodyCy - 2, WHITE);
  set(png, 12, bodyCy - 1, WHITE);
  set(png, 12, bodyCy, WHITE);
  set(png, 13, bodyCy - 1, WHITE);
  set(png, 14, bodyCy - 2, WHITE);
  set(png, 14, bodyCy - 1, WHITE);
  set(png, 14, bodyCy, WHITE);
  // E
  set(png, 16, bodyCy - 2, WHITE);
  set(png, 16, bodyCy - 1, WHITE);
  set(png, 16, bodyCy, WHITE);
  set(png, 17, bodyCy - 2, WHITE);
  set(png, 17, bodyCy - 1, WHITE);
  set(png, 17, bodyCy, WHITE);
  // W
  set(png, 19, bodyCy - 2, WHITE);
  set(png, 19, bodyCy, WHITE);
  set(png, 20, bodyCy - 1, WHITE);
  set(png, 21, bodyCy - 2, WHITE);
  set(png, 21, bodyCy, WHITE);
  // underline
  fill(png, 12, bodyCy + 1, 21, bodyCy + 1, WHITE);
  return png;
}

function drawDecoBand() {
  const png = blank();
  // Sky-blue CARAT LAND–style band across mid torso + tiny charm
  fill(png, 8, 22, 24, 24, BAND);
  for (let x = 8; x <= 24; x++) {
    set(png, x, 21, OUT);
    set(png, x, 25, OUT);
  }
  set(png, 8, 22, OUT);
  set(png, 8, 23, OUT);
  set(png, 8, 24, OUT);
  set(png, 24, 22, OUT);
  set(png, 24, 23, OUT);
  set(png, 24, 24, OUT);
  // Mini bong charm on band
  circle(png, 16, 20, 2, WHITE, OUT);
  set(png, 16, 19, PINK);
  set(png, 15, 20, BLACK);
  set(png, 17, 20, BLACK);
  return png;
}

const PET_POSES: Pose[] = [
  'neutral1',
  'neutral2',
  'walk1',
  'walk2',
  'sad',
  'happy',
  'sleep',
  'jump',
];

const NPC_MAP: Record<string, Pose> = {
  idle: 'neutral1',
  walk1: 'walk1',
  walk2: 'walk2',
  happy: 'happy',
  sad: 'sad',
  jump: 'jump',
};

// Prefer Imagine plate conversion when available (see scripts/imagine-to-bongbongee.mts).
const plate = path.resolve('scripts/reference/bongbongee/idle-plate.png');
if (fs.existsSync(plate)) {
  console.log('Imagine plate found — body frames come from imagine-to-bongbongee.mts');
  console.log(`  (run: npx tsx scripts/imagine-to-bongbongee.mts)`);
} else {
  for (const pose of PET_POSES) {
    save(drawBong(pose), path.join(ROOT, 'pet/bongbongee', `${pose}.png`), true);
  }
  for (const [npc, pose] of Object.entries(NPC_MAP)) {
    save(drawBong(pose), path.join(ROOT, 'npc/bongbongee', `${npc}.png`), true);
  }
}

save(drawMintPom(), path.join(ROOT, 'accessories/mint-pom.png'));
save(drawCaratDiamond(), path.join(ROOT, 'accessories/carat-diamond.png'));
save(drawBlueTee(), path.join(ROOT, 'accessories/blue-tee.png'));
save(drawDecoBand(), path.join(ROOT, 'accessories/deco-band.png'));

console.log('Generated Bongbongee accessories' + (fs.existsSync(plate) ? ' (body via Imagine plate)' : ' + procedural body frames'));
