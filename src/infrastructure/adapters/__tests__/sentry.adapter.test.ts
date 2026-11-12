import type { ErrorEvent } from '@sentry/browser';
import { describe, expect, it, vi } from 'vitest';

import {
  createEventBudget,
  createSentrySink,
  scrubBreadcrumb,
  scrubEvent,
  scrubText,
  scrubUrl,
  scrubValue,
} from '../sentry.adapter';

const JWT = 'eyJhbGciOiJFZERTQSJ9.eyJzdWIiOiJ3XzEifQ.c2ln';

function fakeSdk() {
  const replay = { stop: vi.fn(async () => undefined), startBuffering: vi.fn(), getReplayId: vi.fn(() => undefined) };
  const scope = { setTag: vi.fn() };
  const sdk = {
    init: vi.fn(),
    addBreadcrumb: vi.fn(),
    captureException: vi.fn(),
    setTag: vi.fn(),
    withScope: vi.fn((fn: (s: typeof scope) => void) => fn(scope)),
    getReplay: vi.fn(() => replay),
    addIntegration: vi.fn(),
    browserTracingIntegration: vi.fn(() => ({ name: 'BrowserTracing' })),
  };
  const replayModule = { replayIntegration: vi.fn((options: unknown) => ({ name: 'Replay', options })) };
  return { sdk, replay, scope, replayModule };
}

const options = {
  dsn: 'https://k@o1.ingest.sentry.io/2',
  environment: 'staging',
  release: 'abc123',
  tracesSampleRate: 0.05,
  replayOnErrorRate: 0.1,
};

/** Starts the sink by hand, so the test controls when the SDK "loads". */
function sink(random = 0.5) {
  const { sdk, replay, scope, replayModule } = fakeSdk();
  let start: () => void = () => undefined;
  const loadReplay = vi.fn(async () => replayModule as never);
  const created = createSentrySink({
    ...options,
    load: async () => sdk as never,
    loadReplay,
    schedule: (fn) => {
      start = fn;
    },
    random: () => random,
  });
  const load = async () => {
    start();
    await vi.waitFor(() => expect(sdk.init).toHaveBeenCalled());
  };
  return { created, sdk, replay, scope, replayModule, loadReplay, load };
}

describe('Sentry scrubbing', () => {
  it('masks e-mails, NIKs and tokens in text', () => {
    expect(scrubText(`nadia@gmail.com 3174012345670004 3174 0123 4567 0004 Bearer ${JWT}`)).toBe(
      '[email] [nik] [nik] Bearer [token]',
    );
    expect(scrubText('setup sntryc_abc/def=')).toBe('setup [token]');
  });

  it('keeps URL parameter names and drops sensitive values', () => {
    expect(scrubUrl('https://x.id/login?next=%2Fqueue&email=a%40b.c&code=123456')).toBe(
      'https://x.id/login?next=%2Fqueue&email=%5Bfiltered%5D&code=%5Bfiltered%5D',
    );
    expect(scrubUrl('https://x.id/tickets/detail')).toBe('https://x.id/tickets/detail');
  });

  it('filters sensitive keys and scrubs nested values, keeping API error codes', () => {
    expect(
      scrubValue({
        queueToken: 'q',
        nested: { email: 'a@b.c', url: 'https://x.id/?otp=1', note: 'nadia@gmail.com', list: ['3174012345670004'] },
        code: 'NOT_FOUND',
        status: 404,
        empty: null,
      }),
    ).toEqual({
      queueToken: '[filtered]',
      nested: { email: '[filtered]', url: 'https://x.id/?otp=%5Bfiltered%5D', note: '[email]', list: ['[nik]'] },
      code: 'NOT_FOUND',
      status: 404,
      empty: null,
    });
  });

  it('strips request headers, cookies, bodies and the user; scrubs messages, exceptions and breadcrumbs', () => {
    const event = scrubEvent({
      type: undefined,
      message: 'for nadia@gmail.com',
      exception: { values: [{ type: 'Error', value: `token ${JWT}` }, { type: 'Error' }] },
      request: {
        url: 'https://x.id/login?email=a%40b.c',
        headers: { Authorization: 'x' },
        cookies: { a: 'b' },
        data: 'nik',
      },
      breadcrumbs: [{ message: 'nadia@gmail.com', data: { url: 'https://x.id/?code=1' } }, { category: 'ui' }],
      extra: { deviceToken: 'd' },
      contexts: { app: { email: 'a@b.c' } },
      user: { email: 'a@b.c', ip_address: '1.2.3.4' },
    } as unknown as ErrorEvent);
    expect(event.message).toBe('for [email]');
    expect(event.exception?.values?.[0].value).toBe('token [token]');
    expect(event.request).toEqual({ url: 'https://x.id/login?email=%5Bfiltered%5D' });
    expect(event.breadcrumbs?.[0]).toEqual({ message: '[email]', data: { url: 'https://x.id/?code=%5Bfiltered%5D' } });
    expect(event.breadcrumbs?.[1]).toEqual({ category: 'ui' });
    expect(event.extra).toEqual({ deviceToken: '[filtered]' });
    expect(event.contexts).toEqual({ app: { email: '[filtered]' } });
    expect(event.user).toBeUndefined();
    expect(scrubEvent({ type: undefined } as unknown as ErrorEvent)).toEqual({ type: undefined });
    expect(scrubEvent({ type: undefined, request: { method: 'GET' } } as unknown as ErrorEvent).request).toEqual({
      method: 'GET',
    });
    expect(scrubBreadcrumb({ category: 'x' })).toEqual({ category: 'x' });
  });

  it('caps repeats of one error and the events per session', () => {
    const allow = createEventBudget(2, 3);
    const error = (value: string) => ({ type: undefined, exception: { values: [{ type: 'Error', value }] } }) as never;
    expect([allow(error('a')), allow(error('a')), allow(error('a'))]).toEqual([true, true, false]);
    expect(allow({ type: undefined, message: 'm' } as never)).toBe(true);
    expect(allow(error('b'))).toBe(false);
    expect(createEventBudget()({ type: undefined } as never)).toBe(true);
  });
});

describe('createSentrySink', () => {
  it('keeps calls made before the SDK loads, then initialises it with the release and the low sample rates', async () => {
    const { created, sdk, scope, load } = sink();
    created.page?.('home');
    created.event?.('queue_join', { eventId: 'evt_pelita' });
    created.error?.(Object.assign(new Error('boom'), { requestId: 'req-1' }), { boundary: 'queue' });
    expect(sdk.addBreadcrumb).not.toHaveBeenCalled();

    await load();
    const init = sdk.init.mock.calls[0][0];
    expect(init).toMatchObject({
      dsn: options.dsn,
      environment: 'staging',
      release: 'abc123',
      tracesSampleRate: 0.05,
      tracePropagationTargets: [],
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0,
      dataCollection: { userInfo: false, cookies: false, httpHeaders: false, httpBodies: [] },
    });
    expect(init.integrations).toEqual([{ name: 'BrowserTracing' }]);
    expect(sdk.setTag).toHaveBeenCalledWith('page', 'home');
    expect(sdk.addBreadcrumb).toHaveBeenCalledWith({
      category: 'app',
      message: 'queue_join',
      data: { eventId: 'evt_pelita' },
      level: 'info',
    });
    expect(scope.setTag).toHaveBeenCalledWith('request_id', 'req-1');
    expect(scope.setTag).toHaveBeenCalledWith('boundary', 'queue');
    expect(sdk.captureException).toHaveBeenCalledTimes(1);

    // After loading, calls go straight through; an error without a request ID or context still reports.
    created.error?.('plain');
    expect(sdk.captureException).toHaveBeenLastCalledWith('plain');
  });

  it('scrubs and budgets events, and scrubs breadcrumbs, through the SDK hooks', async () => {
    const { sdk, load } = sink();
    await load();
    const { beforeSend, beforeBreadcrumb } = sdk.init.mock.calls[0][0];
    const event = { type: undefined, message: 'nadia@gmail.com' };
    expect(beforeSend(event)).toMatchObject({ message: '[email]' });
    expect(beforeBreadcrumb({ message: 'nadia@gmail.com' })).toEqual({ message: '[email]' });
    for (let i = 0; i < 5; i += 1) beforeSend({ type: undefined, message: 'same' });
    expect(beforeSend({ type: undefined, message: 'same' })).toBeNull();
  });

  it('adds a masked replay for a share of sessions, loading it only away from the waiting room', async () => {
    const { created, sdk, replay, replayModule, loadReplay, load } = sink(0.05);
    created.page?.('queue');
    await load();
    expect(sdk.init.mock.calls[0][0].replaysOnErrorSampleRate).toBe(1);
    // First page is the waiting room: nothing downloaded yet.
    expect(loadReplay).not.toHaveBeenCalled();

    created.page?.('order');
    await vi.waitFor(() =>
      expect(sdk.addIntegration).toHaveBeenCalledWith({
        name: 'Replay',
        options: { maskAllText: true, maskAllInputs: true, blockAllMedia: true },
      }),
    );
    expect(replayModule.replayIntegration).toHaveBeenCalledTimes(1);

    created.page?.('queue');
    expect(replay.stop).toHaveBeenCalledTimes(1);
    created.page?.('payment');
    expect(replay.startBuffering).toHaveBeenCalledTimes(1);
    replay.getReplayId.mockReturnValue('rep-1' as never);
    created.page?.('tickets');
    expect(replay.startBuffering).toHaveBeenCalledTimes(1);
    sdk.getReplay.mockReturnValue(undefined as never);
    expect(() => created.page?.('queue')).not.toThrow();
    expect(loadReplay).toHaveBeenCalledTimes(1);
  });

  it('downloads no replay for a session not drawn for one', async () => {
    const { created, sdk, loadReplay, load } = sink(0.9);
    await load();
    created.page?.('order');
    expect(sdk.init.mock.calls[0][0].replaysOnErrorSampleRate).toBe(0);
    expect(loadReplay).not.toHaveBeenCalled();
  });

  it('loads the real SDK lazily after the page is interactive by default', async () => {
    const idle = vi.fn((fn: () => void) => {
      fn();
      return 1;
    });
    Object.assign(window, { requestIdleCallback: idle });
    const load = vi.fn(async () => fakeSdk().sdk as never);
    createSentrySink({ ...options, load });
    await vi.waitFor(() => expect(load).toHaveBeenCalled());
    expect(idle).toHaveBeenCalled();

    // Before `load`: waits for the event; without requestIdleCallback: a timeout.
    Reflect.deleteProperty(window, 'requestIdleCallback');
    const state = vi.spyOn(document, 'readyState', 'get').mockReturnValue('loading');
    const later = vi.fn(async () => fakeSdk().sdk as never);
    createSentrySink({ ...options, load: later });
    expect(later).not.toHaveBeenCalled();
    state.mockRestore();
    window.dispatchEvent(new Event('load'));
    await vi.waitFor(() => expect(later).toHaveBeenCalled());
  });

  it('uses the default crypto draw and the real dynamic import without failing', async () => {
    const { sdk } = fakeSdk();
    let start: () => void = () => undefined;
    createSentrySink({ ...options, load: async () => sdk as never, schedule: (fn) => (start = fn) });
    start();
    await vi.waitFor(() => expect(sdk.init).toHaveBeenCalled());
  });
});
