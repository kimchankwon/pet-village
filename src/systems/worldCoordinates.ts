import type { WorldScene } from '@pet-village/multiplayer-protocol';

const PHASER_WORLD_SCENE_KEYS: Record<WorldScene, string> = {
  town: 'Town',
  shore: 'Shore',
  'west-green': 'WestPark',
  'east-green': 'EastPark',
  'daniels-shop': 'Shop',
  'cafe-cinnamon': 'ClothesShop',
};

export function phaserWorldSceneKey(scene: WorldScene) {
  return PHASER_WORLD_SCENE_KEYS[scene];
}

export type WorldCoordinates = {
  x: number;
  y: number;
  petX: number;
  petY: number;
};

/** Translate a player-and-pet pose between local scene space and network space. */
export function translateWorldCoordinates<T extends WorldCoordinates>(
  value: T,
  offsetX: number,
  offsetY: number,
): T {
  return {
    ...value,
    x: value.x + offsetX,
    y: value.y + offsetY,
    petX: value.petX + offsetX,
    petY: value.petY + offsetY,
  };
}
