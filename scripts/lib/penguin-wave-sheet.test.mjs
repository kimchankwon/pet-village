/**
 * Geometry checks for the 16-frame wave sheet (npm run sprite:penguin-wave).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');

const SHEET = path.resolve('public/assets/player/penguin/wave-sheet.png');
const FRAME_DIR = path.resolve('public/assets/player/penguin/wave');
const FRAME_COUNT = 16;
const CELL_W = 220;
const CELL_H = 214;

test('wave sheet packs 16 equal 220×214 cells in a single row', () => {
  assert.ok(fs.existsSync(SHEET), 'wave-sheet.png missing — run npm run sprite:penguin-wave');
  const sheet = PNG.sync.read(fs.readFileSync(SHEET));
  assert.equal(sheet.width, CELL_W * FRAME_COUNT);
  assert.equal(sheet.height, CELL_H);
});

test('every individual wave plate matches cell size and has opaque content', () => {
  for (let i = 0; i < FRAME_COUNT; i++) {
    const file = path.join(FRAME_DIR, `f${String(i).padStart(2, '0')}.png`);
    assert.ok(fs.existsSync(file), `missing ${file}`);
    const png = PNG.sync.read(fs.readFileSync(file));
    assert.equal(png.width, CELL_W);
    assert.equal(png.height, CELL_H);
    let opaque = 0;
    for (let p = 3; p < png.data.length; p += 4) {
      if (png.data[p] >= 20) opaque += 1;
    }
    assert.ok(opaque > 200, `frame ${i} almost empty (${opaque})`);
  }
});
