/** Shared town map metrics — import these instead of re-declaring per file. */
export const TILE = 48;
/** Expanded ice-town hub (Club Penguin square + Dream Land whimsy). */
export const TOWN_MAP_W = 32;
export const TOWN_MAP_H = 22;
export const TOWN_WORLD_W = TOWN_MAP_W * TILE;
export const TOWN_WORLD_H = TOWN_MAP_H * TILE;

/**
 * On-screen heights for outdoor Imagine plates.
 * Keep buildings readable but props near classic grid proportions so benches,
 * barrels, and lamps don't tower over penguins (~60px tall).
 */
export const BUILDING_DISPLAY_H = 200;
export const FOUNTAIN_DISPLAY_H = 110;
export const TREE_DISPLAY_H = 100;
/** Bench, barrel, crate, rock, bush — slightly larger than classic ~40px. */
export const PROP_DISPLAY_H = 52;
export const LAMP_DISPLAY_H = 80;
export const SIGN_DISPLAY_H = 52;

/** Scale an image so its texture height draws at `displayH` world px. */
export function scalePropToHeight(
  img: { height: number; setScale: (s: number) => unknown },
  displayH: number,
): number {
  const h = img.height > 0 ? img.height : displayH;
  const s = displayH / h;
  img.setScale(s);
  return s;
}
