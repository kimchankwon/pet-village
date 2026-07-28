import test from 'node:test';
import assert from 'node:assert/strict';
import { Decoder, Encoder, MapSchema, Schema, defineTypes } from '@colyseus/schema';
import {
  GAME_ACTIVITIES,
  isGameActivity,
  isMovePayload,
  isWorldScene,
  NpcState,
  PlayerState,
  PROTOCOL_VERSION,
  TownState,
  TOWN_BOUNDS,
  WORLD_SCENE_BOUNDS,
  WORLD_SCENES,
} from '../src/index.ts';

test('protocol v6 validates scene-scoped moves within each world bounds', () => {
  assert.equal(PROTOCOL_VERSION, 6);
  assert.deepEqual(TOWN_BOUNDS, { width: 1056, height: 768 });
  assert.deepEqual(WORLD_SCENES, [
    'town', 'shore', 'west-green', 'east-green', 'daniels-shop', 'cafe-cinnamon',
  ]);
  assert.deepEqual(WORLD_SCENE_BOUNDS['west-green'], { width: 768, height: 576 });
  assert.deepEqual(WORLD_SCENE_BOUNDS['daniels-shop'], { width: 576, height: 624 });
  assert.equal(isWorldScene('east-green'), true);
  assert.equal(isWorldScene('cafe-cinnamon'), true);
  assert.equal(isWorldScene('house'), false);
  assert.equal(isMovePayload({ scene: 'shore', x: 1, y: 2, petX: 3, petY: 4, facing: 'down', moving: true, seq: 1 }), true);
  assert.equal(isMovePayload({ scene: 'shore', x: Infinity, y: 2, petX: 3, petY: 4, facing: 'down', moving: true, seq: 1 }), false);
  assert.equal(isMovePayload({ scene: 'shore', x: 865, y: 2, petX: 3, petY: 4, facing: 'down', moving: true, seq: 1 }), false);
  assert.equal(isMovePayload({ scene: 'town', x: 1057, y: 2, petX: 3, petY: 4, facing: 'down', moving: true, seq: 1 }), false);
  assert.equal(isMovePayload({ scene: 'house', x: 2, y: 2, petX: 3, petY: 4, facing: 'down', moving: true, seq: 1 }), false);
});

test('protocol accepts only known multiplayer game activities', () => {
  assert.deepEqual(GAME_ACTIVITIES, ['fishing', 'get', 'bump', 'skip-rope', 'paper-toss', 'sled-run']);
  assert.equal(isGameActivity('fishing'), true);
  assert.equal(isGameActivity('not-a-game'), false);
  assert.equal(isGameActivity(''), false);
});

test('protocol v4 clients keep existing player fields during the v6 rollout', () => {
  class ProtocolV4PlayerState extends Schema {
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
    declare activity: string;
  }
  defineTypes(ProtocolV4PlayerState, {
    userId: 'string', displayName: 'string', petName: 'string', petSpecies: 'string',
    penguinColor: 'string', x: 'number', y: 'number', petX: 'number', petY: 'number',
    facing: 'string', moving: 'boolean', active: 'boolean', seq: 'number', updatedAt: 'number',
    waveId: 'string', waveTarget: 'string', activity: 'string',
  });
  class ProtocolV4TownState extends Schema {
    players = new MapSchema<ProtocolV4PlayerState>();
    npcs = new MapSchema<NpcState>();
  }
  defineTypes(ProtocolV4TownState, {
    players: { map: ProtocolV4PlayerState },
    npcs: { map: NpcState },
  });

  const state = new TownState();
  const player = new PlayerState();
  Object.assign(player, {
    userId: 'user-1', active: false, activity: 'fishing', seq: 7, updatedAt: 123,
    waveId: 'wave-1', waveTarget: 'session-2',
  });
  state.players.set('session-1', player);

  const decoded = new ProtocolV4TownState();
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
  assert.ok(schemaDiagnostics.length > 0, 'v4 decoder should report the unknown appended v5 scene field');
  assert.deepEqual(decoded.players.get('session-1')?.toJSON(), {
    userId: 'user-1', displayName: 'Player', petName: 'Pet', petSpecies: '', penguinColor: 'blue',
    x: 0, y: 0, petX: 0, petY: 0, facing: 'down', moving: false, active: false,
    seq: 8, updatedAt: 124, waveId: 'wave-1', waveTarget: 'session-2', activity: 'bump',
  });
});

test('town state serializes player scene, activity, and server-owned NPC maps for Colyseus synchronization', () => {
  const state = new TownState();
  const player = new PlayerState();
  player.activity = 'fishing';
  player.scene = 'shore';
  Object.assign(player, {
    accessoryHeadLeft: 'mint-pom',
    accessoryHeadRight: 'ear-cloud',
    accessoryBody: 'blue-tee',
    accessoryExtra: 'carat-diamond',
  });
  state.players.set('session-1', player);
  const npc = new NpcState();
  Object.assign(npc, { id: 'bongbongee', x: 360, y: 456, moving: true, facing: 'right', updatedAt: 123 });
  state.npcs.set(npc.id, npc);
  const bytes = new Encoder(state).encodeAll();
  const decoded = new TownState();
  assert.doesNotThrow(() => new Decoder(decoded).decode(bytes));
  assert.equal(decoded.players.get('session-1')?.activity, 'fishing');
  assert.equal(decoded.players.get('session-1')?.scene, 'shore');
  assert.deepEqual(
    {
      headLeft: decoded.players.get('session-1')?.accessoryHeadLeft,
      headRight: decoded.players.get('session-1')?.accessoryHeadRight,
      body: decoded.players.get('session-1')?.accessoryBody,
      extra: decoded.players.get('session-1')?.accessoryExtra,
    },
    { headLeft: 'mint-pom', headRight: 'ear-cloud', body: 'blue-tee', extra: 'carat-diamond' },
  );
  assert.deepEqual(
    decoded.npcs.get('bongbongee')?.toJSON(),
    { id: 'bongbongee', x: 360, y: 456, facing: 'right', moving: true, updatedAt: 123 },
  );
});
