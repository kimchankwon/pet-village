/**
 * Pins production display-height scale math from src/systems/characterScale.ts.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  bongTextureScale,
  CHARACTER_PENGUIN_DISPLAY_HEIGHT,
  MINITEEN_NATIVE_HEIGHT,
  PET_DISPLAY_HEIGHT,
  scaleToDisplayHeight,
} from '../../src/systems/characterScale.ts';

test('all miniteen plate heights land at penguin display height', () => {
  const target = CHARACTER_PENGUIN_DISPLAY_HEIGHT;
  for (const h of [283, 335, 497, 512, MINITEEN_NATIVE_HEIGHT]) {
    const scale = scaleToDisplayHeight(h, target, MINITEEN_NATIVE_HEIGHT);
    assert.equal(Math.round(h * scale), target);
  }
});

test('bong keeps classic 32×1.55 target', () => {
  assert.equal(bongTextureScale(32, 1.55), 1.55);
  assert.equal(bongTextureScale(0, 1.55), 1.55);
  assert.ok(Math.abs(bongTextureScale(515, 1.55) * 515 - 32 * 1.55) < 0.01);
});

test('pets of different native heights draw at the same size', () => {
  for (const h of [32, 29, 28]) {
    const scale = scaleToDisplayHeight(h, PET_DISPLAY_HEIGHT, 32);
    assert.equal(Math.round(h * scale), PET_DISPLAY_HEIGHT);
  }
});
