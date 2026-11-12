# Design Document

```ts
// core/protocols/http.protocol.ts
interface HttpError { status; code; message; data?; traceId?; requestId?: string }
interface RequestConfig { …; cacheable?: boolean }

// infrastructure/adapters
createHttpAdapter({ …, newRequestId?, onError?: (error: HttpError) => void })
apiErrorReporter(getAnalytics)            // onError: api_error breadcrumb; reportError for 5xx
createSentrySink({ dsn, environment, release, tracesSampleRate, replayOnErrorRate, load?, loadReplay?, schedule?, random? })
scrubText / scrubUrl / scrubValue / scrubEvent / scrubBreadcrumb / createEventBudget
sentry-sdk.ts, sentry-replay.ts           // the two lazy entry points

// utils/format/support.ts
supportCode(error) → '3f2a9c1e' | undefined   // PopupErrorInput.reference
```

`analyticsAdapter` gets the Sentry sink only when the DSN is set; controllers keep calling the analytics protocol.

## Layer Constraints

- Only adapters import libraries (`@sentry/browser`, Axios); only `config.ts` reads `process.env` (`next.config.ts`
  reads the build-time `SOURCE_MAPS` switch).
- Protocols stay import-free; services pass `cacheable` and never catch.
- No secrets in `NEXT_PUBLIC_*`: the DSN is public by design; the auth token is a CI secret.
