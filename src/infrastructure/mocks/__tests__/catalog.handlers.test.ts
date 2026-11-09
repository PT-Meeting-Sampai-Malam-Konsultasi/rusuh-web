// @vitest-environment node
// Node: Axios uses its http adapter here, so the request really leaves the app and MSW answers it.
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { CatalogService } from '@core/services/catalog.service';
import { createHttpAdapter } from '@infrastructure/adapters/http.adapter';

import { createHandlers } from '../handlers/handlers';
import type { MockScenario } from '../scenario';

const CORE = 'https://core.mock.test/v1';
const NOW = new Date('2026-11-03T03:00:00Z');
let scenario: MockScenario = 'ok';

const server = setupServer(
  ...createHandlers({
    coreApiUrl: CORE,
    queueApiUrl: 'https://queue.mock.test/v1',
    getScenario: () => scenario,
    now: () => NOW,
  }),
);
const catalog = CatalogService({ coreHttp: createHttpAdapter({ baseUrl: CORE, timeoutMs: 5000 }) });

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => {
  scenario = 'ok';
});
afterAll(() => server.close());

describe('catalog mock', () => {
  it('serves the six sample events through the real HTTP adapter and service', async () => {
    const { data, status } = await catalog.listEvents();
    expect(status).toBe(200);
    expect(data.serverNow).toBe(NOW.toISOString());
    expect(data.items.map((e) => e.state)).toEqual([
      'waiting_room_open',
      'almost_gone',
      'coming_soon',
      'temporarily_full',
      'sold_out',
      'ended',
    ]);
  });

  it('keeps the sample dates in step with now', async () => {
    const { data } = await catalog.listEvents();
    const deru = data.items.find((e) => e.eventId === 'evt_deru')!;
    expect(Date.parse(deru.soldOutAt!) - Date.parse(deru.saleOpensAt!)).toBe(41 * 60_000);
    const soon = data.items.find((e) => e.state === 'coming_soon')!;
    expect(Date.parse(soon.waitingRoomOpensAt!)).toBeGreaterThan(NOW.getTime());
  });

  it('serves an empty list', async () => {
    scenario = 'empty';
    expect((await catalog.listEvents()).data.items).toEqual([]);
  });

  it('sells everything out but keeps ended events ended', async () => {
    scenario = 'sold_out';
    const states = (await catalog.listEvents()).data.items.map((e) => e.state);
    expect(states).toEqual(['sold_out', 'sold_out', 'sold_out', 'sold_out', 'sold_out', 'ended']);
  });

  it('fails with the API problem code', async () => {
    scenario = 'error';
    await expect(catalog.listEvents()).rejects.toMatchObject({ status: 503, code: 'INTERNAL_ERROR' });
  });

  it('fails like a dropped connection', async () => {
    scenario = 'offline';
    await expect(catalog.listEvents()).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  });

  it('serves one event by id', async () => {
    const { data, status } = await catalog.getEvent('evt_samudra');
    expect(status).toBe(200);
    expect(data).toMatchObject({ eventId: 'evt_samudra', name: 'Samudra', state: 'waiting_room_open' });
  });

  it('answers 404 NOT_FOUND for an unknown event', async () => {
    await expect(catalog.getEvent('evt_nope')).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });

  it('answers 404 NOT_FOUND for every event when none exists', async () => {
    scenario = 'empty';
    await expect(catalog.getEvent('evt_samudra')).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });

  it('fails getEvent with the shared failure scenarios', async () => {
    scenario = 'error';
    await expect(catalog.getEvent('evt_samudra')).rejects.toMatchObject({ status: 503, code: 'INTERNAL_ERROR' });
    scenario = 'offline';
    await expect(catalog.getEvent('evt_samudra')).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  });
});
