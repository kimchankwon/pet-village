import assert from 'node:assert/strict';
import test from 'node:test';
import { isBottomButtonsCompact } from './bottomButtonsPolicy';

test('bottom chips stay full-size on a wide desktop canvas', () => {
  assert.equal(isBottomButtonsCompact({ touch: false, width: 800, height: 600 }), false);
  assert.equal(isBottomButtonsCompact({ touch: false, width: 1200, height: 700 }), false);
});

test('bottom chips compact on touch, portrait, or a narrow canvas', () => {
  assert.equal(isBottomButtonsCompact({ touch: true, width: 1200, height: 700 }), true);
  assert.equal(isBottomButtonsCompact({ touch: false, width: 640, height: 900 }), true);
  assert.equal(isBottomButtonsCompact({ touch: false, width: 700, height: 500 }), true);
});
