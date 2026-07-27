import assert from 'node:assert/strict';
import test from 'node:test';
import { advanceNpcRenderPose, partitionTownNpcSnapshot } from './networkNpcMotion';
import type { RemoteNpc } from './multiplayerBridge';

test('authoritative roster partitions Bongbongee and removes it when omitted', () => {
  const npc = (id: string): RemoteNpc => ({ id, x: 1, y: 2, facing: 'right', moving: false, updatedAt: 3 });
  assert.deepEqual(partitionTownNpcSnapshot([npc('bongbongee'), npc('ocl')]), {
    bongbongee: npc('bongbongee'),
    miniteens: [npc('ocl')],
  });
  assert.deepEqual(partitionTownNpcSnapshot([npc('ocl')]), {
    bongbongee: null,
    miniteens: [npc('ocl')],
  });
});

test('server-owned NPC render poses interpolate toward the authoritative snapshot', () => {
  assert.deepEqual(
    advanceNpcRenderPose({ x: 0, y: 20 }, { x: 100, y: 60 }, 0.25),
    { x: 25, y: 30 },
  );
});

test('server-owned NPC render poses snap tiny residual distances', () => {
  assert.deepEqual(
    advanceNpcRenderPose({ x: 99.6, y: 60.3 }, { x: 100, y: 60 }, 0.25),
    { x: 100, y: 60 },
  );
});
