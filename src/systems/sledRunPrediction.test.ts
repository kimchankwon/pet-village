import test from 'node:test';
import assert from 'node:assert/strict';
import {
  blendTowardServer,
  extrapolate,
  predictProgress,
  predictSteeredX,
  predictionStepSeconds,
  reconcileLocalX,
  steerDeadZone,
  stepSledMotion,
  SLED_MAX_EXTRAPOLATION_MS,
  SLED_PROGRESS_SNAP,
  SLED_X_SNAP,
} from './sledRunPrediction';

const RACE = {
  steeringSpeed: 260,
  trackHalfWidth: 250,
  courseLength: 7_200,
  ageMs: 0,
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

test('a snapshot is carried forward at the rate it reported, but never far', () => {
  assert.equal(extrapolate(100, 380, 100), 138);
  assert.equal(extrapolate(100, 380, -20), 100, 'a snapshot from the future is just current');
  assert.equal(
    extrapolate(0, 380, 5_000),
    extrapolate(0, 380, SLED_MAX_EXTRAPOLATION_MS),
    'a sleeping tab does not launch the sled down the hill',
  );
});

test('the local sled steers at full rate, with no snapshot pulling it back', () => {
  const server = { x: 0, progress: 0, speed: 380, steering: 0, rank: 0 };
  let motion = { x: 0, progress: 0 };
  // Four frames of holding right against a server that has not moved us yet.
  for (let frame = 0; frame < 4; frame += 1) {
    motion = stepSledMotion(motion, { ...RACE, server, steering: 1, deltaMs: 50 });
  }
  // 200ms of holding right is 200ms of travel — the stale snapshot costs nothing.
  assert.equal(Math.round(motion.x), 52);
  assert.ok(motion.progress > 40, `expected the sled to coast, got ${motion.progress}`);
});

test('releasing the key stops the local sled, however far ahead the server is', () => {
  const server = { x: 90, progress: 500, speed: 380, steering: 1, rank: 0 };
  const motion = stepSledMotion({ x: 40, progress: 500 }, {
    ...RACE, server, steering: 0, deltaMs: 50, ageMs: 120,
  });
  assert.equal(motion.x, 40, 'no creep toward a lane the server is still turning into');
});

test('reconciling ignores the server tick and folds in real desync', () => {
  const deadZone = steerDeadZone(RACE.steeringSpeed);
  assert.equal(deadZone, 13, 'a tick of travel at 260px/s');
  // We predicted lane 60 when the snapshot was taken and the server agrees.
  assert.equal(reconcileLocalX(120, 60, 60, 260, 250), 120, 'a matching snapshot leaves us alone');
  assert.equal(
    reconcileLocalX(120, 60 + deadZone, 60, 260, 250),
    120,
    'a disagreement inside the tick the server steers at is not worth correcting',
  );
  const corrected = reconcileLocalX(120, 90, 60, 260, 250);
  assert.ok(corrected > 120 && corrected < 150, `expected a partial correction, got ${corrected}`);
  // Wider than the snap distance means we mispredicted outright: the whole error
  // lands at once, but on the lane we are steering now, not the one the snapshot
  // was made in — the 60px steered since that snapshot survives the correction.
  assert.equal(reconcileLocalX(120, 60 + SLED_X_SNAP, 60, 260, 250), 120 + SLED_X_SNAP);
  assert.equal(
    reconcileLocalX(-40, -60 - SLED_X_SNAP, -60, 260, 250),
    -40 - SLED_X_SNAP,
    'a wide correction to the left is applied the same way',
  );
  assert.equal(reconcileLocalX(249, 400, 250, 260, 250), 250, 'corrections stay on the track');
});

test('remote sleds follow the lane their reported steering is heading for', () => {
  const remote = stepSledMotion({ x: 0, progress: 100 }, {
    ...RACE,
    server: { x: 40, progress: 140, speed: 380, steering: 1, rank: 0 },
    steering: null,
    deltaMs: 50,
    ageMs: 100,
  });
  assert.ok(remote.x > 0 && remote.x < 66, 'interpolates toward the extrapolated lane');
  const stationary = stepSledMotion({ x: 0, progress: 100 }, {
    ...RACE,
    server: { x: 40, progress: 140, speed: 380, steering: 0, rank: 0 },
    steering: null,
    deltaMs: 50,
    ageMs: 100,
  });
  assert.ok(stationary.x < remote.x, 'a sled that is not steering is not carried sideways');
});

test('finished sleds sit on the server value', () => {
  assert.deepEqual(stepSledMotion({ x: 5, progress: 7_000 }, {
    ...RACE,
    server: { x: 30, progress: 7_200, speed: 0, steering: 0, rank: 2 },
    steering: 1,
    deltaMs: 50,
  }), { x: 30, progress: 7_200 });
});
