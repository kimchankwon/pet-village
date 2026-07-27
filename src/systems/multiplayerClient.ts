import { Client, type Room } from '@colyseus/sdk';
import { ROOM_NAME, type MovePayload, type TownState } from '@pet-village/multiplayer-protocol';
import { multiplayerBridge, type ConnectionId, type RemotePresence } from './multiplayerBridge';
import { isVisibleRemotePlayer } from './multiplayerPresentation';

export type MultiplayerConnection = {
  closed: Promise<void>;
  disconnect: () => Promise<void>;
};

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
    const rows: RemotePresence[] = [];
    const ownUserId = room.state.players.get(room.sessionId)?.userId;
    room.state.players.forEach((player, sessionId) => {
      if (!player.active || !isVisibleRemotePlayer(sessionId, player.userId, room.sessionId, ownUserId)) return;
      rows.push({
        userId: player.userId,
        sessionId,
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
    multiplayerBridge.setRemote(connectionId, rows);
  };

  connectionId = multiplayerBridge.install({
    send: (pose) => room.send('move', pose satisfies MovePayload),
    setActive: (active) => room.send('active', active),
    leave: () => {
      void room.leave();
    },
    wave: (id) => room.send('wave', { targetSessionId: id }),
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
