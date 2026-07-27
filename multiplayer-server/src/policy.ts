import { isMovePayload, type MovePayload } from '@pet-village/multiplayer-protocol';

export const MAX_SPEED = 280;
export const MOVE_SLACK = 48;
export const MAX_MOVE_ELAPSED_SECONDS = 2;
export const MAX_PET_DISTANCE = 160;
export const SPAWN_RADIUS = 48;
export const TOWN_SPAWNS = [
  { x: 528, y: 508.8 },
  { x: 528, y: 266.4 },
  { x: 76.8, y: 432 },
  { x: 979.2, y: 432 },
  { x: 825.6, y: 283.2 },
  { x: 230.4, y: 283.2 },
  { x: 504, y: 662.4 },
] as const;
export const WAVE_RADIUS = 110;
export const WAVE_COOLDOWN_MS = 1_000;

export type PlayerVector = {
  x: number;
  y: number;
  lastSeq: number;
  lastMoveAt: number;
  lastWaveAt: number;
};

export function validateMove(current: PlayerVector, payload: unknown, now: number, allowSpawn = false) {
  if (!isMovePayload(payload) || payload.seq <= current.lastSeq) {
    return { ok: false as const, reason: 'invalid' };
  }

  const petDistance = Math.hypot(payload.petX - payload.x, payload.petY - payload.y);
  if (petDistance > MAX_PET_DISTANCE) return { ok: false as const, reason: 'pet-distance' };

  if (current.lastSeq === 0 || allowSpawn) {
    const atSpawn = TOWN_SPAWNS.some(
      (spawn) => Math.hypot(payload.x - spawn.x, payload.y - spawn.y) <= SPAWN_RADIUS,
    );
    if (!atSpawn) return { ok: false as const, reason: 'spawn' };
  } else {
    const elapsed = Math.min(
      Math.max(0, now - current.lastMoveAt) / 1000,
      MAX_MOVE_ELAPSED_SECONDS,
    );
    if (Math.hypot(payload.x - current.x, payload.y - current.y) > MAX_SPEED * elapsed + MOVE_SLACK) {
      return { ok: false as const, reason: 'speed' };
    }
  }

  return { ok: true as const, move: payload as MovePayload };
}

export function canWave(
  source: Pick<PlayerVector, 'x' | 'y' | 'lastWaveAt'>,
  target: Pick<PlayerVector, 'x' | 'y'>,
  now: number,
) {
  return (
    now - source.lastWaveAt >= WAVE_COOLDOWN_MS &&
    Math.hypot(source.x - target.x, source.y - target.y) <= WAVE_RADIUS
  );
}
