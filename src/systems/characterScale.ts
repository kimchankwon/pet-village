/**
 * Pure display-height → Phaser scale math (no Phaser import).
 * Shared by pet / miniteen helpers and unit tests.
 *
 * One reference height rules every character: the player penguin. Villagers
 * match it so they read as the player's peers, and pets draw at two thirds of
 * it so they read as small companions — in town and in every mini-game alike.
 */

/** Classic penguin body rows × pixel SCALE (20 × 3). The reference height. */
export const CHARACTER_PENGUIN_DISPLAY_HEIGHT = 60;

/** Every NPC — MINITEEN, Bongbongee, Cinnamoroll — stands penguin-tall. */
export const NPC_DISPLAY_HEIGHT = CHARACTER_PENGUIN_DISPLAY_HEIGHT;

/**
 * Pets draw at two thirds of the penguin's height — clearly the smaller of the
 * pair, but still big enough to read their face at a glance.
 */
export const PET_HEIGHT_RATIO = 2 / 3;

/** Shared on-screen height for every pet (two thirds of a penguin). */
export const PET_DISPLAY_HEIGHT = Math.round(
  CHARACTER_PENGUIN_DISPLAY_HEIGHT * PET_HEIGHT_RATIO,
);

/** Classic MINITEEN frame height before scale. */
export const MINITEEN_NATIVE_HEIGHT = 42;

/**
 * How the classic CP idle plate frames its penguin (220×214 cell, matching
 * the dance sheet). Measured from `down-0.png` after `sprite:penguin-classic`:
 * body rows ~24..211, feet near the bottom edge.
 */
export const IDLE_BODY_HEIGHT_RATIO = 188 / 214;
export const IDLE_FEET_BELOW_CENTRE_RATIO = (211.5 - 107) / 214;

/**
 * How the dance sheet frames its penguin, measured from the source GIF's
 * standing pose: the body fills only rows 25..155 of the 214-row cell.
 *
 * The dance bobs between two baselines and drops into a floor spin that reaches
 * the very bottom of the cell, so the empty space below the feet is deliberate
 * and per-frame normalisation would flatten the animation. These ratios pin the
 * *standing* pose instead, and stay correct if the sheet is re-exported at a
 * different resolution.
 *
 * They live here, next to the reference height and free of Phaser, so
 * `scripts/lib/penguin-dance-sheet.test.mjs` can check the exported sheet
 * against the very numbers the game draws with.
 */
export const DANCE_STAND_HEIGHT_RATIO = 131 / 214;
export const DANCE_STAND_FEET_RATIO = 155.5 / 214;
/** Rows above the standing pose's head — flail frames reach higher on purpose. */
export const DANCE_STAND_TOP_RATIO = 25 / 214;

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
