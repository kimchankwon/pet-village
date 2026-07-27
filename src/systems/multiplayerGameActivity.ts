import type { GameActivity } from '@pet-village/multiplayer-protocol';
import { multiplayerBridge } from './multiplayerBridge';

export const GAME_SCENE_ACTIVITIES = {
  Fishing: 'fishing',
  Get: 'get',
  Bump: 'bump',
  SkipRope: 'skip-rope',
  PaperToss: 'paper-toss',
  SledRun: 'sled-run',
} as const satisfies Record<string, GameActivity>;

export type GameSceneKey = keyof typeof GAME_SCENE_ACTIVITIES;

type SceneLifecycle = {
  events: {
    once: (event: string, callback: () => void) => unknown;
    off: (event: string, callback: () => void) => unknown;
  };
};

type ActivityBridge = {
  activateGame: (activity: GameActivity) => () => void;
};

export function bindGameActivity(
  scene: SceneLifecycle,
  sceneKey: GameSceneKey,
  bridge: ActivityBridge = multiplayerBridge,
) {
  const release = bridge.activateGame(GAME_SCENE_ACTIVITIES[sceneKey]);
  let released = false;
  const cleanup = () => {
    if (released) return;
    released = true;
    scene.events.off('shutdown', cleanup);
    scene.events.off('destroy', cleanup);
    release();
  };
  scene.events.once('shutdown', cleanup);
  scene.events.once('destroy', cleanup);
  return cleanup;
}
