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

export function dedupeRemotePlayers<T extends { userId: string; sessionId: string; updatedAt: number }>(rows: T[]) {
  const selected = new Map<string, T>();
  for (const row of rows) {
    const current = selected.get(row.userId);
    if (
      !current ||
      row.updatedAt > current.updatedAt ||
      (row.updatedAt === current.updatedAt && row.sessionId.localeCompare(current.sessionId) < 0)
    ) {
      selected.set(row.userId, row);
    }
  }
  return [...selected.values()];
}
