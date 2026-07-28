import test from 'node:test';
import assert from 'node:assert/strict';
import {
  blockPointerUi,
  blockUi,
  isPointerUiBlocked,
  isUiBlocked,
  unblockPointerUi,
  unblockUi,
} from './nav';

test('the pointer latch is its own thing, so placement mode still gets its clicks', () => {
  // What a menu (or the house's furniture placement) takes: keys, not clicks.
  blockUi();
  assert.equal(isUiBlocked(), true);
  assert.equal(isPointerUiBlocked(), false, 'a click is how you place furniture');
  unblockUi();

  // What the chat composer takes: both, because it owns Enter and Escape.
  blockUi();
  blockPointerUi();
  assert.equal(isPointerUiBlocked(), true);
  unblockPointerUi();
  unblockUi();
  assert.equal(isUiBlocked(), false);
  assert.equal(isPointerUiBlocked(), false);
});

test('the pointer latch counts, and an unbalanced release cannot strand it', () => {
  blockPointerUi();
  blockPointerUi();
  unblockPointerUi();
  assert.equal(isPointerUiBlocked(), true, 'one holder is still typing');
  unblockPointerUi();
  unblockPointerUi();
  assert.equal(isPointerUiBlocked(), false);
  blockPointerUi();
  assert.equal(isPointerUiBlocked(), true, 'the depth did not go negative');
  unblockPointerUi();
});
