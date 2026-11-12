# Design Document

## Overview

Three additions on the existing booking aggregate (spec 12):

1. `ValidateAttendeeRequest` / `ValidateAttendeeResponse` in `booking.entity.ts`.
2. `bookingService.validateAttendee(eventId, admissionToken, body)`, the same shape as `getCategories` (token as a
   parameter, header through `RequestConfig.headers`).
3. An MSW handler with a documented last-4-digits rule, ~600 ms latency, and a new `dukcapil_down` scenario.

No new DI key: `bookingService` is already `asFunction(BookingService).singleton()` and typed in `AwilixRegistry`; its
interface only gains a method.

## Architecture

```
validateAttendeeUseCase (spec 54) ──► bookingService.validateAttendee(eventId, token, body)
                                         └► coreHttp.post ──► POST {CORE}/events/{eventId}/attendees/validate
                                                              Authorization: Bearer …   (adapter, if a session exists)
                                                              X-Admission-Token: …      (service)
                                                              { fieldIndex, fullName, nik }
```

| Operation                                                      | `x-service`  | Auth                            | Responses                                                                                                                                                            |
| -------------------------------------------------------------- | ------------ | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `validateAttendee` `POST /events/{eventId}/attendees/validate` | core.booking | `bearerAuth` + `admissionToken` | 200 body below; 403 `AdmissionInvalid`; 409 `NIK_SEAT_TAKEN` / `DUPLICATE_NIK`; 422 `NIK_INVALID`; 429 `TooManyRequests` (`Retry-After`); 503 `DUKCAPIL_UNAVAILABLE` |

Contract order of server checks (operation description): 16-digit format and structure → not repeated in this order →
Dukcapil (NIK + name, 2 s timeout) → no seat already held by this NIK for the event. Limit: 3 attempts per minute per
field of each order (`fieldIndex`, C-6).

Files:

| File                                                          | Change                                                           |
| ------------------------------------------------------------- | ---------------------------------------------------------------- |
| `src/core/entities/booking/booking.entity.ts`                 | add `ValidateAttendeeRequest`, `ValidateAttendeeResponse`        |
| `src/core/services/booking.service.ts`                        | add `validateAttendee`                                           |
| `src/core/services/__tests__/booking.service.test.ts`         | add cases                                                        |
| `src/infrastructure/mocks/handlers/booking.handlers.ts`       | add `POST /events/:eventId/attendees/validate`, export constants |
| `src/infrastructure/mocks/scenario.ts`                        | add `dukcapil_down`                                              |
| `src/infrastructure/mocks/__tests__/booking.handlers.test.ts` | add cases                                                        |
| `src/infrastructure/mocks/__tests__/scenario.test.ts`         | add `dukcapil_down`                                              |

## Components and Interfaces

```ts
// src/core/services/booking.service.ts
import type {
  GetCategoriesResponse,
  ValidateAttendeeRequest,
  ValidateAttendeeResponse,
} from '@core/entities/booking/booking.entity';
import type { HttpResponse } from '@core/protocols/http.protocol';
import type { AwilixRegistry } from '@infrastructure/di/registry.types';

export const ADMISSION_TOKEN_HEADER = 'X-Admission-Token'; // unchanged

export interface BookingServiceInterface {
  getCategories: (eventId: string, admissionToken: string) => Promise<HttpResponse<GetCategoriesResponse>>; // unchanged
  /**
   * `POST /events/{eventId}/attendees/validate`: one ticket holder's name + NIK against format, Dukcapil and the
   * one-seat-per-NIK rule (ADR-0007). Needs a live admission token (403 ADMISSION_INVALID) and a session.
   * 409 NIK_SEAT_TAKEN / DUPLICATE_NIK, 422 NIK_INVALID, 429 RATE_LIMITED (Retry-After), 503 DUKCAPIL_UNAVAILABLE.
   */
  validateAttendee: (
    eventId: string,
    admissionToken: string,
    body: ValidateAttendeeRequest,
  ) => Promise<HttpResponse<ValidateAttendeeResponse>>;
}

export const BookingService = ({ coreHttp }: Pick<AwilixRegistry, 'coreHttp'>): BookingServiceInterface => ({
  getCategories: /* unchanged */,
  validateAttendee: (eventId, admissionToken, body) =>
    coreHttp.post<ValidateAttendeeResponse, ValidateAttendeeRequest>(
      `events/${encodeURIComponent(eventId)}/attendees/validate`,
      body,
      { headers: { [ADMISSION_TOKEN_HEADER]: admissionToken } },
    ),
});
```

Compile check: `HttpProtocol.post<T, B>(path, body?: B, config?: RequestConfig)` exists; `RequestConfig.headers` is
`Record<string, string>`. `AwilixRegistry.bookingService: BookingServiceInterface` widens with one method; the spec 13
use-case test fake (`{ getCategories: vi.fn() }`) must gain `validateAttendee: vi.fn()` if it is typed as the full
interface (check `get-order-categories.use-case.test.ts`; add the property only if `tsc` asks).

```ts
// src/infrastructure/mocks/handlers/booking.handlers.ts (additions)
/** Visible "Memeriksa ke Dukcapil…" in dev; the real check has a 2 s timeout. */
export const MOCK_DUKCAPIL_LATENCY_MS = 600;
/** The NIK's last 4 digits pick the outcome; any other structurally valid NIK passes. */
export const MOCK_NIK_SUFFIX = {
  NIK_INVALID: '9999',
  NIK_SEAT_TAKEN: '8888',
  DUKCAPIL_UNAVAILABLE: '7777',
  RATE_LIMITED: '6666',
} as const;
export const MOCK_RETRY_AFTER_S = 60;
const VALIDATION_WINDOW_MS = 5 * 60_000;

// bookingHandlers(context) returns [categoriesHandler (unchanged), validateHandler]
```

Problem bodies with extra fields and headers: move `problemWith` from `auth.handlers.ts` to `handlers/shared.ts` and
widen it with optional headers, then import it in both handler files (auth behaviour unchanged):

```ts
// src/infrastructure/mocks/handlers/shared.ts
export const problemWith = (
  status: number,
  code: string,
  title: string,
  extra: Record<string, unknown>,
  headers: Record<string, string> = {},
) =>
  HttpResponse.json(
    { type: 'about:blank', title, status, code, ...extra },
    { status, headers: { 'Content-Type': 'application/problem+json', ...headers } },
  );
```

```ts
// src/infrastructure/mocks/scenario.ts (addition, after 'no_queue')
  /** FR-15: the Dukcapil circuit is open: every NIK check answers 503 DUKCAPIL_UNAVAILABLE. */
  'dukcapil_down',
```

## Data Models

```ts
// src/core/entities/booking/booking.entity.ts (additions)

/** `validateAttendee` body: one ticket holder (ADR-0007). */
export interface ValidateAttendeeRequest {
  /** 0-based ticket position in the order, 0–2; the server rate-limits per field of each order (C-6). */
  fieldIndex: number;
  /** As on the KTP; Dukcapil checks it together with the NIK. */
  fullName: string;
  /** 16 digits (`^[0-9]{16}$`). Never logged. */
  nik: string;
}

export interface ValidateAttendeeResponse {
  /** Short-lived token the hold requires per attendee (FR-16+). */
  validationToken: string;
  /** Server mask, e.g. `************1234`. */
  nikMasked: string;
  /** End of the validation token's life (server time, ISO). */
  expiresAt: string;
}
```

Mock handler order (first match wins):

| #   | Condition                                                        | Answer                                                                               |
| --- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 1   | `failure(scenario)` (`offline`, `error`, `slow` delay)           | network error / 503 `INTERNAL_ERROR` / continue after 3 s                            |
| 2   | scenario `admission_invalid`                                     | 403 `ADMISSION_INVALID`                                                              |
| 3   | no / empty `X-Admission-Token`                                   | 403 `ADMISSION_INVALID`                                                              |
| 4   | event id not in `eventsFixture(now())`                           | 403 `ADMISSION_INVALID`                                                              |
| 5   | body not JSON, `fieldIndex` not an integer 0–2, `fullName` blank | 422 `VALIDATION_FAILED`                                                              |
| 6   | `nik` not `/^\d{16}$/`                                           | 422 `NIK_INVALID`                                                                    |
| 7   | `await delay(MOCK_DUKCAPIL_LATENCY_MS)`                          | —                                                                                    |
| 8   | scenario `dukcapil_down` or NIK ends `7777`                      | 503 `DUKCAPIL_UNAVAILABLE`                                                           |
| 9   | NIK ends `9999`                                                  | 422 `NIK_INVALID`                                                                    |
| 10  | NIK ends `8888`                                                  | 409 `NIK_SEAT_TAKEN`                                                                 |
| 11  | NIK ends `6666`                                                  | 429 `RATE_LIMITED`, header `Retry-After: 60`, body `retryAfter: 60`                  |
| 12  | otherwise                                                        | 200 `{ validationToken, nikMasked: '************' + last4, expiresAt: now + 5 min }` |

QA sample NIKs (all pass the client structure rule of spec 54: province 31, day 52 = 12 for a woman, month 03, serial
not 0000): `3174055203960004` → valid; `3174055203969999` → name/NIK mismatch; `3174055203968888` → seat taken;
`3174055203967777` → Dukcapil busy; `3174055203966666` → rate limited (60 s).

Problem titles (Indonesian, like the other mocks; never contain the NIK or name): `NIK_INVALID` "Nama dan NIK tidak
cocok", `NIK_SEAT_TAKEN` "NIK sudah terdaftar untuk event ini", `DUKCAPIL_UNAVAILABLE` "Dukcapil sedang sibuk",
`RATE_LIMITED` "Terlalu banyak percobaan", `VALIDATION_FAILED` "Data tidak lengkap".

`validationToken` counter: a closure counter inside `bookingHandlers` (per factory, like the auth mock's sessions), not
module state.

**Note on `Retry-After`:** the contract carries the wait only in the `Retry-After` header; the HTTP adapter puts the
problem body in `HttpError.data` and drops headers. The mock sends both, and spec 54 reads `data.retryAfter` (same as
the sign-in flow). Reading the header in the adapter is an open question for the core team (see spec 54).

## Layer Constraints

From `.claude/rules/core-service.md`:

- Types only: request (`…Request`), response (`…Response`), domain models (plain names). No classes, no runtime code.
- Match the API contract in `../rusuh-documentation/api/openapi.yaml`. Generated types (e.g. `openapi-typescript`
  into `src/core/entities/generated/`) are allowed; domain entities may re-export or narrow them.
- Optional fields (`?`) only where the contract makes them optional.
- Money is whole rupiah (`number`); times are ISO strings from the server.
- One service per API aggregate: `catalog`, `queue`, `auth`, `booking`, `payment`, `ticket`, `account`.
- Depend only on `http` (and `config`) from `AwilixRegistry`.
- Type every call: `http.post<CreateBookingResponse, CreateBookingRequest>('bookings', payload)`.
- Always return `HttpResponse<T>`.
- No transformation (that is a use case), no try/catch: let `HttpError` propagate.
- Registered as `asFunction(Service).singleton()` in `services.registry.ts`; interface added to `AwilixRegistry`.
- `Authorization: Bearer <access token>` when a session exists; `X-Admission-Token` on admission-gated calls
- Every service: `src/core/services/__tests__/{domain}.service.test.ts`, mocking the `http` protocol and asserting
  method, path and payload. No network.
- Coverage threshold 85%.
- ❌ Importing Axios/fetch in a service
- ❌ Transforming data or catching errors in a service
- ❌ Several aggregates in one service file
- ❌ Inline types instead of `@core/entities/`
- ❌ Returning unwrapped data instead of `HttpResponse<T>`

From `.claude/rules/scaffold.md`:

- Services and use cases: `asFunction(Factory).singleton()`
- `AwilixRegistry` (`src/infrastructure/di/registry.types.ts`) is the single source of truth. **Every key in it has a
  `container.register()` call** in one of the three registries or a `di/controllers/` file. Awilix resolves at
  runtime, so TypeScript will not catch a missing registration. Count keys vs registrations after every change.

From `CLAUDE.md`:

- NIKs are shown masked after entry and never logged.
- Errors from the API carry a stable `code`; map it to a translation key, never show raw messages.

## Correctness Properties

- Property 1: `validateAttendee(id, token, body)` issues exactly one `coreHttp.post` to
  `events/{encodeURIComponent(id)}/attendees/validate` with `body` as the same object and
  `headers['X-Admission-Token'] === token`; `get` is not called. **Validates: Requirements 2**
- Property 2: an id with `/`, `?` or spaces never changes the path shape. **Validates: Requirements 2**
- Property 3: any rejection from `coreHttp` reaches the caller as the same object. **Validates: Requirements 2**
- Property 4: for each row of the handler table, the mock answers that status and `code`; 200 bodies have
  `nikMasked === '************' + nik.slice(-4)` and `Date.parse(expiresAt) − now === 300 000`.
  **Validates: Requirements 3**
- Property 5: the 429 answer has `Retry-After: 60` and the client sees `HttpError.data.retryAfter === 60`.
  **Validates: Requirements 3**
- Property 6: no mock answer body contains the request's NIK or full name (checked on every non-200 row and on the 200
  body, where only the last 4 digits appear). **Validates: Requirements 3**
- Property 7: the validate mock never answers 200 without an `X-Admission-Token`, for an unknown event, or under
  `admission_invalid`; under `dukcapil_down` it never answers 200 and `getCategories` still answers 200.
  **Validates: Requirements 4**
- Property 8: two validate successes from one `bookingHandlers` instance return different `validationToken`s.
  **Validates: Requirements 3**
- Property 9: `entities` contain no runtime code (`booking.entity.ts` only `import type` / `export interface|type`).
  **Validates: Requirements 1**

## Error Handling

None in the service: every `HttpError` propagates. What each code becomes is decided in spec 54 (use case) and spec 55
(controller):

| Status / code                                               | Spec 54 outcome                 | User sees (spec 55)                                |
| ----------------------------------------------------------- | ------------------------------- | -------------------------------------------------- |
| 403 `ADMISSION_INVALID`                                     | `admission-invalid`             | back to the waiting room                           |
| 422 `NIK_INVALID`, 422 `VALIDATION_FAILED`                  | `nik-invalid`                   | field error "Nama dan NIK tidak cocok…"            |
| 409 `NIK_SEAT_TAKEN`                                        | `seat-taken`                    | field error + "Gunakan NIK pemegang lain."         |
| 409 `DUPLICATE_NIK`                                         | `duplicate`                     | field error "NIK ini sudah dipakai di tiket lain…" |
| 429 `RATE_LIMITED` / `TOO_MANY_REQUESTS`                    | `rate-limited`                  | field wait message (+ seconds when known)          |
| 503 `DUKCAPIL_UNAVAILABLE`, 5xx, `NETWORK_ERROR`, `TIMEOUT` | `unavailable` (after one retry) | field message + "Periksa lagi"                     |
| 401 `UNAUTHORIZED`, `UNKNOWN_ERROR`, anything else          | rethrown                        | field error from `ERROR_CODE_MAP` + "Periksa lagi" |

Every code above already has an `ERROR_CODE_MAP` entry and both locale strings (`error-codes.ts`); none is added.

## Testing Strategy

- `src/core/services/__tests__/booking.service.test.ts`: `validateAttendee` path, encoding, header, body identity, no
  `get` call, error propagation (mocked `coreHttp`).
- `src/infrastructure/mocks/__tests__/booking.handlers.test.ts` (node env, real HTTP adapter + `BookingService`, as
  today): one `it` per handler-table row (valid, `9999`, `8888`, `7777`, `6666` with header and body, not 16 digits,
  blank name, `fieldIndex` 3, missing header, unknown event, `admission_invalid`, `dukcapil_down`, `error`, `offline`);
  the 200 body masking and `expiresAt`; two tokens differ; Property 6. The 429 header is read with a raw `fetch` to the
  mock URL (the adapter drops headers). The ~600 ms latency is real; keep the cases ≤ 15 so the file stays under ~10 s.
- `src/infrastructure/mocks/__tests__/scenario.test.ts`: `?mock=dukcapil_down` resolves.
- `src/infrastructure/mocks/__tests__/auth.handlers.test.ts`: unchanged and still green after `problemWith` moves.
- Gate: `npm run typecheck && npm run lint && npx vitest --run`; coverage ≥ 85% on the changed files.
