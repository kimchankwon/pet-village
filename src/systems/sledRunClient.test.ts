import test from 'node:test';
import assert from 'node:assert/strict';
import { SledPlayerState, SledRunState } from '@pet-village/multiplayer-protocol';
import { Client, type Room } from '@colyseus/sdk';
import { connectSledRun, snapshotSledRun } from './sledRunClient';

test('sled client projects authoritative room state into immutable renderer data', () => {
  const state = new SledRunState();
  state.phase = 'racing';
  state.leader = 'a';
  state.difficulty = 'hard';
  state.seed = 'course-7';
  state.round = 3;
  state.serverTime = 12_345;
  const racer = new SledPlayerState();
  Object.assign(racer, {
    userId: 'user-a', displayName: 'Alice', penguinColor: 'pink', x: 42,
    progress: 900, speed: 430, steering: -1, inputSeq: 12,
    effect: 'ice', effectUntil: 1_500, rank: 0,
  });
  state.racers.set('a', racer);

  const snapshot = snapshotSledRun(state, 'a');
  assert.equal(snapshot.localSessionId, 'a');
  assert.equal(snapshot.phase, 'racing');
  assert.equal(snapshot.difficulty, 'hard');
  assert.equal(snapshot.serverTime, 12_345);
  assert.deepEqual(snapshot.racers[0], {
    sessionId: 'a', userId: 'user-a', displayName: 'Alice', penguinColor: 'pink',
    x: 42, progress: 900, speed: 430, steering: -1, inputSeq: 12,
    effect: 'ice', effectUntil: 1_500, rank: 0, finishedAt: 0,
  });

  racer.progress = 1_000;
  assert.equal(snapshot.racers[0]!.progress, 900);
});

function fakeRoom() {
  const callbacks: Record<string, () => void> = {};
  const messageHandlers: Record<string, (payload: unknown) => void> = {};
  const sent: Array<{ type: string; payload: unknown }> = [];
  let leaves = 0;
  const room = {
    sessionId: 'session-a',
    state: new SledRunState(),
    reconnection: { enabled: true, maxEnqueuedMessages: 100, enqueuedMessages: [] as unknown[] },
    connection: { isOpen: true },
    onStateChange: (callback: () => void) => { callbacks.state = callback; return () => undefined; },
    onMessage: (type: string, callback: (payload: unknown) => void) => {
      messageHandlers[type] = callback;
      return () => undefined;
    },
    onError: (_callback: () => void) => () => undefined,
    onDrop: (callback: () => void) => { callbacks.drop = callback; return () => undefined; },
    onReconnect: (callback: () => void) => { callbacks.reconnect = callback; return () => undefined; },
    onLeave: (callback: () => void) => { callbacks.leave = callback; return () => undefined; },
    send: (type: string, payload: unknown) => { sent.push({ type, payload }); },
    leave: async () => { leaves += 1; },
  } as unknown as Room<SledRunState>;
  return { room, callbacks, messageHandlers, sent, leaves: () => leaves };
}

test('sled client abandons a late room after the join timeout', async () => {
  const { room, leaves } = fakeRoom();
  const client = {
    auth: { token: '' },
    joinOrCreate: () => new Promise<Room<SledRunState>>((resolve) => setTimeout(() => resolve(room), 20)),
  } as unknown as Client;

  await assert.rejects(
    connectSledRun('ticket', () => true, 'ws://test', () => client, 2),
    /timed out/i,
  );
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(room.reconnection.enabled, false);
  assert.equal(leaves(), 1);
});

test('sled client retries a room that started during matchmaking', async () => {
  const { room } = fakeRoom();
  let attempts = 0;
  const client = {
    auth: { token: '' },
    joinOrCreate: async () => {
      attempts += 1;
      if (attempts === 1) throw Object.assign(new Error('started'), { code: 403 });
      return room;
    },
  } as unknown as Client;

  const connection = await connectSledRun('ticket', () => true, 'ws://test', () => client, 20);
  assert.equal(attempts, 2);
  await connection.disconnect();
});

test('sled client leaves immediately when a stale scene reconnects', async () => {
  const { room, callbacks, leaves } = fakeRoom();
  const client = {
    auth: { token: '' },
    joinOrCreate: async () => room,
  } as unknown as Client;
  let current = true;
  await connectSledRun('ticket', () => current, 'ws://test', () => client, 20);

  current = false;
  callbacks.reconnect!();
  await Promise.resolve();

  assert.equal(room.reconnection.enabled, false);
  assert.equal(leaves(), 1);
});

test('collisions called while dropped are held and sent once the room is back', async () => {
  const { room, callbacks, sent } = fakeRoom();
  const client = {
    auth: { token: '' },
    joinOrCreate: async () => room,
  } as unknown as Client;
  const connection = await connectSledRun('ticket', () => true, 'ws://test', () => client, 20);

  connection.sendHit('rock-1');
  assert.deepEqual(sent, [{ type: 'sled:hit', payload: { itemId: 'rock-1' } }]);

  // The room's own outgoing queue is switched off, so a report made across a drop
  // would be lost — and with it the bump the rest of the race is meant to see.
  callbacks.drop!();
  connection.sendHit('ice-2');
  connection.sendHit('ice-2');
  assert.equal(sent.length, 1);

  callbacks.reconnect!();
  assert.deepEqual(sent.slice(1), [{ type: 'sled:hit', payload: { itemId: 'ice-2' } }]);

  await connection.disconnect();
});

test('a claim the server would not keep comes back to the client that made it', async () => {
  const { room, messageHandlers, sent } = fakeRoom();
  const client = {
    auth: { token: '' },
    joinOrCreate: async () => room,
  } as unknown as Client;
  const connection = await connectSledRun('ticket', () => true, 'ws://test', () => client, 20);
  const rejected: string[] = [];
  const stop = connection.onHitRejected((itemId) => rejected.push(itemId));

  messageHandlers['sled:hit:rejected']!({ itemId: 'ice-0' });
  messageHandlers['sled:hit:rejected']!({});
  assert.deepEqual(rejected, ['ice-0']);

  stop();
  messageHandlers['sled:hit:rejected']!({ itemId: 'rock-3' });
  assert.deepEqual(rejected, ['ice-0']);
  assert.deepEqual(sent, []);

  await connection.disconnect();
});
