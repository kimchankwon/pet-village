export const FISHING_BAIT_PRICE = 3;
export const FISHY_SNACK_HUNGER = 15;

export interface PetFoodLike {
  kind: string;
  hunger?: number;
  happiness?: number;
}

export interface FeedablePetStats {
  hunger: number;
  happiness: number;
}

export function petCanEat(item: PetFoodLike | undefined): item is PetFoodLike {
  return item?.kind === 'food';
}

function clampNeed(value: number): number {
  return Math.max(0, Math.min(100, value));
}

/** Apply food needs only. Feeding intentionally never changes coins. */
export function applyPetFoodStats(pet: FeedablePetStats, item: PetFoodLike): void {
  pet.hunger = clampNeed(pet.hunger + (item.hunger ?? 0));
  pet.happiness = clampNeed(pet.happiness + (item.happiness ?? 0));
}
