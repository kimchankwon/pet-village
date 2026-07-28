import test from 'node:test';
import assert from 'node:assert/strict';
import {
  blendTowardServer,
  predictProgress,
  predictSteeredX,
  predictionStepSeconds,
  stepSledMotion,
  SLED_PROGRESS_SNAP,
  SLED_X_SNAP,
} from './sledRunPrediction';

const RACE = {
  steeringSpeed: 260,
  trackHalfWidth: 250,
  courseLength: 7_200,
};

test('a frame of prediction is clamped so a stalled tab cannot teleport the sled', () => {
  assert.equal(predictionStepSeconds(16), 0.016);
  assert.equal(predictionStepSeconds(-5), 0);
  assert.equal(predictionStepSeconds(4_000), 0.1);
});

test('steering moves the sled the same distance the server would, inside the track', () => {
  assert.equal(predictSteeredX(0, 1, 260, 250, 100), 26);
  assert.equal(predictSteeredX(0, -1, 260, 250, 100), -26);
  assert.equal(predictSteeredX(0, 0, 260, 250, 100), 0);
  assert.equal(predictSteeredX(240, 1, 260, 250, 100), 250, 'clamped to the track edge');
  assert.equal(predictSteeredX(-240, -1, 260, 250, 100), -250);
});

test('progress coasts on the last known speed and stops at the finish', () => {
  assert.equal(predictProgress(0, 380, 7_200, 100), 38);
  assert.equal(predictProgress(7_190, 380, 7_200, 100), 7_200);
});

test('blending closes the gap to the server without snapping on small errors', () => {
  const blended = blendTowardServer(100, 120, 100, 7, SLED_X_SNAP);
  assert.ok(blended > 100 && blended < 120, `expected a partial correction, got ${blended}`);
  // A wide gap means the prediction missed something (a rock, a sleeping tab).
  assert.equal(blendTowardServer(0, SLED_X_SNAP, 100, 7, SLED_X_SNAP), SLED_X_SNAP);
  assert.equal(blendTowardServer(0, -SLED_PROGRESS_SNAP, 100, 4, SLED_PROGRESS_SNAP), -SLED_PROGRESS_SNAP);
});

test('the local sled steers on its own input before any snapshot arrives', () => {
  const server = { x: 0, progress: 0, speed: 380, rank: 0 };
  let motion = { x: 0, progress: 0 };
  // Four frames of holding right against a server that has not moved us yet.
  for (let frame = 0; frame < 4; frame += 1) {
    motion = stepSledMotion(motion, { ...RACE, server, steering: 1, deltaMs: 50 });
  }
  assert.ok(motion.x > 20, `expected visible movement, got ${motion.x}`);
  // It coasts, but a server still reporting 0 keeps pulling it back, so the
  // sled leads the stale snapshot without ever running away from it.
  assert.ok(motion.progress > 40, `expected the sled to coast, got ${motion.progress}`);
  assert.ok(motion.progress < 76, `expected the blend to hold it back, got ${motion.progress}`);
});

test('remote sleds only chase the snapshot, and finished sleds sit on the server value', () => {
  const remote = stepSledMotion({ x: 0, progress: 100 }, {
    ...RACE,
    server: { x: 40, progress: 140, speed: 380, rank: 0 },
    steering: null,
    deltaMs: 50,
  });
  assert.ok(remote.x > 0 && remote.x < 40, 'interpolates toward the reported lane');

  assert.deepEqual(stepSledMotion({ x: 5, progress: 7_000 }, {
    ...RACE,
    server: { x: 30, progress: 7_200, speed: 0, rank: 2 },
    steering: 1,
    deltaMs: 50,
  }), { x: 30, progress: 7_200 });
});
