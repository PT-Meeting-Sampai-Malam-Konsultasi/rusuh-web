import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Booking } from '@core/entities/booking/booking.entity';
import type { EventSummary } from '@core/entities/catalog/catalog.entity';
import type { SnapTransaction } from '@core/entities/payment/payment.entity';

import type { SnapHint } from '../pay-booking.use-case';
import { PayBookingUseCase } from '../pay-booking.use-case';

const idr = (amount: number) => ({ amount, currency: 'IDR' as const });

const problem = (status: number, code: string, requestId?: string) => ({
  status,
  code,
  message: `${code} message`,
  ...(requestId ? { requestId } : {}),
});

const NAMES = ['Nadia Saputri', 'Raka Pratama', 'Sinta Dewi'];

const ATTENDEES = [
  { categoryId: 'FB', categoryName: 'Festival B', fullName: NAMES[0], nikMasked: '3174 •••• •••• 0004' },
  { categoryId: 'FB', categoryName: 'Festival B', fullName: NAMES[1], nikMasked: '3201 •••• •••• 0019' },
  { categoryId: 'TA', categoryName: 'Tribun Atas', fullName: NAMES[2], nikMasked: '3273 •••• •••• 0027' },
];

const PRICE = {
  lines: [
    { categoryId: 'FB', name: 'Festival B', quantity: 2, unitPrice: idr(850_000), lineTotal: idr(1_700_000) },
    { categoryId: 'TA', name: 'Tribun Atas', quantity: 1, unitPrice: idr(450_000), lineTotal: idr(450_000) },
  ],
  ticketSubtotal: idr(2_150_000),
  adminFee: idr(10_000),
  total: idr(2_160_000),
};

/** A payable booking by default: PAYMENT_PENDING, 10 minutes left on the server clock. */
const booking = (overrides: Partial<Booking> = {}): Booking => ({
  bookingId: 'bk1',
  eventId: 'evt_1',
  status: 'PAYMENT_PENDING',
  orderCode: 'RSH-0001',
  price: PRICE,
  createdAt: '2026-11-13T02:55:00Z',
  serverNow: '2026-11-13T03:00:00Z',
  attendees: ATTENDEES,
  expiresAt: '2026-11-13T03:10:00Z',
  ...overrides,
});
const ok = <T>(data: T) => ({ status: 200, data });

const EVENT = {
  eventId: 'evt_1',
  name: 'Samudra',
  venue: 'Gelora Bung Karno',
  venueShort: 'GBK',
  timezone: 'Asia/Jakarta',
  startsAt: '2026-12-12T12:00:00Z',
} as EventSummary;

const ENTERED = {
  bookingId: 'bk1',
  snapToken: 'snap-token-1',
  paymentExpiresAt: '2026-11-13T03:10:00Z',
  redirectUrl: 'https://snap.test/1',
  serverNow: '2026-11-13T03:00:00Z',
};
const S1: SnapTransaction = {
  snapToken: 'snap-token-1',
  redirectUrl: 'https://snap.test/1',
  gatewayExpiresAt: '2026-11-13T03:10:00Z',
};

const noSecrets = (value: unknown) => {
  const json = JSON.stringify(value);
  for (const name of NAMES) expect(json).not.toContain(name);
  expect(json).not.toContain('snap-token');
};

describe('PayBookingUseCase', () => {
  const bookingService = { getBooking: vi.fn(), enterPayment: vi.fn(), checkPaymentStatus: vi.fn() };
  const catalogService = { getEvent: vi.fn() };
  const admissionStore = { get: vi.fn(), set: vi.fn() };
  const snap = { load: vi.fn(), pay: vi.fn() };
  const useCase = PayBookingUseCase({ bookingService, catalogService, admissionStore, snap } as never);

  beforeEach(() => {
    vi.resetAllMocks();
    admissionStore.get.mockReturnValue('adm-1');
    catalogService.getEvent.mockResolvedValue(ok(EVENT));
  });
  afterEach(() => vi.useRealTimers());

  describe('load', () => {
    it('returns not-found for an empty id without a call', async () => {
      await expect(useCase.load('')).resolves.toEqual({ kind: 'not-found' });
      expect(bookingService.getBooking).not.toHaveBeenCalled();
    });

    it('builds the view from the booking and its event, one ticket line per attendee, without names', async () => {
      bookingService.getBooking.mockResolvedValue(ok(booking()));
      const result = await useCase.load('bk1');
      expect(bookingService.getBooking).toHaveBeenCalledWith('bk1');
      expect(catalogService.getEvent).toHaveBeenCalledWith('evt_1');
      expect(result).toEqual({
        kind: 'ready',
        view: {
          bookingId: 'bk1',
          eventId: 'evt_1',
          orderCode: 'RSH-0001',
          eventName: 'Samudra',
          eventStartsAt: '2026-12-12T12:00:00Z',
          venueShort: 'GBK',
          timezone: 'Asia/Jakarta',
          attendees: ATTENDEES,
          price: PRICE,
          currentSnap: null,
          expiresAt: '2026-11-13T03:10:00Z',
          serverNow: '2026-11-13T03:00:00Z',
        },
        tickets: [
          { categoryId: 'FB', categoryName: 'Festival B', nikMasked: '3174 •••• •••• 0004', unitPrice: 850_000 },
          { categoryId: 'FB', categoryName: 'Festival B', nikMasked: '3201 •••• •••• 0019', unitPrice: 850_000 },
          { categoryId: 'TA', categoryName: 'Tribun Atas', nikMasked: '3273 •••• •••• 0027', unitPrice: 450_000 },
        ],
      });
      noSecrets(result.kind === 'ready' ? result.tickets : null);
    });

    it('drops only the event header when the event read fails, and fills a missing order code and deadline', async () => {
      bookingService.getBooking.mockResolvedValue(ok(booking({ orderCode: undefined, expiresAt: null })));
      catalogService.getEvent.mockRejectedValue(problem(503, 'SERVICE_UNAVAILABLE'));
      const result = await useCase.load('bk1');
      expect(result.kind).toBe('ready');
      if (result.kind !== 'ready') return;
      expect(result.view.eventName).toBeUndefined();
      expect(result.view.orderCode).toBe('');
      expect(result.view.expiresAt).toBe('2026-11-13T03:00:00Z');
    });

    it('signs in again when the event read answers 401', async () => {
      bookingService.getBooking.mockResolvedValue(ok(booking()));
      catalogService.getEvent.mockRejectedValue(problem(401, 'UNAUTHORIZED'));
      await expect(useCase.load('bk1')).resolves.toEqual({ kind: 'unauthorized' });
    });

    it('gives a null unit price to an attendee whose category has no line', async () => {
      bookingService.getBooking.mockResolvedValue(
        ok(booking({ attendees: [{ categoryId: 'X', categoryName: 'X', fullName: 'A', nikMasked: '1' }] })),
      );
      const result = await useCase.load('bk1');
      expect(result.kind === 'ready' && result.tickets[0].unitPrice).toBeNull();
    });

    it('goes to the e-ticket when the booking is paid, without the event read', async () => {
      bookingService.getBooking.mockResolvedValue(ok(booking({ status: 'PAID', expiresAt: null })));
      await expect(useCase.load('bk1')).resolves.toEqual({ kind: 'paid' });
      expect(catalogService.getEvent).not.toHaveBeenCalled();
    });

    it.each([
      ['EXPIRED', {}, { refund: false, reason: 'expired' }],
      ['EXPIRED with a late payment', { refundRequired: true }, { refund: true, reason: 'expired' }],
      ['CANCELLED', { status: 'CANCELLED' as const }, { refund: false, reason: 'other' }],
      ['SELECTION (never held)', { status: 'SELECTION' as const }, { refund: false, reason: 'other' }],
      [
        'PAYMENT_PENDING past its deadline on the server clock',
        { status: 'PAYMENT_PENDING' as const, serverNow: '2026-11-13T03:11:00Z' },
        { refund: false, reason: 'expired' },
      ],
    ])('ends a booking that is %s', async (_, overrides, outcome) => {
      bookingService.getBooking.mockResolvedValue(ok(booking({ status: 'EXPIRED', ...overrides })));
      await expect(useCase.load('bk1')).resolves.toEqual({
        kind: 'inactive',
        ...outcome,
        eventId: 'evt_1',
        ticketCount: 3,
      });
    });

    it('classifies on the booking serverNow only, not the device clock (2031)', async () => {
      vi.useFakeTimers({ now: new Date('2031-01-01T00:00:00Z') });
      bookingService.getBooking.mockResolvedValue(ok(booking()));
      await expect(useCase.load('bk1')).resolves.toMatchObject({ kind: 'ready' });
    });

    it.each([
      [problem(404, 'NOT_FOUND'), { kind: 'not-found' }],
      [{ status: 404, message: '' }, { kind: 'not-found' }],
      [problem(401, 'UNAUTHORIZED'), { kind: 'unauthorized' }],
    ])('classifies %o', async (error, result) => {
      bookingService.getBooking.mockRejectedValue(error);
      await expect(useCase.load('bk1')).resolves.toEqual(result);
    });

    it('rethrows any other failure as the same object', async () => {
      const error = problem(0, 'NETWORK_ERROR');
      bookingService.getBooking.mockRejectedValue(error);
      await expect(useCase.load('bk1')).rejects.toBe(error);
    });
  });

  describe('pay', () => {
    const input = { bookingId: 'bk1', eventId: 'evt_1', reusable: null };

    it('returns not-found for an empty id without a call', async () => {
      await expect(useCase.pay({ ...input, bookingId: '' })).resolves.toEqual({ kind: 'not-found' });
      expect(bookingService.enterPayment).not.toHaveBeenCalled();
    });

    it('asks enterPayment for the live attempt with the event admission token, then opens Snap', async () => {
      bookingService.enterPayment.mockResolvedValue(ok(ENTERED));
      snap.pay.mockResolvedValue({ kind: 'success' });
      await expect(useCase.pay(input)).resolves.toEqual({ kind: 'snap', outcome: 'success', snap: S1 });
      expect(admissionStore.get).toHaveBeenCalledWith('evt_1');
      expect(bookingService.enterPayment).toHaveBeenCalledWith('bk1', 'adm-1');
      expect(snap.pay).toHaveBeenCalledWith('snap-token-1');
    });

    it('keeps a missing redirect URL as null', async () => {
      bookingService.enterPayment.mockResolvedValue(ok({ ...ENTERED, redirectUrl: undefined }));
      snap.pay.mockResolvedValue({ kind: 'closed' });
      await expect(useCase.pay(input)).resolves.toMatchObject({ snap: { redirectUrl: null } });
    });

    it('reopens a reusable transaction without enterPayment', async () => {
      snap.pay.mockResolvedValue({ kind: 'closed' });
      await expect(useCase.pay({ ...input, reusable: S1 })).resolves.toEqual({
        kind: 'snap',
        outcome: 'closed',
        snap: S1,
      });
      expect(bookingService.enterPayment).not.toHaveBeenCalled();
    });

    it('cannot ask for Snap without an admission token (lost on reload)', async () => {
      admissionStore.get.mockReturnValue(null);
      await expect(useCase.pay(input)).resolves.toEqual({ kind: 'retryable', code: 'ADMISSION_INVALID', snap: null });
      expect(bookingService.enterPayment).not.toHaveBeenCalled();
    });

    it.each([problem(403, 'ADMISSION_INVALID'), { status: 403, message: '' }])(
      'answers ADMISSION_INVALID for a refused admission %o',
      async (error) => {
        bookingService.enterPayment.mockRejectedValue(error);
        await expect(useCase.pay(input)).resolves.toEqual({ kind: 'retryable', code: 'ADMISSION_INVALID', snap: null });
      },
    );

    it('on 409 BOOKING_NOT_HELD reads the booking once: paid, or why it ended', async () => {
      bookingService.enterPayment.mockRejectedValue(problem(409, 'BOOKING_NOT_HELD'));
      bookingService.getBooking.mockResolvedValueOnce(ok(booking({ status: 'PAID' })));
      await expect(useCase.pay(input)).resolves.toEqual({ kind: 'paid' });
      bookingService.getBooking.mockResolvedValueOnce(ok(booking({ status: 'EXPIRED', refundRequired: true })));
      await expect(useCase.pay(input)).resolves.toEqual({
        kind: 'inactive',
        refund: true,
        reason: 'expired',
        eventId: 'evt_1',
        ticketCount: 3,
      });
      // Still PAYMENT_PENDING on the read (the hold ended a moment ago): ended anyway, as the 409 said.
      bookingService.getBooking.mockResolvedValueOnce(ok(booking()));
      await expect(useCase.pay(input)).resolves.toMatchObject({ kind: 'inactive', reason: 'other' });
      expect(bookingService.getBooking).toHaveBeenCalledTimes(3);
      expect(snap.pay).not.toHaveBeenCalled();
    });

    it('after a 409, signs in on a 401 read and rethrows any other read failure', async () => {
      bookingService.enterPayment.mockRejectedValue(problem(409, 'BOOKING_NOT_HELD'));
      bookingService.getBooking.mockRejectedValueOnce(problem(401, 'UNAUTHORIZED'));
      await expect(useCase.pay(input)).resolves.toEqual({ kind: 'unauthorized' });
      const error = problem(500, 'INTERNAL_ERROR');
      bookingService.getBooking.mockRejectedValueOnce(error);
      await expect(useCase.pay(input)).rejects.toBe(error);
    });

    it.each([
      [problem(404, 'NOT_FOUND'), { kind: 'not-found' }],
      [problem(401, 'UNAUTHORIZED'), { kind: 'unauthorized' }],
      [
        problem(503, 'PAYMENT_PROVIDER_BUSY', 'req-1'),
        { kind: 'retryable', code: 'PAYMENT_PROVIDER_BUSY', requestId: 'req-1', snap: null },
      ],
      [problem(0, 'NETWORK_ERROR'), { kind: 'retryable', code: 'NETWORK_ERROR', snap: null }],
      [
        { status: 502, message: '' },
        { kind: 'retryable', code: 'UNKNOWN_ERROR', snap: null },
      ],
    ])('classifies an enterPayment failure %o', async (error, result) => {
      bookingService.enterPayment.mockRejectedValue(error);
      await expect(useCase.pay(input)).resolves.toEqual(result);
    });

    it('rethrows an unexpected enterPayment failure as the same object', async () => {
      const error = problem(422, 'VALIDATION_FAILED');
      bookingService.enterPayment.mockRejectedValue(error);
      await expect(useCase.pay(input)).rejects.toBe(error);
    });

    it('keeps the transaction when Snap is unavailable, so the retry reopens it', async () => {
      bookingService.enterPayment.mockResolvedValue(ok(ENTERED));
      snap.pay.mockRejectedValue(problem(0, 'SNAP_UNAVAILABLE'));
      await expect(useCase.pay(input)).resolves.toEqual({ kind: 'retryable', code: 'SNAP_UNAVAILABLE', snap: S1 });
    });

    it('rethrows any other snap.pay rejection as the same object', async () => {
      const error = new Error('boom');
      snap.pay.mockRejectedValue(error);
      await expect(useCase.pay({ ...input, reusable: S1 })).rejects.toBe(error);
    });
  });

  describe('checkStatus', () => {
    const check = (hint: SnapHint = 'success') => useCase.checkStatus('bk1', 'evt_1', hint);

    it('re-checks with Midtrans through check-status, with the admission token', async () => {
      bookingService.checkPaymentStatus.mockResolvedValue(ok(booking({ status: 'PAID' })));
      await expect(check()).resolves.toEqual({ kind: 'paid' });
      expect(bookingService.checkPaymentStatus).toHaveBeenCalledWith('bk1', 'adm-1');
      expect(bookingService.getBooking).not.toHaveBeenCalled();
    });

    it('reads the booking instead without a token, or when check-status refuses the admission', async () => {
      admissionStore.get.mockReturnValueOnce(null);
      bookingService.getBooking.mockResolvedValue(ok(booking({ status: 'PAID' })));
      await expect(check()).resolves.toEqual({ kind: 'paid' });
      expect(bookingService.checkPaymentStatus).not.toHaveBeenCalled();

      bookingService.checkPaymentStatus.mockRejectedValue(problem(403, 'ADMISSION_INVALID'));
      await expect(check()).resolves.toEqual({ kind: 'paid' });
      expect(bookingService.getBooking).toHaveBeenCalledTimes(2);
    });

    it.each([
      ['success', { kind: 'verifying', reason: 'confirming' }],
      ['pending', { kind: 'verifying', reason: 'waiting' }],
      ['error', { kind: 'failed', paymentStatus: 'none' }],
    ] as const)('keeps a still-pending booking verifying after a %s hint', async (hint, step) => {
      bookingService.checkPaymentStatus.mockResolvedValue(ok(booking()));
      await expect(check(hint)).resolves.toEqual(step);
    });

    it('ends on a dead or late-paid booking, from that same answer', async () => {
      bookingService.checkPaymentStatus.mockResolvedValueOnce(ok(booking({ status: 'EXPIRED', expiresAt: null })));
      await expect(check()).resolves.toEqual({
        kind: 'inactive',
        refund: false,
        reason: 'expired',
        eventId: 'evt_1',
        ticketCount: 3,
      });
      bookingService.checkPaymentStatus.mockResolvedValueOnce(
        ok(booking({ status: 'EXPIRED', refundRequired: true, attendees: [] })),
      );
      await expect(check()).resolves.toEqual({
        kind: 'inactive',
        refund: true,
        reason: 'expired',
        eventId: 'evt_1',
        ticketCount: 3,
      });
      expect(bookingService.getBooking).not.toHaveBeenCalled();
    });

    it('throws a 401 and any other failure', async () => {
      const unauthorized = problem(401, 'UNAUTHORIZED');
      bookingService.checkPaymentStatus.mockRejectedValueOnce(unauthorized);
      await expect(check()).rejects.toBe(unauthorized);
      const down = problem(503, 'SERVICE_UNAVAILABLE');
      admissionStore.get.mockReturnValueOnce(null);
      bookingService.getBooking.mockRejectedValueOnce(down);
      await expect(check()).rejects.toBe(down);
    });
  });
});
