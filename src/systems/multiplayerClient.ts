import { Client, type Room } from '@colyseus/sdk';
import { ROOM_NAME, type MovePayload, type PositionCorrection, type TownState } from '@pet-village/multiplayer-protocol';
import { multiplayerBridge, type ConnectionId, type RemoteNpc, type RemotePresence } from './multiplayerBridge';
import { dedupeRemotePlayers, isVisibleRemotePlayer } from './multiplayerPresentation';

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
  const closed = new Promise<void>((resolve) => {
    resolveClosed = resolve;
  });

  const finish = () => {
    if (finished) return;
    finished = true;
    multiplayerBridge.uninstall(connectionId);
    resolveClosed();
  };

  const sync = () => {
    if (!room.state?.players) return;
    const rows: RemotePresence[] = [];
    const ownUserId = room.state.players.get(room.sessionId)?.userId;
    room.state.players.forEach((player, sessionId) => {
      if (!player.active || !isVisibleRemotePlayer(sessionId, player.userId, room.sessionId, ownUserId)) return;
      rows.push({
        userId: player.userId,
        sessionId,
        localSessionId: room.sessionId,
        name: player.displayName,
        petName: player.petName,
        petSpecies: player.petSpecies,
        penguinColor: player.penguinColor,
        x: player.x,
        y: player.y,
        petX: player.petX,
        petY: player.petY,
        facing: player.facing,
        moving: player.moving,
        updatedAt: player.updatedAt,
        waveId: player.waveId,
        waveTarget: player.waveTarget,
      });
    });
    multiplayerBridge.setRemote(connectionId, dedupeRemotePlayers(rows));
    multiplayerBridge.setNpcs(connectionId, snapshotNpcs(room.state));
  };

  connectionId = multiplayerBridge.install({
    send: (pose) => room.send('move', pose satisfies MovePayload),
    setActive: (active) => room.send('active', active),
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
  room.onStateChange(sync);
  room.onLeave(finish);
  room.onError((_code, message) => {
    console.warn('Multiplayer connection error', message);
    finish();
    if (room.connection?.isOpen) void room.leave();
  });
  sync();

  return {
    closed,
    disconnect: async () => {
      finish();
      if (room.connection?.isOpen) await room.leave();
    },
  };
}
