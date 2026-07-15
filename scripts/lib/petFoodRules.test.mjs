import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FISHING_BAIT_PRICE,
  FISHY_SNACK_HUNGER,
  applyPetFoodStats,
  petCanEat,
} from '../../src/systems/petFoodRules.ts';

test('bait costs 3 coins and is never pet food', () => {
  assert.equal(FISHING_BAIT_PRICE, 3);
  assert.equal(petCanEat({ kind: 'bait' }), false);
  assert.equal(petCanEat({ kind: 'food' }), true);
});

test('Fishy Snack restores 15 hunger and feeding never changes coins', () => {
  assert.equal(FISHY_SNACK_HUNGER, 15);
  const state = { hunger: 10, happiness: 20, coins: 12 };

  applyPetFoodStats(state, {
    kind: 'food',
    hunger: FISHY_SNACK_HUNGER,
    happiness: 5,
  });

  assert.deepEqual(state, { hunger: 25, happiness: 25, coins: 12 });
});
