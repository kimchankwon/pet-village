import assert from 'node:assert/strict';
import test from 'node:test';
import { movementFacing } from '../../src/systems/movementFacing.ts';

test('vertical movement faces up or down', () => {
  assert.equal(movementFacing(0, -1, 'down'), 'up');
  assert.equal(movementFacing(0, 1, 'up'), 'down');
});

test('vertical facing wins inside the 90-degree total cones', () => {
  assert.equal(movementFacing(1, -2, 'side'), 'up');
  assert.equal(movementFacing(-1, 2, 'side'), 'down');
  assert.equal(movementFacing(1, -1, 'side'), 'up');
  assert.equal(movementFacing(-1, 1, 'side'), 'down');
});

test('movement beyond the diagonal boundaries faces sideways', () => {
  assert.equal(movementFacing(2, -1, 'up'), 'side');
  assert.equal(movementFacing(-2, 1, 'down'), 'side');
});

test('not moving preserves the last facing', () => {
  assert.equal(movementFacing(0, 0, 'up'), 'up');
  assert.equal(movementFacing(0, 0, 'side'), 'side');
});
