import assert from 'node:assert/strict';
import test from 'node:test';
import { BED_INTERACT_RADIUS, bedTuckAvailability, nearestBedInteraction } from './housePetActions';

test('bed tuck is offered only when a Dream Bed is placed', () => {
  assert.deepEqual(bedTuckAvailability([], false), {
    hasBed: false,
    disabled: true,
    label: 'Tuck into bed (needs a Dream Bed)',
  });
  assert.deepEqual(bedTuckAvailability([{ id: 'bed' }], false), {
    hasBed: true,
    disabled: false,
    label: 'Tuck into bed (full energy!)',
  });
});

test('bed tuck cannot be started twice while the pet is already tucking', () => {
  assert.equal(bedTuckAvailability([{ id: 'bed' }], true).disabled, true);
});

const bedAt = (x: number, y: number) => ({ gx: Math.round(x / 32), gy: Math.round(y / 32), x, y });

test('standing next to a bed offers the tuck interaction', () => {
  const interaction = nearestBedInteraction([bedAt(200, 200)], { x: 200, y: 200 + BED_INTERACT_RADIUS - 1 }, {
    petName: 'Mochi',
    petTucking: false,
  });
  assert.ok(interaction);
  assert.equal(interaction.label, 'E / Space / click — Tuck Mochi into bed');
  assert.equal(interaction.x, 200);
  assert.equal(interaction.y, 200);
});

test('the bed prompt needs a bed in range and no tuck already running', () => {
  const player = { x: 200, y: 400 };
  assert.equal(nearestBedInteraction([], player, { petName: 'Mochi', petTucking: false }), null);
  assert.equal(
    nearestBedInteraction([bedAt(200, 200)], player, { petName: 'Mochi', petTucking: false }),
    null,
    'out of range',
  );
  assert.equal(
    nearestBedInteraction([bedAt(200, 390)], player, { petName: 'Mochi', petTucking: true }),
    null,
    'already tucking',
  );
});

test('the nearest bed wins when the room has several', () => {
  const interaction = nearestBedInteraction(
    [bedAt(160, 200), bedAt(220, 200)],
    { x: 210, y: 200 },
    { petName: 'Mochi', petTucking: false },
  );
  assert.equal(interaction?.x, 220);
});
