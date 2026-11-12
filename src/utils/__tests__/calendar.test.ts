import { describe, expect, it } from 'vitest';

import { buildCalendarEvent, googleCalendarUrl, outlookCalendarUrl } from '../calendar';

describe('buildCalendarEvent', () => {
  const base = {
    uid: 'bk_1@rusuh-tiket.web.id',
    title: 'Samudra — Tur Gelombang 2026',
    startsAt: '2026-12-12T12:00:00Z',
    stamp: '2026-11-12T03:04:05.678Z',
  };

  it('writes one VEVENT in UTC with CRLF lines, four hours long by default', () => {
    const ics = buildCalendarEvent(base);
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics).toContain('\r\nDTSTAMP:20261112T030405Z\r\n');
    expect(ics).toContain('\r\nDTSTART:20261212T120000Z\r\n');
    expect(ics).toContain('\r\nDTEND:20261212T160000Z\r\n');
    expect(ics).toContain('\r\nUID:bk_1@rusuh-tiket.web.id\r\n');
    expect(ics).not.toContain('LOCATION');
    expect(ics).not.toContain('DESCRIPTION');
  });

  it('escapes text, keeps an explicit end, and folds long lines', () => {
    const ics = buildCalendarEvent({
      ...base,
      endsAt: '2026-12-12T15:00:00Z',
      location: 'Stadion Utama GBK, Jakarta; Gerbang 5',
      description: `Bawa KTP asli.\nPesanan RSH-26-084731 ${'x'.repeat(80)}`,
    });
    expect(ics).toContain('DTEND:20261212T150000Z');
    expect(ics).toContain('LOCATION:Stadion Utama GBK\\, Jakarta\; Gerbang 5');
    expect(ics).toContain('DESCRIPTION:Bawa KTP asli.\\nPesanan');
    const lines = ics.split('\r\n');
    expect(lines.every((line) => new TextEncoder().encode(line).length <= 75)).toBe(true);
    expect(lines.some((line) => line.startsWith(' '))).toBe(true);
  });

  it('builds a filled-in Google Calendar link, four hours long by default', () => {
    const url = new URL(
      googleCalendarUrl({
        title: base.title,
        startsAt: base.startsAt,
        location: 'GBK, Jakarta',
        description: 'Bawa KTP',
      }),
    );
    expect(url.origin + url.pathname).toBe('https://calendar.google.com/calendar/render');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      action: 'TEMPLATE',
      text: 'Samudra — Tur Gelombang 2026',
      dates: '20261212T120000Z/20261212T160000Z',
      location: 'GBK, Jakarta',
      details: 'Bawa KTP',
    });
    const bare = new URL(googleCalendarUrl({ title: 'x', startsAt: base.startsAt, endsAt: '2026-12-12T13:00:00Z' }));
    expect(bare.searchParams.get('dates')).toBe('20261212T120000Z/20261212T130000Z');
    expect(bare.searchParams.has('location')).toBe(false);
    expect(bare.searchParams.has('details')).toBe(false);
  });

  it('builds a filled-in Outlook link', () => {
    const url = new URL(
      outlookCalendarUrl({ title: base.title, startsAt: base.startsAt, location: 'GBK', description: 'Bawa KTP' }),
    );
    expect(url.origin + url.pathname).toBe('https://outlook.live.com/calendar/0/deeplink/compose');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      path: '/calendar/action/compose',
      rru: 'addevent',
      subject: 'Samudra — Tur Gelombang 2026',
      startdt: '2026-12-12T12:00:00Z',
      enddt: '2026-12-12T16:00:00Z',
      location: 'GBK',
      body: 'Bawa KTP',
    });
    const bare = new URL(outlookCalendarUrl({ title: 'x', startsAt: base.startsAt }));
    expect(bare.searchParams.has('location')).toBe(false);
    expect(bare.searchParams.has('body')).toBe(false);
  });
});
