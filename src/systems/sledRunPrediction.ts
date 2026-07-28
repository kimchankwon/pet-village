/**
 * Client-side prediction for Sled Run.
 *
 * The server simulates at 50ms ticks and patches at its own rate, so waiting for
 * a snapshot before moving makes steering feel like it lags a fifth of a second
 * behind the key. Instead every racer keeps a local motion state: the local sled
 * integrates its own steering immediately (the same maths the server runs), every
 * sled coasts forward on its last known speed, and both values are blended back
 * toward the authoritative snapshot so the prediction can never drift away.
 *
 * The blend is a damped correction, not a replay of un-acked input: while a key is
 * held, the pull toward a snapshot that is one round-trip old holds the predicted
 * lane a little short of a full-rate steer, so the sled settles somewhere between
 * the server's position and where pure local integration would put it. That costs
 * a few pixels of travel at steady state and buys the first frame of response,
 * which is the half the player can feel. Replaying an input buffer against each
 * snapshot would close the gap, and needs the server to ack input sequence
 * numbers — a protocol change this deliberately stops short of.
 */

export type SledMotion = { x: number; progress: number };

/** Blend rates, per second: high enough to correct fast, low enough not to snap. */
export const SLED_X_BLEND_RATE = 7;
export const SLED_PROGRESS_BLEND_RATE = 4;
/** Past these gaps the prediction is wrong about something — take the server's word. */
export const SLED_X_SNAP = 110;
export const SLED_PROGRESS_SNAP = 260;

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

export type SledMotionInput = {
  /** Latest snapshot values for this racer. */
  server: { x: number; progress: number; speed: number; rank: number };
  /** Steering the local player is holding, or null for everyone else. */
  steering: -1 | 0 | 1 | null;
  steeringSpeed: number;
  trackHalfWidth: number;
  courseLength: number;
  deltaMs: number;
};

/**
 * One frame of motion for one sled. Finished racers stop predicting: the server
 * has frozen them on the line and any coasting would push them through it.
 */
export function stepSledMotion(motion: SledMotion, input: SledMotionInput): SledMotion {
  const { server, deltaMs } = input;
  if (server.rank > 0) return { x: server.x, progress: server.progress };

  const coasted = predictProgress(motion.progress, server.speed, input.courseLength, deltaMs);
  const progress = blendTowardServer(
    coasted,
    server.progress,
    deltaMs,
    SLED_PROGRESS_BLEND_RATE,
    SLED_PROGRESS_SNAP,
  );

  // Remote sleds have no local input to replay, so they only ever chase the
  // snapshot; the local sled steers first and reconciles after.
  const steered = input.steering === null
    ? motion.x
    : predictSteeredX(motion.x, input.steering, input.steeringSpeed, input.trackHalfWidth, deltaMs);
  const x = blendTowardServer(steered, server.x, deltaMs, SLED_X_BLEND_RATE, SLED_X_SNAP);

  return { x, progress };
}
