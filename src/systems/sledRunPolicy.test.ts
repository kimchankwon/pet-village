import test from 'node:test';
import assert from 'node:assert/strict';
import { steerAxisFrom, shouldSendSteer } from './sledRunPolicy';

test('keyboard steering wins and opposite directions cancel', () => {
  assert.equal(steerAxisFrom({ left: true, right: false, pointerDown: true, pointerX: 700, width: 800 }), -1);
  assert.equal(steerAxisFrom({ left: false, right: true, pointerDown: true, pointerX: 10, width: 800 }), 1);
  assert.equal(steerAxisFrom({ left: true, right: true, pointerDown: false, pointerX: 0, width: 800 }), 0);
});

test('touching either screen half steers left or right and release centers', () => {
  assert.equal(steerAxisFrom({ left: false, right: false, pointerDown: true, pointerX: 100, width: 800 }), -1);
  assert.equal(steerAxisFrom({ left: false, right: false, pointerDown: true, pointerX: 700, width: 800 }), 1);
  assert.equal(steerAxisFrom({ left: false, right: false, pointerDown: false, pointerX: 700, width: 800 }), 0);
});

test('steering sends changes immediately and repeats a heartbeat', () => {
  assert.equal(shouldSendSteer(-1, 1, 10, 0), true);
  assert.equal(shouldSendSteer(1, 1, 99, 0), false);
  assert.equal(shouldSendSteer(1, 1, 1_000, 0), true);
});
