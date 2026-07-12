// Y-sort depth from the sprite's feet (bottom), matching trees/buildings.
// Using the center (obj.y) makes you draw behind objects you're standing in front of.
export function feetDepth(obj: { y: number; displayHeight: number; originY: number }): number {
  return obj.y + obj.displayHeight * (1 - obj.originY);
}

/**
 * Depth for characters (player / pet / NPCs). Slight bias so they draw above
 * props when sharing a sort row (sprites often have empty bottom padding that
 * pushes prop depths too far south).
 */
export function characterDepth(obj: { y: number; displayHeight: number; originY: number }): number {
  return feetDepth(obj) + 2;
}

/**
 * Depth for static props. Prefer an explicit foot Y (e.g. collider anchor)
 * so padded art doesn't sort as if its feet were below the visual base.
 */
export function propDepth(
  img: { y: number; displayHeight: number; originY: number },
  footY?: number,
): number {
  return footY ?? feetDepth(img);
}
