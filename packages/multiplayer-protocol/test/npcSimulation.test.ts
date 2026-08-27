import assert from 'node:assert/strict';
import test from 'node:test';
import { TOWN_BOUNDS } from '../src/index.ts';
import {
  NPC_MAX_CATCH_UP_MS,
  NPC_SIM_STEP_MS,
  TOWN_RESIDENT_COUNT,
  TOWN_ROSTER_SHIFT_MS,
  TownNpcSimulation,
  advanceTownNpcSimulation,
  townRosterAt,
  type NpcSnapshot,
} from '../src/npcSimulation.ts';
import { townNpcDef, townNpcPoint } from '../src/townNpcs.ts';

test('server initializes the authoritative Town NPC roster', () => {
  const states = new Map<string, NpcSnapshot>();
  new TownNpcSimulation(states, 1_000);

  assert.deepEqual([...states.keys()].sort(), ['bongbongee', ...townRosterAt(1_000)].sort());
  assert.equal(states.size, TOWN_RESIDENT_COUNT + 1);
  for (const npc of states.values()) {
    assert.equal(npc.x >= 0 && npc.x <= TOWN_BOUNDS.width, true);
    assert.equal(npc.y >= 0 && npc.y <= TOWN_BOUNDS.height, true);
    assert.equal(npc.updatedAt, 1_000);
  }
});

test('server advances NPC positions deterministically for every client snapshot', () => {
  const firstStates = new Map<string, NpcSnapshot>();
  const secondStates = new Map<string, NpcSnapshot>();
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

test('the Town roster moves along on the clock, one villager at a time', () => {
  const first = townRosterAt(0);
  const next = townRosterAt(TOWN_ROSTER_SHIFT_MS);
  assert.equal(first.length, TOWN_RESIDENT_COUNT);
  assert.equal(new Set(first).size, TOWN_RESIDENT_COUNT, 'nobody is in Town twice');
  assert.deepEqual(townRosterAt(TOWN_ROSTER_SHIFT_MS - 1), first, 'stable within a shift');
  assert.notDeepEqual(next, first);
  assert.equal(
    next.filter((id) => first.includes(id)).length,
    TOWN_RESIDENT_COUNT - 1,
    'one leaves and one arrives, so the square is never emptied at once',
  );
  // The Shore and the Greens keep their own villagers; Town never doubles them.
  const reserved = new Set(['thepalee', 'chandalee', 'choitcherry', 'jjongtoram']);
  const everyone = new Set<string>();
  for (let shift = 0; shift < 40; shift += 1) {
    for (const id of townRosterAt(shift * TOWN_ROSTER_SHIFT_MS)) {
      assert.equal(reserved.has(id), false, `${id} lives outside Town`);
      everyone.add(id);
    }
  }
  assert.ok(everyone.size >= 9, `expected every resident to get a turn, saw ${everyone.size}`);
});

test('a running room swaps residents in and out without disturbing the rest', () => {
  const states = new Map<string, NpcSnapshot>();
  const simulation = new TownNpcSimulation(states, 0);
  const leaving = townRosterAt(0).find((id) => !townRosterAt(TOWN_ROSTER_SHIFT_MS).includes(id))!;
  const staying = townRosterAt(0).find((id) => id !== leaving)!;
  simulation.step(50, 1_000);
  const stayingAt = { x: states.get(staying)!.x, y: states.get(staying)!.y };

  simulation.step(50, TOWN_ROSTER_SHIFT_MS);

  assert.equal(states.has(leaving), false, 'their shift is over');
  assert.deepEqual([...states.keys()].sort(), ['bongbongee', ...townRosterAt(TOWN_ROSTER_SHIFT_MS)].sort());
  assert.equal(states.has('bongbongee'), true, 'Bongbongee never leaves');
  assert.notDeepEqual({ x: states.get(staying)!.x, y: states.get(staying)!.y }, stayingAt);
  const arriving = states.get(townRosterAt(TOWN_ROSTER_SHIFT_MS).find((id) => !townRosterAt(0).includes(id))!)!;
  assert.equal(arriving.updatedAt, TOWN_ROSTER_SHIFT_MS, 'arrivals start on their home patch');
});

test('a long tick gap resumes from stored poses instead of replaying the hour', () => {
  const states = new Map<string, NpcSnapshot>();
  const start = 1_000;
  new TownNpcSimulation(states, start);
  const frozen = states.get('bongbongee')!;
  const before = { x: frozen.x, y: frozen.y };
  const now = start + 60 * 60 * 1000;
  const t = advanceTownNpcSimulation(states, start, now);
  assert.equal(t, now);
  assert.ok(now - t <= NPC_SIM_STEP_MS);
  const after = states.get('bongbongee')!;
  const moved = Math.hypot(after.x - before.x, after.y - before.y);
  assert.ok(moved > 0, 'they take a step from where they were');
  assert.ok(moved < 80, 'they do not teleport through an hour of waypoints');
  assert.equal(t - start > NPC_MAX_CATCH_UP_MS, true);
});

test('incomplete snapshots still walk toward a waypoint instead of throwing', () => {
  const states = new Map<string, NpcSnapshot>();
  states.set('bongbongee', {
    id: 'bongbongee',
    x: 200,
    y: 200,
    facing: 'right',
    moving: false,
    updatedAt: 1_000,
    destination: Number.NaN,
    pauseUntil: Number.NaN,
  });
  const t = advanceTownNpcSimulation(states, 1_000, 1_000 + NPC_SIM_STEP_MS * 3);
  assert.equal(t, 1_000 + NPC_SIM_STEP_MS * 3);
  const bong = states.get('bongbongee')!;
  assert.notDeepEqual({ x: bong.x, y: bong.y }, { x: 200, y: 200 });
  assert.equal(Number.isInteger(bong.destination), true);
});

test('plaza points are the shared waypoint list, not live poses', () => {
  const def = townNpcDef('bongbongee');
  assert.ok(def);
  assert.equal(def.waypoints.length, 5);
  assert.deepEqual(townNpcPoint('bongbongee', 1), def.waypoints[1]);
  assert.deepEqual(townNpcPoint('bongbongee', 6), def.waypoints[1]);
  assert.equal(townNpcPoint('nobody', 0), null);
  assert.ok(townNpcDef('ocl'));
});
