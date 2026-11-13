import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Booking, BookingStatus } from '@core/entities/booking/booking.entity';
import type { PaymentStatus, PaymentView, SnapTransaction } from '@core/entities/payment/payment.entity';

import type { InactiveOutcome, PaymentStep, PayResult, SnapHint } from '../pay-booking.use-case';
import { PayBookingUseCase } from '../pay-booking.use-case';

const idr = (amount: number) => ({ amount, currency: 'IDR' as const });

const problem = (status: number, code: string, requestId?: string) => ({
  status,
  code,
  message: `${code} message`,
  ...(requestId ? { requestId } : {}),
});

const NAMES = ['Nadia Saputri', 'Raka Pratama', 'Sinta Dewi'];

const VIEW: PaymentView = {
  bookingId: 'bk1',
  orderCode: 'RSH-0001',
  attendees: [
    { categoryId: 'FB', categoryName: 'Festival B', fullName: NAMES[0], nikMasked: '3174 •••• •••• 0004' },
    { categoryId: 'FB', categoryName: 'Festival B', fullName: NAMES[1], nikMasked: '3201 •••• •••• 0019' },
    { categoryId: 'TA', categoryName: 'Tribun Atas', fullName: NAMES[2], nikMasked: '3273 •••• •••• 0027' },
  ],
  price: {
    lines: [
      { categoryId: 'FB', name: 'Festival B', quantity: 2, unitPrice: idr(850_000), lineTotal: idr(1_700_000) },
      { categoryId: 'TA', name: 'Tribun Atas', quantity: 1, unitPrice: idr(450_000), lineTotal: idr(450_000) },
    ],
    ticketSubtotal: idr(2_150_000),
    adminFee: idr(10_000),
    total: idr(2_160_000),
  },
  currentSnap: null,
  expiresAt: '2026-11-13T03:10:00Z',
  serverNow: '2026-11-13T03:00:00Z',
  csrfToken: 'csrf',
  snapClientKey: 'SB-client',
};

const snapTx = (attemptId: number): SnapTransaction => ({
  attemptId,
  orderId: `bk1-${attemptId}`,
  method: null,
  snapToken: `snap-token-${attemptId}`,
  redirectUrl: `https://snap.test/${attemptId}`,
  gatewayExpiresAt: '2026-11-13T03:10:00Z',
});
const S1 = snapTx(1);
const S2 = snapTx(2);

const statusOk = (bookingStatus: BookingStatus, paymentStatus?: PaymentStatus) => ({
  status: 200,
  data: { bookingStatus, ...(paymentStatus ? { paymentStatus } : {}), serverNow: '2026-11-13T03:01:00Z' },
});

/** The Booking read failed (the default in the older tests): Status alone. */
const ended = (refund: boolean, reason: InactiveOutcome['reason']): InactiveOutcome => ({
  kind: 'inactive',
  refund,
  reason,
  eventId: null,
  ticketCount: null,
});

const booking = (overrides: Partial<Booking> = {}): Booking => ({
  bookingId: 'bk1',
  eventId: 'evt_1',
  status: 'EXPIRED',
  price: VIEW.price,
  createdAt: '2026-11-13T02:55:00Z',
  serverNow: '2026-11-13T03:11:00Z',
  attendees: VIEW.attendees,
  expiresAt: null,
  ...overrides,
});

const noSecrets = (value: unknown) => {
  const json = JSON.stringify(value);
  for (const name of NAMES) expect(json).not.toContain(name);
  expect(json).not.toContain('snap-token');
};

describe('PayBookingUseCase', () => {
  const paymentService = { getPaymentPage: vi.fn(), startSnap: vi.fn(), getPaymentStatus: vi.fn() };
  const bookingService = { getBooking: vi.fn() };
  const snap = { load: vi.fn(), pay: vi.fn() };
  const useCase = PayBookingUseCase({ paymentService, bookingService, snap } as never);

  beforeEach(() => {
    vi.resetAllMocks();
    // Older tests predate the Booking read: it fails, so the outcome comes from the Status alone.
    bookingService.getBooking.mockRejectedValue(problem(503, 'SERVICE_UNAVAILABLE'));
  });

  describe('load', () => {
    it('returns not-found for an empty id without a call', async () => {
      await expect(useCase.load('')).resolves.toEqual({ kind: 'not-found' });
      expect(paymentService.getPaymentPage).not.toHaveBeenCalled();
      expect(paymentService.getPaymentStatus).not.toHaveBeenCalled();
    });

    it('returns the view with one ticket line per attendee, in order, without names', async () => {
      paymentService.getPaymentPage.mockResolvedValueOnce({ status: 200, data: VIEW });
      const result = await useCase.load('bk1');
      expect(result).toEqual({
        kind: 'ready',
        view: VIEW,
        tickets: [
          { categoryId: 'FB', categoryName: 'Festival B', nikMasked: '3174 •••• •••• 0004', unitPrice: 850_000 },
          { categoryId: 'FB', categoryName: 'Festival B', nikMasked: '3201 •••• •••• 0019', unitPrice: 850_000 },
          { categoryId: 'TA', categoryName: 'Tribun Atas', nikMasked: '3273 •••• •••• 0027', unitPrice: 450_000 },
        ],
      });
      if (result.kind !== 'ready') throw new Error('expected ready');
      expect(result.tickets).toHaveLength(VIEW.attendees.length);
      for (const ticket of result.tickets) expect(ticket).not.toHaveProperty('fullName');
      noSecrets(result.tickets);
      expect(paymentService.getPaymentPage).toHaveBeenCalledTimes(1);
      expect(paymentService.getPaymentPage).toHaveBeenNthCalledWith(1, 'bk1');
      expect(paymentService.getPaymentStatus).not.toHaveBeenCalled();
    });

    it('gives a null unit price to an attendee whose category has no line', async () => {
      const view: PaymentView = {
        ...VIEW,
        attendees: [{ categoryId: 'XX', categoryName: 'VIP', fullName: NAMES[0], nikMasked: '3174 •••• •••• 0004' }],
      };
      paymentService.getPaymentPage.mockResolvedValueOnce({ status: 200, data: view });
      await expect(useCase.load('bk1')).resolves.toMatchObject({
        kind: 'ready',
        tickets: [{ categoryId: 'XX', unitPrice: null }],
      });
    });

    it.each([
      ['PAID / settled', statusOk('PAID', 'settled'), { kind: 'paid' }],
      ['EXPIRED / expired', statusOk('EXPIRED', 'expired'), ended(false, 'expired')],
      ['EXPIRED / paid_after_expiry', statusOk('EXPIRED', 'paid_after_expiry'), ended(true, 'expired')],
      ['CANCELLED', statusOk('CANCELLED'), ended(false, 'other')],
    ])('on 409 BOOKING_NOT_HELD checks the status once: %s', async (_, status, expected) => {
      paymentService.getPaymentPage.mockRejectedValueOnce(problem(409, 'BOOKING_NOT_HELD'));
      paymentService.getPaymentStatus.mockResolvedValueOnce(status);
      const result = await useCase.load('bk1');
      expect(result).toEqual(expected);
      noSecrets(result);
      expect(paymentService.getPaymentPage).toHaveBeenNthCalledWith(1, 'bk1');
      expect(paymentService.getPaymentStatus).toHaveBeenCalledTimes(1);
      expect(paymentService.getPaymentStatus).toHaveBeenNthCalledWith(1, 'bk1');
    });

    it('returns unauthorized when the status check after a 409 answers 401', async () => {
      paymentService.getPaymentPage.mockRejectedValueOnce(problem(409, 'BOOKING_NOT_HELD'));
      paymentService.getPaymentStatus.mockRejectedValueOnce(problem(401, 'UNAUTHORIZED'));
      await expect(useCase.load('bk1')).resolves.toEqual({ kind: 'unauthorized' });
    });

    it('rethrows a 503 from the status check after a 409', async () => {
      const error = problem(503, 'SERVICE_UNAVAILABLE');
      paymentService.getPaymentPage.mockRejectedValueOnce(problem(409, 'BOOKING_NOT_HELD'));
      paymentService.getPaymentStatus.mockRejectedValueOnce(error);
      await expect(useCase.load('bk1')).rejects.toBe(error);
    });

    it.each([
      ['404', problem(404, 'NOT_FOUND'), { kind: 'not-found' }],
      ['404 without code', { status: 404 }, { kind: 'not-found' }],
      ['401', problem(401, 'UNAUTHORIZED'), { kind: 'unauthorized' }],
    ])('classifies %s', async (_, error, expected) => {
      paymentService.getPaymentPage.mockRejectedValueOnce(error);
      await expect(useCase.load('bk1')).resolves.toEqual(expected);
      expect(paymentService.getPaymentStatus).not.toHaveBeenCalled();
    });

    it.each([
      ['503', problem(503, 'SERVICE_UNAVAILABLE')],
      ['NETWORK_ERROR', problem(0, 'NETWORK_ERROR')],
      ['422', problem(422, 'VALIDATION_FAILED')],
    ])('rethrows %s as the same object', async (_, error) => {
      paymentService.getPaymentPage.mockRejectedValueOnce(error);
      await expect(useCase.load('bk1')).rejects.toBe(error);
      expect(paymentService.getPaymentStatus).not.toHaveBeenCalled();
    });
  });

  describe('pay', () => {
    const input = (reusable: SnapTransaction | null, bookingId = 'bk1') => ({
      bookingId,
      idempotencyKey: 'K1',
      reusable,
    });

    it('returns not-found for an empty id without a call', async () => {
      await expect(useCase.pay(input(S1, ''))).resolves.toEqual({ kind: 'not-found' });
      expect(paymentService.startSnap).not.toHaveBeenCalled();
      expect(snap.pay).not.toHaveBeenCalled();
    });

    it.each(['success', 'pending', 'error', 'closed'] as const)(
      'reopens the reusable attempt without startSnap; Snap %s is a hint, never paid',
      async (outcome) => {
        snap.pay.mockResolvedValueOnce({ kind: outcome });
        const result = await useCase.pay(input(S1));
        expect(result).toEqual({ kind: 'snap', outcome, snap: S1 });
        expect(result.kind).not.toBe('paid');
        expect(paymentService.startSnap).not.toHaveBeenCalled();
        expect(paymentService.getPaymentStatus).not.toHaveBeenCalled();
        expect(snap.pay).toHaveBeenCalledTimes(1);
        expect(snap.pay).toHaveBeenNthCalledWith(1, 'snap-token-1');
      },
    );

    it('starts an attempt with the caller key when nothing is reusable, then opens it', async () => {
      paymentService.startSnap.mockResolvedValueOnce({ status: 201, data: S2 });
      snap.pay.mockResolvedValueOnce({ kind: 'success' });
      await expect(useCase.pay(input(null))).resolves.toEqual({ kind: 'snap', outcome: 'success', snap: S2 });
      expect(paymentService.startSnap).toHaveBeenCalledTimes(1);
      expect(paymentService.startSnap).toHaveBeenNthCalledWith(1, 'bk1', 'K1');
      expect(snap.pay).toHaveBeenNthCalledWith(1, 'snap-token-2');
      expect(paymentService.getPaymentStatus).not.toHaveBeenCalled();
    });

    it.each([
      [
        '503 PAYMENT_PROVIDER_BUSY',
        problem(503, 'PAYMENT_PROVIDER_BUSY', 'req-123'),
        'PAYMENT_PROVIDER_BUSY',
        'req-123',
      ],
      ['NETWORK_ERROR', problem(0, 'NETWORK_ERROR'), 'NETWORK_ERROR', undefined],
      ['TIMEOUT', problem(0, 'TIMEOUT'), 'TIMEOUT', undefined],
      ['500', problem(500, 'INTERNAL_ERROR'), 'INTERNAL_ERROR', undefined],
      ['502 without code', { status: 502 }, 'UNKNOWN_ERROR', undefined],
    ])('returns retryable with no snap on start %s', async (_, error, code, requestId) => {
      paymentService.startSnap.mockRejectedValueOnce(error);
      const result = await useCase.pay(input(null));
      const expected: PayResult = requestId
        ? { kind: 'retryable', code, requestId, snap: null }
        : { kind: 'retryable', code, snap: null };
      expect(result).toEqual(expected);
      noSecrets(result);
      expect(snap.pay).not.toHaveBeenCalled();
      expect(paymentService.getPaymentStatus).not.toHaveBeenCalled();
    });

    it.each([
      ['PAID', statusOk('PAID', 'settled'), { kind: 'paid' }],
      ['EXPIRED / paid_after_expiry', statusOk('EXPIRED', 'paid_after_expiry'), ended(true, 'expired')],
      ['CANCELLED', statusOk('CANCELLED', 'cancelled'), ended(false, 'other')],
    ])('on start 409 checks the status: %s', async (_, status, expected) => {
      paymentService.startSnap.mockRejectedValueOnce(problem(409, 'BOOKING_NOT_HELD'));
      paymentService.getPaymentStatus.mockResolvedValueOnce(status);
      const result = await useCase.pay(input(null));
      expect(result).toEqual(expected);
      noSecrets(result);
      expect(paymentService.startSnap).toHaveBeenNthCalledWith(1, 'bk1', 'K1');
      expect(paymentService.getPaymentStatus).toHaveBeenCalledTimes(1);
      expect(paymentService.getPaymentStatus).toHaveBeenNthCalledWith(1, 'bk1');
      expect(snap.pay).not.toHaveBeenCalled();
    });

    it.each([
      ['404', problem(404, 'NOT_FOUND'), { kind: 'not-found' }],
      ['401', problem(401, 'UNAUTHORIZED'), { kind: 'unauthorized' }],
    ])('classifies start %s', async (_, error, expected) => {
      paymentService.startSnap.mockRejectedValueOnce(error);
      await expect(useCase.pay(input(null))).resolves.toEqual(expected);
      expect(snap.pay).not.toHaveBeenCalled();
    });

    it('rethrows a start 422 as the same object', async () => {
      const error = problem(422, 'VALIDATION_FAILED');
      paymentService.startSnap.mockRejectedValueOnce(error);
      await expect(useCase.pay(input(null))).rejects.toBe(error);
      expect(snap.pay).not.toHaveBeenCalled();
    });

    it('keeps the transaction when Snap is unavailable, so the retry reopens it', async () => {
      snap.pay.mockRejectedValueOnce(problem(0, 'SNAP_UNAVAILABLE'));
      await expect(useCase.pay(input(S1))).resolves.toEqual({
        kind: 'retryable',
        code: 'SNAP_UNAVAILABLE',
        snap: S1,
      });
      expect(paymentService.startSnap).not.toHaveBeenCalled();
    });

    it('keeps a freshly started transaction when Snap is unavailable', async () => {
      paymentService.startSnap.mockResolvedValueOnce({ status: 201, data: S2 });
      snap.pay.mockRejectedValueOnce(problem(0, 'SNAP_UNAVAILABLE'));
      await expect(useCase.pay(input(null))).resolves.toEqual({
        kind: 'retryable',
        code: 'SNAP_UNAVAILABLE',
        snap: S2,
      });
    });

    it('rethrows any other snap.pay rejection as the same object', async () => {
      const error = new Error('boom');
      snap.pay.mockRejectedValueOnce(error);
      await expect(useCase.pay(input(S1))).rejects.toBe(error);
    });
  });

  describe('checkStatus', () => {
    const HINTS: SnapHint[] = ['success', 'pending', 'error'];

    it.each<[string, BookingStatus, PaymentStatus | undefined, SnapHint[], PaymentStep]>([
      ['PAID / settled', 'PAID', 'settled', HINTS, { kind: 'paid' }],
      ['PAID / none', 'PAID', 'none', HINTS, { kind: 'paid' }],
      ['EXPIRED / paid_after_expiry', 'EXPIRED', 'paid_after_expiry', HINTS, ended(true, 'expired')],
      ['PAYMENT_PENDING / paid_after_expiry', 'PAYMENT_PENDING', 'paid_after_expiry', HINTS, ended(true, 'expired')],
      ['EXPIRED / expired', 'EXPIRED', 'expired', HINTS, ended(false, 'expired')],
      ['CANCELLED', 'CANCELLED', undefined, HINTS, ended(false, 'other')],
      ['SELECTION', 'SELECTION', 'none', HINTS, ended(false, 'other')],
      ['PAYMENT_PENDING / denied', 'PAYMENT_PENDING', 'denied', HINTS, { kind: 'failed', paymentStatus: 'denied' }],
      ['PAYMENT_PENDING / failed', 'PAYMENT_PENDING', 'failed', HINTS, { kind: 'failed', paymentStatus: 'failed' }],
      [
        'PAYMENT_PENDING / cancelled',
        'PAYMENT_PENDING',
        'cancelled',
        HINTS,
        { kind: 'failed', paymentStatus: 'cancelled' },
      ],
      ['PAYMENT_PENDING / expired', 'PAYMENT_PENDING', 'expired', HINTS, { kind: 'failed', paymentStatus: 'expired' }],
      ['PAYMENT_PENDING / settled', 'PAYMENT_PENDING', 'settled', HINTS, { kind: 'verifying', reason: 'confirming' }],
      [
        'PAYMENT_PENDING / pending',
        'PAYMENT_PENDING',
        'pending',
        ['pending'],
        { kind: 'verifying', reason: 'waiting' },
      ],
      [
        'PAYMENT_PENDING / pending',
        'PAYMENT_PENDING',
        'pending',
        ['success', 'error'],
        { kind: 'verifying', reason: 'confirming' },
      ],
      ['PAYMENT_PENDING / none', 'PAYMENT_PENDING', 'none', ['error'], { kind: 'failed', paymentStatus: 'none' }],
      ['PAYMENT_PENDING / missing', 'PAYMENT_PENDING', undefined, ['error'], { kind: 'failed', paymentStatus: 'none' }],
      ['PAYMENT_PENDING / none', 'PAYMENT_PENDING', 'none', ['success'], { kind: 'verifying', reason: 'confirming' }],
      [
        'PAYMENT_PENDING / missing',
        'PAYMENT_PENDING',
        undefined,
        ['success'],
        { kind: 'verifying', reason: 'confirming' },
      ],
      ['PAYMENT_PENDING / none', 'PAYMENT_PENDING', 'none', ['pending'], { kind: 'verifying', reason: 'waiting' }],
      ['HELD / pending', 'HELD', 'pending', ['success'], { kind: 'verifying', reason: 'confirming' }],
      ['HELD / denied', 'HELD', 'denied', ['error'], { kind: 'failed', paymentStatus: 'denied' }],
    ])('maps %s (hints %j)', async (_, bookingStatus, paymentStatus, hints, expected) => {
      for (const hint of hints) {
        paymentService.getPaymentStatus.mockReset();
        paymentService.getPaymentStatus.mockResolvedValueOnce(statusOk(bookingStatus, paymentStatus));
        const step = await useCase.checkStatus('bk1', hint);
        expect(step).toEqual(expected);
        noSecrets(step);
        expect(paymentService.getPaymentStatus).toHaveBeenCalledTimes(1);
        expect(paymentService.getPaymentStatus).toHaveBeenNthCalledWith(1, 'bk1');
      }
    });

    it.each([
      ['401', problem(401, 'UNAUTHORIZED')],
      ['503', problem(503, 'SERVICE_UNAVAILABLE')],
      ['NETWORK_ERROR', problem(0, 'NETWORK_ERROR')],
    ])('rethrows %s as the same object', async (_, error) => {
      paymentService.getPaymentStatus.mockRejectedValueOnce(error);
      await expect(useCase.checkStatus('bk1', 'success')).rejects.toBe(error);
    });
  });

  describe('inactive outcome (FR-23-W1)', () => {
    type Row = [string, ReturnType<typeof statusOk>, Booking, InactiveOutcome];
    const ROWS: Row[] = [
      [
        'EXPIRED / expired, 3 attendees',
        statusOk('EXPIRED', 'expired'),
        booking(),
        { kind: 'inactive', refund: false, reason: 'expired', eventId: 'evt_1', ticketCount: 3 },
      ],
      [
        'EXPIRED / paid_after_expiry, refundRequired, 2 attendees',
        statusOk('EXPIRED', 'paid_after_expiry'),
        booking({ refundRequired: true, attendees: VIEW.attendees.slice(0, 2) }),
        { kind: 'inactive', refund: true, reason: 'expired', eventId: 'evt_1', ticketCount: 2 },
      ],
      [
        'PAYMENT_PENDING / pending, expiresAt = serverNow (sweeper race)',
        statusOk('PAYMENT_PENDING', 'pending'),
        booking({ status: 'PAYMENT_PENDING', expiresAt: '2026-11-13T03:11:00Z' }),
        { kind: 'inactive', refund: false, reason: 'expired', eventId: 'evt_1', ticketCount: 3 },
      ],
      [
        'HELD, expiresAt before serverNow',
        statusOk('HELD', 'none'),
        booking({ status: 'HELD', expiresAt: '2026-11-13T03:10:00Z' }),
        { kind: 'inactive', refund: false, reason: 'expired', eventId: 'evt_1', ticketCount: 3 },
      ],
      [
        'PAYMENT_PENDING / none, expiresAt after serverNow',
        statusOk('PAYMENT_PENDING', 'none'),
        booking({ status: 'PAYMENT_PENDING', expiresAt: '2026-11-13T03:20:00Z' }),
        { kind: 'inactive', refund: false, reason: 'other', eventId: 'evt_1', ticketCount: 3 },
      ],
      [
        'PAYMENT_PENDING / none, no expiresAt',
        statusOk('PAYMENT_PENDING', 'none'),
        booking({ status: 'PAYMENT_PENDING', expiresAt: null }),
        { kind: 'inactive', refund: false, reason: 'other', eventId: 'evt_1', ticketCount: 3 },
      ],
      [
        'PAYMENT_PENDING / none, unparsable expiresAt',
        statusOk('PAYMENT_PENDING', 'none'),
        booking({ status: 'PAYMENT_PENDING', expiresAt: 'not-a-date' }),
        { kind: 'inactive', refund: false, reason: 'other', eventId: 'evt_1', ticketCount: 3 },
      ],
      [
        'CANCELLED',
        statusOk('CANCELLED'),
        booking({ status: 'CANCELLED' }),
        { kind: 'inactive', refund: false, reason: 'other', eventId: 'evt_1', ticketCount: 3 },
      ],
      [
        'CANCELLED status, booking already EXPIRED',
        statusOk('CANCELLED'),
        booking({ status: 'EXPIRED' }),
        { kind: 'inactive', refund: false, reason: 'expired', eventId: 'evt_1', ticketCount: 3 },
      ],
      [
        'CANCELLED status, refundRequired on the booking',
        statusOk('CANCELLED'),
        booking({ status: 'CANCELLED', refundRequired: true }),
        { kind: 'inactive', refund: true, reason: 'expired', eventId: 'evt_1', ticketCount: 3 },
      ],
      [
        'SELECTION, no attendees, lines 1 + 1',
        statusOk('SELECTION', 'none'),
        booking({
          status: 'SELECTION',
          expiresAt: '2026-11-13T03:20:00Z',
          attendees: [],
          price: {
            ...VIEW.price,
            lines: VIEW.price.lines.map((line) => ({ ...line, quantity: 1 })),
          },
        }),
        { kind: 'inactive', refund: false, reason: 'other', eventId: 'evt_1', ticketCount: 2 },
      ],
      [
        'SELECTION past its deadline is not expired by time',
        statusOk('SELECTION', 'none'),
        booking({ status: 'SELECTION', expiresAt: '2026-11-13T03:00:00Z' }),
        { kind: 'inactive', refund: false, reason: 'other', eventId: 'evt_1', ticketCount: 3 },
      ],
      [
        'CANCELLED, no attendees and no lines',
        statusOk('CANCELLED'),
        booking({ status: 'CANCELLED', attendees: undefined, price: { ...VIEW.price, lines: [] } }),
        { kind: 'inactive', refund: false, reason: 'other', eventId: 'evt_1', ticketCount: null },
      ],
    ];

    /** Rows whose Status is dead on its own, so checkStatus reaches the inactive path too. */
    const DEAD_ROWS = ROWS.filter(([, status]) =>
      ['EXPIRED', 'CANCELLED', 'SELECTION'].includes(status.data.bookingStatus),
    );

    const notHeld = () => problem(409, 'BOOKING_NOT_HELD');

    afterEach(() => {
      vi.useRealTimers();
    });

    it.each(ROWS)('load, 409: %s', async (_, status, read, expected) => {
      paymentService.getPaymentPage.mockRejectedValueOnce(notHeld());
      paymentService.getPaymentStatus.mockResolvedValueOnce(status);
      bookingService.getBooking.mockReset();
      bookingService.getBooking.mockResolvedValueOnce({ status: 200, data: read });
      const result = await useCase.load('bk1');
      expect(result).toEqual(expected);
      noSecrets(result);
      expect(paymentService.getPaymentPage).toHaveBeenCalledTimes(1);
      expect(paymentService.getPaymentStatus).toHaveBeenCalledTimes(1);
      expect(bookingService.getBooking).toHaveBeenCalledTimes(1);
      expect(bookingService.getBooking).toHaveBeenNthCalledWith(1, 'bk1');
    });

    it.each(ROWS)('pay, start 409: %s (never opens Snap)', async (_, status, read, expected) => {
      paymentService.startSnap.mockRejectedValueOnce(notHeld());
      paymentService.getPaymentStatus.mockResolvedValueOnce(status);
      bookingService.getBooking.mockReset();
      bookingService.getBooking.mockResolvedValueOnce({ status: 200, data: read });
      const result = await useCase.pay({ bookingId: 'bk1', idempotencyKey: 'K1', reusable: null });
      expect(result).toEqual(expected);
      expect(paymentService.startSnap).toHaveBeenCalledTimes(1);
      expect(paymentService.getPaymentStatus).toHaveBeenCalledTimes(1);
      expect(bookingService.getBooking).toHaveBeenCalledTimes(1);
      expect(bookingService.getBooking).toHaveBeenNthCalledWith(1, 'bk1');
      expect(snap.pay).not.toHaveBeenCalled();
    });

    it.each(DEAD_ROWS)('checkStatus, success hint: %s', async (_, status, read, expected) => {
      paymentService.getPaymentStatus.mockResolvedValueOnce(status);
      bookingService.getBooking.mockReset();
      bookingService.getBooking.mockResolvedValueOnce({ status: 200, data: read });
      await expect(useCase.checkStatus('bk1', 'success')).resolves.toEqual(expected);
      expect(paymentService.getPaymentStatus).toHaveBeenCalledTimes(1);
      expect(bookingService.getBooking).toHaveBeenCalledTimes(1);
      expect(bookingService.getBooking).toHaveBeenNthCalledWith(1, 'bk1');
    });

    it('checkStatus enriches paid_after_expiry on a still PAYMENT_PENDING status', async () => {
      paymentService.getPaymentStatus.mockResolvedValueOnce(statusOk('PAYMENT_PENDING', 'paid_after_expiry'));
      bookingService.getBooking.mockReset();
      bookingService.getBooking.mockResolvedValueOnce({ status: 200, data: booking({ status: 'PAYMENT_PENDING' }) });
      await expect(useCase.checkStatus('bk1', 'pending')).resolves.toEqual({
        kind: 'inactive',
        refund: true,
        reason: 'expired',
        eventId: 'evt_1',
        ticketCount: 3,
      });
    });

    it('classifies on the booking serverNow only, not the device clock (2031)', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2031-01-01T00:00:00Z'));
      const live = booking({ status: 'PAYMENT_PENDING', expiresAt: '2026-11-13T03:20:00Z' });
      const late = booking({ status: 'PAYMENT_PENDING', expiresAt: '2026-11-13T03:11:00Z' });
      for (const [read, reason] of [
        [live, 'other'],
        [late, 'expired'],
      ] as const) {
        paymentService.getPaymentPage.mockRejectedValueOnce(notHeld());
        paymentService.getPaymentStatus.mockResolvedValueOnce(statusOk('PAYMENT_PENDING', 'pending'));
        bookingService.getBooking.mockResolvedValueOnce({ status: 200, data: read });
        await expect(useCase.load('bk1')).resolves.toMatchObject({ kind: 'inactive', reason });
      }
    });

    describe('a failed Booking read', () => {
      it.each([
        ['401', problem(401, 'UNAUTHORIZED')],
        ['UNAUTHORIZED without status', { code: 'UNAUTHORIZED' }],
      ])('%s: load and pay return unauthorized, checkStatus rejects with it', async (_, error) => {
        bookingService.getBooking.mockReset();
        bookingService.getBooking.mockRejectedValue(error);

        paymentService.getPaymentPage.mockRejectedValueOnce(notHeld());
        paymentService.getPaymentStatus.mockResolvedValueOnce(statusOk('EXPIRED', 'expired'));
        await expect(useCase.load('bk1')).resolves.toEqual({ kind: 'unauthorized' });

        paymentService.startSnap.mockRejectedValueOnce(notHeld());
        paymentService.getPaymentStatus.mockResolvedValueOnce(statusOk('EXPIRED', 'expired'));
        await expect(useCase.pay({ bookingId: 'bk1', idempotencyKey: 'K1', reusable: null })).resolves.toEqual({
          kind: 'unauthorized',
        });

        paymentService.getPaymentStatus.mockResolvedValueOnce(statusOk('EXPIRED', 'expired'));
        await expect(useCase.checkStatus('bk1', 'success')).rejects.toBe(error);

        expect(bookingService.getBooking).toHaveBeenCalledTimes(3);
        expect(snap.pay).not.toHaveBeenCalled();
      });

      it.each([
        ['404 NOT_FOUND', problem(404, 'NOT_FOUND'), statusOk('EXPIRED', 'expired'), ended(false, 'expired')],
        ['503', problem(503, 'SERVICE_UNAVAILABLE'), statusOk('EXPIRED', 'expired'), ended(false, 'expired')],
        ['NETWORK_ERROR', problem(0, 'NETWORK_ERROR'), statusOk('EXPIRED', 'expired'), ended(false, 'expired')],
        ['TIMEOUT', problem(0, 'TIMEOUT'), statusOk('CANCELLED'), ended(false, 'other')],
        [
          '500, late payment',
          problem(500, 'INTERNAL_ERROR'),
          statusOk('EXPIRED', 'paid_after_expiry'),
          ended(true, 'expired'),
        ],
        ['unknown', new Error('boom'), statusOk('PAYMENT_PENDING', 'none'), ended(false, 'other')],
      ])('%s: keeps the outcome from the Status, with nulls, no retry', async (_, error, status, expected) => {
        paymentService.getPaymentPage.mockRejectedValueOnce(notHeld());
        paymentService.getPaymentStatus.mockResolvedValueOnce(status);
        bookingService.getBooking.mockReset();
        bookingService.getBooking.mockRejectedValue(error);
        await expect(useCase.load('bk1')).resolves.toEqual(expected);
        expect(bookingService.getBooking).toHaveBeenCalledTimes(1);
      });

      it('checkStatus keeps the outcome on a 503 read', async () => {
        paymentService.getPaymentStatus.mockResolvedValueOnce(statusOk('EXPIRED', 'expired'));
        await expect(useCase.checkStatus('bk1', 'success')).resolves.toEqual(ended(false, 'expired'));
        expect(bookingService.getBooking).toHaveBeenCalledTimes(1);
      });
    });

    describe('call budget: no Booking read off the inactive path', () => {
      it('load ready, load paid, load not-found', async () => {
        paymentService.getPaymentPage.mockResolvedValueOnce({ status: 200, data: VIEW });
        await useCase.load('bk1');
        paymentService.getPaymentPage.mockRejectedValueOnce(notHeld());
        paymentService.getPaymentStatus.mockResolvedValueOnce(statusOk('PAID', 'settled'));
        await expect(useCase.load('bk1')).resolves.toEqual({ kind: 'paid' });
        paymentService.getPaymentPage.mockRejectedValueOnce(problem(404, 'NOT_FOUND'));
        await useCase.load('bk1');
        expect(paymentService.getPaymentStatus).toHaveBeenCalledTimes(1);
        expect(bookingService.getBooking).not.toHaveBeenCalled();
      });

      it('pay snap, retryable, paid', async () => {
        snap.pay.mockResolvedValueOnce({ kind: 'success' });
        await useCase.pay({ bookingId: 'bk1', idempotencyKey: 'K1', reusable: S1 });
        paymentService.startSnap.mockRejectedValueOnce(problem(503, 'PAYMENT_PROVIDER_BUSY'));
        await useCase.pay({ bookingId: 'bk1', idempotencyKey: 'K1', reusable: null });
        paymentService.startSnap.mockRejectedValueOnce(notHeld());
        paymentService.getPaymentStatus.mockResolvedValueOnce(statusOk('PAID', 'settled'));
        await expect(useCase.pay({ bookingId: 'bk1', idempotencyKey: 'K1', reusable: null })).resolves.toEqual({
          kind: 'paid',
        });
        expect(bookingService.getBooking).not.toHaveBeenCalled();
      });

      it.each<[BookingStatus, PaymentStatus, SnapHint]>([
        ['PAID', 'settled', 'success'],
        ['PAYMENT_PENDING', 'denied', 'error'],
        ['PAYMENT_PENDING', 'pending', 'pending'],
        ['PAYMENT_PENDING', 'settled', 'success'],
      ])('checkStatus %s / %s (%s)', async (bookingStatus, paymentStatus, hint) => {
        paymentService.getPaymentStatus.mockResolvedValueOnce(statusOk(bookingStatus, paymentStatus));
        await useCase.checkStatus('bk1', hint);
        expect(paymentService.getPaymentStatus).toHaveBeenCalledTimes(1);
        expect(bookingService.getBooking).not.toHaveBeenCalled();
      });
    });

    it('a 500 from getPaymentStatus propagates from load, pay and checkStatus without a Booking read', async () => {
      const error = problem(500, 'INTERNAL_ERROR');
      paymentService.getPaymentStatus.mockRejectedValue(error);
      paymentService.getPaymentPage.mockRejectedValueOnce(notHeld());
      await expect(useCase.load('bk1')).rejects.toBe(error);
      paymentService.startSnap.mockRejectedValueOnce(notHeld());
      await expect(useCase.pay({ bookingId: 'bk1', idempotencyKey: 'K1', reusable: null })).rejects.toBe(error);
      await expect(useCase.checkStatus('bk1', 'success')).rejects.toBe(error);
      expect(bookingService.getBooking).not.toHaveBeenCalled();
    });
  });
});
