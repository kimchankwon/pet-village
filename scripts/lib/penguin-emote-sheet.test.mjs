/**
 * Geometry checks for sit / breakdance / hip hop sheets
 * (npm run sprite:penguin-emotes).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { PENGUIN_EMOTE_CONFIG } from '../../src/systems/penguinEmotes.ts';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');

const OUT = path.resolve('public/assets/player/penguin');
const CELL_W = 220;
const CELL_H = 214;

function contentBox(png, ox = 0, oy = 0, w = png.width, h = png.height) {
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (png.data[((oy + y) * png.width + (ox + x)) * 4 + 3] < 20) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  return { width: maxX - minX + 1, height: maxY - minY + 1, minY, maxY };
}

for (const id of ['sit', 'breakdance', 'hiphop']) {
  const cfg = PENGUIN_EMOTE_CONFIG[id];
  test(`${id} sheet and plates are present (${cfg.frameCount} × 220×214)`, () => {
    const sheetPath = path.join(OUT, `${id}-sheet.png`);
    assert.ok(fs.existsSync(sheetPath), `${id}-sheet.png missing — run npm run sprite:penguin-emotes`);
    const sheet = PNG.sync.read(fs.readFileSync(sheetPath));
    const cols = id === 'hiphop' ? 10 : id === 'breakdance' ? 8 : 1;
    const rows = Math.ceil(cfg.frameCount / cols);
    assert.equal(sheet.width, CELL_W * cols);
    assert.equal(sheet.height, CELL_H * rows);
    const dir = path.join(OUT, id);
    for (let i = 0; i < cfg.frameCount; i++) {
      const file = path.join(dir, `f${String(i).padStart(2, '0')}.png`);
      assert.ok(fs.existsSync(file), `missing ${file}`);
      const png = PNG.sync.read(fs.readFileSync(file));
      assert.equal(png.width, CELL_W);
      assert.equal(png.height, CELL_H);
      const box = contentBox(png);
      assert.ok(box.height > 80, `${id} frame ${i} body too short (${box.height})`);
    }
  });
}
