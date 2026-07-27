import test from 'node:test';
import assert from 'node:assert/strict';
import { Encoder } from '@colyseus/schema';
import { isMovePayload, PlayerState, PROTOCOL_VERSION, TownState, TOWN_BOUNDS } from '../src/index.ts';

test('protocol validates finite sequenced moves within actual town bounds', () => {
  assert.equal(PROTOCOL_VERSION, 1);
  assert.deepEqual(TOWN_BOUNDS, { width: 1056, height: 768 });
  assert.equal(isMovePayload({ x: 1, y: 2, petX: 3, petY: 4, facing: 'down', moving: true, seq: 1 }), true);
  assert.equal(isMovePayload({ x: Infinity, y: 2, petX: 3, petY: 4, facing: 'down', moving: true, seq: 1 }), false);
  assert.equal(isMovePayload({ x: 1057, y: 2, petX: 3, petY: 4, facing: 'down', moving: true, seq: 1 }), false);
  assert.equal(isMovePayload({ x: 2, y: 2, petX: 1057, petY: 4, facing: 'down', moving: true, seq: 1 }), false);
});

test('town state serializes a player map for Colyseus synchronization', () => {
  const state = new TownState();
  state.players.set('session-1', new PlayerState());
  assert.doesNotThrow(() => new Encoder(state).encodeAll());
});
