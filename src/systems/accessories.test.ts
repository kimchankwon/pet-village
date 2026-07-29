import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ACCESSORIES,
  ACCESSORY_CANVAS,
  BONGBONGEE_SHOP_ITEMS,
  accessoryWorldScale,
  isAccessoryId,
} from './accessories';

test('accessory world scale matches pet display height for 32px overlays', () => {
  assert.equal(accessoryWorldScale(40), 40 / ACCESSORY_CANVAS);
  assert.equal(accessoryWorldScale(40) * ACCESSORY_CANVAS, 40);
  // Kirby-sized display height still produces full-size clothes
  assert.equal(accessoryWorldScale(40, 1) * 32, 40);
});

test('retired Bongbongee clothes are gone; new Imagine set is priced for the cafe', () => {
  for (const id of ['mint-pom', 'carat-diamond', 'blue-tee', 'deco-band']) {
    assert.equal(isAccessoryId(id), false);
  }
  const ids = BONGBONGEE_SHOP_ITEMS.map((a) => a.id).sort();
  assert.deepEqual(ids, ['aqua-clip', 'carat-sash', 'diamond-tee', 'mint-puff']);
  for (const item of BONGBONGEE_SHOP_ITEMS) {
    assert.ok(typeof item.price === 'number' && item.price > 0);
    assert.equal(ACCESSORIES[item.id].wearable, 'bongbongee');
  }
});
