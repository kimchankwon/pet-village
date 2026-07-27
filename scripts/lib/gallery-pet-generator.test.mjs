import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';

import { generateGalleryPet, toGalleryCanvas } from './gallery-pet-generator.mjs';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');

const image = (width, height) => {
  const png = new PNG({ width, height });
  png.data.fill(0);
  return png;
};
const set = (png, x, y, rgba) => png.data.set(rgba, (y * png.width + x) * 4);
const get = (png, x, y) => Array.from(png.data.slice((y * png.width + x) * 4, (y * png.width + x) * 4 + 4));

test('crops opaque content and bottom-centers it without scaling', () => {
  const source = image(5, 5);
  set(source, 1, 1, [10, 20, 30, 19]);
  set(source, 2, 2, [40, 50, 60, 20]);
  set(source, 3, 3, [70, 80, 90, 200]);

  const result = toGalleryCanvas(source, { name: 'test pet' });

  assert.equal(result.width, 32);
  assert.equal(result.height, 32);
  assert.deepEqual(get(result, 15, 30), [40, 50, 60, 255]);
  assert.deepEqual(get(result, 16, 31), [70, 80, 90, 255]);
  assert.deepEqual(get(result, 15, 29), [0, 0, 0, 0]);
});

test('scales oversized content to fit with nearest-neighbour sampling', () => {
  const source = image(64, 64);
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) set(source, x, y, [x, y, 100, 255]);
  }

  const result = toGalleryCanvas(source, { name: 'test pet', scaleToFit: true });

  assert.deepEqual(get(result, 0, 0), [0, 0, 100, 255]);
  assert.deepEqual(get(result, 1, 1), [2, 2, 100, 255]);
  assert.deepEqual(get(result, 31, 31), [62, 62, 100, 255]);
});

test('preflights every input before writing any output', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gallery-pet-generator-'));
  const referenceDir = path.join(root, 'reference');
  const outputDir = path.join(root, 'output');
  fs.mkdirSync(referenceDir);
  fs.mkdirSync(outputDir);
  const first = image(1, 1);
  set(first, 0, 0, [1, 2, 3, 255]);
  fs.writeFileSync(path.join(referenceDir, 'first.png'), PNG.sync.write(first));
  fs.writeFileSync(path.join(outputDir, 'first.png'), 'sentinel');

  assert.throws(
    () => generateGalleryPet({
      name: 'Test Pet',
      referenceDir,
      outputDir,
      poses: ['first', 'missing'],
      completionMessage: 'done',
    }),
    /Missing reference frame/,
  );
  assert.equal(fs.readFileSync(path.join(outputDir, 'first.png'), 'utf8'), 'sentinel');
  assert.equal(fs.existsSync(path.join(outputDir, 'missing.png')), false);
});
