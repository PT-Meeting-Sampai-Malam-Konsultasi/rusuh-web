// @vitest-environment node
// Node: Axios uses its http adapter here, so the request really leaves the app and MSW answers it.
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { BookingService } from '@core/services/booking.service';
import { createHttpAdapter } from '@infrastructure/adapters/http.adapter';

import { createHandlers } from '../handlers/handlers';
import { MOCK_SETTLE_MS } from '../handlers/payment.handlers';
import type { MockScenario } from '../scenario';

const CORE = 'https://core.mock.test/v1';
const START = new Date('2026-11-03T03:00:00Z');
const NIKS = ['3174055203960004', '3201125203960001'] as const;
const NAMES = ['Nadia Saputri', 'Raka Pratama'] as const;

// A clock the tests move: every test starts an hour later, so earlier bookings have expired and never block a new one
// with ACCOUNT_HAS_ACTIVE_BOOKING.
let clock = START;
const later = (ms: number) => (clock = new Date(clock.getTime() + ms));
let scenario: MockScenario = 'ok';

const server = setupServer(
  ...createHandlers({
    coreApiUrl: CORE,
    queueApiUrl: 'https://queue.mock.test/v1',
    getScenario: () => scenario,
    now: () => clock,
  }),
);
const signedInHttp = createHttpAdapter({ baseUrl: CORE, timeoutMs: 5000, getAccessToken: () => 'mock-access' });
const booking = BookingService({ coreHttp: signedInHttp });
const signedOut = BookingService({ coreHttp: createHttpAdapter({ baseUrl: CORE, timeoutMs: 5000 }) });
const check = (bookingId: string) => booking.checkPaymentStatus(bookingId, 'adm-1');

let tokens: string[] = [];
let keys = 0;
const key = () => `create-key-${(keys += 1)}`;

/** A SELECTION booking with both validated holders (Festival B, Tribun Atas). */
const create = async () => {
  const { data } = await booking.createBooking('adm-1', key(), {
    eventId: 'evt_samudra',
    tickets: [
      { categoryId: 'cat_festival_b', validationToken: tokens[0] },
      { categoryId: 'cat_tribun_atas', validationToken: tokens[1] },
    ],
  });
  return data;
};
/** Created and entered (FR-16): PAYMENT_PENDING with Snap attempt 1. */
const hold = async () => {
  const created = await create();
  const { data } = await booking.enterPayment(created.bookingId, 'adm-1');
  return { bookingId: created.bookingId, orderCode: created.orderCode!, snapToken: data.snapToken };
};

/** Rejects with the status and code; the problem body carries no full NIK and no name. */
const rejection = async (call: Promise<unknown>, expected: Record<string, unknown>) => {
  const error: unknown = await call.then(
    () => expect.fail('expected a rejection'),
    (e: unknown) => e,
  );
  expect(error).toMatchObject(expected);
  const text = JSON.stringify((error as { data?: unknown }).data ?? {});
  for (const nik of NIKS) expect(text).not.toContain(nik);
  for (const name of NAMES) expect(text).not.toContain(name);
};

beforeAll(async () => {
  server.listen({ onUnhandledFrame: 'error' });
  for (const [fieldIndex, nik] of NIKS.entries()) {
    const { data } = await booking.validateAttendee('evt_samudra', 'adm-1', {
      fieldIndex,
      fullName: NAMES[fieldIndex],
      nik,
    });
    tokens.push(data.validationToken);
  }
});
beforeEach(() => {
  later(60 * 60_000);
});
afterEach(() => {
  scenario = 'ok';
});
afterAll(() => {
  server.close();
  tokens = [];
});

describe('check-status mock (FR-20-W1)', () => {
  it('ok: pending on the first check, PAYMENT_PENDING until MOCK_SETTLE_MS later, then PAID with one ticket per attendee', async () => {
    const { bookingId, orderCode } = await hold();
    await expect(check(bookingId)).resolves.toMatchObject({ data: { status: 'PAYMENT_PENDING' } });
    later(MOCK_SETTLE_MS - 1);
    await expect(check(bookingId)).resolves.toMatchObject({ data: { status: 'PAYMENT_PENDING' } });
    later(1);
    const { data } = await check(bookingId);
    expect(data).toMatchObject({
      bookingId,
      status: 'PAID',
      paidAt: clock.toISOString(),
      paymentMethod: 'qris',
      expiresAt: null,
      serverNow: clock.toISOString(),
    });
    const digits = orderCode.replace(/\D/g, '').slice(-6);
    expect(data.tickets?.map((t) => [t.ticketCode, t.holderName, t.categoryName])).toEqual([
      [`MCK-${digits}-1`, NAMES[0], 'Festival B'],
      [`MCK-${digits}-2`, NAMES[1], 'Tribun Atas'],
    ]);
    // getBooking reads the same stored booking.
    await expect(booking.getBooking(bookingId)).resolves.toMatchObject({ data: { status: 'PAID' } });
    // The full NIK never leaves the mock.
    for (const nik of NIKS) expect(JSON.stringify(data)).not.toContain(nik);
  });

  it('payment_pending: stays PAYMENT_PENDING', async () => {
    scenario = 'payment_pending';
    const { bookingId } = await hold();
    await check(bookingId);
    later(MOCK_SETTLE_MS * 5);
    await expect(check(bookingId)).resolves.toMatchObject({ data: { status: 'PAYMENT_PENDING' } });
  });

  it('payment_denied: attempt 1 is denied, the booking stays payable, enterPayment opens attempt 2, which settles', async () => {
    scenario = 'payment_denied';
    const { bookingId, snapToken } = await hold();
    await check(bookingId);
    later(MOCK_SETTLE_MS);
    await expect(check(bookingId)).resolves.toMatchObject({ data: { status: 'PAYMENT_PENDING' } });
    const { data: next } = await booking.enterPayment(bookingId, 'adm-1');
    expect(next.snapToken).not.toBe(snapToken);
    expect(next.snapToken).toBe(`mock-snap-${bookingId}-2`);
    // Idempotent again: the same live attempt.
    await expect(booking.enterPayment(bookingId, 'adm-1')).resolves.toMatchObject({
      data: { snapToken: next.snapToken },
    });
    await check(bookingId);
    later(MOCK_SETTLE_MS);
    await expect(check(bookingId)).resolves.toMatchObject({ data: { status: 'PAID' } });
  });

  it('payment_late: EXPIRED with refundRequired, no tickets', async () => {
    scenario = 'payment_late';
    const { bookingId } = await hold();
    await check(bookingId);
    later(MOCK_SETTLE_MS);
    const { data } = await check(bookingId);
    expect(data).toMatchObject({ status: 'EXPIRED', refundRequired: true, expiresAt: null });
    expect(data.tickets ?? []).toEqual([]);
  });

  it('answers the booking as it is for SELECTION and an expired hold', async () => {
    const created = await create();
    await expect(check(created.bookingId)).resolves.toMatchObject({ data: { status: 'SELECTION' } });
    // The 5-minute selection ends first, so the next booking is allowed (one active booking per event).
    later(6 * 60_000);
    const { bookingId } = await hold();
    later(11 * 60_000);
    await expect(check(bookingId)).resolves.toMatchObject({ data: { status: 'EXPIRED' } });
  });

  it('answers the fixtures as they are', async () => {
    await expect(check('bk_mock_samudra')).resolves.toMatchObject({ data: { status: 'PAID' } });
    await expect(check('bk_mock_expired')).resolves.toMatchObject({ data: { status: 'EXPIRED' } });
  });

  it('answers 401, 403 without an admission token, 404 and the failure scenarios', async () => {
    const { bookingId } = await hold();
    await rejection(signedOut.checkPaymentStatus(bookingId, 'adm-1'), { status: 401, code: 'UNAUTHORIZED' });
    await rejection(booking.checkPaymentStatus(bookingId, ''), { status: 403, code: 'ADMISSION_INVALID' });
    await rejection(check('bk_nope'), { status: 404, code: 'NOT_FOUND' });
    scenario = 'error';
    await rejection(check(bookingId), { status: 503, code: 'INTERNAL_ERROR' });
    scenario = 'offline';
    await rejection(check(bookingId), { code: 'NETWORK_ERROR' });
  });
});

describe('enterPayment from the payment page (FR-20-W1)', () => {
  it('snap_busy: the first "Bayar" answers 503 PAYMENT_PROVIDER_BUSY; the retry returns the live token', async () => {
    scenario = 'snap_busy';
    const { bookingId, snapToken } = await hold();
    await rejection(booking.enterPayment(bookingId, 'adm-1'), { status: 503, code: 'PAYMENT_PROVIDER_BUSY' });
    await expect(booking.enterPayment(bookingId, 'adm-1')).resolves.toMatchObject({ data: { snapToken } });
  });
});
