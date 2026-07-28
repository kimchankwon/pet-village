import test from 'node:test';
import assert from 'node:assert/strict';
import { SLED_DEFAULT_RTT_MS, SteerAckClock, SteerTrace } from './sledRunLatency';

test('the ack clock times an input against the echo that carries its sequence', () => {
  const clock = new SteerAckClock();
  assert.equal(clock.roundTripMs, SLED_DEFAULT_RTT_MS);
  clock.sent(1, 1_000);
  assert.equal(clock.acked(1, 1_040), true);
  assert.equal(clock.roundTripMs, 40, 'a faster round trip is believed at once');
  // The same echo arrives on every patch until we send again; it is not a new sample.
  assert.equal(clock.acked(1, 1_400), false);
  assert.equal(clock.roundTripMs, 40);
});

test('a slower round trip is eased in, because every echo waits for a server tick', () => {
  const clock = new SteerAckClock();
  clock.sent(1, 0);
  clock.acked(1, 20);
  clock.sent(2, 100);
  clock.acked(2, 220);
  assert.ok(clock.roundTripMs > 20 && clock.roundTripMs < 40, `eased upward, got ${clock.roundTripMs}`);
  for (let seq = 3; seq < 60; seq += 1) {
    clock.sent(seq, seq * 100);
    clock.acked(seq, seq * 100 + 120);
  }
  assert.ok(clock.roundTripMs > 110, `a sustained delay is learned, got ${clock.roundTripMs}`);
});

test('a race reset echoes a sequence we never sent, and only clears the backlog', () => {
  const clock = new SteerAckClock();
  clock.sent(7, 500);
  assert.equal(clock.acked(0, 900), false, 'inputSeq restarts at 0 on a fresh run');
  assert.equal(clock.roundTripMs, SLED_DEFAULT_RTT_MS, 'no sample, no change');
  clock.sent(8, 1_000);
  assert.equal(clock.acked(8, 1_030), true, 'the stale seq 7 does not poison the estimate');
  assert.equal(clock.roundTripMs, 30);
});

test('the trace answers for the lane we predicted at a past moment', () => {
  const trace = new SteerTrace(100);
  assert.equal(trace.sample(0), undefined, 'nothing to align against yet');
  trace.record(0, 0);
  trace.record(50, 10);
  trace.record(100, 20);
  assert.equal(trace.sample(50), 10);
  assert.equal(trace.sample(75), 15, 'interpolated between frames');
  assert.equal(trace.sample(-40), 0, 'older than the trace reads as its oldest lane');
  assert.equal(trace.sample(900), 20, 'newer than the trace reads as the latest lane');
  // Samples past the window are dropped, so the trace cannot grow without bound.
  trace.record(400, 40);
  assert.equal(trace.sample(0), 40);
  trace.clear();
  assert.equal(trace.sample(400), undefined);
});

test('a correction moves the whole trace, so snapshots in flight do not repeat it', () => {
  const trace = new SteerTrace(1_000);
  trace.record(0, 0);
  trace.record(100, 20);
  trace.shift(-50);
  assert.equal(trace.sample(0), -50);
  assert.equal(trace.sample(100), -30, 'the shape of the history survives the shift');
  trace.shift(0);
  assert.equal(trace.sample(100), -30);
});
