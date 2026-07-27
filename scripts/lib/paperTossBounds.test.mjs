import test from 'node:test';
import assert from 'node:assert/strict';

import { basketHorizontalRange, clampBasketX } from '../../src/systems/paperTossBounds.ts';

for (const width of [640, 800]) {
  test(`basket range fits its full width and margin in a ${width}px viewport`, () => {
    const basketWidth = 16 * 3 * 1.9;
    const inset = basketWidth / 2 + 12;
    const range = basketHorizontalRange(width, basketWidth, 12);
    assert.deepEqual(range, { min: inset, max: width - inset });
    assert.equal(clampBasketX(430, 700, width, basketWidth, 12), Math.min(700, width - inset));
    assert.equal(clampBasketX(430, 460, width, basketWidth, 12), 460);
  });
}
