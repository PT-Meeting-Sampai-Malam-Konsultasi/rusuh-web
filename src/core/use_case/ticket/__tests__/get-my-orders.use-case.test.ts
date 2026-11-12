import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Booking, Ticket } from '@core/entities/booking/booking.entity';

import { GetMyOrdersUseCase } from '../get-my-orders.use-case';

const NOW = '2026-11-12T03:00:00Z';
const money = (amount: number) => ({ amount, currency: 'IDR' as const });
const ticket = (id: string, bookingId: string): Ticket => ({
  ticketId: id,
  bookingId,
  categoryName: 'Festival B',
  holderName: `Holder ${id}`,
  nikMasked: '3174 •••• •••• 0004',
  qrPayload: `RSH1.${id}`,
});
const booking = (bookingId: string, eventId: string, status: Booking['status'] = 'PAID'): Booking => ({
  bookingId,
  eventId,
  status,
  price: { lines: [], ticketSubtotal: money(0), adminFee: money(0), total: money(100) },
  createdAt: NOW,
  serverNow: NOW,
});
const event = (eventId: string, startsAt: string) => ({
  eventId,
  name: eventId,
  venue: 'V',
  startsAt,
  state: 'on_sale',
});

describe('GetMyOrdersUseCase', () => {
  const bookingService = {
    getCategories: vi.fn(),
    getBooking: vi.fn(),
    listMyTickets: vi.fn(),
    downloadTickets: vi.fn(),
  };
  const catalogService = { listEvents: vi.fn(), getEvent: vi.fn() };
  const useCase = GetMyOrdersUseCase({ bookingService, catalogService } as never);
  const bookings: Record<string, Booking> = {};
  const events: Record<string, ReturnType<typeof event>> = {};

  beforeEach(() => {
    vi.clearAllMocks();
    bookingService.getBooking.mockImplementation(async (id: string) => ({ data: bookings[id], status: 200 }));
    catalogService.getEvent.mockImplementation(async (id: string) => {
      if (!events[id]) throw { status: 404, code: 'NOT_FOUND', message: 'x' };
      return { data: events[id], status: 200 };
    });
  });

  it('answers empty without more calls when there are no tickets', async () => {
    bookingService.listMyTickets.mockResolvedValue({ data: { items: [] }, status: 200 });
    await expect(useCase.execute()).resolves.toEqual({ upcoming: [], past: [], serverNow: null });
    expect(bookingService.getBooking).not.toHaveBeenCalled();
  });

  it('groups tickets per booking, loads each booking and event once, and splits upcoming from past', async () => {
    Object.assign(bookings, {
      bk_sam: booking('bk_sam', 'evt_sam'),
      bk_pel: booking('bk_pel', 'evt_pel'),
      bk_kel: booking('bk_kel', 'evt_kel'),
      bk_old: booking('bk_old', 'evt_old'),
      bk_tonight: booking('bk_tonight', 'evt_tonight'),
    });
    Object.assign(events, {
      evt_sam: event('evt_sam', '2026-12-12T12:00:00Z'),
      evt_pel: event('evt_pel', '2026-12-04T12:30:00Z'),
      evt_kel: event('evt_kel', '2026-11-09T11:00:00Z'),
      evt_old: event('evt_old', '2026-10-01T11:00:00Z'),
      // Started two hours ago: still "coming up" tonight.
      evt_tonight: event('evt_tonight', '2026-11-12T01:00:00Z'),
    });
    bookingService.listMyTickets.mockResolvedValue({
      data: {
        items: [
          ticket('t1', 'bk_sam'),
          ticket('t2', 'bk_pel'),
          ticket('t3', 'bk_sam'),
          ticket('t4', 'bk_kel'),
          ticket('t5', 'bk_old'),
          ticket('t6', 'bk_tonight'),
        ],
      },
      status: 200,
    });

    const result = await useCase.execute();
    expect(bookingService.getBooking).toHaveBeenCalledTimes(5);
    expect(catalogService.getEvent).toHaveBeenCalledTimes(5);
    expect(result.upcoming.map((o) => o.booking.bookingId)).toEqual(['bk_tonight', 'bk_pel', 'bk_sam']);
    expect(result.past.map((o) => o.booking.bookingId)).toEqual(['bk_kel', 'bk_old']);
    expect(result.upcoming[2].tickets.map((t) => t.ticketId)).toEqual(['t1', 't3']);
    expect(result.serverNow).toBe(NOW);
  });

  it('keeps an order whose event failed to load, last among the upcoming, and drops unpaid bookings', async () => {
    Object.assign(bookings, {
      bk_a: booking('bk_a', 'evt_a'),
      bk_gone: booking('bk_gone', 'evt_gone'),
      bk_held: booking('bk_held', 'evt_a', 'HELD'),
    });
    events.evt_a = event('evt_a', '2026-12-01T12:00:00Z');
    bookingService.listMyTickets.mockResolvedValue({
      data: { items: [ticket('t1', 'bk_gone'), ticket('t2', 'bk_a'), ticket('t3', 'bk_held')] },
      status: 200,
    });
    const result = await useCase.execute();
    expect(result.upcoming.map((o) => [o.booking.bookingId, o.event?.eventId ?? null])).toEqual([
      ['bk_a', 'evt_a'],
      ['bk_gone', null],
    ]);
    expect(result.past).toEqual([]);
  });

  it('fails as a whole when the ticket list or a booking fails', async () => {
    const error = { status: 503, code: 'INTERNAL_ERROR', message: 'x' };
    bookingService.listMyTickets.mockRejectedValueOnce(error);
    await expect(useCase.execute()).rejects.toBe(error);

    bookingService.listMyTickets.mockResolvedValue({ data: { items: [ticket('t1', 'bk_x')] }, status: 200 });
    bookingService.getBooking.mockRejectedValueOnce(error);
    await expect(useCase.execute()).rejects.toBe(error);

    bookings.bk_x = booking('bk_x', 'evt_x');
    catalogService.getEvent.mockRejectedValueOnce(error);
    await expect(useCase.execute()).rejects.toBe(error);
  });
});
