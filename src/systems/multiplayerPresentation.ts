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
