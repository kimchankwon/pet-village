import test from 'node:test';
import assert from 'node:assert/strict';
import { GameStateStore } from './GameState';

test('failed adoption restores and re-persists the previous local save', async () => {
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const values = new Map<string, string>();
  const storage = {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => [...values.keys()][index] ?? null,
    removeItem: (key: string) => { values.delete(key); },
    setItem: (key: string, value: string) => { values.set(key, value); },
  } satisfies Storage;
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  try {
    const state = new GameStateStore();
    const before = state.snapshot();
    state.setAdoptionSaver(async () => { throw new Error('name taken'); });

    await assert.rejects(state.adopt('bongbongee', 'Mochi'), /name taken/);

    assert.equal(state.data.adopted, false);
    assert.equal(state.data.petName, before.petName);
    const persisted = JSON.parse(storage.getItem('pet-village-save-v1') ?? '{}') as { adopted?: boolean; petName?: string };
    assert.equal(persisted.adopted, false);
    assert.equal(persisted.petName, before.petName);
  } finally {
    if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});
