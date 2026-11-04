import { describe, expect, it } from 'vitest';

import { durationParts } from '../duration';
import { formatCount, formatRupiah } from '../number';

describe('number formatters', () => {
  it('groups thousands per language', () => {
    expect(formatRupiah(450000, 'id')).toBe('Rp 450.000');
    expect(formatRupiah(2180000, 'en')).toBe('Rp 2,180,000');
    expect(formatCount(1248, 'id')).toBe('1.248');
  });
});

describe('durationParts', () => {
  it('splits into days, hours and minutes, rounding up', () => {
    expect(durationParts((7 * 24 + 14) * 3_600_000)).toEqual({ days: 7, hours: 14, minutes: 0 });
    expect(durationParts(41 * 60_000 - 5_000)).toEqual({ days: 0, hours: 0, minutes: 41 });
    expect(durationParts(1)).toEqual({ days: 0, hours: 0, minutes: 1 });
  });

  it('never goes negative', () => {
    expect(durationParts(-5000)).toEqual({ days: 0, hours: 0, minutes: 0 });
  });
});
