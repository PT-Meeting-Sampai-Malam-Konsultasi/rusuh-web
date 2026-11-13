// @vitest-environment node
// Node: Axios uses its http adapter here, so the request really leaves the app and MSW answers it.
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { BookingService } from '@core/services/booking.service';
import { PaymentService } from '@core/services/payment.service';
import { createHttpAdapter } from '@infrastructure/adapters/http.adapter';

import { createHandlers } from '../handlers/handlers';
import { MOCK_CUSTOMER_EMAIL, MOCK_SETTLE_MS } from '../handlers/payment.handlers';
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
const payment = PaymentService({ coreHttp: signedInHttp });
const signedOut = PaymentService({ coreHttp: createHttpAdapter({ baseUrl: CORE, timeoutMs: 5000 }) });

let tokens: string[] = [];
let keys = 0;
const key = () => `pay-key-${(keys += 1)}`;

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

describe('getPaymentPage mock', () => {
  it('serves the payment view with attempt 1 as the live Snap', async () => {
    const { bookingId, orderCode, snapToken } = await hold();
    const { data, status } = await payment.getPaymentPage(bookingId);
    expect(status).toBe(200);
    const { data: stored } = await booking.getBooking(bookingId);
    expect(data).toMatchObject({
      bookingId,
      orderCode,
      eventName: 'Samudra',
      venueShort: 'GBK',
      timezone: 'Asia/Jakarta',
      customerEmail: MOCK_CUSTOMER_EMAIL,
      attendees: stored.attendees,
      price: stored.price,
      expiresAt: stored.expiresAt,
      serverNow: clock.toISOString(),
      csrfToken: 'mock-csrf',
      snapClientKey: 'SB-Mid-client-mock',
    });
    expect(data.eventStartsAt).toEqual(expect.any(String));
    expect(data.currentSnap).toEqual({
      attemptId: 1,
      orderId: `${bookingId}-1`,
      method: null,
      snapToken,
      redirectUrl: `https://app.sandbox.midtrans.com/snap/v4/redirection/${snapToken}`,
      gatewayExpiresAt: stored.expiresAt,
    });
    expect(snapToken).toBe(`mock-snap-${bookingId}-1`);
    for (const nik of NIKS) expect(JSON.stringify(data)).not.toContain(nik);
  });

  it('hides the live attempt under snap_busy', async () => {
    const { bookingId } = await hold();
    scenario = 'snap_busy';
    const { data } = await payment.getPaymentPage(bookingId);
    expect(data.currentSnap).toBeNull();
  });

  it('answers 401 without a session, 404 for an unknown booking', async () => {
    const { bookingId } = await hold();
    await rejection(signedOut.getPaymentPage(bookingId), { status: 401, code: 'UNAUTHORIZED' });
    await rejection(payment.getPaymentPage('bk_nope'), { status: 404, code: 'NOT_FOUND' });
  });

  it('answers 409 BOOKING_NOT_HELD for a fixture, a SELECTION and an expired booking', async () => {
    const notHeld = { status: 409, code: 'BOOKING_NOT_HELD' };
    await rejection(payment.getPaymentPage('bk_mock_samudra'), notHeld);
    const selection = await create();
    await rejection(payment.getPaymentPage(selection.bookingId), notHeld);
    later(60 * 60_000);
    const { bookingId } = await hold();
    later(10 * 60_000);
    await rejection(payment.getPaymentPage(bookingId), notHeld);
  });

  it('fails with the API problem code and like a dropped connection', async () => {
    const { bookingId } = await hold();
    scenario = 'error';
    await rejection(payment.getPaymentPage(bookingId), { status: 503, code: 'INTERNAL_ERROR' });
    scenario = 'offline';
    await rejection(payment.getPaymentPage(bookingId), { code: 'NETWORK_ERROR' });
  });
});

describe('startSnapPayment mock', () => {
  it('replays the attempt for the same key and opens attempt n + 1 for a new one', async () => {
    const { bookingId } = await hold();
    const first = await payment.startSnap(bookingId, 'snap-a');
    expect(first.status).toBe(201);
    expect(first.data).toMatchObject({
      attemptId: 2,
      orderId: `${bookingId}-2`,
      method: null,
      snapToken: `mock-snap-${bookingId}-2`,
    });
    const replay = await payment.startSnap(bookingId, 'snap-a');
    expect(replay.data).toEqual(first.data);
    const next = await payment.startSnap(bookingId, 'snap-b');
    expect(next.data.attemptId).toBe(3);
    const { data } = await payment.getPaymentPage(bookingId);
    expect(data.currentSnap?.attemptId).toBe(3);
  });

  it('answers 503 PAYMENT_PROVIDER_BUSY on the first start under snap_busy; the retry opens attempt 2', async () => {
    const { bookingId } = await hold();
    scenario = 'snap_busy';
    await rejection(payment.startSnap(bookingId, 'snap-a'), { status: 503, code: 'PAYMENT_PROVIDER_BUSY' });
    const { data } = await payment.startSnap(bookingId, 'snap-a');
    expect(data.attemptId).toBe(2);
  });

  it('answers 422 VALIDATION_FAILED without an Idempotency-Key', async () => {
    const { bookingId } = await hold();
    const raw = await fetch(`${CORE}/payment/payments/${bookingId}/snap`, {
      method: 'POST',
      headers: { Authorization: 'Bearer mock-access' },
    });
    expect(raw.status).toBe(422);
    expect(await raw.json()).toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('answers 401, 404 and 409 BOOKING_NOT_HELD', async () => {
    const { bookingId } = await hold();
    await rejection(signedOut.startSnap(bookingId, 'k'), { status: 401, code: 'UNAUTHORIZED' });
    await rejection(payment.startSnap('bk_nope', 'k'), { status: 404, code: 'NOT_FOUND' });
    await rejection(payment.startSnap('bk_mock_samudra', 'k'), { status: 409, code: 'BOOKING_NOT_HELD' });
    later(10 * 60_000);
    await rejection(payment.startSnap(bookingId, 'k'), { status: 409, code: 'BOOKING_NOT_HELD' });
  });

  it('fails with the API problem code', async () => {
    const { bookingId } = await hold();
    scenario = 'error';
    await rejection(payment.startSnap(bookingId, 'k'), { status: 503, code: 'INTERNAL_ERROR' });
  });
});

describe('getPaymentStatus mock', () => {
  it('ok: pending until MOCK_SETTLE_MS after the first poll, then PAID with one ticket per attendee', async () => {
    const { bookingId, orderCode } = await hold();
    expect(MOCK_SETTLE_MS).toBe(3000);
    const poll = async () => (await payment.getPaymentStatus(bookingId)).data;
    await expect(poll()).resolves.toEqual({
      bookingStatus: 'PAYMENT_PENDING',
      paymentStatus: 'pending',
      serverNow: clock.toISOString(),
    });
    later(MOCK_SETTLE_MS - 1);
    await expect(poll()).resolves.toMatchObject({ bookingStatus: 'PAYMENT_PENDING', paymentStatus: 'pending' });
    later(1);
    await expect(poll()).resolves.toEqual({
      bookingStatus: 'PAID',
      paymentStatus: 'settled',
      serverNow: clock.toISOString(),
    });
    await expect(poll()).resolves.toMatchObject({ bookingStatus: 'PAID', paymentStatus: 'settled' });

    const { data } = await booking.getBooking(bookingId);
    expect(data).toMatchObject({
      status: 'PAID',
      paidAt: clock.toISOString(),
      paymentMethod: 'qris',
      expiresAt: null,
    });
    const digits = orderCode.replace(/\D/g, '').slice(-6);
    expect(data.tickets).toEqual([
      {
        ticketId: `${bookingId}_t1`,
        ticketCode: `MCK-${digits}-1`,
        bookingId,
        eventId: 'evt_samudra',
        categoryId: 'cat_festival_b',
        categoryName: 'Festival B',
        holderName: NAMES[0],
        nikMasked: '3174 •••• •••• 0004',
        qrPayload: `RSH1.MCK-${digits}-1.bW9jay1zaWduZWQ`,
        issuedAt: clock.toISOString(),
      },
      expect.objectContaining({
        ticketId: `${bookingId}_t2`,
        ticketCode: `MCK-${digits}-2`,
        categoryName: 'Tribun Atas',
        holderName: NAMES[1],
        nikMasked: '3201 •••• •••• 0001',
      }),
    ]);
    await rejection(payment.getPaymentPage(bookingId), { status: 409, code: 'BOOKING_NOT_HELD' });
  });

  it('payment_pending: stays pending', async () => {
    const { bookingId } = await hold();
    scenario = 'payment_pending';
    await payment.getPaymentStatus(bookingId);
    later(60_000);
    await expect(payment.getPaymentStatus(bookingId)).resolves.toMatchObject({
      data: { bookingStatus: 'PAYMENT_PENDING', paymentStatus: 'pending' },
    });
  });

  it('payment_denied: attempt 1 is denied and dropped from the view; attempt 2 settles', async () => {
    const { bookingId } = await hold();
    scenario = 'payment_denied';
    await payment.getPaymentStatus(bookingId);
    later(MOCK_SETTLE_MS);
    const denied = { data: { bookingStatus: 'PAYMENT_PENDING', paymentStatus: 'denied' } };
    await expect(payment.getPaymentStatus(bookingId)).resolves.toMatchObject(denied);
    later(MOCK_SETTLE_MS);
    await expect(payment.getPaymentStatus(bookingId)).resolves.toMatchObject(denied);
    expect((await payment.getPaymentPage(bookingId)).data.currentSnap).toBeNull();

    const { data: attempt } = await payment.startSnap(bookingId, 'retry-1');
    expect(attempt.attemptId).toBe(2);
    expect((await payment.getPaymentPage(bookingId)).data.currentSnap?.attemptId).toBe(2);
    await expect(payment.getPaymentStatus(bookingId)).resolves.toMatchObject({
      data: { bookingStatus: 'PAYMENT_PENDING', paymentStatus: 'pending' },
    });
    later(MOCK_SETTLE_MS);
    await expect(payment.getPaymentStatus(bookingId)).resolves.toMatchObject({
      data: { bookingStatus: 'PAID', paymentStatus: 'settled' },
    });
  });

  it('payment_late: EXPIRED with paid_after_expiry and refundRequired, no tickets', async () => {
    const { bookingId } = await hold();
    scenario = 'payment_late';
    await payment.getPaymentStatus(bookingId);
    later(MOCK_SETTLE_MS);
    await expect(payment.getPaymentStatus(bookingId)).resolves.toMatchObject({
      data: { bookingStatus: 'EXPIRED', paymentStatus: 'paid_after_expiry' },
    });
    await expect(payment.getPaymentStatus(bookingId)).resolves.toMatchObject({
      data: { bookingStatus: 'EXPIRED', paymentStatus: 'paid_after_expiry' },
    });
    const { data } = await booking.getBooking(bookingId);
    expect(data).toMatchObject({ status: 'EXPIRED', expiresAt: null, refundRequired: true, tickets: [] });
  });

  it('answers the booking status for SELECTION and an expired hold', async () => {
    const selection = await create();
    await expect(payment.getPaymentStatus(selection.bookingId)).resolves.toMatchObject({
      data: { bookingStatus: 'SELECTION', paymentStatus: 'none' },
    });
    later(60 * 60_000);
    const { bookingId } = await hold();
    later(10 * 60_000);
    await expect(payment.getPaymentStatus(bookingId)).resolves.toMatchObject({
      data: { bookingStatus: 'EXPIRED', paymentStatus: 'none' },
    });
  });

  it('answers the fixtures: PAID settled, EXPIRED expired', async () => {
    await expect(payment.getPaymentStatus('bk_mock_samudra')).resolves.toMatchObject({
      data: { bookingStatus: 'PAID', paymentStatus: 'settled', serverNow: clock.toISOString() },
    });
    await expect(payment.getPaymentStatus('bk_mock_expired')).resolves.toMatchObject({
      data: { bookingStatus: 'EXPIRED', paymentStatus: 'expired' },
    });
  });

  it('answers 401, 404 and the failure scenarios', async () => {
    const { bookingId } = await hold();
    await rejection(signedOut.getPaymentStatus(bookingId), { status: 401, code: 'UNAUTHORIZED' });
    await rejection(payment.getPaymentStatus('bk_nope'), { status: 404, code: 'NOT_FOUND' });
    scenario = 'error';
    await rejection(payment.getPaymentStatus(bookingId), { status: 503, code: 'INTERNAL_ERROR' });
  });
});
