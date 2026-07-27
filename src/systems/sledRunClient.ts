import { Client, type Room } from '@colyseus/sdk';
import {
  SLED_RUN_ROOM,
  type SledDifficulty,
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
  effect: string;
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
  sendSteer: (steering: -1 | 0 | 1) => void;
  disconnect: () => Promise<void>;
};

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
    round: state.round,
    racers,
  };
}

export async function connectSledRun(
  ticket: string,
  isCurrent: () => boolean,
  url = import.meta.env.VITE_MULTIPLAYER_URL as string | undefined,
): Promise<SledRunConnection> {
  if (!url) throw new Error('VITE_MULTIPLAYER_URL is not configured');
  const client = new Client(url);
  client.auth.token = ticket;
  const room: Room<SledRunState> = await client.joinOrCreate<SledRunState>(SLED_RUN_ROOM);
  if (!isCurrent()) {
    await room.leave();
    throw new Error('Stale Sled Run connection');
  }

  const listeners = new Set<(snapshot: SledRunSnapshot) => void>();
  const connectionListeners = new Set<(state: SledConnectionState) => void>();
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

  room.onStateChange(sync);
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
    sendSteer: (steering) => { if (connected && !closed) room.send('sled:input', { steering, seq: ++seq }); },
    disconnect: async () => {
      if (closed) return;
      closed = true;
      connected = false;
      room.reconnection.enabled = false;
      room.reconnection.enqueuedMessages.length = 0;
      listeners.clear();
      connectionListeners.clear();
      if (room.connection?.isOpen) await room.leave();
    },
  };
}
