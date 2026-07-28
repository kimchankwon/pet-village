import assert from 'node:assert/strict';
import { Client } from '@colyseus/sdk';
import { SignJWT } from 'jose';
import {
  PROTOCOL_VERSION,
  ROOM_NAME,
  TICKET_AUDIENCE,
  TICKET_ISSUER,
  WORLD_SCENE_SPAWNS,
  WORLD_SCENES,
  type ProfileRefreshResult,
  type TownState,
} from '@pet-village/multiplayer-protocol';

const url = process.env.MULTIPLAYER_SMOKE_URL ?? 'ws://127.0.0.1:2567';
const secretValue = process.env.MULTIPLAYER_TICKET_SECRET;
if (!secretValue) throw new Error('MULTIPLAYER_TICKET_SECRET is required');
const secret = new TextEncoder().encode(secretValue);

async function ticket(
  userId: string,
  displayName: string,
  petName: string,
  penguinColor: string,
  townPosition?: { x: number; y: number; facing: 'up' | 'down' | 'side' },
) {
  return new SignJWT({
    displayName,
    petName,
    petSpecies: 'mametchi',
    penguinColor,
    townPosition,
    protocolVersion: PROTOCOL_VERSION,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer(TICKET_ISSUER)
    .setAudience(TICKET_AUDIENCE)
    .setSubject(userId)
    .setJti(crypto.randomUUID())
    .setIssuedAt()
    .setExpirationTime('60s')
    .sign(secret);
}

async function waitFor(check: () => boolean, description: string, timeoutMs = 3_000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Timed out waiting for ${description}`);
}

async function join(token: string) {
  const client = new Client(url);
  client.auth.token = token;
  return client.joinOrCreate<TownState>(ROOM_NAME);
}

const rooms: Awaited<ReturnType<typeof join>>[] = [];
try {
  const roomA = await join(await ticket('smoke-a', 'Smoke Alice', 'Mochi', 'blue'));
  rooms.push(roomA);
  const roomB = await join(await ticket('smoke-b', 'Smoke Bob', 'Mame', 'green'));
  rooms.push(roomB);
  await waitFor(() => roomA.state.players.size === 2 && roomB.state.players.size === 2, 'two synchronized players');
  roomB.send('active', { active: true, scene: 'town' });
  await waitFor(() => roomA.state.players.get(roomB.sessionId)?.active === true, 'target activation');

  let seq = 0;
  // Exercise every spoke through the authoritative Town hub, matching the
  // actual portal graph rather than teleporting directly between world scenes.
  const smokeSceneOrder = WORLD_SCENES
    .filter((scene) => scene !== 'town')
    .flatMap((scene) => [scene, 'town'] as const);
  for (const scene of smokeSceneOrder) {
    const spawn = WORLD_SCENE_SPAWNS[scene][0];
    roomA.send('active', { active: true, scene });
    await waitFor(
      () => roomB.state.players.get(roomA.sessionId)?.scene === scene,
      `${scene} activation`,
    );
    roomA.send('move', {
      scene,
      x: spawn.x,
      y: spawn.y,
      petX: spawn.x - 30,
      petY: spawn.y + 10,
      facing: 'side',
      moving: false,
      seq: ++seq,
    });
    await waitFor(
      () => {
        const player = roomB.state.players.get(roomA.sessionId);
        return player?.scene === scene && Math.abs(player.x - spawn.x) < 0.01 && Math.abs(player.y - spawn.y) < 0.01;
      },
      `${scene} presence`,
    ).catch((error) => {
      const player = roomB.state.players.get(roomA.sessionId);
      throw new Error(`${String(error)}; observed ${JSON.stringify(player?.toJSON?.() ?? player)}`);
    });
  }

  let profileAck: ProfileRefreshResult | undefined;
  roomA.onMessage('profileRefreshed', (result: ProfileRefreshResult) => {
    profileAck = result;
  });
  const requestId = `smoke:${crypto.randomUUID()}`;
  roomA.send('profile', {
    ticket: await ticket('smoke-a', 'Smoke Alicia', 'Kuchi', 'red'),
    requestId,
  });
  await waitFor(() => profileAck !== undefined, 'profile refresh acknowledgement');
  assert.deepEqual(profileAck, { ok: true, requestId });
  await waitFor(
    () => {
      const player = roomB.state.players.get(roomA.sessionId);
      return player?.displayName === 'Smoke Alicia' && player.petName === 'Kuchi' && player.penguinColor === 'red';
    },
    'live profile refresh',
  );

  roomA.send('wave', { targetSessionId: roomB.sessionId });
  await waitFor(
    () => roomB.state.players.get(roomA.sessionId)?.waveTarget === roomB.sessionId,
    'directed wave replication',
  );
  assert.ok(roomB.state.players.get(roomA.sessionId)?.waveId);

  await roomB.leave();
  rooms.splice(rooms.indexOf(roomB), 1);
  await waitFor(() => !roomA.state.players.has(roomB.sessionId), 'immediate disconnect removal');

  const roomC = await join(await ticket(
    'smoke-c',
    'Smoke Carol',
    'Pochi',
    'purple',
    { x: 740, y: 510, facing: 'side' },
  ));
  rooms.push(roomC);
  await waitFor(() => roomC.state.players?.has(roomC.sessionId) === true, 'saved-position join');
  const restored = roomC.state.players.get(roomC.sessionId)!;
  assert.deepEqual(
    { x: restored.x, y: restored.y, facing: restored.facing },
    { x: 740, y: 510, facing: 'side' },
  );

  console.log(`multiplayer world smoke passed: ${WORLD_SCENES.join(', ')}`);
} finally {
  await Promise.allSettled(rooms.map((room) => room.leave()));
}
