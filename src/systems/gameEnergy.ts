// Energy is the thing that limits play: a tired pet can't be sent into a
// mini-game, and every booth charges its cost up front so a run is never
// abandoned half-paid. Every cost lives here so the booths stay balanced
// against each other — the tables below are the whole economy in one place.
//
// The curve is one three-tier ladder (5 / 8 / 12 energy) scaled by how long a
// booth's run takes, and each game's payout is tuned so a successful run pays
// roughly 1.2–2.2 coins per energy spent — harder tiers sit at the top of that
// band, so skill pays, but no booth is a better coin farm than the rest.
//
// Type-only imports keep this module free of runtime dependencies, so scenes
// and rule modules can both read it without an import cycle.

import type { SledDifficulty } from '@pet-village/multiplayer-protocol';
import type { BumpDifficulty, PaperTossDifficulty } from './GameState';
import type { GetDifficulty } from './getGameRules';

/** A bout is short and win-or-lose; paid up front, walking away doesn't refund. */
export const BUMP_ENERGY_COST: Record<BumpDifficulty, number> = {
  easy: 5,
  medium: 8,
  hard: 12,
};

/** One track of falling notes — same length whatever the difficulty. */
export const GET_ENERGY_COST: Record<GetDifficulty, number> = {
  easy: 5,
  normal: 8,
  hard: 12,
};

/** One race down the hill; the leader's difficulty is what each racer pays. */
export const SLED_RUN_ENERGY_COST: Record<SledDifficulty, number> = {
  easy: 5,
  medium: 8,
  hard: 12,
};

/**
 * A run is two levels of up to five throws — around twice as long as a Get track
 * and many times a Bump bout — so it costs roughly double the tier it plays at.
 */
export const PAPER_TOSS_ENERGY_COST: Record<PaperTossDifficulty, number> = {
  easy: 10,
  medium: 14,
  hard: 18,
};

/**
 * What a Paper Toss run charges given the level it starts on. A fresh run plays
 * both levels and pays the full cost; a retry after a failed second level replays
 * that level alone, so it pays for the one level it actually plays.
 */
export function paperTossEnergyCost(
  difficulty: PaperTossDifficulty,
  levelIndex = 0,
): number {
  const full = PAPER_TOSS_ENERGY_COST[difficulty];
  return levelIndex >= 1 ? Math.ceil(full / 2) : full;
}

/** One rope run, 25 jumps to clear — a long stretch at one fixed difficulty. */
export const SKIP_ROPE_ENERGY_COST = 10;

/**
 * Fishing charges per cast rather than per visit, because casts are short and
 * a visit is as many as the bait lasts.
 */
export const FISHING_ENERGY_PER_CAST = 4;

/** Scene keys of the games that charge energy — a park booth must name one. */
export const MINI_GAME_KEYS = [
  'Bump',
  'Get',
  'SledRun',
  'PaperToss',
  'SkipRope',
  'Fishing',
] as const;
export type MiniGameKey = (typeof MINI_GAME_KEYS)[number];

function cheapest(costs: Record<string, number>): number {
  return Math.min(...Object.values(costs));
}

/**
 * The cheapest run each booth sells — what walking in the door has to cost,
 * since anything less means every option inside would be greyed out.
 */
export const GAME_MIN_ENERGY: Record<MiniGameKey, number> = {
  Bump: cheapest(BUMP_ENERGY_COST),
  Get: cheapest(GET_ENERGY_COST),
  SledRun: cheapest(SLED_RUN_ENERGY_COST),
  PaperToss: cheapest(PAPER_TOSS_ENERGY_COST),
  SkipRope: SKIP_ROPE_ENERGY_COST,
  Fishing: FISHING_ENERGY_PER_CAST,
};

/** One wording for every refusal, so being tired always reads the same way. */
export function tooTiredMessage(petName: string, cost: number): string {
  return `${petName || 'Your pet'} needs ${cost} energy to play — time for a nap!`;
}
