import test from 'node:test';
import assert from 'node:assert/strict';
import { multiplayerBridge, type RemoteNpc, type RemotePresence } from './multiplayerBridge';

const pose = { x: 1, y: 1, petX: 1, petY: 1, facing: 'down' as const, moving: false };
const remote: RemotePresence = {
  userId: 'remote', sessionId: 'remote', localSessionId: 'local', name: 'Remote', petName: 'Pet', petSpecies: 'mametchi',
  penguinColor: 'blue', x: 1, y: 1, petX: 1, petY: 1, facing: 'down', moving: false,
  active: true, activity: '', updatedAt: 1,
};

function actions(sent: number[]) {
  return {
    send: (move: { seq: number }) => sent.push(move.seq),
    setActive: () => {},
    setActivity: () => {},
    leave: () => {},
    wave: () => {},
  };
}

test('stale connection cleanup cannot uninstall or update the current bridge', () => {
  const first: number[] = [];
  const second: number[] = [];
  const seen: RemotePresence[][] = [];
  const unsubscribe = multiplayerBridge.subscribe((rows) => seen.push(rows));
  const firstId = multiplayerBridge.install(actions(first));
  const secondId = multiplayerBridge.install(actions(second));

  assert.equal(multiplayerBridge.uninstall(firstId), false);
  multiplayerBridge.setRemote(firstId, [remote]);
  multiplayerBridge.setPositionCorrection(firstId, { x: 9, y: 9, petX: 9, petY: 9 });
  assert.equal(multiplayerBridge.consumePositionCorrection(), null);
  multiplayerBridge.send(pose);
  multiplayerBridge.send(pose);
  assert.deepEqual(first, []);
  assert.deepEqual(second, [1, 2]);
  assert.equal(seen[seen.length - 1]?.length, 0);

  multiplayerBridge.setRemote(secondId, [remote]);
  multiplayerBridge.setPositionCorrection(secondId, { x: 2, y: 3, petX: 4, petY: 5 });
  assert.deepEqual(multiplayerBridge.consumePositionCorrection(), { x: 2, y: 3, petX: 4, petY: 5 });
  assert.equal(multiplayerBridge.consumePositionCorrection(), null);
  assert.equal(seen[seen.length - 1]?.length, 1);
  assert.equal(multiplayerBridge.uninstall(secondId), true);
  unsubscribe();
});

test('NPC snapshots are connection-scoped and cleared on uninstall', () => {
  const npc: RemoteNpc = { id: 'bongbongee', x: 360, y: 456, facing: 'right', moving: true, updatedAt: 1 };
  const seen: RemoteNpc[][] = [];
  const unsubscribe = multiplayerBridge.subscribeNpcs((rows) => seen.push(rows));
  const firstId = multiplayerBridge.install(actions([]));
  const secondId = multiplayerBridge.install(actions([]));

  multiplayerBridge.setNpcs(firstId, [npc]);
  assert.deepEqual(seen[seen.length - 1], []);
  multiplayerBridge.setNpcs(secondId, [npc]);
  assert.deepEqual(seen[seen.length - 1], [npc]);
  multiplayerBridge.uninstall(secondId);
  assert.deepEqual(seen[seen.length - 1], []);
  unsubscribe();
});

test('stale game cleanup cannot clear a newer game activity', () => {
  const activities: string[] = [];
  const id = multiplayerBridge.install({
    ...actions([]),
    setActivity: (activity: string) => activities.push(activity),
  });
  const releaseFishing = multiplayerBridge.activateGame('fishing');
  const releaseBump = multiplayerBridge.activateGame('bump');

  releaseFishing();
  assert.equal(activities[activities.length - 1], 'bump');
  releaseBump();
  assert.equal(activities[activities.length - 1], '');
  assert.equal(multiplayerBridge.uninstall(id), true);
});

test('install publishes a cleared activity when no game scene is active', () => {
  const activities: string[] = [];
  const id = multiplayerBridge.install({
    ...actions([]),
    setActivity: (activity: string) => activities.push(activity),
  });

  assert.deepEqual(activities, ['']);
  assert.equal(multiplayerBridge.uninstall(id), true);
});

test('republish restores current Town and game presence after same-session reconnect', () => {
  const activeStates: boolean[] = [];
  const activities: string[] = [];
  const id = multiplayerBridge.install({
    ...actions([]),
    setActive: (active: boolean) => activeStates.push(active),
    setActivity: (activity: string) => activities.push(activity),
  });
  const releaseTown = multiplayerBridge.activateTown();

  activeStates.length = 0;
  activities.length = 0;
  assert.equal(multiplayerBridge.republish(id), true);
  assert.deepEqual(activeStates, [true]);
  assert.deepEqual(activities, ['']);

  releaseTown();
  const releaseGame = multiplayerBridge.activateGame('paper-toss');
  activeStates.length = 0;
  activities.length = 0;
  assert.equal(multiplayerBridge.republish(id), true);
  assert.deepEqual(activeStates, [false]);
  assert.deepEqual(activities, ['paper-toss']);

  assert.equal(multiplayerBridge.republish(Symbol('stale')), false);
  releaseGame();
  assert.equal(multiplayerBridge.uninstall(id), true);
});

test('game activity is published when multiplayer installs after the scene starts', () => {
  const release = multiplayerBridge.activateGame('paper-toss');
  const activities: string[] = [];
  const id = multiplayerBridge.install({
    ...actions([]),
    setActivity: (activity: string) => activities.push(activity),
  });

  assert.deepEqual(activities, ['paper-toss']);
  release();
  assert.equal(activities[activities.length - 1], '');
  assert.equal(multiplayerBridge.uninstall(id), true);
});

test('stale Town cleanup cannot deactivate a newer Town scene', () => {
  const activeStates: boolean[] = [];
  const id = multiplayerBridge.install({
    ...actions([]),
    setActive: (active: boolean) => activeStates.push(active),
  });
  const releaseFirst = multiplayerBridge.activateTown();
  const releaseSecond = multiplayerBridge.activateTown();

  releaseFirst();
  assert.equal(activeStates[activeStates.length - 1], true);
  releaseSecond();
  assert.equal(activeStates[activeStates.length - 1], false);
  assert.equal(multiplayerBridge.uninstall(id), true);
});
