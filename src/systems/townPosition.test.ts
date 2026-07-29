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
  // Park gate band is around tile rows 10–11 (y ≈ 480–576); edges leave town.
  assert.equal(normalizeTownPosition({ x: 35, y: 504, facing: 'side' }), undefined);
  assert.equal(normalizeTownPosition({ x: 1501, y: 504, facing: 'side' }), undefined);
  // South ice road center (tx 15–17) near the bottom edge → Shore.
  assert.equal(normalizeTownPosition({ x: 768, y: 1020, facing: 'down' }), undefined);

  // Just inside the west park-gate band (not on the edge) is still safe.
  assert.deepEqual(normalizeTownPosition({ x: 48, y: 504, facing: 'side' }), {
    x: 48,
    y: 504,
    facing: 'side',
  });
});
test('rejects malformed or out-of-bounds saved Town positions', () => {
  assert.equal(normalizeTownPosition({ x: Number.NaN, y: 240, facing: 'down' }), undefined);
  assert.equal(normalizeTownPosition({ x: -1, y: 240, facing: 'down' }), undefined);
  assert.equal(normalizeTownPosition({ x: 320, y: 10_000, facing: 'down' }), undefined);
  assert.equal(normalizeTownPosition({ x: 320, y: 240, facing: 'diagonal' }), undefined);
});
