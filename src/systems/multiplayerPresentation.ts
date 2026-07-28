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
    label: inGame ? `${player.name} · Playing ${GAME_ACTIVITY_LABELS[player.activity as GameActivity]}` : `${player.name} · ${player.petName}`,
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
