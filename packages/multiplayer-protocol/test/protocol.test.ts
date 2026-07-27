import test from 'node:test';
import assert from 'node:assert/strict';
import { Decoder, Encoder, MapSchema, Schema, defineTypes } from '@colyseus/schema';
import {
  GAME_ACTIVITIES,
  isGameActivity,
  isMovePayload,
  NpcState,
  PlayerState,
  PROTOCOL_VERSION,
  TownState,
  TOWN_BOUNDS,
} from '../src/index.ts';

test('protocol validates finite sequenced moves within actual town bounds', () => {
  assert.equal(PROTOCOL_VERSION, 3);
  assert.deepEqual(TOWN_BOUNDS, { width: 1056, height: 768 });
  assert.equal(isMovePayload({ x: 1, y: 2, petX: 3, petY: 4, facing: 'down', moving: true, seq: 1 }), true);
  assert.equal(isMovePayload({ x: Infinity, y: 2, petX: 3, petY: 4, facing: 'down', moving: true, seq: 1 }), false);
  assert.equal(isMovePayload({ x: 1057, y: 2, petX: 3, petY: 4, facing: 'down', moving: true, seq: 1 }), false);
  assert.equal(isMovePayload({ x: 2, y: 2, petX: 1057, petY: 4, facing: 'down', moving: true, seq: 1 }), false);
});

test('protocol accepts only known multiplayer game activities', () => {
  assert.deepEqual(GAME_ACTIVITIES, ['fishing', 'get', 'bump', 'skip-rope', 'paper-toss']);
  assert.equal(isGameActivity('fishing'), true);
  assert.equal(isGameActivity('not-a-game'), false);
  assert.equal(isGameActivity(''), false);
});

test('protocol v2 clients keep existing player fields during the v3 rollout', () => {
  class ProtocolV2PlayerState extends Schema {
    declare userId: string;
    declare displayName: string;
    declare petName: string;
    declare petSpecies: string;
    declare penguinColor: string;
    declare x: number;
    declare y: number;
    declare petX: number;
    declare petY: number;
    declare facing: string;
    declare moving: boolean;
    declare active: boolean;
    declare seq: number;
    declare updatedAt: number;
    declare waveId: string;
    declare waveTarget: string;
  }
  defineTypes(ProtocolV2PlayerState, {
    userId: 'string', displayName: 'string', petName: 'string', petSpecies: 'string',
    penguinColor: 'string', x: 'number', y: 'number', petX: 'number', petY: 'number',
    facing: 'string', moving: 'boolean', active: 'boolean', seq: 'number', updatedAt: 'number',
    waveId: 'string', waveTarget: 'string',
  });
  class ProtocolV2TownState extends Schema {
    players = new MapSchema<ProtocolV2PlayerState>();
    npcs = new MapSchema<NpcState>();
  }
  defineTypes(ProtocolV2TownState, {
    players: { map: ProtocolV2PlayerState },
    npcs: { map: NpcState },
  });

  const state = new TownState();
  const player = new PlayerState();
  Object.assign(player, {
    userId: 'user-1', active: false, activity: 'fishing', seq: 7, updatedAt: 123,
    waveId: 'wave-1', waveTarget: 'session-2',
  });
  state.players.set('session-1', player);

  const decoded = new ProtocolV2TownState();
  const encoder = new Encoder(state);
  const decoder = new Decoder(decoded);
  const schemaDiagnostics: unknown[][] = [];
  const originalWarn = console.warn;
  const originalError = console.error;
  console.warn = (...args) => schemaDiagnostics.push(args);
  console.error = (...args) => schemaDiagnostics.push(args);
  try {
    assert.doesNotThrow(() => decoder.decode(encoder.encodeAll()));
    player.seq = 8;
    player.updatedAt = 124;
    player.activity = 'bump';
    assert.doesNotThrow(() => decoder.decode(encoder.encode()));
  } finally {
    console.warn = originalWarn;
    console.error = originalError;
  }
  assert.ok(schemaDiagnostics.length > 0, 'v2 decoder should report the unknown appended v3 field');
  assert.deepEqual(decoded.players.get('session-1')?.toJSON(), {
    userId: 'user-1', displayName: 'Player', petName: 'Pet', petSpecies: '', penguinColor: 'blue',
    x: 0, y: 0, petX: 0, petY: 0, facing: 'down', moving: false, active: false,
    seq: 8, updatedAt: 124, waveId: 'wave-1', waveTarget: 'session-2',
  });
});

test('town state serializes player activity and server-owned NPC maps for Colyseus synchronization', () => {
  const state = new TownState();
  const player = new PlayerState();
  player.activity = 'fishing';
  state.players.set('session-1', player);
  const npc = new NpcState();
  Object.assign(npc, { id: 'bongbongee', x: 360, y: 456, moving: true, facing: 'right', updatedAt: 123 });
  state.npcs.set(npc.id, npc);
  const bytes = new Encoder(state).encodeAll();
  const decoded = new TownState();
  assert.doesNotThrow(() => new Decoder(decoded).decode(bytes));
  assert.equal(decoded.players.get('session-1')?.activity, 'fishing');
  assert.deepEqual(
    decoded.npcs.get('bongbongee')?.toJSON(),
    { id: 'bongbongee', x: 360, y: 456, facing: 'right', moving: true, updatedAt: 123 },
  );
});
