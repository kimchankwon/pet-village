import test from 'node:test';
import assert from 'node:assert/strict';
import { Decoder, Encoder } from '@colyseus/schema';
import { isMovePayload, NpcState, PlayerState, PROTOCOL_VERSION, TownState, TOWN_BOUNDS } from '../src/index.ts';

test('protocol validates finite sequenced moves within actual town bounds', () => {
  assert.equal(PROTOCOL_VERSION, 2);
  assert.deepEqual(TOWN_BOUNDS, { width: 1056, height: 768 });
  assert.equal(isMovePayload({ x: 1, y: 2, petX: 3, petY: 4, facing: 'down', moving: true, seq: 1 }), true);
  assert.equal(isMovePayload({ x: Infinity, y: 2, petX: 3, petY: 4, facing: 'down', moving: true, seq: 1 }), false);
  assert.equal(isMovePayload({ x: 1057, y: 2, petX: 3, petY: 4, facing: 'down', moving: true, seq: 1 }), false);
  assert.equal(isMovePayload({ x: 2, y: 2, petX: 1057, petY: 4, facing: 'down', moving: true, seq: 1 }), false);
});

test('town state serializes player and server-owned NPC maps for Colyseus synchronization', () => {
  const state = new TownState();
  state.players.set('session-1', new PlayerState());
  const npc = new NpcState();
  Object.assign(npc, { id: 'bongbongee', x: 360, y: 456, moving: true, facing: 'right', updatedAt: 123 });
  state.npcs.set(npc.id, npc);
  const bytes = new Encoder(state).encodeAll();
  const decoded = new TownState();
  assert.doesNotThrow(() => new Decoder(decoded).decode(bytes));
  assert.deepEqual(
    decoded.npcs.get('bongbongee')?.toJSON(),
    { id: 'bongbongee', x: 360, y: 456, facing: 'right', moving: true, updatedAt: 123 },
  );
});
