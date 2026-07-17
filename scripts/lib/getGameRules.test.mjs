import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildGetTrack,
  GET_BOWL_BASE_HALF_WIDTH,
  GET_CATCH_HALF_WIDTH,
  GET_DIFFICULTIES,
  GET_ENERGY_COST,
  GET_PLAYER_SPEED,
  GET_POOP_HALF_WIDTH,
  GET_SAFE_MARGIN,
  getGetBowlScaleX,
  getGetNoteTexture,
  GET_WIN_REWARDS,
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

function sequenceRandom(values, fallback = 0.5) {
  let index = 0;
  return () => values[index++] ?? fallback;
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

test('Get clear rewards increase with difficulty', () => {
  assert.deepEqual(GET_WIN_REWARDS.easy, { coins: 6, happiness: 5 });
  assert.deepEqual(GET_WIN_REWARDS.normal, { coins: 14, happiness: 9 });
  assert.deepEqual(GET_WIN_REWARDS.hard, { coins: 26, happiness: 14 });
});

test('Get energy cost increases with difficulty', () => {
  assert.deepEqual(GET_ENERGY_COST, { easy: 5, normal: 8, hard: 12 });
});

test('Get bowl width shrinks from Easy to Normal to Hard', () => {
  assert.equal(GET_BOWL_BASE_HALF_WIDTH, 36);
  assert.deepEqual(GET_CATCH_HALF_WIDTH, { easy: 58, normal: 42, hard: 26 });
  assert.ok(getGetBowlScaleX('easy') > getGetBowlScaleX('normal'));
  assert.ok(getGetBowlScaleX('normal') > 1);
  assert.ok(getGetBowlScaleX('hard') < 1);
});

test('Get can render crotchets, quavers, and double quavers', () => {
  assert.equal(getGetNoteTexture(() => 0), 'music-note-crotchet');
  assert.equal(getGetNoteTexture(() => 0.34), 'music-note-quaver');
  assert.equal(getGetNoteTexture(() => 0.67), 'music-note-double-quaver');
});

test('Get tracks vary note timing, positions, and poop cadence between runs', () => {
  const first = buildGetTrack('normal', { ...FIELD, random: seededRandom(7) });
  const second = buildGetTrack('normal', { ...FIELD, random: seededRandom(99) });
  assert.notDeepEqual(first, second);

  const firstNotes = first.filter((event) => event.kind === 'note');
  const intervals = firstNotes.slice(1).map((event, index) => event.arrivalMs - firstNotes[index].arrivalMs);
  assert.ok(new Set(intervals.map((interval) => Math.round(interval))).size > 1);

  const poopGaps = [];
  let notesSincePoop = 0;
  for (const event of [...first].sort((a, b) => a.arrivalMs - b.arrivalMs)) {
    if (event.kind === 'note') notesSincePoop++;
    else {
      poopGaps.push(notesSincePoop);
      notesSincePoop = 0;
    }
  }
  assert.ok(new Set(poopGaps).size > 1);
});

test('Easy worst-case post-poop timing keeps the next note within its reachable distance', () => {
  const track = buildGetTrack('easy', {
    ...FIELD,
    random: sequenceRandom([
      0, // first poop after two notes
      0.5, 0.5, // first note position and interval jitter
      0.5, 0, // second note position and minimum interval jitter
      0.5, // following poop gap
      0.5, 1, 1, // centered poop, right escape, maximum delay jitter
      1, // place the next note at the edge of its allowed travel
    ]),
  });
  const byArrival = [...track].sort((a, b) => a.arrivalMs - b.arrivalMs);
  const poopIndex = byArrival.findIndex((event) => event.kind === 'poop');
  const poop = byArrival[poopIndex];
  const nextNote = byArrival[poopIndex + 1];

  assert.equal(poop.kind, 'poop');
  assert.equal(nextNote.kind, 'note');
  assert.equal(nextNote.arrivalMs - poop.arrivalMs, 30);
  const reachableWithHeadroom = getGetTravelDistance(30) * 0.82;
  assert.ok(Math.abs(nextNote.x - poop.escapeX) <= reachableWithHeadroom + 0.001);
});

for (const difficulty of DIFFICULTIES) {
  test(`${difficulty} Get track keeps every catch and dodge reachable`, () => {
    for (let seed = 1; seed <= 30; seed++) {
      const track = buildGetTrack(difficulty, { ...FIELD, random: seededRandom(seed) });
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
              GET_CATCH_HALF_WIDTH[difficulty] + GET_POOP_HALF_WIDTH + GET_SAFE_MARGIN,
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
    }
  });
}
