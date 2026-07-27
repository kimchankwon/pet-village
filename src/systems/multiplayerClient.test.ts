import assert from 'node:assert/strict';
import test from 'node:test';
import { NpcState, TownState } from '@pet-village/multiplayer-protocol';
import { snapshotNpcs } from './multiplayerClient';

test('multiplayer client tolerates an initial or older state without an NPC map', () => {
  assert.deepEqual(snapshotNpcs({ npcs: undefined } as unknown as TownState), []);
});

test('multiplayer client projects synchronized NPC schema into renderer snapshots', () => {
  const state = new TownState();
  const npc = new NpcState();
  Object.assign(npc, { id: 'bongbongee', x: 360, y: 456, facing: 'left', moving: true, updatedAt: 123 });
  state.npcs.set(npc.id, npc);

  assert.deepEqual(snapshotNpcs(state), [
    { id: 'bongbongee', x: 360, y: 456, facing: 'left', moving: true, updatedAt: 123 },
  ]);
});
