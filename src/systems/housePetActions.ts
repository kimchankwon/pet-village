export function bedTuckAvailability(placed: readonly { id: string }[], petTucking: boolean) {
  const hasBed = placed.some((item) => item.id === 'bed');
  return {
    hasBed,
    disabled: !hasBed || petTucking,
    label: hasBed ? 'Tuck into bed (full energy!)' : 'Tuck into bed (needs a Dream Bed)',
  };
}

/** Standing this close to a placed bed offers the tuck-in interaction. */
export const BED_INTERACT_RADIUS = 60;

export type BedCandidate = { gx: number; gy: number; x: number; y: number };

/**
 * Nearest placed bed the player can tuck the pet into right now.
 * Null while a tuck is already running, so the prompt can't re-trigger.
 */
export function nearestBedInteraction(
  beds: readonly BedCandidate[],
  player: { x: number; y: number },
  options: { petName: string; petTucking: boolean; radius?: number },
) {
  if (options.petTucking) return null;
  const radius = options.radius ?? BED_INTERACT_RADIUS;
  let nearest: BedCandidate | null = null;
  let nearestDistance = Infinity;
  for (const bed of beds) {
    const distance = Math.hypot(bed.x - player.x, bed.y - player.y);
    if (distance <= radius && distance < nearestDistance) {
      nearest = bed;
      nearestDistance = distance;
    }
  }
  if (!nearest) return null;
  return {
    bed: nearest,
    x: nearest.x,
    y: nearest.y,
    radius,
    label: `E / Space / click — Tuck ${options.petName} into bed`,
  };
}
