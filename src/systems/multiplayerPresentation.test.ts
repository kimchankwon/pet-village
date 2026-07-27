import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isNewWaveForLocalPlayer,
  isVisibleRemotePlayer,
  dedupeRemotePlayers,
  remotePenguinTextureKey,
} from './multiplayerPresentation';

test('filters every connection belonging to the local authenticated user', () => {
  assert.equal(isVisibleRemotePlayer('session-a', 'user-a', 'session-a', 'user-a'), false);
  assert.equal(isVisibleRemotePlayer('session-b', 'user-a', 'session-a', 'user-a'), false);
  assert.equal(isVisibleRemotePlayer('session-c', 'user-c', 'session-a', 'user-a'), true);
});

test('shows a new wave only to its intended local session', () => {
  assert.equal(isNewWaveForLocalPlayer(undefined, 'wave-1', 'session-a', 'session-a'), true);
  assert.equal(isNewWaveForLocalPlayer(undefined, 'wave-1', 'session-b', 'session-a'), false);
  assert.equal(isNewWaveForLocalPlayer('wave-1', 'wave-1', 'session-a', 'session-a'), false);
});

test('uses validated colour-specific remote penguin textures', () => {
  assert.equal(remotePenguinTextureKey('side', 'red'), 'penguin-remote-red-side');
  assert.equal(remotePenguinTextureKey('down', 'not-a-colour'), 'penguin-remote-blue-down');
});

test('selects one deterministic session per remote user', () => {
  const rows = [
    { userId: 'user-a', sessionId: 'session-z', updatedAt: 2 },
    { userId: 'user-b', sessionId: 'session-b', updatedAt: 1 },
    { userId: 'user-a', sessionId: 'session-a', updatedAt: 1 },
  ];
  assert.deepEqual(dedupeRemotePlayers(rows), [
    { userId: 'user-a', sessionId: 'session-z', updatedAt: 2 },
    { userId: 'user-b', sessionId: 'session-b', updatedAt: 1 },
  ]);
});
