import assert from 'node:assert/strict';
import test from 'node:test';
import { validateProfileNames } from './profileNameRules';
import { assertProfileNamesAvailable, profileNameKey } from '../../convex/lib/profileNames';

test('profile names are Unicode-normalized and collapse whitespace', () => {
  assert.deepEqual(validateProfileNames('  DaNiel   Kim  ', ' Mochi '), {
    displayName: 'DaNiel Kim',
    petName: 'Mochi',
  });
});

test('profile names reject blank, overlong, and unsafe names', () => {
  assert.throws(() => validateProfileNames(' ', 'Mochi'), /Player name/);
  assert.throws(() => validateProfileNames('Daniel', 'x'.repeat(17)), /Pet name/);
  assert.throws(() => validateProfileNames('<script>', 'Mochi'), /Player name/);
});

test('uniqueness keys are case-insensitive and reject other owners only', () => {
  assert.equal(profileNameKey('  Möchi  '), profileNameKey('MÖCHI'));
  assert.doesNotThrow(() => assertProfileNamesAvailable('user-a', 'user-a', 'user-a'));
  assert.throws(() => assertProfileNamesAvailable('user-a', 'user-b'), /player name is already taken/);
  assert.throws(() => assertProfileNamesAvailable('user-a', undefined, 'user-b'), /pet name is already taken/);
});

test('profile names support international letters and common separators', () => {
  assert.deepEqual(validateProfileNames("ダニエル-K", "モチ's"), {
    displayName: 'ダニエル-K',
    petName: "モチ's",
  });
});
