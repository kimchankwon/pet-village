import { Client, type Room } from '@colyseus/sdk';
import {
  SLED_RUN_ROOM,
  type SledDifficulty,
  type SledEffect,
  type SledHitRejectedPayload,
  type SledPhase,
  type SledRunState,
} from '@pet-village/multiplayer-protocol';

export type SledRacerSnapshot = {
  sessionId: string;
  userId: string;
  displayName: string;
  penguinColor: string;
  x: number;
  progress: number;
  speed: number;
  /** The steering the server is applying, so followers can carry a sled forward. */
  steering: number;
  /** Newest input the server has applied, which is also our round-trip echo. */
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

export type SledConnectionState = 'connected' | 'reconnecting' | 'closed';

export type SledRunConnection = {
  sessionId: string;
  onState: (listener: (snapshot: SledRunSnapshot) => void) => () => void;
  onConnectionState: (listener: (state: SledConnectionState) => void) => () => void;
  setDifficulty: (difficulty: SledDifficulty) => void;
  start: () => void;
  /** Sends the input and returns its sequence number, or 0 when nothing went out. */
  sendSteer: (steering: -1 | 0 | 1) => number;
  /** Tells the room about a collision this client called on its own lane. */
  sendHit: (itemId: string) => void;
  /** Items the server would not stand behind, so the effect can be dropped here too. */
  onHitRejected: (listener: (itemId: string) => void) => () => void;
  disconnect: () => Promise<void>;
};

/**
 * How many unsent collision reports to hold across a drop. A whole course is
 * under forty items, so this covers any realistic outage without letting a long
 * one grow unbounded.
 */
const SLED_PENDING_HIT_LIMIT = 48;

export function snapshotSledRun(state: SledRunState, localSessionId: string): SledRunSnapshot {
  const racers: SledRacerSnapshot[] = [];
  state.racers?.forEach((racer, sessionId) => racers.push({
    sessionId,
    userId: racer.userId,
    displayName: racer.displayName,
    penguinColor: racer.penguinColor,
    x: racer.x,
    progress: racer.progress,
    speed: racer.speed,
    steering: racer.steering,
    inputSeq: racer.inputSeq,
    effect: racer.effect,
    effectUntil: racer.effectUntil,
    rank: racer.rank,
    finishedAt: racer.finishedAt,
  }));
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
    racers,
  };
}

function errorCode(error: unknown): number | undefined {
  return typeof error === 'object' && error !== null && 'code' in error
    ? Number((error as { code?: unknown }).code)
    : undefined;
}

async function joinRoomWithTimeout(client: Client, timeoutMs: number): Promise<Room<SledRunState>> {
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const join = client.joinOrCreate<SledRunState>(SLED_RUN_ROOM);
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      reject(new Error('Sled Run connection timed out'));
    }, timeoutMs);
  });
  try {
    return await Promise.race([join, timeout]);
  } catch (error) {
    if (timedOut) {
      void join.then(async (lateRoom) => {
        lateRoom.reconnection.enabled = false;
        await lateRoom.leave();
      }).catch(() => undefined);
    }
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function connectSledRun(
  ticket: string,
  isCurrent: () => boolean,
  url = import.meta.env.VITE_MULTIPLAYER_URL as string | undefined,
  createClient: (endpoint: string) => Client = (endpoint) => new Client(endpoint),
  joinTimeoutMs = 8_000,
): Promise<SledRunConnection> {
  if (!url) throw new Error('VITE_MULTIPLAYER_URL is not configured');
  const client = createClient(url);
  client.auth.token = ticket;
  let room: Room<SledRunState> | undefined;
  for (let attempt = 0; attempt < 2 && !room; attempt += 1) {
    try {
      room = await joinRoomWithTimeout(client, joinTimeoutMs);
    } catch (error) {
      if (attempt === 0 && errorCode(error) === 403) continue;
      throw error;
    }
  }
  if (!room) throw new Error('Unable to join Sled Run');
  if (!isCurrent()) {
    await room.leave();
    throw new Error('Stale Sled Run connection');
  }

  const listeners = new Set<(snapshot: SledRunSnapshot) => void>();
  const connectionListeners = new Set<(state: SledConnectionState) => void>();
  const hitRejectedListeners = new Set<(itemId: string) => void>();
  // Reports made while dropped: the room's own queue is switched off, and a lost
  // report is a bump or a boost the rest of the race never sees.
  const pendingHits = new Set<string>();
  let latest: SledRunSnapshot | undefined;
  let seq = 0;
  let closed = false;
  let connected = true;
  room.reconnection.maxEnqueuedMessages = 0;

  const sync = () => {
    if (!room.state?.racers) return;
    latest = snapshotSledRun(room.state, room.sessionId);
    listeners.forEach((listener) => listener(latest!));
  };
  const emitConnectionState = (state: SledConnectionState) => {
    connectionListeners.forEach((listener) => listener(state));
  };

  const flushPendingHits = () => {
    if (!connected || closed) return;
    for (const itemId of pendingHits) room.send('sled:hit', { itemId });
    pendingHits.clear();
  };

  room.onStateChange(sync);
  room.onMessage('sled:hit:rejected', (payload: SledHitRejectedPayload) => {
    const itemId = payload?.itemId;
    if (typeof itemId !== 'string') return;
    pendingHits.delete(itemId);
    hitRejectedListeners.forEach((listener) => listener(itemId));
  });
  room.onError((_code, message) => console.warn('Sled Run connection error', message));
  room.onDrop(() => {
    connected = false;
    emitConnectionState('reconnecting');
  });
  room.onReconnect(() => {
    if (closed || !isCurrent()) {
      room.reconnection.enabled = false;
      void room.leave();
      return;
    }
    connected = true;
    flushPendingHits();
    emitConnectionState('connected');
    sync();
  });
  room.onLeave(() => {
    connected = false;
    if (!closed) {
      closed = true;
      emitConnectionState('closed');
    }
    listeners.clear();
    connectionListeners.clear();
    hitRejectedListeners.clear();
    pendingHits.clear();
  });
  sync();

  return {
    sessionId: room.sessionId,
    onState(listener) {
      listeners.add(listener);
      if (latest) listener(latest);
      return () => listeners.delete(listener);
    },
    onConnectionState(listener) {
      connectionListeners.add(listener);
      listener(connected ? 'connected' : 'reconnecting');
      return () => connectionListeners.delete(listener);
    },
    setDifficulty: (difficulty) => { if (connected && !closed) room.send('sled:difficulty', difficulty); },
    start: () => { if (connected && !closed) room.send('sled:start'); },
    sendSteer: (steering) => {
      if (!connected || closed) return 0;
      const sent = ++seq;
      room.send('sled:input', { steering, seq: sent });
      return sent;
    },
    sendHit: (itemId) => {
      if (closed) return;
      if (!connected) {
        if (pendingHits.size < SLED_PENDING_HIT_LIMIT) pendingHits.add(itemId);
        return;
      }
      room.send('sled:hit', { itemId });
    },
    onHitRejected(listener) {
      hitRejectedListeners.add(listener);
      return () => hitRejectedListeners.delete(listener);
    },
    disconnect: async () => {
      if (closed) return;
      closed = true;
      connected = false;
      room.reconnection.enabled = false;
      room.reconnection.enqueuedMessages.length = 0;
      listeners.clear();
      connectionListeners.clear();
      hitRejectedListeners.clear();
      pendingHits.clear();
      if (room.connection?.isOpen) await room.leave();
    },
  };
}
