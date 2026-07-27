import type {
  Facing,
  GameActivity,
  MovePayload,
  PositionCorrection,
} from '@pet-village/multiplayer-protocol';

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
  active: boolean;
  activity: GameActivity | '';
  updatedAt: number;
  waveId?: string;
  waveTarget?: string;
};

export type RemoteNpc = {
  id: string;
  x: number;
  y: number;
  facing: 'left' | 'right';
  moving: boolean;
  updatedAt: number;
};

export type ConnectionId = symbol;
type Listener = (rows: RemotePresence[]) => void;
type NpcListener = (rows: RemoteNpc[]) => void;
type OutboundMove = Omit<MovePayload, 'seq'>;
type Actions = {
  send: (pose: MovePayload) => void;
  setActive: (active: boolean) => void;
  setActivity: (activity: GameActivity | '') => void;
  leave: () => void;
  wave: (id: string) => void;
};

let rows: RemotePresence[] = [];
let npcRows: RemoteNpc[] = [];
const listeners = new Set<Listener>();
const npcListeners = new Set<NpcListener>();
let actions: Actions | null = null;
let connectionId: ConnectionId | null = null;
const townActivations = new Set<symbol>();
let gameActivation: { token: symbol; activity: GameActivity } | null = null;
let moveSeq = 0;
let correction: PositionCorrection | null = null;

function clearRemote() {
  rows = [];
  npcRows = [];
  listeners.forEach((fn) => fn([]));
  npcListeners.forEach((fn) => fn([]));
}

function publishPresence() {
  if (!actions) return;
  actions.setActive(townActivations.size > 0);
  actions.setActivity(townActivations.size === 0 ? gameActivation?.activity ?? '' : '');
}

export const multiplayerBridge = {
  subscribe(fn: Listener) {
    listeners.add(fn);
    fn(rows);
    return () => listeners.delete(fn);
  },
  subscribeNpcs(fn: NpcListener) {
    npcListeners.add(fn);
    fn(npcRows);
    return () => npcListeners.delete(fn);
  },
  setNpcs(id: ConnectionId, next: RemoteNpc[]) {
    if (connectionId !== id) return;
    npcRows = next;
    npcListeners.forEach((fn) => fn(npcRows));
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
    publishPresence();
    return id;
  },
  republish(id: ConnectionId) {
    if (connectionId !== id || !actions) return false;
    publishPresence();
    return true;
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
  activateGame(activity: GameActivity) {
    const token = Symbol('game-activation');
    gameActivation = { token, activity };
    actions?.setActivity(activity);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      if (gameActivation?.token !== token) return;
      gameActivation = null;
      actions?.setActivity('');
    };
  },
  activateTown() {
    const token = Symbol('town-activation');
    const wasInactive = townActivations.size === 0;
    townActivations.add(token);
    if (wasInactive) actions?.setActive(true);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      townActivations.delete(token);
      if (townActivations.size === 0) actions?.setActive(false);
    };
  },
  leave() {
    actions?.leave();
  },
  wave(id: string) {
    actions?.wave(id);
  },
};
