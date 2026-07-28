/**
 * Two clients, one real server, and the actual chat-log presence pipeline.
 *
 * The unit tests pin `snapshotRoster` against hand-built schema objects. This
 * checks the thing they cannot: that against a live room, walking between
 * scenes is silent and only a real arrival or departure says anything. That was
 * the bug review caught — the roster being diffed had already been filtered to
 * the scene being drawn, so changing scenes read as leaving the village.
 *
 *   MULTIPLAYER_TICKET_SECRET=... npm run smoke:presence
 *
 * The room outlives any one run of this script, and a player who drops keeps a
 * seat for twenty seconds after it. So nothing here assumes an empty village:
 * every villager it creates is named for this run, and every assertion is about
 * those names only.
 */
import assert from 'node:assert/strict';
import { Client } from '@colyseus/sdk';
import { SignJWT } from 'jose';
import {
  PROTOCOL_VERSION,
  ROOM_NAME,
  TICKET_AUDIENCE,
  TICKET_ISSUER,
  type TownState,
} from '@pet-village/multiplayer-protocol';
import { snapshotRoster } from '../src/systems/multiplayerClient.ts';
import {
  chatLogEntries,
  chatLogText,
  clearChatLog,
  noteChatLogPresence,
  resetChatLogPresence,
} from '../src/systems/chatLog.ts';

const url = process.env.MULTIPLAYER_SMOKE_URL ?? 'ws://127.0.0.1:2567';
const secretValue = process.env.MULTIPLAYER_TICKET_SECRET;
if (!secretValue) throw new Error('MULTIPLAYER_TICKET_SECRET is required');
const secret = new TextEncoder().encode(secretValue);

/** Tags this run's villagers, so a previous run's stragglers are not ours. */
const RUN = crypto.randomUUID().slice(0, 8);
const named = (who: string) => `${who}-${RUN}`;

async function ticket(userId: string, displayName: string) {
  return new SignJWT({
    displayName,
    petName: 'Mochi',
    petSpecies: 'mametchi',
    penguinColor: 'blue',
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

async function join(who: string) {
  const client = new Client(url);
  client.auth.token = await ticket(`sanity-${RUN}-${who}`, named(who));
  return client.joinOrCreate<TownState>(ROOM_NAME);
}

async function waitFor(check: () => boolean, description: string, timeoutMs = 5_000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Timed out waiting for ${description}`);
}

/** The log as the game reads it, narrowed to the villagers this run created. */
const lines = () => chatLogEntries().map(chatLogText).filter((line) => line.includes(RUN));

const rooms: Awaited<ReturnType<typeof join>>[] = [];
try {
  clearChatLog();
  resetChatLogPresence();

  // Alice is the player whose screen we are watching.
  const alice = await join('Alice');
  rooms.push(alice);

  const rosterFor = (room: Awaited<ReturnType<typeof join>>) => snapshotRoster(
    room.state,
    room.sessionId,
    room.state.players.get(room.sessionId)?.userId,
  ).map((row) => row.name);

  /**
   * Exactly what `multiplayerClient.sync()` does on every state change: take an
   * unfiltered roster and hand it to the log.
   */
  const syncAlice = () => {
    // Same guard the real sync() opens with: early state has no player map yet.
    if (!alice.state?.players) return;
    noteChatLogPresence(
      snapshotRoster(alice.state, alice.sessionId, alice.state.players.get(alice.sessionId)?.userId),
      Date.now(),
    );
  };
  alice.onStateChange(syncAlice);

  await waitFor(() => alice.state?.players?.has(alice.sessionId) === true, 'Alice in the room');
  syncAlice();
  assert.deepEqual(lines(), [], 'the first snapshot is a baseline, not a room full of arrivals');
  console.log('✓ Alice arrives: her first snapshot announces nobody');

  // 1. A real arrival.
  const bob = await join('Bob');
  rooms.push(bob);
  await waitFor(() => alice.state.players.has(bob.sessionId), 'Bob visible to Alice');
  syncAlice();
  assert.deepEqual(lines(), [`${named('Bob')} joined the village`], 'a real arrival is announced');
  console.log(`✓ Bob joins: "${named('Bob')} joined the village"`);

  // 2. The regression: Bob walks out of Town and back, three times over. Alice's
  //    log must not say a word, and Bob must not fall off her roster while away.
  //    Routed through Town each time, because that is the actual portal graph —
  //    the server will not accept a hop straight from the shore to the shop.
  const before = lines().length;
  for (const scene of ['shore', 'town', 'daniels-shop', 'town', 'cafe-cinnamon', 'town'] as const) {
    bob.send('active', { active: true, scene });
    await waitFor(
      () => alice.state.players.get(bob.sessionId)?.scene === scene,
      `Bob's move to ${scene}`,
    );
    syncAlice();
    assert.ok(rosterFor(alice).includes(named('Bob')), `Bob fell off the roster while in ${scene}`);
    assert.equal(lines().length, before, `moving to ${scene} announced something`);
    console.log(`✓ Bob walks to ${scene}: still on the roster, log still silent`);
  }

  // 3. Bob really leaves.
  await bob.leave();
  rooms.splice(rooms.indexOf(bob), 1);
  await waitFor(() => !alice.state.players.has(bob.sessionId), 'Bob removed from the room');
  syncAlice();
  assert.deepEqual(
    lines(),
    [`${named('Bob')} joined the village`, `${named('Bob')} left the village`],
    'a real departure is announced',
  );
  console.log(`✓ Bob leaves: "${named('Bob')} left the village"`);

  // 4. Someone arriving to a village that already has people in it is told about
  //    nobody — they were all here first.
  const carol = await join('Carol');
  rooms.push(carol);
  const dave = await join('Dave');
  rooms.push(dave);
  await waitFor(
    () => carol.state?.players?.has(dave.sessionId) === true,
    'Carol sees Dave',
  );
  clearChatLog();
  resetChatLogPresence();
  noteChatLogPresence(
    snapshotRoster(carol.state, carol.sessionId, carol.state.players.get(carol.sessionId)?.userId),
    Date.now(),
  );
  assert.deepEqual(lines(), [], 'a first snapshot is a baseline, not a room of arrivals');
  const carolRoster = rosterFor(carol);
  assert.ok(carolRoster.includes(named('Alice')), 'Carol should see Alice');
  assert.ok(carolRoster.includes(named('Dave')), 'Carol should see Dave');
  assert.ok(!carolRoster.includes(named('Carol')), 'Carol should not see herself');
  console.log('✓ Carol arrives: log silent, and she sees Alice and Dave but not herself');

  // 5. A dropped connection is not a departure. The room holds a seat for 20s
  //    (TownRoom.onDrop → allowReconnection) with `active` turned off; the log
  //    must sit through that quietly rather than announce a blip. Once the grace
  //    runs out the room deletes the player, which is the same onLeave path the
  //    clean leave above already covers.
  //
  //    Alice's own state has to have caught up with everyone before her baseline
  //    is taken, or they arrive after it and are announced alongside Erin.
  await waitFor(
    () => alice.state.players.has(carol.sessionId) && alice.state.players.has(dave.sessionId),
    'Alice sees Carol and Dave',
  );
  clearChatLog();
  resetChatLogPresence();
  syncAlice();
  const erin = await join('Erin');
  rooms.push(erin);
  await waitFor(() => alice.state.players.has(erin.sessionId), 'Erin visible to Alice');
  syncAlice();
  assert.deepEqual(lines(), [`${named('Erin')} joined the village`], 'Erin should be announced');

  // consented: false is a drop, not a goodbye.
  await erin.leave(false);
  rooms.splice(rooms.indexOf(erin), 1);
  await waitFor(
    () => alice.state.players.get(erin.sessionId)?.active === false,
    'Erin dropped but still seated',
  );
  syncAlice();
  assert.ok(rosterFor(alice).includes(named('Erin')), 'a dropped player keeps their seat');
  assert.deepEqual(
    lines(),
    [`${named('Erin')} joined the village`],
    'a blip should not announce a departure',
  );
  console.log('✓ Erin drops: seat held, log still silent through the grace window');

  console.log('\nchat log presence sanity check passed');
} finally {
  await Promise.allSettled(rooms.map((room) => room.leave()));
}
