import { Client } from '@colyseus/sdk';
import { SignJWT } from 'jose';

const secret = new TextEncoder().encode('local-sled-smoke-secret-not-production-123456');
async function ticket(id: string, color: string, protocolVersion = 4) {
  return new SignJWT({
    displayName: id, petName: `${id}-pet`, petSpecies: 'dog', penguinColor: color, protocolVersion,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer('pet-village-convex')
    .setAudience('pet-village-multiplayer')
    .setSubject(`user-${id}`)
    .setJti(crypto.randomUUID()).setIssuedAt().setExpirationTime('60s').sign(secret);
}
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const a = new Client('ws://127.0.0.1:2765');
const b = new Client('ws://127.0.0.1:2765');
a.auth.token = await ticket('Alice', 'blue');
b.auth.token = await ticket('Bob', 'red');
const roomA = await a.joinOrCreate('sled_run');
const roomB = await b.joinOrCreate('sled_run');
await wait(150);
if (roomA.roomId !== roomB.roomId || roomA.state.racers.size !== 2) throw new Error('shared lobby failed');

let duplicateRejected = false;
const duplicate = new Client('ws://127.0.0.1:2765');
duplicate.auth.token = await ticket('Alice', 'blue');
try { await duplicate.joinOrCreate('sled_run'); } catch { duplicateRejected = true; }
if (!duplicateRejected) throw new Error('duplicate user was admitted');

roomA.send('sled:start');
await wait(100);
if (roomA.state.phase !== 'countdown') throw new Error(`expected countdown, got ${roomA.state.phase}`);
roomB.send('sled:input', { steering: 1, seq: 1 });
await wait(100);
if (roomA.state.racers.get(roomB.sessionId)?.inputSeq !== 1) throw new Error('initial input failed');

const reconnected = new Promise<void>((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error('reconnect timed out')), 8_000);
  roomB.onReconnect(() => { clearTimeout(timeout); resolve(); });
});
await wait(5_100);
roomB.connection.close();
await reconnected;
roomB.send('sled:input', { steering: -1, seq: 2 });
await wait(150);
const bob = roomA.state.racers.get(roomB.sessionId);
if (bob?.inputSeq !== 2 || bob.steering !== -1) throw new Error('post-reconnect input failed');

console.log(JSON.stringify({ roomId: roomA.roomId, racers: roomA.state.racers.size, duplicateRejected, reconnected: true, inputSeq: bob.inputSeq }));
roomA.reconnection.enabled = false;
roomB.reconnection.enabled = false;
await Promise.all([roomA.leave(), roomB.leave()]);
