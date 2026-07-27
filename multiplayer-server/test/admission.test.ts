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

async function ticket(overrides: { issuer?: string; lifetime?: string; penguinColor?: string; protocolVersion?: number } = {}) {
  return new SignJWT({
    displayName: 'Alice',
    petName: 'Mame',
    petSpecies: 'mametchi',
    penguinColor: overrides.penguinColor ?? 'blue',
    protocolVersion: overrides.protocolVersion ?? PROTOCOL_VERSION,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer(overrides.issuer ?? TICKET_ISSUER)
    .setAudience(TICKET_AUDIENCE)
    .setSubject('user-a')
    .setJti(crypto.randomUUID())
    .setIssuedAt()
    .setExpirationTime(overrides.lifetime ?? '60s')
    .sign(secret);
}

test('admission validates issuer, audience, lifetime, and server secret', async () => {
  process.env.MULTIPLAYER_TICKET_SECRET = secretValue;
  const valid = await ticket();
  assert.equal((await verifyAdmission(valid)).sub, 'user-a');
  assert.equal((await verifyAdmission(await ticket({ protocolVersion: 2 }))).sub, 'user-a');
  assert.equal((await verifyAdmission(await ticket({ protocolVersion: 3 }))).sub, 'user-a');
  await assert.rejects(verifyAdmission(await ticket({ protocolVersion: 1 })));
  // Tickets are short-lived bearer credentials; reconnecting may reuse one until expiry.
  assert.equal((await verifyAdmission(valid)).sub, 'user-a');
  await assert.rejects(verifyAdmission(await ticket({ issuer: 'wrong' })));
  await assert.rejects(verifyAdmission(await ticket({ lifetime: '5m' })));
  await assert.rejects(verifyAdmission(await ticket({ penguinColor: 'ultraviolet' })));
});

test('sled room requires the current protocol while Town keeps rolling compatibility', async () => {
  process.env.MULTIPLAYER_TICKET_SECRET = secretValue;
  const room = new SledRunRoom();
  await assert.rejects(
    room.onAuth({} as never, undefined, { token: await ticket({ protocolVersion: 3 }) }),
    (error: unknown) => error instanceof Error && error.message.includes('requires protocol'),
  );
  const claims = await room.onAuth({} as never, undefined, { token: await ticket() });
  assert.equal(claims.protocolVersion, PROTOCOL_VERSION);
});
