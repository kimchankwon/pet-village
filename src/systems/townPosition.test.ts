import assert from 'node:assert/strict';
import test from 'node:test';
import { initialTownPosition, normalizeTownPosition } from './townPosition';

test('restores a valid saved Town position only on a permitted fresh Town launch', () => {
  const saved = { x: 320, y: 240, facing: 'side' as const };

  assert.deepEqual(initialTownPosition(saved, false, true), saved);
  assert.equal(initialTownPosition(saved, true, true), undefined);
  assert.equal(initialTownPosition(saved, false, false), undefined);
});

test('rejects Town exit trigger zones as unsafe restore positions', () => {
  assert.equal(normalizeTownPosition({ x: 35, y: 432, facing: 'side' }), undefined);
  assert.equal(normalizeTownPosition({ x: 1021, y: 432, facing: 'side' }), undefined);
  assert.equal(normalizeTownPosition({ x: 504, y: 717, facing: 'down' }), undefined);

  assert.deepEqual(normalizeTownPosition({ x: 36, y: 432, facing: 'side' }), {
    x: 36,
    y: 432,
    facing: 'side',
  });
});

test('rejects malformed or out-of-bounds saved Town positions', () => {
  assert.equal(normalizeTownPosition({ x: Number.NaN, y: 240, facing: 'down' }), undefined);
  assert.equal(normalizeTownPosition({ x: -1, y: 240, facing: 'down' }), undefined);
  assert.equal(normalizeTownPosition({ x: 320, y: 10_000, facing: 'down' }), undefined);
  assert.equal(normalizeTownPosition({ x: 320, y: 240, facing: 'diagonal' }), undefined);
});
