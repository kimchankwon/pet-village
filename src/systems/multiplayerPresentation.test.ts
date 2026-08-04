import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isNewWave,
  isNewWaveForLocalPlayer,
  positionCorrectionAction,
  visibleSceneRows,
  isVisibleRemotePlayer,
  dedupeRemotePlayers,
  handleRemotePlayerPointerDown,
  isRemotePlayerInteractable,
  remotePlayerPresentation,
  remotePenguinTextureKey,
  remotePenguinWalkAnimKey,
  remotePenguinDanceTextureKey,
  remoteMovementDecision,
  remotePetMovementDecision,
  stepRemotePosition,
  waveAnimationFrame,
  danceAnimationFrame,
  canInitiateWave,
  approachPointForWave,
  pendingWaveDecision,
  WAVE_APPROACH_TIMEOUT_MS,
  WAVE_RETARGET_MIN_MOVE_PX,
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

test('bystanders see the wave animation even when someone else is the target', () => {
  assert.equal(isNewWave(undefined, 'wave-1'), true);
  assert.equal(isNewWave('wave-1', 'wave-2'), true);
  assert.equal(isNewWave('wave-1', 'wave-1'), false);
  assert.equal(isNewWave('wave-1', undefined), false);
});

const presence = (over: Partial<{ sessionId: string; sceneId: string; active: boolean; activity: '' | 'fishing' }>) => ({
  sessionId: 'session-a',
  sceneId: 'town',
  active: true,
  activity: '' as '' | 'fishing',
  ...over,
});

test('a world scene renders only its own scene, keeping players parked in minigames', () => {
  const rows = [
    presence({ sessionId: 'roaming-town' }),
    presence({ sessionId: 'roaming-cafe', sceneId: 'cafe-cinnamon' }),
    presence({ sessionId: 'fishing-town', active: false, activity: 'fishing' }),
    presence({ sessionId: 'idle-town', active: false }),
    presence({ sessionId: 'fishing-cafe', sceneId: 'cafe-cinnamon', active: false, activity: 'fishing' }),
  ];
  assert.deepEqual(
    visibleSceneRows(rows, 'town').map((row) => row.sessionId),
    ['roaming-town', 'fishing-town'],
  );
  assert.deepEqual(
    visibleSceneRows(rows, 'cafe-cinnamon').map((row) => row.sessionId),
    ['roaming-cafe', 'fishing-cafe'],
  );
});

test('a correction for another scene switches scenes instead of snapping in place', () => {
  assert.equal(positionCorrectionAction(null, 'town'), 'ignore');
  assert.equal(positionCorrectionAction({ sceneId: 'town' }, 'town'), 'snap');
  assert.equal(positionCorrectionAction({ sceneId: 'cafe-cinnamon' }, 'town'), 'switch-scene');
});

test('uses validated colour-specific remote penguin textures', () => {
  assert.equal(remotePenguinTextureKey('side', 'red'), 'penguin-remote-red-side');
  assert.equal(remotePenguinTextureKey('down', 'not-a-colour'), 'penguin-remote-blue-down');
  assert.equal(remotePenguinDanceTextureKey('pink'), 'penguin-remote-pink-dance');
  assert.equal(remotePenguinDanceTextureKey('???'), 'penguin-remote-blue-dance');
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

test('clicking someone far away walks to just inside wave range', () => {
  // 200px away, radius 92: stop 55.2px short, so the walk covers 144.8px.
  assert.deepEqual(approachPointForWave({ x: 0, y: 0 }, { x: 200, y: 0 }, 92), { x: 144.8, y: 0 });
  const diagonal = approachPointForWave({ x: 10, y: 10 }, { x: 10, y: 210 }, 92);
  assert.equal(diagonal.x, 10);
  assert.equal(Math.round(diagonal.y), 155);
  // Already close enough: stay put and let the wave fire.
  assert.deepEqual(approachPointForWave({ x: 5, y: 5 }, { x: 25, y: 5 }, 92), { x: 5, y: 5 });
  assert.deepEqual(approachPointForWave({ x: 5, y: 5 }, { x: 5, y: 5 }, 92), { x: 5, y: 5 });
});

test('a queued wave fires on arrival, retargets a mover, and gives up eventually', () => {
  const base = { present: true, active: true, radius: 92, walking: true, elapsedMs: 0, targetMovedPx: 0 };
  assert.equal(pendingWaveDecision({ ...base, distance: 90 }), 'wave');
  assert.equal(pendingWaveDecision({ ...base, distance: 300 }), 'walking');
  // The walk ended short of the target — they moved on, so aim again.
  assert.equal(
    pendingWaveDecision({ ...base, distance: 300, walking: false, targetMovedPx: WAVE_RETARGET_MIN_MOVE_PX }),
    'retarget',
  );
  // The walk ended and they never moved: a collider stopped us, or the player
  // walked off with WASD. Either way, stop re-issuing the walk every frame.
  assert.equal(pendingWaveDecision({ ...base, distance: 300, walking: false }), 'cancel');
  assert.equal(pendingWaveDecision({ ...base, distance: 300, elapsedMs: WAVE_APPROACH_TIMEOUT_MS }), 'cancel');
  // Left the scene, or started a minigame: nothing to walk to.
  assert.equal(pendingWaveDecision({ ...base, distance: 300, present: false }), 'cancel');
  assert.equal(pendingWaveDecision({ ...base, distance: 300, active: false }), 'cancel');
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

test('dance timing loops all 76 GIF frames at 100 ms', () => {
  assert.equal(danceAnimationFrame(0), 0);
  assert.equal(danceAnimationFrame(100), 1);
  assert.equal(danceAnimationFrame(200), 2);
  assert.equal(danceAnimationFrame(7500), 75);
  assert.equal(danceAnimationFrame(7600), 0);
  assert.equal(danceAnimationFrame(7700), 1);
  assert.equal(danceAnimationFrame(15_200), 0);
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
