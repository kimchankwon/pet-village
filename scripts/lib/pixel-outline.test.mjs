import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';

import { repairExternalOutline } from './pixel-outline.mjs';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');

const rgba = (width, height) => ({ width, height, data: new Uint8Array(width * height * 4) });
const set = (image, x, y, [r, g, b, a = 255]) => {
  const i = (y * image.width + x) * 4;
  image.data.set([r, g, b, a], i);
};
const get = (image, x, y) => Array.from(image.data.slice((y * image.width + x) * 4, (y * image.width + x) * 4 + 4));
const BLACK = [0, 0, 0, 255];
const BODY = [240, 180, 120, 255];

test('replaces a thick external outline with a one-pixel outer boundary', () => {
  const image = rgba(9, 9);
  for (let y = 1; y <= 7; y++) for (let x = 1; x <= 7; x++) set(image, x, y, BLACK);
  for (let y = 3; y <= 5; y++) for (let x = 3; x <= 5; x++) set(image, x, y, BODY);

  const repaired = repairExternalOutline(image, { outline: BLACK });
  const repairedAgain = repairExternalOutline(repaired, { outline: BLACK });

  assert.deepEqual(Buffer.from(repairedAgain.data), Buffer.from(repaired.data), 'repair must be idempotent');
  assert.deepEqual(get(repaired, 1, 4), [0, 0, 0, 0]);
  assert.deepEqual(get(repaired, 2, 4), BLACK);
  assert.deepEqual(get(repaired, 3, 4), BODY);
  assert.deepEqual(get(repaired, 2, 2), [0, 0, 0, 0], 'diagonal pixels are not added with 4-connectivity');

  for (let y = 0; y < repaired.height; y++) {
    for (let x = 0; x < repaired.width; x++) {
      if (get(repaired, x, y).join(',') !== BLACK.join(',')) continue;
      const touchesBody = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) =>
        x + dx >= 0 && y + dy >= 0 && x + dx < repaired.width && y + dy < repaired.height &&
        get(repaired, x + dx, y + dy).join(',') === BODY.join(','));
      assert.equal(touchesBody, true, `outline pixel ${x},${y} is thicker than one pixel`);
    }
  }
});

test('preserves enclosed black facial details', () => {
  const image = rgba(9, 9);
  for (let y = 1; y <= 7; y++) for (let x = 1; x <= 7; x++) set(image, x, y, BLACK);
  for (let y = 2; y <= 6; y++) for (let x = 2; x <= 6; x++) set(image, x, y, BODY);
  for (let y = 3; y <= 4; y++) for (let x = 3; x <= 4; x++) set(image, x, y, BLACK);

  const repaired = repairExternalOutline(image, { outline: BLACK });

  for (let y = 3; y <= 4; y++) for (let x = 3; x <= 4; x++) assert.deepEqual(get(repaired, x, y), BLACK);
  assert.deepEqual(get(repaired, 1, 4), BLACK);
  assert.deepEqual(get(repaired, 0, 4), [0, 0, 0, 0]);
});

test('recognizes near-black outline colors with configured tolerance', () => {
  const image = rgba(7, 7);
  const nearBlack = [20, 20, 28, 255];
  for (let y = 1; y <= 5; y++) for (let x = 1; x <= 5; x++) set(image, x, y, nearBlack);
  for (let y = 2; y <= 4; y++) for (let x = 2; x <= 4; x++) set(image, x, y, BODY);

  const repaired = repairExternalOutline(image, { outline: BLACK, tolerance: 32 });

  assert.deepEqual(get(repaired, 1, 3), BLACK);
  assert.deepEqual(get(repaired, 0, 3), [0, 0, 0, 0]);
});

test('generated character frames already satisfy the one-pixel outline invariant', () => {
  const roots = [
    ['public/assets/npc/cinnamoroll', BLACK],
    ['public/assets/npc/miniteen', BLACK],
    ['public/assets/pet/bongbongee', BLACK],
    ['public/assets/pet/cinnamoroll', BLACK],
    ['public/assets/pet/kirby', BLACK],
    ...fs.readdirSync('public/assets/pet')
      .filter((name) => name.startsWith('puffle-'))
      .map((name) => [path.join('public/assets/pet', name), [20, 20, 28, 255]]),
  ];
  const files = roots.flatMap(([root, outline]) =>
    fs.statSync(root).isDirectory()
      ? fs.readdirSync(root, { recursive: true })
          .filter((name) => name.endsWith('.png'))
          .map((name) => ({ file: path.join(root, name), outline }))
      : []);
  for (const name of ['idle', 'walk1', 'walk2', 'happy', 'sad', 'jump']) {
    files.push({ file: path.join('public/assets/npc/bongbongee', `${name}.png`), outline: BLACK });
  }
  assert.equal(files.length, 200, 'expected the complete generated animation-frame corpus');

  for (const { file, outline } of files) {
    const image = PNG.sync.read(fs.readFileSync(file));
    const repaired = repairExternalOutline(image, { outline });
    assert.deepEqual(Buffer.from(repaired.data), Buffer.from(image.data), `${file} still has a thick or inconsistent external outline`);
  }
});
