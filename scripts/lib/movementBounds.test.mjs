import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clampToMovementBounds,
  shuffledPatrolOrder,
} from '../../src/systems/movementBounds.ts';

test('clampToMovementBounds keeps the whole actor inside the map', () => {
  const bounds = { x: 10, y: 20, width: 100, height: 80 };
  assert.deepEqual(clampToMovementBounds({ x: -50, y: 999 }, bounds, 12, 18), {
    x: 22,
    y: 82,
  });
});

test('shuffledPatrolOrder visits every other waypoint exactly once', () => {
  const order = shuffledPatrolOrder(5, 2, null, () => 0.4);
  assert.equal(order.length, 4);
  assert.deepEqual([...order].sort((a, b) => a - b), [0, 1, 3, 4]);
});

test('shuffledPatrolOrder avoids an immediate reverse when another route exists', () => {
  const order = shuffledPatrolOrder(4, 1, 0, () => 0);
  assert.notEqual(order[0], 0);
  assert.equal(new Set(order).size, 3);
});
