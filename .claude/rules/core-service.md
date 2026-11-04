---
paths:
  - "src/core/services/**"
  - "src/core/entities/**"
  - "src/core/protocols/**"
  - "src/infrastructure/adapters/**"
---

# Core: protocols, entities, services, adapters

`src/core/` is pure TypeScript. No React, no Next.js, no Axios, no browser APIs, no infrastructure imports.

## Protocols (`src/core/protocols/`)

- Pure interfaces with zero imports: `HttpProtocol`, `HttpResponse<T>`, `HttpError`, `StorageProtocol`,
  `AnalyticsProtocol`, `QueueStreamProtocol` (SSE, ADR-0015).
- `HttpError` shape: `{ status, code, message, data, traceId }` — `code` is the API's stable error code
  (RFC 9457 `Problem.code` in `openapi.yaml`).
- Generic types only (`data: T`), never library types.

## Entities (`src/core/entities/{domain}/`)

- Types only: request (`…Request`), response (`…Response`), domain models (plain names). No classes, no runtime code.
- Match the API contract in `../rusuh-documentation/api/openapi.yaml`. Generated types (e.g. `openapi-typescript`
  into `src/core/entities/generated/`) are allowed; domain entities may re-export or narrow them.
- Optional fields (`?`) only where the contract makes them optional.
- Money is whole rupiah (`number`); times are ISO strings from the server.

## Services (`src/core/services/{domain}.service.ts`)

- One service per API aggregate: `catalog`, `queue`, `auth`, `booking`, `payment`, `ticket`, `account`.
- Depend only on `http` (and `config`) from `AwilixRegistry`.
- Type every call: `http.post<CreateBookingResponse, CreateBookingRequest>('bookings', payload)`.
- Always return `HttpResponse<T>`.
- No transformation (that is a use case), no try/catch: let `HttpError` propagate.
- Registered as `asFunction(Service).singleton()` in `services.registry.ts`; interface added to `AwilixRegistry`.
- Two HTTP clients if needed: `queueHttp` (queue service, device/queue/admission tokens) and `coreHttp` (core service,
  bearer session). Each is its own adapter instance registered in `infrastructure.registry.ts`.

## Adapters (`src/infrastructure/adapters/`)

- The only place external libraries are imported (Axios, the SSE client, storage, analytics SDK).
- Receive config and other deps through the factory parameters; never import `config.ts` or another adapter directly.
- HTTP adapter duties:
  - base URL from config; `Accept: application/json`; `Accept-Language` from the current locale, read at request time
  - `Authorization: Bearer <access token>` when a session exists; `X-Admission-Token` on admission-gated calls
  - on `401`, refresh the session once (`/auth/refresh`) and retry; otherwise reject
  - normalise every failure into `HttpError` (network errors get `code: 'NETWORK_ERROR'`)
- Export only the protocol-typed factory, never the library instance.

## Testing

- Every service: `src/core/services/__tests__/{domain}.service.test.ts`, mocking the `http` protocol and asserting
  method, path and payload. No network.
- Every adapter: tests for header injection and error normalisation.
- Coverage threshold 85%.

## Anti-patterns

- ❌ Importing Axios/fetch in a service
- ❌ Transforming data or catching errors in a service
- ❌ Several aggregates in one service file
- ❌ Inline types instead of `@core/entities/`
- ❌ Returning unwrapped data instead of `HttpResponse<T>`
- ❌ Library types or any import inside a protocol file
