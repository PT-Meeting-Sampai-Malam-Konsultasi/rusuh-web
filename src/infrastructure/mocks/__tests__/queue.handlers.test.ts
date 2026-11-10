// @vitest-environment node
// Node: Axios uses its http adapter here, so the request really leaves the app and MSW answers it.
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Admission } from '@core/entities/queue/queue.entity';
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
    // A later number also joins 1.248 places back, behind the crowd that came in since.
    const other = (await queue.joinQueue('evt_pelita', await register(), 'ts')).data;
    expect(other).toMatchObject({ seq: 19750, served: 18502 });
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

  it('keeps the queue across a reload or a new tab, so the number stays and the line has moved', async () => {
    const saved = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => saved.get(key) ?? null,
      setItem: (key: string, value: string) => saved.set(key, value),
    });
    server.resetHandlers(...mockHandlers());
    const device = await register();
    const first = (await queue.joinQueue('evt_pelita', device, 'ts')).data;

    now = new Date(now.getTime() + 120_000);
    server.resetHandlers(...mockHandlers()); // a reload or a new tab: a fresh mock, same storage
    const reloaded = (await queue.joinQueue('evt_pelita', device, 'ts')).data;
    expect(reloaded.seq).toBe(first.seq);
    expect(reloaded.served).toBe((first.served ?? 0) + 600);

    vi.unstubAllGlobals();
    server.resetHandlers(...mockHandlers());
  });

  it('serves one frontier per event that matches the join, and moves 300 a minute', async () => {
    const device = await register();
    const joined = (await queue.joinQueue('evt_pelita', device, 'ts')).data;
    const { data } = await queue.getFrontier('evt_pelita');
    expect(data).toMatchObject({
      event: 'evt_pelita',
      state: 'open',
      served: joined.served,
      ratePerMin: 300,
      rateLow: 240,
      rateHigh: 360,
      streamFrom: 2000,
      ts: Math.floor(now.getTime() / 1000),
    });
    now = new Date(now.getTime() + 60_000);
    expect((await queue.getFrontier('evt_pelita')).data.served).toBe((joined.served ?? 0) + 300);
  });

  it('stops at the newest number handed out, so the last device gets its turn', async () => {
    const device = await register();
    const { seq } = (await queue.joinQueue('evt_pelita', device, 'ts')).data;
    now = new Date(now.getTime() + 3_600_000);
    expect((await queue.getFrontier('evt_pelita')).data.served).toBe(seq);
  });

  it('pauses a temporarily full queue for stock, closes a sold-out one, and turns streaming off on request', async () => {
    expect((await queue.getFrontier('evt_rimba')).data).toMatchObject({
      state: 'paused',
      reason: 'stock',
      ratePerMin: 0,
    });
    expect((await queue.getFrontier('evt_deru')).data).toMatchObject({ state: 'closed', reason: 'sold_out' });
    scenario = 'stream_off';
    expect((await queue.getFrontier('evt_pelita')).data.streamFrom).toBe(0);
    await expect(queue.getFrontier('evt_nope')).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });

  describe('stream', () => {
    const open = (eventId: string, headers: Record<string, string>) =>
      fetch(`${QUEUE}/queue/${eventId}/stream`, { headers: { Accept: 'text/event-stream', ...headers } });

    const readUntil = async (res: Response, text: string) => {
      const reader = (res.body as ReadableStream<Uint8Array>).getReader();
      const decoder = new TextDecoder();
      let seen = '';
      while (!seen.includes(text)) {
        const { value, done } = await reader.read();
        if (done) break;
        seen += decoder.decode(value, { stream: true });
      }
      await reader.cancel();
      return seen;
    };

    it('sends retry and a frontier at once, and the turn at the front', async () => {
      const device = await register();
      const { seq, queueToken } = (await queue.joinQueue('evt_pelita', device, 'ts')).data;
      const res = await open('evt_pelita', { 'X-Device-Token': device, 'X-Queue-Token': queueToken });
      expect(res.headers.get('content-type')).toBe('text/event-stream');
      const first = await readUntil(res, 'event: frontier');
      expect(first).toContain('retry: 3000');
      expect(first).toMatch(/event: frontier\nid: \d+\ndata: \{"event":"evt_pelita"/);

      now = new Date(now.getTime() + 3_600_000);
      const atFront = await open('evt_pelita', { 'X-Device-Token': device, 'X-Queue-Token': queueToken });
      expect(await readUntil(atFront, 'event: turn')).toContain(`"seq":${seq}`);
    });

    it('refuses a device without tokens, too far back, or with streaming off', async () => {
      expect((await open('evt_pelita', {})).status).toBe(401);
      const far = await register();
      const { queueToken } = (await queue.joinQueue('evt_pelita', far, 'ts')).data;
      // 800 more places put the next one past streamFrom (1.248 + 800 > 2.000). The mock only checks that a device
      // header is there, so the joins skip registering and go out in parallel (one by one is too slow on CI).
      await Promise.all(Array.from({ length: 800 }, (_, i) => queue.joinQueue('evt_pelita', `device-${i}`, 'ts')));
      const last = await register();
      const lastPlace = (await queue.joinQueue('evt_pelita', last, 'ts')).data;
      const tooFar = await open('evt_pelita', { 'X-Device-Token': last, 'X-Queue-Token': lastPlace.queueToken });
      expect(tooFar.status).toBe(409);
      expect(await tooFar.json()).toMatchObject({ code: 'TOO_FAR' });
      scenario = 'stream_off';
      expect((await open('evt_pelita', { 'X-Device-Token': far, 'X-Queue-Token': queueToken })).status).toBe(409);
    }, 15_000);
  });

  describe('turn', () => {
    const SESSION = { Authorization: 'Bearer mock' };
    const TURN_AT = new Date('2026-11-09T03:04:09.600Z'); // 1.248 places at 5 a second

    beforeEach(() => server.resetHandlers(...mockHandlers())); // a fresh queue: the first number is 19.700

    const claim = (device: string, queueToken: string, session = true) =>
      queueHttp.post<Admission>(`queue/evt_pelita/claim`, undefined, {
        headers: { 'X-Device-Token': device, 'X-Queue-Token': queueToken, ...(session ? SESSION : {}) },
      });

    it('admits at the turn with a session, the same admission on a repeat', async () => {
      const device = await register();
      const { queueToken } = (await queue.joinQueue('evt_pelita', device, 'ts')).data;
      await expect(claim(device, queueToken)).rejects.toMatchObject({ status: 409, code: 'NOT_YET' });
      now = TURN_AT;
      await expect(claim(device, queueToken, false)).rejects.toMatchObject({ status: 401, code: 'UNAUTHORIZED' });
      const { data } = await claim(device, queueToken);
      expect(data).toMatchObject({
        admissionToken: 'mock-admission.evt_pelita.19700',
        maxTickets: 3,
        expiresAt: '2026-11-09T03:20:09.600Z',
      });
      now = new Date(TURN_AT.getTime() + 120_000);
      expect((await claim(device, queueToken)).data).toEqual({ ...data, serverNow: now.toISOString() });
    });

    it('gives the place its 60 s window, then misses it and joins again at the back', async () => {
      const device = await register();
      const { queueToken } = (await queue.joinQueue('evt_pelita', device, 'ts')).data;
      expect((await queue.getMyPlace('evt_pelita', device, queueToken)).data.turnExpiresAt).toBeNull();
      now = TURN_AT;
      expect((await queue.getMyPlace('evt_pelita', device, queueToken)).data).toMatchObject({
        seq: 19700,
        turnExpiresAt: '2026-11-09T03:05:09.600Z',
      });
      now = new Date(TURN_AT.getTime() + 61_000);
      await expect(claim(device, queueToken)).rejects.toMatchObject({ status: 410, code: 'MISSED' });
      await expect(queue.getMyPlace('evt_pelita', device, queueToken)).rejects.toMatchObject({ status: 404 });
      const again = (await queue.joinQueue('evt_pelita', device, 'ts')).data;
      expect(again.seq! - again.served!).toBe(1248);
    });

    it('misses on the place read too, and needs the tokens', async () => {
      const device = await register();
      const { queueToken } = (await queue.joinQueue('evt_pelita', device, 'ts')).data;
      now = new Date(TURN_AT.getTime() + 61_000);
      await expect(queue.getMyPlace('evt_pelita', device, queueToken)).rejects.toMatchObject({ code: 'MISSED' });
      await expect(queue.getMyPlace('evt_pelita', '', '')).rejects.toMatchObject({ status: 401 });
      await expect(claim('nobody', 'q')).rejects.toMatchObject({ status: 404 });
    });
  });

  it('joins 20 places back in the near_front scenario, so the turn comes in seconds', async () => {
    server.resetHandlers(...mockHandlers());
    scenario = 'near_front';
    const { data } = await queue.joinQueue('evt_pelita', await register(), 'ts');
    expect(data.seq! - data.served!).toBe(20);
  });

  it('joins 12.000 places back in the far_back scenario, too far to stream', async () => {
    server.resetHandlers(...mockHandlers());
    scenario = 'far_back';
    const { data } = await queue.joinQueue('evt_pelita', await register(), 'ts');
    expect(data.seq! - data.served!).toBe(12_000);
  });

  it('starts the queue over when the placement scenario changes, keeping the place otherwise', async () => {
    server.resetHandlers(...mockHandlers());
    const device = await register();
    scenario = 'far_back';
    const far = (await queue.joinQueue('evt_pelita', device, 'ts')).data;
    expect(far.seq! - far.served!).toBe(12_000);
    scenario = 'stream_off'; // not a placement: same number
    expect((await queue.joinQueue('evt_pelita', device, 'ts')).data.seq).toBe(far.seq);
    scenario = 'near_front';
    // A resumed page reads the place first: the old queue is gone, so it joins the new one.
    await expect(queue.getMyPlace('evt_pelita', device, far.queueToken)).rejects.toMatchObject({ status: 404 });
    const near = (await queue.joinQueue('evt_pelita', device, 'ts')).data;
    expect(near.seq! - near.served!).toBe(20);
    expect((await queue.joinQueue('evt_pelita', device, 'ts')).data.seq).toBe(near.seq);
  });

  it('reads the place back with the tokens, drawing the number at opening as a join would', async () => {
    server.resetHandlers(...mockHandlers());
    const device = await register();
    const pre = (await queue.joinQueue('evt_samudra', device, 'ts')).data;
    const before = (await queue.getMyPlace('evt_samudra', device, pre.queueToken)).data;
    expect(before).toMatchObject({ state: 'preopen', seq: null, opensAt: '2026-11-09T03:09:00.000Z' });
    now = new Date('2026-11-09T03:09:05Z');
    const drawn = (await queue.getMyPlace('evt_samudra', device, pre.queueToken)).data;
    expect(drawn).toMatchObject({ state: 'open', seq: 19700, served: 18452 + 25 });
    expect((await queue.joinQueue('evt_samudra', device, 'ts')).data.seq).toBe(19700);
  });

  it('puts nobody ahead in the no_queue scenario, and admits at once', async () => {
    server.resetHandlers(...mockHandlers());
    scenario = 'no_queue';
    const device = await register();
    const { data } = await queue.joinQueue('evt_pelita', device, 'ts');
    expect(data.served).toBeGreaterThanOrEqual(data.seq!);
    const { data: admission } = await queueHttp.post<Admission>('queue/evt_pelita/claim', undefined, {
      headers: { 'X-Device-Token': device, 'X-Queue-Token': data.queueToken, Authorization: 'Bearer mock' },
    });
    expect(admission.admissionToken).toBe(`mock-admission.evt_pelita.${data.seq}`);
  });
});
