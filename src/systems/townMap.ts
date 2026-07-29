/** Shared town map metrics — import these instead of re-declaring per file. */
export const TILE = 48;
/** Expanded ice-town hub (Club Penguin square + Dream Land whimsy). */
export const TOWN_MAP_W = 32;
export const TOWN_MAP_H = 22;
export const TOWN_WORLD_W = TOWN_MAP_W * TILE;
export const TOWN_WORLD_H = TOWN_MAP_H * TILE;

/** Target on-screen height for Imagine building sprites (much larger than the old 24×16 grids). */
export const BUILDING_DISPLAY_H = 300;
/** Ice fountain landmark height. */
export const FOUNTAIN_DISPLAY_H = 200;
/** Snowy evergreen display height. */
export const TREE_DISPLAY_H = 170;
/** Small outdoor props (bench, barrel, lamp, …). */
export const PROP_DISPLAY_H = 110;
/** Streetlamp is tall — use a taller target. */
export const LAMP_DISPLAY_H = 150;
/** Signpost height. */
export const SIGN_DISPLAY_H = 100;

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
