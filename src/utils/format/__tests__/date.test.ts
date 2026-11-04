import { describe, expect, it } from 'vitest';

import { formatDayMonth, formatEventDate, formatPosterDate, formatShortDateTime, formatTime, zoneAbbr } from '../date';

const SHOW = '2026-12-12T12:00:00Z'; // 19.00 in Jakarta

describe('date formatters', () => {
  it('writes the event date in Indonesian and English', () => {
    expect(formatEventDate(SHOW, 'id')).toBe('Sab, 12 Des 2026 · 19.00 WIB');
    expect(formatEventDate(SHOW, 'en')).toBe('Sat, 12 Dec 2026 · 7.00 pm WIB');
  });

  it('uses the venue time zone', () => {
    expect(formatEventDate('2026-10-31T11:00:00Z', 'id', 'Asia/Makassar')).toBe('Sab, 31 Okt 2026 · 19.00 WITA');
    expect(formatTime('2026-10-31T10:00:00Z', 'id', 'Asia/Jayapura')).toBe('19.00');
  });

  it('writes morning times', () => {
    expect(formatTime('2026-10-30T03:05:00Z', 'id')).toBe('10.05');
    expect(formatTime('2026-10-30T03:05:00Z', 'en')).toBe('10.05 am');
  });

  it('writes short dates, day-month and the poster date', () => {
    expect(formatShortDateTime('2026-10-30T03:00:00Z', 'id')).toBe('Jum, 30 Okt · 10.00 WIB');
    expect(formatShortDateTime('2026-10-30T03:00:00Z', 'en')).toBe('Fri, 30 Oct · 10.00 am WIB');
    expect(formatDayMonth('2026-10-29T05:00:00Z', 'id')).toBe('29 Okt');
    expect(formatPosterDate(SHOW)).toBe('12.12.26');
  });

  it('names Indonesian zones and falls back to Intl for others', () => {
    expect(zoneAbbr()).toBe('WIB');
    expect(zoneAbbr('Asia/Pontianak')).toBe('WIB');
    expect(zoneAbbr('Asia/Makassar')).toBe('WITA');
    expect(zoneAbbr('Asia/Jayapura')).toBe('WIT');
    expect(zoneAbbr('UTC')).toBe('UTC');
  });
});
