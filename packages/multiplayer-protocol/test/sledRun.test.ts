import test from 'node:test';
import assert from 'node:assert/strict';
import { Decoder, Encoder } from '@colyseus/schema';
import {
  GAME_ACTIVITIES,
  SLED_DIFFICULTIES,
  SLED_HIT_TOLERANCE_MS,
  SLED_MAX_PLAYERS,
  SledPlayerState,
  SledRunState,
  generateSledCourse,
  isSledHitPlausible,
  sledDifficultyConfig,
} from '../src/index.ts';

test('sled run is a synchronized four-player game with three difficulty levels', () => {
  assert.equal(GAME_ACTIVITIES.includes('sled-run'), true);
  assert.deepEqual(SLED_DIFFICULTIES, ['easy', 'medium', 'hard']);
  assert.equal(SLED_MAX_PLAYERS, 4);
});

test('sled courses are deterministic for a seed and denser at higher difficulties', () => {
  const first = generateSledCourse('mountain-42', 'medium');
  const repeat = generateSledCourse('mountain-42', 'medium');
  const other = generateSledCourse('mountain-43', 'medium');
  assert.deepEqual(first, repeat);
  assert.notDeepEqual(first, other);

  const easy = generateSledCourse('same-seed', 'easy');
  const medium = generateSledCourse('same-seed', 'medium');
  const hard = generateSledCourse('same-seed', 'hard');
  assert.equal(easy.filter((item) => item.kind !== 'ice').length, sledDifficultyConfig('easy').obstacleCount);
  assert.equal(medium.filter((item) => item.kind !== 'ice').length, sledDifficultyConfig('medium').obstacleCount);
  assert.equal(hard.filter((item) => item.kind !== 'ice').length, sledDifficultyConfig('hard').obstacleCount);
  assert.ok(easy.length < medium.length && medium.length < hard.length);
});

test('generated sled courses stay inside the mountain with evenly spaced hazards', () => {
  for (const difficulty of SLED_DIFFICULTIES) {
    const config = sledDifficultyConfig(difficulty);
    const course = generateSledCourse('bounds-check', difficulty);
    for (const item of course) {
      assert.ok(Math.abs(item.x) <= config.trackHalfWidth - item.radius);
      assert.ok(item.progress >= config.spawnClearance);
      assert.ok(item.progress <= config.courseLength - config.finishClearance);
    }
    const step = (config.courseLength - config.spawnClearance - config.finishClearance) / course.length;
    for (let index = 1; index < course.length; index += 1) {
      assert.ok(course[index]!.progress - course[index - 1]!.progress >= Math.floor(step) - 1);
    }
  }
});

test('a reported collision is plausible from a lagging copy of the racer, up to a point', () => {
  const config = sledDifficultyConfig('easy');
  const item = { id: 'rock-2', kind: 'rock' as const, x: 40, progress: 2_000, radius: 28 };
  // Sitting on it, which is what the server sees when the report is fast.
  assert.equal(isSledHitPlausible(item, { progress: 2_000, x: 40 }, config), true);
  // The server is behind by the report's own trip, so it has the sled short of the
  // item — and after a bad round trip, well short. Both have to be allowed.
  const behind = config.baseSpeed * (SLED_HIT_TOLERANCE_MS / 1_000);
  assert.equal(isSledHitPlausible(item, { progress: 2_000 - behind, x: 40 }, config), true);
  assert.equal(isSledHitPlausible(item, { progress: 2_000 - behind * 3, x: 40 }, config), false);
  // A steer the server has not applied yet moves the lane, but only so far.
  const swerve = config.steeringSpeed * (SLED_HIT_TOLERANCE_MS / 1_000);
  assert.equal(isSledHitPlausible(item, { progress: 2_000, x: 40 + swerve }, config), true);
  assert.equal(isSledHitPlausible(item, { progress: 2_000, x: 40 + swerve * 3 }, config), false);
  // The far end of the course is never a claim worth honouring.
  assert.equal(isSledHitPlausible(item, { progress: 100, x: 40 }, config), false);
});

test('sled lobby and racer state survive a full schema encode and decode', () => {
  const state = new SledRunState();
  state.phase = 'countdown';
  state.leader = 'session-1';
  state.difficulty = 'hard';
  state.seed = 'race-seed';
  state.countdownAt = 1234;
  state.serverTime = 1_000;
  const racer = new SledPlayerState();
  Object.assign(racer, {
    userId: 'user-1',
    displayName: 'Daniel',
    penguinColor: 'blue',
    x: 25,
    progress: 300,
    speed: 420,
    effect: 'ice',
    rank: 1,
  });
  state.racers.set('session-1', racer);

  const decoded = new SledRunState();
  new Decoder(decoded).decode(new Encoder(state).encodeAll());
  assert.equal(decoded.phase, 'countdown');
  assert.equal(decoded.leader, 'session-1');
  assert.equal(decoded.difficulty, 'hard');
  assert.equal(decoded.seed, 'race-seed');
  assert.equal(decoded.countdownAt, 1234);
  assert.equal(decoded.serverTime, 1_000);
  assert.deepEqual(decoded.racers.get('session-1')?.toJSON(), racer.toJSON());
});
