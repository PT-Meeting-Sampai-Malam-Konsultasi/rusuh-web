// @vitest-environment node
// Node: Axios uses its http adapter here, so the request really leaves the app and MSW answers it.
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { ValidateAttendeeRequest } from '@core/entities/booking/booking.entity';
import { BookingService } from '@core/services/booking.service';
import { createHttpAdapter } from '@infrastructure/adapters/http.adapter';

import { MOCK_RETRY_AFTER_S } from '../handlers/booking.handlers';
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
    const raw = await fetch(`${CORE}/events/evt_samudra/attendees/validate`, {
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
    const raw = await fetch(`${CORE}/events/evt_samudra/attendees/validate`, {
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
