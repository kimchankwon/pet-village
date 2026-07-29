import { TILE, TOWN_WORLD_H, TOWN_WORLD_W } from './townMap';

export type TownFacing = 'up' | 'down' | 'side';

export interface TownPosition {
  x: number;
  y: number;
  facing: TownFacing;
}

export function isSafeTownPosition(x: number, y: number): boolean {
  // South ice path → Shore (center of map).
  const leavesForShore = y > TOWN_WORLD_H - 52 && x > 14.5 * TILE && x < 17.5 * TILE;
  // East/west ice paths → game parks (path rows ~10–11).
  const onParkGate = y > 9.5 * TILE && y < 12 * TILE && (x < 36 || x > TOWN_WORLD_W - 36);
  return x >= 0 && x <= TOWN_WORLD_W && y >= 0 && y <= TOWN_WORLD_H && !leavesForShore && !onParkGate;
}

export function normalizeTownPosition(raw: unknown): TownPosition | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const value = raw as Partial<TownPosition>;
  if (!Number.isFinite(value.x) || !Number.isFinite(value.y)) return undefined;
  if (!isSafeTownPosition(value.x!, value.y!)) return undefined;
  if (value.facing !== 'up' && value.facing !== 'down' && value.facing !== 'side') return undefined;
  return { x: value.x!, y: value.y!, facing: value.facing };
}

export function initialTownPosition(
  raw: unknown,
  hasExplicitEntrance: boolean,
  restoreSavedPosition: boolean,
): TownPosition | undefined {
  return hasExplicitEntrance || !restoreSavedPosition ? undefined : normalizeTownPosition(raw);
}
