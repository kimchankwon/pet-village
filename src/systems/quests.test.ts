import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BONGBONGEE_FISH_QUEST_ID,
  canTurnInQuest,
  listActiveQuestDefs,
  listCompletedQuestDefs,
  normalizeQuestProgress,
  objectiveProgressLabel,
  questMarkerState,
  questStatus,
  QUESTS,
  rewardSummary,
} from './quests';

const def = QUESTS[BONGBONGEE_FISH_QUEST_ID]!;

test('Bongbongee quest asks for 3 Mint Bass and pays coins + lightstick', () => {
  assert.equal(def.itemId, 'oceanfish-uncommon');
  assert.equal(def.itemCount, 3);
  assert.equal(def.rewardCoins, 100);
  assert.deepEqual(def.rewardItems, [{ id: 'lightstick', count: 1, label: 'Carat Lightstick' }]);
  assert.match(rewardSummary(def), /100 coins/);
  assert.match(rewardSummary(def), /Carat Lightstick/);
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

test('turn-in gate and progress labels', () => {
  assert.equal(canTurnInQuest(def, {}), false);
  assert.equal(canTurnInQuest(def, { 'oceanfish-uncommon': 2 }), false);
  assert.equal(canTurnInQuest(def, { 'oceanfish-uncommon': 3 }), true);
  assert.equal(canTurnInQuest(def, { 'oceanfish-uncommon': 9 }), true);
  assert.equal(objectiveProgressLabel(def, { 'oceanfish-uncommon': 1 }), 'Mint Bass 1/3');
  assert.equal(objectiveProgressLabel(def, { 'oceanfish-uncommon': 5 }), 'Mint Bass 3/3');
});

test('quest log lists active and completed separately', () => {
  assert.deepEqual(listActiveQuestDefs({}), []);
  assert.equal(listActiveQuestDefs({ [BONGBONGEE_FISH_QUEST_ID]: 'active' })[0]?.id, BONGBONGEE_FISH_QUEST_ID);
  assert.equal(
    listCompletedQuestDefs({ [BONGBONGEE_FISH_QUEST_ID]: 'completed' })[0]?.id,
    BONGBONGEE_FISH_QUEST_ID,
  );
});
