import { TILE } from './townMap';

/**
 * Shared metrics for the two game-park maps flanking town:
 * West Green (Skip Rope + Bump + Sled Run) and East Green (Paper Toss + Get).
 */
export const PARK_MAP_W = 24;
export const PARK_MAP_H = 16;
export const PARK_WORLD_W = PARK_MAP_W * TILE;
export const PARK_WORLD_H = PARK_MAP_H * TILE;

/** Horizontal connecting path rows (tile Y) between town and each park. */
export const PARK_PATH_TY = [7, 8] as const;

/** Game booth / attraction height — large but not full-screen. */
export const BOOTH_DISPLAY_H = 150;
