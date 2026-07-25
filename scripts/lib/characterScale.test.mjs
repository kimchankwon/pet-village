/**
 * Display-height scale helpers (mirrors petDrawScale / miniteenDrawScale math).
 * Kept as pure functions so we can pin the contract without booting Phaser.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

const PENGUIN_DISPLAY_HEIGHT = 20 * 3; // SCALE = 3 in pixelart.ts
const MINITEEN_DISPLAY_HEIGHT = PENGUIN_DISPLAY_HEIGHT;
const PET_DISPLAY_HEIGHT = 48;

function petDrawScale(textureH, displayHeight = PET_DISPLAY_HEIGHT) {
  if (textureH <= 0) return displayHeight / 32;
  return displayHeight / textureH;
}

function miniteenDrawScale(prefix, textureH, classicScale = 1.5) {
  if (textureH <= 0) {
    return prefix === 'bong' ? classicScale : MINITEEN_DISPLAY_HEIGHT / 42;
  }
  if (prefix === 'bong') {
    if (textureH <= 64) return classicScale;
    return (32 * classicScale) / textureH;
  }
  return MINITEEN_DISPLAY_HEIGHT / textureH;
}

test('all miniteen plate heights land at penguin display height', () => {
  for (const h of [283, 335, 497, 512, 42]) {
    const scale = miniteenDrawScale('mt-doa', h);
    assert.equal(Math.round(h * scale), MINITEEN_DISPLAY_HEIGHT);
  }
  assert.equal(MINITEEN_DISPLAY_HEIGHT, PENGUIN_DISPLAY_HEIGHT);
});

test('bong keeps classic 32×1.55 target', () => {
  assert.equal(miniteenDrawScale('bong', 32, 1.55), 1.55);
  assert.ok(Math.abs(miniteenDrawScale('bong', 515, 1.55) * 515 - 32 * 1.55) < 0.01);
});

test('pets of different native heights draw at the same size', () => {
  const a = petDrawScale(32);
  const b = petDrawScale(29);
  const c = petDrawScale(28);
  assert.equal(Math.round(32 * a), PET_DISPLAY_HEIGHT);
  assert.equal(Math.round(29 * b), PET_DISPLAY_HEIGHT);
  assert.equal(Math.round(28 * c), PET_DISPLAY_HEIGHT);
});
