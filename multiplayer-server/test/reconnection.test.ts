import assert from 'node:assert/strict';
import test from 'node:test';
import { PlayerState, TownState } from '@pet-village/multiplayer-protocol';
import { TownRoom } from '../src/TownRoom.ts';

function roomWithPlayer() {
  const room = new TownRoom();
  room.setState(new TownState());
  room.state.players.set('session-a', new PlayerState());
  return room;
}

test('reserves dropped players for reconnection without removing their state', () => {
  const room = roomWithPlayer();
  let graceSeconds = 0;
  room.allowReconnection = ((_client: unknown, seconds: number) => {
    graceSeconds = seconds;
    return Promise.resolve({});
  }) as never;

  room.onDrop({ sessionId: 'session-a' } as never);

  assert.equal(graceSeconds, 20);
  assert.equal(room.state.players.has('session-a'), true);
});

test('removes player state only when the client finally leaves', () => {
  const room = roomWithPlayer();
  room.onLeave({ sessionId: 'session-a' } as never);
  assert.equal(room.state.players.has('session-a'), false);
});

test('inactive to active authorizes exactly one approved Town re-entry spawn', () => {
  const room = roomWithPlayer();
  const corrections: unknown[] = [];
  const client = {
    sessionId: 'session-a',
    send: (_type: string, payload: unknown) => corrections.push(payload),
  } as never;
  const player = room.state.players.get('session-a')!;
  Object.assign(player, { active: true, seq: 10, x: 900, y: 600, updatedAt: Date.now() });

  (room as any).setActive(client, false);
  (room as any).setActive(client, true);
  (room as any).move(client, {
    x: 528, y: 266.4, petX: 500, petY: 278, facing: 'down', moving: false, seq: 11,
  });
  assert.equal(player.x, 528);
  assert.equal(player.y, 266.4);
  assert.equal(player.seq, 11);
  assert.deepEqual(corrections, []);

  (room as any).move(client, {
    x: 76.8, y: 432, petX: 50, petY: 444, facing: 'down', moving: false, seq: 12,
  });
  assert.equal(player.x, 528);
  assert.equal(corrections.length, 1);
});
