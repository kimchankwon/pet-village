import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifyPenguinPixel,
  findFlipperBand,
  pixelAt,
  raiseFlipper,
  scanFlipperRows,
  WAVE_ANGLES,
  writePixel,
} from './penguin-wave.mjs';

const OUTLINE = [16, 16, 16, 255];
const BLUE = [20, 140, 235, 255];
const WHITE = [255, 255, 255, 255];

const blank = (width, height) => ({ width, height, data: new Uint8Array(width * height * 4) });
const fill = (image, x0, y0, x1, y1, color) => {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) writePixel(image, x, y, color);
};

/**
 * Stand-in plate: a body on the right, a flipper on the left separated by a
 * shared outline column, a 1px staircase on the flipper's outer edge, and a
 * belly outline further right that must not be mistaken for the shoulder.
 */
function fakePlate() {
  const image = blank(40, 40);
  fill(image, 12, 4, 34, 34, BLUE);          // body
  fill(image, 20, 14, 30, 30, OUTLINE);      // belly border
  fill(image, 21, 15, 29, 29, WHITE);        // belly
  fill(image, 10, 10, 11, 26, OUTLINE);      // outline the flipper shares with the body
  fill(image, 6, 10, 9, 26, BLUE);           // flipper
  fill(image, 5, 10, 5, 26, OUTLINE);        // flipper outer edge
  writePixel(image, 4, 18, BLUE);            // 1px staircase bump on the outer edge
  return image;
}

test('classifies plate pixels into transparent / outline / body / other', () => {
  assert.equal(classifyPenguinPixel([0, 0, 0, 0]), 't');
  assert.equal(classifyPenguinPixel(OUTLINE), 'o');
  assert.equal(classifyPenguinPixel(BLUE), 'B');
  assert.equal(classifyPenguinPixel(WHITE), 'x');
});

test('row scan only keeps outline runs that separate two filled runs', () => {
  const rows = scanFlipperRows(fakePlate(), 40);
  assert.equal(rows[0], null, 'empty rows are skipped');
  assert.deepEqual(rows[12].runs.map((run) => run.start), [10], 'shoulder only above the belly');
  assert.deepEqual(
    rows[20].runs.map((run) => run.start),
    [10, 30],
    'shoulder and the belly\'s right border, never the flipper outer edge',
  );
  assert.equal(rows[12].first, 5);
});

test('finds the flipper band and pivots on the shoulder, ignoring the belly border', () => {
  const image = fakePlate();
  const band = findFlipperBand(image);
  assert.ok(band);
  assert.deepEqual(band.pivot, { x: 11, y: 10 }, 'top of the shared outline');
  assert.equal(band.rows[0].y, 10);
  assert.equal(band.rows[band.rows.length - 1].y, 26);
  assert.ok(
    band.rows.every((row) => row.sep === 10),
    'the staircase bump never steals the shared-outline column',
  );
  // Flipper pixels only — nothing from the body side of the shared outline.
  assert.ok(band.pixels.length > 0);
  assert.ok(band.pixels.every((pixel) => pixel.x < 10));
});

test('rotating by zero degrees reproduces the plate', () => {
  const image = fakePlate();
  const band = findFlipperBand(image);
  const same = raiseFlipper(image, band, 0, { brush: 1 });
  assert.deepEqual(Buffer.from(same.data), Buffer.from(image.data));
});

test('raising the flipper clears the resting art and lands it above the shoulder', () => {
  const image = fakePlate();
  const band = findFlipperBand(image);
  const raised = raiseFlipper(image, band, 180, { brush: 1 });

  assert.equal(pixelAt(raised, 7, 20)[3], 0, 'resting flipper is erased');
  assert.deepEqual(pixelAt(raised, 25, 20), WHITE, 'the body is untouched');

  // A half turn about the shoulder mirrors every flipper pixel through the pivot.
  const mirrored = band.pixels
    .map((pixel) => ({ x: 2 * band.pivot.x - pixel.x, y: 2 * band.pivot.y - pixel.y }))
    .filter((point) => point.y >= 0 && point.x < image.width);
  assert.ok(mirrored.length > 20, 'the fake plate keeps part of the arc on canvas');
  assert.ok(mirrored.every((point) => pixelAt(raised, point.x, point.y)[3] > 0));
});

test('wave angles keep the flipper on the plate', () => {
  assert.equal(WAVE_ANGLES.length, 3, 'frames 1-3 of the wave sequence');
  assert.ok(WAVE_ANGLES.every((angle) => angle >= 120 && angle <= 160));
  assert.deepEqual([...WAVE_ANGLES].sort((a, b) => a - b), WAVE_ANGLES, 'monotonic raise');
});
