import test from 'node:test';
import assert from 'node:assert/strict';
import { multiplayerBridge, type RemotePresence } from './multiplayerBridge';

const pose = { x: 1, y: 1, petX: 1, petY: 1, facing: 'down' as const, moving: false, seq: 1 };
const remote: RemotePresence = {
  userId: 'remote', sessionId: 'remote', name: 'Remote', petName: 'Pet', petSpecies: 'mametchi',
  penguinColor: 'blue', x: 1, y: 1, petX: 1, petY: 1, facing: 'down', moving: false, updatedAt: 1,
};

function actions(sent: number[]) {
  return {
    send: () => sent.push(1),
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
  multiplayerBridge.send(pose);
  assert.deepEqual(first, []);
  assert.deepEqual(second, [1]);
  assert.equal(seen[seen.length - 1]?.length, 0);

  multiplayerBridge.setRemote(secondId, [remote]);
  assert.equal(seen[seen.length - 1]?.length, 1);
  assert.equal(multiplayerBridge.uninstall(secondId), true);
  unsubscribe();
});
