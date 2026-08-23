import type { SledDifficulty, SledEffect, SledPhase } from '@pet-village/multiplayer-protocol';
import { convexWorld } from './convexWorld';

export type SledRacerSnapshot = {
  sessionId: string;
  userId: string;
  displayName: string;
  penguinColor: string;
  x: number;
  progress: number;
  speed: number;
  steering: number;
  inputSeq: number;
  effect: SledEffect;
  effectUntil: number;
  rank: number;
  finishedAt: number;
};

export type SledRunSnapshot = {
  localSessionId: string;
  phase: SledPhase;
  leader: string;
  difficulty: SledDifficulty;
  seed: string;
  countdownAt: number;
  startedAt: number;
  serverTime: number;
  round: number;
  racers: SledRacerSnapshot[];
};

export type SledServerSnapshot = Omit<SledRunSnapshot, 'localSessionId'>;

export type SledConnectionState = 'connected' | 'reconnecting' | 'closed';

export type SledRunConnection = {
  sessionId: string;
  onState: (listener: (snapshot: SledRunSnapshot) => void) => () => void;
  onConnectionState: (listener: (state: SledConnectionState) => void) => () => void;
  setDifficulty: (difficulty: SledDifficulty) => void;
  start: () => void;
  sendSteer: (steering: -1 | 0 | 1) => number;
  sendHit: (itemId: string) => void;
  onHitRejected: (listener: (itemId: string) => void) => () => void;
  disconnect: () => Promise<void>;
};

const SLED_PENDING_HIT_LIMIT = 48;
const serverListeners = new Set<(snapshot: SledServerSnapshot | null) => void>();
let serverSnapshot: SledServerSnapshot | null = null;

export function setSledServerSnapshot(snapshot: SledServerSnapshot | null) {
  serverSnapshot = snapshot;
  serverListeners.forEach((listener) => listener(snapshot));
}

export function snapshotSledRun(state: SledServerSnapshot, localSessionId: string): SledRunSnapshot {
  return {
    localSessionId,
    phase: state.phase,
    leader: state.leader,
    difficulty: state.difficulty,
    seed: state.seed,
    countdownAt: state.countdownAt,
    startedAt: state.startedAt,
    serverTime: state.serverTime,
    round: state.round,
    racers: state.racers.map((racer) => ({ ...racer })),
  };
}

export async function connectSledRun(
  penguinColor: string,
  displayName: string,
  isCurrent: () => boolean,
): Promise<SledRunConnection> {
  const world = convexWorld();
  const joined = await world.sledJoin({ penguinColor, displayName });
  if (!isCurrent()) {
    await world.sledLeave(joined.sessionId);
    throw new Error('Stale Sled Run connection');
  }

  const listeners = new Set<(snapshot: SledRunSnapshot) => void>();
  const connectionListeners = new Set<(state: SledConnectionState) => void>();
  const hitRejectedListeners = new Set<(itemId: string) => void>();
  const pendingHits = new Set<string>();
  let seq = 0;
  let closed = false;
  let connected = true;

  const emit = (snapshot: SledServerSnapshot | null) => {
    if (!snapshot || closed) return;
    const next = snapshotSledRun(snapshot, joined.sessionId);
    listeners.forEach((listener) => listener(next));
  };

  const unwatch = (() => {
    const listener = (snapshot: SledServerSnapshot | null) => emit(snapshot);
    serverListeners.add(listener);
    if (serverSnapshot) listener(serverSnapshot);
    return () => serverListeners.delete(listener);
  })();

  const flushPendingHits = () => {
    if (!connected || closed) return;
    for (const itemId of pendingHits) {
      void world.sledHit(joined.sessionId, itemId).then((result) => {
        for (const rejected of result.rejected) hitRejectedListeners.forEach((listener) => listener(rejected));
      });
    }
    pendingHits.clear();
  };

  return {
    sessionId: joined.sessionId,
    onState(listener) {
      listeners.add(listener);
      if (serverSnapshot) listener(snapshotSledRun(serverSnapshot, joined.sessionId));
      return () => listeners.delete(listener);
    },
    onConnectionState(listener) {
      connectionListeners.add(listener);
      listener(connected ? 'connected' : 'reconnecting');
      return () => connectionListeners.delete(listener);
    },
    setDifficulty: (difficulty) => {
      if (connected && !closed) void world.sledDifficulty(joined.sessionId, difficulty);
    },
    start: () => {
      if (connected && !closed) void world.sledStart(joined.sessionId);
    },
    sendSteer: (steering) => {
      if (!connected || closed) return 0;
      const sent = ++seq;
      void world.sledInput(joined.sessionId, steering, sent);
      return sent;
    },
    sendHit: (itemId) => {
      if (closed) return;
      if (!connected) {
        if (pendingHits.size < SLED_PENDING_HIT_LIMIT) pendingHits.add(itemId);
        return;
      }
      void world.sledHit(joined.sessionId, itemId).then((result) => {
        for (const rejected of result.rejected) hitRejectedListeners.forEach((listener) => listener(rejected));
      });
    },
    onHitRejected(listener) {
      hitRejectedListeners.add(listener);
      return () => hitRejectedListeners.delete(listener);
    },
    disconnect: async () => {
      if (closed) return;
      closed = true;
      connected = false;
      unwatch();
      listeners.clear();
      connectionListeners.clear();
      hitRejectedListeners.clear();
      pendingHits.clear();
      await world.sledLeave(joined.sessionId).catch(() => undefined);
    },
  };
}
