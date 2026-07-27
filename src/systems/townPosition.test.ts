import assert from 'node:assert/strict';
import test from 'node:test';
import { initialTownPosition, normalizeTownPosition } from './townPosition';

test('restores a valid saved Town position only on a fresh Town launch', () => {
  const saved = { x: 320, y: 240, facing: 'side' as const };

  assert.deepEqual(initialTownPosition(saved, false), saved);
  assert.equal(initialTownPosition(saved, true), undefined);
});

test('rejects malformed or out-of-bounds saved Town positions', () => {
  assert.equal(normalizeTownPosition({ x: Number.NaN, y: 240, facing: 'down' }), undefined);
  assert.equal(normalizeTownPosition({ x: -1, y: 240, facing: 'down' }), undefined);
  assert.equal(normalizeTownPosition({ x: 320, y: 10_000, facing: 'down' }), undefined);
  assert.equal(normalizeTownPosition({ x: 320, y: 240, facing: 'diagonal' }), undefined);
});
