import i18n from 'i18next';
import { beforeAll, describe, expect, it } from 'vitest';

import type { EventState, EventSummary } from '@core/entities/catalog/catalog.entity';
import en from '@translation/locale/en.json';
import id from '@translation/locale/id.json';

import { posterToneFor, toEventCardView } from '../event-card';

const NOW = '2026-10-22T19:00:00Z';

const base: EventSummary = {
  eventId: 'evt_samudra',
  name: 'Samudra',
  subtitle: 'Tur Gelombang 2026',
  format: 'Tour',
  venue: 'Stadion Utama GBK',
  venueShort: 'GBK',
  city: 'Jakarta',
  timezone: 'Asia/Jakarta',
  startsAt: '2026-12-12T12:00:00Z',
  saleOpensAt: '2026-10-30T03:00:00Z',
  waitingRoomOpensAt: '2026-10-30T02:30:00Z',
  saleEndsAt: '2026-10-29T05:00:00Z',
  state: 'on_sale',
  priceFrom: { amount: 450000, currency: 'IDR' },
  capacity: 12000,
};

const t = i18n.getFixedT('id');
const tEn = i18n.getFixedT('en');
const view = (state: EventState, extra: Partial<EventSummary> = {}, lang: 'id' | 'en' = 'id') =>
  toEventCardView({ ...base, state, ...extra }, { t: lang === 'id' ? t : tEn, locale: lang, serverNow: NOW });

beforeAll(async () => {
  await i18n.init({
    resources: { id: { translation: id }, en: { translation: en } },
    lng: 'id',
    interpolation: { escapeValue: false },
  });
});

describe('toEventCardView', () => {
  it('formats a live event', () => {
    const card = view('on_sale');
    expect(card).toMatchObject({
      id: 'evt_samudra',
      title: 'Samudra — Tur Gelombang 2026',
      kicker: 'Tour',
      posterDate: '12.12.26',
      posterPlace: 'GBK · JAKARTA',
      stamp: { tone: 'on', label: 'Antrian dibuka' },
      dateLine: 'Sab, 12 Des 2026 · 19.00 WIB',
      venueLine: 'Stadion Utama GBK, Jakarta',
      price: { label: 'Mulai', amount: 'Rp 450.000' },
      outcome: null,
      note: null,
      finished: false,
    });
  });

  it('formats in English', () => {
    const card = view('almost_gone', {}, 'en');
    expect(card.stamp.label).toBe('Almost gone');
    expect(card.dateLine).toBe('Sat, 12 Dec 2026 · 7.00 pm WIB');
    expect(card.price).toEqual({ label: 'From', amount: 'Rp 450,000' });
  });

  it('shows the opening time and time left from server time for coming-soon events', () => {
    const card = view('coming_soon');
    expect(card.stamp).toEqual({ tone: 'soon', label: 'Segera dijual' });
    expect(card.note).toEqual({ lead: 'Dibuka', strong: 'Jum, 30 Okt · 09.30 WIB', detail: '7 hari 7 jam lagi' });
  });

  it('uses the sale opening when no waiting-room time is set, in hours and minutes', () => {
    const card = view('coming_soon', { waitingRoomOpensAt: undefined, saleOpensAt: '2026-10-22T21:05:00Z' });
    expect(card.note).toEqual({ lead: 'Dibuka', strong: 'Jum, 23 Okt · 04.05 WIB', detail: '2 jam 5 menit lagi' });
    const soon = view('coming_soon', { waitingRoomOpensAt: '2026-10-22T19:00:30Z' });
    expect(soon.note?.detail).toBe('1 menit lagi');
  });

  it('drops the time left once the opening has passed, and the note without any opening time', () => {
    expect(view('coming_soon', { waitingRoomOpensAt: '2026-10-01T00:00:00Z' }).note?.detail).toBeUndefined();
    expect(view('coming_soon', { waitingRoomOpensAt: undefined, saleOpensAt: undefined }).note).toBeNull();
  });

  it('explains temporarily full', () => {
    const card = view('temporarily_full');
    expect(card.stamp.tone).toBe('full');
    expect(card.note?.lead).toContain('10 menit');
    expect(card.price?.amount).toBe('Rp 450.000');
  });

  it('says how fast a sold-out event sold, and hides the price', () => {
    const card = view('sold_out', { saleOpensAt: '2026-10-30T03:00:00Z', soldOutAt: '2026-10-30T03:41:00Z' });
    expect(card).toMatchObject({ finished: true, price: null, stamp: { tone: 'sold', label: 'Habis terjual' } });
    expect(card.outcome).toBe('Semua 12.000 tiket terjual dalam 41 menit.');
    const slow = view('sold_out', { soldOutAt: '2026-10-30T05:10:00Z' }, 'en');
    expect(slow.outcome).toBe('All 12,000 tickets sold in 2 h 10 min.');
    expect(view('sold_out', { soldOutAt: null }).outcome).toBe('Semua tiket sudah terjual.');
  });

  it('says when an ended sale closed', () => {
    expect(view('ended').outcome).toBe('Penjualan online ditutup 29 Okt.');
    expect(view('ended', { saleEndsAt: undefined }).outcome).toBe('Penjualan online sudah ditutup.');
  });

  it('copes with the optional fields missing', () => {
    const card = toEventCardView(
      { eventId: 'e1', name: 'Deru', venue: 'Jatim Expo', startsAt: '2026-12-04T13:00:00Z', state: 'on_sale' },
      { t, locale: 'id', serverNow: NOW },
    );
    expect(card).toMatchObject({ title: 'Deru', venueLine: 'Jatim Expo', posterPlace: 'JATIM EXPO', price: null });
    expect(card.dateLine).toBe('Jum, 4 Des 2026 · 20.00 WIB');
  });
});

describe('posterToneFor', () => {
  it('is stable per event and uses every tone', () => {
    expect(posterToneFor('evt_deru')).toBe(posterToneFor('evt_deru'));
    const tones = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(posterToneFor));
    expect(tones.size).toBe(4);
  });
});
