/**
 * Headless balance simulation for the two fishing minigames.
 *
 * The point is to answer one question with numbers instead of vibes: is every
 * fish size actually catchable, and does difficulty rise with size without ever
 * hitting impossible? `fishingMinigames.test.ts` asserts on these results, and
 * `npm run sim:fishing` prints the table.
 *
 * The player models are deliberately crude but honest about the two things that
 * decide these games: you react late, and you're imprecise.
 */

import {
  createKeepItInState,
  createSweepState,
  keepItInTuning,
  stepKeepItIn,
  stepSweep,
  sweepTuning,
  tapSweep,
  type SweepState,
} from './fishingMinigames';

/** Deterministic PRNG so a failing simulation is reproducible. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal via Box–Muller, drawing from the supplied PRNG. */
function gauss(rand: () => number): number {
  const u = Math.max(1e-9, rand());
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export interface PlayerModel {
  name: string;
  /** How stale the player's view of the fish is, in seconds. */
  reactionS: number;
  /** Gap between input decisions — humans don't re-evaluate every frame. */
  decisionS: number;
  /** Error on the perceived fish position, in track fractions. */
  aimNoise: number;
  /** How far ahead the player extrapolates the bar's drift, in seconds. */
  leadS: number;
  /** Tap timing error for The Sweep, standard deviation in seconds. */
  tapSigmaS: number;
}

/** Three reference players: someone who has the knack, someone who doesn't. */
export const PLAYER_MODELS: readonly PlayerModel[] = [
  { name: 'good', reactionS: 0.17, decisionS: 0.07, aimNoise: 0.035, leadS: 0.16, tapSigmaS: 0.045 },
  { name: 'average', reactionS: 0.24, decisionS: 0.11, aimNoise: 0.06, leadS: 0.1, tapSigmaS: 0.08 },
  { name: 'poor', reactionS: 0.33, decisionS: 0.16, aimNoise: 0.1, leadS: 0.04, tapSigmaS: 0.13 },
];

export function playerModel(name: string): PlayerModel {
  const found = PLAYER_MODELS.find((m) => m.name === name);
  if (!found) throw new Error(`unknown player model: ${name}`);
  return found;
}

const DT = 1 / 60;
/** A fight that somehow runs this long counts as a loss. */
const MAX_FIGHT_S = 90;

export interface SimResult {
  caught: boolean;
  durationS: number;
}

/**
 * One Keep It In fight. The modelled player watches a delayed copy of the fish,
 * extrapolates where the coasting bar will be, and holds if the bar is below it.
 */
export function simulateKeepItIn(sizeCm: number, player: PlayerModel, rand: () => number): SimResult {
  const tuning = keepItInTuning(sizeCm);
  const state = createKeepItInState(tuning, rand);

  const delayFrames = Math.max(1, Math.round(player.reactionS / DT));
  const history: number[] = new Array(delayFrames).fill(state.fishPos);
  let held = false;
  let nextDecision = 0;
  let t = 0;

  while (state.outcome === 'playing' && t < MAX_FIGHT_S) {
    if (t >= nextDecision) {
      nextDecision = t + player.decisionS;
      const seen = history[0]! + gauss(rand) * player.aimNoise;
      const barCentre = state.barPos + tuning.barHeight / 2;
      held = barCentre + state.barVel * player.leadS < seen;
    }
    stepKeepItIn(state, tuning, DT, held, rand);
    history.push(state.fishPos);
    history.shift();
    t += DT;
  }

  return { caught: state.outcome === 'caught', durationS: t };
}

/**
 * One Sweep fight. The player always goes for the centre of the arc and lands
 * with Gaussian timing error, so the only thing that matters is how much slack
 * the current target has.
 */
export function simulateSweep(sizeCm: number, player: PlayerModel, rand: () => number): SimResult {
  const tuning = sweepTuning(sizeCm);
  const state = createSweepState(tuning, rand);
  let t = 0;

  while (state.outcome === 'playing' && t < MAX_FIGHT_S) {
    const wait = timeToZone(state);
    const error = gauss(rand) * player.tapSigmaS;
    // Advance to the intended moment, then to where the player actually tapped.
    stepSweep(state, tuning, wait + error);
    t += wait + Math.max(0, error);
    tapSweep(state, tuning, rand);
  }

  return { caught: state.outcome === 'caught', durationS: t };
}

/** Seconds until the needle next reaches the centre of the target arc. */
function timeToZone(state: SweepState): number {
  const TAU = Math.PI * 2;
  let gap = (state.zone - state.angle) % TAU;
  if (gap < 0) gap += TAU;
  return gap / state.speed;
}

export interface SimSummary {
  sizeCm: number;
  player: string;
  minigame: 'keepitin' | 'sweep';
  trials: number;
  catchRate: number;
  meanDurationS: number;
}

export function runSim(
  minigame: 'keepitin' | 'sweep',
  sizeCm: number,
  player: PlayerModel,
  trials: number,
  seed: number,
): SimSummary {
  const rand = mulberry32(seed);
  const run = minigame === 'keepitin' ? simulateKeepItIn : simulateSweep;
  let caught = 0;
  let total = 0;
  for (let i = 0; i < trials; i++) {
    const result = run(sizeCm, player, rand);
    if (result.caught) caught += 1;
    total += result.durationS;
  }
  return {
    sizeCm,
    player: player.name,
    minigame,
    trials,
    catchRate: caught / trials,
    meanDurationS: total / trials,
  };
}

/** Sizes worth reporting on: the ends of each tier, plus the extremes. */
export const SIM_SIZES: readonly number[] = [12, 20, 28, 34, 40, 48, 56, 66, 78];
