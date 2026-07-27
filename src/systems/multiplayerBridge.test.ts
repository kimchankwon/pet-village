import test from 'node:test';
import assert from 'node:assert/strict';
import { multiplayerBridge, type RemoteNpc, type RemotePresence } from './multiplayerBridge';

const pose = { x: 1, y: 1, petX: 1, petY: 1, facing: 'down' as const, moving: false };
const remote: RemotePresence = {
  userId: 'remote', sessionId: 'remote', localSessionId: 'local', name: 'Remote', petName: 'Pet', petSpecies: 'mametchi',
  penguinColor: 'blue', x: 1, y: 1, petX: 1, petY: 1, facing: 'down', moving: false, updatedAt: 1,
};

function actions(sent: number[]) {
  return {
    send: (move: { seq: number }) => sent.push(move.seq),
    setActive: () => {},
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
