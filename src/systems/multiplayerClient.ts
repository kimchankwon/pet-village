import {
  isGameActivity,
  isWorldScene,
  NpcState,
  PlayerState,
  TownState,
  type PositionCorrection,
} from '@pet-village/multiplayer-protocol';
import { convexWorld } from './convexWorld';
import {
  multiplayerBridge,
  type ConnectionId,
  type RemoteNpc,
  type RemotePresence,
  type ScenePayload,
  type WorldSceneId,
} from './multiplayerBridge';
import { dedupeRemotePlayers, isVisibleRemotePlayer } from './multiplayerPresentation';
import { isAccessoryId, type AccessoryId, type AccessorySlot } from './accessories';

const MAX_PROFILE_RETRIES = 3;
const MAX_PROFILE_RETRY_DELAY_MS = 30_000;

function snapshotAccessories(player: PlayerState) {
  const equipped: Partial<Record<AccessorySlot, AccessoryId>> = {};
  const slots = [
    ['headLeft', player.accessoryHeadLeft],
    ['headRight', player.accessoryHeadRight],
    ['body', player.accessoryBody],
    ['extra', player.accessoryExtra],
  ] as const;
  for (const [slot, id] of slots) if (isAccessoryId(id)) equipped[slot] = id;
  return equipped;
}

export type MultiplayerConnection = {
  closed: Promise<void>;
  disconnect: () => Promise<void>;
};

export function snapshotNpcs(state: TownState): RemoteNpc[] {
  const npcs: RemoteNpc[] = [];
  if (!state?.npcs) return npcs;
  state.npcs.forEach((npc) => {
    npcs.push({
      id: npc.id,
      x: npc.x,
      y: npc.y,
      facing: npc.facing,
      moving: npc.moving,
      updatedAt: npc.updatedAt,
      destination: npc.destination,
      pauseUntil: npc.pauseUntil,
    });
  });
  return npcs;
}

/**
 * Everyone on the server, whatever scene they are standing in.
 *
 * Deliberately not `snapshotPlayers`, which filters to the scene being drawn:
 * that is the right roster for avatars and bubbles and the wrong one entirely
 * for "who is here", where walking into the shop would read as leaving. Self and
 * a reconnect's leftover duplicate session are still left out — one player is
 * one villager — but a scene the client never draws is not an absence.
 */
export function snapshotRoster(
  state: TownState,
  localSessionId: string,
  ownUserId: string | undefined,
): Array<{ sessionId: string; userId: string; name: string; active: boolean; updatedAt: number }> {
  const rows: Array<{ sessionId: string; userId: string; name: string; active: boolean; updatedAt: number }> = [];
  if (!state?.players) return rows;
  state.players.forEach((player, sessionId) => {
    if (!isVisibleRemotePlayer(sessionId, player.userId, localSessionId, ownUserId)) return;
    rows.push({
      sessionId,
      userId: player.userId,
      name: player.displayName,
      active: player.active,
      updatedAt: player.updatedAt,
    });
  });
  return dedupeRemotePlayers(rows);
}

export function snapshotPlayers(
  state: TownState,
  localSessionId: string,
  ownUserId: string | undefined,
  sceneId: WorldSceneId = 'town',
): RemotePresence[] {
  const rows: RemotePresence[] = [];
  if (!state?.players) return rows;
  state.players.forEach((player, sessionId) => {
    const activity = isGameActivity(player.activity) ? player.activity : '';
    const playerScene = isWorldScene(player.scene) ? player.scene : 'town';
    if (
      (!player.active && !activity) ||
      playerScene !== sceneId ||
      !isVisibleRemotePlayer(sessionId, player.userId, localSessionId, ownUserId)
    ) return;
    rows.push({
      userId: player.userId,
      sessionId,
      localSessionId,
      name: player.displayName,
      petName: player.petName,
      petSpecies: player.petSpecies,
      penguinColor: player.penguinColor,
      equippedAccessories: snapshotAccessories(player),
      x: player.x,
      y: player.y,
      petX: player.petX,
      petY: player.petY,
      facing: player.facing,
      moving: player.moving,
      active: player.active,
      activity,
      sceneId,
      updatedAt: player.updatedAt,
      waveId: player.waveId || undefined,
      waveTarget: player.waveTarget || undefined,
      chatId: player.chatId || undefined,
      chatText: player.chatText || undefined,
      emote: typeof player.emote === 'string' ? player.emote : '',
      petEmote: typeof player.petEmote === 'string' ? player.petEmote : '',
      petEmoteId: typeof player.petEmoteId === 'string' ? player.petEmoteId : '',
    });
  });
  return dedupeRemotePlayers(rows);
}

export type VillageSnapshot = {
  userId: string;
  players: Array<Partial<PlayerState> & { sessionId: string; userId: string }>;
  npcs: Array<{
    id: string;
    x: number;
    y: number;
    facing: 'left' | 'right';
    moving: boolean;
    updatedAt: number;
    destination?: number;
    pauseUntil?: number;
  }>;
  npcSimAt?: number;
};

export function townStateFromSnapshot(snapshot: VillageSnapshot): TownState {
  const state = new TownState();
  for (const player of snapshot.players) {
    const row = new PlayerState();
    Object.assign(row, player);
    state.players.set(player.sessionId, row);
  }
  for (const npc of snapshot.npcs) {
    const row = new NpcState();
    Object.assign(row, npc);
    state.npcs.set(npc.id, row);
  }
  return state;
}

/**
 * What the last snapshot resolved to, so an identical one can be dropped.
 *
 * Your own steps land in the same presence table everyone else's do, so walking
 * across an empty Town has the server push a fresh snapshot ten times a second
 * — every one of them describing peers that have not moved. Applying those
 * re-ran the whole roster diff and re-positioned every remote sprite and
 * nametag for nothing. Keyed by connection so a reconnect always starts fresh.
 */
let appliedVillage: { connectionId: ConnectionId; players: string; roster: string; npcs: string } | null = null;

/** The roster only ever reads session ids and names; the rest is churn. */
function rosterSignature(rows: ReadonlyArray<{ sessionId: string; name: string }>) {
  return rows.map((row) => `${row.sessionId}\u0000${row.name}`).join('\u0001');
}

export function applyVillageSnapshot(
  connectionId: ConnectionId,
  snapshot: VillageSnapshot,
  localSessionId: string,
  force = false,
) {
  const state = townStateFromSnapshot(snapshot);
  const players = snapshotPlayers(state, localSessionId, snapshot.userId, multiplayerBridge.activeSceneId() ?? 'town');
  const roster = snapshotRoster(state, localSessionId, snapshot.userId);
  const npcs = snapshotNpcs(state);
  const next = {
    connectionId,
    players: JSON.stringify(players),
    roster: rosterSignature(roster),
    npcs: JSON.stringify(npcs),
  };
  const previous = !force && appliedVillage?.connectionId === connectionId ? appliedVillage : null;
  appliedVillage = next;
  if (!previous || previous.players !== next.players) multiplayerBridge.setRemote(connectionId, players);
  if (!previous || previous.roster !== next.roster) multiplayerBridge.setRoster(connectionId, roster);
  if (!previous || previous.npcs !== next.npcs) {
    multiplayerBridge.setNpcs(connectionId, npcs, snapshot.npcSimAt);
  }
}

type VillageListener = (snapshot: VillageSnapshot) => void;
const villageListeners = new Set<VillageListener>();
let latestVillage: VillageSnapshot | null = null;

export function pushVillageSnapshot(snapshot: VillageSnapshot | null) {
  latestVillage = snapshot;
  if (snapshot) villageListeners.forEach((listener) => listener(snapshot));
}

function applyCorrection(connectionId: ConnectionId, next?: PositionCorrection) {
  if (next && [next.x, next.y, next.petX, next.petY].every(Number.isFinite)) {
    multiplayerBridge.setPositionCorrection(connectionId, next);
  }
}

export async function connectMultiplayer(
  penguinColor: string,
  isCurrent: () => boolean,
): Promise<MultiplayerConnection & { sessionId: string; userId: string }> {
  const world = convexWorld();
  const joined = await world.join(penguinColor);
  if (!isCurrent()) {
    await world.leave(joined.sessionId);
    throw new Error('Stale multiplayer connection');
  }

  let connectionId: ConnectionId;
  let resolveClosed!: () => void;
  let finished = false;
  // At most one move mutation in flight, holding only the newest pose.
  //
  // The scene offers a pose every 100ms whether or not the last one has landed.
  // Firing each one regardless piles them up on a slow link, and the server
  // measures speed between *arrivals*: a burst that arrives back-to-back reads
  // as teleporting, gets rejected, and answers with a correction that yanks the
  // penguin backwards. Waiting for the previous mutation paces the sends to the
  // round trip on its own, and dropping the poses that went stale while waiting
  // costs nothing — only the latest one is true.
  let moveInFlight = false;
  let pendingMove: (ScenePayload & { seq: number }) | null = null;
  let profileRetryTimer: ReturnType<typeof setTimeout> | null = null;
  let profileRetryColor: string | null = null;
  let profileRetryAttempts = 0;
  const closed = new Promise<void>((resolve) => {
    resolveClosed = resolve;
  });

  const flushMove = () => {
    if (moveInFlight || finished) return;
    const next = pendingMove;
    if (!next) return;
    pendingMove = null;
    moveInFlight = true;
    const { sceneId, ...pose } = next;
    void world
      .move({ sessionId: joined.sessionId, scene: sceneId, ...pose })
      .then((result) => applyCorrection(connectionId, result?.correction))
      .catch(() => undefined)
      .finally(() => {
        moveInFlight = false;
        flushMove();
      });
  };

  const onVillage = (snapshot: VillageSnapshot, force = false) => {
    applyVillageSnapshot(connectionId, snapshot, joined.sessionId, force);
  };

  const finish = () => {
    if (finished) return;
    finished = true;
    if (profileRetryTimer) clearTimeout(profileRetryTimer);
    profileRetryTimer = null;
    pendingMove = null;
    villageListeners.delete(onVillage);
    multiplayerBridge.uninstall(connectionId);
    resolveClosed();
  };

  connectionId = multiplayerBridge.install({
    send: (pose) => {
      pendingMove = pose;
      flushMove();
    },
    setActive: (active) => {
      void world.setActive({ sessionId: joined.sessionId, active }).then((result) => {
        applyCorrection(connectionId, result?.correction);
      });
    },
    setScene: ({ sceneId, ...pose }) => {
      void world.setActive({
        sessionId: joined.sessionId,
        active: true,
        scene: sceneId,
        pose,
      }).then((result) => {
        applyCorrection(connectionId, result?.correction);
      });
    },
    setActivity: (activity) => {
      void world.setActivity(joined.sessionId, activity);
    },
    // Peers are filtered by the scene being drawn, so a scene change has to
    // re-derive the roster from the snapshot already in hand instead of waiting
    // for the next server patch to bring everyone back.
    resync: () => {
      if (latestVillage) onVillage(latestVillage, true);
    },
    updateProfile: () => {
      profileRetryColor = penguinColor;
      profileRetryAttempts = 0;
      void world.refreshProfile(joined.sessionId, penguinColor).then((result) => {
        multiplayerBridge.profileRefreshResult(connectionId, 'convex', result.ok);
        if (
          !result.ok &&
          profileRetryColor &&
          Number.isFinite(result.retryAfterMs) &&
          result.retryAfterMs! > 0 &&
          ++profileRetryAttempts <= MAX_PROFILE_RETRIES
        ) {
          if (profileRetryTimer) clearTimeout(profileRetryTimer);
          profileRetryTimer = setTimeout(() => {
            profileRetryTimer = null;
            if (!finished) multiplayerBridge.retryProfile(connectionId, 'convex');
          }, Math.min(MAX_PROFILE_RETRY_DELAY_MS, Math.max(1, result.retryAfterMs!)));
        }
      });
    },
    leave: () => {
      void world.leave(joined.sessionId).finally(finish);
    },
    wave: (id) => {
      void world.wave(joined.sessionId, id);
    },
    emote: (emote) => {
      void world.emote(joined.sessionId, emote);
    },
    petEmote: (expression) => {
      void world.petEmote(joined.sessionId, expression);
    },
    chat: (text) => {
      void world.chat(joined.sessionId, text);
    },
  });
  villageListeners.add(onVillage);
  if (latestVillage) onVillage(latestVillage);

  return {
    sessionId: joined.sessionId,
    userId: joined.userId,
    closed,
    disconnect: async () => {
      finish();
      await world.leave(joined.sessionId).catch(() => undefined);
    },
  };
}
