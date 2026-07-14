import { TILE } from './townMap';

/**
 * Shared metrics for the two game-park maps flanking town:
 * West Green (Skip Rope + Bump) and East Green (Paper Toss).
 */
export const PARK_MAP_W = 16;
export const PARK_MAP_H = 12;
export const PARK_WORLD_W = PARK_MAP_W * TILE;
export const PARK_WORLD_H = PARK_MAP_H * TILE;

/** Horizontal connecting path rows (tile Y) between town and each park. */
export const PARK_PATH_TY = [5, 6] as const;
