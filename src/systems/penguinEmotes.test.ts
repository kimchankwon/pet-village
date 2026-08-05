import assert from 'node:assert/strict';
import test from 'node:test';
import {
  emoteAnimationFrame,
  isPenguinEmote,
  isPenguinEmoteTexture,
  PENGUIN_EMOTE_CONFIG,
  WAVE_FROM_DANCE_FRAMES,
  SIT_FROM_DANCE_FRAME,
} from './penguinEmotes';

test('emote ids and menu config stay in sync', () => {
  assert.equal(isPenguinEmote('dance'), true);
  assert.equal(isPenguinEmote('hiphop'), true);
  assert.equal(isPenguinEmote(''), false);
  assert.equal(isPenguinEmote('spin'), false);
  assert.equal(PENGUIN_EMOTE_CONFIG.wave.frameCount, WAVE_FROM_DANCE_FRAMES.length);
  assert.equal(PENGUIN_EMOTE_CONFIG.sit.frameCount, 1);
  assert.ok(SIT_FROM_DANCE_FRAME >= 0 && SIT_FROM_DANCE_FRAME < 76);
});

test('wave is a one-shot; dance and sit loop', () => {
  assert.equal(emoteAnimationFrame('wave', 0), 0);
  assert.equal(emoteAnimationFrame('wave', 80 * 11), 11);
  assert.equal(emoteAnimationFrame('wave', 80 * 12), null);
  assert.equal(emoteAnimationFrame('dance', 7600), 0);
  assert.equal(emoteAnimationFrame('sit', 10_000), 0);
  assert.equal(emoteAnimationFrame('breakdance', 80 * 22), 0);
  assert.equal(emoteAnimationFrame('hiphop', 40 * 43), 0);
});

test('emote texture keys are recognised for dance-scale drawing', () => {
  assert.equal(isPenguinEmoteTexture('penguin-wave'), true);
  assert.equal(isPenguinEmoteTexture('penguin-breakdance'), true);
  assert.equal(isPenguinEmoteTexture('penguin-remote-pink-hiphop'), true);
  assert.equal(isPenguinEmoteTexture('penguin-down'), false);
});
