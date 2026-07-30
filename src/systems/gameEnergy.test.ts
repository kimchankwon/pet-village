import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BUMP_ENERGY_COST,
  FISHING_ENERGY_PER_CAST,
  GAME_MIN_ENERGY,
  GET_ENERGY_COST,
  MINI_GAME_KEYS,
  PAPER_TOSS_ENERGY_COST,
  SKIP_ROPE_ENERGY_COST,
  SLED_RUN_ENERGY_COST,
  paperTossEnergyCost,
  tooTiredMessage,
} from './gameEnergy';
import {
  PAPER_TOSS_COINS_PER_BASKET,
  PAPER_TOSS_LEVEL_CLEAR_COINS,
  SKIP_ROPE_WIN_COINS,
  BUMP_REWARDS,
} from './GameState';
import { GET_WIN_REWARDS } from './getGameRules';
import { FISHING_CATCH_HAPPINESS } from './fishingRules';
import { sledRunReward } from './sledRunRewards';

test('every mini-game charges energy', () => {
  for (const key of MINI_GAME_KEYS) {
    assert.ok(GAME_MIN_ENERGY[key] > 0, `${key} must cost energy to play`);
  }
});

test('the walk-in gate is the cheapest run each booth sells', () => {
  assert.equal(GAME_MIN_ENERGY.Bump, BUMP_ENERGY_COST.easy);
  assert.equal(GAME_MIN_ENERGY.Get, GET_ENERGY_COST.easy);
  assert.equal(GAME_MIN_ENERGY.SledRun, SLED_RUN_ENERGY_COST.easy);
  assert.equal(GAME_MIN_ENERGY.PaperToss, PAPER_TOSS_ENERGY_COST.easy);
  assert.equal(GAME_MIN_ENERGY.SkipRope, SKIP_ROPE_ENERGY_COST);
  assert.equal(GAME_MIN_ENERGY.Fishing, FISHING_ENERGY_PER_CAST);
});

test('every game that charges energy has a gate', () => {
  // A park booth's sceneKey is typed MiniGameKey, so a booth can only point at
  // a game listed here — there is no scene that slips through ungated.
  assert.deepEqual(Object.keys(GAME_MIN_ENERGY).sort(), [...MINI_GAME_KEYS].sort());
});

test('harder tiers always cost more than easier ones', () => {
  assert.ok(BUMP_ENERGY_COST.easy < BUMP_ENERGY_COST.medium);
  assert.ok(BUMP_ENERGY_COST.medium < BUMP_ENERGY_COST.hard);
  assert.ok(GET_ENERGY_COST.easy < GET_ENERGY_COST.normal);
  assert.ok(GET_ENERGY_COST.normal < GET_ENERGY_COST.hard);
  assert.ok(SLED_RUN_ENERGY_COST.easy < SLED_RUN_ENERGY_COST.medium);
  assert.ok(SLED_RUN_ENERGY_COST.medium < SLED_RUN_ENERGY_COST.hard);
  assert.ok(PAPER_TOSS_ENERGY_COST.easy < PAPER_TOSS_ENERGY_COST.medium);
  assert.ok(PAPER_TOSS_ENERGY_COST.medium < PAPER_TOSS_ENERGY_COST.hard);
});

test('a Paper Toss retry only pays for the level it replays', () => {
  for (const difficulty of ['easy', 'medium', 'hard'] as const) {
    const full = PAPER_TOSS_ENERGY_COST[difficulty];
    assert.equal(paperTossEnergyCost(difficulty), full, 'a fresh run plays both levels');
    assert.equal(paperTossEnergyCost(difficulty, 0), full);
    const resumed = paperTossEnergyCost(difficulty, 1);
    assert.ok(resumed < full && resumed >= full / 2, 'resuming on level 2 pays for one level');
  }
});

/**
 * The balance rule: a successful run pays roughly 1.2–2.2 coins per energy spent,
 * so no booth is a better coin farm than the others. A payout change that breaks
 * the band is a balance decision, not a typo — move the cost with it.
 */
const MIN_RATE = 1.2;
const MAX_RATE = 2.2;

function assertInBand(label: string, coins: number, energy: number) {
  const rate = coins / energy;
  assert.ok(
    rate >= MIN_RATE && rate <= MAX_RATE,
    `${label} pays ${rate.toFixed(2)} coins per energy, outside ${MIN_RATE}–${MAX_RATE}`,
  );
}

test('a winning run pays a comparable rate at every booth', () => {
  assertInBand('Bump easy', BUMP_REWARDS.easy.coins, BUMP_ENERGY_COST.easy);
  assertInBand('Bump medium', BUMP_REWARDS.medium.coins, BUMP_ENERGY_COST.medium);
  assertInBand('Bump hard', BUMP_REWARDS.hard.coins, BUMP_ENERGY_COST.hard);

  assertInBand('Get easy', GET_WIN_REWARDS.easy.coins, GET_ENERGY_COST.easy);
  assertInBand('Get normal', GET_WIN_REWARDS.normal.coins, GET_ENERGY_COST.normal);
  assertInBand('Get hard', GET_WIN_REWARDS.hard.coins, GET_ENERGY_COST.hard);

  // Winning a sled race means finishing first.
  for (const difficulty of ['easy', 'medium', 'hard'] as const) {
    assertInBand(
      `Sled Run ${difficulty}`,
      sledRunReward(difficulty, 1)!.coins,
      SLED_RUN_ENERGY_COST[difficulty],
    );
  }

  assertInBand('Skip Rope', SKIP_ROPE_WIN_COINS, SKIP_ROPE_ENERGY_COST);

  // A cleared Paper Toss run is two levels of three baskets, and a basket earns
  // about one bonus coin on top of its base rate (swish / bank / streak).
  for (const difficulty of ['easy', 'medium', 'hard'] as const) {
    const baskets = 6 * (PAPER_TOSS_COINS_PER_BASKET[difficulty] + 1);
    const clears = 2 * PAPER_TOSS_LEVEL_CLEAR_COINS[difficulty];
    assertInBand(`Paper Toss ${difficulty}`, baskets + clears, PAPER_TOSS_ENERGY_COST[difficulty]);
  }
});

/**
 * Fishing is the one booth that pays no coins, so the coins-per-energy band
 * can't judge it. What a cast owes the player is a fish plus a cheer, and the
 * cheer has to be worth the 4 energy — otherwise a cast is a pure loss.
 */
test('a landed fish pays for its cast in happiness', () => {
  const tiers = ['oceanfish-common', 'oceanfish-uncommon', 'oceanfish-rare'] as const;
  const cheers = tiers.map((tier) => FISHING_CATCH_HAPPINESS[tier]);
  for (const [index, cheer] of cheers.entries()) {
    assert.ok(cheer > 0, `${tiers[index]} must cheer the pet`);
    // Roughly the happiness-per-energy the coin booths pay in coins, so a cast
    // is worth taking; the fish itself is the rest of the payout.
    const rate = cheer / FISHING_ENERGY_PER_CAST;
    assert.ok(rate >= 1 && rate <= MAX_RATE + 1, `${tiers[index]} pays ${rate} happy per energy`);
  }
  // Rarer fish fight harder, so they must cheer more.
  assert.deepEqual(cheers, [...cheers].sort((a, b) => a - b));
});

test('losing pays less per energy than winning', () => {
  // Last place down the hill is the smallest payout any booth gives for a run.
  assert.ok(sledRunReward('easy', 4)!.coins < sledRunReward('easy', 1)!.coins);
  assert.ok(
    sledRunReward('hard', 4)!.coins / SLED_RUN_ENERGY_COST.hard < MIN_RATE,
    'a fourth place should not pay a winning rate',
  );
});

test('the too-tired message names the pet and the cost', () => {
  assert.equal(tooTiredMessage('Mochi', 8), 'Mochi needs 8 energy to play — time for a nap!');
  assert.equal(tooTiredMessage('', 5), 'Your pet needs 5 energy to play — time for a nap!');
});
