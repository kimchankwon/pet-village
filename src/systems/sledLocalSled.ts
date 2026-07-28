/**
 * The local sled, simulated where the player actually is: on their own machine.
 *
 * Steering was already predicted here (see `sledRunPrediction`), but collisions
 * were not — the server tested the course against its own copy of the lane, which
 * is a round trip old. So a sled that dodged at the last moment still got bumped,
 * and one that swerved into a rock sailed past it: the two things the player can
 * see with their own eyes were the two things they had no say in.
 *
 * The course is generated from the seed the server sends, so both sides hold the
 * same rocks in the same places. That means the client can call its own hits
 * against the lane it is drawing, and simply tell the server which item it hit;
 * the server keeps that verdict so the other racers see the bump too, a little
 * later. Speed and progress follow from the effect, so they are simulated here as
 * well — otherwise a dodge would still be punished by the hill slowing down.
 *
 * Solo practice runs on exactly this code, so there is only one set of rules.
 */

import {
  SLED_EFFECTS,
  SLED_RACER_RADIUS,
  type SledCourseItem,
  type SledDifficultyConfig,
  type SledEffect,
} from '@pet-village/multiplayer-protocol';
import { predictSteeredX, predictionStepSeconds } from './sledRunPrediction';

/** Everything about our own sled that the server used to decide for us. */
export type LocalSled = {
  x: number;
  progress: number;
  speed: number;
  effect: SledEffect;
  /** Scene-clock moment the current effect wears off. */
  effectUntil: number;
  /**
   * The item the current effect came from. The server checks a report against the
   * racer's steering history and can refuse it, and this is how the sled knows
   * which effect to drop when it does.
   */
  effectItem: string;
};

export type LocalSledStep = {
  sled: LocalSled;
  /** Items hit this frame, in course order — to be reported to the server. */
  hits: SledCourseItem[];
};

export function newLocalSled(x: number): LocalSled {
  return { x, progress: 0, speed: 0, effect: '', effectUntil: 0, effectItem: '' };
}

/** Drop an effect the server refused, if it is still the one the sled is under. */
export function clearRejectedEffect(sled: LocalSled, itemId: string): LocalSled {
  if (sled.effectItem !== itemId) return sled;
  return { ...sled, effect: '', effectUntil: 0, effectItem: '' };
}

/** How fast the sled settles onto the speed its current effect asks for. */
export const SLED_SPEED_BLEND_RATE = 7;

/**
 * Items the sled passed through between two progress marks, at the lane it is in
 * now. Same test the server used to run, so a race replays the same way on both
 * sides — it just runs against the lane the player is really steering.
 */
export function sledCourseHits(
  course: readonly SledCourseItem[],
  claimed: ReadonlySet<string>,
  from: number,
  to: number,
  x: number,
): SledCourseItem[] {
  return course.filter(
    (item) =>
      !claimed.has(item.id) &&
      item.progress + item.radius >= from &&
      item.progress - item.radius <= to &&
      Math.abs(item.x - x) <= item.radius + SLED_RACER_RADIUS,
  );
}

/**
 * One frame of our own sled: steer, run down the hill, and call any collision it
 * ran into. `claimed` is every item already hit this race, so a wide obstacle
 * spanning several frames only counts once.
 */
export function stepLocalSled(
  sled: LocalSled,
  input: {
    steering: -1 | 0 | 1;
    course: readonly SledCourseItem[];
    claimed: ReadonlySet<string>;
    config: SledDifficultyConfig;
    deltaMs: number;
    /** Scene clock, for effect expiry. */
    now: number;
  },
): LocalSledStep {
  const { config, deltaMs, now } = input;
  const seconds = predictionStepSeconds(deltaMs);
  let effect: SledEffect = sled.effect && now >= sled.effectUntil ? '' : sled.effect;
  let effectUntil = effect ? sled.effectUntil : 0;
  let effectItem = effect ? sled.effectItem : '';
  const multiplier = effect ? SLED_EFFECTS[effect].multiplier : 1;
  let speed = sled.speed + (config.baseSpeed * multiplier - sled.speed)
    * Math.min(1, seconds * SLED_SPEED_BLEND_RATE);
  const x = predictSteeredX(sled.x, input.steering, config.steeringSpeed, config.trackHalfWidth, deltaMs);
  const progress = Math.min(config.courseLength, sled.progress + speed * seconds);

  const hits = sledCourseHits(input.course, input.claimed, sled.progress, progress, x);
  // Hit two things in one frame and the later one wins, exactly as the server's
  // own loop used to resolve it.
  for (const item of hits) {
    effect = item.kind === 'ice' ? 'ice' : 'obstacle';
    effectUntil = now + SLED_EFFECTS[effect].durationMs;
    effectItem = item.id;
    speed = config.baseSpeed * SLED_EFFECTS[effect].multiplier;
  }

  return { sled: { x, progress, speed, effect, effectUntil, effectItem }, hits };
}
