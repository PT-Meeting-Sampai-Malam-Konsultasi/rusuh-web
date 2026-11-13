import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HttpRequestError } from '../http.adapter';
import { createMockSnap, createSnapAdapter, type SnapApi } from '../snap.adapter';

type Win = Window & { snap?: SnapApi };
type PayOptions = Parameters<SnapApi['pay']>[1];

const URL = 'https://app.sandbox.midtrans.com/snap/snap.js';
const KEY = 'SB-Mid-client-test';
const scripts = () => document.head.querySelectorAll<HTMLScriptElement>(`script[src="${URL}"]`);

describe('createSnapAdapter', () => {
  let locale: string;
  let calls: { token: string; options: PayOptions }[];
  let api: SnapApi;
  const adapter = (timeoutMs?: number) =>
    createSnapAdapter({ scriptUrl: URL, clientKey: KEY, getLocale: () => locale, timeoutMs });
  /** snap.js "runs": window.snap appears, then the script's load event fires. */
  const finishLoad = (script: HTMLScriptElement, withApi = true) => {
    if (withApi) (window as Win).snap = api;
    script.dispatchEvent(new Event('load'));
  };

  beforeEach(() => {
    locale = 'id';
    calls = [];
    api = {
      pay: vi.fn((token: string, options: PayOptions) => {
        calls.push({ token, options });
      }),
    };
  });

  afterEach(() => {
    delete (window as Win).snap;
    document.head.querySelectorAll('script').forEach((s) => s.remove());
    vi.useRealTimers();
  });

  it('appends nothing before the first call', () => {
    adapter();
    expect(document.head.querySelectorAll('script')).toHaveLength(0);
  });

  it('injects one async script with the client key for concurrent calls', async () => {
    const snap = adapter();
    const a = snap.pay('tok-1');
    const b = snap.pay('tok-2');
    const loaded = snap.load();
    expect(scripts()).toHaveLength(1);
    const [script] = scripts();
    expect(script.async).toBe(true);
    expect(script.getAttribute('data-client-key')).toBe(KEY);
    expect(document.head.querySelectorAll(`script[src="${URL}"][data-client-key="${KEY}"]`)).toHaveLength(1);
    finishLoad(script);
    await loaded;
    await vi.waitFor(() => expect(calls).toHaveLength(2));
    calls[0].options.onSuccess?.({});
    calls[1].options.onClose?.();
    await expect(a).resolves.toEqual({ kind: 'success' });
    await expect(b).resolves.toEqual({ kind: 'closed' });
    expect(scripts()).toHaveLength(1);
  });

  it('uses window.snap when it is already there, without a script', async () => {
    (window as Win).snap = api;
    const snap = adapter();
    await snap.load();
    const result = snap.pay('tok-1');
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    calls[0].options.onPending?.({ transaction_status: 'pending' });
    await expect(result).resolves.toEqual({ kind: 'pending' });
    expect(document.head.querySelectorAll('script')).toHaveLength(0);
  });

  it.each([
    ['onSuccess', 'success'],
    ['onPending', 'pending'],
    ['onError', 'error'],
    ['onClose', 'closed'],
  ] as const)('%s resolves %s, the first callback wins, with the current language', async (callback, kind) => {
    (window as Win).snap = api;
    const snap = adapter();
    locale = 'en';
    const result = snap.pay('tok-1');
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].token).toBe('tok-1');
    expect(calls[0].options.language).toBe('en');
    calls[0].options[callback]?.({ order_id: 'bk_1-1' });
    calls[0].options.onClose?.();
    calls[0].options.onSuccess?.({});
    await expect(result).resolves.toEqual({ kind });
  });

  it('reads the language per call', async () => {
    (window as Win).snap = api;
    const snap = adapter();
    void snap.pay('a');
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    locale = 'en';
    void snap.pay('b');
    await vi.waitFor(() => expect(calls).toHaveLength(2));
    expect(calls.map((c) => c.options.language)).toEqual(['id', 'en']);
  });

  const expectUnavailable = async (promise: Promise<unknown>) => {
    const error: unknown = await promise.then(
      () => expect.fail('expected a rejection'),
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(HttpRequestError);
    expect(error).toMatchObject({ status: 0, code: 'SNAP_UNAVAILABLE' });
  };

  it('rejects SNAP_UNAVAILABLE when the script fails, removes it and retries on the next call', async () => {
    const snap = adapter();
    const first = snap.pay('tok-1');
    const [script] = scripts();
    script.dispatchEvent(new Event('error'));
    await expectUnavailable(first);
    expect(scripts()).toHaveLength(0);
    const second = snap.load();
    expect(scripts()).toHaveLength(1);
    expect(scripts()[0]).not.toBe(script);
    finishLoad(scripts()[0]);
    await expect(second).resolves.toBeUndefined();
  });

  it('rejects SNAP_UNAVAILABLE when the script loads without window.snap, and can retry', async () => {
    const snap = adapter();
    const first = snap.load();
    finishLoad(scripts()[0], false);
    await expectUnavailable(first);
    expect(scripts()).toHaveLength(0);
    const second = snap.load();
    expect(scripts()).toHaveLength(1);
    finishLoad(scripts()[0]);
    await second;
  });

  it('rejects SNAP_UNAVAILABLE after the timeout, and can retry', async () => {
    vi.useFakeTimers();
    const snap = adapter(1000);
    const first = snap.load();
    const outcome = expectUnavailable(first);
    vi.advanceTimersByTime(999);
    expect(scripts()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    await outcome;
    expect(scripts()).toHaveLength(0);
    void snap.load();
    expect(scripts()).toHaveLength(1);
  });

  it('defaults the timeout to 15 seconds and clears it once loaded', async () => {
    vi.useFakeTimers();
    const snap = adapter();
    const loaded = snap.load();
    vi.advanceTimersByTime(14_999);
    finishLoad(scripts()[0]);
    await loaded;
    vi.advanceTimersByTime(60_000);
    expect(scripts()).toHaveLength(1);
  });

  it('rejects SNAP_UNAVAILABLE when snap.pay throws', async () => {
    (window as Win).snap = {
      pay: () => {
        throw new Error('popup blocked');
      },
    };
    await expectUnavailable(adapter().pay('tok-1'));
  });
});

describe('createMockSnap', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('never touches the document and resolves the outcome after the delay', async () => {
    vi.useFakeTimers();
    const create = vi.spyOn(document, 'createElement');
    const outcome = vi.fn<() => 'success' | 'pending' | 'error' | 'closed'>(() => 'pending');
    const snap = createMockSnap({ outcome, delayMs: 500 });
    await snap.load();
    let settled: unknown;
    void snap.pay('tok-1').then((r) => (settled = r));
    await vi.advanceTimersByTimeAsync(499);
    expect(settled).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toEqual({ kind: 'pending' });
    expect(create).not.toHaveBeenCalled();
    expect(document.head.querySelectorAll('script')).toHaveLength(0);
  });

  it('waits 800 ms by default and reads the outcome per call', async () => {
    vi.useFakeTimers();
    let kind: 'success' | 'closed' = 'closed';
    const snap = createMockSnap({ outcome: () => kind });
    const a = snap.pay('t');
    await vi.advanceTimersByTimeAsync(800);
    await expect(a).resolves.toEqual({ kind: 'closed' });
    kind = 'success';
    const b = snap.pay('t');
    await vi.advanceTimersByTimeAsync(800);
    await expect(b).resolves.toEqual({ kind: 'success' });
  });
});
