import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { BookingStatus } from '@core/entities/booking/booking.entity';
import type { PaymentStatus, PaymentView, SnapTransaction } from '@core/entities/payment/payment.entity';

import type { PaymentStep, PayResult, SnapHint } from '../pay-booking.use-case';
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

const noSecrets = (value: unknown) => {
  const json = JSON.stringify(value);
  for (const name of NAMES) expect(json).not.toContain(name);
  expect(json).not.toContain('snap-token');
};

describe('PayBookingUseCase', () => {
  const paymentService = { getPaymentPage: vi.fn(), startSnap: vi.fn(), getPaymentStatus: vi.fn() };
  const snap = { load: vi.fn(), pay: vi.fn() };
  const useCase = PayBookingUseCase({ paymentService, snap } as never);

  beforeEach(() => {
    vi.resetAllMocks();
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
      ['EXPIRED / expired', statusOk('EXPIRED', 'expired'), { kind: 'inactive', refund: false }],
      ['EXPIRED / paid_after_expiry', statusOk('EXPIRED', 'paid_after_expiry'), { kind: 'inactive', refund: true }],
      ['CANCELLED', statusOk('CANCELLED'), { kind: 'inactive', refund: false }],
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
      ['EXPIRED / paid_after_expiry', statusOk('EXPIRED', 'paid_after_expiry'), { kind: 'inactive', refund: true }],
      ['CANCELLED', statusOk('CANCELLED', 'cancelled'), { kind: 'inactive', refund: false }],
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
      ['EXPIRED / paid_after_expiry', 'EXPIRED', 'paid_after_expiry', HINTS, { kind: 'inactive', refund: true }],
      [
        'PAYMENT_PENDING / paid_after_expiry',
        'PAYMENT_PENDING',
        'paid_after_expiry',
        HINTS,
        { kind: 'inactive', refund: true },
      ],
      ['EXPIRED / expired', 'EXPIRED', 'expired', HINTS, { kind: 'inactive', refund: false }],
      ['CANCELLED', 'CANCELLED', undefined, HINTS, { kind: 'inactive', refund: false }],
      ['SELECTION', 'SELECTION', 'none', HINTS, { kind: 'inactive', refund: false }],
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
});
