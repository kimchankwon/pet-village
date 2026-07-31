import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ABILITIES,
  BOSS_ORDER,
  EXPEDITION_REWARDS,
  allWinKeys,
  energyCost,
  expeditionMinEnergy,
  offeredAbilities,
  winCoins,
  winHappiness,
  winKey,
} from '../../src/systems/expeditionRules.ts';

test('ability offer is correct at every mana value 0…10', () => {
  // At 0: only Nibble (no paid abilities affordable) → Nibble alone? Plan says
  // "always shows three: free basic + two most expensive affordable". When
  // fewer than two paid are affordable, we still only offer what exists.
  const at0 = offeredAbilities(0);
  assert.equal(at0[0].id, 'nibble');
  assert.equal(at0.length, 1);

  // At 1: Nibble + Tail Whip only (one paid).
  const at1 = offeredAbilities(1).map((a) => a.id);
  assert.deepEqual(at1, ['nibble', 'tail-whip']);

  // At 5: Nibble · Puffle Volley · Chroma Burst (plan worked example).
  const at5 = offeredAbilities(5).map((a) => a.id);
  assert.deepEqual(at5, ['nibble', 'puffle-volley', 'chroma-burst']);

  // At 9: Nibble · Lumina Storm · Gradient Finale.
  const at9 = offeredAbilities(9).map((a) => a.id);
  assert.deepEqual(at9, ['nibble', 'lumina-storm', 'gradient-finale']);

  // At 10: same top two paid (Gradient + Lumina) + Nibble.
  const at10 = offeredAbilities(10).map((a) => a.id);
  assert.deepEqual(at10, ['nibble', 'lumina-storm', 'gradient-finale']);

  // Exhaustive: for every mana 0..10, Nibble is first and paid are sorted by cost.
  for (let m = 0; m <= 10; m++) {
    const offer = offeredAbilities(m);
    assert.equal(offer[0].id, 'nibble');
    assert.ok(offer.length <= 3);
    for (const a of offer) assert.ok(a.mana <= m || a.id === 'nibble');
    const paid = offer.slice(1);
    for (let i = 1; i < paid.length; i++) {
      assert.ok(paid[i].mana >= paid[i - 1].mana);
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
