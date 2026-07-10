// Y-sort depth from the sprite's feet (bottom), matching trees/buildings.
// Using the center (obj.y) makes you draw behind objects you're standing in front of.
export function feetDepth(obj: { y: number; displayHeight: number; originY: number }): number {
  return obj.y + obj.displayHeight * (1 - obj.originY);
}
