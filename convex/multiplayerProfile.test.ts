import { describe, expect, test } from 'vitest';
import { sanitizeEquippedAccessories } from './lib/admissionProfile';

describe('multiplayer admission profile', () => {
  test('drops malformed and overlong accessory ids without rejecting admission', () => {
    expect(sanitizeEquippedAccessories({
      headLeft: 'mint-pom',
      headRight: 'x'.repeat(65),
      body: 42,
      extra: '',
      unknown: 'ignored',
    })).toEqual({ headLeft: 'mint-pom' });
    expect(sanitizeEquippedAccessories(['mint-pom'])).toEqual({});
    expect(sanitizeEquippedAccessories(null)).toEqual({});
  });
});
