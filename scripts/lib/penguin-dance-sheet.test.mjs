/**
 * Geometry checks for the 76-frame dance sheet produced by sprite:penguin-dance.
 * Catches the undersized-frame class of bug that blocked the first dance PR.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');

const SHEET = path.resolve('public/assets/player/penguin/dance-sheet.png');
const FRAME_DIR = path.resolve('public/assets/player/penguin/dance');
const IDLE_PLATE = path.resolve('public/assets/player/penguin/down-0.png');
const FRAME_COUNT = 76;
const COLS = 10;

/** Mirrors PENGUIN_DISPLAY_HEIGHT / the dance ratios in src/sprites/pixelart.ts. */
const PENGUIN_DISPLAY_HEIGHT = 60;
const DANCE_STAND_HEIGHT_RATIO = 131 / 214;
const DANCE_STAND_FEET_RATIO = 155.5 / 214;
const IDLE_BODY_HEIGHT_RATIO = 503 / 513;
const IDLE_FEET_BELOW_CENTRE_RATIO = (512.5 - 256.5) / 513;

/** Tight bounds of the non-transparent art inside a cell. */
function contentBox(png, ox, oy, w, h) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (png.data[((oy + y) * png.width + (ox + x)) * 4 + 3] <= 8) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return { minX, minY, maxX, maxY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

test('dance sheet is present and packs 76 equal cells on a 10-col grid', () => {
  assert.ok(fs.existsSync(SHEET), 'dance-sheet.png missing — run npm run sprite:penguin-dance');
  const sheet = PNG.sync.read(fs.readFileSync(SHEET));
  const rows = Math.ceil(FRAME_COUNT / COLS);
  assert.equal(sheet.width % COLS, 0, 'sheet width must divide evenly by columns');
  assert.equal(sheet.height % rows, 0, 'sheet height must divide evenly by rows');
  const fw = sheet.width / COLS;
  const fh = sheet.height / rows;
  assert.ok(fw >= 64 && fh >= 64, `cell ${fw}×${fh} looks too small`);
  assert.equal(fw, 220);
  assert.equal(fh, 214);
});

test('every individual dance plate matches sheet cell size and has opaque content', () => {
  const first = PNG.sync.read(fs.readFileSync(path.join(FRAME_DIR, 'f00.png')));
  for (let i = 0; i < FRAME_COUNT; i++) {
    const file = path.join(FRAME_DIR, `f${String(i).padStart(2, '0')}.png`);
    assert.ok(fs.existsSync(file), `missing ${file}`);
    const png = PNG.sync.read(fs.readFileSync(file));
    assert.equal(png.width, first.width, `frame ${i} width`);
    assert.equal(png.height, first.height, `frame ${i} height`);
    let opaque = 0;
    for (let p = 3; p < png.data.length; p += 4) {
      if (png.data[p] >= 20) opaque += 1;
    }
    assert.ok(opaque > 200, `frame ${i} has almost no opaque pixels (${opaque})`);
  }
});

/**
 * The size bug this guards against: the dance cell reserves a third of its height
 * for the floor spin, so scaling by cell height (as the walk plates do) drew the
 * dancer ~38% short and floating. These assertions compare the *on-screen*
 * standing pose against the idle plate, which is the thing players notice.
 */
test('dancing penguin stands the same height, and on the same ground, as the idle plate', () => {
  const idle = PNG.sync.read(fs.readFileSync(IDLE_PLATE));
  const idleBox = contentBox(idle, 0, 0, idle.width, idle.height);
  const idleScale = PENGUIN_DISPLAY_HEIGHT / idle.height;

  const sheet = PNG.sync.read(fs.readFileSync(SHEET));
  const fw = sheet.width / COLS;
  const fh = sheet.height / Math.ceil(FRAME_COUNT / COLS);
  const stand = contentBox(sheet, 0, 0, fw, fh);

  // The ratios baked into pixelart.ts must still describe the exported sheet;
  // re-exporting the GIF at a new crop has to update both together.
  assert.equal(
    Math.round(fh * DANCE_STAND_HEIGHT_RATIO),
    stand.height,
    'DANCE_STAND_HEIGHT_RATIO no longer matches the standing frame',
  );
  assert.equal(
    Math.round(fh * DANCE_STAND_FEET_RATIO - 0.5),
    stand.maxY,
    'DANCE_STAND_FEET_RATIO no longer matches the standing frame feet',
  );

  const danceScale = (PENGUIN_DISPLAY_HEIGHT * IDLE_BODY_HEIGHT_RATIO) / (fh * DANCE_STAND_HEIGHT_RATIO);
  const idleBodyHeight = idleBox.height * idleScale;
  const danceBodyHeight = stand.height * danceScale;
  assert.ok(
    Math.abs(danceBodyHeight - idleBodyHeight) <= 1,
    `dancing penguin is ${danceBodyHeight.toFixed(1)}px tall vs idle ${idleBodyHeight.toFixed(1)}px`,
  );

  // Feet must land on the same ground line, or the penguin hovers when it dances.
  const originY =
    (fh * DANCE_STAND_FEET_RATIO -
      (PENGUIN_DISPLAY_HEIGHT * IDLE_FEET_BELOW_CENTRE_RATIO) / danceScale) /
    fh;
  const danceFeetBelowCentre = (stand.maxY + 0.5 - originY * fh) * danceScale;
  const idleFeetBelowCentre = (idleBox.maxY + 0.5 - idle.height / 2) * idleScale;
  assert.ok(
    Math.abs(danceFeetBelowCentre - idleFeetBelowCentre) <= 0.5,
    `dance feet sit ${danceFeetBelowCentre.toFixed(1)}px below centre vs idle ${idleFeetBelowCentre.toFixed(1)}px`,
  );
});
