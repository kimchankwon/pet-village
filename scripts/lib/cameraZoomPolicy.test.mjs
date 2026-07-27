import test from 'node:test';
import assert from 'node:assert/strict';

import { zoomPolicy } from '../../src/systems/cameraZoomPolicy.ts';

test('game zoom is locked to 1x and has no controls despite remembered hub zoom', () => {
  assert.deepEqual(zoomPolicy('game', 1.75), { initial: 1, controls: false });
});

test('hub zoom restores remembered player zoom', () => {
  assert.deepEqual(zoomPolicy('hub', 1.75), { initial: 1.75, controls: true });
});
