/** Inventory id consumed once at the start of every fishing cast. */
export const FISHING_BAIT_ID = 'bait';

/** The three catchable fish, commonest first. */
export type FishTierId = 'oceanfish-common' | 'oceanfish-uncommon' | 'oceanfish-rare';

/**
 * Landing a fish cheers the pet then and there — the fish itself is food for
 * later, so without this a cast would spend energy for nothing immediate. Rarer
 * fish fight harder, so they cheer more.
 */
export const FISHING_CATCH_HAPPINESS: Record<FishTierId, number> = {
  'oceanfish-common': 4,
  'oceanfish-uncommon': 7,
  'oceanfish-rare': 11,
};

export function fishingBaitCount(inventory: Record<string, number>): number {
  const count = inventory[FISHING_BAIT_ID] ?? 0;
  return Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
}

export function hasFishingBait(inventory: Record<string, number>): boolean {
  return fishingBaitCount(inventory) > 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Near/small fish stay approachable; all fights are about 6% tougher. */
export function fishingFightStrength(
  baseFight: number,
  sizeCm: number,
  castPower: number,
): number {
  const sizeNorm = clamp(sizeCm / 78, 0.12, 1);
  const distanceFactor = 0.55 + clamp(castPower, 0, 1) * 0.5;
  return clamp(baseFight * (0.5 + sizeNorm * 0.55) * distanceFactor * 1.06, 0.24, 1.1);
}

/** Slightly shorter reaction window than the original 520–1200ms range. */
export function fishingBiteWindowMs(sizeCm: number, fight: number): number {
  return Math.round(clamp(1100 - sizeCm * 5 - fight * 80, 500, 1100));
}

export interface FishTier {
  id: FishTierId;
  sizeMin: number;
  sizeMax: number;
  /** Base fight strength — drives the bobber thrash visuals only. */
  fight: number;
  label: string;
}

/** Commonest first. Sizes span FISHING_SIZE_MIN..FISHING_SIZE_MAX end to end. */
export const FISH_TIERS: readonly FishTier[] = [
  { id: 'oceanfish-common', sizeMin: 12, sizeMax: 28, fight: 0.4, label: 'common' },
  { id: 'oceanfish-uncommon', sizeMin: 26, sizeMax: 48, fight: 0.7, label: 'uncommon' },
  { id: 'oceanfish-rare', sizeMin: 44, sizeMax: 78, fight: 1.0, label: 'rare' },
];

/** Tier odds at a dead-short cast, and at a maxed-out one. */
const NEAR_WEIGHTS: readonly [number, number, number] = [92, 8, 0];
const FAR_WEIGHTS: readonly [number, number, number] = [6, 32, 62];

/**
 * Distance is the only lever on rarity, and it's a straight interpolation so
 * every extra bit of cast power measurably raises the odds of something big.
 */
export function fishingTierWeights(castPower: number): [number, number, number] {
  const t = clamp(castPower, 0, 1);
  return [
    NEAR_WEIGHTS[0] + (FAR_WEIGHTS[0] - NEAR_WEIGHTS[0]) * t,
    NEAR_WEIGHTS[1] + (FAR_WEIGHTS[1] - NEAR_WEIGHTS[1]) * t,
    NEAR_WEIGHTS[2] + (FAR_WEIGHTS[2] - NEAR_WEIGHTS[2]) * t,
  ];
}

export function rollFishTier(castPower: number, rand: () => number = Math.random): FishTier {
  const weights = fishingTierWeights(castPower);
  const total = weights[0] + weights[1] + weights[2];
  let roll = rand() * total;
  for (let i = 0; i < FISH_TIERS.length; i++) {
    roll -= weights[i]!;
    if (roll <= 0) return FISH_TIERS[i]!;
  }
  return FISH_TIERS[0]!;
}

/**
 * Size inside the tier, biased upward by distance: a far cast takes the better
 * of two rolls, a short one takes a flat roll. Stays inside the tier's band, so
 * no cast can produce a fish the minigame tuning hasn't been simulated for.
 */
export function rollFishSize(
  tier: FishTier,
  castPower: number,
  rand: () => number = Math.random,
): number {
  const t = clamp(castPower, 0, 1);
  const a = rand();
  const b = rand();
  const pick = a + (Math.max(a, b) - a) * t;
  return Math.round(tier.sizeMin + (tier.sizeMax - tier.sizeMin) * pick);
}
