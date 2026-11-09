// @vitest-environment node
// Node: Axios uses its http adapter here, so the request really leaves the app and MSW answers it.
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { BookingService } from '@core/services/booking.service';
import { createHttpAdapter } from '@infrastructure/adapters/http.adapter';

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
