import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SLED_EFFECTS,
  SLED_RACER_RADIUS,
  sledDifficultyConfig,
  type SledCourseItem,
} from '@pet-village/multiplayer-protocol';
import { newLocalSled, sledCourseHits, stepLocalSled } from './sledLocalSled';

const CONFIG = sledDifficultyConfig('easy');
const FRAME_MS = 16;

const item = (over: Partial<SledCourseItem> = {}): SledCourseItem => ({
  id: 'rock-0', kind: 'rock', x: 0, progress: 500, radius: 28, ...over,
});

/** A sled already up to speed, the way the start signal leaves it. */
function racing(x = 0, progress = 0) {
  return { ...newLocalSled(x), progress, speed: CONFIG.baseSpeed };
}

function run(
  sled = racing(),
  options: { steering?: -1 | 0 | 1; course?: SledCourseItem[]; frames?: number; from?: number } = {},
) {
  const course = options.course ?? [];
  const claimed = new Set<string>();
  const hits: SledCourseItem[] = [];
  let current = sled;
  const frames = options.frames ?? 1;
  const from = options.from ?? 0;
  for (let frame = 0; frame < frames; frame += 1) {
    const step = stepLocalSled(current, {
      steering: options.steering ?? 0,
      course,
      claimed,
      config: CONFIG,
      deltaMs: FRAME_MS,
      now: from + frame * FRAME_MS,
    });
    current = step.sled;
    for (const hit of step.hits) {
      claimed.add(hit.id);
      hits.push(hit);
    }
  }
  return { sled: current, hits };
}

test('a sled that passes beside an obstacle keeps every bit of its speed', () => {
  const rock = item({ x: 0, progress: 500 });
  // Clear of it by a pixel, on the lane the player is steering.
  const beside = racing(rock.radius + SLED_RACER_RADIUS + 1, 480);
  const { sled, hits } = run(beside, { course: [rock], frames: 8 });
  assert.deepEqual(hits, []);
  assert.equal(sled.effect, '');
  assert.equal(sled.speed, CONFIG.baseSpeed);
  assert.ok(sled.progress > 500, `expected the sled past the rock, it is at ${sled.progress}`);
});

test('an obstacle is hit once, in the frame the sled reaches it, and slows it there', () => {
  const rock = item({ x: 0, progress: 500 });
  const { sled, hits } = run(racing(0, 480), { course: [rock], frames: 8 });
  // Eight frames span the whole rock; a wide hazard must not bill the sled twice.
  assert.deepEqual(hits.map((hit) => hit.id), ['rock-0']);
  assert.equal(sled.effect, 'obstacle');
  // Timed from the frame that called it — the first one here, at now = 0.
  assert.equal(sled.effectUntil, SLED_EFFECTS.obstacle.durationMs);
  assert.ok(sled.speed < CONFIG.baseSpeed * 0.7, `expected a slowdown, speed is ${sled.speed}`);
});

test('ice is a boost, and it wears off back to the base speed', () => {
  const ice = item({ id: 'ice-0', kind: 'ice', x: 0, progress: 200, radius: 44 });
  const boosted = run(racing(0, 180), { course: [ice], frames: 2 });
  assert.equal(boosted.sled.effect, 'ice');
  assert.equal(boosted.sled.speed, CONFIG.baseSpeed * SLED_EFFECTS.ice.multiplier);
  // Run on past the expiry: the effect clears and the speed settles back down.
  const after = run(boosted.sled, { frames: 140, from: SLED_EFFECTS.ice.durationMs });
  assert.equal(after.sled.effect, '');
  assert.ok(
    Math.abs(after.sled.speed - CONFIG.baseSpeed) < 1,
    `expected the base speed back, got ${after.sled.speed}`,
  );
});

test('two hazards crossed in one frame resolve to the later one', () => {
  const rock = item({ id: 'rock-0', x: 0, progress: 1_000 });
  const ice = item({ id: 'ice-1', kind: 'ice', x: 0, progress: 1_002, radius: 44 });
  const { sled, hits } = run(racing(0, 999), { course: [rock, ice], frames: 1 });
  assert.deepEqual(hits.map((hit) => hit.id), ['rock-0', 'ice-1']);
  assert.equal(sled.effect, 'ice');
  assert.equal(sled.speed, CONFIG.baseSpeed * SLED_EFFECTS.ice.multiplier);
});

test('the lane is steered and clamped to the track, and progress stops at the finish', () => {
  const held = run(racing(0, 0), { steering: 1, frames: 200 });
  assert.equal(held.sled.x, CONFIG.trackHalfWidth);
  const finishing = run(racing(0, CONFIG.courseLength - 1), { frames: 4 });
  assert.equal(finishing.sled.progress, CONFIG.courseLength);
});

test('hits are looked for across the whole span travelled, not just where the sled lands', () => {
  const rock = item({ x: 0, progress: 500, radius: 4 });
  // A single frame long enough to jump the rock entirely: it still counts, or a
  // slow frame would be a free pass through the course.
  const jumped = sledCourseHits([rock], new Set(), 400, 600, 0);
  assert.deepEqual(jumped.map((hit) => hit.id), ['rock-0']);
  // Already claimed, or in another lane: nothing to report.
  assert.deepEqual(sledCourseHits([rock], new Set(['rock-0']), 400, 600, 0), []);
  assert.deepEqual(sledCourseHits([rock], new Set(), 400, 600, 200), []);
});
