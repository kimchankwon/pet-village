import assert from 'node:assert/strict';
import test from 'node:test';
import { NpcState, PlayerState, TownState } from '@pet-village/multiplayer-protocol';
import { snapshotNpcs, snapshotPlayers } from './multiplayerClient';

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
    waveTarget: undefined,
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
