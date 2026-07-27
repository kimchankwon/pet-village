import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isNewWaveForLocalPlayer,
  isVisibleRemotePlayer,
  dedupeRemotePlayers,
  handleRemotePlayerPointerDown,
  remotePlayerPresentation,
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

test('clicking a remote consumes the ground click and waves without moving', () => {
  const actions: string[] = [];
  handleRemotePlayerPointerDown(
    { stopPropagation: () => actions.push('stop') },
    () => actions.push('cancel-movement'),
    () => actions.push('wave'),
  );
  assert.deepEqual(actions, ['stop', 'cancel-movement', 'wave']);
});

test('renders a clear non-interactive status for players inside a game', () => {
  assert.deepEqual(remotePlayerPresentation({ name: 'Da2el', petName: 'Mame', activity: 'fishing' }), {
    label: 'Da2el · Playing Fishing',
    alpha: 0.6,
    interactive: false,
    labelColor: '#ffe26f',
  });
  assert.deepEqual(remotePlayerPresentation({ name: 'Da2el', petName: 'Mame', activity: '' }), {
    label: 'Da2el · Mame',
    alpha: 1,
    interactive: true,
    labelColor: '#ffffff',
  });
});

test('prefers an active Town session over a newer game session for the same user', () => {
  const rows = [
    { userId: 'user-a', sessionId: 'game', active: false, activity: 'fishing', updatedAt: 10 },
    { userId: 'user-a', sessionId: 'town', active: true, activity: '', updatedAt: 1 },
  ];
  assert.deepEqual(dedupeRemotePlayers(rows), [rows[1]]);
});

test('selects one deterministic session per remote user', () => {
  const rows = [
    { userId: 'user-a', sessionId: 'session-z', active: false, activity: 'bump', updatedAt: 2 },
    { userId: 'user-b', sessionId: 'session-b', active: true, activity: '', updatedAt: 1 },
    { userId: 'user-a', sessionId: 'session-a', active: false, activity: 'fishing', updatedAt: 1 },
  ];
  assert.deepEqual(dedupeRemotePlayers(rows), [
    { userId: 'user-a', sessionId: 'session-z', active: false, activity: 'bump', updatedAt: 2 },
    { userId: 'user-b', sessionId: 'session-b', active: true, activity: '', updatedAt: 1 },
  ]);
});
