/**
 * Pure display-height → Phaser scale math (no Phaser import).
 * Shared by pet / miniteen helpers and unit tests.
 */

/** Classic 32px pet art × 1.5 — shared on-screen height for every pet. */
export const PET_DISPLAY_HEIGHT = 48;

/** Classic penguin body rows × pixel SCALE (20 × 3). */
export const CHARACTER_PENGUIN_DISPLAY_HEIGHT = 60;

/** Classic MINITEEN frame height before scale. */
export const MINITEEN_NATIVE_HEIGHT = 42;

/**
 * Phaser scale so a texture of height `textureH` draws at `displayH` world px.
 * Falls back to `fallbackNative` when the texture is missing/empty.
 */
export function scaleToDisplayHeight(
  textureH: number,
  displayH: number,
  fallbackNative: number,
): number {
  if (!(textureH > 0)) return displayH / fallbackNative;
  return displayH / textureH;
}

/**
 * Bongbongee scale: classic 32×classicScale when small; plate frames
 * lock the same on-screen height as classic.
 */
export function bongTextureScale(textureH: number, classicScale: number): number {
  if (!(textureH > 0) || textureH <= 64) return classicScale;
  return (32 * classicScale) / textureH;
}
