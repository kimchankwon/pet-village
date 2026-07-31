/**
 * The two post-bite fishing minigames.
 *
 * Everything here is pure and frame-rate independent so the same code runs the
 * on-screen fight and the headless balance simulations in
 * `fishingMinigames.test.ts`. The scene owns rendering only.
 *
 * Both games scale off one number — the fish's size in cm. Small fish are slow
 * and forgiving; big fish are fast, erratic and stingy. The tuning tables below
 * are the ones the simulation signs off on: every size stays catchable.
 */

import { FISHING_SIZE_MAX, FISHING_SIZE_MIN } from './fishingRules';

export type FishingMinigameId = 'keepitin' | 'sweep';

export const FISHING_MINIGAME_IDS: readonly FishingMinigameId[] = ['keepitin', 'sweep'];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Which fight the player gets — rolled fresh on every hook-up. */
export function pickFishingMinigame(rand: () => number = Math.random): FishingMinigameId {
  const index = Math.min(FISHING_MINIGAME_IDS.length - 1, Math.floor(rand() * FISHING_MINIGAME_IDS.length));
  return FISHING_MINIGAME_IDS[index]!;
}

/** 0 at the smallest catchable fish, 1 at the largest. Drives all difficulty. */
export function fishSizeNorm(sizeCm: number): number {
  return clamp((sizeCm - FISHING_SIZE_MIN) / (FISHING_SIZE_MAX - FISHING_SIZE_MIN), 0, 1);
}

/* ============================================================
   Keep It In — hold to lift a bar, keep the fish inside it
   ============================================================ */

export interface KeepItInTuning {
  /** Catch bar height, as a fraction of the track. Shrinks with size. */
  barHeight: number;
  /** Upward acceleration while held (track-fractions per second squared). */
  lift: number;
  /** Downward acceleration while released. */
  gravity: number;
  /** Bar speed cap — the main reason the bar feels heavy rather than twitchy. */
  maxSpeed: number;
  /** Fish speed cap. Bigger fish bolt. */
  fishSpeed: number;
  /** How sharply the fish's velocity converges on its target. */
  fishSmooth: number;
  /** Seconds between the fish picking a new depth. */
  dartMin: number;
  dartMax: number;
  /** How far a new target may sit from the current spot — big fish jump anywhere. */
  dartRange: number;
  /** Catch-meter gain per second while the fish is inside the bar. */
  fillRate: number;
  /** Catch-meter loss per second at the start of the fight. */
  drainBase: number;
  /** Extra loss per second, per second elapsed — the fight gets steeper. */
  drainRamp: number;
  /** Ceiling on the ramp, as a multiple of `drainBase`. */
  drainMax: number;
  /** Catch meter at the start of the fight. */
  startProgress: number;
}

export function keepItInTuning(sizeCm: number): KeepItInTuning {
  const s = fishSizeNorm(sizeCm);
  return {
    barHeight: lerp(0.36, 0.25, s),
    // Deliberately low relative to the speed cap: the bar coasts, so the player
    // has to lead the fish instead of pinning it. This is the "less sensitive"
    // handling — small taps barely move it, and it takes about a second of hold
    // to reach full speed.
    lift: 2.35,
    gravity: 1.15,
    // Always above `fishSpeed`. If the bar's cap sat under the fish's the fight
    // would be literally untrackable, not merely hard.
    maxSpeed: lerp(0.85, 1.25, s),
    fishSpeed: lerp(0.5, 1.05, s),
    fishSmooth: lerp(4.2, 7.5, s),
    dartMin: lerp(0.8, 0.34, s),
    dartMax: lerp(2.0, 0.95, s),
    dartRange: lerp(0.42, 1, s),
    fillRate: lerp(0.44, 0.38, s),
    drainBase: lerp(0.15, 0.2, s),
    drainRamp: lerp(0.018, 0.03, s),
    drainMax: 2.4,
    startProgress: 0.4,
  };
}

export interface KeepItInState {
  /** Bottom edge of the catch bar, 0 (track floor) to 1 - barHeight. */
  barPos: number;
  barVel: number;
  /** Fish depth, 0 (floor) to 1 (surface). */
  fishPos: number;
  fishVel: number;
  fishTarget: number;
  /** Seconds until the fish picks a new target. */
  dartTimer: number;
  progress: number;
  elapsed: number;
  inZone: boolean;
  /** Set the frame the fish picks a new target — the scene flashes on this. */
  darted: boolean;
  outcome: 'playing' | 'caught' | 'escaped';
}

export function createKeepItInState(
  tuning: KeepItInTuning,
  rand: () => number = Math.random,
): KeepItInState {
  return {
    barPos: clamp(0.5 - tuning.barHeight / 2, 0, 1 - tuning.barHeight),
    barVel: 0,
    fishPos: 0.5,
    fishVel: 0,
    fishTarget: 0.5,
    dartTimer: lerp(tuning.dartMin, tuning.dartMax, rand()),
    progress: tuning.startProgress,
    elapsed: 0,
    inZone: true,
    darted: false,
    outcome: 'playing',
  };
}

/** Current catch-meter drain, which steepens the longer the fight runs. */
export function keepItInDrain(tuning: KeepItInTuning, elapsed: number): number {
  return Math.min(tuning.drainBase * tuning.drainMax, tuning.drainBase + tuning.drainRamp * elapsed);
}

/** Advances one frame. Mutates `state`; safe to call at any dt. */
export function stepKeepItIn(
  state: KeepItInState,
  tuning: KeepItInTuning,
  dt: number,
  held: boolean,
  rand: () => number = Math.random,
): void {
  if (state.outcome !== 'playing') return;
  state.elapsed += dt;
  state.darted = false;

  // Bar: constant acceleration either way, hard speed cap, dead stop at the ends.
  state.barVel = clamp(
    state.barVel + (held ? tuning.lift : -tuning.gravity) * dt,
    -tuning.maxSpeed,
    tuning.maxSpeed,
  );
  const barMax = 1 - tuning.barHeight;
  state.barPos += state.barVel * dt;
  if (state.barPos <= 0) {
    state.barPos = 0;
    state.barVel = 0;
  } else if (state.barPos >= barMax) {
    state.barPos = barMax;
    state.barVel = 0;
  }

  // Fish: picks a new depth on its own clock, then eases toward it.
  state.dartTimer -= dt;
  if (state.dartTimer <= 0) {
    state.dartTimer = lerp(tuning.dartMin, tuning.dartMax, rand());
    const spread = tuning.dartRange;
    state.fishTarget = clamp(state.fishPos + (rand() * 2 - 1) * spread, 0, 1);
    state.darted = true;
  }
  const desired = clamp((state.fishTarget - state.fishPos) * 4, -tuning.fishSpeed, tuning.fishSpeed);
  // Exact exponential convergence, not the linear `min(1, k*dt)` approximation:
  // that one snaps once k*dt >= 1, so the fish would behave differently at 30fps
  // and 144fps and diverge from the simulated balance.
  state.fishVel += (desired - state.fishVel) * (1 - Math.exp(-tuning.fishSmooth * dt));
  state.fishPos = clamp(state.fishPos + state.fishVel * dt, 0, 1);

  // Catch meter.
  state.inZone = state.fishPos >= state.barPos && state.fishPos <= state.barPos + tuning.barHeight;
  const delta = state.inZone ? tuning.fillRate : -keepItInDrain(tuning, state.elapsed);
  state.progress = clamp(state.progress + delta * dt, 0, 1);

  if (state.progress >= 1) state.outcome = 'caught';
  else if (state.progress <= 0) state.outcome = 'escaped';
}

/* ============================================================
   The Sweep — tap when the needle crosses the target arc
   ============================================================ */

export interface SweepTuning {
  /** Hits required to land the fish. */
  hitsNeeded: number;
  /** Misses allowed before the fish shakes loose. */
  lives: number;
  /** Needle speed in radians per second at the first hit. */
  speed: number;
  /** Added to the needle speed after every hit. */
  speedStep: number;
  /** Target arc width in radians. */
  zoneWidth: number;
  /** Arc width multiplier applied after every hit. */
  zoneShrink: number;
  /** Fraction of the arc, centred, that counts as a perfect hit. */
  perfectFraction: number;
  /**
   * Seconds of not tapping before the fish shakes loose. Without this the Sweep
   * has no losing condition for a player who simply stops playing — the needle
   * would spin forever. Comfortably longer than two full needle revolutions at
   * the slowest speed (2π/1.6 ≈ 3.9s), so it never punishes waiting for the arc
   * to come back round; it only ends an abandoned fight.
   */
  idleLimit: number;
}

export function sweepTuning(sizeCm: number): SweepTuning {
  const s = fishSizeNorm(sizeCm);
  return {
    hitsNeeded: Math.round(lerp(3, 6, s)),
    lives: Math.round(lerp(4, 3, s)),
    speed: lerp(1.6, 3.1, s),
    speedStep: lerp(0.22, 0.31, s),
    zoneWidth: lerp(1.25, 0.82, s),
    zoneShrink: lerp(0.93, 0.92, s),
    perfectFraction: 0.18,
    idleLimit: 9,
  };
}

export interface SweepState {
  angle: number;
  speed: number;
  zone: number;
  zoneWidth: number;
  hits: number;
  misses: number;
  perfects: number;
  /** Seconds since the last tap, against `SweepTuning.idleLimit`. */
  sinceTap: number;
  outcome: 'playing' | 'caught' | 'escaped';
}

const TAU = Math.PI * 2;

/** Shortest signed angular distance from `b` to `a`, in (-PI, PI]. */
export function angleDelta(a: number, b: number): number {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

function placeZone(state: SweepState, rand: () => number): void {
  // Always at least ~1.5rad of run-up so the next target never lands under the
  // needle before the player can react.
  state.zone = (state.angle + lerp(1.5, TAU - 1.5, rand())) % TAU;
}

export function createSweepState(
  tuning: SweepTuning,
  rand: () => number = Math.random,
): SweepState {
  const state: SweepState = {
    angle: 0,
    speed: tuning.speed,
    zone: 0,
    zoneWidth: tuning.zoneWidth,
    hits: 0,
    misses: 0,
    perfects: 0,
    sinceTap: 0,
    outcome: 'playing',
  };
  placeZone(state, rand);
  return state;
}

export function stepSweep(state: SweepState, tuning: SweepTuning, dt: number): void {
  if (state.outcome !== 'playing') return;
  state.angle = (state.angle + state.speed * dt) % TAU;
  state.sinceTap += dt;
  if (state.sinceTap >= tuning.idleLimit) state.outcome = 'escaped';
}

export type SweepTapResult = 'hit' | 'perfect' | 'miss';

/** Resolves one tap. Mutates `state` and reports what the tap did. */
export function tapSweep(
  state: SweepState,
  tuning: SweepTuning,
  rand: () => number = Math.random,
): SweepTapResult {
  if (state.outcome !== 'playing') return 'miss';
  state.sinceTap = 0;
  const off = Math.abs(angleDelta(state.angle, state.zone));
  if (off > state.zoneWidth / 2) {
    state.misses += 1;
    if (state.misses >= tuning.lives) state.outcome = 'escaped';
    return 'miss';
  }
  state.hits += 1;
  const perfect = off <= (state.zoneWidth / 2) * tuning.perfectFraction;
  if (perfect) state.perfects += 1;
  if (state.hits >= tuning.hitsNeeded) {
    state.outcome = 'caught';
    return perfect ? 'perfect' : 'hit';
  }
  state.speed += tuning.speedStep;
  state.zoneWidth *= tuning.zoneShrink;
  placeZone(state, rand);
  return perfect ? 'perfect' : 'hit';
}

/**
 * Milliseconds of timing slack on the current target — the window a tap can
 * land in and still count. The simulations read this to model human error.
 */
export function sweepToleranceMs(state: SweepState): number {
  return (state.zoneWidth / 2 / state.speed) * 1000;
}
