import assert from 'node:assert/strict';
import test from 'node:test';
import { bedTuckAvailability } from './housePetActions';

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
