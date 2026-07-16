import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildGetTrack,
  GET_CATCH_HALF_WIDTH,
  GET_DIFFICULTIES,
  GET_PLAYER_SPEED,
  GET_POOP_HALF_WIDTH,
  GET_SAFE_MARGIN,
  getGetTravelDistance,
} from '../../src/systems/getGameRules.ts';

const FIELD = { minX: 70, maxX: 730, spawnY: 64, catchY: 480 };
const DIFFICULTIES = ['easy', 'normal', 'hard'];

function seededRandom(seed = 7) {
  return () => {
    seed = (seed * 48271) % 0x7fffffff;
    return seed / 0x7fffffff;
  };
}

test('Get difficulty makes falling objects progressively faster', () => {
  assert.ok(GET_DIFFICULTIES.easy.fallSpeed < GET_DIFFICULTIES.normal.fallSpeed);
  assert.ok(GET_DIFFICULTIES.normal.fallSpeed < GET_DIFFICULTIES.hard.fallSpeed);
});

test('Get catcher travel uses the full elapsed track time after a frame stall', () => {
  assert.equal(getGetTravelDistance(50), 18);
  assert.equal(getGetTravelDistance(1000), GET_PLAYER_SPEED);
  assert.equal(getGetTravelDistance(1200), 432);
});

for (const difficulty of DIFFICULTIES) {
  test(`${difficulty} Get track keeps every catch and dodge reachable`, () => {
    const track = buildGetTrack(difficulty, { ...FIELD, random: seededRandom() });
    const byArrival = [...track].sort((a, b) => a.arrivalMs - b.arrivalMs);
    let x = (FIELD.minX + FIELD.maxX) / 2;
    let timeMs = 0;
    let notes = 0;
    let poop = 0;

    for (const event of byArrival) {
      assert.ok(event.x >= FIELD.minX && event.x <= FIELD.maxX);
      assert.ok(event.spawnMs >= 0, 'objects must not need to spawn before the run starts');
      const reachable = (GET_PLAYER_SPEED * (event.arrivalMs - timeMs)) / 1000;

      if (event.kind === 'note') {
        assert.ok(Math.abs(event.x - x) <= reachable + 0.001, 'note is reachable');
        x = event.x;
        timeMs = event.arrivalMs;
        notes++;
      } else {
        assert.notEqual(event.escapeX, undefined);
        assert.ok(
          Math.abs(event.escapeX - event.x) >
            GET_CATCH_HALF_WIDTH + GET_POOP_HALF_WIDTH + GET_SAFE_MARGIN,
          'escape route fully clears the poop',
        );
        assert.ok(Math.abs(event.escapeX - x) <= reachable + 0.001, 'poop is avoidable after catch');
        x = event.escapeX;
        timeMs = event.arrivalMs;
        poop++;
      }
    }

    assert.equal(notes, GET_DIFFICULTIES[difficulty].notesToClear);
    assert.ok(poop > 0);
  });
}
