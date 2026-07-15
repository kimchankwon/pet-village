import assert from 'node:assert/strict';
import test from 'node:test';
import {
  fishingBaitCount,
  fishingBiteWindowMs,
  fishingFightStrength,
  hasFishingBait,
} from '../../src/systems/fishingRules.ts';

test('fishing requires a positive whole bait count', () => {
  assert.equal(fishingBaitCount({ bait: 2.9 }), 2);
  assert.equal(fishingBaitCount({ bait: -1 }), 0);
  assert.equal(hasFishingBait({ bait: 1 }), true);
  assert.equal(hasFishingBait({ bait: 0 }), false);
});

test('fishing fight strength rises with fish size and casting distance', () => {
  const nearSmall = fishingFightStrength(0.4, 14, 0.12);
  const farLarge = fishingFightStrength(1, 70, 0.9);
  assert.ok(nearSmall >= 0.24);
  assert.ok(farLarge > nearSmall);
  assert.ok(farLarge <= 1.1);
});

test('bite windows are slightly tighter and remain playable', () => {
  assert.equal(fishingBiteWindowMs(0, 0), 1100);
  assert.equal(fishingBiteWindowMs(200, 2), 500);
  assert.ok(fishingBiteWindowMs(30, 0.5) < 1200 - 30 * 5 - 0.5 * 80);
});
