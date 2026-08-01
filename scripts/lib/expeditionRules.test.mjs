import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ABILITIES,
  BOSS_ORDER,
  EXPEDITION_REWARDS,
  allWinKeys,
  canAffordAbility,
  energyCost,
  expeditionMinEnergy,
  offeredAbilities,
  winCoins,
  winHappiness,
  winKey,
} from '../../src/systems/expeditionRules.ts';

test('all skills are listed; offeredAbilities is every skill you can afford', () => {
  // UI shows the full roster; offeredAbilities is the selectable subset by mana.
  assert.equal(ABILITIES.length, 6);

  // At 0: only free Nibble.
  assert.deepEqual(offeredAbilities(0).map((a) => a.id), ['nibble']);

  // At 1: Nibble + Tail Whip.
  assert.deepEqual(offeredAbilities(1).map((a) => a.id), ['nibble', 'tail-whip']);

  // At 5: everything costing ≤5 (Nibble through Chroma Burst).
  assert.deepEqual(offeredAbilities(5).map((a) => a.id), [
    'nibble',
    'tail-whip',
    'puffle-volley',
    'chroma-burst',
  ]);

  // At 9: all but Gradient Finale still needs 8… wait, 9 >= 8 so all six.
  assert.deepEqual(offeredAbilities(9).map((a) => a.id), ABILITIES.map((a) => a.id));

  // At 7: everything except Gradient Finale (8).
  assert.deepEqual(
    offeredAbilities(7).map((a) => a.id),
    ABILITIES.filter((a) => a.mana <= 7).map((a) => a.id),
  );

  for (let m = 0; m <= 10; m++) {
    const offer = offeredAbilities(m);
    assert.ok(offer.every((a) => canAffordAbility(a, m)));
    assert.ok(offer.every((a) => a.mana <= m));
    // Every ability is either offered or too expensive.
    for (const a of ABILITIES) {
      assert.equal(canAffordAbility(a, m), a.mana <= m);
      assert.equal(offer.some((o) => o.id === a.id), a.mana <= m);
    }
  }
});

test('energy and reward tables match the build plan', () => {
  assert.deepEqual(EXPEDITION_REWARDS.gustave, {
    easy: { energy: 8, coins: 14, happiness: 8 },
    normal: { energy: 10, coins: 22, happiness: 12 },
    hard: { energy: 12, coins: 34, happiness: 16 },
  });
  assert.deepEqual(EXPEDITION_REWARDS.maelle, {
    easy: { energy: 11, coins: 24, happiness: 12 },
    normal: { energy: 14, coins: 38, happiness: 17 },
    hard: { energy: 17, coins: 56, happiness: 22 },
  });
  assert.deepEqual(EXPEDITION_REWARDS.renoir, {
    easy: { energy: 14, coins: 38, happiness: 16 },
    normal: { energy: 18, coins: 58, happiness: 22 },
    hard: { energy: 21, coins: 84, happiness: 28 },
  });
});

test('reward keys cover all nine character × difficulty pairs', () => {
  const keys = allWinKeys();
  assert.equal(keys.length, 9);
  for (const boss of BOSS_ORDER) {
    for (const d of ['easy', 'normal', 'hard']) {
      assert.ok(keys.includes(winKey(boss, d)));
      assert.ok(energyCost(boss, d) > 0);
      assert.ok(winHappiness(boss, d) > 0);
    }
  }
});

test('Flawless bonus is +50% coins rounded down', () => {
  // Gustave easy: 14 → floor(21) = 21
  assert.equal(winCoins('gustave', 'easy', false), 14);
  assert.equal(winCoins('gustave', 'easy', true), 21);
  // Renoir hard: 84 → floor(126) = 126
  assert.equal(winCoins('renoir', 'hard', true), 126);
  // Maelle normal: 38 → floor(57) = 57
  assert.equal(winCoins('maelle', 'normal', true), 57);
});

test('six abilities have the plan mana/arc/dmg numbers', () => {
  const byId = Object.fromEntries(ABILITIES.map((a) => [a.id, a]));
  assert.deepEqual(
    [byId.nibble.mana, byId.nibble.arcs, byId.nibble.dmgPerArc],
    [0, 2, 8],
  );
  assert.deepEqual(
    [byId['gradient-finale'].mana, byId['gradient-finale'].arcs, byId['gradient-finale'].dmgPerArc],
    [8, 7, 19],
  );
});

test('walk-in gate is Gustave Easy energy (cheapest)', () => {
  assert.equal(expeditionMinEnergy(), 8);
});
