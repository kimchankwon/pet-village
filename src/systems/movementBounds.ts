export interface MovementBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MovementPoint {
  x: number;
  y: number;
}

/** Keep an actor's whole visual footprint inside a playable rectangle. */
export function clampToMovementBounds(
  point: MovementPoint,
  bounds: MovementBounds,
  halfWidth = 0,
  halfHeight = 0,
): MovementPoint {
  const minX = bounds.x + halfWidth;
  const maxX = bounds.x + bounds.width - halfWidth;
  const minY = bounds.y + halfHeight;
  const maxY = bounds.y + bounds.height - halfHeight;
  return {
    x: minX <= maxX ? Math.min(maxX, Math.max(minX, point.x)) : bounds.x + bounds.width / 2,
    y: minY <= maxY ? Math.min(maxY, Math.max(minY, point.y)) : bounds.y + bounds.height / 2,
  };
}

/**
 * Build one complete waypoint tour. Every destination is visited before the
 * queue refills, and the first step avoids immediately reversing when possible.
 */
export function shuffledPatrolOrder(
  count: number,
  currentIndex: number,
  previousIndex: number | null,
  random: () => number = Math.random,
): number[] {
  const order = Array.from({ length: Math.max(0, count) }, (_, i) => i).filter(
    (i) => i !== currentIndex,
  );
  for (let i = order.length - 1; i > 0; i--) {
    const roll = Math.min(0.999999, Math.max(0, random()));
    const j = Math.floor(roll * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  if (order.length > 1 && order[0] === previousIndex) {
    const swap = order.findIndex((i) => i !== previousIndex);
    [order[0], order[swap]] = [order[swap]!, order[0]!];
  }
  return order;
}
