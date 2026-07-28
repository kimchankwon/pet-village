/**
 * Client-side prediction for Sled Run.
 *
 * The server simulates at 50ms ticks and patches at its own rate, so waiting for
 * a snapshot before moving makes steering feel like it lags a fifth of a second
 * behind the key. Instead every racer keeps a local motion state that runs the
 * same maths the server runs.
 *
 * The local sled owns its lane outright: it integrates the key that is down this
 * frame and is never pulled toward the raw snapshot, because a snapshot describes
 * where the server had us one round trip ago. Pulling toward it every frame is
 * what made steering feel like a negotiation — the correction cancelled part of
 * the steer while a key was held, then pushed the sled further once it was
 * released and the server was still turning. Snapshots still have the final word,
 * via `reconcileLocalX`: the scene compares the snapshot against the lane it
 * predicted *at the time that snapshot was made* (see `sledRunLatency`), so what
 * is left over is real disagreement — a clamp, a dropped input, a rejected
 * duplicate — and only that gets corrected.
 *
 * Everything else is still a follow: remote sleds and every sled's progress coast
 * on their last reported rate and blend toward the snapshot carried forward by
 * however long ago it arrived, so a chase aims at where that snapshot has got to
 * instead of sawing back to where it was made. It stays in the snapshot's own time
 * frame, though — the hill has to scroll past the sled the way the server scored
 * it, or a rock would slow the sled after it looked past.
 */

import { SLED_TICK_MS } from '@pet-village/multiplayer-protocol';

export type SledMotion = { x: number; progress: number };

/** Blend rates, per second: high enough to correct fast, low enough not to snap. */
export const SLED_X_BLEND_RATE = 7;
export const SLED_PROGRESS_BLEND_RATE = 4;
/** Past these gaps the prediction is wrong about something — take the server's word. */
export const SLED_X_SNAP = 110;
export const SLED_PROGRESS_SNAP = 260;
/** Share of a real lane disagreement absorbed per snapshot, so it never jolts. */
export const SLED_X_CORRECTION_GAIN = 0.3;
/** Nothing is carried forward further than this; a stalled tab is not a hint. */
export const SLED_MAX_EXTRAPOLATION_MS = 400;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** Seconds of simulation to run for a frame, ignoring stalls and tab wakeups. */
export function predictionStepSeconds(deltaMs: number) {
  return clamp(deltaMs, 0, 100) / 1_000;
}

/**
 * Exponential blend toward the server value, or a snap when the gap is too wide
 * to hide (a collision knocked us sideways, or the tab was asleep).
 */
export function blendTowardServer(
  predicted: number,
  authoritative: number,
  deltaMs: number,
  rate: number,
  snapDistance: number,
) {
  if (Math.abs(authoritative - predicted) >= snapDistance) return authoritative;
  const alpha = 1 - Math.exp(-rate * predictionStepSeconds(deltaMs));
  return predicted + (authoritative - predicted) * alpha;
}

/** Where a snapshot value has travelled to by now, at the rate it reported. */
export function extrapolate(value: number, ratePerSecond: number, ageMs: number) {
  return value + ratePerSecond * (clamp(ageMs, 0, SLED_MAX_EXTRAPOLATION_MS) / 1_000);
}

/** The local sled's own lane position, moved by this frame's steering input. */
export function predictSteeredX(
  currentX: number,
  steering: -1 | 0 | 1,
  steeringSpeed: number,
  trackHalfWidth: number,
  deltaMs: number,
) {
  const next = currentX + steering * steeringSpeed * predictionStepSeconds(deltaMs);
  return clamp(next, -trackHalfWidth, trackHalfWidth);
}

/** Coast a sled forward on its last reported speed, never past the finish line. */
export function predictProgress(
  currentProgress: number,
  speed: number,
  courseLength: number,
  deltaMs: number,
) {
  return Math.min(courseLength, currentProgress + speed * predictionStepSeconds(deltaMs));
}

/**
 * Lane disagreement not worth correcting. A server tick integrates its whole
 * step at whatever steering it happens to hold, so where it puts a sled is only
 * ever right to a tick's worth of travel; correcting inside that window chases
 * its rounding, and a shiver on every patch is exactly what steering must not do.
 */
export function steerDeadZone(steeringSpeed: number) {
  return steeringSpeed * (SLED_TICK_MS / 1_000);
}

/**
 * Fold a snapshot's verdict on our lane into the prediction. `tracedX` is where
 * we predicted the sled was when that snapshot was made — one round trip ago —
 * so the difference is desync we cannot explain away, not the latency the
 * prediction exists to hide. Differences inside the server's own resolution are
 * left alone, and a wide one means we mispredicted something outright, so the
 * server's lane is simply taken.
 */
export function reconcileLocalX(
  predictedX: number,
  serverX: number,
  tracedX: number,
  steeringSpeed: number,
  trackHalfWidth: number,
) {
  const error = serverX - tracedX;
  if (Math.abs(error) <= steerDeadZone(steeringSpeed)) return predictedX;
  const corrected = Math.abs(error) >= SLED_X_SNAP
    ? serverX
    : predictedX + error * SLED_X_CORRECTION_GAIN;
  return clamp(corrected, -trackHalfWidth, trackHalfWidth);
}

export type SledMotionInput = {
  /** Latest snapshot values for this racer. */
  server: { x: number; progress: number; speed: number; steering: number; rank: number };
  /** Steering the local player is holding, or null for everyone else. */
  steering: -1 | 0 | 1 | null;
  steeringSpeed: number;
  trackHalfWidth: number;
  courseLength: number;
  deltaMs: number;
  /** How long ago the snapshot arrived, so a follow aims at where it has got to. */
  ageMs: number;
};

/**
 * One frame of motion for one sled. Finished racers stop predicting: the server
 * has frozen them on the line and any coasting would push them through it.
 */
export function stepSledMotion(motion: SledMotion, input: SledMotionInput): SledMotion {
  const { server, deltaMs, ageMs } = input;
  if (server.rank > 0) return { x: server.x, progress: server.progress };

  const coasted = predictProgress(motion.progress, server.speed, input.courseLength, deltaMs);
  const progress = blendTowardServer(
    coasted,
    Math.min(input.courseLength, extrapolate(server.progress, server.speed, ageMs)),
    deltaMs,
    SLED_PROGRESS_BLEND_RATE,
    SLED_PROGRESS_SNAP,
  );

  // The local sled steers on its own input alone; snapshots reach it through
  // reconcileLocalX, which knows how to compare them fairly.
  if (input.steering !== null) {
    const x = predictSteeredX(
      motion.x,
      input.steering,
      input.steeringSpeed,
      input.trackHalfWidth,
      deltaMs,
    );
    return { x, progress };
  }

  // Remote sleds have no local input to replay, so they follow the snapshot —
  // carried forward on the steering it reported, or they would stall between
  // patches and lurch on each one.
  const target = clamp(
    extrapolate(server.x, server.steering * input.steeringSpeed, ageMs),
    -input.trackHalfWidth,
    input.trackHalfWidth,
  );
  const x = blendTowardServer(motion.x, target, deltaMs, SLED_X_BLEND_RATE, SLED_X_SNAP);

  return { x, progress };
}
