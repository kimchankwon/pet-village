import { Client, type Room } from '@colyseus/sdk';
import { PROTOCOL_VERSION } from '@pet-village/multiplayer-protocol';
import { SignJWT } from 'jose';

// Run the multiplayer server with the same MULTIPLAYER_TICKET_SECRET, then run
// `MULTIPLAYER_TICKET_SECRET=... npm run smoke:sled`; override SLED_SMOKE_URL as needed.

const endpoint = process.env.SLED_SMOKE_URL ?? 'ws://127.0.0.1:2765';
const ticketSecret = process.env.MULTIPLAYER_TICKET_SECRET;
if (!ticketSecret) throw new Error('MULTIPLAYER_TICKET_SECRET is required for the Sled smoke test');
const secret = new TextEncoder().encode(ticketSecret);
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function ticket(id: string, color: string, protocolVersion = PROTOCOL_VERSION) {
  return new SignJWT({
    displayName: id, petName: `${id}-pet`, petSpecies: 'dog', penguinColor: color, protocolVersion,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer('pet-village-convex')
    .setAudience('pet-village-multiplayer')
    .setSubject(`user-${id}`)
    .setJti(crypto.randomUUID()).setIssuedAt().setExpirationTime('60s').sign(secret);
}

let roomA: Room | undefined;
let roomB: Room | undefined;
let duplicateRoom: Room | undefined;
try {
  const a = new Client(endpoint);
  const b = new Client(endpoint);
  a.auth.token = await ticket('Alice', 'blue');
  b.auth.token = await ticket('Bob', 'red');
  roomA = await a.joinOrCreate('sled_run');
  roomB = await b.joinOrCreate('sled_run');
  await wait(150);
  if (roomA.roomId !== roomB.roomId || roomA.state.racers.size !== 2) throw new Error('shared lobby failed');

  const duplicate = new Client(endpoint);
  duplicate.auth.token = await ticket('Alice', 'blue');
  let duplicateCode: number | undefined;
  try {
    duplicateRoom = await duplicate.joinOrCreate('sled_run');
  } catch (error) {
    duplicateCode = typeof error === 'object' && error !== null && 'code' in error
      ? Number((error as { code?: unknown }).code)
      : undefined;
  }
  if (duplicateCode !== 409) throw new Error(`duplicate user returned ${duplicateCode ?? 'no error'}, expected 409`);

  roomA.send('sled:start');
  await wait(100);
  if (roomA.state.phase !== 'countdown') throw new Error(`expected countdown, got ${roomA.state.phase}`);
  roomB.send('sled:input', { steering: 1, seq: 1 });
  await wait(100);
  if (roomA.state.racers.get(roomB.sessionId)?.inputSeq !== 1) throw new Error('initial input failed');

  const reconnected = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('reconnect timed out')), 8_000);
    roomB!.onReconnect(() => { clearTimeout(timeout); resolve(); });
  });
  await wait(5_100);
  roomB.connection.close();
  await reconnected;
  roomB.send('sled:input', { steering: -1, seq: 2 });
  await wait(150);
  const bob = roomA.state.racers.get(roomB.sessionId);
  if (bob?.inputSeq !== 2 || bob.steering !== -1) throw new Error('post-reconnect input failed');

  console.log(JSON.stringify({
    roomId: roomA.roomId,
    racers: roomA.state.racers.size,
    duplicateCode,
    reconnected: true,
    inputSeq: bob.inputSeq,
  }));
} finally {
  const rooms = [duplicateRoom, roomA, roomB].filter((room): room is Room => Boolean(room));
  for (const room of rooms) room.reconnection.enabled = false;
  await Promise.allSettled(rooms.map((room) => room.leave()));
}
