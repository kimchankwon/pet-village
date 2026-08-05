/**
 * Player penguin facing — cardinals plus diagonals harvested from the dance GIF.
 *
 * `side` still covers pure east/west with `setFlipX`; the four diagonals are
 * distinct plates (no horizontal flip), so multiplayer can show SE vs SW without
 * a separate flip bit on the wire.
 */
export type MovementFacing = 'up' | 'down' | 'side' | 'ne' | 'nw' | 'se' | 'sw';

/** All facings the classic plate pipeline and Boot preload must provide. */
export const MOVEMENT_FACINGS = ['down', 'up', 'side', 'se', 'sw', 'ne', 'nw'] as const satisfies readonly MovementFacing[];

/**
 * Choose the penguin's facing from its movement vector (8-way).
 *
 * Screen space: +x right, +y down. Sectors are 45° cones centred on each
 * compass point (E / SE / S / SW / W / NW / N / NE). East and west both map
 * to `side`; the scene sets `flipX` from travel direction for those.
 */
export function movementFacing(
  vx: number,
  vy: number,
  current: MovementFacing,
): MovementFacing {
  if (vx === 0 && vy === 0) return current;
  // atan2(y, x): 0 = east, +π/2 = south, ±π = west, −π/2 = north.
  const deg = (Math.atan2(vy, vx) * 180) / Math.PI;
  // Shift so sector 0 is centred on east (−22.5° … +22.5°).
  const sector = Math.floor(((deg + 22.5 + 360) % 360) / 45) % 8;
  // 0 E, 1 SE, 2 S, 3 SW, 4 W, 5 NW, 6 N, 7 NE
  switch (sector) {
    case 1:
      return 'se';
    case 2:
      return 'down';
    case 3:
      return 'sw';
    case 4:
      return 'side';
    case 5:
      return 'nw';
    case 6:
      return 'up';
    case 7:
      return 'ne';
    default:
      return 'side';
  }
}

/** Phaser texture key for a local (or shared) penguin spritesheet. */
export function penguinTextureKey(facing: MovementFacing): string {
  return `penguin-${facing}`;
}

/** Phaser walk animation key for a facing. */
export function penguinWalkAnimKey(facing: MovementFacing): string {
  return `walk-${facing}`;
}

/**
 * Whether the sprite should be flipped for this facing + horizontal travel.
 * Only pure side uses flip; diagonal plates already face the correct way.
 */
export function penguinFlipX(facing: MovementFacing, vx: number): boolean {
  return facing === 'side' && vx < 0;
}

/**
 * Apply walk/idle presentation for the local player penguin.
 * When stopped on `side`, keeps the existing flip so left/right idle stays put.
 */
export function applyPenguinMotion(
  player: {
    setFlipX: (v: boolean) => unknown;
    play: (key: string, ignoreIfPlaying?: boolean) => unknown;
    stop: () => unknown;
    setTexture: (key: string, frame?: string | number) => unknown;
    flipX: boolean;
  },
  facing: MovementFacing,
  vx: number,
  moving: boolean,
) {
  if (moving) {
    player.setFlipX(penguinFlipX(facing, vx));
    player.play(penguinWalkAnimKey(facing), true);
    return;
  }
  player.stop();
  if (facing !== 'side') player.setFlipX(false);
  player.setTexture(penguinTextureKey(facing), 0);
}
