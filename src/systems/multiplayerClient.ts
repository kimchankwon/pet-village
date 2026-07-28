import { Client, type Room } from '@colyseus/sdk';
import {
  ROOM_NAME,
  isGameActivity,
  isWorldScene,
  type ProfileRefreshResult,
  type PlayerState,
  type PositionCorrection,
  type TownState,
} from '@pet-village/multiplayer-protocol';
import {
  multiplayerBridge,
  type ConnectionId,
  type RemoteNpc,
  type RemotePresence,
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
    });
  });
  return npcs;
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
    });
  });
  return dedupeRemotePlayers(rows);
}

export async function connectMultiplayer(
  ticket: string,
  isCurrent: () => boolean,
  url = import.meta.env.VITE_MULTIPLAYER_URL as string | undefined,
): Promise<MultiplayerConnection> {
  if (!url) throw new Error('VITE_MULTIPLAYER_URL is not configured');

  const client = new Client(url);
  client.auth.token = ticket;
  const room: Room<TownState> = await client.joinOrCreate<TownState>(ROOM_NAME);
  if (!isCurrent()) {
    await room.leave();
    throw new Error('Stale multiplayer connection');
  }

  let connectionId: ConnectionId;
  let resolveClosed!: () => void;
  let finished = false;
  let profileRequestSeq = 0;
  let profileRetryTimer: ReturnType<typeof setTimeout> | null = null;
  let profileRetryTicket: string | null = null;
  let profileRetryAttempts = 0;
  const profileRequests = new Map<string, string>();
  const closed = new Promise<void>((resolve) => {
    resolveClosed = resolve;
  });

  const finish = () => {
    if (finished) return;
    finished = true;
    if (profileRetryTimer) clearTimeout(profileRetryTimer);
    profileRetryTimer = null;
    multiplayerBridge.uninstall(connectionId);
    resolveClosed();
  };

  const sync = () => {
    if (!room.state?.players) return;
    const ownUserId = room.state.players.get(room.sessionId)?.userId;
    multiplayerBridge.setRemote(
      connectionId,
      snapshotPlayers(
        room.state,
        room.sessionId,
        ownUserId,
        multiplayerBridge.activeSceneId() ?? 'town',
      ),
    );
    multiplayerBridge.setNpcs(connectionId, snapshotNpcs(room.state));
  };

  connectionId = multiplayerBridge.install({
    send: ({ sceneId, ...pose }) => room.send('move', { ...pose, scene: sceneId }),
    setActive: (active) => room.send('active', active),
    setScene: ({ sceneId, ...pose }) => room.send('active', { active: true, scene: sceneId, pose }),
    setActivity: (activity) => room.send('activity', activity),
    updateProfile: (profileTicket) => {
      if (profileRetryTicket !== profileTicket) {
        profileRetryTicket = profileTicket;
        profileRetryAttempts = 0;
      }
      const requestId = `${room.sessionId}:${++profileRequestSeq}`;
      profileRequests.set(requestId, profileTicket);
      while (profileRequests.size > 16) {
        const oldest = profileRequests.keys().next().value;
        if (oldest === undefined) break;
        profileRequests.delete(oldest);
      }
      room.send('profile', { ticket: profileTicket, requestId });
    },
    leave: () => {
      void room.leave();
    },
    wave: (id) => room.send('wave', { targetSessionId: id }),
  });
  room.onMessage('positionCorrection', (next: PositionCorrection) => {
    if ([next?.x, next?.y, next?.petX, next?.petY].every(Number.isFinite)) {
      multiplayerBridge.setPositionCorrection(connectionId, next);
    }
  });
  room.onMessage('profileRefreshed', (result: ProfileRefreshResult) => {
    if (!result?.requestId) return;
    const profileTicket = profileRequests.get(result.requestId);
    profileRequests.delete(result.requestId);
    if (profileTicket) {
      const ok = result.ok === true;
      multiplayerBridge.profileRefreshResult(connectionId, profileTicket, ok);
      if (ok && profileRetryTicket === profileTicket) {
        if (profileRetryTimer) clearTimeout(profileRetryTimer);
        profileRetryTimer = null;
        profileRetryTicket = null;
        profileRetryAttempts = 0;
      }
      if (
        !ok &&
        profileRetryTicket === profileTicket &&
        Number.isFinite(result.retryAfterMs) &&
        result.retryAfterMs! > 0 &&
        ++profileRetryAttempts <= MAX_PROFILE_RETRIES
      ) {
        if (profileRetryTimer) clearTimeout(profileRetryTimer);
        profileRetryTimer = setTimeout(() => {
          profileRetryTimer = null;
          if (!finished) multiplayerBridge.retryProfile(connectionId, profileTicket);
        }, Math.min(MAX_PROFILE_RETRY_DELAY_MS, Math.max(1, result.retryAfterMs!)));
      }
    }
  });
  room.onStateChange(sync);
  room.onReconnect(() => {
    if (finished) {
      void room.leave();
      return;
    }
    multiplayerBridge.republish(connectionId);
  });
  room.onLeave(finish);
  room.onError((_code, message) => {
    console.warn('Multiplayer connection error', message);
    room.reconnection.enabled = false;
    finish();
    if (room.connection?.isOpen) void room.leave();
  });
  sync();

  return {
    closed,
    disconnect: async () => {
      room.reconnection.enabled = false;
      finish();
      if (room.connection?.isOpen) await room.leave();
    },
  };
}
