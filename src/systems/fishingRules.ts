/** Inventory id consumed once at the start of every fishing cast. */
export const FISHING_BAIT_ID = 'bait';

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
