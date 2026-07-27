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
