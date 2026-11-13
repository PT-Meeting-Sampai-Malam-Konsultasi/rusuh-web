// @vitest-environment node
// Node: Axios uses its http adapter here, so the request really leaves the app and MSW answers it.
import { setupServer } from 'msw/node';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Admission } from '@core/entities/queue/queue.entity';
import { BookingService } from '@core/services/booking.service';
import { DeviceService } from '@core/services/device.service';
import { QueueService } from '@core/services/queue.service';
import { createHttpAdapter } from '@infrastructure/adapters/http.adapter';

import { createHandlers } from '../handlers/handlers';
import { ADMISSION_MS, MOCK_SHORT_ORDER_WINDOW_MS, ORDER_WINDOW_MS } from '../handlers/mock-queue-state';
import type { MockScenario } from '../scenario';

const CORE = 'https://core.mock.test/v1';
const QUEUE = 'https://queue.mock.test/v1';
const START = new Date('2026-11-09T03:00:00Z');
/** 1.248 places at 5 a second: the first number's turn. */
const TURN_AT = new Date('2026-11-09T03:04:09.600Z');
const at = (offsetMs: number) => new Date(TURN_AT.getTime() + offsetMs);

let now = START;
let scenario: MockScenario = 'ok';
let locale = 'id';

const mockHandlers = () =>
  createHandlers({ coreApiUrl: CORE, queueApiUrl: QUEUE, getScenario: () => scenario, now: () => now });
const server = setupServer(...mockHandlers());
const queueHttp = createHttpAdapter({ baseUrl: QUEUE, timeoutMs: 5000 });
const devices = DeviceService({ queueHttp });
const queue = QueueService({ queueHttp });
const booking = BookingService({
  coreHttp: createHttpAdapter({ baseUrl: CORE, timeoutMs: 5000, getLocale: () => locale }),
});

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
beforeEach(() => {
  scenario = 'ok';
  locale = 'id';
  now = START;
  server.resetHandlers(...mockHandlers()); // a fresh queue: the first number is 19.700
});
afterAll(() => server.close());

const claim = (device: string, queueToken: string) =>
  queueHttp.post<Admission>('queue/evt_pelita/claim', undefined, {
    headers: { 'X-Device-Token': device, 'X-Queue-Token': queueToken, Authorization: 'Bearer mock' },
  });

/** Registers a device, joins evt_pelita, waits for the turn and claims it. */
const admit = async () => {
  const device = (await devices.registerDevice('ts')).data.deviceToken;
  const { queueToken } = (await queue.joinQueue('evt_pelita', device, 'ts')).data;
  now = TURN_AT;
  const admission = (await claim(device, queueToken)).data;
  return { device, queueToken, admission };
};

const categories = async (eventId = 'evt_pelita') => (await booking.getCategories(eventId, 'mock-admission')).data;
const left = (data: { expiresAt: string; serverNow: string }) =>
  Date.parse(data.expiresAt) - Date.parse(data.serverNow);

describe('mock order window follows the claim (FR-19-W1)', () => {
  it('answers the claim time + 5 min, the same on a reload and in another language', async () => {
    await admit();
    const first = await categories();
    expect(first.expiresAt).toBe('2026-11-09T03:09:09.600Z');
    expect(first.serverNow).toBe(TURN_AT.toISOString());

    now = at(168_000);
    const reload = await categories();
    expect(reload.expiresAt).toBe(first.expiresAt);
    expect(reload.serverNow).toBe(now.toISOString());
    expect(left(reload)).toBe(132_000);

    locale = 'en';
    const english = await categories();
    expect(english.expiresAt).toBe(first.expiresAt);
  });

  it('answers the claim time + 75 s under short_window', async () => {
    scenario = 'short_window';
    await admit();
    expect((await categories()).expiresAt).toBe(new Date(TURN_AT.getTime() + MOCK_SHORT_ORDER_WINDOW_MS).toISOString());
    now = at(35_000);
    expect(left(await categories())).toBe(40_000);
  });

  it('answers a past end as is once the window is over', async () => {
    await admit();
    now = at(ORDER_WINDOW_MS + 10_000);
    const data = await categories();
    expect(data.expiresAt).toBe('2026-11-09T03:09:09.600Z');
    expect(left(data)).toBe(-10_000);
  });

  it('answers a fresh window without a claim, and after the admission life', async () => {
    expect(left(await categories('evt_samudra'))).toBe(ORDER_WINDOW_MS);
    scenario = 'short_window';
    expect(left(await categories('evt_samudra'))).toBe(MOCK_SHORT_ORDER_WINDOW_MS);
    scenario = 'ok';

    await admit();
    expect(left(await categories('evt_samudra'))).toBe(ORDER_WINDOW_MS); // another event's claim does not count
    now = at(ADMISSION_MS);
    const data = await categories();
    expect(data.serverNow).toBe(now.toISOString());
    expect(left(data)).toBe(ORDER_WINDOW_MS);
  });

  it('keeps the same admission on a repeat claim inside the window', async () => {
    const { device, queueToken, admission } = await admit();
    now = at(120_000);
    expect((await claim(device, queueToken)).data).toEqual({ ...admission, serverNow: now.toISOString() });
  });

  it('ends the admitted place after the window: claim answers 410 EXPIRED, a rejoin goes to the back', async () => {
    const { device, queueToken, admission } = await admit();
    now = at(ORDER_WINDOW_MS);
    await expect(claim(device, queueToken)).rejects.toMatchObject({ status: 410, code: 'EXPIRED' });
    await expect(queue.getMyPlace('evt_pelita', device, queueToken)).rejects.toMatchObject({ status: 404 });
    const again = (await queue.joinQueue('evt_pelita', device, 'ts')).data;
    expect(`mock-admission.evt_pelita.${again.seq}`).not.toBe(admission.admissionToken);
    expect(again.seq! - again.served!).toBe(1248);
  });

  it('answers 410 EXPIRED on the place read too, and forgets the place', async () => {
    const { device, queueToken } = await admit();
    now = at(ORDER_WINDOW_MS + 1000);
    await expect(queue.getMyPlace('evt_pelita', device, queueToken)).rejects.toMatchObject({
      status: 410,
      code: 'EXPIRED',
    });
    // Deleted with the answer: a second read finds no place.
    await expect(queue.getMyPlace('evt_pelita', device, queueToken)).rejects.toMatchObject({ status: 404 });
  });

  it('gives a new number on a rejoin straight after the window, without reading the place first', async () => {
    scenario = 'short_window';
    const { device } = await admit();
    now = at(MOCK_SHORT_ORDER_WINDOW_MS + 5000);
    const again = (await queue.joinQueue('evt_pelita', device, 'ts')).data;
    expect(again.seq).not.toBe(19700);
    expect(again.seq! - again.served!).toBe(1248);
  });

  it('shares one state per createHandlers call; a second call starts empty', async () => {
    await admit();
    now = at(60_000);
    expect(left(await categories())).toBe(ORDER_WINDOW_MS - 60_000);
    server.resetHandlers(...mockHandlers());
    expect(left(await categories())).toBe(ORDER_WINDOW_MS);
  });
});
