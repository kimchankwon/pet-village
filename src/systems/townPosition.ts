import { TOWN_WORLD_H, TOWN_WORLD_W } from './townMap';

export type TownFacing = 'up' | 'down' | 'side';

export interface TownPosition {
  x: number;
  y: number;
  facing: TownFacing;
}

export function normalizeTownPosition(raw: unknown): TownPosition | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const value = raw as Partial<TownPosition>;
  if (!Number.isFinite(value.x) || !Number.isFinite(value.y)) return undefined;
  if ((value.x ?? -1) < 0 || (value.x ?? Infinity) > TOWN_WORLD_W) return undefined;
  if ((value.y ?? -1) < 0 || (value.y ?? Infinity) > TOWN_WORLD_H) return undefined;
  if (value.facing !== 'up' && value.facing !== 'down' && value.facing !== 'side') return undefined;
  return { x: value.x!, y: value.y!, facing: value.facing };
}

export function initialTownPosition(raw: unknown, hasExplicitEntrance: boolean): TownPosition | undefined {
  return hasExplicitEntrance ? undefined : normalizeTownPosition(raw);
}
