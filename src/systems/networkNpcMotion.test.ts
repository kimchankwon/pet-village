import assert from 'node:assert/strict';
import test from 'node:test';
import { advanceNpcRenderPose, partitionTownNpcSnapshot, shouldAdvanceNpcRenderPose, stepToward } from './networkNpcMotion';
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

test('server-controlled NPCs freeze while talking or emoting', () => {
  assert.equal(shouldAdvanceNpcRenderPose(true, 1_000, 0), false);
  assert.equal(shouldAdvanceNpcRenderPose(false, 999, 1_000), false);
  assert.equal(shouldAdvanceNpcRenderPose(false, 1_000, 1_000), true);
  // Talk and hop together: still frozen, so a dest update cannot walk them.
  assert.equal(shouldAdvanceNpcRenderPose(true, 999, 1_000), false);
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

test('frame-rate steps toward a plaza point are small and even', () => {
  let pos = { x: 0, y: 0 };
  const target = { x: 100, y: 0 };
  const dt = 1 / 60;
  const speed = 50;
  const distances: number[] = [];
  for (let i = 0; i < 60; i += 1) {
    const next = stepToward(pos, target, speed, dt);
    distances.push(Math.hypot(next.x - pos.x, next.y - pos.y));
    pos = { x: next.x, y: next.y };
  }
  assert.ok(Math.abs(pos.x - 50) < 0.01);
  assert.equal(pos.y, 0);
  assert.ok(distances.every((d) => d > 0.8 && d < 0.9));
  const arrived = stepToward({ x: 97, y: 0 }, target, speed, dt);
  assert.equal(arrived.arrived, true);
  assert.equal(arrived.x, 100);
});
