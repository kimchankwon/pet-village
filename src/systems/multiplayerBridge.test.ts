import test from 'node:test';
import assert from 'node:assert/strict';
import { multiplayerBridge, type RemoteNpc, type RemotePresence } from './multiplayerBridge';

const pose = { x: 1, y: 1, petX: 1, petY: 1, facing: 'down' as const, moving: false };
const remote: RemotePresence = {
  userId: 'remote', sessionId: 'remote', localSessionId: 'local', name: 'Remote', petName: 'Pet', petSpecies: 'mametchi',
  penguinColor: 'blue', equippedAccessories: {}, x: 1, y: 1, petX: 1, petY: 1, facing: 'down', moving: false,
  active: true, activity: '', updatedAt: 1, sceneId: 'town',
};

function actions(sent: number[]) {
  return {
    send: (move: { seq: number }) => sent.push(move.seq),
    setActive: () => {},
    setActivity: () => {},
    setScene: () => {},
    updateProfile: () => {},
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
  multiplayerBridge.setPositionCorrection(firstId, { sceneId: 'town', x: 9, y: 9, petX: 9, petY: 9 });
  assert.equal(multiplayerBridge.consumePositionCorrection(), null);
  multiplayerBridge.send(pose);
  assert.deepEqual(first, []);
  assert.deepEqual(second, []);
  const releaseTown = multiplayerBridge.activateWorld('town', pose);
  multiplayerBridge.send(pose);
  multiplayerBridge.send(pose);
  assert.deepEqual(second, [1, 2]);
  releaseTown();
  assert.equal(seen[seen.length - 1]?.length, 0);

  multiplayerBridge.setRemote(secondId, [remote]);
  multiplayerBridge.setPositionCorrection(secondId, { scene: 'town', x: 2, y: 3, petX: 4, petY: 5 });
  assert.deepEqual(multiplayerBridge.consumePositionCorrection(), { sceneId: 'town', x: 2, y: 3, petX: 4, petY: 5 });
  assert.equal(multiplayerBridge.consumePositionCorrection(), null);
  assert.equal(seen[seen.length - 1]?.length, 1);
  assert.equal(multiplayerBridge.uninstall(secondId), true);
  unsubscribe();
});

test('scene transitions discard delayed position corrections from the previous world', () => {
  const id = multiplayerBridge.install(actions([]));
  const releaseTown = multiplayerBridge.activateWorld('town', pose);
  multiplayerBridge.setPositionCorrection(id, {
    sceneId: 'town', x: 9, y: 9, petX: 8, petY: 9,
  });
  const releaseShore = multiplayerBridge.activateWorld('shore', { ...pose, x: 500, y: 600 });
  assert.equal(multiplayerBridge.consumePositionCorrection('shore'), null);

  multiplayerBridge.setPositionCorrection(id, {
    sceneId: 'town', x: 12, y: 12, petX: 11, petY: 12,
  });
  assert.equal(multiplayerBridge.consumePositionCorrection('shore'), null);
  assert.equal(multiplayerBridge.consumePositionCorrection('town'), null);
  releaseShore();
  releaseTown();
  multiplayerBridge.uninstall(id);
});

test('authoritative scene recovery survives the wrong scene and is consumed by the destination', () => {
  const id = multiplayerBridge.install(actions([]));
  multiplayerBridge.setPositionCorrection(id, {
    scene: 'town', x: 320, y: 240, petX: 290, petY: 250, recoverScene: true,
  });

  const recovery = multiplayerBridge.consumePositionCorrection('shore');
  assert.deepEqual(recovery, {
    sceneId: 'town', x: 320, y: 240, petX: 290, petY: 250, recoverScene: true,
  });
  const releaseTown = multiplayerBridge.activateWorld('town', pose);
  assert.deepEqual(multiplayerBridge.consumePositionCorrection('town'), recovery);
  assert.equal(multiplayerBridge.consumePositionCorrection('town'), null);
  releaseTown();
  multiplayerBridge.uninstall(id);
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
  const scenes: unknown[] = [];
  const activities: string[] = [];
  const id = multiplayerBridge.install({
    ...actions([]),
    setActive: (active: boolean) => activeStates.push(active),
    setScene: (scene: unknown) => scenes.push(scene),
    setActivity: (activity: string) => activities.push(activity),
  });
  const releaseTown = multiplayerBridge.activateTown();

  activeStates.length = 0;
  scenes.length = 0;
  activities.length = 0;
  assert.equal(multiplayerBridge.republish(id), true);
  assert.equal(activeStates.length, 0);
  assert.deepEqual(scenes, [{ sceneId: 'town', x: 0, y: 0, petX: 0, petY: 0, facing: 'down', moving: false }]);
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
  const scenes: unknown[] = [];
  const id = multiplayerBridge.install({
    ...actions([]),
    setActive: (active: boolean) => activeStates.push(active),
    setScene: (scene: unknown) => scenes.push(scene),
  });
  const releaseFirst = multiplayerBridge.activateTown();
  const releaseSecond = multiplayerBridge.activateTown();

  const sceneCount = scenes.length;
  releaseFirst();
  assert.equal(scenes.length, sceneCount);
  assert.equal(multiplayerBridge.activeSceneId(), 'town');
  releaseSecond();
  assert.equal(activeStates[activeStates.length - 1], false);
  assert.equal(multiplayerBridge.uninstall(id), true);
});

test('world activation publishes its scene and pose and stale cleanup cannot deactivate it', () => {
  const activeStates: boolean[] = [];
  const scenes: unknown[] = [];
  const id = multiplayerBridge.install({
    ...actions([]),
    setActive: (active: boolean) => activeStates.push(active),
    setScene: (scene: unknown) => scenes.push(scene),
  });
  const westPose = { ...pose, x: 50, y: 60, petX: 30, petY: 60 };
  const releaseWest = multiplayerBridge.activateWorld('west-green', westPose);
  const releaseShore = multiplayerBridge.activateWorld('shore', { ...pose, x: 90, y: 100 });

  assert.deepEqual(scenes, [
    { sceneId: 'west-green', ...westPose },
    { sceneId: 'shore', ...pose, x: 90, y: 100 },
  ]);
  const sceneCount = scenes.length;
  releaseWest();
  assert.equal(scenes.length, sceneCount);
  assert.equal(multiplayerBridge.activeSceneId(), 'shore');
  releaseShore();
  assert.equal(activeStates[activeStates.length - 1], false);
  assert.equal(multiplayerBridge.activeSceneId(), null);
  multiplayerBridge.uninstall(id);
});

test('profile tickets replay on reconnect until the matching server acknowledgement', () => {
  const scenes: unknown[] = [];
  const tickets: string[] = [];
  const id = multiplayerBridge.install({
    ...actions([]),
    setScene: (scene: unknown) => scenes.push(scene),
    updateProfile: (ticket: string) => tickets.push(ticket),
  });
  const release = multiplayerBridge.activateWorld('cafe-cinnamon', pose);
  scenes.length = 0;

  multiplayerBridge.updateProfile('first-ticket');
  multiplayerBridge.updateProfile('fresh-ticket');
  assert.equal(multiplayerBridge.republish(id), true);
  assert.deepEqual(tickets, ['first-ticket', 'fresh-ticket', 'fresh-ticket']);
  assert.deepEqual(scenes, [{ sceneId: 'cafe-cinnamon', ...pose }]);

  multiplayerBridge.profileRefreshResult(id, 'first-ticket', true);
  multiplayerBridge.republish(id);
  assert.equal(tickets.length, 4);
  multiplayerBridge.profileRefreshResult(id, 'fresh-ticket', false);
  assert.equal(multiplayerBridge.retryProfile(id, 'fresh-ticket'), true);
  assert.equal(tickets.length, 5);
  multiplayerBridge.republish(id);
  assert.equal(tickets.length, 6);
  multiplayerBridge.profileRefreshResult(id, 'fresh-ticket', true);
  multiplayerBridge.republish(id);
  assert.equal(tickets.length, 6);

  release();
  multiplayerBridge.uninstall(id);
});

test('expired profile tickets are neither replayed nor acknowledged', () => {
  const originalNow = Date.now;
  let now = 1_000;
  Date.now = () => now;
  try {
    const tickets: string[] = [];
    const id = multiplayerBridge.install({
      ...actions([]),
      updateProfile: (ticket: string) => tickets.push(ticket),
    });
    multiplayerBridge.updateProfile('expiring-ticket');
    now += 60_000;
    assert.equal(multiplayerBridge.retryProfile(id, 'expiring-ticket'), false);
    assert.equal(multiplayerBridge.profileRefreshResult(id, 'expiring-ticket', true), false);
    multiplayerBridge.republish(id);
    assert.deepEqual(tickets, ['expiring-ticket']);
    multiplayerBridge.uninstall(id);
  } finally {
    Date.now = originalNow;
  }
});
