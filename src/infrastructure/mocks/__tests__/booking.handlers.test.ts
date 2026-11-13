// @vitest-environment node
// Node: Axios uses its http adapter here, so the request really leaves the app and MSW answers it.
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { CreateBookingRequest, ValidateAttendeeRequest } from '@core/entities/booking/booking.entity';
import { BookingService } from '@core/services/booking.service';
import { createHttpAdapter } from '@infrastructure/adapters/http.adapter';

import { MOCK_ADMIN_FEE, MOCK_RETRY_AFTER_S } from '../handlers/booking.handlers';
import { MOCK_SHORT_ORDER_WINDOW_MS } from '../handlers/mock-queue-state';
import { createHandlers } from '../handlers/handlers';
import type { MockScenario } from '../scenario';

const CORE = 'https://core.mock.test/v1';
const NOW = new Date('2026-11-03T03:00:00Z');
let scenario: MockScenario = 'ok';
let locale = 'id';

const server = setupServer(
  ...createHandlers({
    coreApiUrl: CORE,
    queueApiUrl: 'https://queue.mock.test/v1',
    getScenario: () => scenario,
    now: () => NOW,
  }),
);
const booking = BookingService({
  coreHttp: createHttpAdapter({ baseUrl: CORE, timeoutMs: 5000, getLocale: () => locale }),
});

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => {
  scenario = 'ok';
  locale = 'id';
});
afterAll(() => server.close());

describe('booking mock', () => {
  it('serves the four HiFi categories with the order window', async () => {
    const { data, status } = await booking.getCategories('evt_samudra', 'adm-1');
    expect(status).toBe(200);
    expect(data.eventId).toBe('evt_samudra');
    expect(data.categories.map((c) => c.name)).toEqual(['Festival A', 'Festival B', 'Tribun Bawah', 'Tribun Atas']);
    expect(data.categories.map((c) => c.availability)).toEqual(['sold_out', 'available', 'almost_gone', 'available']);
    expect(data).toMatchObject({
      maxTicketsPerOrder: 3,
      reservedUnits: 3,
      adminFee: { amount: 10000, currency: 'IDR' },
    });
    expect(data).not.toHaveProperty('maxTickets');
    expect(data.serverNow).toBe(NOW.toISOString());
    expect(Date.parse(data.expiresAt) - Date.parse(data.serverNow)).toBe(300_000);
  });

  it('translates the descriptions but not the names', async () => {
    const id = (await booking.getCategories('evt_samudra', 'adm-1')).data.categories;
    locale = 'en';
    const en = (await booking.getCategories('evt_samudra', 'adm-1')).data.categories;
    expect(en.map((c) => c.name)).toEqual(id.map((c) => c.name));
    id.forEach((c, i) => expect(en[i].description).not.toBe(c.description));
    expect(en[0].description).toBe('Standing · closest to the stage');
    expect(id[0].description).toBe('Berdiri · paling dekat panggung');
  });

  it('answers 403 ADMISSION_INVALID without a token', async () => {
    await expect(booking.getCategories('evt_samudra', '')).rejects.toMatchObject({
      status: 403,
      code: 'ADMISSION_INVALID',
    });
  });

  it('answers 403 ADMISSION_INVALID for an unknown event', async () => {
    await expect(booking.getCategories('evt_nope', 'adm-1')).rejects.toMatchObject({
      status: 403,
      code: 'ADMISSION_INVALID',
    });
  });

  it('answers 403 ADMISSION_INVALID under the admission_invalid scenario', async () => {
    scenario = 'admission_invalid';
    await expect(booking.getCategories('evt_samudra', 'adm-1')).rejects.toMatchObject({
      status: 403,
      code: 'ADMISSION_INVALID',
    });
  });

  it('sells every category out', async () => {
    scenario = 'sold_out';
    const { data } = await booking.getCategories('evt_samudra', 'adm-1');
    expect(data.categories.every((c) => c.availability === 'sold_out')).toBe(true);
  });

  it('shortens the order window to 75 seconds under short_window, everything else as ok', async () => {
    const ok = (await booking.getCategories('evt_samudra', 'adm-1')).data;
    scenario = 'short_window';
    const { data, status } = await booking.getCategories('evt_samudra', 'adm-1');
    expect(status).toBe(200);
    expect(MOCK_SHORT_ORDER_WINDOW_MS).toBe(75_000);
    expect(data.serverNow).toBe(NOW.toISOString());
    expect(Date.parse(data.expiresAt) - Date.parse(data.serverNow)).toBe(75_000);
    expect({ ...data, expiresAt: ok.expiresAt }).toEqual(ok);
    expect(Date.parse(ok.expiresAt) - Date.parse(ok.serverNow)).toBe(300_000);
  });

  it('fails with the API problem code', async () => {
    scenario = 'error';
    await expect(booking.getCategories('evt_samudra', 'adm-1')).rejects.toMatchObject({
      status: 503,
      code: 'INTERNAL_ERROR',
    });
  });

  it('fails like a dropped connection', async () => {
    scenario = 'offline';
    await expect(booking.getCategories('evt_samudra', 'adm-1')).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  });
});

describe('tickets mock (FR-22-W1)', () => {
  const signedIn = BookingService({
    coreHttp: createHttpAdapter({ baseUrl: CORE, timeoutMs: 5000, getAccessToken: () => 'mock-access' }),
  });

  it('asks for a session', async () => {
    await expect(booking.listMyTickets()).rejects.toMatchObject({ status: 401, code: 'UNAUTHORIZED' });
    await expect(booking.getBooking('bk_mock_samudra')).rejects.toMatchObject({ status: 401 });
    await expect(booking.downloadTickets('bk_mock_samudra')).rejects.toMatchObject({ status: 401 });
  });

  it('lists the tickets of three paid orders, and none with ?mock=empty', async () => {
    const { data } = await signedIn.listMyTickets();
    expect(new Set(data.items.map((t) => t.bookingId))).toEqual(
      new Set(['bk_mock_samudra', 'bk_mock_pelita', 'bk_mock_kelana']),
    );
    expect(data.items).toHaveLength(6);
    scenario = 'empty';
    await expect(signedIn.listMyTickets()).resolves.toMatchObject({ data: { items: [] } });
    scenario = 'error';
    await expect(signedIn.listMyTickets()).rejects.toMatchObject({ status: 503 });
  });

  it('serves a paid booking with its tickets, an expired one, and 404 for the rest', async () => {
    const { data } = await signedIn.getBooking('bk_mock_samudra');
    expect(data).toMatchObject({ status: 'PAID', orderCode: 'RSH-26-084731', serverNow: NOW.toISOString() });
    expect(data.tickets).toHaveLength(3);
    expect(data.price.total.amount).toBe(data.price.ticketSubtotal.amount + data.price.adminFee.amount);
    await expect(signedIn.getBooking('bk_mock_expired')).resolves.toMatchObject({ data: { status: 'EXPIRED' } });
    await expect(signedIn.getBooking('bk_nope')).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
    scenario = 'error';
    await expect(signedIn.getBooking('bk_mock_samudra')).rejects.toMatchObject({ status: 503 });
  });

  it('downloads the PDF of a paid booking only', async () => {
    const { data } = await signedIn.downloadTickets('bk_mock_samudra');
    expect(String(data).startsWith('%PDF')).toBe(true);
    await expect(signedIn.downloadTickets('bk_mock_expired')).rejects.toMatchObject({ status: 409 });
    await expect(signedIn.downloadTickets('bk_nope')).rejects.toMatchObject({ status: 404 });
    scenario = 'error';
    await expect(signedIn.downloadTickets('bk_mock_samudra')).rejects.toMatchObject({ status: 503 });
  });
});

describe('validate attendee mock', () => {
  const NAME = 'Nadia Saputri';
  const attendee = (nik: string, extra: Partial<ValidateAttendeeRequest> = {}): ValidateAttendeeRequest => ({
    fieldIndex: 0,
    fullName: NAME,
    nik,
    ...extra,
  });

  /** Rejects with the status and code, and the problem body never carries the NIK or the name. */
  const expectProblem = async (
    call: Promise<unknown>,
    expected: { status: number; code: string },
    body?: ValidateAttendeeRequest,
  ) => {
    const error: unknown = await call.then(
      () => expect.fail('expected a rejection'),
      (e: unknown) => e,
    );
    expect(error).toMatchObject(expected);
    const text = JSON.stringify((error as { data?: unknown }).data ?? {});
    if (body) {
      if (body.nik) expect(text).not.toContain(body.nik);
      if (body.fullName.trim()) expect(text).not.toContain(body.fullName);
    }
    return error as { data?: Record<string, unknown> };
  };

  it('validates a NIK and masks all but the last 4 digits', async () => {
    const body = attendee('3174055203960004', { fieldIndex: 2 });
    const { data, status } = await booking.validateAttendee('evt_samudra', 'adm-1', body);
    expect(status).toBe(200);
    expect(data.nikMasked).toBe('************0004');
    expect(data.validationToken).toMatch(/^mock-attendee-2-\d+$/);
    expect(Date.parse(data.expiresAt) - NOW.getTime()).toBe(300_000);
    expect(JSON.stringify(data)).not.toContain(body.nik);
    expect(JSON.stringify(data)).not.toContain(NAME);
  });

  it('gives each validation its own token', async () => {
    const a = await booking.validateAttendee('evt_samudra', 'adm-1', attendee('3174055203960004'));
    const b = await booking.validateAttendee('evt_samudra', 'adm-1', attendee('3174055203960004'));
    expect(a.data.validationToken).not.toBe(b.data.validationToken);
  });

  it.each([
    { nik: '3174055203969999', status: 422, code: 'NIK_INVALID' },
    { nik: '3174055203968888', status: 409, code: 'NIK_SEAT_TAKEN' },
    { nik: '3174055203967777', status: 503, code: 'DUKCAPIL_UNAVAILABLE' },
  ])('answers $status $code for a NIK ending in $nik', async ({ nik, status, code }) => {
    const body = attendee(nik);
    await expectProblem(booking.validateAttendee('evt_samudra', 'adm-1', body), { status, code }, body);
  });

  it('rate-limits the 6666 NIK with retryAfter in the body and the Retry-After header', async () => {
    const body = attendee('3174055203966666');
    const error = await expectProblem(
      booking.validateAttendee('evt_samudra', 'adm-1', body),
      { status: 429, code: 'RATE_LIMITED' },
      body,
    );
    expect(error.data?.retryAfter).toBe(MOCK_RETRY_AFTER_S);
    const raw = await fetch(`${CORE}/core/events/evt_samudra/attendees/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Admission-Token': 'adm-1' },
      body: JSON.stringify(body),
    });
    expect(raw.status).toBe(429);
    expect(raw.headers.get('Retry-After')).toBe('60');
  });

  it.each([
    { name: 'a NIK that is not 16 digits', body: attendee('31740552039600'), code: 'NIK_INVALID' },
    { name: 'a blank name', body: attendee('3174055203960004', { fullName: '   ' }), code: 'VALIDATION_FAILED' },
    { name: 'fieldIndex 3', body: attendee('3174055203960004', { fieldIndex: 3 }), code: 'VALIDATION_FAILED' },
  ])('answers 422 for $name', async ({ body, code }) => {
    await expectProblem(booking.validateAttendee('evt_samudra', 'adm-1', body), { status: 422, code }, body);
  });

  it('answers 422 VALIDATION_FAILED for a body that is not JSON', async () => {
    const raw = await fetch(`${CORE}/core/events/evt_samudra/attendees/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Admission-Token': 'adm-1' },
      body: 'not json',
    });
    expect(raw.status).toBe(422);
    expect(await raw.json()).toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('answers 403 ADMISSION_INVALID without a token, for an unknown event and under admission_invalid', async () => {
    const body = attendee('3174055203960004');
    const invalid = { status: 403, code: 'ADMISSION_INVALID' };
    await expectProblem(booking.validateAttendee('evt_samudra', '', body), invalid, body);
    await expectProblem(booking.validateAttendee('evt_nope', 'adm-1', body), invalid, body);
    scenario = 'admission_invalid';
    await expectProblem(booking.validateAttendee('evt_samudra', 'adm-1', body), invalid, body);
  });

  it('answers 503 DUKCAPIL_UNAVAILABLE for every NIK under dukcapil_down, categories still load', async () => {
    scenario = 'dukcapil_down';
    const body = attendee('3174055203960004');
    await expectProblem(
      booking.validateAttendee('evt_samudra', 'adm-1', body),
      { status: 503, code: 'DUKCAPIL_UNAVAILABLE' },
      body,
    );
    await expect(booking.getCategories('evt_samudra', 'adm-1')).resolves.toMatchObject({ status: 200 });
  });

  it('fails with the API problem code and like a dropped connection', async () => {
    const body = attendee('3174055203960004');
    scenario = 'error';
    await expectProblem(booking.validateAttendee('evt_samudra', 'adm-1', body), {
      status: 503,
      code: 'INTERNAL_ERROR',
    });
    scenario = 'offline';
    await expect(booking.validateAttendee('evt_samudra', 'adm-1', body)).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
    });
  });
});

describe('hold mock (FR-16-W1)', () => {
  // Own handlers (a fresh booking store) and a clock the tests move: every test starts an hour later, so the bookings
  // of earlier tests have expired and never block a new one with ACCOUNT_HAS_ACTIVE_BOOKING.
  let clock = NOW;
  const at = () => clock;
  const later = (ms: number) => (clock = new Date(clock.getTime() + ms));
  const NIKS = ['3174055203960004', '3201125203960001', '3273014505900002'] as const;
  const NAMES = ['Nadia Saputri', 'Raka Pratama', 'Sinta Dewi'] as const;
  let tokens: string[] = [];
  let keys = 0;
  const key = () => `key-${(keys += 1)}`;

  const coreHttp = createHttpAdapter({ baseUrl: CORE, timeoutMs: 5000, getAccessToken: () => 'mock-access' });
  const signedIn = BookingService({ coreHttp });
  const body = (categoryIds: string[], tokenList = tokens): CreateBookingRequest => ({
    eventId: 'evt_samudra',
    tickets: categoryIds.map((categoryId, i) => ({ categoryId, validationToken: tokenList[i] })),
  });
  const create = (categoryIds: string[] = ['cat_festival_b'], idempotencyKey = key()) =>
    signedIn.createBooking('adm-1', idempotencyKey, body(categoryIds));

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
    return (error as { data: Record<string, unknown> }).data;
  };
  const expectNoFullNik = (data: unknown) => {
    const text = JSON.stringify(data);
    for (const nik of NIKS) expect(text).not.toContain(nik);
  };

  beforeAll(async () => {
    server.resetHandlers(
      ...createHandlers({
        coreApiUrl: CORE,
        queueApiUrl: 'https://queue.mock.test/v1',
        getScenario: () => scenario,
        now: at,
      }),
    );
    tokens = [];
    for (const [fieldIndex, nik] of NIKS.entries()) {
      const { data } = await booking.validateAttendee('evt_samudra', 'adm-1', {
        fieldIndex,
        fullName: ` ${NAMES[fieldIndex]} `,
        nik,
      });
      tokens.push(data.validationToken);
    }
  });
  beforeEach(() => {
    later(60 * 60_000);
  });
  afterAll(() => server.resetHandlers());

  describe('createBooking', () => {
    it('creates a SELECTION booking with one attendee per ticket, in request order', async () => {
      const { data, status } = await create(['cat_tribun_atas', 'cat_festival_b', 'cat_tribun_atas']);
      expect(status).toBe(201);
      expect(data).toMatchObject({
        bookingId: expect.stringMatching(/^bk_mock_\d+$/),
        eventId: 'evt_samudra',
        status: 'SELECTION',
        orderCode: expect.stringMatching(/^RSH-26-9\d{5}$/),
        refundRequired: false,
        tickets: [],
        paidAt: null,
        paymentMethod: null,
        createdAt: clock.toISOString(),
        serverNow: clock.toISOString(),
      });
      expect(Date.parse(data.expiresAt!) - clock.getTime()).toBe(300_000);
      expect(data.attendees).toEqual([
        {
          categoryId: 'cat_tribun_atas',
          categoryName: 'Tribun Atas',
          fullName: NAMES[0],
          nikMasked: '3174 •••• •••• 0004',
        },
        {
          categoryId: 'cat_festival_b',
          categoryName: 'Festival B',
          fullName: NAMES[1],
          nikMasked: '3201 •••• •••• 0001',
        },
        {
          categoryId: 'cat_tribun_atas',
          categoryName: 'Tribun Atas',
          fullName: NAMES[2],
          nikMasked: '3273 •••• •••• 0002',
        },
      ]);
      expect(data.price.lines).toEqual([
        {
          categoryId: 'cat_tribun_atas',
          name: 'Tribun Atas',
          quantity: 2,
          unitPrice: { amount: 450000, currency: 'IDR' },
          lineTotal: { amount: 900000, currency: 'IDR' },
        },
        {
          categoryId: 'cat_festival_b',
          name: 'Festival B',
          quantity: 1,
          unitPrice: { amount: 850000, currency: 'IDR' },
          lineTotal: { amount: 850000, currency: 'IDR' },
        },
      ]);
      expect(data.price.ticketSubtotal.amount).toBe(1_750_000);
      expectNoFullNik(data);
    });

    it.each([1, 2, 3])('charges the admin fee once for %i ticket(s)', async (count) => {
      const { data } = await create(Array.from({ length: count }, () => 'cat_festival_b'));
      expect(data.price.adminFee).toEqual({ amount: MOCK_ADMIN_FEE, currency: 'IDR' });
      expect(data.price.ticketSubtotal.amount).toBe(850000 * count);
      expect(data.price.total.amount).toBe(data.price.ticketSubtotal.amount + MOCK_ADMIN_FEE);
      expect(data.attendees).toHaveLength(count);
    });

    it('answers the same booking for the same Idempotency-Key, and keeps one', async () => {
      const first = await create(['cat_festival_b'], 'key-replay');
      const again = await create(['cat_festival_b'], 'key-replay');
      expect(again.status).toBe(201);
      expect(again.data.bookingId).toBe(first.data.bookingId);
      expect(again.data).toEqual(first.data);
      const { data } = await signedIn.getActiveBooking();
      expect(data.items.map((b) => b.bookingId)).toEqual([first.data.bookingId]);
    });

    it('answers 409 ACCOUNT_HAS_ACTIVE_BOOKING for a second key while the first is live, and lists that one', async () => {
      const first = await create();
      await rejection(create(), { status: 409, code: 'ACCOUNT_HAS_ACTIVE_BOOKING' });
      const { data } = await signedIn.getActiveBooking();
      expect(data.items).toHaveLength(1);
      expect(data.items[0]).toMatchObject({
        bookingId: first.data.bookingId,
        status: 'SELECTION',
        serverNow: clock.toISOString(),
      });
      expectNoFullNik(data);
    });

    it('fails like the API under error and offline', async () => {
      scenario = 'error';
      await rejection(create(), { status: 503, code: 'INTERNAL_ERROR' });
      scenario = 'offline';
      await expect(create()).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
    });

    it('answers 401 without a session', async () => {
      await rejection(booking.createBooking('adm-1', key(), body(['cat_festival_b'])), {
        status: 401,
        code: 'UNAUTHORIZED',
      });
    });

    it('answers 403 ADMISSION_INVALID without a token, under admission_invalid and for an unknown event', async () => {
      const invalid = { status: 403, code: 'ADMISSION_INVALID' };
      await rejection(signedIn.createBooking('', key(), body(['cat_festival_b'])), invalid);
      await rejection(
        signedIn.createBooking('adm-1', key(), { ...body(['cat_festival_b']), eventId: 'evt_nope' }),
        invalid,
      );
      scenario = 'admission_invalid';
      await rejection(create(), invalid);
    });

    it('answers 422 VALIDATION_FAILED without an Idempotency-Key', async () => {
      await rejection(signedIn.createBooking('adm-1', '', body(['cat_festival_b'])), {
        status: 422,
        code: 'VALIDATION_FAILED',
      });
    });

    it.each([
      { name: 'no tickets', tickets: [] },
      {
        name: 'four tickets',
        tickets: Array.from({ length: 4 }, (_, i) => ({ categoryId: 'cat_festival_b', validationToken: `t${i}` })),
      },
      { name: 'an unknown category', tickets: [{ categoryId: 'cat_nope', validationToken: 'x' }] },
      { name: 'a ticket without a token', tickets: [{ categoryId: 'cat_festival_b' }] },
      { name: 'tickets that are not a list', tickets: 'cat_festival_b' },
    ])('answers 422 VALIDATION_FAILED for $name', async ({ tickets }) => {
      await rejection(
        signedIn.createBooking('adm-1', key(), { eventId: 'evt_samudra', tickets } as unknown as CreateBookingRequest),
        { status: 422, code: 'VALIDATION_FAILED' },
      );
    });

    it('answers 422 VALIDATION_FAILED for a body that is not JSON or has no eventId', async () => {
      const headers = {
        'Content-Type': 'application/json',
        Authorization: 'Bearer mock-access',
        'X-Admission-Token': 'adm-1',
        'Idempotency-Key': key(),
      };
      const raw = await fetch(`${CORE}/core/bookings`, { method: 'POST', headers, body: 'not json' });
      expect(raw.status).toBe(422);
      expect(await raw.json()).toMatchObject({ code: 'VALIDATION_FAILED' });
      await rejection(
        signedIn.createBooking('adm-1', key(), { tickets: body(['cat_festival_b']).tickets } as CreateBookingRequest),
        { status: 422, code: 'VALIDATION_FAILED' },
      );
    });

    it('answers 409 ATTENDEE_NOT_VALIDATED for a token the mock never issued', async () => {
      await rejection(
        signedIn.createBooking('adm-1', key(), body(['cat_festival_b', 'cat_festival_b'], [tokens[0], 'mock-stale'])),
        { status: 409, code: 'ATTENDEE_NOT_VALIDATED' },
      );
    });

    it('answers 409 DUPLICATE_NIK for a token used twice', async () => {
      await rejection(
        signedIn.createBooking('adm-1', key(), body(['cat_festival_b', 'cat_tribun_atas'], [tokens[1], tokens[1]])),
        { status: 409, code: 'DUPLICATE_NIK' },
      );
    });

    it('answers 409 CATEGORY_SOLD_OUT with the sold-out fixture category', async () => {
      const data = await rejection(create(['cat_festival_b', 'cat_festival_a']), {
        status: 409,
        code: 'CATEGORY_SOLD_OUT',
      });
      expect(data.categoryId).toBe('cat_festival_a');
    });

    it('answers 409 CATEGORY_SOLD_OUT with the first ticket category under category_sold_out', async () => {
      scenario = 'category_sold_out';
      const data = await rejection(create(['cat_tribun_bawah', 'cat_festival_b']), {
        status: 409,
        code: 'CATEGORY_SOLD_OUT',
      });
      expect(data.categoryId).toBe('cat_tribun_bawah');
      const { data: active } = await signedIn.getActiveBooking();
      expect(active.items).toEqual([]);
    });
  });

  describe('enterPayment', () => {
    it('moves SELECTION to PAYMENT_PENDING for 10 minutes and repeats the same answer', async () => {
      const { data: created } = await create(['cat_festival_b', 'cat_tribun_atas']);
      later(60_000);
      const { data, status } = await signedIn.enterPayment(created.bookingId, 'adm-1');
      expect(status).toBe(200);
      expect(data).toEqual({
        bookingId: created.bookingId,
        snapToken: `mock-snap-${created.bookingId}-1`,
        paymentExpiresAt: new Date(clock.getTime() + 600_000).toISOString(),
        redirectUrl: null,
        serverNow: clock.toISOString(),
      });
      expect(Date.parse(data.paymentExpiresAt) - Date.parse(data.serverNow)).toBe(600_000);
      later(30_000);
      const again = await signedIn.enterPayment(created.bookingId, 'adm-1');
      expect(again.data.snapToken).toBe(data.snapToken);
      expect(again.data.paymentExpiresAt).toBe(data.paymentExpiresAt);
      expect(again.data.serverNow).toBe(clock.toISOString());

      const { data: stored } = await signedIn.getBooking(created.bookingId);
      expect(stored).toMatchObject({
        bookingId: created.bookingId,
        status: 'PAYMENT_PENDING',
        expiresAt: data.paymentExpiresAt,
        serverNow: clock.toISOString(),
      });
      expect(stored.attendees).toEqual(created.attendees);
      const { data: active } = await signedIn.getActiveBooking();
      expect(active.items.map((b) => b.status)).toEqual(['PAYMENT_PENDING']);
    });

    it('answers 409 BOOKING_NOT_HELD once the payment window has passed', async () => {
      const { data: created } = await create();
      await signedIn.enterPayment(created.bookingId, 'adm-1');
      later(10 * 60_000);
      await rejection(signedIn.enterPayment(created.bookingId, 'adm-1'), { status: 409, code: 'BOOKING_NOT_HELD' });
    });

    it('expires a SELECTION booking after 5 minutes: 409 BOOKING_NOT_HELD, no longer active', async () => {
      const { data: created } = await create();
      later(5 * 60_000 + 1000);
      await rejection(signedIn.enterPayment(created.bookingId, 'adm-1'), { status: 409, code: 'BOOKING_NOT_HELD' });
      await rejection(signedIn.enterPayment(created.bookingId, 'adm-1'), { status: 409, code: 'BOOKING_NOT_HELD' });
      await expect(signedIn.getActiveBooking()).resolves.toMatchObject({ data: { items: [] } });
      await expect(signedIn.getBooking(created.bookingId)).resolves.toMatchObject({
        data: { status: 'EXPIRED', expiresAt: null },
      });
      await expect(create()).resolves.toMatchObject({ status: 201 });
    });

    it('answers 503 PAYMENT_PROVIDER_BUSY on the first entry only under payment_busy', async () => {
      scenario = 'payment_busy';
      const { data: created } = await create();
      await rejection(signedIn.enterPayment(created.bookingId, 'adm-1'), {
        status: 503,
        code: 'PAYMENT_PROVIDER_BUSY',
      });
      await expect(signedIn.getBooking(created.bookingId)).resolves.toMatchObject({ data: { status: 'SELECTION' } });
      await expect(signedIn.enterPayment(created.bookingId, 'adm-1')).resolves.toMatchObject({
        status: 200,
        data: { snapToken: `mock-snap-${created.bookingId}-1` },
      });
    });

    it('answers 409 NIK_SEAT_TAKEN with the last holder masked under nik_seat_taken', async () => {
      scenario = 'nik_seat_taken';
      const { data: created } = await create(['cat_festival_b', 'cat_festival_b']);
      const data = await rejection(signedIn.enterPayment(created.bookingId, 'adm-1'), {
        status: 409,
        code: 'NIK_SEAT_TAKEN',
      });
      expect(data.nikMasked).toBe('3201 •••• •••• 0001');
      expect(data.nikMasked).toMatch(/^\d{4} •••• •••• \d{4}$/);
      await expect(signedIn.getBooking(created.bookingId)).resolves.toMatchObject({ data: { status: 'SELECTION' } });
    });

    it('answers 404 NOT_FOUND for an unknown booking', async () => {
      await rejection(signedIn.enterPayment('bk_nope', 'adm-1'), { status: 404, code: 'NOT_FOUND' });
    });

    it('answers 401 without a session and 403 without an admission', async () => {
      const { data: created } = await create();
      await rejection(booking.enterPayment(created.bookingId, 'adm-1'), { status: 401, code: 'UNAUTHORIZED' });
      await rejection(signedIn.enterPayment(created.bookingId, ''), { status: 403, code: 'ADMISSION_INVALID' });
      scenario = 'admission_invalid';
      await rejection(signedIn.enterPayment(created.bookingId, 'adm-1'), { status: 403, code: 'ADMISSION_INVALID' });
    });

    it('fails like the API under error and offline', async () => {
      const { data: created } = await create();
      scenario = 'error';
      await rejection(signedIn.enterPayment(created.bookingId, 'adm-1'), { status: 503, code: 'INTERNAL_ERROR' });
      scenario = 'offline';
      await expect(signedIn.enterPayment(created.bookingId, 'adm-1')).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
    });
  });

  describe('getActiveBooking and getBooking', () => {
    it('reads /core/bookings/active as the list, not as a booking id', async () => {
      const { data, status } = await signedIn.getActiveBooking();
      expect(status).toBe(200);
      expect(data).toEqual({ items: [] });
    });

    it('asks for a session and fails like the API', async () => {
      await rejection(booking.getActiveBooking(), { status: 401, code: 'UNAUTHORIZED' });
      scenario = 'error';
      await rejection(signedIn.getActiveBooking(), { status: 503, code: 'INTERNAL_ERROR' });
    });

    it('serves a created booking first and the paid fixtures still', async () => {
      const { data: created } = await create();
      later(1000);
      const { data } = await signedIn.getBooking(created.bookingId);
      expect(data).toEqual({ ...created, serverNow: clock.toISOString() });
      await expect(signedIn.getBooking('bk_mock_samudra')).resolves.toMatchObject({ data: { status: 'PAID' } });
    });
  });
});
