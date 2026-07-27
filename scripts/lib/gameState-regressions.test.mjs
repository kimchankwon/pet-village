import test from 'node:test';
import assert from 'node:assert/strict';

import { GameStateStore, defaultSave, normalizeSave } from '../../src/systems/GameState.ts';

test('normalizeSave rejects malformed runtime types while preserving valid fields', () => {
  const normalized = normalizeSave({
    version: 1,
    coins: '30',
    petName: 'Mochi',
    inventory: ['fish'],
    placed: { id: 'bed', gx: 2, gy: 5 },
  });

  assert.equal(normalized.coins, defaultSave().coins);
  assert.equal(normalized.petName, 'Mochi');
  assert.deepEqual(normalized.inventory, defaultSave().inventory);
  assert.deepEqual(normalized.placed, defaultSave().placed);
  assert.equal(normalized.coins + 2, 32);
});

test('normalizeSave keeps valid legacy migration behavior', () => {
  const normalized = normalizeSave({
    version: 1,
    coins: 44,
    petName: 'Violet',
    petSpecies: 'violetchi',
    pet: { hunger: 70, happiness: 60, energy: 50 },
    inventory: { fish: 3 },
    placed: [{ id: 'bed', gx: 2, gy: 5 }],
  });

  assert.equal(normalized.petSpecies, 'flowetchi');
  assert.equal(normalized.adopted, true);
  assert.equal(normalized.coins, 44);
  assert.deepEqual(normalized.inventory, { fish: 3 });
  assert.deepEqual(normalized.placed, [{ id: 'bed', gx: 2, gy: 5 }]);
});

test('normalizeSave preserves only valid Town positions', () => {
  assert.deepEqual(
    normalizeSave({ version: 1, townPosition: { x: 320, y: 240, facing: 'side' } }).townPosition,
    { x: 320, y: 240, facing: 'side' },
  );
  assert.equal(
    normalizeSave({ version: 1, townPosition: { x: -1, y: 240, facing: 'side' } }).townPosition,
    undefined,
  );
});

test('remembered Town position is durably persisted only when changed', () => {
  const previousStorage = globalThis.localStorage;
  const storage = new Map();
  globalThis.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  };

  try {
    const store = new GameStateStore();
    store.rememberTownPosition({ x: 320, y: 240, facing: 'side' });
    assert.equal(store.persistTownPosition(), true);
    assert.equal(store.persistTownPosition(), false);
    assert.deepEqual(new GameStateStore().data.townPosition, { x: 320, y: 240, facing: 'side' });
  } finally {
    globalThis.localStorage = previousStorage;
  }
});

test('older cloud saves do not erase a valid device Town position', () => {
  const previousStorage = globalThis.localStorage;
  const local = { ...defaultSave(), townPosition: { x: 320, y: 240, facing: 'side' } };
  globalThis.localStorage = {
    getItem: () => JSON.stringify(local),
    setItem: () => {},
  };

  try {
    const store = new GameStateStore();
    store.hydrate({ ...defaultSave(), townPosition: undefined });
    assert.deepEqual(store.data.townPosition, { x: 320, y: 240, facing: 'side' });
  } finally {
    globalThis.localStorage = previousStorage;
  }
});

test('fired cloud debounce is no longer pending for flushCloud', () => {
  const previousStorage = globalThis.localStorage;
  const previousSetTimeout = globalThis.setTimeout;
  const previousClearTimeout = globalThis.clearTimeout;
  const storage = new Map();
  let scheduled;
  globalThis.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  };
  globalThis.setTimeout = (callback) => {
    scheduled = callback;
    return 123;
  };
  globalThis.clearTimeout = () => {};

  try {
    const store = new GameStateStore();
    let writes = 0;
    store.setCloudSaver(() => writes++);
    store.save();
    assert.equal(typeof scheduled, 'function');
    scheduled();
    assert.equal(writes, 1);
    store.flushCloud();
    assert.equal(writes, 1);
  } finally {
    globalThis.localStorage = previousStorage;
    globalThis.setTimeout = previousSetTimeout;
    globalThis.clearTimeout = previousClearTimeout;
  }
});
