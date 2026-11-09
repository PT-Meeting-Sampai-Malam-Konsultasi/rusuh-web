# Design Document

## Overview

Booking entities, `catalogService.getEvent`, a new one-method `bookingService`, the admission store
(protocol + in-memory adapter) and the MSW handlers for both operations. The token is minimal on purpose: FR-08-W1
fills the store from `claimTurn`; resume after a refresh (NFR-02-W1 / FR-10-W1) is out of scope, so a refreshed tab has
no token and goes back to the waiting room.

## Architecture

```
OrderController ──useQuery──► catalogService.getEvent(id) ──► coreHttp ──► GET {CORE}/events/{id}           (public)
OrderController ──useQuery──► getOrderCategoriesUseCase ──► bookingService.getCategories(id, token)
                                                              └► coreHttp ──► GET {CORE}/events/{id}/categories
                                                                              Authorization: Bearer … (adapter, if a session exists)
                                                                              X-Admission-Token: … (service)
OrderController ──► admissionStore.get(id)    (in memory; FR-08-W1 calls set())
```

| Operation                                          | `x-service`  | Auth                            | Responses                                                  |
| -------------------------------------------------- | ------------ | ------------------------------- | ---------------------------------------------------------- |
| `getEvent` `GET /events/{eventId}`                 | core.booking | none                            | 200 `EventSummary`, 404 `NotFound`                         |
| `getCategories` `GET /events/{eventId}/categories` | core.booking | `bearerAuth` + `admissionToken` | 200 body below, 401 `Unauthorized`, 403 `AdmissionInvalid` |

`getEvent` returns "Public event details (no prices or live stock)". `getCategories` stock is a snapshot at load
(Q-20); the hold re-checks it atomically.

The HTTP adapter adds `Authorization` from `tokenStore` already; it has no admission-token hook, so the service passes
`X-Admission-Token` through `RequestConfig.headers` (the core-service rule: "`X-Admission-Token` on admission-gated
calls"). This keeps the adapter generic and the token out of every other core call.

Files:

| File                                                      | Change                                       |
| --------------------------------------------------------- | -------------------------------------------- |
| `src/core/entities/booking/booking.entity.ts`             | new                                          |
| `src/core/protocols/admission-store.protocol.ts`          | new                                          |
| `src/core/services/catalog.service.ts`                    | add `getEvent`                               |
| `src/core/services/booking.service.ts`                    | new                                          |
| `src/infrastructure/adapters/admission-store.adapter.ts`  | new                                          |
| `src/infrastructure/di/infrastructure.registry.ts`        | register `admissionStore`                    |
| `src/infrastructure/di/services.registry.ts`              | register `bookingService`                    |
| `src/infrastructure/di/registry.types.ts`                 | add `admissionStore`, `bookingService`       |
| `src/infrastructure/di/__tests__/registry.test.ts`        | add both keys to `KEYS`                      |
| `src/infrastructure/mocks/handlers/catalog.handlers.ts`   | add `GET /events/:eventId`                   |
| `src/infrastructure/mocks/handlers/booking.handlers.ts`   | new, `GET /events/:eventId/categories`       |
| `src/infrastructure/mocks/handlers/handlers.ts`           | add `bookingHandlers` to `HANDLER_FACTORIES` |
| `src/infrastructure/mocks/fixtures/categories.fixture.ts` | new                                          |
| `src/infrastructure/mocks/scenario.ts`                    | add `admission_invalid`                      |

## Components and Interfaces

```ts
// src/core/protocols/admission-store.protocol.ts — zero imports
export interface AdmissionStoreProtocol {
  /** The admission token for this event, or null when there is none (never claimed, cleared, or lost on refresh). */
  get(eventId: string): string | null;
  /** Stores the token for the event; null removes it. Called by FR-08-W1 after claimTurn. */
  set(eventId: string, token: string | null): void;
}
```

```ts
// src/infrastructure/adapters/admission-store.adapter.ts
export interface AdmissionStoreOptions {
  /** Returned by get() for any event with no stored token. Only wired when config.apiMock is true. */
  fallbackToken?: string;
}
/** Placeholder the mock API accepts; never a real token. */
export const MOCK_ADMISSION_TOKEN = 'mock-admission-token';
export function createAdmissionStore(options?: AdmissionStoreOptions): AdmissionStoreProtocol;
```

```ts
// src/core/services/catalog.service.ts
export interface CatalogServiceInterface {
  /** `GET /events`: every event with its sale state, cached at the CDN for 5–10 s. */
  listEvents: () => Promise<HttpResponse<ListEventsResponse>>;
  /** `GET /events/{eventId}`: public event details, no prices or live stock. 404 NOT_FOUND for an unknown id. */
  getEvent: (eventId: string) => Promise<HttpResponse<EventSummary>>;
}
export const CatalogService = ({ coreHttp }: Pick<AwilixRegistry, 'coreHttp'>): CatalogServiceInterface;
// getEvent: (eventId) => coreHttp.get<EventSummary>(`events/${encodeURIComponent(eventId)}`)
```

```ts
// src/core/services/booking.service.ts
export const ADMISSION_TOKEN_HEADER = 'X-Admission-Token';

export interface BookingServiceInterface {
  /**
   * `GET /events/{eventId}/categories`: categories, prices, stock snapshot and the order countdown.
   * Needs a live admission token (403 ADMISSION_INVALID otherwise) and a session (401 UNAUTHORIZED).
   */
  getCategories: (eventId: string, admissionToken: string) => Promise<HttpResponse<GetCategoriesResponse>>;
}
export const BookingService = ({ coreHttp }: Pick<AwilixRegistry, 'coreHttp'>): BookingServiceInterface;
// getCategories: (eventId, admissionToken) =>
//   coreHttp.get<GetCategoriesResponse>(`events/${encodeURIComponent(eventId)}/categories`, {
//     headers: { [ADMISSION_TOKEN_HEADER]: admissionToken },
//   })
```

`booking` is the API aggregate for the Detail Ticket page (openapi tag `Booking`); `validateAttendee` and
`createBooking` join this service in FR-15/FR-14.

```ts
// src/infrastructure/di/registry.types.ts (additions)
import type { AdmissionStoreProtocol } from '@core/protocols/admission-store.protocol';
import type { BookingServiceInterface } from '@core/services/booking.service';

export interface AwilixRegistry {
  // infrastructure: values and adapters
  admissionStore: AdmissionStoreProtocol;
  // services
  bookingService: BookingServiceInterface;
  // … existing keys unchanged
}
```

```ts
// src/infrastructure/di/infrastructure.registry.ts (addition; Deps gains nothing new, it already picks 'config')
admissionStore: asFunction(({ config }: Pick<AwilixRegistry, 'config'>) =>
  createAdmissionStore(config.apiMock ? { fallbackToken: MOCK_ADMISSION_TOKEN } : {}),
).singleton(),

// src/infrastructure/di/services.registry.ts (addition)
bookingService: asFunction(BookingService).singleton(),
```

```ts
// src/infrastructure/mocks/handlers/booking.handlers.ts
export function bookingHandlers(context: MockContext): HttpHandler[];

// src/infrastructure/mocks/fixtures/categories.fixture.ts
export function categoriesFixture(locale: 'id' | 'en'): Category[];
```

## Data Models

```ts
// src/core/entities/booking/booking.entity.ts
import type { Money } from '@core/entities/catalog/catalog.entity';

/** No seat numbers: entry by category (T-11). */
export type Seating = 'standing' | 'seated';

/** The label the page shows ("Tersedia", "Hampir habis", "Habis"); a snapshot at load (Q-20). */
export type CategoryAvailability = 'available' | 'almost_gone' | 'sold_out';

export interface Category {
  categoryId: string;
  name: string;
  /** In the request language (ADR-0014). */
  description?: string;
  seating?: Seating;
  entryGate?: string;
  price: Money;
  availability: CategoryAvailability;
  /** Snapshot count; optional, not shown in the HiFi. */
  available?: number;
}

export interface GetCategoriesResponse {
  eventId: string;
  categories: Category[];
  /** Policy maximum per order (N-1). */
  maxTicketsPerOrder: number;
  /** Units reserved for this admission, 1–3 (ADR-0004); the order may not exceed it. */
  reservedUnits: number;
  /** Fixed amount per order, not per ticket (ADR-0010); shown as "Biaya layanan". */
  adminFee: Money;
  /** End of the 5-minute order window. */
  expiresAt: string;
  serverNow: string;
}
```

`EventSummary` (already in `catalog.entity.ts`) is the `getEvent` body; no change.

Mock fixture (from `../rusuh-documentation/analysis/hifi/src/detail.html`):

| categoryId         | name         | seating  | price   | availability (`ok`) | description ID                            | description EN                            |
| ------------------ | ------------ | -------- | ------- | ------------------- | ----------------------------------------- | ----------------------------------------- |
| `cat_festival_a`   | Festival A   | standing | 1250000 | `sold_out`          | Berdiri · paling dekat panggung           | Standing · closest to the stage           |
| `cat_festival_b`   | Festival B   | standing | 850000  | `available`         | Berdiri · di belakang Festival A          | Standing · behind Festival A              |
| `cat_tribun_bawah` | Tribun Bawah | seated   | 650000  | `almost_gone`       | Duduk · bebas pilih kursi di tribun bawah | Seated · any free seat in the lower stand |
| `cat_tribun_atas`  | Tribun Atas  | seated   | 450000  | `available`         | Duduk · bebas pilih kursi di tribun atas  | Seated · any free seat in the upper stand |

Response wrapper: `eventId` from the path, `maxTicketsPerOrder: 3`, `reservedUnits: 3`,
`adminFee: { amount: 10000, currency: 'IDR' }`, `serverNow: now()`, `expiresAt: now() + 5 min`. Locale: `en` when
`Accept-Language` starts with `en`, else `id`.

Handler order for categories: `failure(scenario)` → scenario `admission_invalid` → missing/empty header → unknown event
→ 200. The handler checks presence only, not the value, so tokens from a mocked `claimTurn` (FR-08-W1) also pass.

## Layer Constraints

From `.claude/rules/core-service.md`:

- Pure interfaces with zero imports: `HttpProtocol`, `HttpResponse<T>`, `HttpError`, `StorageProtocol`,
  `AnalyticsProtocol`, `QueueStreamProtocol` (SSE, ADR-0015).
- Generic types only (`data: T`), never library types.
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
- The only place external libraries are imported (Axios, the SSE client, storage, analytics SDK).
- Receive config and other deps through the factory parameters; never import `config.ts` or another adapter directly.
- `Authorization: Bearer <access token>` when a session exists; `X-Admission-Token` on admission-gated calls
- Export only the protocol-typed factory, never the library instance.
- Every service: `src/core/services/__tests__/{domain}.service.test.ts`, mocking the `http` protocol and asserting
  method, path and payload. No network.
- Every adapter: tests for header injection and error normalisation.
- Coverage threshold 85%.

From `.claude/rules/scaffold.md` (registration):

- Adapters: `asFunction(createAdapter).singleton()`
- Services and use cases: `asFunction(Factory).singleton()`
- `AwilixRegistry` (`src/infrastructure/di/registry.types.ts`) is the single source of truth. **Every key in it has a
  `container.register()` call** in one of the four registries. Awilix resolves at runtime, so TypeScript will not catch a
  missing registration. Count keys vs registrations after every change.

From `CLAUDE.md`: "No secrets in `NEXT_PUBLIC_*`; only `src/infrastructure/config.ts` reads `process.env`." The adapter
reads `config.apiMock` only through the registry factory parameter.

## Correctness Properties

- Property 1: `getEvent(id)` issues exactly one `GET events/{encodeURIComponent(id)}` on `coreHttp` with no extra
  headers. **Validates: Requirements 2**
- Property 2: `getCategories(id, token)` issues exactly one `GET events/{encodeURIComponent(id)}/categories` with
  `headers['X-Admission-Token'] === token`. **Validates: Requirements 2**
- Property 3: an id with `/`, `?` or spaces never changes the path shape (it is encoded). **Validates: Requirements 2**
- Property 4: any `HttpError` from `coreHttp` reaches the caller unchanged (same object). **Validates: Requirements 2**
- Property 5: `set(a, t)` then `get(a) === t`; `get(b) === null` for another event; `set(a, null)` then
  `get(a) === null` (no fallback) or `get(a) === fallbackToken` (fallback). **Validates: Requirements 3**
- Property 6: two `createAdmissionStore()` calls never share state; the registered store is one singleton.
  **Validates: Requirements 3**
- Property 7: the categories mock never returns 200 without an `X-Admission-Token`. **Validates: Requirements 4**
- Property 8: the categories mock `expiresAt − serverNow` is exactly 300 000 ms. **Validates: Requirements 4**
- Property 9: the four category descriptions differ between `Accept-Language: id` and `en`; names do not.
  **Validates: Requirements 4**

## Error Handling

None in the services: every `HttpError` propagates. What each code becomes is decided upstream:

| Operation       | Status / code                                                                                  | Decided in      | Outcome                                                    |
| --------------- | ---------------------------------------------------------------------------------------------- | --------------- | ---------------------------------------------------------- |
| `getEvent`      | 404 `NOT_FOUND`                                                                                | controller (14) | "Event tidak ditemukan" state                              |
| `getCategories` | 403 `ADMISSION_INVALID`                                                                        | use case (13)   | `{ kind: 'admission-invalid' }` → back to the waiting room |
| `getCategories` | 401 `UNAUTHORIZED`                                                                             | controller (14) | generic error state for now (login sheet is NFR-07-W2)     |
| both            | `NETWORK_ERROR`, `TIMEOUT`, `INTERNAL_ERROR`, `RATE_LIMITED`, `UNKNOWN_ERROR`, `HTTP_<status>` | controller (14) | inline error + "Coba lagi"                                 |

The admission store never throws.

## Testing Strategy

- `src/core/services/__tests__/catalog.service.test.ts`: add `getEvent` (path, encoding, error propagation).
- `src/core/services/__tests__/booking.service.test.ts`: path, encoding, header, error propagation; mocked `coreHttp`.
- `src/infrastructure/adapters/__tests__/admission-store.adapter.test.ts`: get/set/clear, per-event isolation,
  fallback on and off, two instances independent.
- `src/infrastructure/mocks/__tests__/catalog.handlers.test.ts`: `getEvent` known id, unknown id 404, `empty` 404,
  `error` / `offline`.
- `src/infrastructure/mocks/__tests__/booking.handlers.test.ts` (node env, real HTTP adapter + `BookingService`, like the
  catalog handler test): 200 with the four categories, ID vs EN descriptions, `expiresAt`, missing header 403, unknown
  event 403, `admission_invalid` 403, `sold_out`, `error` 503, `offline` `NETWORK_ERROR`.
- `src/infrastructure/mocks/__tests__/scenario.test.ts`: `admission_invalid` resolves from the URL.
- `src/infrastructure/di/__tests__/registry.test.ts`: `admissionStore` and `bookingService` in `KEYS`; `admissionStore`
  resolves as a singleton.
