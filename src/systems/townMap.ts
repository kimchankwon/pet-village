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

/**
 * Ground tile cells must fill the TILE square exactly. Speckled 48px plates
 * already match, but forcing display size prevents any filter/scale drift and
 * stops snow from leaving gaps or double-covering under props.
 */
export function placeGroundTile(
  scene: {
    add: {
      image: (
        x: number,
        y: number,
        key: string,
      ) => {
        setDisplaySize: (w: number, h: number) => unknown;
        setDepth: (d: number) => unknown;
      };
    };
  },
  tx: number,
  ty: number,
  key: string,
  depth = -100,
): {
  setDisplaySize: (w: number, h: number) => unknown;
  setDepth: (d: number) => unknown;
} {
  const img = scene.add.image(tx * TILE + TILE / 2, ty * TILE + TILE / 2, key);
  img.setDisplaySize(TILE, TILE);
  img.setDepth(depth);
  return img;
}

/**
 * Outdoor props sit on the snow with origin at their feet (bottom-center).
 * Center-origin Imagine plates were sinking halfway into the ground tiles,
 * so baked snow on the art double-stacked with the map snow.
 */
export function plantOutdoorProp(
  img: {
    setOrigin: (x: number, y: number) => unknown;
    setPosition: (x: number, y: number) => unknown;
    setDepth: (d: number) => unknown;
    height: number;
    setScale: (s: number) => unknown;
    y: number;
    displayHeight: number;
    originY: number;
  },
  x: number,
  footY: number,
  displayH: number,
) {
  img.setOrigin(0.5, 1);
  img.setPosition(x, footY);
  scalePropToHeight(img, displayH);
  // Feet are exactly at footY with originY=1.
  img.setDepth(footY);
}
