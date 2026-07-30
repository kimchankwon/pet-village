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

/**
 * What a snack will actually do once both needs clamp at 100. Gains are whole
 * numbers: needs decay continuously, so a raw gain is usually fractional and
 * `+7.7 food` has no business being in a menu.
 */
export interface PetFoodPreview {
  hungerGain: number;
  happinessGain: number;
  /** Neither need can visibly move — the snack would be spent for nothing. */
  wasted: boolean;
}

export function previewPetFood(pet: FeedablePetStats, item: PetFoodLike): PetFoodPreview {
  const gain = (need: number, bonus: number | undefined) =>
    Math.round(clampNeed(need + (bonus ?? 0)) - need);
  const hungerGain = gain(pet.hunger, item.hunger);
  const happinessGain = gain(pet.happiness, item.happiness);
  return { hungerGain, happinessGain, wasted: hungerGain === 0 && happinessGain === 0 };
}

/**
 * Menu hint for one snack, e.g. `+15 food · +5 happy`. Shows what the pet will
 * really gain right now so a full pet's snacks read as `no effect` instead of
 * quietly vanishing when eaten.
 */
export function petFoodEffectLabel(pet: FeedablePetStats, item: PetFoodLike): string {
  const { hungerGain, happinessGain, wasted } = previewPetFood(pet, item);
  if (wasted) return 'no effect — already full';
  const parts: string[] = [];
  if (hungerGain > 0) parts.push(`+${hungerGain} food`);
  if (happinessGain > 0) parts.push(`+${happinessGain} happy`);
  return parts.join(' · ');
}
