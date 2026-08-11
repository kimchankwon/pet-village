import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BONGBONGEE_FISH_QUEST_ID,
  BONGBONGEE_SKIP_QUEST_ID,
  canTurnInQuest,
  combinedQuestMarkerState,
  listActiveQuestDefs,
  listCompletedQuestDefs,
  normalizeQuestCounters,
  normalizeQuestProgress,
  objectiveProgressLabel,
  questMarkerState,
  questStatus,
  QUESTS,
  rewardSummary,
} from './quests';

const fish = QUESTS[BONGBONGEE_FISH_QUEST_ID]!;
const skip = QUESTS[BONGBONGEE_SKIP_QUEST_ID]!;

test('Bongbongee fish quest asks for 3 Mint Bass and pays coins + lightstick', () => {
  assert.equal(fish.itemId, 'oceanfish-uncommon');
  assert.equal(fish.itemCount, 3);
  assert.equal(fish.rewardCoins, 100);
  assert.deepEqual(fish.rewardItems, [{ id: 'lightstick', count: 1, label: 'Carat Lightstick' }]);
  assert.match(rewardSummary(fish), /100 coins/);
  assert.match(rewardSummary(fish), /Carat Lightstick/);
});

test('Bongbongee skip-rope quest unlocks after fish, needs 3 clears, pays cookies', () => {
  assert.equal(skip.requiresQuestId, BONGBONGEE_FISH_QUEST_ID);
  assert.equal(skip.progressKind, 'skipRopeClear');
  assert.equal(skip.itemCount, 3);
  assert.equal(skip.rewardCoins, 120);
  assert.deepEqual(skip.rewardItems, [{ id: 'cookie', count: 15, label: 'Choco Cookie' }]);
  assert.match(rewardSummary(skip), /120 coins/);
  assert.match(rewardSummary(skip), /15× Choco Cookie/);
});

test('quest status and marker: available → yellow, active → gray, completed → hidden', () => {
  assert.equal(questStatus({}, BONGBONGEE_FISH_QUEST_ID), 'available');
  assert.equal(questMarkerState({}, BONGBONGEE_FISH_QUEST_ID), 'available');

  assert.equal(
    questStatus({ [BONGBONGEE_FISH_QUEST_ID]: 'active' }, BONGBONGEE_FISH_QUEST_ID),
    'active',
  );
  assert.equal(
    questMarkerState({ [BONGBONGEE_FISH_QUEST_ID]: 'active' }, BONGBONGEE_FISH_QUEST_ID),
    'active',
  );

  assert.equal(
    questStatus({ [BONGBONGEE_FISH_QUEST_ID]: 'completed' }, BONGBONGEE_FISH_QUEST_ID),
    'completed',
  );
  assert.equal(
    questMarkerState({ [BONGBONGEE_FISH_QUEST_ID]: 'completed' }, BONGBONGEE_FISH_QUEST_ID),
    null,
  );
});

test('skip-rope quest is locked until Minty Diamonds is completed', () => {
  assert.equal(questStatus({}, BONGBONGEE_SKIP_QUEST_ID), 'locked');
  assert.equal(questMarkerState({}, BONGBONGEE_SKIP_QUEST_ID), null);

  assert.equal(
    questStatus({ [BONGBONGEE_FISH_QUEST_ID]: 'active' }, BONGBONGEE_SKIP_QUEST_ID),
    'locked',
  );

  const afterFish = { [BONGBONGEE_FISH_QUEST_ID]: 'completed' as const };
  assert.equal(questStatus(afterFish, BONGBONGEE_SKIP_QUEST_ID), 'available');
  assert.equal(questMarkerState(afterFish, BONGBONGEE_SKIP_QUEST_ID), 'available');
});

test('combined marker prefers available over active across Bongbongee quests', () => {
  assert.equal(combinedQuestMarkerState({}, [BONGBONGEE_FISH_QUEST_ID, BONGBONGEE_SKIP_QUEST_ID]), 'available');
  assert.equal(
    combinedQuestMarkerState(
      { [BONGBONGEE_FISH_QUEST_ID]: 'active' },
      [BONGBONGEE_FISH_QUEST_ID, BONGBONGEE_SKIP_QUEST_ID],
    ),
    'active',
  );
  assert.equal(
    combinedQuestMarkerState(
      { [BONGBONGEE_FISH_QUEST_ID]: 'completed' },
      [BONGBONGEE_FISH_QUEST_ID, BONGBONGEE_SKIP_QUEST_ID],
    ),
    'available',
  );
  assert.equal(
    combinedQuestMarkerState(
      {
        [BONGBONGEE_FISH_QUEST_ID]: 'completed',
        [BONGBONGEE_SKIP_QUEST_ID]: 'completed',
      },
      [BONGBONGEE_FISH_QUEST_ID, BONGBONGEE_SKIP_QUEST_ID],
    ),
    null,
  );
});

test('normalizeQuestProgress drops unknown ids and bad values', () => {
  assert.deepEqual(
    normalizeQuestProgress({
      [BONGBONGEE_FISH_QUEST_ID]: 'active',
      bogus: 'active',
      [BONGBONGEE_FISH_QUEST_ID + '-x']: 'completed',
      other: 3,
    }),
    { [BONGBONGEE_FISH_QUEST_ID]: 'active' },
  );
  assert.deepEqual(normalizeQuestProgress(null), {});
  assert.deepEqual(normalizeQuestProgress('nope'), {});
});

test('normalizeQuestCounters keeps known quest ids only', () => {
  assert.deepEqual(
    normalizeQuestCounters({
      [BONGBONGEE_SKIP_QUEST_ID]: 2.7,
      bogus: 9,
      [BONGBONGEE_FISH_QUEST_ID]: -1,
    }),
    { [BONGBONGEE_SKIP_QUEST_ID]: 2 },
  );
  assert.deepEqual(normalizeQuestCounters(null), {});
});

test('turn-in gate and progress labels for item and skip-rope quests', () => {
  assert.equal(canTurnInQuest(fish, {}), false);
  assert.equal(canTurnInQuest(fish, { 'oceanfish-uncommon': 2 }), false);
  assert.equal(canTurnInQuest(fish, { 'oceanfish-uncommon': 3 }), true);
  assert.equal(canTurnInQuest(fish, { 'oceanfish-uncommon': 9 }), true);
  assert.equal(objectiveProgressLabel(fish, { 'oceanfish-uncommon': 1 }), 'Mint Bass 1/3');
  assert.equal(objectiveProgressLabel(fish, { 'oceanfish-uncommon': 5 }), 'Mint Bass 3/3');

  assert.equal(canTurnInQuest(skip, {}, {}), false);
  assert.equal(canTurnInQuest(skip, {}, { [BONGBONGEE_SKIP_QUEST_ID]: 2 }), false);
  assert.equal(canTurnInQuest(skip, {}, { [BONGBONGEE_SKIP_QUEST_ID]: 3 }), true);
  assert.equal(
    objectiveProgressLabel(skip, {}, { [BONGBONGEE_SKIP_QUEST_ID]: 1 }),
    'Skip Rope clear 1/3',
  );
  assert.equal(
    objectiveProgressLabel(skip, {}, { [BONGBONGEE_SKIP_QUEST_ID]: 9 }),
    'Skip Rope clear 3/3',
  );
});

test('quest log lists active and completed separately', () => {
  assert.deepEqual(listActiveQuestDefs({}), []);
  assert.equal(listActiveQuestDefs({ [BONGBONGEE_FISH_QUEST_ID]: 'active' })[0]?.id, BONGBONGEE_FISH_QUEST_ID);
  assert.equal(
    listCompletedQuestDefs({ [BONGBONGEE_FISH_QUEST_ID]: 'completed' })[0]?.id,
    BONGBONGEE_FISH_QUEST_ID,
  );
});
