export type MovementFacing = 'up' | 'down' | 'side';

/**
 * Choose the penguin's facing from its movement vector.
 * Vertical wins inside the 90-degree total cones above and below the player:
 * 45 degrees on either side, including the diagonal boundaries.
 */
export function movementFacing(
  vx: number,
  vy: number,
  current: MovementFacing,
): MovementFacing {
  if (vx === 0 && vy === 0) return current;
  if (Math.abs(vy) >= Math.abs(vx)) return vy < 0 ? 'up' : 'down';
  return 'side';
}
