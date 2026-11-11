import { describe, expect, it } from 'vitest';

import { maskNik, toNikDigits } from '../nik';

describe('toNikDigits', () => {
  it.each([
    ['3174 0552 0396 0004', '3174055203960004'],
    ['3174-0552-0396-0004', '3174055203960004'],
    ['3174 0552-0396 0004', '3174055203960004'],
    ['31a74b', '3174'],
    ['abc', ''],
    ['', ''],
  ])('%j → %j', (input, expected) => {
    expect(toNikDigits(input)).toBe(expected);
  });

  it('adds no length rule', () => {
    expect(toNikDigits('12345678901234567890')).toBe('12345678901234567890');
  });
});

describe('maskNik', () => {
  it.each([
    ['', ''],
    ['3', '3'],
    ['3174', '3174'],
    ['317405', '3174 05'],
    ['31740552', '3174 0552'],
    ['317405520', '3174 •552 0'],
    ['3174055203', '3174 ••52 03'],
    ['3174055203960004', '3174 •••• •••• 0004'],
  ])('%j → %j', (input, expected) => {
    expect(maskNik(input)).toBe(expected);
  });

  it('ignores anything that is not a digit', () => {
    expect(maskNik('3174 0552 0396 0004')).toBe('3174 •••• •••• 0004');
  });

  it('never shows more than 8 digits', () => {
    for (let length = 0; length <= 24; length += 1) {
      const digits = '1234567890'.repeat(3).slice(0, length);
      const shown = maskNik(digits).replace(/\D/g, '').length;
      expect(shown).toBe(Math.min(length, 8));
    }
  });
});
