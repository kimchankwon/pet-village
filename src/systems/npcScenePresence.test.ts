import assert from 'node:assert/strict';
import test from 'node:test';
import { NPC_SCENE_ASSIGNMENTS } from './npcAssignments';

test('non-Town NPC assignments are deterministic and disjoint from the authoritative Town roster', () => {
  assert.deepEqual(NPC_SCENE_ASSIGNMENTS.shore, ['thepalee', 'chandalee']);
  assert.deepEqual(NPC_SCENE_ASSIGNMENTS['west-green'], ['choitcherry']);
  assert.deepEqual(NPC_SCENE_ASSIGNMENTS['east-green'], ['jjongtoram']);
  const outsideTown = new Set<string>(Object.values(NPC_SCENE_ASSIGNMENTS).flat());
  const townIds = ['bongbongee', 'shuasumi', 'ocl', 'tamtam', 'foxdungee'];
  for (const id of townIds) assert.equal(outsideTown.has(id), false);
});
