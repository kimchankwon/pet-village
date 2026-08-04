import { isPortraitDesign } from '../game/viewport';

/**
 * Tight layout when the canvas is portrait, touch-first, or just too narrow.
 * Kept free of Phaser so unit tests can import it without a browser `window`.
 */
export function isBottomButtonsCompact(input: {
  touch: boolean;
  width: number;
  height: number;
}): boolean {
  if (input.touch) return true;
  if (isPortraitDesign(input.width, input.height)) return true;
  return input.width < 720;
}
