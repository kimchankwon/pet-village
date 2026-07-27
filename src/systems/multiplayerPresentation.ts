export function isVisibleRemotePlayer(
  sessionId: string,
  userId: string,
  ownSessionId: string,
  ownUserId: string | undefined,
) {
  return sessionId !== ownSessionId && (!ownUserId || userId !== ownUserId);
}
