import Phaser from 'phaser';
import type { MovementBounds } from './movementBounds';

/** Above every world object; UI is rendered by the separate UI camera. */
const BEZEL_DEPTH = 1_000_000;

/**
 * Paint the area outside a map over world actors. This turns the camera's
 * letterbox into a real visual wall: residents walk under it as they leave
 * instead of standing on top of the black border.
 */
export function addWorldBezel(
  scene: Phaser.Scene,
  bounds: MovementBounds,
  color = 0x1a1626,
): void {
  // Cover the largest possible zoomed-out viewport without sending enormous
  // shape vertices through WebGL (very large rectangles can rasterise badly).
  const pad = Math.max(scene.scale.width, scene.scale.height) / 0.9 + 64;
  const cx = bounds.x + bounds.width / 2;
  const cy = bounds.y + bounds.height / 2;
  const add = (x: number, y: number, width: number, height: number) => {
    scene.add.rectangle(x, y, width, height, color, 1).setDepth(BEZEL_DEPTH);
  };

  add(bounds.x - pad / 2, cy, pad, bounds.height);
  add(bounds.x + bounds.width + pad / 2, cy, pad, bounds.height);
  add(cx, bounds.y - pad / 2, bounds.width + pad * 2, pad);
  add(cx, bounds.y + bounds.height + pad / 2, bounds.width + pad * 2, pad);
}
