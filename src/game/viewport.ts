/** Base design size (4:3). Wider/taller hosts expand one axis to match. */
export const BASE_WIDTH = 800;
export const BASE_HEIGHT = 600;

/** Portrait hosts use a narrower design so FIT scales up (more zoomed in).
 *  Must stay ≥ house/shop room width (12×48 = 576). */
const PORTRAIT_WIDTH = 640;

/**
 * Logical game size for a host box: same aspect as the host, anchored to the
 * 800×600 design so sprites stay a consistent size and pixels stay square.
 *
 * - Wider than 4:3 → height stays 600, width grows
 * - Taller than 4:3 (incl. 9:16) → narrower base width so the view zooms in,
 *   height grows to match aspect
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
  // 9:16 / tall phones: 640-wide design → ~25% closer than 800-wide.
  return { width: PORTRAIT_WIDTH, height: Math.round(PORTRAIT_WIDTH / aspect) };
}

/** True when the logical canvas is taller than ~4:3 (phones in portrait). */
export function isPortraitDesign(width: number, height: number): boolean {
  return height / width > BASE_HEIGHT / BASE_WIDTH + 0.05;
}

/**
 * On-screen joystick anchor in camera pixels.
 * Portrait (9:16): higher and further right so it clears the thumb reach zone.
 */
export function joystickAnchor(
  camW: number,
  camH: number,
  radius: number,
): { cx: number; cy: number } {
  if (isPortraitDesign(camW, camH)) {
    const padLeft = 96;
    const padBottom = 120;
    return { cx: padLeft + radius, cy: camH - padBottom - radius };
  }
  const pad = 22;
  return { cx: pad + radius, cy: camH - pad - radius };
}
