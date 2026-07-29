import { describe, expect, test } from 'vitest';
import { sanitizeEquippedAccessories } from './lib/admissionProfile';

describe('multiplayer admission profile', () => {
  test('drops malformed and overlong accessory ids without rejecting admission', () => {
    expect(sanitizeEquippedAccessories({
      headLeft: 'aqua-clip',
      headRight: 'x'.repeat(65),
      body: 42,
      extra: '',
      unknown: 'ignored',
    })).toEqual({ headLeft: 'aqua-clip' });
    expect(sanitizeEquippedAccessories(['aqua-clip'])).toEqual({});
    expect(sanitizeEquippedAccessories(null)).toEqual({});
  });
});
