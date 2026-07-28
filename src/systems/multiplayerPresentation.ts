import type Phaser from 'phaser';
import type { GameActivity } from '@pet-village/multiplayer-protocol';

export function isVisibleRemotePlayer(
  sessionId: string,
  userId: string,
  ownSessionId: string,
  ownUserId: string | undefined,
) {
  return sessionId !== ownSessionId && (!ownUserId || userId !== ownUserId);
}

export function isNewWaveForLocalPlayer(
  previousWaveId: string | undefined,
  nextWaveId: string | undefined,
  waveTarget: string | undefined,
  localSessionId: string,
) {
  return Boolean(nextWaveId && nextWaveId !== previousWaveId && waveTarget === localSessionId);
}

const PENGUIN_COLOR_IDS = new Set([
  'blue', 'green', 'pink', 'black', 'red', 'purple',
  'orange', 'darkpurple', 'brown', 'peach', 'darkgreen', 'lightblue',
]);

export function normalizePenguinColor(color: string) {
  return PENGUIN_COLOR_IDS.has(color) ? color : 'blue';
}

export function remotePenguinTextureKey(facing: 'down' | 'up' | 'side', color: string) {
  return `penguin-remote-${normalizePenguinColor(color)}-${facing}`;
}

export function remotePenguinWalkAnimKey(facing: 'down' | 'up' | 'side', color: string) {
  return `penguin-remote-${normalizePenguinColor(color)}-walk-${facing}`;
}

export function remotePenguinWaveTextureKey(color: string) {
  return `penguin-remote-${normalizePenguinColor(color)}-wave`;
}

export const LOCAL_PENGUIN_WAVE_TEXTURE_KEY = 'penguin-wave';

type Point = { x: number; y: number };

const REMOTE_SNAP_DISTANCE = 180;
const REMOTE_INTERPOLATION_RATE = 12;

/** Exponential interpolation is stable across different render frame rates. */
export function stepRemotePosition(from: Point, to: Point, deltaMs: number): Point {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  if (distance >= REMOTE_SNAP_DISTANCE) return { x: to.x, y: to.y };
  const deltaSeconds = Math.max(0, Math.min(deltaMs, 250)) / 1000;
  const alpha = 1 - Math.exp(-REMOTE_INTERPOLATION_RATE * deltaSeconds);
  return {
    x: from.x + (to.x - from.x) * alpha,
    y: from.y + (to.y - from.y) * alpha,
  };
}

export function remoteMovementDecision(
  from: Point,
  to: Point,
  facing: 'down' | 'up' | 'side',
  reportedMoving: boolean,
  previousFlipX: boolean,
) {
  const dx = to.x - from.x;
  const distance = Math.hypot(dx, to.y - from.y);
  return {
    facing,
    walking: reportedMoving && distance > 0.75,
    flipX: facing === 'side' && Math.abs(dx) > 0.75 ? dx < 0 : previousFlipX,
  };
}

export function remotePetMovementDecision(from: Point, to: Point, previousFlipX: boolean) {
  const dx = to.x - from.x;
  const distance = Math.hypot(dx, to.y - from.y);
  return {
    walking: distance > 0.75,
    flipX: Math.abs(dx) > 0.75 ? dx < 0 : previousFlipX,
  };
}

const WAVE_FRAME_MS = 130;
const WAVE_FRAME_SEQUENCE = [0, 1, 2, 3, 2, 1] as const;

export function canInitiateWave(
  local: { x: number; y: number },
  remote: { x: number; y: number },
  active: boolean,
  radius: number,
) {
  return active && Math.hypot(remote.x - local.x, remote.y - local.y) <= radius;
}

/** Returns the authored wave frame, or null once the one-shot is complete. */
export function waveAnimationFrame(elapsedMs: number): number | null {
  if (elapsedMs < 0) return WAVE_FRAME_SEQUENCE[0];
  const index = Math.floor(elapsedMs / WAVE_FRAME_MS);
  return WAVE_FRAME_SEQUENCE[index] ?? null;
}

export function handleRemotePlayerPointerDown(
  event: Pick<Phaser.Types.Input.EventData, 'stopPropagation'>,
  cancelMovement: () => void,
  wave: () => void,
) {
  event.stopPropagation();
  cancelMovement();
  wave();
}

const GAME_ACTIVITY_LABELS: Record<GameActivity, string> = {
  fishing: 'Fishing',
  get: 'Get',
  bump: 'Bump',
  'skip-rope': 'Skip Rope',
  'paper-toss': 'Paper Toss',
  'sled-run': 'Sled Run',
};

export function isRemotePlayerInteractable(player: {
  active: boolean;
  activity: GameActivity | '';
}) {
  return player.active && !player.activity;
}

export function remotePlayerPresentation(player: {
  name: string;
  petName: string;
  activity: GameActivity | '';
}) {
  const inGame = Boolean(player.activity);
  return {
    playerLabel: inGame ? `${player.name} · Playing ${GAME_ACTIVITY_LABELS[player.activity as GameActivity]}` : player.name,
    petLabel: player.petName,
    alpha: inGame ? 0.6 : 1,
    interactive: !inGame,
    labelColor: inGame ? '#ffe26f' : '#ffffff',
  };
}

export function dedupeRemotePlayers<T extends {
  userId: string;
  sessionId: string;
  active: boolean;
  updatedAt: number;
}>(rows: T[]) {
  const selected = new Map<string, T>();
  for (const row of rows) {
    const current = selected.get(row.userId);
    if (
      !current ||
      (row.active && !current.active) ||
      (row.active === current.active && row.updatedAt > current.updatedAt) ||
      (row.active === current.active && row.updatedAt === current.updatedAt && row.sessionId.localeCompare(current.sessionId) < 0)
    ) {
      selected.set(row.userId, row);
    }
  }
  return [...selected.values()];
}
