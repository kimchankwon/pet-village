import { TILE } from './townMap';

/** Compact coastal shore — scrollable, ocean along the south edge. */
export const SHORE_MAP_W = 18;
export const SHORE_MAP_H = 12;
export const SHORE_WORLD_W = SHORE_MAP_W * TILE;
export const SHORE_WORLD_H = SHORE_MAP_H * TILE;

/** First ocean tile row (inclusive). Sand sits just above. */
export const SHORE_OCEAN_ROW = 8;
/** Dock / fishing-spot anchor in tile coords. */
export const SHORE_DOCK = { tx: 9, ty: 7.15 };
