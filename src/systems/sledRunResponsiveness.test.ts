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
import {
  SLED_COUNTDOWN_MS,
  SLED_RACER_RADIUS,
  SLED_TICK_MS,
  SledRunState,
  generateSledCourse,
  sledDifficultyConfig,
  type SledCourseItem,
  type SledEffect,
} from '@pet-village/multiplayer-protocol';
import { SledRaceSimulation } from '../../multiplayer-server/src/sledSimulation';
import { SteerAckClock, SteerTrace } from './sledRunLatency';
import { newLocalSled, stepLocalSled, type LocalSled } from './sledLocalSled';
import { reconcileLocalProgress, reconcileLocalX, steerDeadZone } from './sledRunPrediction';
import { shouldSendSteer } from './sledRunPolicy';

const DIFFICULTY = 'easy';
const CONFIG = sledDifficultyConfig(DIFFICULTY);
const FRAME_MS = 16;
// The server's own step: the dead zone is a tick of travel, so a harness that
// stepped at anything else would stop modelling the thing being asserted.
const TICK_MS = SLED_TICK_MS;
const SEED = 'flat-course';
/** One way across a link a phone on mobile data would call unremarkable. */
const LAG_MS = 120;

type Race = {
  /** Lane the client is drawing, sampled once per frame. */
  readonly lanes: Array<{ at: number; x: number; steering: number }>;
  /** Our own sled, frame by frame: lane, speed and the effect it called itself. */
  readonly frames: Array<{ at: number; sled: LocalSled }>;
  /** What the server had us doing when each snapshot was made. */
  readonly snapshots: Array<{ at: number; speed: number; effect: SledEffect }>;
  /** Where the server had the sled at each of its own ticks. */
  readonly serverLanes: Array<{ at: number; x: number; progress: number }>;
  readonly serverX: () => number;
  readonly serverEffect: () => SledEffect;
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
  /** Shove the server's sled sideways at `at`, the way a collision would. */
  knock?: { at: number; by: number };
  /** Cut the link for a while, the way a dropped socket does before it reconnects. */
  outage?: { at: number; ms: number };
  seed?: string;
}): Race {
  const { durationMs, oneWayMs, keyAt } = options;
  const seed = options.seed ?? SEED;
  const state = new SledRunState();
  const simulation = new SledRaceSimulation(state, () => seed);
  simulation.join('local', { userId: 'user-local', displayName: 'You', penguinColor: 'blue' });
  // Start the countdown in the past so the first tick is already the race.
  simulation.start('local', -SLED_COUNTDOWN_MS);
  simulation.step(TICK_MS, 0);
  const racer = state.racers.get('local')!;
  // Both sides build the course from the seed, which is what lets the client call
  // its own collisions and the server recognize the item it names.
  const course = generateSledCourse(seed, DIFFICULTY);

  const toServer: Array<{ at: number; steering: -1 | 0 | 1; seq: number }> = [];
  const hitsToServer: Array<{ at: number; itemId: string }> = [];
  const toClient: Array<{ at: number; snapshot: { x: number; progress: number; speed: number; steering: number; inputSeq: number; effect: SledEffect; rank: number } }> = [];

  let sled: LocalSled = { ...newLocalSled(0), speed: racer.speed };
  const claimed = new Set<string>();
  let snapshot = { x: 0, progress: 0, speed: racer.speed, steering: 0, inputSeq: 0, effect: '' as SledEffect, rank: 0 };
  let snapshotAt = 0;
  let previousSteering: -1 | 0 | 1 = 0;
  let lastSentAt = Number.NEGATIVE_INFINITY;
  let seq = 0;
  let ackClock = new SteerAckClock();
  const trace = new SteerTrace();
  const lanes: Race['lanes'] = [];
  const frames: Race['frames'] = [];
  const snapshots: Race['snapshots'] = [];
  const serverLanes: Race['serverLanes'] = [];
  /** Link down: nothing crosses it, and nothing we draw is a claim about the race. */
  let dropped = false;
  let resync = false;

  for (let now = 0; now <= durationMs; now += 1) {
    if (options.knock && now === options.knock.at) racer.x += options.knock.by;
    if (options.outage && now === options.outage.at) {
      dropped = true;
      // Whatever was in flight when the socket died never lands.
      toServer.length = 0;
      hitsToServer.length = 0;
      toClient.length = 0;
    }
    if (options.outage && now === options.outage.at + options.outage.ms) {
      dropped = false;
      // Same resync the scene does on `connected`: forget the round trip and the
      // lanes traced through the blackout, and re-send the key that is held.
      resync = true;
      ackClock = new SteerAckClock();
      trace.clear();
      previousSteering = 0;
      lastSentAt = Number.NEGATIVE_INFINITY;
    }
    while (toServer.length && toServer[0]!.at <= now) {
      const input = toServer.shift()!;
      if (input.seq === options.dropSeq) continue;
      simulation.input('local', { steering: input.steering, seq: input.seq }, now);
    }
    while (hitsToServer.length && hitsToServer[0]!.at <= now) {
      simulation.hit('local', { itemId: hitsToServer.shift()!.itemId }, now);
    }
    while (toClient.length && toClient[0]!.at <= now) {
      snapshot = toClient.shift()!.snapshot;
      snapshotAt = now;
      snapshots.push({ at: now, speed: snapshot.speed, effect: snapshot.effect });
      if (resync) {
        resync = false;
        sled = { x: snapshot.x, progress: snapshot.progress, speed: snapshot.speed, effect: '', effectUntil: 0 };
        trace.clear();
        continue;
      }
      ackClock.acked(snapshot.inputSeq, now);
      const traced = ackClock.measured ? trace.sample(now - ackClock.roundTripMs) : undefined;
      if (traced !== undefined) {
        const x = reconcileLocalX(sled.x, snapshot.x, traced, CONFIG.steeringSpeed, CONFIG.trackHalfWidth);
        trace.shift(x - sled.x);
        sled = { ...sled, x };
      }
    }
    if (now % TICK_MS === 0 && now > 0) {
      simulation.step(TICK_MS, now);
      serverLanes.push({ at: now, x: racer.x, progress: racer.progress });
      // A snapshot made while the link is down is never delivered.
      if (!dropped) {
        toClient.push({
          at: now + oneWayMs,
          snapshot: {
            x: racer.x, progress: racer.progress, speed: racer.speed,
            steering: racer.steering, inputSeq: racer.inputSeq,
            effect: racer.effect, rank: racer.rank,
          },
        });
      }
    }
    if (now % FRAME_MS !== 0) continue;
    const steering = keyAt(now);
    if (!dropped && shouldSendSteer(previousSteering, steering, now, lastSentAt)) {
      seq += 1;
      toServer.push({ at: now + oneWayMs, steering, seq });
      ackClock.sent(seq, now);
      previousSteering = steering;
      lastSentAt = now;
    }
    if (dropped) {
      // Prediction is frozen on the last snapshot: steering that cannot reach the
      // server would only build a lane the race will never agree with.
      sled = { ...sled, x: snapshot.x, progress: snapshot.progress };
      lanes.push({ at: now, x: sled.x, steering });
      frames.push({ at: now, sled });
      continue;
    }
    // The whole of our own sled runs here — including the collisions, which are
    // reported to the server rather than waited on.
    const step = stepLocalSled(sled, {
      steering, course, claimed, config: CONFIG, deltaMs: FRAME_MS, now,
    });
    sled = {
      ...step.sled,
      progress: reconcileLocalProgress(
        step.sled.progress, snapshot, now - snapshotAt, CONFIG.courseLength, FRAME_MS,
      ),
    };
    for (const item of step.hits) {
      claimed.add(item.id);
      hitsToServer.push({ at: now + oneWayMs, itemId: item.id });
    }
    trace.record(now, sled.x);
    lanes.push({ at: now, x: sled.x, steering });
    frames.push({ at: now, sled });
  }

  return {
    lanes,
    frames,
    snapshots,
    serverLanes,
    serverX: () => racer.x,
    serverEffect: () => racer.effect,
    clientX: () => sled.x,
  };
}

/** The first thing on the course a sled starting in the middle would run into. */
function firstItemInTheWay(): SledCourseItem {
  const item = generateSledCourse(SEED, DIFFICULTY)
    .find((candidate) => Math.abs(candidate.x) <= candidate.radius);
  assert.ok(item, `seed ${SEED} has nothing in the middle of the track to collide with`);
  return item;
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

test('a wide correction is applied to the lane being steered, not the one in the snapshot', () => {
  // A shove the client had no way to predict, while the key stays held down. The
  // correction has to be worth the whole shove: a snapshot describes the lane the
  // server held one round trip ago, so taking it literally would also undo the
  // steering done since and leave the player short by an RTT of travel.
  const KNOCK = -150;
  const released = 900;
  const { lanes, serverX, clientX } = race({
    durationMs: 1_600,
    oneWayMs: 70,
    keyAt: (now) => (now < released ? 1 : 0),
    knock: { at: 400, by: KNOCK },
  });
  const deltas = lanes.slice(1).map((lane, index) => lane.x - lanes[index]!.x);
  const jump = deltas.reduce((widest, delta) => (Math.abs(delta) > Math.abs(widest) ? delta : widest), 0);
  assert.ok(
    Math.abs(jump - KNOCK) < steerDeadZone(CONFIG.steeringSpeed),
    `expected the whole ${KNOCK}px shove in one correction, got ${Math.round(jump)}`,
  );
  // One correction, then straight back to steering at the rate the key asks for —
  // and only one, because the trace moves with it.
  const steeringAfter = lanes.filter((lane) => lane.at > 700 && lane.at <= released);
  for (const [index, lane] of steeringAfter.entries()) {
    if (index === 0) continue;
    const speed = (lane.x - steeringAfter[index - 1]!.x) / (FRAME_MS / 1_000);
    assert.ok(speed > CONFIG.steeringSpeed * 0.98, `lane speed dipped to ${Math.round(speed)} at ${lane.at}ms`);
  }
  assert.ok(
    Math.abs(clientX() - serverX()) < steerDeadZone(CONFIG.steeringSpeed),
    `expected agreement once the key is released, client ${clientX()} vs server ${serverX()}`,
  );
});

test('a reconnect takes the lane the server raced without us, and steers on from there', () => {
  // The key is released just before the socket dies, so the release is lost and the
  // server keeps turning through the blackout: on the way back the client's own
  // lane is stale by everything that happened while it was gone.
  const OUTAGE = { at: 300, ms: 400 };
  const { lanes, serverX, clientX } = race({
    durationMs: 1_600, oneWayMs: 70, keyAt: (now) => (now < 250 ? 1 : 0), outage: OUTAGE,
  });
  const during = lanes.filter((lane) => lane.at >= OUTAGE.at && lane.at < OUTAGE.at + OUTAGE.ms);
  for (const lane of during) {
    assert.equal(lane.x, during[0]!.x, `the lane drifted to ${lane.x} at ${lane.at}ms while dropped`);
  }
  // Back on the server's lane within a round trip of the link returning, without
  // being dragged back later by a snapshot from before the drop.
  const back = lanes.filter((lane) => lane.at > OUTAGE.at + OUTAGE.ms + 150);
  for (const [index, lane] of back.entries()) {
    if (index === 0) continue;
    assert.ok(
      Math.abs(lane.x - back[index - 1]!.x) < 6,
      `expected steady steering after the reconnect, jumped ${lane.x - back[index - 1]!.x} at ${lane.at}ms`,
    );
  }
  // The server turns for one more tick before the re-sent release reaches it, and a
  // difference that small is inside the dead zone the reconciler leaves alone.
  assert.ok(
    Math.abs(clientX() - serverX()) <= steerDeadZone(CONFIG.steeringSpeed) + 0.5,
    `expected the reconnected client on the server's lane, client ${clientX()} vs server ${serverX()}`,
  );
});

test('a collision is felt the frame the client sees it, and the server follows', () => {
  const item = firstItemInTheWay();
  const { frames, snapshots, serverEffect } = race({ durationMs: 2_400, oneWayMs: LAG_MS, keyAt: () => 0 });
  const feltAt = frames.findIndex((frame) => frame.sled.effect !== '');
  const felt = frames[feltAt];
  assert.ok(felt, 'the client drove straight into the course and felt nothing');
  // The effect lands in the very frame the sled reaches the item — no round trip
  // between what the player is watching and what it does to them.
  assert.ok(
    frames[feltAt - 1]!.sled.progress < item.progress - item.radius && felt.sled.progress >= item.progress - item.radius,
    `expected the hit as the sled reached ${item.progress - item.radius}, got it at ${Math.round(felt.sled.progress)}`,
  );
  assert.ok(
    felt.sled.speed > CONFIG.baseSpeed * 1.4,
    `expected the boost in the same frame as the hit, speed was ${Math.round(felt.sled.speed)}`,
  );
  // The server learns of it from the report, so it is behind by the trip there —
  // that lag is now the other racers' view of the bump, not the player's own.
  const heard = snapshots.find((snapshot) => snapshot.effect !== '');
  assert.ok(heard, 'the server was never told about the collision');
  assert.ok(heard.at > felt.at, `the server had the effect at ${heard.at}ms, before the client at ${felt.at}ms`);
  assert.ok(
    heard.at - felt.at < LAG_MS * 3,
    `expected the server a fraction of a second behind, it was ${heard.at - felt.at}ms`,
  );
  assert.equal(serverEffect(), 'ice');
});

test('a dodge the server has not seen yet is not punished', () => {
  const item = firstItemInTheWay();
  // Run straight into it once, to learn the moment of contact.
  const straight = race({ durationMs: 2_400, oneWayMs: LAG_MS, keyAt: () => 0 });
  const contact = straight.frames.find((frame) => frame.sled.effect !== '');
  assert.ok(contact, 'the straight run never reached the item');
  // Now the same run, steering off the item only just before that moment: far
  // enough to clear it by 10px on the player's screen, late enough that the
  // server's copy of the lane — a round trip old — still has us pointed at it.
  const side: -1 | 1 = item.x > 0 ? -1 : 1;
  const clearBy = item.radius + SLED_RACER_RADIUS - Math.abs(item.x) + 10;
  const dodgeAt = contact.at - Math.ceil((clearBy / CONFIG.steeringSpeed) * 1_000);
  const { frames, snapshots, serverLanes, serverEffect } = race({
    durationMs: 2_400, oneWayMs: LAG_MS, keyAt: (now) => (now < dodgeAt ? 0 : side),
  });
  const serverAtContact = serverLanes.find((lane) => lane.progress >= item.progress - item.radius);
  assert.ok(serverAtContact, 'the server never reached the item');
  assert.ok(
    Math.abs(item.x - serverAtContact.x) <= item.radius + SLED_RACER_RADIUS,
    'the server had already caught up with the dodge, so this no longer tests anything',
  );
  assert.ok(
    frames.every((frame) => frame.sled.effect === ''),
    'the sled that dodged was bumped anyway',
  );
  assert.ok(
    snapshots.every((snapshot) => snapshot.effect === '') && serverEffect() === '',
    'the server applied an effect nobody reported',
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
