/**
 * Pure display-height → Phaser scale math (no Phaser import).
 * Shared by pet / miniteen helpers and unit tests.
 *
 * One reference height rules every character: the player penguin. Villagers
 * match it so they read as the player's peers, and pets draw at half of it so
 * they read as small companions — in town and in every mini-game alike.
 */

/** Classic penguin body rows × pixel SCALE (20 × 3). The reference height. */
export const CHARACTER_PENGUIN_DISPLAY_HEIGHT = 60;

/** Every NPC — MINITEEN, Bongbongee, Cinnamoroll — stands penguin-tall. */
export const NPC_DISPLAY_HEIGHT = CHARACTER_PENGUIN_DISPLAY_HEIGHT;

/** Pets draw at half the penguin's height. */
export const PET_HEIGHT_RATIO = 0.5;

/** Shared on-screen height for every pet (half a penguin). */
export const PET_DISPLAY_HEIGHT = CHARACTER_PENGUIN_DISPLAY_HEIGHT * PET_HEIGHT_RATIO;

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
