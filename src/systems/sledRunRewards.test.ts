import test from 'node:test';
import assert from 'node:assert/strict';
import { sledRunReward } from './sledRunRewards';

test('sled rewards scale with difficulty and finishing place', () => {
  assert.deepEqual(sledRunReward('easy', 1), { coins: 8, happiness: 8 });
  assert.deepEqual(sledRunReward('hard', 1), { coins: 22, happiness: 8 });
  assert.deepEqual(sledRunReward('hard', 4), { coins: 5, happiness: 2 });
  assert.equal(sledRunReward('medium', 0), undefined);
  assert.equal(sledRunReward('medium', 5), undefined);
});
