import assert from 'node:assert/strict';
import test from 'node:test';
import { NpcState, PlayerState, TownState } from '@pet-village/multiplayer-protocol';
import { snapshotNpcs, snapshotPlayers, snapshotRoster } from './multiplayerClient';

test('multiplayer client tolerates an initial or older state without an NPC map', () => {
  assert.deepEqual(snapshotNpcs({ npcs: undefined } as unknown as TownState), []);
});

test('multiplayer client excludes disconnected and wrong-scene peers', () => {
  const state = new TownState();
  const shorePlayer = new PlayerState();
  Object.assign(shorePlayer, {
    userId: 'shore-user', displayName: 'Shore User', petName: 'Mame', petSpecies: 'mametchi',
    x: 10, y: 20, petX: 5, petY: 25, activity: '', active: true, updatedAt: 2,
    scene: 'shore', accessoryHeadLeft: 'mint-pom', accessoryBody: 'blue-tee',
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
    petName: 'Mame', petSpecies: 'mametchi', penguinColor: 'blue', equippedAccessories: { headLeft: 'mint-pom', body: 'blue-tee' }, x: 10, y: 20, petX: 5, petY: 25,
    facing: 'down', moving: false, active: true, activity: '', sceneId: 'shore', updatedAt: 2, waveId: undefined,
    waveTarget: undefined, chatId: undefined, chatText: undefined,
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
    { id: 'bongbongee', x: 360, y: 456, facing: 'left', moving: true, updatedAt: 123 },
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
