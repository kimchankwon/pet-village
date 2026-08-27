import assert from 'node:assert/strict';
import test from 'node:test';
import { NpcState, PlayerState, TownState } from '@pet-village/multiplayer-protocol';
import {
  applyVillageSnapshot,
  connectMultiplayer,
  snapshotNpcs,
  snapshotPlayers,
  snapshotRoster,
  type VillageSnapshot,
} from './multiplayerClient';
import { multiplayerBridge, type RemotePresence } from './multiplayerBridge';
import { setConvexWorldClient, type ConvexWorldClient, type MoveArgs } from './convexWorld';

test('multiplayer client tolerates an initial or older state without an NPC map', () => {
  assert.deepEqual(snapshotNpcs({ npcs: undefined } as unknown as TownState), []);
});

test('multiplayer client excludes disconnected and wrong-scene peers', () => {
  const state = new TownState();
  const shorePlayer = new PlayerState();
  Object.assign(shorePlayer, {
    userId: 'shore-user', displayName: 'Shore User', petName: 'Mame', petSpecies: 'mametchi',
    x: 10, y: 20, petX: 5, petY: 25, activity: '', active: true, updatedAt: 2,
    scene: 'shore', accessoryHeadLeft: 'mini-crown', accessoryBody: 'ribbon-tie',
    petEmote: 'happy', petEmoteId: '1000:expr-1',
  });
  const awayPlayer = new PlayerState();
  Object.assign(awayPlayer, { userId: 'away-user', active: false, activity: '', updatedAt: 3, scene: 'shore' });
  const townPlayer = new PlayerState();
  Object.assign(townPlayer, { userId: 'town-user', active: true, activity: '', updatedAt: 4, scene: 'town' });
  state.players.set('shore-session', shorePlayer);
  state.players.set('away-session', awayPlayer);
  state.players.set('town-session', townPlayer);

  assert.deepEqual(snapshotPlayers(state, 'local-session', 'local-user', 'shore'), [{
    userId: 'shore-user', sessionId: 'shore-session', localSessionId: 'local-session', name: 'Shore User',
    petName: 'Mame', petSpecies: 'mametchi', penguinColor: 'blue', equippedAccessories: { headLeft: 'mini-crown', body: 'ribbon-tie' }, x: 10, y: 20, petX: 5, petY: 25,
    facing: 'down', moving: false, active: true, activity: '', sceneId: 'shore', updatedAt: 2, waveId: undefined,
    waveTarget: undefined, chatId: undefined, chatText: undefined, emote: '',
    petEmote: 'happy', petEmoteId: '1000:expr-1',
  }]);
});

test('multiplayer client retains non-interactive activity ghosts in their last world scene', () => {
  const state = new TownState();
  const fishingPlayer = new PlayerState();
  Object.assign(fishingPlayer, {
    userId: 'fishing-user',
    displayName: 'Fishing User',
    petName: 'Mochi',
    petSpecies: 'mametchi',
    x: 100,
    y: 200,
    petX: 80,
    petY: 210,
    activity: 'fishing',
    active: false,
    updatedAt: 5,
    scene: 'shore',
  });
  state.players.set('fishing-session', fishingPlayer);

  const [row] = snapshotPlayers(state, 'local-session', 'local-user', 'shore');
  assert.equal(row?.activity, 'fishing');
  assert.equal(row?.active, false);
  assert.equal(row?.sceneId, 'shore');
});

test('multiplayer client projects synchronized NPC schema into renderer snapshots', () => {
  const state = new TownState();
  const npc = new NpcState();
  Object.assign(npc, { id: 'bongbongee', x: 360, y: 456, facing: 'left', moving: true, updatedAt: 123 });
  state.npcs.set(npc.id, npc);

  assert.deepEqual(snapshotNpcs(state), [
    {
      id: 'bongbongee', x: 360, y: 456, facing: 'left', moving: true, updatedAt: 123,
      destination: 1, pauseUntil: 0,
    },
  ]);
});

test('the roster is everyone on the server, whatever scene they are standing in', () => {
  const state = new TownState();
  const shore = new PlayerState();
  Object.assign(shore, { userId: 'shore-user', displayName: 'Shore User', active: true, activity: '', updatedAt: 2, scene: 'shore' });
  const town = new PlayerState();
  Object.assign(town, { userId: 'town-user', displayName: 'Town User', active: true, activity: '', updatedAt: 4, scene: 'town' });
  const resting = new PlayerState();
  Object.assign(resting, { userId: 'away-user', displayName: 'Away User', active: false, activity: '', updatedAt: 3, scene: 'shore' });
  const self = new PlayerState();
  Object.assign(self, { userId: 'local-user', displayName: 'Me', active: true, activity: '', updatedAt: 5, scene: 'town' });
  state.players.set('shore-session', shore);
  state.players.set('town-session', town);
  state.players.set('away-session', resting);
  state.players.set('local-session', self);

  // The rendering snapshot is filtered to one scene, and has to stay that way —
  // it is what draws the avatars standing in front of you.
  assert.deepEqual(
    snapshotPlayers(state, 'local-session', 'local-user', 'shore').map((row) => row.sessionId),
    ['shore-session'],
  );
  // The roster is not: a villager in another scene is still in the village, and
  // walking from Town to the Shore must not read as leaving and rejoining.
  assert.deepEqual(
    snapshotRoster(state, 'local-session', 'local-user').map((row) => row.name).sort(),
    ['Away User', 'Shore User', 'Town User'],
  );
});

test('the roster leaves out yourself, however many sessions you are holding', () => {
  const state = new TownState();
  // A reconnect inside the grace window leaves the old session behind for a
  // moment; one player is one villager, not an arrival.
  const stale = new PlayerState();
  Object.assign(stale, { userId: 'local-user', displayName: 'Me', active: false, updatedAt: 1, scene: 'town' });
  const fresh = new PlayerState();
  Object.assign(fresh, { userId: 'local-user', displayName: 'Me', active: true, updatedAt: 9, scene: 'shore' });
  const other = new PlayerState();
  Object.assign(other, { userId: 'other-user', displayName: 'Bo', active: true, updatedAt: 2, scene: 'town' });
  state.players.set('stale-session', stale);
  state.players.set('local-session', fresh);
  state.players.set('other-session', other);

  assert.deepEqual(
    snapshotRoster(state, 'local-session', 'local-user').map((row) => row.name),
    ['Bo'],
  );
});

function bridgeActions() {
  return {
    send: () => {},
    setActive: () => {},
    setActivity: () => {},
    setScene: () => {},
    updateProfile: () => {},
    leave: () => {},
    wave: () => {},
    emote: () => {},
    petEmote: () => {},
    chat: () => {},
  };
}

function villageSnapshot(x: number, peerName = 'Peer'): VillageSnapshot {
  return {
    userId: 'own-user',
    players: [{
      sessionId: 'peer-session',
      userId: 'peer-user',
      displayName: peerName,
      scene: 'town',
      active: true,
      activity: '',
      x,
      y: 0,
      petX: 0,
      petY: 0,
      updatedAt: x,
    }],
    npcs: [],
  };
}

test('a snapshot that changes nothing is not re-applied', () => {
  const seen: RemotePresence[][] = [];
  const unsubscribe = multiplayerBridge.subscribe((rows) => seen.push(rows));
  const connectionId = multiplayerBridge.install(bridgeActions());
  seen.length = 0;

  // Your own steps re-publish the whole village ten times a second; the peers
  // in it have not moved, and re-diffing them costs frames.
  applyVillageSnapshot(connectionId, villageSnapshot(10), 'local-session');
  applyVillageSnapshot(connectionId, villageSnapshot(10), 'local-session');
  assert.equal(seen.length, 1);
  assert.deepEqual(seen[0]?.map((row) => row.x), [10]);

  applyVillageSnapshot(connectionId, villageSnapshot(20), 'local-session');
  assert.equal(seen.length, 2);
  assert.deepEqual(seen[1]?.map((row) => row.x), [20]);

  // A scene change re-filters the roster, so it has to bypass the cache.
  applyVillageSnapshot(connectionId, villageSnapshot(20), 'local-session', true);
  assert.equal(seen.length, 3);

  multiplayerBridge.uninstall(connectionId);
  unsubscribe();
});

test('a reconnect re-applies the village it had already drawn', () => {
  const seen: RemotePresence[][] = [];
  const unsubscribe = multiplayerBridge.subscribe((rows) => seen.push(rows));
  const first = multiplayerBridge.install(bridgeActions());
  applyVillageSnapshot(first, villageSnapshot(10), 'local-session');
  const second = multiplayerBridge.install(bridgeActions());
  seen.length = 0;

  // install() clears the peers, so the identical snapshot the new connection
  // opens with is not redundant — it is the only thing that puts them back.
  applyVillageSnapshot(second, villageSnapshot(10), 'local-session');
  assert.deepEqual(seen.map((rows) => rows.length), [1]);

  multiplayerBridge.uninstall(second);
  unsubscribe();
});

const WORLD_POSE = { x: 0, y: 0, petX: 0, petY: 0, facing: 'down' as const, moving: true };

/** Let the promise chain behind a settled move mutation run to completion. */
function flushMicrotasks() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

test('only one move mutation is in flight, and it carries the newest pose', async () => {
  const moves: MoveArgs[] = [];
  const settle: Array<() => void> = [];
  const stub = () => Promise.resolve({} as never);
  setConvexWorldClient({
    join: async () => ({ sessionId: 'local-session', userId: 'own-user' }),
    leave: stub,
    move: (args) => {
      moves.push(args);
      return new Promise((resolve) => settle.push(() => resolve({})));
    },
    setActive: async () => ({}),
    setActivity: stub,
    refreshProfile: async () => ({ ok: true }),
    wave: stub,
    emote: stub,
    petEmote: stub,
    chat: stub,
    sledJoin: async () => ({ sessionId: 'sled' }),
    sledLeave: stub,
    sledDifficulty: stub,
    sledStart: stub,
    sledInput: stub,
    sledHit: async () => ({ rejected: [] }),
  } as ConvexWorldClient);

  const connection = await connectMultiplayer('blue', () => true);
  const releaseWorld = multiplayerBridge.activateWorld('town', { ...WORLD_POSE, moving: false });

  multiplayerBridge.send({ ...WORLD_POSE, x: 10 });
  multiplayerBridge.send({ ...WORLD_POSE, x: 20 });
  multiplayerBridge.send({ ...WORLD_POSE, x: 30 });
  // The scene offers a pose every 100ms regardless of the network; only the
  // first goes out, and the two behind it collapse into one.
  assert.deepEqual(moves.map((move) => move.x), [10]);

  settle[0]?.();
  await flushMicrotasks();
  assert.deepEqual(moves.map((move) => move.x), [10, 30]);

  // Nothing left to say once the queue has drained.
  settle[1]?.();
  await flushMicrotasks();
  assert.deepEqual(moves.map((move) => move.x), [10, 30]);

  // Sequence numbers still only ever climb, so the server keeps rejecting
  // genuinely out-of-order moves.
  assert.ok(moves[1]!.seq > moves[0]!.seq);

  releaseWorld();
  await connection.disconnect();
  setConvexWorldClient(null);
});
