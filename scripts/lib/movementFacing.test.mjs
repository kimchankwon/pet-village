import assert from 'node:assert/strict';
import test from 'node:test';
import {
  movementFacing,
  penguinFlipX,
  penguinTextureKey,
  penguinWalkAnimKey,
} from '../../src/systems/movementFacing.ts';

test('cardinal movement faces up, down, or side', () => {
  assert.equal(movementFacing(0, -1, 'down'), 'up');
  assert.equal(movementFacing(0, 1, 'up'), 'down');
  assert.equal(movementFacing(1, 0, 'down'), 'side');
  assert.equal(movementFacing(-1, 0, 'down'), 'side');
});

test('diagonal movement faces se / sw / ne / nw', () => {
  assert.equal(movementFacing(1, 1, 'down'), 'se');
  assert.equal(movementFacing(-1, 1, 'down'), 'sw');
  assert.equal(movementFacing(1, -1, 'down'), 'ne');
  assert.equal(movementFacing(-1, -1, 'down'), 'nw');
});

test('near-cardinal vectors stay in their 45-degree cones', () => {
  // Mostly south with a little east still faces down (not se).
  assert.equal(movementFacing(1, 3, 'side'), 'down');
  // Mostly east with a little south faces side (not se).
  assert.equal(movementFacing(3, 1, 'down'), 'side');
  // Equal components sit on the diagonal boundary → se / sw / ne / nw.
  assert.equal(movementFacing(2, 2, 'up'), 'se');
  assert.equal(movementFacing(-2, -2, 'down'), 'nw');
});

test('not moving preserves the last facing', () => {
  assert.equal(movementFacing(0, 0, 'up'), 'up');
  assert.equal(movementFacing(0, 0, 'se'), 'se');
  assert.equal(movementFacing(0, 0, 'nw'), 'nw');
});

test('only side facing flips with horizontal travel', () => {
  assert.equal(penguinFlipX('side', -1), true);
  assert.equal(penguinFlipX('side', 1), false);
  assert.equal(penguinFlipX('se', -1), false);
  assert.equal(penguinFlipX('sw', -1), false);
  assert.equal(penguinFlipX('ne', 1), false);
  assert.equal(penguinFlipX('nw', -1), false);
});

test('texture and walk anim keys follow facing', () => {
  assert.equal(penguinTextureKey('se'), 'penguin-se');
  assert.equal(penguinWalkAnimKey('nw'), 'walk-nw');
});
