import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FISHING_MINIGAME_IDS,
  angleDelta,
  createKeepItInState,
  createSweepState,
  fishSizeNorm,
  keepItInDrain,
  keepItInTuning,
  pickFishingMinigame,
  stepKeepItIn,
  stepSweep,
  sweepTuning,
  tapSweep,
  type FishingMinigameId,
} from './fishingMinigames';
import {
  PLAYER_MODELS,
  SIM_SIZES,
  mulberry32,
  playerModel,
  runSim,
} from './fishingSimulation';
import { FISH_TIERS, fishingTierWeights, rollFishSize, rollFishTier } from './fishingRules';

const TRIALS = 1200;
const GAMES: FishingMinigameId[] = ['keepitin', 'sweep'];

/** Same seeding as the printed table, so a failure here reproduces there. */
const rate = (game: FishingMinigameId, size: number, player: string) =>
  runSim(game, size, playerModel(player), TRIALS, 4242 + size * 31).catchRate;

test('both minigames get picked', () => {
  const rand = mulberry32(7);
  const seen = new Set<FishingMinigameId>();
  for (let i = 0; i < 200; i++) seen.add(pickFishingMinigame(rand));
  assert.deepEqual([...seen].sort(), [...FISHING_MINIGAME_IDS].sort());
});

test('size normalises across the full tier range', () => {
  assert.equal(fishSizeNorm(12), 0);
  assert.equal(fishSizeNorm(78), 1);
  assert.ok(fishSizeNorm(45) > 0.4 && fishSizeNorm(45) < 0.6);
  // Sizes outside the table clamp rather than producing wild tuning.
  assert.equal(fishSizeNorm(5), 0);
  assert.equal(fishSizeNorm(200), 1);
});

test('Keep It In gets harder with size in every dimension asked for', () => {
  const small = keepItInTuning(12);
  const big = keepItInTuning(78);
  // Smaller catch bar, faster and more erratic fish, stingier meter.
  assert.ok(big.barHeight < small.barHeight);
  assert.ok(big.fishSpeed > small.fishSpeed);
  assert.ok(big.dartMin < small.dartMin && big.dartMax < small.dartMax);
  assert.ok(big.dartRange > small.dartRange);
  assert.ok(big.fillRate < small.fillRate);
  assert.ok(big.drainBase > small.drainBase);
  assert.ok(big.drainRamp > small.drainRamp);
});

test('the bar can always physically outrun the fish', () => {
  // If the speed cap ever fell below the fish's, the fight would be unwinnable
  // by construction rather than by skill.
  for (const size of SIM_SIZES) {
    const t = keepItInTuning(size);
    assert.ok(t.maxSpeed > t.fishSpeed, `${size}cm: bar ${t.maxSpeed} <= fish ${t.fishSpeed}`);
  }
});

test('the catch meter drains faster the longer the fight runs', () => {
  const tuning = keepItInTuning(40);
  const start = keepItInDrain(tuning, 0);
  const later = keepItInDrain(tuning, 6);
  assert.ok(later > start);
  // ...but the ramp is capped, so a long fight never becomes a freefall.
  assert.equal(keepItInDrain(tuning, 10_000), tuning.drainBase * tuning.drainMax);
});

test('Keep It In resolves one way or the other', () => {
  const rand = mulberry32(11);
  const tuning = keepItInTuning(30);
  const state = createKeepItInState(tuning, rand);
  // Never holding drains the meter to nothing.
  for (let i = 0; i < 60 * 40 && state.outcome === 'playing'; i++) {
    stepKeepItIn(state, tuning, 1 / 60, false, rand);
  }
  assert.equal(state.outcome, 'escaped');
});

test('The Sweep gets faster with a smaller window for bigger fish', () => {
  const small = sweepTuning(12);
  const big = sweepTuning(78);
  assert.ok(big.speed > small.speed, 'bigger fish sweep faster');
  assert.ok(big.speedStep > small.speedStep);
  assert.ok(big.zoneWidth < small.zoneWidth, 'bigger fish have a smaller tap window');
  assert.ok(big.hitsNeeded > small.hitsNeeded);
});

test('sweep taps resolve against the arc', () => {
  const rand = mulberry32(3);
  const tuning = sweepTuning(12);
  const state = createSweepState(tuning, rand);
  // Dead centre is a perfect hit.
  state.angle = state.zone;
  assert.equal(tapSweep(state, tuning, rand), 'perfect');
  assert.equal(state.hits, 1);
  // Diametrically opposite is a miss — and a miss is the whole fight.
  state.angle = state.zone + Math.PI;
  assert.equal(tapSweep(state, tuning, rand), 'miss');
  assert.equal(state.misses, 1);
  assert.equal(state.outcome, 'escaped');
});

test('one missed strike loses the fish, at any size and any point in the fight', () => {
  for (const size of SIM_SIZES) {
    const rand = mulberry32(21 + size);
    const tuning = sweepTuning(size);
    const state = createSweepState(tuning, rand);
    // Land every strike but the last, then fluff it.
    for (let i = 0; i < tuning.hitsNeeded - 1; i++) {
      state.angle = state.zone;
      assert.notEqual(tapSweep(state, tuning, rand), 'miss');
      assert.equal(state.outcome, 'playing', `${size}cm: ended early on strike ${i + 1}`);
    }
    state.angle = state.zone + Math.PI;
    assert.equal(tapSweep(state, tuning, rand), 'miss');
    assert.equal(state.outcome, 'escaped', `${size}cm: a miss should end it`);
    assert.ok(state.hits < tuning.hitsNeeded);
  }
});

test('The Sweep ends if the player stops tapping', () => {
  // Nothing decays on its own here, so without the idle timeout an abandoned
  // fight would spin the needle forever with no way out but the leave menu.
  const rand = mulberry32(5);
  const tuning = sweepTuning(40);
  const state = createSweepState(tuning, rand);
  let t = 0;
  for (let i = 0; i < 60 * 60 && state.outcome === 'playing'; i++) {
    stepSweep(state, tuning, 1 / 60);
    t += 1 / 60;
  }
  assert.equal(state.outcome, 'escaped');
  assert.ok(Math.abs(t - tuning.idleLimit) < 0.1, `escaped at ${t}s, expected ~${tuning.idleLimit}s`);
});

test('the idle timeout never fires on someone who is still playing', () => {
  // The longest legitimate wait is one full revolution of the needle at the
  // slowest speed that size ever sweeps at. Two of those must still fit inside
  // the limit, or waiting for the arc to come back round would lose the fish.
  for (const size of SIM_SIZES) {
    const tuning = sweepTuning(size);
    const slowestRevolution = (Math.PI * 2) / tuning.speed;
    assert.ok(
      tuning.idleLimit > slowestRevolution * 2,
      `${size}cm: idle limit ${tuning.idleLimit}s vs revolution ${slowestRevolution.toFixed(2)}s`,
    );
  }
});

test('tapping resets the idle countdown', () => {
  const rand = mulberry32(9);
  const tuning = sweepTuning(20);
  const state = createSweepState(tuning, rand);
  stepSweep(state, tuning, 4);
  assert.ok(state.sinceTap >= 4);
  state.angle = state.zone;
  tapSweep(state, tuning, rand);
  assert.equal(state.sinceTap, 0);
});

test('angleDelta wraps the short way round', () => {
  assert.ok(Math.abs(angleDelta(0.1, Math.PI * 2 - 0.1) - 0.2) < 1e-9);
  assert.ok(Math.abs(angleDelta(Math.PI * 2 - 0.1, 0.1) + 0.2) < 1e-9);
});

/* ---------- balance simulations ----------
   These are the load-bearing assertions: they are what "all fish must be
   catchable" means in practice. */

test('every fish size is catchable in both minigames', () => {
  for (const game of GAMES) {
    for (const size of SIM_SIZES) {
      const average = rate(game, size, 'average');
      assert.ok(
        average >= 0.25,
        `${game} @ ${size}cm: average player catches only ${(average * 100).toFixed(0)}%`,
      );
      // Even a clumsy player has a real shot at the biggest fish in the sea.
      const poor = rate(game, size, 'poor');
      assert.ok(poor >= 0.05, `${game} @ ${size}cm: poor player catches ${(poor * 100).toFixed(0)}%`);
    }
  }
});

test('small fish are close to a formality', () => {
  for (const game of GAMES) {
    assert.ok(rate(game, 12, 'average') >= 0.98, `${game}: smallest fish should rarely escape`);
    assert.ok(rate(game, 12, 'poor') >= 0.9, `${game}: smallest fish should suit everyone`);
  }
});

test('the biggest fish is never a formality', () => {
  for (const game of GAMES) {
    const average = rate(game, 78, 'average');
    assert.ok(average <= 0.9, `${game}: biggest fish too easy for an average player (${average})`);
  }
});

test('difficulty rises with size rather than jumping around', () => {
  for (const game of GAMES) {
    const rates = SIM_SIZES.map((size) => rate(game, size, 'average'));
    for (let i = 1; i < rates.length; i++) {
      // Monotonic downward, with a little slack for simulation noise.
      assert.ok(
        rates[i]! <= rates[i - 1]! + 0.03,
        `${game}: ${SIM_SIZES[i]}cm (${rates[i]}) easier than ${SIM_SIZES[i - 1]}cm (${rates[i - 1]})`,
      );
    }
    // And the ramp actually goes somewhere.
    assert.ok(rates[0]! - rates[rates.length - 1]! > 0.3, `${game}: size barely matters`);
  }
});

test('better players catch more fish', () => {
  for (const game of GAMES) {
    const good = rate(game, 66, 'good');
    const average = rate(game, 66, 'average');
    const poor = rate(game, 66, 'poor');
    assert.ok(good > average && average > poor, `${game}: skill should pay off`);
  }
});

test('every player model is exercised by the printed table', () => {
  assert.deepEqual(PLAYER_MODELS.map((m) => m.name), ['good', 'average', 'poor']);
});

/* ---------- cast distance ---------- */

test('casting farther weights the roll toward rarer fish', () => {
  const near = fishingTierWeights(0);
  const far = fishingTierWeights(1);
  assert.ok(far[2]! > near[2]!, 'rare odds rise with distance');
  assert.ok(far[0]! < near[0]!, 'common odds fall with distance');
  // Monotonic the whole way, not just at the ends.
  let previousRare = -1;
  for (let p = 0; p <= 1.0001; p += 0.1) {
    const rare = fishingTierWeights(p)[2]!;
    assert.ok(rare >= previousRare, `rare odds dipped at power ${p}`);
    previousRare = rare;
  }
});

test('casting farther lands bigger fish on average', () => {
  const meanSize = (power: number) => {
    const rand = mulberry32(500);
    let total = 0;
    const runs = 20_000;
    for (let i = 0; i < runs; i++) {
      const tier = rollFishTier(power, rand);
      total += rollFishSize(tier, power, rand);
    }
    return total / runs;
  };
  const sizes = [0, 0.25, 0.5, 0.75, 1].map(meanSize);
  for (let i = 1; i < sizes.length; i++) {
    assert.ok(sizes[i]! > sizes[i - 1]!, `mean size fell from ${sizes[i - 1]} to ${sizes[i]}`);
  }
  // A maxed cast should be worth a lot more than a tap.
  assert.ok(sizes[4]! - sizes[0]! > 20, `distance only worth ${sizes[4]! - sizes[0]!}cm`);
});

test('rolled sizes stay inside their tier, so tuning is always simulated', () => {
  const rand = mulberry32(77);
  for (const tier of FISH_TIERS) {
    for (let i = 0; i < 2000; i++) {
      for (const power of [0, 0.5, 1]) {
        const size = rollFishSize(tier, power, rand);
        assert.ok(size >= tier.sizeMin && size <= tier.sizeMax, `${tier.id} produced ${size}cm`);
      }
    }
  }
});
