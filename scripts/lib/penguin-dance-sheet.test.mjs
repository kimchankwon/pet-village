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
const FRAME_COUNT = 76;
const COLS = 10;

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
