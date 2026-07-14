import type Phaser from 'phaser';

export type Highlightable = Phaser.GameObjects.Image | Phaser.GameObjects.Sprite;

/**
 * Cheap proximity feedback for interactables.
 *
 * Phaser's glow post-FX renders an extra full-screen pipeline per target and
 * caused a sharp frame-time spike precisely when an object entered range.
 * A warm tint keeps the affordance without the GPU-heavy post-processing pass.
 */
export function updateInteractionHighlight(
  current: Highlightable[],
  targets?: Highlightable[],
): Highlightable[] {
  const next = targets ?? [];
  if (next.length === current.length && next.every((target, i) => target === current[i])) {
    return current;
  }
  for (const target of current) target.clearTint();
  for (const target of next) target.setTint(0xfff0a8);
  return next;
}
