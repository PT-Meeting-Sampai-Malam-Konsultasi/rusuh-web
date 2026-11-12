import { describe, expect, it, vi } from 'vitest';

import type { Booking, Ticket } from '@core/entities/booking/booking.entity';
import type { EventSummary } from '@core/entities/catalog/catalog.entity';

import { daysLeftLabel, daysUntil, paymentMethodLabel, toETicketView, toMyOrderCardView } from '../tickets';

const t = vi.fn((key: string, options?: Record<string, unknown>) =>
  options ? `${key}:${JSON.stringify(options)}` : key,
) as never;
const money = (amount: number) => ({ amount, currency: 'IDR' as const });
const ticket = (id: string, categoryName: string, extra: Partial<Ticket> = {}): Ticket => ({
  ticketId: id,
  bookingId: 'bk_1',
  categoryName,
  holderName: `Holder ${id}`,
  nikMasked: '3174 •••• •••• 0004',
  qrPayload: `RSH1.${id}`,
  ...extra,
});
const BOOKING: Booking = {
  bookingId: 'bk_1',
  eventId: 'evt_samudra',
  status: 'PAID',
  orderCode: 'RSH-26-084731',
  price: { lines: [], ticketSubtotal: money(2170000), adminFee: money(10000), total: money(2180000) },
  paidAt: '2026-11-12T05:07:00Z',
  paymentMethod: 'qris',
  createdAt: '2026-11-12T05:00:00Z',
  serverNow: '2026-11-12T05:10:00Z',
};
const EVENT: EventSummary = {
  eventId: 'evt_samudra',
  name: 'Samudra',
  subtitle: 'Tur Gelombang 2026',
  venue: 'Stadion Utama GBK',
  venueShort: 'GBK',
  city: 'Jakarta',
  timezone: 'Asia/Jakarta',
  startsAt: '2026-12-12T12:00:00Z',
  doorsOpenAt: '2026-12-12T09:00:00Z',
  state: 'on_sale',
};

describe('ticket formatting', () => {
  it('counts calendar days in the venue zone and labels them', () => {
    // 17.30 UTC on the 11th is 00.30 WIB on the 12th: already the event day in Jakarta.
    expect(daysUntil('2026-12-12T12:00:00Z', '2026-12-11T17:30:00Z', 'Asia/Jakarta')).toBe(0);
    expect(daysUntil('2026-12-12T12:00:00Z', '2026-12-11T16:30:00Z', 'Asia/Jakarta')).toBe(1);
    expect(daysUntil('2026-12-12T12:00:00Z', '2026-12-11T03:00:00Z')).toBe(1);
    expect(daysUntil('2026-12-12T12:00:00Z', '2026-11-12T03:00:00Z')).toBe(30);
    expect(daysLeftLabel(-1, t)).toBe('');
    expect(daysLeftLabel(0, t)).toBe('tickets_today');
    expect(daysLeftLabel(1, t)).toBe('tickets_tomorrow');
    expect(daysLeftLabel(25, t)).toBe('tickets_days_left:{"count":25}');
  });

  it('names payment methods, translating only the card', () => {
    expect(paymentMethodLabel('qris', t)).toBe('QRIS');
    expect(paymentMethodLabel('bca_va', t)).toBe('BCA Virtual Account');
    expect(paymentMethodLabel('card', t)).toBe('ticket_method_card');
    expect(paymentMethodLabel(null, t)).toBe('');
    expect(paymentMethodLabel('crypto' as never, t)).toBe('');
  });

  it('formats an upcoming order card', () => {
    const view = toMyOrderCardView(
      { booking: BOOKING, event: EVENT, tickets: [ticket('t1', 'Festival B'), ticket('t2', 'Tribun Atas')] },
      { past: false, serverNow: '2026-11-12T05:10:00Z', locale: 'id', t },
    );
    expect(view).toMatchObject({
      bookingId: 'bk_1',
      href: '/tickets/detail?booking=bk_1',
      title: 'Samudra — Tur Gelombang 2026',
      posterTitle: 'Samudra',
      dateLine: 'Sab, 12 Des 2026 · 19.00 WIB · Stadion Utama GBK, Jakarta',
      day: '12',
      month: 'Des',
      daysLeft: 'tickets_days_left:{"count":30}',
      ticketCount: 'tickets_count:{"count":2}',
      orderCode: 'RSH-26-084731',
      total: 'Rp 2.180.000',
    });
    expect(view.stubs).toEqual([
      { id: 't1', category: 'Festival B', holder: 'Holder t1' },
      { id: 't2', category: 'Tribun Atas', holder: 'Holder t2' },
    ]);
  });

  it('greys a past card and copes without the event or an order code', () => {
    const past = toMyOrderCardView(
      { booking: BOOKING, event: { ...EVENT, subtitle: undefined, city: undefined }, tickets: [] },
      { past: true, serverNow: '2026-12-20T00:00:00Z', locale: 'en', t },
    );
    expect(past).toMatchObject({ posterTone: 'ink', daysLeft: '', title: 'Samudra', month: 'Dec' });
    expect(past.dateLine).toBe('Sat, 12 Dec 2026 · 7.00 pm WIB · Stadion Utama GBK');

    const bare = toMyOrderCardView(
      { booking: { ...BOOKING, orderCode: undefined }, event: null, tickets: [ticket('t1', 'Festival B')] },
      { past: false, serverNow: null, locale: 'id', t },
    );
    expect(bare).toMatchObject({ title: 'Festival B', posterTitle: 'RUSUH', dateLine: '', day: '', daysLeft: '' });
    expect(bare.orderCode).toBe('');
    expect(
      toMyOrderCardView(
        { booking: BOOKING, event: null, tickets: [] },
        { past: false, serverNow: null, locale: 'id', t },
      ).title,
    ).toBe('tickets_unknown_event');
  });

  it('formats the e-ticket: paid time in the venue zone, one stub per ticket, a colour per category', () => {
    const view = toETicketView(
      {
        booking: BOOKING,
        event: EVENT,
        tickets: [
          ticket('t1', 'Festival B', { ticketCode: 'SMD-FB-04827', entryGate: 'Gerbang 5', seating: 'standing' }),
          ticket('t2', 'Festival B', { entryGate: 'Gerbang 5' }),
          ticket('t3', 'Tribun Atas', { seating: 'seated' }),
        ],
      },
      { locale: 'id', t },
    );
    expect(view.stamp).toBe('ticket_paid · 12.07 WIB');
    expect(view.heading).toBe('ticket_heading:{"place":"GBK"}');
    expect(view.lead).toBe('ticket_lead:{"count":3,"event":"SAMUDRA"}');
    expect(view).toMatchObject({ orderCode: 'RSH-26-084731', total: 'Rp 2.180.000', method: 'QRIS' });
    expect(view.stubs.map((s) => [s.label, s.entry, s.posterTone, s.code])).toEqual([
      ['ticket_stub_label:{"n":1,"total":3}', 'Gerbang 5 · ticket_seating_standing', 'paper', 'SMD-FB-04827'],
      ['ticket_stub_label:{"n":2,"total":3}', 'Gerbang 5', 'paper', ''],
      ['ticket_stub_label:{"n":3,"total":3}', 'ticket_seating_seated', 'pink', ''],
    ]);
    expect(view.stubs[0].doorsOpen).toBe('Sab, 12 Des · 16.00 WIB');
    expect(view.calendar).toEqual({
      title: 'Samudra — Tur Gelombang 2026',
      startsAt: '2026-12-12T12:00:00Z',
      location: 'Stadion Utama GBK, Jakarta',
    });
  });

  it('formats the e-ticket without the event, a paid time or an order code', () => {
    const view = toETicketView(
      {
        booking: { ...BOOKING, eventId: 'evt_x', paidAt: null, orderCode: undefined, paymentMethod: null },
        event: null,
        tickets: [ticket('t1', 'A'), ticket('t2', 'B')],
      },
      { locale: 'en', t },
    );
    expect(view).toMatchObject({ stamp: 'ticket_paid', heading: 'ticket_heading_fallback', orderCode: '', method: '' });
    expect(view.calendar).toBeNull();
    expect(view.stubs[0]).toMatchObject({ posterTitle: 'RUSUH', doorsOpen: '', entry: '' });
    expect(new Set(view.stubs.map((s) => s.posterTone)).size).toBe(2);
  });
});
