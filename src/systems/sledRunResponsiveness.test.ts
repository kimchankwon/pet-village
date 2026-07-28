/**
 * Closed-loop check on how Sled Run steering feels over a laggy link.
 *
 * The real server simulation runs on one side, the real client prediction on the
 * other, and every message between them is delayed, so what these tests measure
 * is the thing a player actually feels: does the sled go where the key says, at
 * the moment the key says it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { SLED_COUNTDOWN_MS, SledRunState, sledDifficultyConfig } from '@pet-village/multiplayer-protocol';
import { SledRaceSimulation } from '../../multiplayer-server/src/sledSimulation';
import { SteerAckClock, SteerTrace } from './sledRunLatency';
import { reconcileLocalX, steerDeadZone, stepSledMotion, type SledMotion } from './sledRunPrediction';
import { shouldSendSteer } from './sledRunPolicy';

const DIFFICULTY = 'easy';
const CONFIG = sledDifficultyConfig(DIFFICULTY);
const FRAME_MS = 16;
const TICK_MS = 50;

type Race = {
  /** Lane the client is drawing, sampled once per frame. */
  readonly lanes: Array<{ at: number; x: number; steering: number }>;
  readonly serverX: () => number;
  readonly clientX: () => number;
};

/**
 * Run one racer through `durationMs`, holding whatever `keyAt` says at each
 * frame, with `oneWayMs` of delay on every message in both directions.
 */
function race(options: {
  durationMs: number;
  oneWayMs: number;
  keyAt: (nowMs: number) => -1 | 0 | 1;
  /** Sequence number to lose in transit, as the server's rate limit would. */
  dropSeq?: number;
  seed?: string;
}): Race {
  const { durationMs, oneWayMs, keyAt } = options;
  const state = new SledRunState();
  const simulation = new SledRaceSimulation(state, () => options.seed ?? 'flat-course');
  simulation.join('local', { userId: 'user-local', displayName: 'You', penguinColor: 'blue' });
  // Start the countdown in the past so the first tick is already the race.
  simulation.start('local', -SLED_COUNTDOWN_MS);
  simulation.step(TICK_MS, 0);
  const racer = state.racers.get('local')!;

  const toServer: Array<{ at: number; steering: -1 | 0 | 1; seq: number }> = [];
  const toClient: Array<{ at: number; snapshot: { x: number; progress: number; speed: number; steering: number; inputSeq: number; rank: number } }> = [];

  let motion: SledMotion = { x: 0, progress: 0 };
  let snapshot = { x: 0, progress: 0, speed: racer.speed, steering: 0, inputSeq: 0, rank: 0 };
  let snapshotAt = 0;
  let previousSteering: -1 | 0 | 1 = 0;
  let lastSentAt = Number.NEGATIVE_INFINITY;
  let seq = 0;
  const ackClock = new SteerAckClock();
  const trace = new SteerTrace();
  const lanes: Race['lanes'] = [];

  for (let now = 0; now <= durationMs; now += 1) {
    while (toServer.length && toServer[0]!.at <= now) {
      const input = toServer.shift()!;
      if (input.seq === options.dropSeq) continue;
      simulation.input('local', { steering: input.steering, seq: input.seq }, now);
    }
    while (toClient.length && toClient[0]!.at <= now) {
      snapshot = toClient.shift()!.snapshot;
      snapshotAt = now;
      ackClock.acked(snapshot.inputSeq, now);
      const traced = ackClock.measured ? trace.sample(now - ackClock.roundTripMs) : undefined;
      if (traced !== undefined) {
        motion = {
          ...motion,
          x: reconcileLocalX(motion.x, snapshot.x, traced, CONFIG.steeringSpeed, CONFIG.trackHalfWidth),
        };
      }
    }
    if (now % TICK_MS === 0 && now > 0) {
      simulation.step(TICK_MS, now);
      toClient.push({
        at: now + oneWayMs,
        snapshot: {
          x: racer.x, progress: racer.progress, speed: racer.speed,
          steering: racer.steering, inputSeq: racer.inputSeq, rank: racer.rank,
        },
      });
    }
    if (now % FRAME_MS !== 0) continue;
    const steering = keyAt(now);
    if (shouldSendSteer(previousSteering, steering, now, lastSentAt)) {
      seq += 1;
      toServer.push({ at: now + oneWayMs, steering, seq });
      ackClock.sent(seq, now);
      previousSteering = steering;
      lastSentAt = now;
    }
    motion = stepSledMotion(motion, {
      server: snapshot,
      steering,
      steeringSpeed: CONFIG.steeringSpeed,
      trackHalfWidth: CONFIG.trackHalfWidth,
      courseLength: CONFIG.courseLength,
      deltaMs: FRAME_MS,
      ageMs: now - snapshotAt,
    });
    trace.record(now, motion.x);
    lanes.push({ at: now, x: motion.x, steering });
  }

  return { lanes, serverX: () => racer.x, clientX: () => motion.x };
}

/** Lane speed between consecutive frames, in pixels per second. */
function laneSpeeds(lanes: Race['lanes']) {
  return lanes.slice(1).map((lane, index) => ({
    at: lane.at,
    steering: lane.steering,
    speed: (lane.x - lanes[index]!.x) / (FRAME_MS / 1_000),
  }));
}

test('holding a key steers at the full rate from the first frame, on a laggy link', () => {
  const { lanes } = race({ durationMs: 600, oneWayMs: 70, keyAt: () => 1 });
  const first = lanes.find((lane) => lane.at === FRAME_MS)!;
  assert.ok(
    first.x >= CONFIG.steeringSpeed * (FRAME_MS / 1_000) - 0.01,
    `expected a full frame of travel immediately, got ${first.x}`,
  );
  // The server's answer is 140ms behind the key; none of that may show up as a
  // stall, a dip or a shortfall in what the player is watching.
  for (const { at, speed } of laneSpeeds(lanes)) {
    assert.ok(
      speed > CONFIG.steeringSpeed * 0.98,
      `lane speed dipped to ${Math.round(speed)} at ${at}ms`,
    );
  }
  // Over the whole hold the sled tracks the trajectory the key describes, to
  // within the resolution the server itself steers at.
  const held = lanes[lanes.length - 1]!;
  const ideal = CONFIG.steeringSpeed * (held.at / 1_000);
  assert.ok(
    Math.abs(held.x - ideal) < steerDeadZone(CONFIG.steeringSpeed),
    `expected ${Math.round(ideal)}px of travel over ${held.at}ms, got ${held.x}`,
  );
});

test('releasing a key stops the sled, even while the server is still turning', () => {
  const released = 300;
  const { lanes } = race({ durationMs: 800, oneWayMs: 70, keyAt: (now) => (now < released ? 1 : 0) });
  const atRelease = lanes.find((lane) => lane.at >= released)!;
  for (const lane of lanes.filter((lane) => lane.at >= atRelease.at)) {
    assert.ok(
      Math.abs(lane.x - atRelease.x) < 1,
      // The server keeps turning for another 70ms after the key is up; none of
      // that may be handed back to the player as a drift.
      `expected the sled to stay put after release, drifted ${lane.x - atRelease.x} at ${lane.at}ms`,
    );
  }
});

test('the client ends the run where the server has it, having led it all the way', () => {
  const held = 500;
  const { serverX, clientX } = race({
    durationMs: 1_400, oneWayMs: 70, keyAt: (now) => (now < held ? -1 : 0),
  });
  assert.ok(
    Math.abs(clientX() - serverX()) < steerDeadZone(CONFIG.steeringSpeed),
    `expected agreement once the input settles, client ${clientX()} vs server ${serverX()}`,
  );
});

test('an input the server never applied is reconciled away, without a lurch', () => {
  // The release is lost in transit — the server's rate limit refuses inputs that
  // land within 12ms of each other, which two frames of a 120Hz display can do.
  // Until the heartbeat repeats it, the server is steering a sled the player has
  // let go of, and that is a disagreement the prediction genuinely cannot explain.
  const { lanes, serverX, clientX } = race({
    durationMs: 1_600, oneWayMs: 70, keyAt: (now) => (now < 300 ? 1 : 0), dropSeq: 2,
  });
  const settled = lanes.filter((lane) => lane.at > 900);
  for (const [index, lane] of settled.entries()) {
    if (index === 0) continue;
    assert.ok(
      Math.abs(lane.x - settled[index - 1]!.x) < 6,
      `expected the correction to arrive smoothly, jumped ${lane.x - settled[index - 1]!.x} at ${lane.at}ms`,
    );
  }
  assert.ok(
    Math.abs(clientX() - serverX()) < steerDeadZone(CONFIG.steeringSpeed),
    `expected the prediction to give way, client ${clientX()} vs server ${serverX()}`,
  );
});
