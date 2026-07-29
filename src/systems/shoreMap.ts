import { TILE } from './townMap';

/** Expanded coastal shore — scrollable, icy ocean along the south edge. */
export const SHORE_MAP_W = 24;
export const SHORE_MAP_H = 16;
export const SHORE_WORLD_W = SHORE_MAP_W * TILE;
export const SHORE_WORLD_H = SHORE_MAP_H * TILE;

/** First ocean tile row (inclusive). Icy sand sits just above. */
export const SHORE_OCEAN_ROW = 11;
/** Dock / fishing-spot anchor in tile coords. */
export const SHORE_DOCK = { tx: 12, ty: 10 };
/** Dock display height for the Imagine pier sprite. */
export const DOCK_DISPLAY_H = 150;
