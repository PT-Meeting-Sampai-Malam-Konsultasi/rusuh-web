import axios, { type AxiosAdapter, type AxiosError, type InternalAxiosRequestConfig } from 'axios';

import type { HttpError, HttpProtocol, HttpResponse, RequestConfig } from '@core/protocols/http.protocol';

export interface HttpAdapterOptions {
  baseUrl: string;
  timeoutMs: number;
  /** Current access token, read per request (bearer auth on core). */
  getAccessToken?: () => string | null;
  /** Current UI locale, read per request (Accept-Language). */
  getLocale?: () => string;
  /** Called once on a 401; resolves true when a new access token is available. */
  refreshSession?: () => Promise<boolean>;
  /** Test seam: replaces the network transport. */
  transport?: AxiosAdapter;
  /** Test seam: the `X-Request-ID` generator (a UUID v4 by default). */
  newRequestId?: () => string;
  /** Told about every failed call, after any refresh: monitoring keeps a trail with the request ID (NFR-09-W1). */
  onError?: (error: HttpError) => void;
}

/** Sent on every call except cacheable ones; the backend logs it and echoes it back (NFR-09-W1). */
export const REQUEST_ID_HEADER = 'X-Request-ID';

/** `crypto.randomUUID` where the browser has it (secure contexts), otherwise a v4 built from `getRandomValues`. */
export function randomRequestId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

interface Problem {
  code?: string;
  title?: string;
  detail?: string;
  traceId?: string;
}

type RetryConfig = InternalAxiosRequestConfig & { _retried?: boolean; skipRefresh?: boolean; cacheable?: boolean };

/** The `HttpError` contract as a real `Error`, so rejections carry a name and a stack trace. */
export class HttpRequestError extends Error implements HttpError {
  readonly status: number;
  readonly code: string;
  readonly data?: unknown;
  readonly traceId?: string;
  readonly requestId?: string;

  constructor({ status, code, message, data, traceId, requestId }: HttpError, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    if (data !== undefined) this.data = data;
    if (traceId !== undefined) this.traceId = traceId;
    if (requestId !== undefined) this.requestId = requestId;
  }
}

/** The server's echo (header, then the problem's `traceId`), else the ID this request was sent with. */
function requestIdOf(error: AxiosError<Problem>): string | undefined {
  const echoed = error.response?.headers?.['x-request-id'];
  if (typeof echoed === 'string' && echoed) return echoed;
  const body = error.response?.data;
  if (body && typeof body === 'object' && typeof body.traceId === 'string' && body.traceId) return body.traceId;
  const sent = error.config?.headers?.[REQUEST_ID_HEADER];
  return typeof sent === 'string' && sent ? sent : undefined;
}

export function toHttpError(error: unknown): HttpRequestError {
  if (error instanceof HttpRequestError) return error;
  const cause = { cause: error };
  if (axios.isAxiosError(error)) {
    const e = error as AxiosError<Problem>;
    const requestId = requestIdOf(e);
    const withId = requestId ? { requestId } : {};
    if (e.code === 'ECONNABORTED' || e.code === 'ETIMEDOUT') {
      return new HttpRequestError({ status: 0, code: 'TIMEOUT', message: e.message, ...withId }, cause);
    }
    if (!e.response) {
      return new HttpRequestError({ status: 0, code: 'NETWORK_ERROR', message: e.message, ...withId }, cause);
    }
    const body = e.response.data;
    return new HttpRequestError(
      {
        status: e.response.status,
        code: body?.code ?? `HTTP_${e.response.status}`,
        message: body?.title ?? e.message,
        data: body,
        traceId: body?.traceId,
        ...withId,
      },
      cause,
    );
  }
  const message = error instanceof Error ? error.message : String(error);
  return new HttpRequestError({ status: 0, code: 'UNKNOWN_ERROR', message }, cause);
}

/** A file request (`responseType: 'blob'`) gets its problem body as a Blob too: read it so the error keeps its code. */
async function readBlobProblem(error: AxiosError) {
  const response = error.response;
  if (!(response?.data instanceof Blob) || !response.data.type.includes('json')) return;
  try {
    response.data = JSON.parse(await response.data.text());
  } catch {
    // Not JSON after all: the status alone names the error.
  }
}

export function createHttpAdapter(options: HttpAdapterOptions): HttpProtocol {
  const client = axios.create({
    baseURL: options.baseUrl,
    timeout: options.timeoutMs,
    headers: { Accept: 'application/json' },
    ...(options.transport ? { adapter: options.transport } : {}),
  });

  const newRequestId = options.newRequestId ?? randomRequestId;
  client.interceptors.request.use((config) => {
    // A replay after a session refresh keeps its ID: it is the same request.
    if (!(config as RetryConfig).cacheable && !config.headers.has(REQUEST_ID_HEADER)) {
      config.headers.set(REQUEST_ID_HEADER, newRequestId());
    }
    const locale = options.getLocale?.();
    if (locale) config.headers.set('Accept-Language', locale);
    const token = options.getAccessToken?.();
    if (token && !config.headers.has('Authorization')) config.headers.set('Authorization', `Bearer ${token}`);
    return config;
  });

  client.interceptors.response.use(undefined, async (error: unknown) => {
    const config = axios.isAxiosError(error) ? (error.config as RetryConfig | undefined) : undefined;
    const status = axios.isAxiosError(error) ? error.response?.status : undefined;
    if (status === 401 && config && !config._retried && !config.skipRefresh && options.refreshSession) {
      config._retried = true;
      if (await options.refreshSession()) {
        config.headers.delete('Authorization');
        return client.request(config);
      }
    }
    if (axios.isAxiosError(error)) await readBlobProblem(error);
    const failure = toHttpError(error);
    options.onError?.(failure);
    return Promise.reject(failure);
  });

  const wrap = async <T>(promise: Promise<{ data: T; status: number }>): Promise<HttpResponse<T>> => {
    const res = await promise;
    return { data: res.data, status: res.status };
  };
  const opts = (c?: RequestConfig) => ({
    headers: c?.headers,
    signal: c?.signal,
    ...(c?.withCredentials ? { withCredentials: true } : {}),
    ...(c?.skipRefresh ? { skipRefresh: true } : {}),
    ...(c?.responseType ? { responseType: c.responseType } : {}),
    ...(c?.cacheable ? { cacheable: true } : {}),
  });

  return {
    get: (path, c) => wrap(client.get(path, opts(c))),
    post: (path, body, c) => wrap(client.post(path, body, opts(c))),
    put: (path, body, c) => wrap(client.put(path, body, opts(c))),
    patch: (path, body, c) => wrap(client.patch(path, body, opts(c))),
    delete: (path, c) => wrap(client.delete(path, opts(c))),
  };
}
