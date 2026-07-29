/**
 * Pins production display-height scale math from src/systems/characterScale.ts.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CHARACTER_PENGUIN_DISPLAY_HEIGHT,
  MINITEEN_NATIVE_HEIGHT,
  NPC_DISPLAY_HEIGHT,
  PET_DISPLAY_HEIGHT,
  PET_HEIGHT_RATIO,
  scaleToDisplayHeight,
} from '../../src/systems/characterScale.ts';

test('every NPC stands penguin-tall', () => {
  assert.equal(NPC_DISPLAY_HEIGHT, CHARACTER_PENGUIN_DISPLAY_HEIGHT);
});

test('pets draw at two thirds of the penguin height', () => {
  assert.equal(PET_HEIGHT_RATIO, 2 / 3);
  assert.equal(PET_DISPLAY_HEIGHT, 40);
  assert.equal(PET_DISPLAY_HEIGHT, Math.round(CHARACTER_PENGUIN_DISPLAY_HEIGHT * PET_HEIGHT_RATIO));
});

test('all miniteen plate heights land at penguin display height', () => {
  for (const h of [283, 335, 497, 512, MINITEEN_NATIVE_HEIGHT]) {
    const scale = scaleToDisplayHeight(h, NPC_DISPLAY_HEIGHT, MINITEEN_NATIVE_HEIGHT);
    assert.equal(Math.round(h * scale), NPC_DISPLAY_HEIGHT);
  }
});

test('bong 32px and plate frames land at penguin display height too', () => {
  for (const h of [32, 515]) {
    const scale = scaleToDisplayHeight(h, NPC_DISPLAY_HEIGHT, 32);
    assert.equal(Math.round(h * scale), NPC_DISPLAY_HEIGHT);
  }
  // Missing texture falls back to the classic 32px native height.
  assert.equal(Math.round(32 * scaleToDisplayHeight(0, NPC_DISPLAY_HEIGHT, 32)), NPC_DISPLAY_HEIGHT);
});

test('pets of different native heights draw at the same size', () => {
  for (const h of [32, 29, 28]) {
    const scale = scaleToDisplayHeight(h, PET_DISPLAY_HEIGHT, 32);
    assert.equal(Math.round(h * scale), PET_DISPLAY_HEIGHT);
  }
});

test('a pet is PET_HEIGHT_RATIO as tall as the NPC standing next to it', () => {
  const petScale = scaleToDisplayHeight(32, PET_DISPLAY_HEIGHT, 32);
  const npcScale = scaleToDisplayHeight(
    MINITEEN_NATIVE_HEIGHT,
    NPC_DISPLAY_HEIGHT,
    MINITEEN_NATIVE_HEIGHT,
  );
  const drawnRatio = (32 * petScale) / (MINITEEN_NATIVE_HEIGHT * npcScale);
  // PET_DISPLAY_HEIGHT is rounded to whole pixels, so allow sub-pixel drift.
  assert.ok(Math.abs(drawnRatio - PET_HEIGHT_RATIO) < 0.01, `drawn ratio ${drawnRatio}`);
});

// accessoryWorldScale: 32×32 overlays match pet display height (not plate scale)
import { ACCESSORY_CANVAS } from '../../src/systems/accessories.ts';
