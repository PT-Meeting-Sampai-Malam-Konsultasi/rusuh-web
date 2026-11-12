import { AxiosError, AxiosHeaders, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';
import { describe, expect, it, vi } from 'vitest';

import { createHttpAdapter, HttpRequestError, randomRequestId, REQUEST_ID_HEADER, toHttpError } from '../http.adapter';

const ok = (data: unknown, status = 200): AxiosAdapter =>
  vi.fn(async (config: InternalAxiosRequestConfig) => ({ data, status, statusText: 'OK', headers: {}, config }));

const fail = (status: number, data: unknown) => (config: InternalAxiosRequestConfig) =>
  Promise.reject(
    new AxiosError('fail', 'ERR_BAD_REQUEST', config, {}, { data, status, statusText: '', headers: {}, config }),
  );

describe('createHttpAdapter', () => {
  it('returns data and status', async () => {
    const http = createHttpAdapter({ baseUrl: 'https://api.test', timeoutMs: 1000, transport: ok({ id: 1 }) });
    await expect(http.get('/events')).resolves.toEqual({ data: { id: 1 }, status: 200 });
  });

  it('adds Accept-Language and the bearer token per request', async () => {
    const transport = ok({});
    const http = createHttpAdapter({
      baseUrl: 'https://api.test',
      timeoutMs: 1000,
      transport,
      getLocale: () => 'en',
      getAccessToken: () => 'tok',
    });
    await http.post('/bookings', { a: 1 }, { headers: { 'X-Admission-Token': 'adm' } });
    const sent = (transport as ReturnType<typeof vi.fn>).mock.calls[0][0] as InternalAxiosRequestConfig;
    const headers = AxiosHeaders.from(sent.headers);
    expect(headers.get('Accept-Language')).toBe('en');
    expect(headers.get('Authorization')).toBe('Bearer tok');
    expect(headers.get('X-Admission-Token')).toBe('adm');
  });

  it('sends no Authorization header without a token', async () => {
    const transport = ok({});
    const http = createHttpAdapter({
      baseUrl: 'https://api.test',
      timeoutMs: 1000,
      transport,
      getAccessToken: () => null,
    });
    await http.get('/events');
    const sent = (transport as ReturnType<typeof vi.fn>).mock.calls[0][0] as InternalAxiosRequestConfig;
    expect(AxiosHeaders.from(sent.headers).has('Authorization')).toBe(false);
  });

  it('normalises an API problem into HttpError', async () => {
    const http = createHttpAdapter({
      baseUrl: 'https://api.test',
      timeoutMs: 1000,
      transport: fail(409, { code: 'NIK_SEAT_TAKEN', title: 'NIK sudah terdaftar', traceId: 't1' }),
    });
    const error = await http.post('/x').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpRequestError);
    expect(error).toMatchObject({
      name: 'HttpError',
      status: 409,
      code: 'NIK_SEAT_TAKEN',
      message: 'NIK sudah terdaftar',
      data: { code: 'NIK_SEAT_TAKEN', title: 'NIK sudah terdaftar', traceId: 't1' },
      traceId: 't1',
    });
  });

  it('sends a new X-Request-ID on every call, but none on a cacheable read', async () => {
    const transport = ok({});
    let n = 0;
    const http = createHttpAdapter({
      baseUrl: 'https://api.test',
      timeoutMs: 1000,
      transport,
      newRequestId: () => `req-${++n}`,
    });
    await http.get('/a');
    await http.post('/b', {});
    await http.get('/queue/evt/frontier', { cacheable: true });
    await http.get('/c', { headers: { [REQUEST_ID_HEADER]: 'given' } });
    const calls = (transport as ReturnType<typeof vi.fn>).mock.calls as [InternalAxiosRequestConfig][];
    const sent = calls.map(([config]) => config.headers.get(REQUEST_ID_HEADER) ?? null);
    expect(sent).toEqual(['req-1', 'req-2', null, 'given']);
    expect(REQUEST_ID_HEADER).toBe('X-Request-ID');
  });

  it('sends no X-Request-ID when switched off', async () => {
    const transport = ok({});
    const http = createHttpAdapter({ baseUrl: 'https://api.test', timeoutMs: 1000, transport, sendRequestId: false });
    await http.post('/b', {});
    const [[config]] = (transport as ReturnType<typeof vi.fn>).mock.calls as [InternalAxiosRequestConfig][];
    expect(config.headers.has(REQUEST_ID_HEADER)).toBe(false);
  });

  it('keeps the request ID on the replay after a session refresh, and puts it on the error', async () => {
    const seen: unknown[] = [];
    let calls = 0;
    const transport: AxiosAdapter = async (config) => {
      calls += 1;
      seen.push(config.headers.get(REQUEST_ID_HEADER));
      if (calls === 1) return fail(401, { code: 'UNAUTHORIZED' })(config);
      return fail(503, { code: 'INTERNAL_ERROR' })(config);
    };
    const http = createHttpAdapter({
      baseUrl: 'https://api.test',
      timeoutMs: 1000,
      transport,
      refreshSession: async () => true,
      newRequestId: () => 'req-1',
    });
    await expect(http.get('/me')).rejects.toMatchObject({ status: 503, requestId: 'req-1' });
    expect(seen).toEqual(['req-1', 'req-1']);
  });

  it("prefers the server's echoed request ID: the header, then the problem's traceId", async () => {
    const echo = (headers: Record<string, string>, data: unknown) => (config: InternalAxiosRequestConfig) =>
      Promise.reject(
        new AxiosError('x', 'ERR_BAD_REQUEST', config, {}, { data, status: 500, statusText: '', headers, config }),
      );
    const make = (transport: AxiosAdapter) =>
      createHttpAdapter({ baseUrl: 'https://api.test', timeoutMs: 1000, transport, newRequestId: () => 'sent' });
    await expect(make(echo({ 'x-request-id': 'srv' }, { traceId: 't' })).get('/x')).rejects.toMatchObject({
      requestId: 'srv',
    });
    await expect(make(echo({}, { traceId: 'trace-1' })).get('/x')).rejects.toMatchObject({ requestId: 'trace-1' });
    await expect(make(echo({}, null)).get('/x')).rejects.toMatchObject({ requestId: 'sent' });
    // A cacheable read has none to report.
    const none = await make(echo({}, null))
      .get('/f', { cacheable: true })
      .catch((e: HttpRequestError) => e);
    expect((none as HttpRequestError).requestId).toBeUndefined();
  });

  it('carries the request ID on network errors and timeouts too', async () => {
    const drop = (code: string) => (config: InternalAxiosRequestConfig) =>
      Promise.reject(new AxiosError('down', code, config));
    const make = (transport: AxiosAdapter) =>
      createHttpAdapter({ baseUrl: 'https://api.test', timeoutMs: 1000, transport, newRequestId: () => 'r' });
    await expect(make(drop('ERR_NETWORK')).get('/x')).rejects.toMatchObject({ code: 'NETWORK_ERROR', requestId: 'r' });
    await expect(make(drop('ECONNABORTED')).get('/x')).rejects.toMatchObject({ code: 'TIMEOUT', requestId: 'r' });
  });

  it('tells onError about each failure once, after any refresh', async () => {
    const onError = vi.fn();
    const http = createHttpAdapter({
      baseUrl: 'https://api.test',
      timeoutMs: 1000,
      transport: fail(500, { code: 'INTERNAL_ERROR' }),
      onError,
      newRequestId: () => 'req-9',
    });
    await expect(http.get('/x')).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toMatchObject({ status: 500, code: 'INTERNAL_ERROR', requestId: 'req-9' });
  });

  it('makes v4 UUIDs, with or without crypto.randomUUID', () => {
    const v4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    expect(randomRequestId()).toMatch(v4);
    const original = crypto.randomUUID;
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });
    try {
      expect(randomRequestId()).toMatch(v4);
    } finally {
      Object.defineProperty(crypto, 'randomUUID', { value: original, configurable: true });
    }
  });

  it('refreshes the session once on 401 and retries', async () => {
    let calls = 0;
    const transport: AxiosAdapter = async (config) => {
      calls += 1;
      if (calls === 1) return fail(401, { code: 'UNAUTHORIZED' })(config);
      return { data: 'again', status: 200, statusText: 'OK', headers: {}, config };
    };
    const refreshSession = vi.fn(async () => true);
    const http = createHttpAdapter({ baseUrl: 'https://api.test', timeoutMs: 1000, transport, refreshSession });
    await expect(http.get('/me')).resolves.toEqual({ data: 'again', status: 200 });
    expect(refreshSession).toHaveBeenCalledTimes(1);
  });

  it('gives up when the refresh fails', async () => {
    const http = createHttpAdapter({
      baseUrl: 'https://api.test',
      timeoutMs: 1000,
      transport: fail(401, { code: 'UNAUTHORIZED' }),
      refreshSession: async () => false,
    });
    await expect(http.get('/me')).rejects.toMatchObject({ status: 401, code: 'UNAUTHORIZED' });
  });

  it('rejects a skipRefresh 401 without refreshing', async () => {
    const refreshSession = vi.fn(async () => true);
    const http = createHttpAdapter({
      baseUrl: 'https://api.test',
      timeoutMs: 1000,
      transport: fail(401, { code: 'UNAUTHORIZED' }),
      refreshSession,
    });
    await expect(http.post('/auth/refresh', undefined, { skipRefresh: true })).rejects.toMatchObject({
      status: 401,
    });
    expect(refreshSession).not.toHaveBeenCalled();
  });

  it('sends cookies only when asked', async () => {
    const transport = ok({});
    const http = createHttpAdapter({ baseUrl: 'https://api.test', timeoutMs: 1000, transport });
    await http.post('/auth/otp/verify', {}, { withCredentials: true });
    await http.get('/events');
    const calls = (transport as ReturnType<typeof vi.fn>).mock.calls as [InternalAxiosRequestConfig][];
    expect(calls[0][0].withCredentials).toBe(true);
    expect(calls[1][0].withCredentials).toBeFalsy();
  });

  it('asks for a blob when told, and reads a problem sent back as a blob', async () => {
    const pdf = ok(new Blob(['%PDF']));
    const http = createHttpAdapter({ baseUrl: 'https://api.test', timeoutMs: 1000, transport: pdf });
    await http.get('/bookings/bk_1/tickets.pdf', { responseType: 'blob' });
    const calls = (pdf as ReturnType<typeof vi.fn>).mock.calls as [InternalAxiosRequestConfig][];
    expect(calls[0][0].responseType).toBe('blob');

    const refuse = (body: Blob) =>
      vi.fn(async (config: InternalAxiosRequestConfig) =>
        Promise.reject(
          new AxiosError('409', 'ERR_BAD_REQUEST', config, null, {
            data: body,
            status: 409,
            statusText: 'Conflict',
            headers: {},
            config,
          }),
        ),
      );
    const problemBlob = new Blob([JSON.stringify({ code: 'BOOKING_NOT_PAID', title: 'Belum lunas' })], {
      type: 'application/problem+json',
    });
    const json = createHttpAdapter({ baseUrl: 'https://api.test', timeoutMs: 1000, transport: refuse(problemBlob) });
    await expect(json.get('/x', { responseType: 'blob' })).rejects.toMatchObject({
      status: 409,
      code: 'BOOKING_NOT_PAID',
    });
    const broken = new Blob(['{nope'], { type: 'application/json' });
    const bad = createHttpAdapter({ baseUrl: 'https://api.test', timeoutMs: 1000, transport: refuse(broken) });
    await expect(bad.get('/x', { responseType: 'blob' })).rejects.toMatchObject({ status: 409, code: 'HTTP_409' });
  });

  it('supports put, patch and delete', async () => {
    const http = createHttpAdapter({ baseUrl: 'https://api.test', timeoutMs: 1000, transport: ok('done') });
    await expect(http.put('/a', {})).resolves.toMatchObject({ data: 'done' });
    await expect(http.patch('/a', {})).resolves.toMatchObject({ data: 'done' });
    await expect(http.delete('/a')).resolves.toMatchObject({ data: 'done' });
  });
});

describe('toHttpError', () => {
  it('maps a missing response to NETWORK_ERROR', () => {
    expect(toHttpError(new AxiosError('down', 'ERR_NETWORK'))).toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
  });

  it('maps a timeout to TIMEOUT', () => {
    expect(toHttpError(new AxiosError('slow', 'ECONNABORTED'))).toMatchObject({ code: 'TIMEOUT' });
  });

  it('falls back to HTTP_<status> when the body has no code', () => {
    const config = { headers: new AxiosHeaders() } as InternalAxiosRequestConfig;
    const err = new AxiosError(
      'x',
      'ERR',
      config,
      {},
      { data: undefined, status: 502, statusText: '', headers: {}, config },
    );
    expect(toHttpError(err)).toMatchObject({ status: 502, code: 'HTTP_502' });
  });

  it('maps non-HTTP errors to UNKNOWN_ERROR', () => {
    expect(toHttpError(new Error('boom'))).toMatchObject({ status: 0, code: 'UNKNOWN_ERROR', message: 'boom' });
    expect(toHttpError('weird')).toMatchObject({ status: 0, code: 'UNKNOWN_ERROR', message: 'weird' });
  });

  it('returns a real Error that keeps the original as its cause', () => {
    const original = new AxiosError('down', 'ERR_NETWORK');
    const error = toHttpError(original);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('HttpError');
    expect(error.stack).toBeDefined();
    expect(error.cause).toBe(original);
  });

  it('passes an HttpRequestError through unchanged', () => {
    const error = new HttpRequestError({ status: 409, code: 'NIK_SEAT_TAKEN', message: 'taken' });
    expect(toHttpError(error)).toBe(error);
  });
});
