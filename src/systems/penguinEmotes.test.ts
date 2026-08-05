import assert from 'node:assert/strict';
import test from 'node:test';
import {
  emoteAnimationFrame,
  isPenguinEmote,
  isPenguinEmoteTexture,
  PENGUIN_EMOTE_CONFIG,
  PENGUIN_EMOTE_MENU,
  PENGUIN_EMOTES,
  WAVE_FROM_DANCE_FRAMES,
  SIT_FROM_DANCE_FRAME,
} from './penguinEmotes';

test('emote ids and menu config stay in sync', () => {
  assert.equal(isPenguinEmote('dance'), true);
  assert.equal(isPenguinEmote('hiphop'), true);
  assert.equal(isPenguinEmote(''), false);
  assert.equal(isPenguinEmote('spin'), false);
  assert.equal(PENGUIN_EMOTE_CONFIG.wave.frameCount, WAVE_FROM_DANCE_FRAMES.length);
  assert.equal(PENGUIN_EMOTE_CONFIG.sit.frameCount, 2);
  assert.ok(SIT_FROM_DANCE_FRAME >= 0 && SIT_FROM_DANCE_FRAME < 76);
  // Wave is only the first flipper-raise pair, not the sit / other-side section.
  assert.deepEqual([...new Set(WAVE_FROM_DANCE_FRAMES)], [40, 41]);
  assert.deepEqual([...PENGUIN_EMOTE_MENU].sort(), [...PENGUIN_EMOTES].sort());
  for (const id of PENGUIN_EMOTES) {
    assert.ok(PENGUIN_EMOTE_CONFIG[id].sheetCols >= 1);
    assert.ok(PENGUIN_EMOTE_CONFIG[id].frameCount % PENGUIN_EMOTE_CONFIG[id].sheetCols !== undefined);
  }
});

test('wave is a one-shot; dance and sit loop', () => {
  assert.equal(emoteAnimationFrame('wave', 0), 0);
  assert.equal(emoteAnimationFrame('wave', 160 * 7), 7);
  assert.equal(emoteAnimationFrame('wave', 160 * 8), null);
  assert.equal(emoteAnimationFrame('dance', 7600), 0);
  assert.equal(emoteAnimationFrame('sit', 10_000), 0); // 2-frame loop
  assert.equal(emoteAnimationFrame('breakdance', 80 * 22), 0);
  assert.equal(emoteAnimationFrame('hiphop', 40 * 43), 0);
});

test('emote texture keys are recognised for dance-scale drawing', () => {
  assert.equal(isPenguinEmoteTexture('penguin-wave'), true);
  assert.equal(isPenguinEmoteTexture('penguin-breakdance'), true);
  assert.equal(isPenguinEmoteTexture('penguin-remote-pink-hiphop'), true);
  assert.equal(isPenguinEmoteTexture('penguin-down'), false);
});
