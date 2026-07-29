import test from 'node:test';
import assert from 'node:assert/strict';
import { Decoder, Encoder, MapSchema, Schema, defineTypes } from '@colyseus/schema';
import {
  CHAT_MAX_LENGTH,
  GAME_ACTIVITIES,
  isChatCharacter,
  isGameActivity,
  isMovePayload,
  isWorldScene,
  NpcState,
  PlayerState,
  PROTOCOL_VERSION,
  sanitizeChatText,
  TownState,
  TOWN_BOUNDS,
  WORLD_SCENE_BOUNDS,
  WORLD_SCENES,
  worldSceneSpawn,
} from '../src/index.ts';

test('protocol v9 validates scene-scoped moves within each world bounds', () => {
  assert.equal(PROTOCOL_VERSION, 9);
  // Expanded ice town: 32×22, parks/shore 24×16.
  assert.deepEqual(TOWN_BOUNDS, { width: 1536, height: 1056 });
  assert.deepEqual(WORLD_SCENES, [
    'town', 'shore', 'west-green', 'east-green', 'daniels-shop', 'cafe-cinnamon',
  ]);
  assert.deepEqual(WORLD_SCENE_BOUNDS['west-green'], { width: 1152, height: 768 });
  assert.deepEqual(WORLD_SCENE_BOUNDS['daniels-shop'], { width: 576, height: 624 });
  assert.equal(isWorldScene('east-green'), true);
  assert.equal(isWorldScene('cafe-cinnamon'), true);
  assert.equal(isWorldScene('house'), false);
  assert.equal(isMovePayload({ scene: 'shore', x: 1, y: 2, petX: 3, petY: 4, facing: 'down', moving: true, seq: 1 }), true);
  assert.equal(isMovePayload({ scene: 'shore', x: Infinity, y: 2, petX: 3, petY: 4, facing: 'down', moving: true, seq: 1 }), false);
  assert.equal(isMovePayload({ scene: 'shore', x: 1153, y: 2, petX: 3, petY: 4, facing: 'down', moving: true, seq: 1 }), false);
  assert.equal(isMovePayload({ scene: 'town', x: 1537, y: 2, petX: 3, petY: 4, facing: 'down', moving: true, seq: 1 }), false);
  assert.equal(isMovePayload({ scene: 'house', x: 2, y: 2, petX: 3, petY: 4, facing: 'down', moving: true, seq: 1 }), false);
});
test('world spawn lookup ignores inherited property names', () => {
  assert.deepEqual(worldSceneSpawn('town', 'constructor'), worldSceneSpawn('town'));
  assert.deepEqual(worldSceneSpawn('shore', 'toString'), worldSceneSpawn('shore'));
});

test('protocol accepts only known multiplayer game activities', () => {
  assert.deepEqual(GAME_ACTIVITIES, ['fishing', 'get', 'bump', 'skip-rope', 'paper-toss', 'sled-run']);
  assert.equal(isGameActivity('fishing'), true);
  assert.equal(isGameActivity('not-a-game'), false);
  assert.equal(isGameActivity(''), false);
});

test('protocol v4 clients keep existing player fields during the v7 rollout', () => {
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
    waveId: 'wave-1', waveTarget: 'session-2', chatId: '123:chat-1', chatText: 'hello village',
  });
  state.players.set('session-1', player);

  const decoded = new ProtocolV4TownState();
  const encoder = new Encoder(state);
  const decoder = new Decoder(decoded);
  assert.doesNotThrow(() => decoder.decode(encoder.encodeAll()));
  player.seq = 8;
  player.updatedAt = 124;
  player.activity = 'bump';
  assert.doesNotThrow(() => decoder.decode(encoder.encode()));
  assert.deepEqual(decoded.players.get('session-1')?.toJSON(), {
    userId: 'user-1', displayName: 'Player', petName: 'Pet', petSpecies: '', penguinColor: 'blue',
    x: 0, y: 0, petX: 0, petY: 0, facing: 'down', moving: false, active: false,
    seq: 8, updatedAt: 124, waveId: 'wave-1', waveTarget: 'session-2', activity: 'bump',
  });
});

test('chat text is a single printable line, capped and never empty', () => {
  assert.equal(sanitizeChatText('  hello   village  '), 'hello village');
  assert.equal(sanitizeChatText('penguins 🐧 rule'), 'penguins 🐧 rule');
  // A newline would grow a bubble down into the scene; a bidi override could
  // dress a message up as someone else's. Both flatten to a space.
  assert.equal(sanitizeChatText('one\ntwo'), 'one two');
  assert.equal(sanitizeChatText('one‮two'), 'one two');
  assert.equal(sanitizeChatText('   '), null);
  // Invisible characters cannot post a bubble with nothing in it.
  const ZERO_WIDTH_SPACE = String.fromCodePoint(0x200b);
  const SOFT_HYPHEN = String.fromCodePoint(0x00ad);
  const WORD_JOINER = String.fromCodePoint(0x2060);
  const BYTE_ORDER_MARK = String.fromCodePoint(0xfeff);
  assert.equal(sanitizeChatText(ZERO_WIDTH_SPACE), null);
  assert.equal(sanitizeChatText(`${SOFT_HYPHEN}${WORD_JOINER}${BYTE_ORDER_MARK}`), null);
  assert.equal(sanitizeChatText(`one${ZERO_WIDTH_SPACE}two`), 'one two');
  // Zero-width joiners and variation selectors stay: they are how emoji are built.
  const ZERO_WIDTH_JOINER = String.fromCodePoint(0x200d);
  const VARIATION_SELECTOR = String.fromCodePoint(0xfe0f);
  assert.equal(sanitizeChatText(`${ZERO_WIDTH_JOINER}${VARIATION_SELECTOR}`), null);
  const family = ['\u{1f468}', '\u{1f469}', '\u{1f467}'].join(ZERO_WIDTH_JOINER);
  assert.equal(sanitizeChatText(`family ${family}`), `family ${family}`);
  assert.equal(sanitizeChatText(`love \u2764${VARIATION_SELECTOR}`), `love \u2764${VARIATION_SELECTOR}`);
  assert.equal(sanitizeChatText('\n\t'), null);
  assert.equal(sanitizeChatText(''), null);
  assert.equal(sanitizeChatText(42), null);
  assert.equal(sanitizeChatText(null), null);
  assert.equal(sanitizeChatText('a'.repeat(CHAT_MAX_LENGTH + 40))?.length, CHAT_MAX_LENGTH);
  // Absurdly long input is refused outright rather than trimmed down.
  assert.equal(sanitizeChatText('a'.repeat(CHAT_MAX_LENGTH * 8 + 1)), null);
  // The cap counts characters, so it cannot cut an emoji in half.
  const emoji = sanitizeChatText('🐧'.repeat(CHAT_MAX_LENGTH + 5)) ?? '';
  assert.equal(Array.from(emoji).length, CHAT_MAX_LENGTH);
  assert.ok(!emoji.includes('�'));
});

test('a typed chat character may be a space, but never a control key name', () => {
  assert.equal(isChatCharacter(' '), true);
  assert.equal(isChatCharacter('a'), true);
  assert.equal(isChatCharacter('🐧'), true);
  assert.equal(isChatCharacter('Shift'), false);
  assert.equal(isChatCharacter('\n'), false);
  assert.equal(isChatCharacter(String.fromCodePoint(0x200b)), false);
  assert.equal(isChatCharacter(String.fromCodePoint(0xfeff)), false);
  assert.equal(isChatCharacter(''), false);
});

test('town state serializes player scene, activity, and server-owned NPC maps for Colyseus synchronization', () => {
  const state = new TownState();
  const player = new PlayerState();
  player.activity = 'fishing';
  player.scene = 'shore';
  Object.assign(player, {
    accessoryHeadLeft: 'aqua-clip',
    accessoryHeadRight: 'ear-cloud',
    accessoryBody: 'diamond-tee',
    accessoryExtra: 'carat-sash',
    chatId: '123:chat-1',
    chatText: 'hello village',
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
  assert.equal(decoded.players.get('session-1')?.chatId, '123:chat-1');
  assert.equal(decoded.players.get('session-1')?.chatText, 'hello village');
  assert.deepEqual(
    {
      headLeft: decoded.players.get('session-1')?.accessoryHeadLeft,
      headRight: decoded.players.get('session-1')?.accessoryHeadRight,
      body: decoded.players.get('session-1')?.accessoryBody,
      extra: decoded.players.get('session-1')?.accessoryExtra,
    },
    { headLeft: 'aqua-clip', headRight: 'ear-cloud', body: 'diamond-tee', extra: 'carat-sash' },
  );
  assert.deepEqual(
    decoded.npcs.get('bongbongee')?.toJSON(),
    { id: 'bongbongee', x: 360, y: 456, facing: 'right', moving: true, updatedAt: 123 },
  );
});
