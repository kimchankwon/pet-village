import assert from 'node:assert/strict';
import test from 'node:test';
import { NpcState, PlayerState, TownState } from '@pet-village/multiplayer-protocol';
import { snapshotNpcs, snapshotPlayers } from './multiplayerClient';

test('multiplayer client tolerates an initial or older state without an NPC map', () => {
  assert.deepEqual(snapshotNpcs({ npcs: undefined } as unknown as TownState), []);
});

test('multiplayer client includes inactive players only while they are playing a game', () => {
  const state = new TownState();
  const gamePlayer = new PlayerState();
  Object.assign(gamePlayer, {
    userId: 'game-user', displayName: 'Game User', petName: 'Mame', petSpecies: 'mametchi',
    x: 10, y: 20, petX: 5, petY: 25, activity: 'fishing', active: false, updatedAt: 2,
  });
  const awayPlayer = new PlayerState();
  Object.assign(awayPlayer, { userId: 'away-user', active: false, activity: '', updatedAt: 3 });
  state.players.set('game-session', gamePlayer);
  state.players.set('away-session', awayPlayer);

  assert.deepEqual(snapshotPlayers(state, 'local-session', 'local-user'), [{
    userId: 'game-user', sessionId: 'game-session', localSessionId: 'local-session', name: 'Game User',
    petName: 'Mame', petSpecies: 'mametchi', penguinColor: 'blue', x: 10, y: 20, petX: 5, petY: 25,
    facing: 'down', moving: false, active: false, activity: 'fishing', updatedAt: 2, waveId: undefined,
    waveTarget: undefined,
  }]);
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
