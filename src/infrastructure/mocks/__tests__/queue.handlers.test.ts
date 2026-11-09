// @vitest-environment node
// Node: Axios uses its http adapter here, so the request really leaves the app and MSW answers it.
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { DeviceService } from '@core/services/device.service';
import { QueueService } from '@core/services/queue.service';
import { createHttpAdapter } from '@infrastructure/adapters/http.adapter';

import { createHandlers } from '../handlers/handlers';
import type { MockScenario } from '../scenario';

const QUEUE = 'https://queue.mock.test/v1';
let now = new Date('2026-11-09T03:00:00Z');
let scenario: MockScenario = 'ok';

const mockHandlers = () =>
  createHandlers({
    coreApiUrl: 'https://core.mock.test/v1',
    queueApiUrl: QUEUE,
    getScenario: () => scenario,
    now: () => now,
  });
const server = setupServer(...mockHandlers());
const queueHttp = createHttpAdapter({ baseUrl: QUEUE, timeoutMs: 5000 });
const devices = DeviceService({ queueHttp });
const queue = QueueService({ queueHttp });

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => {
  scenario = 'ok';
  now = new Date('2026-11-09T03:00:00Z');
});
afterAll(() => server.close());

const register = async () => (await devices.registerDevice('ts')).data.deviceToken;

describe('queue mock', () => {
  it('registers a device with a JWT-shaped token valid for 30 days', async () => {
    const { data, status } = await devices.registerDevice('ts');
    expect(status).toBe(201);
    const [header, payload] = data.deviceToken
      .split('.')
      .slice(0, 2)
      .map((part) => JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))));
    expect(header).toMatchObject({ typ: 'device+jwt' });
    expect(payload.sub).toMatch(/^w_/);
    expect(data.expiresAt).toBe('2026-12-09T03:00:00.000Z');
  });

  it('gives an open sale a number with 1.248 people ahead, the same on every rejoin', async () => {
    const device = await register();
    const first = (await queue.joinQueue('evt_pelita', device, 'ts')).data;
    expect(first).toMatchObject({ eventId: 'evt_pelita', state: 'open', seq: 19700, served: 18452 });
    expect(first.queueToken).toContain('evt_pelita');
    now = new Date('2026-11-09T03:00:10Z');
    const again = (await queue.joinQueue('evt_pelita', device, 'ts')).data;
    expect(again.seq).toBe(19700);
    expect(again.served).toBe(18502);
    const other = (await queue.joinQueue('evt_pelita', await register(), 'ts')).data;
    expect(other.seq).toBe(19701);
  });

  it('holds a waiting-room event in pre-queue, then draws a number at opening', async () => {
    const device = await register();
    const pre = (await queue.joinQueue('evt_samudra', device, 'ts')).data;
    expect(pre).toMatchObject({ state: 'preopen', seq: null, opensAt: '2026-11-09T03:09:00.000Z' });
    now = new Date('2026-11-09T03:09:00Z');
    const open = (await queue.joinQueue('evt_samudra', device, 'ts')).data;
    expect(open.state).toBe('open');
    expect(open.seq).toEqual(expect.any(Number));
  });

  it('pauses a temporarily full event', async () => {
    const { data } = await queue.joinQueue('evt_rimba', await register(), 'ts');
    expect(data.state).toBe('paused');
  });

  it.each([
    ['evt_deru', 410, 'QUEUE_CLOSED'],
    ['evt_kelana', 410, 'QUEUE_CLOSED'],
    ['evt_langit_sore', 404, 'NOT_FOUND'],
    ['evt_nope', 404, 'NOT_FOUND'],
  ])('answers %s with %i %s', async (eventId, status, code) => {
    await expect(queue.joinQueue(eventId, await register(), 'ts')).rejects.toMatchObject({ status, code });
  });

  it('closes every queue in the sold_out scenario and knows no event in the empty one', async () => {
    const device = await register();
    scenario = 'sold_out';
    await expect(queue.joinQueue('evt_pelita', device, 'ts')).rejects.toMatchObject({ code: 'QUEUE_CLOSED' });
    scenario = 'empty';
    await expect(queue.joinQueue('evt_pelita', device, 'ts')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('rejects a join without a device token, and calls without a Turnstile token', async () => {
    await expect(queue.joinQueue('evt_pelita', '', 'ts')).rejects.toMatchObject({ status: 401, code: 'UNAUTHORIZED' });
    await expect(queue.joinQueue('evt_pelita', 'd', '')).rejects.toMatchObject({ status: 400 });
    await expect(devices.registerDevice('')).rejects.toMatchObject({ status: 400 });
  });

  it('shares the failure scenarios', async () => {
    scenario = 'error';
    await expect(devices.registerDevice('ts')).rejects.toMatchObject({ status: 503 });
    await expect(queue.joinQueue('evt_pelita', 'd', 'ts')).rejects.toMatchObject({ status: 503 });
  });

  it('keeps the queue for the tab, so a reload shows the same number and how far the line moved', async () => {
    const saved = new Map<string, string>();
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => saved.get(key) ?? null,
      setItem: (key: string, value: string) => saved.set(key, value),
    });
    server.resetHandlers(...mockHandlers());
    const device = await register();
    const first = (await queue.joinQueue('evt_pelita', device, 'ts')).data;

    now = new Date(now.getTime() + 120_000);
    server.resetHandlers(...mockHandlers()); // a page reload: a fresh mock, same tab
    const reloaded = (await queue.joinQueue('evt_pelita', device, 'ts')).data;
    expect(reloaded.seq).toBe(first.seq);
    expect(reloaded.served).toBe((first.served ?? 0) + 600);

    vi.unstubAllGlobals();
    server.resetHandlers(...mockHandlers());
  });
});
