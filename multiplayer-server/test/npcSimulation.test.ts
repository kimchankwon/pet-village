import assert from 'node:assert/strict';
import test from 'node:test';
import { MapSchema } from '@colyseus/schema';
import { NpcState, TOWN_BOUNDS } from '@pet-village/multiplayer-protocol';
import { TownNpcSimulation } from '../src/npcSimulation.ts';

test('server initializes the authoritative Town NPC roster', () => {
  const states = new MapSchema<NpcState>();
  new TownNpcSimulation(states, 1_000);

  assert.deepEqual([...states.keys()].sort(), [
    'bongbongee', 'foxdungee', 'ocl', 'shuasumi', 'tamtam',
  ]);
  for (const npc of states.values()) {
    assert.equal(npc.x >= 0 && npc.x <= TOWN_BOUNDS.width, true);
    assert.equal(npc.y >= 0 && npc.y <= TOWN_BOUNDS.height, true);
    assert.equal(npc.updatedAt, 1_000);
  }
});

test('server advances NPC positions deterministically for every client snapshot', () => {
  const firstStates = new MapSchema<NpcState>();
  const secondStates = new MapSchema<NpcState>();
  const first = new TownNpcSimulation(firstStates, 1_000);
  const second = new TownNpcSimulation(secondStates, 1_000);
  const before = firstStates.get('bongbongee')!.x;

  first.step(1_000, 2_000);
  second.step(1_000, 2_000);

  assert.notEqual(firstStates.get('bongbongee')!.x, before);
  assert.deepEqual(
    [...firstStates.values()].map((npc) => ({ id: npc.id, x: npc.x, y: npc.y, facing: npc.facing, moving: npc.moving })),
    [...secondStates.values()].map((npc) => ({ id: npc.id, x: npc.x, y: npc.y, facing: npc.facing, moving: npc.moving })),
  );
});
