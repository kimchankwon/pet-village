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

test('new sessions publish the signed saved Town pose before the first client move', () => {
  const room = new TownRoom();
  room.setState(new TownState());
  room.onJoin({ sessionId: 'session-a' } as never, {}, {
    sub: 'user-a',
    displayName: 'Daniel',
    petName: 'Mochi',
    petSpecies: 'puffle-blue',
    penguinColor: 'green',
    townPosition: { x: 740, y: 510, facing: 'side' },
    protocolVersion: 5,
    jti: 'ticket-a',
    iat: 1,
    exp: 2,
    iss: 'pet-village-convex',
    aud: 'pet-village-multiplayer',
  });

  const player = room.state.players.get('session-a')!;
  assert.deepEqual(
    { x: player.x, y: player.y, petX: player.petX, petY: player.petY, facing: player.facing },
    { x: 740, y: 510, petX: 710, petY: 520, facing: 'side' },
  );
});

test('Town room owns and advances the shared NPC simulation', () => {
  const room = new TownRoom();
  room.setState(new TownState());
  let tick: ((delta: number) => void) | undefined;
  let intervalMs = 0;
  room.onMessage = (() => undefined) as never;
  room.setSimulationInterval = ((callback: (delta: number) => void, delay: number) => {
    tick = callback;
    intervalMs = delay;
  }) as never;

  room.onCreate();
  const before = room.state.npcs.get('bongbongee')!.x;
  tick!(100);

  assert.equal(intervalMs, 100);
  assert.equal(room.state.npcs.size, 5);
  assert.notEqual(room.state.npcs.get('bongbongee')!.x, before);
});

test('reserves dropped players for reconnection without publishing stale presence', () => {
  const room = roomWithPlayer();
  let graceSeconds = 0;
  room.allowReconnection = ((_client: unknown, seconds: number) => {
    graceSeconds = seconds;
    return Promise.resolve({});
  }) as never;
  const player = room.state.players.get('session-a')!;
  Object.assign(player, { active: false, activity: 'fishing', moving: true });

  room.onDrop({ sessionId: 'session-a' } as never);

  assert.equal(graceSeconds, 20);
  assert.equal(room.state.players.has('session-a'), true);
  assert.deepEqual(
    { active: player.active, activity: player.activity, moving: player.moving },
    { active: false, activity: '', moving: false },
  );
});

test('removes player state only when the client finally leaves', () => {
  const room = roomWithPlayer();
  room.onLeave({ sessionId: 'session-a' } as never);
  assert.equal(room.state.players.has('session-a'), false);
});

test('initial activation does not turn a late first move into a Town re-entry', () => {
  const room = roomWithPlayer();
  const corrections: unknown[] = [];
  const client = {
    sessionId: 'session-a',
    send: (_type: string, payload: unknown) => corrections.push(payload),
  } as never;
  const player = room.state.players.get('session-a')!;

  (room as any).setActive(client, true);
  (room as any).move(client, {
    x: 900, y: 650, petX: 870, petY: 660, facing: 'down', moving: true, seq: 1,
  });

  assert.equal(player.x, 900);
  assert.equal(player.y, 650);
  assert.equal(player.seq, 1);
  assert.deepEqual(corrections, []);
});

test('same-scene activation preserves the server-authoritative Town position', () => {
  const room = roomWithPlayer();
  const client = { sessionId: 'session-a' } as never;
  const player = room.state.players.get('session-a')!;
  Object.assign(player, {
    active: false,
    scene: 'town',
    x: 700,
    y: 480,
    petX: 670,
    petY: 490,
  });

  (room as any).setActive(client, {
    active: true,
    scene: 'town',
    pose: { x: 740, y: 510, petX: 710, petY: 520, facing: 'down', moving: false },
  });

  assert.equal(player.active, true);
  assert.deepEqual(
    { x: player.x, y: player.y, petX: player.petX, petY: player.petY },
    { x: 700, y: 480, petX: 670, petY: 490 },
  );
});

test('server publishes validated game activity and clears it on Town re-entry', () => {
  const room = roomWithPlayer();
  const client = { sessionId: 'session-a' } as never;
  const player = room.state.players.get('session-a')!;
  Object.assign(player, { active: true, moving: true });

  (room as any).setActivity(client, 'fishing');
  assert.equal(player.activity, 'fishing');
  assert.equal(player.active, false);
  assert.equal(player.moving, false);

  (room as any).setActivity(client, 'not-a-game');
  assert.equal(player.activity, 'fishing');

  (room as any).setActive(client, true);
  assert.equal(player.activity, '');
  assert.equal(player.active, true);
});

test('server rejects movement while a player is inactive or playing a game', () => {
  const room = roomWithPlayer();
  const corrections: unknown[] = [];
  const client = {
    sessionId: 'session-a',
    send: (_type: string, payload: unknown) => corrections.push(payload),
  } as never;
  const player = room.state.players.get('session-a')!;
  Object.assign(player, { x: 320, y: 240, petX: 290, petY: 250, active: true, moving: true });

  (room as any).setActivity(client, 'fishing');
  (room as any).move(client, {
    x: 320, y: 240, petX: 290, petY: 250, facing: 'side', moving: true, seq: 1,
  });

  assert.deepEqual(
    { x: player.x, y: player.y, petX: player.petX, petY: player.petY, seq: player.seq, moving: player.moving },
    { x: 320, y: 240, petX: 290, petY: 250, seq: 0, moving: false },
  );
  assert.deepEqual(corrections, [{ scene: 'town', x: 320, y: 240, petX: 290, petY: 250 }]);
});

test('same-session reconnect restores Town presence without granting spawn re-entry', () => {
  const room = roomWithPlayer();
  room.allowReconnection = (() => Promise.resolve({})) as never;
  const corrections: unknown[] = [];
  const client = {
    sessionId: 'session-a',
    send: (_type: string, payload: unknown) => corrections.push(payload),
  } as never;
  const player = room.state.players.get('session-a')!;
  Object.assign(player, {
    active: true,
    seq: 10,
    x: 320,
    y: 240,
    petX: 290,
    petY: 250,
    updatedAt: Date.now(),
  });

  room.onDrop(client);
  (room as any).onReconnect(client);
  (room as any).setActive(client, true);
  (room as any).setActivity(client, '');
  (room as any).move(client, {
    x: 322, y: 240, petX: 292, petY: 250, facing: 'side', moving: true, seq: 11,
  });

  assert.deepEqual(
    { active: player.active, x: player.x, y: player.y, seq: player.seq },
    { active: true, x: 322, y: 240, seq: 11 },
  );
  assert.deepEqual(corrections, []);
});

test('same-session reconnect preserves a non-Town scene and accepts nearby movement there', () => {
  const room = roomWithPlayer();
  room.allowReconnection = (() => Promise.resolve({})) as never;
  const corrections: unknown[] = [];
  const client = {
    sessionId: 'session-a',
    send: (_type: string, payload: unknown) => corrections.push(payload),
  } as never;
  const player = room.state.players.get('session-a')!;
  Object.assign(player, {
    active: true, scene: 'shore', seq: 10, x: 432, y: 300, petX: 402, petY: 310, updatedAt: Date.now(),
  });

  room.onDrop(client);
  room.onReconnect(client);
  (room as any).setActive(client, { active: true, scene: 'shore' });
  (room as any).move(client, {
    scene: 'shore', x: 434, y: 300, petX: 404, petY: 310, facing: 'side', moving: true, seq: 11,
  });

  assert.deepEqual(
    { active: player.active, scene: player.scene, x: player.x, y: player.y, seq: player.seq },
    { active: true, scene: 'shore', x: 434, y: 300, seq: 11 },
  );
  assert.deepEqual(corrections, []);
});

test('reconnect scene changes reset cross-scene coordinates and retain one destination spawn grant', () => {
  const room = roomWithPlayer();
  room.allowReconnection = (() => Promise.resolve({})) as never;
  const corrections: unknown[] = [];
  const client = {
    sessionId: 'session-a',
    send: (_type: string, payload: unknown) => corrections.push(payload),
  } as never;
  const player = room.state.players.get('session-a')!;
  Object.assign(player, {
    active: true, scene: 'town', seq: 10, x: 900, y: 700, petX: 870, petY: 710, updatedAt: Date.now(),
  });

  room.onDrop(client);
  room.onReconnect(client);
  (room as any).setActive(client, { active: true, scene: 'shore' });
  assert.deepEqual(
    { scene: player.scene, x: player.x, y: player.y },
    { scene: 'shore', x: 12 * 48, y: 2.2 * 48 },
  );

  (room as any).move(client, {
    scene: 'shore', x: 12 * 48, y: 8.5 * 48, petX: 12 * 48 - 30, petY: 8.5 * 48 + 10, facing: 'down', moving: false, seq: 11,
  });
  assert.deepEqual(
    { scene: player.scene, x: player.x, y: player.y, seq: player.seq },
    { scene: 'shore', x: 12 * 48, y: 8.5 * 48, seq: 11 },
  );
  assert.deepEqual(corrections, []);
});

test('world-scene activation authorizes one move at an approved destination spawn', () => {
  const room = roomWithPlayer();
  const corrections: unknown[] = [];
  const client = {
    sessionId: 'session-a',
    send: (_type: string, payload: unknown) => corrections.push(payload),
  } as never;
  const player = room.state.players.get('session-a')!;
  Object.assign(player, { active: true, scene: 'town', seq: 10, x: 768, y: 696, updatedAt: Date.now() });

  (room as any).setActive(client, false);
  (room as any).setActive(client, {
    active: true,
    scene: 'shore',
    pose: { x: 576, y: 408, petX: 546, petY: 418, facing: 'down', moving: false },
  });
  assert.deepEqual(
    { scene: player.scene, x: player.x, y: player.y },
    { scene: 'shore', x: 576, y: 408 },
  );
  (room as any).move(client, {
    scene: 'shore', x: 576, y: 408, petX: 546, petY: 418, facing: 'down', moving: false, seq: 11,
  });

  assert.deepEqual({ scene: player.scene, x: player.x, y: player.y, seq: player.seq }, { scene: 'shore', x: 576, y: 408, seq: 11 });
  assert.deepEqual(corrections, []);

  (room as any).move(client, {
    scene: 'east-green', x: 96, y: 360, petX: 66, petY: 370, facing: 'down', moving: false, seq: 12,
  });
  assert.equal(player.scene, 'shore');
  assert.deepEqual(corrections, [{ scene: 'shore', x: 576, y: 408, petX: 546, petY: 418 }]);
});

test('server rejects world transitions that do not follow a map portal', () => {
  const room = roomWithPlayer();
  const corrections: unknown[] = [];
  const client = {
    sessionId: 'session-a',
    send: (_type: string, payload: unknown) => corrections.push(payload),
  } as never;
  const player = room.state.players.get('session-a')!;
  Object.assign(player, { active: true, scene: 'shore', seq: 10, x: 576, y: 300, petX: 546, petY: 310 });

  (room as any).setActive(client, { active: true, scene: 'east-green' });

  assert.deepEqual(
    { active: player.active, scene: player.scene, x: player.x, y: player.y },
    { active: true, scene: 'shore', x: 576, y: 300 },
  );
  assert.deepEqual(corrections, [{
    scene: 'shore', x: 576, y: 300, petX: 546, petY: 310, recoverScene: true,
  }]);
});

test('inactive to active authorizes exactly one approved Town re-entry spawn', () => {
  const room = roomWithPlayer();
  const corrections: unknown[] = [];
  const client = {
    sessionId: 'session-a',
    send: (_type: string, payload: unknown) => corrections.push(payload),
  } as never;
  const player = room.state.players.get('session-a')!;
  Object.assign(player, { active: true, seq: 10, x: 1200, y: 800, updatedAt: Date.now() });

  (room as any).setActive(client, false);
  (room as any).setActive(client, true);
  // House spawn on the expanded ice town map.
  (room as any).move(client, {
    x: 768, y: 345.6, petX: 738, petY: 355.6, facing: 'down', moving: false, seq: 11,
  });
  assert.equal(player.x, 768);
  assert.equal(player.y, 345.6);
  assert.equal(player.seq, 11);
  assert.deepEqual(corrections, []);

  (room as any).move(client, {
    x: 76.8, y: 504, petX: 50, petY: 514, facing: 'down', moving: false, seq: 12,
  });
  assert.equal(player.x, 768);
  assert.equal(corrections.length, 1);
});
