# Step 2 — Protocols, config, adapters

## Files

| File | Content |
| --- | --- |
| `src/core/protocols/http.protocol.ts` | `HttpProtocol`, `HttpResponse<T>`, `HttpError`, `RequestConfig` |
| `src/core/protocols/storage.protocol.ts` | `StorageProtocol` (`get`, `set`, `remove`; string values) |
| `src/core/protocols/analytics.protocol.ts` | `AnalyticsProtocol` (`trackPageView`, `trackEvent`, `reportError`) |
| `src/core/protocols/queue-stream.protocol.ts` | `QueueStreamProtocol` (`open(eventId, handlers) → close()`) for SSE |
| `src/infrastructure/config.ts` | `AppConfig`, `requireEnv`, `optionalEnv`, `boolEnv`, exported `config` |
| `src/infrastructure/adapters/http.adapter.ts` | `createHttpAdapter({ baseUrl, timeoutMs, getAccessToken, getLocale, refreshSession })` with Axios |
| `src/infrastructure/adapters/storage.adapter.ts` | `localStorage`-backed, safe when storage is unavailable |
| `src/infrastructure/adapters/analytics.adapter.ts` | No-op or console-free implementation until a provider is chosen |
| `src/infrastructure/adapters/queue-stream.adapter.ts` | Fetch-based SSE with device/queue tokens in headers; falls back by calling `onFallback` |
| `__tests__` next to each adapter | Header injection, error normalisation, storage failure |

## Shapes

```ts
// http.protocol.ts — zero imports
export interface HttpResponse<T> { data: T; status: number }
export interface HttpError { status: number; code: string; message: string; data?: unknown; traceId?: string }
export interface RequestConfig { headers?: Record<string, string>; signal?: AbortSignal }
export interface HttpProtocol {
  get<T>(path: string, config?: RequestConfig): Promise<HttpResponse<T>>;
  post<T, B = unknown>(path: string, body?: B, config?: RequestConfig): Promise<HttpResponse<T>>;
  put<T, B = unknown>(path: string, body?: B, config?: RequestConfig): Promise<HttpResponse<T>>;
  patch<T, B = unknown>(path: string, body?: B, config?: RequestConfig): Promise<HttpResponse<T>>;
  delete<T>(path: string, config?: RequestConfig): Promise<HttpResponse<T>>;
}
```

```ts
// config.ts — the only reader of process.env; every variable read literally
const requireEnv = (value: string | undefined, name: string): string => {
  if (!value) throw new Error(`Missing env ${name}`);
  return value;
};
export const config = {
  appVersion: requireEnv(process.env.NEXT_PUBLIC_APP_VERSION, 'NEXT_PUBLIC_APP_VERSION'),
  queueApiUrl: requireEnv(process.env.NEXT_PUBLIC_QUEUE_API_URL, 'NEXT_PUBLIC_QUEUE_API_URL'),
  coreApiUrl: requireEnv(process.env.NEXT_PUBLIC_CORE_API_URL, 'NEXT_PUBLIC_CORE_API_URL'),
  apiTimeoutMs: Number(process.env.NEXT_PUBLIC_API_TIMEOUT_MS ?? 10000),
  midtransClientKey: requireEnv(process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY, 'NEXT_PUBLIC_MIDTRANS_CLIENT_KEY'),
  midtransSnapUrl: requireEnv(process.env.NEXT_PUBLIC_MIDTRANS_SNAP_URL, 'NEXT_PUBLIC_MIDTRANS_SNAP_URL'),
  turnstileSiteKey: requireEnv(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY, 'NEXT_PUBLIC_TURNSTILE_SITE_KEY'),
  defaultLocale: (process.env.NEXT_PUBLIC_DEFAULT_LOCALE ?? 'id') as 'id' | 'en',
} as const;
export type AppConfig = typeof config;
```

## HTTP adapter behaviour

- Base URL and timeout from the factory params; `Accept: application/json`.
- `Accept-Language`: current locale, read **per request** through `getLocale()`.
- `Authorization: Bearer …` when `getAccessToken()` returns a token (core client). Admission-gated calls pass
  `X-Admission-Token` via `RequestConfig.headers` from the service.
- On `401` (once per request): `await refreshSession()`, retry; if that fails, reject with the `401`.
- Normalise errors: API problems (`application/problem+json`) → `{ status, code: body.code, message: body.title, data:
  body, traceId }`; no response → `{ status: 0, code: 'NETWORK_ERROR' }`; timeout → `code: 'TIMEOUT'`.
- Two instances are registered in DI: `queueHttp` (queue service) and `coreHttp` (core service).

## Gate

```bash
npx tsc --noEmit
```

## Anti-patterns

- ❌ Imports in protocol files
- ❌ Adapters importing `config.ts` or each other
- ❌ Exporting the Axios instance
- ❌ Business decisions in adapters
