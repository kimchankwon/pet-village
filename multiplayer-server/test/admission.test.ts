import test from 'node:test';
import assert from 'node:assert/strict';
import { SignJWT } from 'jose';
import {
  PROTOCOL_VERSION,
  TICKET_AUDIENCE,
  TICKET_ISSUER,
} from '@pet-village/multiplayer-protocol';
import { verifyAdmission } from '../src/TownRoom.ts';
import { SledRunRoom } from '../src/SledRunRoom.ts';

const secretValue = 'local-test-secret-at-least-32-characters-long';
const secret = new TextEncoder().encode(secretValue);

async function ticket(overrides: {
  issuer?: string;
  lifetime?: string;
  penguinColor?: string;
  protocolVersion?: number;
  subject?: string;
  displayName?: string;
  petName?: string;
  petSpecies?: string;
  equippedAccessories?: { headLeft?: string; headRight?: string; body?: string; extra?: string };
  townPosition?: { x: number; y: number; facing: 'up' | 'down' | 'side' };
} = {}) {
  return new SignJWT({
    displayName: overrides.displayName ?? 'Alice',
    petName: overrides.petName ?? 'Mame',
    petSpecies: overrides.petSpecies ?? 'mametchi',
    penguinColor: overrides.penguinColor ?? 'blue',
    equippedAccessories: overrides.equippedAccessories,
    townPosition: overrides.townPosition,
    protocolVersion: overrides.protocolVersion ?? PROTOCOL_VERSION,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer(overrides.issuer ?? TICKET_ISSUER)
    .setAudience(TICKET_AUDIENCE)
    .setSubject(overrides.subject ?? 'user-a')
    .setJti(crypto.randomUUID())
    .setIssuedAt()
    .setExpirationTime(overrides.lifetime ?? '60s')
    .sign(secret);
}

test('admission validates issuer, audience, lifetime, and server secret', async () => {
  process.env.MULTIPLAYER_TICKET_SECRET = secretValue;
  const valid = await ticket();
  assert.equal((await verifyAdmission(valid)).sub, 'user-a');
  // v9 world geometry is not compatible with older clients — exact version only.
  assert.equal((await verifyAdmission(await ticket({ protocolVersion: PROTOCOL_VERSION }))).sub, 'user-a');
  await assert.rejects(verifyAdmission(await ticket({ protocolVersion: 8 })));
  await assert.rejects(verifyAdmission(await ticket({ protocolVersion: 7 })));
  await assert.rejects(verifyAdmission(await ticket({ protocolVersion: 6 })));
  await assert.rejects(verifyAdmission(await ticket({ protocolVersion: 5 })));
  // Tickets are short-lived bearer credentials; reconnecting may reuse one until expiry.
  assert.equal((await verifyAdmission(valid)).sub, 'user-a');
  await assert.rejects(verifyAdmission(await ticket({ issuer: 'wrong' })));
  await assert.rejects(verifyAdmission(await ticket({ lifetime: '5m' })));
  await assert.rejects(verifyAdmission(await ticket({ penguinColor: 'ultraviolet' })));
  const saved = await verifyAdmission(await ticket({ townPosition: { x: 740, y: 510, facing: 'side' } }));
  assert.deepEqual(saved.townPosition, { x: 740, y: 510, facing: 'side' });
  const invalidPosition = await verifyAdmission(
    await ticket({ townPosition: { x: 9_999, y: 510, facing: 'side' } }),
  );
  assert.equal(invalidPosition.townPosition, undefined);
});

test('profile refresh applies same-user ticket claims without replacing authoritative position', async () => {
  process.env.MULTIPLAYER_TICKET_SECRET = secretValue;
  const { TownRoom } = await import('../src/TownRoom.ts');
  const { PlayerState } = await import('@pet-village/multiplayer-protocol');
  const room = new TownRoom();
  const player = new PlayerState();
  Object.assign(player, {
    userId: 'user-a', displayName: 'Alice', petName: 'Mame', petSpecies: 'mametchi',
    penguinColor: 'blue', scene: 'shore', x: 432, y: 300, petX: 410, petY: 310, seq: 17,
  });
  room.state.players.set('session-a', player);
  const replies: unknown[] = [];
  const client = { sessionId: 'session-a', send: (_type: string, payload: unknown) => replies.push(payload) } as never;
  type RoomInternals = {
    refreshProfile: (_client: never, payload: { ticket: string; requestId?: string }) => Promise<void>;
    lastProfileRefreshAt: Map<string, number>;
  };
  const internals = room as unknown as RoomInternals;

  await internals.refreshProfile(client, {
    requestId: 'profile-1',
    ticket: await ticket({
      displayName: 'Alicia', petName: 'Kuchi', petSpecies: 'kuchipatchi', penguinColor: 'red',
      equippedAccessories: { headLeft: 'aqua-clip', body: 'diamond-tee' },
    }),
  });

  assert.deepEqual(
    { displayName: player.displayName, petName: player.petName, petSpecies: player.petSpecies, penguinColor: player.penguinColor },
    { displayName: 'Alicia', petName: 'Kuchi', petSpecies: 'kuchipatchi', penguinColor: 'red' },
  );
  assert.deepEqual(
    { headLeft: player.accessoryHeadLeft, headRight: player.accessoryHeadRight, body: player.accessoryBody, extra: player.accessoryExtra },
    { headLeft: 'aqua-clip', headRight: '', body: 'diamond-tee', extra: '' },
  );
  assert.deepEqual(
    { scene: player.scene, x: player.x, y: player.y, petX: player.petX, petY: player.petY, seq: player.seq },
    { scene: 'shore', x: 432, y: 300, petX: 410, petY: 310, seq: 17 },
  );
  assert.deepEqual(replies, [{ ok: true, requestId: 'profile-1' }]);

  // An immediate refresh is rate-limited and tells the client when to retry.
  await internals.refreshProfile(client, {
    ticket: await ticket({ subject: 'user-b', displayName: 'Mallory' }),
  });
  assert.equal(player.displayName, 'Alicia');
  assert.equal((replies[1] as { ok: boolean }).ok, false);
  assert.ok(((replies[1] as { retryAfterMs?: number }).retryAfterMs ?? 0) > 0);
  internals.lastProfileRefreshAt.clear();
  // Once outside the rate limit, a mismatched ticket subject is rejected.
  await internals.refreshProfile(client, {
    ticket: await ticket({ subject: 'user-b', displayName: 'Mallory' }),
  });
  assert.deepEqual(replies[2], { ok: false });
});

test('sled room and Town both require the current protocol after the v9 map expand', async () => {
  process.env.MULTIPLAYER_TICKET_SECRET = secretValue;
  const room = new SledRunRoom();
  // Older protocol tickets are refused at admission (map geometry is not compatible).
  await assert.rejects(
    room.onAuth({} as never, undefined, { token: await ticket({ protocolVersion: PROTOCOL_VERSION - 1 }) }),
    (error: unknown) =>
      error instanceof Error &&
      (error.message.includes('requires protocol') || error.message.includes('Invalid or expired')),
  );
  const claims = await room.onAuth({} as never, undefined, { token: await ticket() });
  assert.equal(claims.protocolVersion, PROTOCOL_VERSION);
});