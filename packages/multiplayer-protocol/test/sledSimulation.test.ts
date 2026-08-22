import test from 'node:test';
import assert from 'node:assert/strict';
import { SledRunState, generateSledCourse, sledDifficultyConfig } from '../src/index.ts';
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

test('a reported collision puts the slowdown or the boost into the shared state', () => {
  const { state, simulation } = setup();
  simulation.join('one', profile('one'));
  simulation.start('one', 0);
  simulation.step(3_000, 3_000);
  const racer = state.racers.get('one')!;
  const course = generateSledCourse('fixed-seed', 'easy');
  const obstacle = course.find((item) => item.kind !== 'ice')!;
  racer.x = obstacle.x;
  racer.progress = obstacle.progress;
  assert.equal(simulation.hit('one', { itemId: obstacle.id }, 3_020), true);
  assert.equal(racer.effect, 'obstacle');
  const slowed = racer.speed;
  // The client is the only one who saw it, so the same report cannot be replayed
  // to stack another dose of the effect.
  assert.equal(simulation.hit('one', { itemId: obstacle.id }, 3_040), false);
  const ice = course.find((item) => item.kind === 'ice')!;
  racer.x = ice.x;
  racer.progress = ice.progress;
  assert.equal(simulation.hit('one', { itemId: ice.id }, 5_000), true);
  assert.equal(racer.effect, 'ice');
  assert.ok(racer.speed > slowed);
});

test('the server does not bump a sled on contact, so a dodge on the client stands', () => {
  const { state, simulation } = setup();
  simulation.join('one', profile('one'));
  simulation.start('one', 0);
  simulation.step(3_000, 3_000);
  const racer = state.racers.get('one')!;
  const obstacle = generateSledCourse('fixed-seed', 'easy').find((item) => item.kind !== 'ice')!;
  // Sitting right on top of it, in the lane the server believes: nothing happens,
  // because that lane is a round trip old and the player may have already steered
  // out of it. Only once the sled is well past does the server settle it, and
  // then only against the steering it has actually accepted.
  racer.x = obstacle.x;
  racer.progress = obstacle.progress - 1;
  simulation.step(20, 3_020);
  assert.equal(racer.effect, '');
});

/** Race a sled down a fixed lane, tick by tick, past `progress`. */
function raceTo(
  simulation: SledRaceSimulation,
  racer: { x: number; progress: number },
  lane: number,
  progress: number,
  onTick?: (now: number) => void,
) {
  let now = 3_000;
  racer.x = lane;
  while (racer.progress < progress) {
    now += 50;
    simulation.step(50, now);
    // Held steady: with no steering the server keeps the lane it was given.
    racer.x = lane;
    onTick?.(now);
  }
  return now;
}

test('a rock the racer steered straight through still slows them, reported or not', () => {
  const { state, simulation } = setup();
  simulation.join('one', profile('one'));
  simulation.start('one', 0);
  simulation.step(3_000, 3_000);
  const racer = state.racers.get('one')!;
  const rock = generateSledCourse('fixed-seed', 'easy').find((item) => item.kind !== 'ice')!;
  // A client that simply never sends `sled:hit` would otherwise race the whole
  // course untouched. The lane the server accepted from its own steering is what
  // decides: this one left no way past.
  raceTo(simulation, racer, rock.x, rock.progress + 500);
  assert.equal(racer.effect, 'obstacle');
  assert.ok(racer.speed < sledDifficultyConfig('easy').baseSpeed);
});

test('an unreported rock the racer was never in line with is left alone', () => {
  const { state, simulation } = setup();
  simulation.join('one', profile('one'));
  simulation.start('one', 0);
  simulation.step(3_000, 3_000);
  const racer = state.racers.get('one')!;
  const rock = generateSledCourse('fixed-seed', 'easy').find((item) => item.kind !== 'ice')!;
  raceTo(simulation, racer, rock.x + 200, rock.progress + 500);
  assert.equal(racer.effect, '');
  assert.equal(racer.speed, sledDifficultyConfig('easy').baseSpeed);
});

test('a boost the racer\'s own steering rules out is taken back and reported', () => {
  const { state, simulation } = setup();
  simulation.join('one', profile('one'));
  simulation.start('one', 0);
  simulation.step(3_000, 3_000);
  const racer = state.racers.get('one')!;
  const ice = generateSledCourse('fixed-seed', 'easy').find((item) => item.kind === 'ice')!;
  // Close enough that the arrival check, which only knows roughly where the sled
  // is, cannot tell — and far enough that the lane it held never touched the ice.
  const lane = ice.x + 150;
  let claimed = false;
  raceTo(simulation, racer, lane, ice.progress + 600, (now) => {
    if (claimed || racer.progress < ice.progress - 200) return;
    claimed = true;
    assert.equal(simulation.hit('one', { itemId: ice.id }, now), true);
    assert.equal(racer.effect, 'ice');
  });
  assert.equal(claimed, true);
  assert.equal(racer.effect, '');
  assert.equal(racer.speed, sledDifficultyConfig('easy').baseSpeed);
  assert.deepEqual(simulation.takeRejectedClaims(), [{ sessionId: 'one', itemId: ice.id }]);
  // Drained: the room only sends each one back once.
  assert.deepEqual(simulation.takeRejectedClaims(), []);
});

test('an implausible or unknown collision report is refused', () => {
  const { state, simulation } = setup();
  simulation.join('one', profile('one'));
  simulation.start('one', 0);
  const course = generateSledCourse('fixed-seed', 'easy');
  const ice = course.find((item) => item.kind === 'ice')!;
  // Not racing yet, so there is nothing to claim.
  assert.equal(simulation.hit('one', { itemId: ice.id }, 1_000), false);
  simulation.step(3_000, 3_000);
  const racer = state.racers.get('one')!;
  assert.equal(simulation.hit('one', undefined, 3_020), false);
  assert.equal(simulation.hit('one', { itemId: 'ice-999' }, 3_020), false);
  assert.equal(simulation.hit('nobody', { itemId: ice.id }, 3_020), false);
  // A boost cherry-picked from the far end of the course, nowhere near this sled.
  racer.progress = 100;
  racer.x = 0;
  const distant = course[course.length - 1]!;
  assert.equal(simulation.hit('one', { itemId: distant.id }, 3_020), false);
  assert.equal(racer.effect, '');
  // Right item, wrong side of the track.
  racer.progress = ice.progress;
  racer.x = ice.x + 400;
  assert.equal(simulation.hit('one', { itemId: ice.id }, 3_020), false);
  assert.equal(racer.effect, '');
  // The claims that named a real item are sent back, so the client can drop the
  // effect it already showed instead of running the rest of the race out of step.
  assert.deepEqual(
    simulation.takeRejectedClaims().map((claim) => claim.itemId),
    [distant.id, ice.id],
  );
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
