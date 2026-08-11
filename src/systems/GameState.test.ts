import test from 'node:test';
import assert from 'node:assert/strict';
import { GameStateStore } from './GameState';
import { BONGBONGEE_FISH_QUEST_ID, BONGBONGEE_SKIP_QUEST_ID } from './quests';

function withLocalStorage(run: (storage: Storage & { values: Map<string, string> }) => void | Promise<void>) {
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const values = new Map<string, string>();
  const storage = {
    values,
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => [...values.keys()][index] ?? null,
    removeItem: (key: string) => { values.delete(key); },
    setItem: (key: string, value: string) => { values.set(key, value); },
  } satisfies Storage & { values: Map<string, string> };
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  // Run inside .then so a sync throw still hits finally and restores localStorage.
  return Promise.resolve()
    .then(() => run(storage))
    .finally(() => {
      if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage);
      else Reflect.deleteProperty(globalThis, 'localStorage');
    });
}

test('failed adoption restores and re-persists the previous local save', async () => {
  await withLocalStorage(async (storage) => {
    const state = new GameStateStore();
    const before = state.snapshot();
    state.setAdoptionSaver(async () => { throw new Error('name taken'); });

    await assert.rejects(state.adopt('bongbongee', 'Mochi'), /name taken/);

    assert.equal(state.data.adopted, false);
    assert.equal(state.data.petName, before.petName);
    const persisted = JSON.parse(storage.getItem('pet-village-save-v1') ?? '{}') as { adopted?: boolean; petName?: string };
    assert.equal(persisted.adopted, false);
    assert.equal(persisted.petName, before.petName);
  });
});

test('Bongbongee fish quest: accept, turn in 3 Mint Bass, grant coins + lightstick', async () => {
  await withLocalStorage(() => {
    const state = new GameStateStore();
    assert.equal(state.getQuestStatus(BONGBONGEE_FISH_QUEST_ID), 'available');
    assert.equal(state.acceptQuest(BONGBONGEE_FISH_QUEST_ID), true);
    assert.equal(state.getQuestStatus(BONGBONGEE_FISH_QUEST_ID), 'active');
    assert.equal(state.acceptQuest(BONGBONGEE_FISH_QUEST_ID), false, 'cannot accept twice');

    const coinsBefore = state.coins;
    assert.equal(state.completeQuest(BONGBONGEE_FISH_QUEST_ID), false, 'need 3 fish first');
    state.addItem('oceanfish-uncommon', 2);
    assert.equal(state.completeQuest(BONGBONGEE_FISH_QUEST_ID), false);
    state.addItem('oceanfish-uncommon', 1);
    assert.equal(state.completeQuest(BONGBONGEE_FISH_QUEST_ID), true);

    assert.equal(state.getQuestStatus(BONGBONGEE_FISH_QUEST_ID), 'completed');
    assert.equal(state.data.inventory['oceanfish-uncommon'] ?? 0, 0);
    assert.equal(state.coins, coinsBefore + 100);
    assert.equal(state.data.inventory.lightstick, 1);
    assert.equal(state.completeQuest(BONGBONGEE_FISH_QUEST_ID), false, 'already done');
    assert.equal(state.snapshot().quests?.[BONGBONGEE_FISH_QUEST_ID], 'completed');
  });
});

test('Bongbongee skip-rope quest: locked until fish done, 3 clears, 120c + 15 cookies', async () => {
  await withLocalStorage(() => {
    const state = new GameStateStore();
    assert.equal(state.getQuestStatus(BONGBONGEE_SKIP_QUEST_ID), 'locked');
    assert.equal(state.acceptQuest(BONGBONGEE_SKIP_QUEST_ID), false);

    // Finish the fish quest first.
    state.acceptQuest(BONGBONGEE_FISH_QUEST_ID);
    state.addItem('oceanfish-uncommon', 3);
    assert.equal(state.completeQuest(BONGBONGEE_FISH_QUEST_ID), true);

    assert.equal(state.getQuestStatus(BONGBONGEE_SKIP_QUEST_ID), 'available');
    assert.equal(state.acceptQuest(BONGBONGEE_SKIP_QUEST_ID), true);
    assert.equal(state.getQuestStatus(BONGBONGEE_SKIP_QUEST_ID), 'active');
    assert.equal(state.data.questCounters?.[BONGBONGEE_SKIP_QUEST_ID], 0);
    assert.equal(state.completeQuest(BONGBONGEE_SKIP_QUEST_ID), false);

    // Clears only count while the quest is active (each win also pays the usual skip-rope coins).
    state.rewardSkipRopeWin();
    state.rewardSkipRopeWin();
    assert.equal(state.data.questCounters?.[BONGBONGEE_SKIP_QUEST_ID], 2);
    assert.equal(state.completeQuest(BONGBONGEE_SKIP_QUEST_ID), false);
    state.rewardSkipRopeWin();
    assert.equal(state.data.questCounters?.[BONGBONGEE_SKIP_QUEST_ID], 3);

    const coinsBefore = state.coins;
    const cookiesBefore = state.data.inventory.cookie ?? 0;
    assert.equal(state.completeQuest(BONGBONGEE_SKIP_QUEST_ID), true);

    assert.equal(state.getQuestStatus(BONGBONGEE_SKIP_QUEST_ID), 'completed');
    assert.equal(state.coins, coinsBefore + 120);
    assert.equal(state.data.inventory.cookie, cookiesBefore + 15);
    assert.equal(state.completeQuest(BONGBONGEE_SKIP_QUEST_ID), false);
    assert.equal(state.snapshot().questCounters?.[BONGBONGEE_SKIP_QUEST_ID], 3);
  });
});
