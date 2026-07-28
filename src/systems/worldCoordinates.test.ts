import test from 'node:test';
import assert from 'node:assert/strict';
import { phaserWorldSceneKey, translateWorldCoordinates } from './worldCoordinates';

test('screen-centred interiors use stable network coordinates across viewport offsets', () => {
  const local = {
    sceneId: 'daniels-shop' as const,
    x: 650,
    y: 498,
    petX: 620,
    petY: 508,
  };
  const network = translateWorldCoordinates(local, -362, 0);
  assert.deepEqual(network, {
    sceneId: 'daniels-shop',
    x: 288,
    y: 498,
    petX: 258,
    petY: 508,
  });
  assert.deepEqual(translateWorldCoordinates(network, 362, 0), local);
});

test('multiplayer world ids map to registered Phaser scene keys', () => {
  assert.deepEqual([
    phaserWorldSceneKey('town'),
    phaserWorldSceneKey('shore'),
    phaserWorldSceneKey('west-green'),
    phaserWorldSceneKey('east-green'),
    phaserWorldSceneKey('daniels-shop'),
    phaserWorldSceneKey('cafe-cinnamon'),
  ], ['Town', 'Shore', 'WestPark', 'EastPark', 'Shop', 'ClothesShop']);
});
