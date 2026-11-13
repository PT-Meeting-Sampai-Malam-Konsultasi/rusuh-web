import { describe, expect, it, vi } from 'vitest';

import type { Booking, BookingStatus } from '@core/entities/booking/booking.entity';

import type { HoldBookingInput, HoldBookingResult, PriceQuote, QuotableCategory } from '../hold-booking.use-case';
import { HoldBookingUseCase } from '../hold-booking.use-case';

const idr = (amount: number) => ({ amount, currency: 'IDR' as const });

const CATEGORIES: QuotableCategory[] = [
  { categoryId: 'B', name: 'Festival B', price: idr(850_000) },
  { categoryId: 'TB', name: 'Tribun Bawah', price: idr(650_000) },
  { categoryId: 'TA', name: 'Tribun Atas', price: idr(450_000) },
];

const problem = (status: number, code: string, data?: unknown, requestId?: string) => ({
  status,
  code,
  message: `${code} message`,
  data,
  ...(requestId ? { requestId } : {}),
});

const TICKETS = [
  { categoryId: 'cat_b', validationToken: 'tok1', nikLast4: '0004' },
  { categoryId: 'cat_b', validationToken: 'tok2', nikLast4: '0019' },
];

const input = (overrides: Partial<HoldBookingInput> = {}): HoldBookingInput => ({
  eventId: 'evt_1',
  admissionToken: 'adm',
  idempotencyKey: 'k1',
  tickets: TICKETS,
  bookingId: null,
  ...overrides,
});

const booking = (overrides: Partial<Booking> & { status: BookingStatus }): Booking => ({
  bookingId: 'bk9',
  eventId: 'evt_1',
  price: {
    lines: [
      { categoryId: 'cat_b', name: 'Festival B', quantity: 2, unitPrice: idr(850_000), lineTotal: idr(1_700_000) },
    ],
    ticketSubtotal: idr(1_700_000),
    adminFee: idr(10_000),
    total: idr(1_710_000),
  },
  createdAt: '2026-11-12T03:00:00Z',
  serverNow: '2026-11-12T03:01:00Z',
  attendees: [
    { categoryId: 'cat_b', categoryName: 'Festival B', fullName: 'Nadia', nikMasked: '3174 •••• •••• 0019' },
    { categoryId: 'cat_b', categoryName: 'Festival B', fullName: 'Raka', nikMasked: '3201 •••• •••• 0004' },
  ],
  ...overrides,
});

const created = (bookingId = 'bk1') => ({ data: booking({ bookingId, status: 'SELECTION' }), status: 201 });
const entered = (bookingId = 'bk1') => ({
  data: {
    bookingId,
    snapToken: 'snap_secret',
    paymentExpiresAt: '2026-11-12T03:11:00Z',
    serverNow: '2026-11-12T03:01:00Z',
  },
  status: 200,
});
const active = (items: Booking[]) => ({ data: { items }, status: 200 });

const setup = () => {
  const bookingService = {
    getCategories: vi.fn(),
    getBooking: vi.fn(),
    listMyTickets: vi.fn(),
    downloadTickets: vi.fn(),
    validateAttendee: vi.fn(),
    createBooking: vi.fn(),
    enterPayment: vi.fn(),
    getActiveBooking: vi.fn(),
  };
  const useCase = HoldBookingUseCase({ bookingService: bookingService as never });
  return { bookingService, useCase };
};

const CREATE_BODY = {
  eventId: 'evt_1',
  tickets: [
    { categoryId: 'cat_b', validationToken: 'tok1' },
    { categoryId: 'cat_b', validationToken: 'tok2' },
  ],
};

/** Property 9: no validation token, no unechoed NIK digits, no snap token in a result. */
const expectNoSecrets = (result: HoldBookingResult) => {
  const json = JSON.stringify(result);
  for (const secret of ['tok1', 'tok2', '0004', '0019', 'snap_secret']) expect(json).not.toContain(secret);
};

describe('HoldBookingUseCase.quote', () => {
  const { useCase } = setup();

  it.each<{ quantities: Record<string, number> } & PriceQuote>([
    { quantities: {}, lines: [], ticketCount: 0, ticketSubtotal: 0, adminFee: 0, total: 0 },
    {
      quantities: { B: 1 },
      lines: [{ categoryId: 'B', name: 'Festival B', quantity: 1, lineTotal: 850_000 }],
      ticketCount: 1,
      ticketSubtotal: 850_000,
      adminFee: 10_000,
      total: 860_000,
    },
    {
      quantities: { B: 2, TA: 1 },
      lines: [
        { categoryId: 'B', name: 'Festival B', quantity: 2, lineTotal: 1_700_000 },
        { categoryId: 'TA', name: 'Tribun Atas', quantity: 1, lineTotal: 450_000 },
      ],
      ticketCount: 3,
      ticketSubtotal: 2_150_000,
      adminFee: 10_000,
      total: 2_160_000,
    },
    {
      quantities: { TA: 1, B: 2 },
      lines: [
        { categoryId: 'B', name: 'Festival B', quantity: 2, lineTotal: 1_700_000 },
        { categoryId: 'TA', name: 'Tribun Atas', quantity: 1, lineTotal: 450_000 },
      ],
      ticketCount: 3,
      ticketSubtotal: 2_150_000,
      adminFee: 10_000,
      total: 2_160_000,
    },
    { quantities: { B: -1, TB: 1.5, X: 2 }, lines: [], ticketCount: 0, ticketSubtotal: 0, adminFee: 0, total: 0 },
  ])('prices $quantities', ({ quantities, ...expected }) => {
    expect(useCase.quote(CATEGORIES, quantities, 10_000)).toEqual(expected);
  });

  it('charges the admin fee once per order, never per ticket', () => {
    for (let n = 1; n <= 3; n += 1) {
      const quote = useCase.quote(CATEGORIES, { TA: n }, 10_000);
      expect(quote.adminFee).toBe(10_000);
      expect(quote.ticketCount).toBe(n);
      expect(quote.total).toBe(quote.ticketSubtotal + quote.adminFee);
    }
  });
});

describe('HoldBookingUseCase.execute', () => {
  describe('pre-checks', () => {
    it.each([
      { name: 'no tickets', over: { tickets: [] }, expected: { kind: 'not-verified' } },
      {
        name: 'a ticket without a validation token',
        over: { tickets: [TICKETS[0], { ...TICKETS[1], validationToken: '' }] },
        expected: { kind: 'not-verified' },
      },
      { name: 'a null admission token', over: { admissionToken: null }, expected: { kind: 'admission-invalid' } },
      { name: 'an empty admission token', over: { admissionToken: '' }, expected: { kind: 'admission-invalid' } },
    ])('returns without a call for $name', async ({ over, expected }) => {
      const { bookingService, useCase } = setup();
      expect(await useCase.execute(input(over))).toEqual(expected);
      expect(bookingService.createBooking).not.toHaveBeenCalled();
      expect(bookingService.enterPayment).not.toHaveBeenCalled();
      expect(bookingService.getActiveBooking).not.toHaveBeenCalled();
    });
  });

  describe('create then enter payment', () => {
    it('holds a new booking with the exact body, key and token', async () => {
      const { bookingService, useCase } = setup();
      bookingService.createBooking.mockResolvedValueOnce(created());
      bookingService.enterPayment.mockResolvedValueOnce(entered());

      const result = await useCase.execute(input());

      expect(result).toEqual({ kind: 'held', bookingId: 'bk1', resumed: false });
      expect(bookingService.createBooking).toHaveBeenCalledTimes(1);
      expect(bookingService.createBooking).toHaveBeenNthCalledWith(1, 'adm', 'k1', CREATE_BODY);
      expect(bookingService.createBooking.mock.calls[0][2]).toEqual(CREATE_BODY);
      expect(bookingService.enterPayment).toHaveBeenCalledTimes(1);
      expect(bookingService.enterPayment).toHaveBeenNthCalledWith(1, 'bk1', 'adm');
      expect(bookingService.getActiveBooking).not.toHaveBeenCalled();
      expectNoSecrets(result);
    });

    it('resumes a known booking with the payment entry only', async () => {
      const { bookingService, useCase } = setup();
      bookingService.enterPayment.mockResolvedValueOnce(entered());

      const result = await useCase.execute(input({ bookingId: 'bk1' }));

      expect(result).toEqual({ kind: 'held', bookingId: 'bk1', resumed: false });
      expect(bookingService.enterPayment).toHaveBeenCalledExactlyOnceWith('bk1', 'adm');
      expect(bookingService.createBooking).not.toHaveBeenCalled();
      expect(bookingService.getActiveBooking).not.toHaveBeenCalled();
    });
  });

  describe('create errors', () => {
    it.each([
      { error: problem(403, 'ADMISSION_INVALID'), expected: { kind: 'admission-invalid' } },
      { error: problem(401, 'UNAUTHORIZED'), expected: { kind: 'unauthorized' } },
      { error: problem(401, 'TOKEN_EXPIRED'), expected: { kind: 'unauthorized' } },
      {
        error: problem(409, 'NIK_SEAT_TAKEN'),
        expected: { kind: 'nik-conflict', code: 'NIK_SEAT_TAKEN', slotIndexes: [], bookingId: null },
      },
      {
        error: problem(409, 'DUPLICATE_NIK'),
        expected: { kind: 'nik-conflict', code: 'DUPLICATE_NIK', slotIndexes: [], bookingId: null },
      },
      { error: problem(409, 'ATTENDEE_NOT_VALIDATED'), expected: { kind: 'attendees-stale' } },
      {
        error: problem(409, 'CATEGORY_SOLD_OUT', { categoryId: 'cat_b' }),
        expected: { kind: 'sold-out', categoryId: 'cat_b', bookingId: null },
      },
      {
        error: problem(409, 'QUANTITY_OVER_RESERVATION'),
        expected: { kind: 'over-reservation', categoryId: null },
      },
      {
        error: problem(409, 'QUANTITY_OVER_RESERVATION', { categoryId: 'cat_b' }),
        expected: { kind: 'over-reservation', categoryId: 'cat_b' },
      },
      {
        error: problem(503, 'INTERNAL_ERROR', undefined, 'req_1'),
        expected: { kind: 'retryable', code: 'INTERNAL_ERROR', bookingId: null, requestId: 'req_1' },
      },
      {
        error: problem(0, 'NETWORK_ERROR'),
        expected: { kind: 'retryable', code: 'NETWORK_ERROR', bookingId: null },
      },
      { error: problem(0, 'TIMEOUT'), expected: { kind: 'retryable', code: 'TIMEOUT', bookingId: null } },
      { error: { status: 502 }, expected: { kind: 'retryable', code: 'UNKNOWN_ERROR', bookingId: null } },
    ])('classifies $error.status $error.code', async ({ error, expected }) => {
      const { bookingService, useCase } = setup();
      bookingService.createBooking.mockRejectedValueOnce(error);

      const result = await useCase.execute(input());

      expect(result).toEqual(expected);
      expect(bookingService.createBooking).toHaveBeenCalledTimes(1);
      expect(bookingService.enterPayment).not.toHaveBeenCalled();
      expect(bookingService.getActiveBooking).not.toHaveBeenCalled();
      expectNoSecrets(result);
    });

    it.each([problem(422, 'VALIDATION_FAILED'), problem(0, 'UNKNOWN_ERROR'), problem(404, 'NOT_FOUND')])(
      'rethrows $code from the create as the same object',
      async (error) => {
        const { bookingService, useCase } = setup();
        bookingService.createBooking.mockRejectedValueOnce(error);

        await expect(useCase.execute(input())).rejects.toBe(error);
        expect(bookingService.enterPayment).not.toHaveBeenCalled();
      },
    );

    it('rethrows a non-object failure', async () => {
      const { bookingService, useCase } = setup();
      const error = new TypeError('boom');
      bookingService.createBooking.mockRejectedValueOnce(error);
      await expect(useCase.execute(input())).rejects.toBe(error);
    });
  });

  describe('payment entry errors', () => {
    it.each([
      {
        error: problem(503, 'PAYMENT_PROVIDER_BUSY'),
        expected: { kind: 'retryable', code: 'PAYMENT_PROVIDER_BUSY', bookingId: 'bk1' },
      },
      {
        error: problem(503, 'SERVICE_UNAVAILABLE'),
        expected: { kind: 'retryable', code: 'SERVICE_UNAVAILABLE', bookingId: 'bk1' },
      },
      {
        error: problem(409, 'NIK_SEAT_TAKEN', { nikMasked: '3275 •••• •••• 0019' }),
        expected: { kind: 'nik-conflict', code: 'NIK_SEAT_TAKEN', slotIndexes: [1], bookingId: 'bk1' },
      },
      {
        error: problem(409, 'NIK_SEAT_TAKEN', { nikMasked: '************9999' }),
        expected: { kind: 'nik-conflict', code: 'NIK_SEAT_TAKEN', slotIndexes: [], bookingId: 'bk1' },
      },
      {
        error: problem(409, 'NIK_SEAT_TAKEN', { nikMasked: '3275 •••• •••• ••••' }),
        expected: { kind: 'nik-conflict', code: 'NIK_SEAT_TAKEN', slotIndexes: [], bookingId: 'bk1' },
      },
      {
        error: problem(409, 'CATEGORY_SOLD_OUT', { categoryId: 'cat_b' }),
        expected: { kind: 'sold-out', categoryId: 'cat_b', bookingId: 'bk1' },
      },
      {
        error: problem(409, 'CATEGORY_SOLD_OUT', { categoryId: 7 }),
        expected: { kind: 'sold-out', categoryId: null, bookingId: 'bk1' },
      },
      { error: problem(409, 'BOOKING_NOT_HELD'), expected: { kind: 'not-held' } },
      { error: problem(404, 'NOT_FOUND'), expected: { kind: 'not-held' } },
      { error: problem(404, 'BOOKING_MISSING'), expected: { kind: 'not-held' } },
      { error: problem(403, 'ADMISSION_INVALID'), expected: { kind: 'admission-invalid' } },
      { error: problem(401, 'UNAUTHORIZED'), expected: { kind: 'unauthorized' } },
    ])('classifies $error.status $error.code after a create', async ({ error, expected }) => {
      const { bookingService, useCase } = setup();
      bookingService.createBooking.mockResolvedValueOnce(created());
      bookingService.enterPayment.mockRejectedValueOnce(error);

      const result = await useCase.execute(input());

      expect(result).toEqual(expected);
      expect(bookingService.createBooking).toHaveBeenCalledTimes(1);
      expect(bookingService.enterPayment).toHaveBeenCalledExactlyOnceWith('bk1', 'adm');
      expect(bookingService.getActiveBooking).not.toHaveBeenCalled();
      expectNoSecrets(result);
    });

    it('classifies a known-booking payment failure with that booking id', async () => {
      const { bookingService, useCase } = setup();
      bookingService.enterPayment.mockRejectedValueOnce(problem(500, 'INTERNAL_ERROR'));

      expect(await useCase.execute(input({ bookingId: 'bk1' }))).toEqual({
        kind: 'retryable',
        code: 'INTERNAL_ERROR',
        bookingId: 'bk1',
      });
      expect(bookingService.createBooking).not.toHaveBeenCalled();
    });

    it('rethrows an unclassified payment entry error as the same object', async () => {
      const { bookingService, useCase } = setup();
      const error = problem(422, 'VALIDATION_FAILED');
      bookingService.createBooking.mockResolvedValueOnce(created());
      bookingService.enterPayment.mockRejectedValueOnce(error);

      await expect(useCase.execute(input())).rejects.toBe(error);
    });
  });

  describe('active booking recovery', () => {
    const conflict = problem(409, 'ACCOUNT_HAS_ACTIVE_BOOKING');

    const recovering = (items: Booking[]) => {
      const ctx = setup();
      ctx.bookingService.createBooking.mockRejectedValueOnce(conflict);
      ctx.bookingService.getActiveBooking.mockResolvedValueOnce(active(items));
      return ctx;
    };

    it.each([
      { name: 'no active booking', items: [] as Booking[] },
      { name: 'a booking for another event', items: [booking({ eventId: 'evt_2', status: 'SELECTION' })] },
      { name: 'an expired booking', items: [booking({ status: 'EXPIRED' })] },
    ])('returns active-booking with nulls for $name', async ({ items }) => {
      const { bookingService, useCase } = recovering(items);

      const result = await useCase.execute(input());

      expect(result).toEqual({ kind: 'active-booking', bookingId: null, status: null });
      expect(bookingService.getActiveBooking).toHaveBeenCalledTimes(1);
      expect(bookingService.enterPayment).not.toHaveBeenCalled();
    });

    it('resumes a matching PAYMENT_PENDING booking without a call', async () => {
      const { bookingService, useCase } = recovering([booking({ status: 'PAYMENT_PENDING' })]);

      const result = await useCase.execute(input());

      expect(result).toEqual({ kind: 'held', bookingId: 'bk9', resumed: true });
      expect(bookingService.createBooking).toHaveBeenNthCalledWith(1, 'adm', 'k1', CREATE_BODY);
      expect(bookingService.getActiveBooking).toHaveBeenNthCalledWith(1);
      expect(bookingService.enterPayment).not.toHaveBeenCalled();
      expectNoSecrets(result);
    });

    it('enters payment on a matching SELECTION booking', async () => {
      const { bookingService, useCase } = recovering([booking({ status: 'SELECTION' })]);
      bookingService.enterPayment.mockResolvedValueOnce(entered('bk9'));

      expect(await useCase.execute(input())).toEqual({ kind: 'held', bookingId: 'bk9', resumed: true });
      expect(bookingService.enterPayment).toHaveBeenCalledExactlyOnceWith('bk9', 'adm');
    });

    it('carries the recovered booking id when its payment entry fails transiently', async () => {
      const { bookingService, useCase } = recovering([booking({ status: 'SELECTION' })]);
      bookingService.enterPayment.mockRejectedValueOnce(problem(503, 'INTERNAL_ERROR'));

      expect(await useCase.execute(input())).toEqual({ kind: 'retryable', code: 'INTERNAL_ERROR', bookingId: 'bk9' });
      expect(bookingService.enterPayment).toHaveBeenCalledExactlyOnceWith('bk9', 'adm');
    });

    it('does not continue a booking with other holders', async () => {
      const other = booking({
        status: 'SELECTION',
        attendees: [
          { categoryId: 'cat_b', categoryName: 'Festival B', fullName: 'Nadia', nikMasked: '3174 •••• •••• 0004' },
          { categoryId: 'cat_b', categoryName: 'Festival B', fullName: 'Dimas', nikMasked: '3174 •••• •••• 7777' },
        ],
      });
      const { bookingService, useCase } = recovering([other]);

      expect(await useCase.execute(input())).toEqual({ kind: 'active-booking', bookingId: 'bk9', status: 'SELECTION' });
      expect(bookingService.enterPayment).not.toHaveBeenCalled();
    });

    it('matches by price lines when the booking has no attendees', async () => {
      const { bookingService, useCase } = recovering([booking({ status: 'PAYMENT_PENDING', attendees: undefined })]);

      expect(await useCase.execute(input())).toEqual({ kind: 'held', bookingId: 'bk9', resumed: true });
      expect(bookingService.enterPayment).not.toHaveBeenCalled();
    });

    it('does not match different price lines when the booking has no attendees', async () => {
      const differing = booking({ status: 'PAYMENT_PENDING', attendees: [] });
      differing.price.lines = [{ ...differing.price.lines[0], quantity: 1 }];
      const { useCase } = recovering([differing]);

      expect(await useCase.execute(input())).toEqual({
        kind: 'active-booking',
        bookingId: 'bk9',
        status: 'PAYMENT_PENDING',
      });
    });

    it('returns retryable with no booking when the active list fails transiently', async () => {
      const { bookingService, useCase } = setup();
      bookingService.createBooking.mockRejectedValueOnce(conflict);
      bookingService.getActiveBooking.mockRejectedValueOnce(problem(0, 'NETWORK_ERROR', undefined, 'req_9'));

      expect(await useCase.execute(input())).toEqual({
        kind: 'retryable',
        code: 'NETWORK_ERROR',
        bookingId: null,
        requestId: 'req_9',
      });
      expect(bookingService.enterPayment).not.toHaveBeenCalled();
    });

    it('rethrows any other active list failure, 401 included, as the same object', async () => {
      const { bookingService, useCase } = setup();
      const error = problem(401, 'UNAUTHORIZED');
      bookingService.createBooking.mockRejectedValueOnce(conflict);
      bookingService.getActiveBooking.mockRejectedValueOnce(error);

      await expect(useCase.execute(input())).rejects.toBe(error);
      expect(bookingService.enterPayment).not.toHaveBeenCalled();
    });
  });
});
