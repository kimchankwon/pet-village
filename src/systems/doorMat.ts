/** Shared door-mat helpers for interior scenes. */
import type Phaser from 'phaser';

const TILE = 48;

/**
 * Two-tile-wide pink/brown door mat at the bottom of a room.
 * Returns the center of the mat (spawn / exit interact point) and both grid xs.
 */
export function placeDoorMat(
  scene: Phaser.Scene,
  roomX: number,
  roomY: number,
  cols: number,
  rows: number,
  tint: number,
): { centerX: number; centerY: number; doorGxs: [number, number] } {
  const leftGx = Math.floor(cols / 2) - 1;
  const rightGx = leftGx + 1;
  const y = roomY + (rows - 1) * TILE + TILE / 2;
  for (const gx of [leftGx, rightGx]) {
    scene.add
      .image(roomX + gx * TILE + TILE / 2, y, 'item-rug')
      .setDepth(-99)
      .setTint(tint)
      .setScale(1.3);
  }
  return {
    centerX: roomX + ((leftGx + rightGx) / 2) * TILE + TILE / 2,
    centerY: y,
    doorGxs: [leftGx, rightGx],
  };
}

/** True when the furniture grid cell is part of the doorway mat. */
export function isDoorMatCell(gx: number, doorGxs: [number, number], gy: number, rows: number) {
  return gy === rows - 1 && (gx === doorGxs[0] || gx === doorGxs[1]);
}
