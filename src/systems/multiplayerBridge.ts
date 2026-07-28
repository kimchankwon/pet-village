import {
  WORLD_SCENES,
  type Facing,
  type GameActivity,
  type WorldScene,
} from '@pet-village/multiplayer-protocol';

import { CHAT_SEND_INTERVAL_MS } from './chat';
import { noteChatLogPresence, resetChatLogPresence } from './chatLog';
import type { EquippedAccessories } from './GameState';

export const WORLD_SCENE_IDS = WORLD_SCENES;
export type WorldSceneId = WorldScene;
const PROFILE_TICKET_LIFETIME_MS = 60_000;

export type RemotePresence = {
  userId: string;
  sessionId: string;
  localSessionId: string;
  name: string;
  petName: string;
  petSpecies: string;
  penguinColor: string;
  equippedAccessories: EquippedAccessories;
  x: number;
  y: number;
  petX: number;
  petY: number;
  facing: Facing;
  moving: boolean;
  active: boolean;
  activity: GameActivity | '';
  sceneId: WorldSceneId;
  updatedAt: number;
  waveId?: string;
  waveTarget?: string;
  /** Changes on every message sent, which is how a new bubble is spotted. */
  chatId?: string;
  chatText?: string;
};

export type RemoteNpc = {
  id: string;
  x: number;
  y: number;
  facing: 'left' | 'right';
  moving: boolean;
  updatedAt: number;
};

export type WorldPose = {
  x: number;
  y: number;
  petX: number;
  petY: number;
  facing: Facing;
  moving: boolean;
};
export type ScenePayload = WorldPose & { sceneId: WorldSceneId };
export type PositionCorrectionPayload = {
  sceneId: WorldSceneId;
  x: number;
  y: number;
  petX: number;
  petY: number;
  recoverScene?: boolean;
};

export type ConnectionId = symbol;
type Listener = (rows: RemotePresence[]) => void;
type NpcListener = (rows: RemoteNpc[]) => void;
type OutboundMove = WorldPose & { sceneId?: WorldSceneId };
type Actions = {
  send: (pose: ScenePayload & { seq: number }) => void;
  setActive: (active: boolean) => void;
  setScene: (scene: ScenePayload) => void;
  setActivity: (activity: GameActivity | '') => void;
  updateProfile: (ticket: string) => void;
  leave: () => void;
  wave: (id: string) => void;
  chat: (text: string) => void;
  /** Re-snapshot peers now — scene filtering changed, so cached rows are stale. */
  resync?: () => void;
};

let rows: RemotePresence[] = [];
let npcRows: RemoteNpc[] = [];
const listeners = new Set<Listener>();
const npcListeners = new Set<NpcListener>();
let actions: Actions | null = null;
let connectionId: ConnectionId | null = null;
let worldActivation: { token: symbol; payload: ScenePayload } | null = null;
let gameActivation: { token: symbol; activity: GameActivity } | null = null;
let moveSeq = 0;
let correction: PositionCorrectionPayload | null = null;
let pendingProfileTicket: string | null = null;
let pendingProfileTicketIssuedAt = 0;
/**
 * Deliberately not cleared by `install`/`uninstall`: a reconnect inside the
 * grace window rejoins the same server-side player, whose last message the
 * server is still measuring against.
 */
let lastChatSentAt = -Infinity;

function currentPendingProfileTicket() {
  if (pendingProfileTicket && Date.now() - pendingProfileTicketIssuedAt >= PROFILE_TICKET_LIFETIME_MS) {
    pendingProfileTicket = null;
    pendingProfileTicketIssuedAt = 0;
  }
  return pendingProfileTicket;
}

function clearRemote() {
  rows = [];
  npcRows = [];
  // The roster is emptied here by a teardown, not by everybody walking out, so
  // the log must not read it as one.
  resetChatLogPresence();
  listeners.forEach((fn) => fn([]));
  npcListeners.forEach((fn) => fn([]));
}

function publishPresence() {
  if (!actions) return;
  if (worldActivation) {
    actions.setScene(worldActivation.payload);
    actions.setActivity('');
    return;
  }
  actions.setActive(false);
  actions.setActivity(gameActivation?.activity ?? '');
}

type IncomingPositionCorrection = {
  sceneId?: WorldSceneId;
  scene?: string;
  x: number;
  y: number;
  petX: number;
  petY: number;
  recoverScene?: boolean;
};

function normalizeCorrection(next: IncomingPositionCorrection): PositionCorrectionPayload | null {
  const sceneId = next.sceneId ?? next.scene;
  if (!WORLD_SCENE_IDS.includes(sceneId as WorldSceneId)) return null;
  return {
    sceneId: sceneId as WorldSceneId,
    x: next.x,
    y: next.y,
    petX: next.petX,
    petY: next.petY,
    ...(next.recoverScene === true ? { recoverScene: true } : {}),
  };
}

const DEFAULT_TOWN_POSE: WorldPose = {
  x: 0,
  y: 0,
  petX: 0,
  petY: 0,
  facing: 'down',
  moving: false,
};

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
    // Everyone on the server, not just this scene — a neighbour who walks into
    // the shop has not left, and the log should not say they have.
    noteChatLogPresence(rows, performance.now());
    listeners.forEach((fn) => fn(rows));
  },
  setPositionCorrection(id: ConnectionId, next: IncomingPositionCorrection) {
    if (connectionId !== id) return;
    correction = normalizeCorrection(next);
  },
  consumePositionCorrection(sceneId?: WorldSceneId) {
    const next = correction;
    if (!next) return null;
    if (sceneId && next.sceneId !== sceneId) {
      if (next.recoverScene) return next;
      correction = null;
      return null;
    }
    correction = null;
    return next;
  },
  install(next: Actions) {
    const id = Symbol('multiplayer-connection');
    connectionId = id;
    actions = next;
    moveSeq = 0;
    correction = null;
    pendingProfileTicket = null;
    pendingProfileTicketIssuedAt = 0;
    clearRemote();
    publishPresence();
    return id;
  },
  republish(id: ConnectionId) {
    if (connectionId !== id || !actions) return false;
    publishPresence();
    const profileTicket = currentPendingProfileTicket();
    if (profileTicket) actions.updateProfile(profileTicket);
    return true;
  },
  uninstall(id: ConnectionId) {
    if (connectionId !== id) return false;
    connectionId = null;
    actions = null;
    correction = null;
    pendingProfileTicket = null;
    pendingProfileTicketIssuedAt = 0;
    clearRemote();
    return true;
  },
  send(pose: OutboundMove) {
    if (!actions) return;
    const sceneId = pose.sceneId ?? worldActivation?.payload.sceneId;
    if (!sceneId) return;
    actions.send({
      ...pose,
      sceneId,
      seq: ++moveSeq,
    });
  },
  activateGame(activity: GameActivity) {
    const token = Symbol('game-activation');
    gameActivation = { token, activity };
    publishPresence();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      if (gameActivation?.token !== token) return;
      gameActivation = null;
      publishPresence();
    };
  },
  activateWorld(sceneId: WorldSceneId, pose: WorldPose) {
    const token = Symbol('world-activation');
    if (!(correction?.recoverScene && correction.sceneId === sceneId)) correction = null;
    worldActivation = { token, payload: { sceneId, ...pose } };
    publishPresence();
    // Peers are filtered by the active scene, so without this the new scene
    // waits for the next server patch before anyone pops in.
    actions?.resync?.();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      if (worldActivation?.token !== token) return;
      worldActivation = null;
      publishPresence();
    };
  },
  /** Compatibility for callers transitioning from Town-only presence. */
  activateTown(pose: WorldPose = DEFAULT_TOWN_POSE) {
    return this.activateWorld('town', pose);
  },
  activeSceneId(): WorldSceneId | null {
    return worldActivation?.payload.sceneId ?? null;
  },
  updateProfile(ticket: string) {
    pendingProfileTicket = ticket;
    pendingProfileTicketIssuedAt = Date.now();
    actions?.updateProfile(ticket);
  },
  profileRefreshResult(id: ConnectionId, ticket: string, ok: boolean) {
    if (connectionId !== id || !ok || currentPendingProfileTicket() !== ticket) return false;
    pendingProfileTicket = null;
    pendingProfileTicketIssuedAt = 0;
    return true;
  },
  retryProfile(id: ConnectionId, ticket: string) {
    if (connectionId !== id || currentPendingProfileTicket() !== ticket || !actions) return false;
    actions.updateProfile(ticket);
    return true;
  },
  leave() {
    actions?.leave();
  },
  wave(id: string) {
    actions?.wave(id);
  },
  /**
   * Send a message, and say whether it actually went out. The sender's own
   * bubble is optimistic, so this is where the two things the server also checks
   * are checked first: there has to be a connection and a world to stand in, and
   * the cooldown is kept here rather than in a scene because a world transition
   * builds a new `WorldMultiplayer` while the server keeps counting from the last
   * message. Wider than the server's floor so the boundary is never a race.
   */
  chat(text: string) {
    if (!actions || !worldActivation) return false;
    const now = Date.now();
    if (now - lastChatSentAt < CHAT_SEND_INTERVAL_MS) return false;
    lastChatSentAt = now;
    actions.chat(text);
    return true;
  },
};
