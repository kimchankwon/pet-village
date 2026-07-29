import test from 'node:test';
import assert from 'node:assert/strict';
import { validateMove, canChat, canTransitionWorldScene, canWave, MAX_PET_DISTANCE } from '../src/policy.ts';

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
test('first move accepts the current Town position when multiplayer connects late', () => {
  const fresh = { ...player, lastSeq: 0 };
  const approvedSpawn = {x:768,y:345.6,petX:738,petY:355.6,facing:'down' as const,moving:false,seq:1};
  const awayFromSpawn = {x:1200,y:800,petX:1170,petY:810,facing:'down' as const,moving:true,seq:1};
  assert.equal(validateMove(fresh, approvedSpawn, 1001).ok, true);
  assert.equal(validateMove(fresh, awayFromSpawn, 1001).ok, true);
  assert.equal(
    validateMove(fresh, {...approvedSpawn, scene: 'shore'}, 1001).ok,
    false,
  );
  assert.equal(validateMove(fresh, awayFromSpawn, 1001, true).ok, false);
  assert.equal(validateMove(fresh, approvedSpawn, 1001, true).ok, true);
});
test('move policy validates positions against the selected world scene', () => {
  const current = { ...player, scene: 'shore' as const };
  assert.equal(validateMove(current, {scene:'shore',x:120,y:100,petX:90,petY:110,facing:'side',moving:true,seq:5}, 1100).ok, true);
  assert.equal(validateMove(current, {scene:'shore',x:1200,y:100,petX:1170,petY:110,facing:'side',moving:true,seq:5}, 1100).ok, false);
  assert.equal(validateMove(current, {scene:'east-green',x:96,y:360,petX:66,petY:370,facing:'side',moving:false,seq:5}, 1100).ok, false);
  assert.equal(validateMove(current, {scene:'east-green',x:96,y:360,petX:66,petY:370,facing:'side',moving:false,seq:5}, 1100, true).ok, true);
  assert.equal(validateMove(current, {x:120,y:100,petX:90,petY:110,facing:'side',moving:true,seq:5}, 1100).ok, true);
});
test('world scene transitions follow the map portal graph', () => {
  assert.equal(canTransitionWorldScene('town', 'shore'), true);
  assert.equal(canTransitionWorldScene('daniels-shop', 'town'), true);
  assert.equal(canTransitionWorldScene('west-green', 'east-green'), false);
  assert.equal(canTransitionWorldScene('shore', 'cafe-cinnamon'), false);
});
test('chat policy keeps a floor between two messages from the same player', () => {
  assert.equal(canChat({ lastChatAt: 0 }, 600), true);
  assert.equal(canChat({ lastChatAt: 0 }, 599), false);
  assert.equal(canChat({ lastChatAt: 1_000 }, 1_000), false);
  // A player who has never spoken carries no timestamp, so nothing holds them up.
  assert.equal(canChat({ lastChatAt: 0 }, Date.now()), true);
});
test('wave policy enforces proximity and cooldown', () => {
  assert.equal(canWave(player, {x:150,y:100}, 2000), true);
  assert.equal(canWave({...player,lastWaveAt:1500}, {x:150,y:100}, 2000), false);
  assert.equal(canWave(player, {x:500,y:100}, 2000), false);
});
