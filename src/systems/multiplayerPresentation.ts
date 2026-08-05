import type Phaser from 'phaser';
import type { Facing, GameActivity } from '@pet-village/multiplayer-protocol';

export function isVisibleRemotePlayer(
  sessionId: string,
  userId: string,
  ownSessionId: string,
  ownUserId: string | undefined,
) {
  return sessionId !== ownSessionId && (!ownUserId || userId !== ownUserId);
}

/** Any fresh wave — bystanders see the animation, not just the person waved at. */
export function isNewWave(previousWaveId: string | undefined, nextWaveId: string | undefined) {
  return Boolean(nextWaveId && nextWaveId !== previousWaveId);
}

/** Only the player being waved at gets the toast. */
export function isNewWaveForLocalPlayer(
  previousWaveId: string | undefined,
  nextWaveId: string | undefined,
  waveTarget: string | undefined,
  localSessionId: string,
) {
  return isNewWave(previousWaveId, nextWaveId) && waveTarget === localSessionId;
}

const PENGUIN_COLOR_IDS = new Set([
  'blue', 'green', 'pink', 'black', 'red', 'purple',
  'orange', 'darkpurple', 'brown', 'peach', 'darkgreen', 'lightblue',
]);

export function normalizePenguinColor(color: string) {
  return PENGUIN_COLOR_IDS.has(color) ? color : 'blue';
}

export function remotePenguinTextureKey(facing: Facing, color: string) {
  return `penguin-remote-${normalizePenguinColor(color)}-${facing}`;
}

export function remotePenguinWalkAnimKey(facing: Facing, color: string) {
  return `penguin-remote-${normalizePenguinColor(color)}-walk-${facing}`;
}

export function remotePenguinWaveTextureKey(color: string) {
  return `penguin-remote-${normalizePenguinColor(color)}-wave`;
}

export function remotePenguinDanceTextureKey(color: string) {
  return `penguin-remote-${normalizePenguinColor(color)}-dance`;
}

export const LOCAL_PENGUIN_WAVE_TEXTURE_KEY = 'penguin-wave';
export const LOCAL_PENGUIN_DANCE_TEXTURE_KEY = 'penguin-dance';

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
  facing: Facing,
  reportedMoving: boolean,
  previousFlipX: boolean,
) {
  const dx = to.x - from.x;
  const distance = Math.hypot(dx, to.y - from.y);
  return {
    facing,
    walking: reportedMoving && distance > 0.75,
    // Diagonals own their heading in the plate; only pure side flips.
    flipX:
      facing === 'side'
        ? Math.abs(dx) > 0.75
          ? dx < 0
          : previousFlipX
        : false,
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

/**
 * Classic Club Penguin wave GIF (Tenor, 16 unique frames).
 * Source delays are 70–80 ms; 75 ms keeps a steady one-shot (~1.2 s).
 * Must match WAVE_FRAME_* in scripts/penguin-wave-plates.mts.
 */
export const WAVE_FRAME_MS = 75;
export const WAVE_FRAME_COUNT = 16;

/**
 * Classic Club Penguin dance GIF (Tenor, 76 unique frames).
 * Source delays are 100 ms per frame (first is 200 ms; we use 100 for a steady loop).
 */
export const DANCE_FRAME_MS = 100;
export const DANCE_FRAME_COUNT = 76;

export function canInitiateWave(
  local: { x: number; y: number },
  remote: { x: number; y: number },
  active: boolean,
  radius: number,
) {
  return active && Math.hypot(remote.x - local.x, remote.y - local.y) <= radius;
}

/** Stop this far inside the wave radius, so a step of drift doesn't undo the walk. */
const WAVE_APPROACH_MARGIN = 0.6;

/** Where to walk to when the player clicks someone too far away to wave at. */
export function approachPointForWave(local: Point, remote: Point, radius: number): Point {
  const dx = remote.x - local.x;
  const dy = remote.y - local.y;
  const distance = Math.hypot(dx, dy);
  const stopShort = radius * WAVE_APPROACH_MARGIN;
  if (distance <= stopShort || distance === 0) return { x: local.x, y: local.y };
  const travel = distance - stopShort;
  return {
    x: local.x + (dx / distance) * travel,
    y: local.y + (dy / distance) * travel,
  };
}

export type PendingWaveDecision = 'wave' | 'retarget' | 'walking' | 'cancel';

/** How long to chase someone before giving up on the queued wave. */
export const WAVE_APPROACH_TIMEOUT_MS = 12_000;

/** How far the target must have drifted to be worth walking another leg. */
export const WAVE_RETARGET_MIN_MOVE_PX = 24;

/**
 * What to do with a queued wave on this frame: the target may have walked off,
 * left the scene, started a minigame, or simply not be reached yet.
 *
 * `targetMovedPx` is how far the target has drifted since the last leg was
 * aimed. Once the walk has ended without arriving, that number is the only way
 * to tell "they wandered off, chase them" from "the walk was cancelled" — a
 * blocking collider, or the player taking the controls back with WASD, both of
 * which should drop the queued wave rather than re-aim it every frame.
 */
export function pendingWaveDecision(input: {
  present: boolean;
  active: boolean;
  distance: number;
  radius: number;
  walking: boolean;
  elapsedMs: number;
  targetMovedPx: number;
  timeoutMs?: number;
}): PendingWaveDecision {
  if (!input.present || !input.active) return 'cancel';
  if (input.distance <= input.radius) return 'wave';
  if (input.elapsedMs >= (input.timeoutMs ?? WAVE_APPROACH_TIMEOUT_MS)) return 'cancel';
  if (input.walking) return 'walking';
  return input.targetMovedPx >= WAVE_RETARGET_MIN_MOVE_PX ? 'retarget' : 'cancel';
}

/** Returns the Tenor wave frame index, or null once the one-shot is complete. */
export function waveAnimationFrame(elapsedMs: number): number | null {
  if (elapsedMs < 0) return 0;
  const index = Math.floor(elapsedMs / WAVE_FRAME_MS);
  if (index < 0 || index >= WAVE_FRAME_COUNT) return null;
  return index;
}

/**
 * Looping dance frame index (0..75). Always defined while dancing — the caller
 * decides when to stop (move, press N again, open a menu).
 */
export function danceAnimationFrame(elapsedMs: number): number {
  if (elapsedMs < 0) return 0;
  return Math.floor(elapsedMs / DANCE_FRAME_MS) % DANCE_FRAME_COUNT;
}

/**
 * Which idle pose to restore when the dance stops. Dance cells are all
 * front-facing and unflipped, so an up/side dancer needs the pose they held
 * when they started. A walk-cancel passes the live facing instead, and the
 * scene sets flipX from travel direction on the same frame.
 */
export function danceExitPose(
  movementFacing: Facing | undefined,
  startPose: { facing: Facing; flipX: boolean } | null,
): { facing: Facing; flipX: boolean | null } {
  if (movementFacing) return { facing: movementFacing, flipX: null };
  if (startPose) return { facing: startPose.facing, flipX: startPose.flipX };
  return { facing: 'down', flipX: null };
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
  expedition: 'Expedition',
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

/**
 * Rows a world scene should render: same scene, and either actively roaming or
 * parked in a minigame (those stay visible, dimmed, so the world isn't empty).
 */
export function visibleSceneRows<T extends {
  sceneId: string;
  active: boolean;
  activity: GameActivity | '';
}>(rows: readonly T[], sceneId: string) {
  return rows.filter((row) => row.sceneId === sceneId && (row.active || Boolean(row.activity)));
}

/** What a server position correction means for the scene that consumed it. */
export function positionCorrectionAction(
  correction: { sceneId: string } | null | undefined,
  sceneId: string,
): 'ignore' | 'switch-scene' | 'snap' {
  if (!correction) return 'ignore';
  return correction.sceneId === sceneId ? 'snap' : 'switch-scene';
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
