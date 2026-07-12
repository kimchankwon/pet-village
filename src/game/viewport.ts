/** Base design size (4:3). Wider/taller hosts expand one axis to match. */
export const BASE_WIDTH = 800;
export const BASE_HEIGHT = 600;

/**
 * Logical game size for a host box: same aspect as the host, anchored to the
 * 800×600 design so sprites stay a consistent size and pixels stay square.
 *
 * - Wider than 4:3 → height stays 600, width grows
 * - Taller than 4:3 → width stays 800, height grows
 */
export function designSizeForHost(
  hostW: number,
  hostH: number,
): { width: number; height: number } {
  const w = Math.max(1, Math.floor(hostW));
  const h = Math.max(1, Math.floor(hostH));
  const aspect = w / h;
  const baseAspect = BASE_WIDTH / BASE_HEIGHT;
  if (aspect >= baseAspect) {
    return { width: Math.round(BASE_HEIGHT * aspect), height: BASE_HEIGHT };
  }
  return { width: BASE_WIDTH, height: Math.round(BASE_WIDTH / aspect) };
}
