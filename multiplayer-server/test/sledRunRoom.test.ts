import test from 'node:test';
import assert from 'node:assert/strict';
import { SledRunState, type AdmissionClaims } from '@pet-village/multiplayer-protocol';
import { SledRunRoom } from '../src/SledRunRoom.ts';

const claims = (id: string): AdmissionClaims => ({
  sub: `user-${id}`, jti: `jti-${id}`, iss: 'pet-village-convex', aud: 'pet-village-multiplayer',
  displayName: id, petName: 'Puff', petSpecies: 'dog',
  penguinColor: id === 'one' ? 'blue' : 'pink', protocolVersion: 4, iat: 1, exp: 60,
});

function setup() {
  const room = new SledRunRoom();
  room.setState(new SledRunState());
  const handlers = new Map<string, (client: any, payload: any) => void>();
  let tick: ((delta: number) => void) | undefined;
  let unlocks = 0;
  let reconnections = 0;
  room.onMessage = ((type: string, handler: (client: any, payload: any) => void) => handlers.set(type, handler)) as never;
  room.setSimulationInterval = ((fn: (delta: number) => void) => { tick = fn; }) as never;
  room.lock = (() => Promise.resolve()) as never;
  room.unlock = (() => { unlocks += 1; return Promise.resolve(); }) as never;
  room.allowReconnection = (() => { reconnections += 1; return new Promise(() => undefined); }) as never;
  room.onCreate();
  return {
    room,
    handlers,
    tick: () => tick!(50),
    unlocks: () => unlocks,
    reconnections: () => reconnections,
  };
}

test('sled room joins authenticated racers and routes leader commands', () => {
  const { room, handlers } = setup();
  const one = { sessionId: 'one' } as never;
  const two = { sessionId: 'two' } as never;
  room.onJoin(one, undefined, claims('one'));
  room.onJoin(two, undefined, claims('two'));
  assert.equal(room.state.leader, 'one');
  assert.equal(room.state.racers.size, 2);
  handlers.get('sled:difficulty')!(two, 'hard');
  assert.equal(room.state.difficulty, 'easy');
  handlers.get('sled:difficulty')!(one, 'hard');
  handlers.get('sled:start')!(one, undefined);
  assert.equal(room.state.difficulty, 'hard');
  assert.equal(room.state.phase, 'countdown');
});

test('sled room removes racers and transfers leadership on final leave', () => {
  const { room } = setup();
  const one = { sessionId: 'one' } as never;
  const two = { sessionId: 'two' } as never;
  room.onJoin(one, undefined, claims('one'));
  room.onJoin(two, undefined, claims('two'));
  room.onLeave(one);
  assert.equal(room.state.leader, 'two');
  room.onLeave(two);
  assert.equal(room.state.racers.size, 0);
  assert.equal(room.state.phase, 'lobby');
});

test('sled room rejects a racer admitted after matchmaking already started', () => {
  const { room } = setup();
  room.onJoin({ sessionId: 'one' } as never, undefined, claims('one'));
  room.state.phase = 'racing';
  assert.throws(
    () => room.onJoin({ sessionId: 'two' } as never, undefined, claims('two')),
    /already started/i,
  );
  assert.equal(room.state.racers.size, 1);
});

test('sled room rejects duplicate authenticated users', () => {
  const { room } = setup();
  room.onJoin({ sessionId: 'one' } as never, undefined, claims('one'));
  assert.throws(
    () => room.onJoin({ sessionId: 'duplicate-session' } as never, undefined, claims('one')),
    /already in this Sled Run/i,
  );
  assert.equal(room.state.racers.size, 1);
});

test('sled room unlocks matchmaking after a race finishes', () => {
  const { room, handlers, tick, unlocks } = setup();
  const one = { sessionId: 'one' } as never;
  room.onJoin(one, undefined, claims('one'));
  handlers.get('sled:start')!(one, undefined);
  room.state.phase = 'finished';
  tick();
  tick();
  assert.equal(unlocks(), 1);
});

test('sled room holds a dropped racer seat for reconnection and stops steering', () => {
  const { room, handlers, reconnections } = setup();
  const one = { sessionId: 'one' } as never;
  room.onJoin(one, undefined, claims('one'));
  handlers.get('sled:start')!(one, undefined);
  handlers.get('sled:input')!(one, { steering: 1, seq: 1 });

  room.onDrop(one);

  assert.equal(room.state.racers.get('one')!.steering, 0);
  assert.equal(room.state.racers.size, 1);
  assert.equal(reconnections(), 1);
});

test('sled room reports full lobbies separately from started races', () => {
  const { room } = setup();
  for (const id of ['one', 'two', 'three', 'four']) {
    room.onJoin({ sessionId: id } as never, undefined, claims(id));
  }
  assert.throws(
    () => room.onJoin({ sessionId: 'five' } as never, undefined, claims('five')),
    /lobby is full/i,
  );
});

test('sled room unlocks when the final racer leaves mid-race', () => {
  const { room, handlers, unlocks } = setup();
  const one = { sessionId: 'one' } as never;
  room.onJoin(one, undefined, claims('one'));
  handlers.get('sled:start')!(one, undefined);
  room.state.phase = 'racing';

  room.onLeave(one);

  assert.equal(room.state.phase, 'lobby');
  assert.equal(unlocks(), 1);
});
