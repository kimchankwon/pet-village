import {
  CHAT_COOLDOWN_MS,
  normalizeMovePayload,
  WAVE_RADIUS,
  WORLD_SCENE_SPAWNS,
  type MovePayload,
  type WorldScene,
} from '@pet-village/multiplayer-protocol';

export const MAX_SPEED = 280;
export const MOVE_SLACK = 48;
export const MAX_MOVE_ELAPSED_SECONDS = 2;
export const MAX_PET_DISTANCE = 160;
export const SPAWN_RADIUS = 48;
export const TOWN_SPAWNS = WORLD_SCENE_SPAWNS.town;
export const WAVE_COOLDOWN_MS = 1_000;

export function canTransitionWorldScene(from: WorldScene, to: WorldScene) {
  if (from === to) return true;
  return from === 'town' || to === 'town';
}

export type PlayerVector = {
  x: number;
  y: number;
  scene?: WorldScene;
  lastSeq: number;
  lastMoveAt: number;
  lastWaveAt: number;
};

export function isApprovedWorldSpawn(scene: WorldScene, x: number, y: number) {
  return WORLD_SCENE_SPAWNS[scene].some(
    (spawn) => Math.hypot(x - spawn.x, y - spawn.y) <= SPAWN_RADIUS,
  );
}

export function validateMove(
  current: PlayerVector,
  payload: unknown,
  now: number,
  allowSpawn: boolean | WorldScene = false,
) {
  const move = normalizeMovePayload(payload, current.scene ?? 'town');
  if (!move || move.seq <= current.lastSeq) {
    return { ok: false as const, reason: 'invalid' };
  }

  const petDx = move.petX - move.x;
  const petDy = move.petY - move.y;
  const petDistance = Math.hypot(petDx, petDy);

  if (allowSpawn) {
    if (typeof allowSpawn === 'string' && move.scene !== allowSpawn) {
      return { ok: false as const, reason: 'scene' };
    }
    if (!isApprovedWorldSpawn(move.scene, move.x, move.y)) {
      return { ok: false as const, reason: 'spawn' };
    }
  } else if (move.scene !== (current.scene ?? 'town')) {
    return { ok: false as const, reason: 'scene' };
  } else if (current.lastSeq === 0) {
    // Multiplayer may finish connecting after the local player has already
    // walked away from the scene entrance. Scene bounds still constrain this
    // initial position; speed checks apply to every later move.
  } else {
    const elapsed = Math.min(
      Math.max(0, now - current.lastMoveAt) / 1000,
      MAX_MOVE_ELAPSED_SECONDS,
    );
    if (Math.hypot(move.x - current.x, move.y - current.y) > MAX_SPEED * elapsed + MOVE_SLACK) {
      return { ok: false as const, reason: 'speed' };
    }
  }

  const accepted: MovePayload = { ...move };
  if (petDistance > MAX_PET_DISTANCE) {
    const scale = MAX_PET_DISTANCE / petDistance;
    accepted.petX = move.x + petDx * scale;
    accepted.petY = move.y + petDy * scale;
  }

  return { ok: true as const, move: accepted };
}

/** One message at a time: chat is a speech bubble, not a firehose. */
export function canChat(source: { lastChatAt: number }, now: number) {
  return now - source.lastChatAt >= CHAT_COOLDOWN_MS;
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
