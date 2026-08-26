import assert from 'node:assert/strict';
import test from 'node:test';
import { hydrationFromCloudSave, type CloudSaveRow } from './cloudSave';

/**
 * A cloud row with every field set to something distinguishable from its
 * default, so a dropped field shows up as a default rather than as itself.
 */
function fullCloudSave(): CloudSaveRow {
  return {
    version: 3,
    coins: 420,
    petName: 'Mochi',
    petSpecies: 'mametchi',
    adopted: true,
    pet: { hunger: 61, happiness: 62, energy: 63 },
    lastSeen: 1_700_000_000_000,
    inventory: { 'fish-cake': 2 },
    placed: [{ id: 'rug', gx: 3, gy: 4 }],
    bestPaperToss: 12,
    biggestCatch: 34,
    bestSkipRope: 56,
    expeditionWins: { 'renoir-hard': 3 },
    ownedAccessories: ['mini-crown'],
    equippedAccessories: { headLeft: 'mini-crown' },
    penguinColor: 'pink',
    townPosition: { x: 100, y: 200, facing: 'side' },
    quests: { 'skip-rope-sparkle': 'active' },
    questCounters: { 'skip-rope-sparkle': 7 },
  };
}

test('every field the cloud stores survives the hydration projection', () => {
  const cloudSave = fullCloudSave();
  const hydration = hydrationFromCloudSave(cloudSave, 0) as Record<string, unknown>;

  // `State.hydrate` replaces the save rather than merging into it, and the
  // `State.save()` that follows writes the result straight back up — so a field
  // this projection forgets is not an unread field, it is deleted progress.
  // Asserting over the row's own keys means a field added to the cloud later
  // fails here instead of quietly wiping itself on the next sign-in.
  for (const key of Object.keys(cloudSave)) {
    assert.ok(key in hydration, `hydration drops cloud field "${key}"`);
    assert.notEqual(hydration[key], undefined, `hydration leaves cloud field "${key}" undefined`);
  }
});

test('quest and expedition progress round-trips out of a cloud save', () => {
  // These three were the ones actually being lost: the cloud has stored them
  // since the quest release, and hydration dropped all three.
  const hydration = hydrationFromCloudSave(fullCloudSave(), 0);
  assert.deepEqual(hydration.quests, { 'skip-rope-sparkle': 'active' });
  assert.deepEqual(hydration.questCounters, { 'skip-rope-sparkle': 7 });
  assert.deepEqual(hydration.expeditionWins, { 'renoir-hard': 3 });
});

test('the local Skip Rope best wins when the device scored higher offline', () => {
  assert.equal(hydrationFromCloudSave(fullCloudSave(), 99).bestSkipRope, 99);
  assert.equal(hydrationFromCloudSave(fullCloudSave(), 1).bestSkipRope, 56);
  assert.equal(hydrationFromCloudSave({ ...fullCloudSave(), bestSkipRope: undefined }, 0).bestSkipRope, 0);
});
