import test from 'node:test';
import assert from 'node:assert/strict';
import { WORLD_SCENE_BOUNDS, worldSceneSpawn } from '@pet-village/multiplayer-protocol';
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

test('cafe spawn remains inside server bounds with no vertical network offset', () => {
  const spawn = worldSceneSpawn('cafe-cinnamon', 'from-town');
  const network = translateWorldCoordinates({
    sceneId: 'cafe-cinnamon',
    x: spawn.x,
    y: spawn.y,
    petX: spawn.x - 30,
    petY: spawn.y + 10,
  }, 0, 0);
  assert.equal(network.y, spawn.y);
  assert.ok(network.y <= WORLD_SCENE_BOUNDS['cafe-cinnamon'].height);
  assert.ok(network.petY <= WORLD_SCENE_BOUNDS['cafe-cinnamon'].height);
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
