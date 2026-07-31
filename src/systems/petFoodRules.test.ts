import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyPetFoodStats,
  petCanEat,
  petFoodEffectLabel,
  previewPetFood,
} from './petFoodRules';

const cookie = { kind: 'food', hunger: 15, happiness: 15 };

test('only food items can be fed to the pet', () => {
  assert.equal(petCanEat(cookie), true);
  assert.equal(petCanEat({ kind: 'bait' }), false);
  assert.equal(petCanEat({ kind: 'furniture' }), false);
  assert.equal(petCanEat(undefined), false);
});

test('a snack previews the needs it will really move', () => {
  assert.deepEqual(previewPetFood({ hunger: 40, happiness: 40 }, cookie), {
    hungerGain: 15,
    happinessGain: 15,
    wasted: false,
  });
});

test('gains are clipped to the part of the bar that is still empty', () => {
  assert.deepEqual(previewPetFood({ hunger: 92, happiness: 100 }, cookie), {
    hungerGain: 8,
    happinessGain: 0,
    wasted: false,
  });
});

test('a snack fed to a completely full pet is flagged as wasted', () => {
  assert.deepEqual(previewPetFood({ hunger: 100, happiness: 100 }, cookie), {
    hungerGain: 0,
    happinessGain: 0,
    wasted: true,
  });
});

test('the preview matches what feeding actually does', () => {
  const pet = { hunger: 92, happiness: 100 };
  const preview = previewPetFood(pet, cookie);
  applyPetFoodStats(pet, cookie);
  assert.deepEqual(pet, { hunger: 92 + preview.hungerGain, happiness: 100 + preview.happinessGain });
});

test('gains stay whole numbers even though needs decay by fractions', () => {
  // 92.3 + 15 clamps to 100, a raw gain of 7.699999… — menus show +8.
  assert.deepEqual(previewPetFood({ hunger: 92.3, happiness: 41.7 }, cookie), {
    hungerGain: 8,
    happinessGain: 15,
    wasted: false,
  });
  assert.equal(petFoodEffectLabel({ hunger: 92.3, happiness: 41.7 }, cookie), '+8 food · +15 happy');
});

test('a pet within rounding of full reads as full rather than +0', () => {
  assert.deepEqual(previewPetFood({ hunger: 99.7, happiness: 99.6 }, cookie), {
    hungerGain: 0,
    happinessGain: 0,
    wasted: true,
  });
  assert.equal(
    petFoodEffectLabel({ hunger: 99.7, happiness: 99.6 }, cookie),
    'no effect — already full',
  );
});

test('menu hints list only the needs that move', () => {
  assert.equal(petFoodEffectLabel({ hunger: 40, happiness: 40 }, cookie), '+15 food · +15 happy');
  assert.equal(petFoodEffectLabel({ hunger: 40, happiness: 100 }, cookie), '+15 food');
  assert.equal(petFoodEffectLabel({ hunger: 100, happiness: 40 }, cookie), '+15 happy');
  assert.equal(
    petFoodEffectLabel({ hunger: 100, happiness: 100 }, cookie),
    'no effect — already full',
  );
});

test('a food with no happiness bonus still reads cleanly', () => {
  assert.equal(petFoodEffectLabel({ hunger: 0, happiness: 0 }, { kind: 'food', hunger: 20 }), '+20 food');
});
