import { TILE } from './townMap';

/** Coastal shore — larger than town, scrollable, ocean along the south edge. */
export const SHORE_MAP_W = 28;
export const SHORE_MAP_H = 24;
export const SHORE_WORLD_W = SHORE_MAP_W * TILE;
export const SHORE_WORLD_H = SHORE_MAP_H * TILE;

/** First ocean tile row (inclusive). Sand sits just above. */
export const SHORE_OCEAN_ROW = 16;
/** Dock / fishing-spot anchor in tile coords. */
export const SHORE_DOCK = { tx: 14, ty: 15.15 };
