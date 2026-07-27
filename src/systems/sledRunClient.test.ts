import test from 'node:test';
import assert from 'node:assert/strict';
import { SledPlayerState, SledRunState } from '@pet-village/multiplayer-protocol';
import { snapshotSledRun } from './sledRunClient';

test('sled client projects authoritative room state into immutable renderer data', () => {
  const state = new SledRunState();
  state.phase = 'racing';
  state.leader = 'a';
  state.difficulty = 'hard';
  state.seed = 'course-7';
  state.round = 3;
  const racer = new SledPlayerState();
  Object.assign(racer, {
    userId: 'user-a', displayName: 'Alice', penguinColor: 'pink', x: 42,
    progress: 900, speed: 430, effect: 'ice', effectUntil: 1_500, rank: 0,
  });
  state.racers.set('a', racer);

  const snapshot = snapshotSledRun(state, 'a');
  assert.equal(snapshot.localSessionId, 'a');
  assert.equal(snapshot.phase, 'racing');
  assert.equal(snapshot.difficulty, 'hard');
  assert.deepEqual(snapshot.racers[0], {
    sessionId: 'a', userId: 'user-a', displayName: 'Alice', penguinColor: 'pink',
    x: 42, progress: 900, speed: 430, effect: 'ice', effectUntil: 1_500,
    rank: 0, finishedAt: 0,
  });

  racer.progress = 1_000;
  assert.equal(snapshot.racers[0]!.progress, 900);
});
