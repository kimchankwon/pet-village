import assert from 'node:assert/strict';
import test from 'node:test';
import { bindGameActivity, GAME_SCENE_ACTIVITIES } from './multiplayerGameActivity';

test('every playable mini-game has a synchronized activity', () => {
  assert.deepEqual(GAME_SCENE_ACTIVITIES, {
    Fishing: 'fishing',
    Get: 'get',
    Bump: 'bump',
    SkipRope: 'skip-rope',
    PaperToss: 'paper-toss',
  });
});

test('game activity binding releases on scene shutdown or destroy', () => {
  const listeners = new Map<string, () => void>();
  const calls: string[] = [];
  const scene = {
    events: {
      once: (event: string, callback: () => void) => listeners.set(event, callback),
      off: (event: string, callback: () => void) => {
        if (listeners.get(event) === callback) listeners.delete(event);
      },
    },
  };
  const bridge = { activateGame: (activity: string) => {
    calls.push(activity);
    return () => calls.push('released');
  } };

  bindGameActivity(scene, 'Fishing', bridge);
  assert.deepEqual(calls, ['fishing']);
  listeners.get('shutdown')?.();
  assert.equal(listeners.has('destroy'), false);
  listeners.get('destroy')?.();
  assert.deepEqual(calls, ['fishing', 'released']);
});
