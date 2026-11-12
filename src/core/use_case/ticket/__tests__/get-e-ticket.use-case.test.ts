import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GetETicketUseCase } from '../get-e-ticket.use-case';

const money = (amount: number) => ({ amount, currency: 'IDR' as const });
const booking = (status: string, tickets?: unknown[]) => ({
  bookingId: 'bk_1',
  eventId: 'evt_sam',
  status,
  price: { lines: [], ticketSubtotal: money(0), adminFee: money(0), total: money(0) },
  createdAt: '2026-11-12T03:00:00Z',
  serverNow: '2026-11-12T03:00:00Z',
  ...(tickets ? { tickets } : {}),
});

describe('GetETicketUseCase', () => {
  const bookingService = { getBooking: vi.fn() };
  const catalogService = { getEvent: vi.fn() };
  const useCase = GetETicketUseCase({ bookingService, catalogService } as never);
  const EVENT = { eventId: 'evt_sam', name: 'Samudra' };

  beforeEach(() => {
    vi.clearAllMocks();
    catalogService.getEvent.mockResolvedValue({ data: EVENT, status: 200 });
  });

  it('returns a paid booking with its event and tickets', async () => {
    const tickets = [{ ticketId: 't1' }];
    bookingService.getBooking.mockResolvedValue({ data: booking('PAID', tickets), status: 200 });
    await expect(useCase.execute('bk_1')).resolves.toMatchObject({ kind: 'paid', event: EVENT, tickets });
    expect(bookingService.getBooking).toHaveBeenCalledWith('bk_1');
    expect(catalogService.getEvent).toHaveBeenCalledWith('evt_sam');
  });

  it('shows the tickets without the event when the catalog no longer has it, and no tickets as an empty list', async () => {
    bookingService.getBooking.mockResolvedValue({ data: booking('PAID'), status: 200 });
    catalogService.getEvent.mockRejectedValueOnce({ status: 404, code: 'NOT_FOUND', message: 'x' });
    await expect(useCase.execute('bk_1')).resolves.toMatchObject({ kind: 'paid', event: null, tickets: [] });
    const error = { status: 503, code: 'INTERNAL_ERROR', message: 'x' };
    catalogService.getEvent.mockRejectedValueOnce(error);
    await expect(useCase.execute('bk_1')).rejects.toBe(error);
  });

  it('says not paid for any other status, without loading the event', async () => {
    bookingService.getBooking.mockResolvedValue({ data: booking('EXPIRED'), status: 200 });
    await expect(useCase.execute('bk_1')).resolves.toEqual({ kind: 'not-paid', status: 'EXPIRED', eventId: 'evt_sam' });
    expect(catalogService.getEvent).not.toHaveBeenCalled();
  });

  it('says not found on a 404 and lets other errors through', async () => {
    bookingService.getBooking.mockRejectedValueOnce({ status: 404, code: 'NOT_FOUND', message: 'x' });
    await expect(useCase.execute('bk_1')).resolves.toEqual({ kind: 'not-found' });
    const error = { status: 401, code: 'UNAUTHORIZED', message: 'x' };
    bookingService.getBooking.mockRejectedValueOnce(error);
    await expect(useCase.execute('bk_1')).rejects.toBe(error);
    bookingService.getBooking.mockRejectedValueOnce(null);
    await expect(useCase.execute('bk_1')).rejects.toBeNull();
  });
});
