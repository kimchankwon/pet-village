import type { Facing, MovePayload, PositionCorrection } from '@pet-village/multiplayer-protocol';

export type RemotePresence = {
  userId: string;
  sessionId: string;
  localSessionId: string;
  name: string;
  petName: string;
  petSpecies: string;
  penguinColor: string;
  x: number;
  y: number;
  petX: number;
  petY: number;
  facing: Facing;
  moving: boolean;
  updatedAt: number;
  waveId?: string;
  waveTarget?: string;
};

export type ConnectionId = symbol;
type Listener = (rows: RemotePresence[]) => void;
type OutboundMove = Omit<MovePayload, 'seq'>;
type Actions = {
  send: (pose: MovePayload) => void;
  setActive: (active: boolean) => void;
  leave: () => void;
  wave: (id: string) => void;
};

let rows: RemotePresence[] = [];
const listeners = new Set<Listener>();
let actions: Actions | null = null;
let connectionId: ConnectionId | null = null;
let localActive = false;
let moveSeq = 0;
let correction: PositionCorrection | null = null;

function clearRemote() {
  rows = [];
  listeners.forEach((fn) => fn([]));
}

export const multiplayerBridge = {
  subscribe(fn: Listener) {
    listeners.add(fn);
    fn(rows);
    return () => listeners.delete(fn);
  },
  setRemote(id: ConnectionId, next: RemotePresence[]) {
    if (connectionId !== id) return;
    rows = next;
    listeners.forEach((fn) => fn(rows));
  },
  setPositionCorrection(id: ConnectionId, next: PositionCorrection) {
    if (connectionId === id) correction = next;
  },
  consumePositionCorrection() {
    const next = correction;
    correction = null;
    return next;
  },
  install(next: Actions) {
    const id = Symbol('multiplayer-connection');
    connectionId = id;
    actions = next;
    moveSeq = 0;
    correction = null;
    clearRemote();
    actions.setActive(localActive);
    return id;
  },
  uninstall(id: ConnectionId) {
    if (connectionId !== id) return false;
    connectionId = null;
    actions = null;
    correction = null;
    clearRemote();
    return true;
  },
  send(pose: OutboundMove) {
    if (actions) actions.send({ ...pose, seq: ++moveSeq });
  },
  setActive(active: boolean) {
    localActive = active;
    actions?.setActive(active);
  },
  leave() {
    actions?.leave();
  },
  wave(id: string) {
    actions?.wave(id);
  },
};
