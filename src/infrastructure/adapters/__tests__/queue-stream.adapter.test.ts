import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createQueueStreamAdapter, parseSseBlock } from '../queue-stream.adapter';

const tokens = { deviceToken: 'dev', queueToken: 'q' };
const handlers = () => ({ onFrontier: vi.fn(), onTurn: vi.fn(), onFallback: vi.fn(), onClose: vi.fn() });

function streamOf(chunks: string[]): Response {
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      chunks.forEach((s) => c.enqueue(new TextEncoder().encode(s)));
      c.close();
    },
  });
  return new Response(body, { status: 200 });
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('parseSseBlock', () => {
  it('reads the event name and JSON data', () => {
    expect(parseSseBlock('event: frontier\ndata: {"served":1}')).toEqual({ event: 'frontier', data: { served: 1 } });
  });
  it('ignores comments and returns null without data', () => {
    expect(parseSseBlock(': hb')).toBeNull();
  });
  it('defaults to "message" and returns null for invalid JSON', () => {
    expect(parseSseBlock('data: [1]')).toEqual({ event: 'message', data: [1] });
    expect(parseSseBlock('data: {oops')).toBeNull();
  });
});

describe('createQueueStreamAdapter', () => {
  afterEach(() => vi.useRealTimers());

  it('sends the token headers and dispatches frontier and turn events', async () => {
    const fetchImpl = vi.fn(async () =>
      streamOf(['event: frontier\ndata: {"served":5}\n\n: hb\n\n', 'event: turn\r\ndata: {"seq":5}\r\n\r\n']),
    );
    const h = handlers();
    createQueueStreamAdapter({ baseUrl: 'https://q.test', fetchImpl }).open('evt 1', tokens, h);
    await flush();
    await flush();
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://q.test/queue/evt%201/stream');
    expect(init.headers).toMatchObject({ 'X-Device-Token': 'dev', 'X-Queue-Token': 'q' });
    expect(h.onFrontier).toHaveBeenCalledWith({ served: 5 });
    expect(h.onTurn).toHaveBeenCalledWith({ seq: 5 });
    expect(h.onClose).toHaveBeenCalled();
    expect(h.onFallback).not.toHaveBeenCalled();
  });

  it('falls back when the connection fails or is refused', async () => {
    const h1 = handlers();
    createQueueStreamAdapter({ baseUrl: 'x', fetchImpl: vi.fn(async () => Promise.reject(new Error('no'))) }).open(
      'e',
      tokens,
      h1,
    );
    const h2 = handlers();
    createQueueStreamAdapter({ baseUrl: 'x', fetchImpl: vi.fn(async () => new Response(null, { status: 409 })) }).open(
      'e',
      tokens,
      h2,
    );
    await flush();
    expect(h1.onFallback).toHaveBeenCalledWith('connect_failed');
    expect(h2.onFallback).toHaveBeenCalledWith('connect_failed');
  });

  describe('timeouts', () => {
    beforeEach(() => vi.useFakeTimers());

    it('falls back when the first event is too slow', async () => {
      const h = handlers();
      const fetchImpl = vi.fn(() => new Promise<Response>(() => undefined));
      createQueueStreamAdapter({ baseUrl: 'x', fetchImpl, firstEventTimeoutMs: 100 }).open('e', tokens, h);
      await vi.advanceTimersByTimeAsync(150);
      expect(h.onFallback).toHaveBeenCalledWith('slow_first_event');
    });

    it('closing stops the timers and never falls back', async () => {
      const h = handlers();
      const fetchImpl = vi.fn(() => new Promise<Response>(() => undefined));
      const close = createQueueStreamAdapter({ baseUrl: 'x', fetchImpl, firstEventTimeoutMs: 100 }).open(
        'e',
        tokens,
        h,
      );
      close();
      await vi.advanceTimersByTimeAsync(150);
      expect(h.onFallback).not.toHaveBeenCalled();
    });
  });
});
