import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isNewWaveForLocalPlayer,
  isVisibleRemotePlayer,
  dedupeRemotePlayers,
  handleRemotePlayerPointerDown,
  isRemotePlayerInteractable,
  remotePlayerPresentation,
  remotePenguinTextureKey,
  remotePenguinWalkAnimKey,
  remoteMovementDecision,
  remotePetMovementDecision,
  stepRemotePosition,
  waveAnimationFrame,
  canInitiateWave,
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

test('gameplay ghosts cannot be targeted by pointer or keyboard interactions', () => {
  assert.equal(isRemotePlayerInteractable({ active: false, activity: 'fishing' }), false);
  assert.equal(isRemotePlayerInteractable({ active: true, activity: '' }), true);
  assert.equal(isRemotePlayerInteractable({ active: false, activity: '' }), false);
});

test('keeps player and pet names in separate labels', () => {
  assert.deepEqual(remotePlayerPresentation({ name: 'Da2el', petName: 'Mame', activity: 'fishing' }), {
    playerLabel: 'Da2el · Playing Fishing',
    petLabel: 'Mame',
    alpha: 0.6,
    interactive: false,
    labelColor: '#ffe26f',
  });
  assert.deepEqual(remotePlayerPresentation({ name: 'Da2el', petName: 'Mame', activity: '' }), {
    playerLabel: 'Da2el',
    petLabel: 'Mame',
    alpha: 1,
    interactive: true,
    labelColor: '#ffffff',
  });
});

test('remote interpolation is frame-rate independent and snaps teleports', () => {
  const once = stepRemotePosition({ x: 0, y: 0 }, { x: 100, y: 40 }, 100);
  const half = stepRemotePosition({ x: 0, y: 0 }, { x: 100, y: 40 }, 50);
  const twice = stepRemotePosition(half, { x: 100, y: 40 }, 50);
  assert.ok(Math.abs(once.x - twice.x) < 0.0001);
  assert.ok(Math.abs(once.y - twice.y) < 0.0001);
  assert.deepEqual(stepRemotePosition({ x: 0, y: 0 }, { x: 500, y: 20 }, 16), { x: 500, y: 20 });
});

test('remote penguin walk decisions preserve facing and horizontal flip', () => {
  assert.deepEqual(remoteMovementDecision({ x: 20, y: 10 }, { x: 4, y: 11 }, 'side', true, false), {
    facing: 'side', walking: true, flipX: true,
  });
  assert.deepEqual(remoteMovementDecision({ x: 4, y: 10 }, { x: 4, y: 30 }, 'down', false, true), {
    facing: 'down', walking: false, flipX: true,
  });
  assert.equal(remotePenguinWalkAnimKey('side', 'red'), 'penguin-remote-red-walk-side');
});

test('remote pets walk and face their horizontal travel direction', () => {
  assert.deepEqual(remotePetMovementDecision({ x: 10, y: 2 }, { x: 5, y: 3 }, false), {
    walking: true, flipX: true,
  });
  assert.deepEqual(remotePetMovementDecision({ x: 5, y: 3 }, { x: 5.1, y: 3.1 }, true), {
    walking: false, flipX: true,
  });
});

test('wave gating requires an active nearby player', () => {
  assert.equal(canInitiateWave({ x: 0, y: 0 }, { x: 92, y: 0 }, true, 92), true);
  assert.equal(canInitiateWave({ x: 0, y: 0 }, { x: 93, y: 0 }, true, 92), false);
  assert.equal(canInitiateWave({ x: 0, y: 0 }, { x: 1, y: 0 }, false, 92), false);
});

test('wave timing selects authored frames and ends cleanly', () => {
  assert.equal(waveAnimationFrame(0), 0);
  assert.equal(waveAnimationFrame(130), 1);
  assert.equal(waveAnimationFrame(260), 2);
  assert.equal(waveAnimationFrame(390), 3);
  assert.equal(waveAnimationFrame(520), 2);
  assert.equal(waveAnimationFrame(650), 1);
  assert.equal(waveAnimationFrame(780), null);
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
