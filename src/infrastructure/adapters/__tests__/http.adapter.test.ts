import { AxiosError, AxiosHeaders, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';
import { describe, expect, it, vi } from 'vitest';

import { createHttpAdapter, HttpRequestError, toHttpError } from '../http.adapter';

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
