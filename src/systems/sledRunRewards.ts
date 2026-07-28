import type { SledDifficulty } from '@pet-village/multiplayer-protocol';

export type SledRunReward = { coins: number; happiness: number };

const COINS: Record<SledDifficulty, readonly [number, number, number, number]> = {
  easy: [8, 5, 3, 2],
  medium: [14, 9, 6, 3],
  hard: [22, 14, 9, 5],
};
const HAPPINESS = [8, 6, 4, 2] as const;

export function sledRunReward(difficulty: SledDifficulty, rank: number): SledRunReward | undefined {
  if (!Number.isInteger(rank) || rank < 1 || rank > 4) return undefined;
  return { coins: COINS[difficulty][rank - 1], happiness: HAPPINESS[rank - 1] };
}
