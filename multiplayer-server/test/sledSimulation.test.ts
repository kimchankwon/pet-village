import test from 'node:test';
import assert from 'node:assert/strict';
import { SledRunState, generateSledCourse, sledDifficultyConfig } from '@pet-village/multiplayer-protocol';
import { SledRaceSimulation } from '../src/sledSimulation.ts';

const profile = (id: string) => ({ userId: `user-${id}`, displayName: id, penguinColor: id === 'one' ? 'blue' : 'pink' });

function setup() {
  const state = new SledRunState();
  const simulation = new SledRaceSimulation(state, () => 'fixed-seed');
  return { state, simulation };
}

test('sled lobby caps at four racers and transfers leadership when the leader leaves', () => {
  const { state, simulation } = setup();
  for (const id of ['one', 'two', 'three', 'four']) assert.equal(simulation.join(id, profile(id)), true);
  assert.equal(simulation.join('duplicate', profile('one')), false);
  assert.equal(simulation.join('five', profile('five')), false);
  assert.equal(state.racers.size, 4);
  assert.equal(state.leader, 'one');
  simulation.leave('one');
  assert.equal(state.leader, 'two');
  assert.equal(state.racers.has('one'), false);
});

test('only the leader can choose difficulty and start one synchronized countdown', () => {
  const { state, simulation } = setup();
  simulation.join('one', profile('one'));
  simulation.join('two', profile('two'));
  assert.equal(simulation.setDifficulty('two', 'hard'), false);
  assert.equal(simulation.setDifficulty('one', 'hard'), true);
  assert.equal(simulation.start('two', 1_000), false);
  assert.equal(simulation.start('one', 1_000), true);
  assert.equal(state.phase, 'countdown');
  assert.equal(state.countdownAt, 4_000);
  assert.equal(state.difficulty, 'hard');
  assert.equal(state.seed, 'fixed-seed');
  assert.equal(simulation.start('one', 1_001), false);
  simulation.step(2_999, 3_999);
  assert.equal(state.phase, 'countdown');
  simulation.step(1, 4_000);
  assert.equal(state.phase, 'racing');
  assert.equal(state.startedAt, 4_000);
});

test('server accepts only monotonic steering and keeps racers inside the mountain', () => {
  const { state, simulation } = setup();
  simulation.join('one', profile('one'));
  simulation.start('one', 0);
  simulation.step(3_000, 3_000);
  assert.equal(simulation.input('one', { steering: 1, seq: 1 }, 100), true);
  assert.equal(simulation.input('one', { steering: -1, seq: 1 }, 100), false);
  assert.equal(simulation.input('one', { steering: -1, seq: 2 }, 105), false);
  assert.equal(simulation.input('one', { steering: -1, seq: 2 }, 112), true);
  simulation.stopInput('one');
  assert.equal(state.racers.get('one')!.steering, 0);
  assert.equal(state.racers.get('one')!.inputSeq, 2);
  simulation.step(10_000, 13_000);
  const racer = state.racers.get('one')!;
  assert.equal(racer.inputSeq, 2);
  assert.ok(racer.x <= sledDifficultyConfig('easy').trackHalfWidth);
});

test('authoritative simulation applies obstacle slowdowns and ice boosts visible in shared state', () => {
  const { state, simulation } = setup();
  simulation.join('one', profile('one'));
  simulation.start('one', 0);
  simulation.step(3_000, 3_000);
  const racer = state.racers.get('one')!;
  const course = generateSledCourse('fixed-seed', 'easy');
  const obstacle = course.find((item) => item.kind !== 'ice')!;
  racer.x = obstacle.x;
  racer.progress = obstacle.progress - 1;
  simulation.step(20, 3_020);
  assert.equal(racer.effect, 'obstacle');
  const slowed = racer.speed;
  const ice = course.find((item) => item.kind === 'ice')!;
  racer.x = ice.x;
  racer.progress = ice.progress - 1;
  simulation.step(20, 5_000);
  assert.equal(racer.effect, 'ice');
  assert.ok(racer.speed > slowed);
});

test('race assigns stable finish ranks and enters finished phase when every racer crosses', () => {
  const { state, simulation } = setup();
  simulation.join('one', profile('one'));
  simulation.join('two', profile('two'));
  simulation.start('one', 0);
  simulation.step(3_000, 3_000);
  const finish = sledDifficultyConfig('easy').courseLength;
  state.racers.get('one')!.progress = finish - 1;
  simulation.step(20, 3_020);
  assert.equal(state.racers.get('one')!.rank, 1);
  assert.equal(state.phase, 'racing');
  state.racers.get('two')!.progress = finish - 1;
  simulation.step(20, 3_040);
  assert.equal(state.racers.get('two')!.rank, 2);
  assert.equal(state.phase, 'finished');
});

test('same-tick finishers are ranked by estimated line-crossing time', () => {
  const { state, simulation } = setup();
  simulation.join('one', profile('one'));
  simulation.join('two', profile('two'));
  simulation.start('one', 0);
  simulation.step(3_000, 3_000);
  const finish = sledDifficultyConfig('easy').courseLength;
  state.racers.get('one')!.progress = finish - 10;
  state.racers.get('two')!.progress = finish - 1;

  simulation.step(100, 3_100);

  assert.equal(state.racers.get('two')!.rank, 1);
  assert.equal(state.racers.get('one')!.rank, 2);
  assert.ok(state.racers.get('two')!.finishedAt < state.racers.get('one')!.finishedAt);
});

test('a late racer keeps finished results until the leader starts the next run', () => {
  const { state, simulation } = setup();
  simulation.join('one', profile('one'));
  simulation.setDifficulty('one', 'hard');
  simulation.start('one', 1_000);
  simulation.step(1, 4_000);
  const finish = sledDifficultyConfig('hard').courseLength;
  state.racers.get('one')!.progress = finish - 1;
  simulation.step(20, 4_020);
  assert.equal(state.phase, 'finished');

  assert.equal(simulation.join('two', profile('two')), true);
  assert.equal(state.phase, 'finished');
  assert.equal(state.difficulty, 'hard');
  assert.equal(state.racers.get('one')!.rank, 1);
  assert.equal(state.racers.get('one')!.progress, finish);
  assert.equal(state.racers.get('two')!.rank, 0);

  assert.equal(simulation.start('one', 5_000), true);
  assert.equal(state.phase, 'countdown');
  assert.ok([...state.racers.values()].every((racer) => racer.rank === 0 && racer.progress === 0));
});
