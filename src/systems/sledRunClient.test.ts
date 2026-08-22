import test from 'node:test';
import assert from 'node:assert/strict';
import { snapshotSledRun, type SledServerSnapshot } from './sledRunClient';

test('sled client projects authoritative room state into immutable renderer data', () => {
  const state: SledServerSnapshot = {
    phase: 'racing',
    leader: 'a',
    difficulty: 'hard',
    seed: 'course-7',
    countdownAt: 0,
    startedAt: 0,
    round: 3,
    serverTime: 12_345,
    racers: [{
      sessionId: 'a', userId: 'user-a', displayName: 'Alice', penguinColor: 'pink', x: 42,
      progress: 900, speed: 430, steering: -1, inputSeq: 12,
      effect: 'ice', effectUntil: 1_500, rank: 0, finishedAt: 0,
    }],
  };

  const snapshot = snapshotSledRun(state, 'a');
  assert.equal(snapshot.localSessionId, 'a');
  assert.equal(snapshot.phase, 'racing');
  assert.equal(snapshot.difficulty, 'hard');
  assert.equal(snapshot.serverTime, 12_345);
  assert.deepEqual(snapshot.racers[0], state.racers[0]);

  state.racers[0]!.progress = 1_000;
  assert.equal(snapshot.racers[0]!.progress, 900);
});
