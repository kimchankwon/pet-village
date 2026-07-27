import test from 'node:test';
import assert from 'node:assert/strict';
import { validateMove, canWave, MAX_PET_DISTANCE } from '../src/policy.ts';

const player = { x: 100, y: 100, lastSeq: 4, lastMoveAt: 1000, lastWaveAt: 0 };
test('move policy enforces monotonic sequence, town bounds and speed plus slack', () => {
  assert.equal(validateMove(player, {x:120,y:100,petX:90,petY:110,facing:'side',moving:true,seq:5}, 1100).ok, true);
  assert.equal(validateMove(player, {x:120,y:100,petX:90,petY:110,facing:'side',moving:true,seq:4}, 1100).ok, false);
  assert.equal(validateMove(player, {x:1000,y:700,petX:900,petY:700,facing:'side',moving:true,seq:5}, 1100).ok, false);
  assert.equal(validateMove(player, {x:900,y:100,petX:870,petY:110,facing:'side',moving:true,seq:5}, 61_000).ok, false);
});
test('a lagging pet is clamped without rejecting valid player movement', () => {
  const result = validateMove(player, {x:120,y:100,petX:900,petY:100,facing:'side',moving:true,seq:5}, 1100);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.ok(Math.hypot(result.move.petX - result.move.x, result.move.petY - result.move.y) <= MAX_PET_DISTANCE);
});
test('move policy tolerates a one-second delivery stall at normal walking speed', () => {
  assert.equal(
    validateMove(player, {x:320,y:100,petX:290,petY:110,facing:'side',moving:true,seq:5}, 2000).ok,
    true,
  );
});
test('first move must establish an approved Town spawn', () => {
  const fresh = { ...player, lastSeq: 0 };
  assert.equal(validateMove(fresh, {x:528,y:265,petX:500,petY:275,facing:'down',moving:false,seq:1}, 1001).ok, true);
  assert.equal(validateMove(fresh, {x:900,y:650,petX:870,petY:660,facing:'down',moving:false,seq:1}, 1001).ok, false);
});
test('wave policy enforces proximity and cooldown', () => {
  assert.equal(canWave(player, {x:150,y:100}, 2000), true);
  assert.equal(canWave({...player,lastWaveAt:1500}, {x:150,y:100}, 2000), false);
  assert.equal(canWave(player, {x:500,y:100}, 2000), false);
});
