import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HUD_PANEL_H,
  PROMPT_BOTTOM_OFFSET,
  bottomLeftObstacles,
  hudOrigin,
  promptCenterY,
  type Rect,
} from './hudLayout';

function promptRect(camW: number, centerY: number, w: number, h: number): Rect {
  return { x: camW / 2 - w / 2, y: centerY - h / 2, w, h };
}

function overlaps(a: Rect, b: Rect) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

test('HUD sits bottom-left on desktop and portrait, above the joystick on touch landscape', () => {
  assert.deepEqual(hudOrigin(1010, 600, false), { x: 10, y: 600 - HUD_PANEL_H - 10 });
  assert.deepEqual(hudOrigin(640, 1338, true), { x: 10, y: 1338 - HUD_PANEL_H - 10 });
  assert.deepEqual(hudOrigin(750, 600, true), { x: 10, y: 600 - 22 - 108 - HUD_PANEL_H - 10 });
});

test('a short prompt on a wide desktop stays just above the buttons', () => {
  assert.equal(promptCenterY(1010, 600, false, 300, 27), 600 - PROMPT_BOTTOM_OFFSET);
});

for (const [label, camW, camH, touch] of [
  ['desktop 4:3', 800, 600, false],
  ['touch 5:4 landscape', 750, 600, true],
  ['touch portrait', 640, 1338, true],
  ['desktop portrait', 640, 1338, false],
] as const) {
  test(`a long prompt clears the HUD and joystick (${label})`, () => {
    const w = 430;
    const h = 27;
    const y = promptCenterY(camW, camH, touch, w, h);
    const rect = promptRect(camW, y, w, h);
    for (const obstacle of bottomLeftObstacles(camW, camH, touch)) {
      assert.equal(overlaps(rect, obstacle), false, `${JSON.stringify(rect)} hits ${JSON.stringify(obstacle)}`);
    }
    assert.ok(rect.y > 0);
  });
}
