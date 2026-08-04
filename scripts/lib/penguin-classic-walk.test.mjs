/**
 * Geometry checks for classic CP idle + Tenor walk plates
 * (npm run sprite:penguin-classic).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import {
  CHARACTER_PENGUIN_DISPLAY_HEIGHT as PENGUIN_DISPLAY_HEIGHT,
  DANCE_STAND_FEET_RATIO,
  DANCE_STAND_HEIGHT_RATIO,
  IDLE_BODY_HEIGHT_RATIO,
  IDLE_FEET_BELOW_CENTRE_RATIO,
} from '../../src/systems/characterScale.ts';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');

const OUT = path.resolve('public/assets/player/penguin');
const WALK_COUNT = 8;
const CELL_W = 220;
const CELL_H = 214;

function contentBox(png, ox = 0, oy = 0, w = png.width, h = png.height) {
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = ((oy + y) * png.width + (ox + x)) << 2;
      if (png.data[i + 3] < 20) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  assert.ok(maxX >= minX, 'no opaque pixels');
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

test('classic idle + walk plates are 220×214 dance-cell sized', () => {
  for (const facing of ['down', 'up', 'side']) {
    for (let frame = 0; frame <= WALK_COUNT; frame++) {
      const file = path.join(OUT, `${facing}-${frame}.png`);
      assert.ok(fs.existsSync(file), `missing ${file}`);
      const png = PNG.sync.read(fs.readFileSync(file));
      assert.equal(png.width, CELL_W, `${facing}-${frame} width`);
      assert.equal(png.height, CELL_H, `${facing}-${frame} height`);
      const box = contentBox(png);
      assert.ok(box.height > 100, `${facing}-${frame} body too short`);
    }
  }
});

test('walk sheet packs 8 equal cells', () => {
  const sheetPath = path.join(OUT, 'walk-sheet.png');
  assert.ok(fs.existsSync(sheetPath), 'walk-sheet.png missing');
  const sheet = PNG.sync.read(fs.readFileSync(sheetPath));
  assert.equal(sheet.width, CELL_W * WALK_COUNT);
  assert.equal(sheet.height, CELL_H);
});

test('down idle body ratios match characterScale constants', () => {
  const idle = PNG.sync.read(fs.readFileSync(path.join(OUT, 'down-0.png')));
  const box = contentBox(idle);
  assert.equal(
    Math.round(idle.height * IDLE_BODY_HEIGHT_RATIO),
    box.height,
    'IDLE_BODY_HEIGHT_RATIO no longer matches down-0',
  );
  assert.equal(
    Math.round(idle.height * IDLE_FEET_BELOW_CENTRE_RATIO + idle.height / 2 - 0.5),
    box.maxY,
    'IDLE_FEET_BELOW_CENTRE_RATIO no longer matches down-0 feet',
  );
});

test('dancing penguin still stands the same height as the classic idle', () => {
  const idle = PNG.sync.read(fs.readFileSync(path.join(OUT, 'down-0.png')));
  const idleBox = contentBox(idle);
  const idleScale = PENGUIN_DISPLAY_HEIGHT / idle.height;

  const sheet = PNG.sync.read(fs.readFileSync(path.join(OUT, 'dance-sheet.png')));
  const cols = 10;
  const fw = sheet.width / cols;
  const fh = sheet.height / Math.ceil(76 / cols);
  const stand = contentBox(sheet, 0, 0, fw, fh);

  const danceScale =
    (PENGUIN_DISPLAY_HEIGHT * IDLE_BODY_HEIGHT_RATIO) / (fh * DANCE_STAND_HEIGHT_RATIO);
  const idleBodyHeight = idleBox.height * idleScale;
  const danceBodyHeight = stand.height * danceScale;
  assert.ok(
    Math.abs(danceBodyHeight - idleBodyHeight) <= 1.5,
    `dancing penguin is ${danceBodyHeight.toFixed(1)}px tall vs idle ${idleBodyHeight.toFixed(1)}px`,
  );

  const originY =
    (fh * DANCE_STAND_FEET_RATIO -
      (PENGUIN_DISPLAY_HEIGHT * IDLE_FEET_BELOW_CENTRE_RATIO) / danceScale) /
    fh;
  const danceFeetBelowCentre = (stand.maxY + 0.5 - originY * fh) * danceScale;
  const idleFeetBelowCentre = (idleBox.maxY + 0.5 - idle.height / 2) * idleScale;
  assert.ok(
    Math.abs(danceFeetBelowCentre - idleFeetBelowCentre) <= 1.5,
    `dance feet sit ${danceFeetBelowCentre.toFixed(1)}px below centre vs idle ${idleFeetBelowCentre.toFixed(1)}px`,
  );
});
