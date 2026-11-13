# Design Document

## Overview

Four additions on the booking aggregate (specs 12, 53):

1. v1 entity types in `booking.entity.ts`: the widened `BookingStatus`, `Attendee`, the new optional `Booking` fields and
   the create / payment-entry / active-bookings shapes.
2. `bookingService.createBooking`, `enterPayment`, `getActiveBooking`, the same shape as `validateAttendee` (tokens and
   keys as parameters, headers through `RequestConfig.headers`).
3. `src/utils/random-uuid.ts`: the adapter's UUID v4 generator, moved so the controller (spec 73) can make the
   `Idempotency-Key` without importing infrastructure. The adapter keeps `randomRequestId` as an alias.
4. An in-memory mock booking store shared by the booking handlers, three new handlers, a store-aware `getBooking`, and
   three scenarios (`nik_seat_taken`, `category_sold_out`, `payment_busy`).

No new DI key: `bookingService` is already `asFunction(BookingService).singleton()`; its interface gains three methods.

**v1 flow, not the pre-v1 one.** `customer-journey.md` G8 still says the booking is created HELD with a 10-minute
deadline. `openapi.yaml` (BREAKING note on `createBooking`) and LLD-02 §3 / §6 (D5, D8) say v1 creates SELECTION and the
stock hold happens at `enterPayment` (PAYMENT_PENDING, 10 minutes). The contract and LLD-02 are the later decision; this
spec follows them and keeps `HELD` only as a type member for old records.

## Architecture

```
holdBookingUseCase (spec 72)
  ├─ bookingService.createBooking(admissionToken, idempotencyKey, body)
  │     └► coreHttp.post ──► POST {CORE}/core/bookings
  │                            Authorization: Bearer …        (adapter)
  │                            X-Admission-Token: …           (service)
  │                            Idempotency-Key: <uuid>        (service)
  │                            { eventId, tickets: [{ categoryId, validationToken }, …] }   201 Booking (SELECTION)
  ├─ bookingService.enterPayment(bookingId, admissionToken)
  │     └► coreHttp.post ──► POST {CORE}/core/bookings/{bookingId}/payment                  200 EnterPaymentResponse
  └─ bookingService.getActiveBooking()
        └► coreHttp.get  ──► GET  {CORE}/core/bookings/active                               200 { items: Booking[] }
```

| Operation                                         | Auth                                                    | Responses                                                                                                                                                                                                                         |
| ------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createBooking` `POST /core/bookings`             | bearer + admission + `Idempotency-Key` (required, uuid) | 201 `Booking`; 403 `ADMISSION_INVALID`; 409 `NIK_SEAT_TAKEN`, `DUPLICATE_NIK`, `ATTENDEE_NOT_VALIDATED`, `QUANTITY_OVER_RESERVATION`, `ACCOUNT_HAS_ACTIVE_BOOKING`, `CATEGORY_SOLD_OUT` (+ `categoryId`); 422 `VALIDATION_FAILED` |
| `enterPayment` `POST /core/bookings/{id}/payment` | bearer + admission                                      | 200 `{ bookingId, snapToken, paymentExpiresAt, redirectUrl?, serverNow }`; 403; 404 `NOT_FOUND`; 409 `BOOKING_NOT_HELD`, `CATEGORY_SOLD_OUT` (+ `categoryId`), `NIK_SEAT_TAKEN` (+ `nikMasked`); 503 `INTERNAL_ERROR` (retryable) |
| `getActiveBooking` `GET /core/bookings/active`    | bearer                                                  | 200 `{ items: Booking[] }` (empty if none)                                                                                                                                                                                        |
| `getBooking` `GET /core/bookings/{id}` (existing) | bearer                                                  | 200 `Booking`; 404                                                                                                                                                                                                                |

All three need a session; a 401 is refreshed once by the adapter, then rejected. `enterPayment` is idempotent while
PAYMENT_PENDING (returns the live Snap token), so FR-20-W1 calls it again on the payment page.

Files:

| File                                                                              | Change                                                                                                                                                              |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/core/entities/booking/booking.entity.ts`                                     | widen `BookingStatus`; add `Attendee`, `CreateBookingTicket`, `CreateBookingRequest`, `EnterPaymentResponse`, `ActiveBookingsResponse`; 3 optional `Booking` fields |
| `src/core/services/booking.service.ts`                                            | add `IDEMPOTENCY_KEY_HEADER`, `createBooking`, `enterPayment`, `getActiveBooking`                                                                                   |
| `src/core/services/__tests__/booking.service.test.ts`                             | add cases                                                                                                                                                           |
| `src/utils/random-uuid.ts`                                                        | new (`randomUuid`, moved)                                                                                                                                           |
| `src/utils/__tests__/random-uuid.test.ts`                                         | new                                                                                                                                                                 |
| `src/infrastructure/adapters/http.adapter.ts`                                     | import `randomUuid`; `export const randomRequestId = randomUuid`                                                                                                    |
| `src/infrastructure/mocks/handlers/mock-booking-store.ts`                         | new                                                                                                                                                                 |
| `src/infrastructure/mocks/handlers/shared.ts`                                     | `bookingStore` on `MockHandlerContext`                                                                                                                              |
| `src/infrastructure/mocks/handlers/handlers.ts`                                   | create the store next to `queueState`                                                                                                                               |
| `src/infrastructure/mocks/handlers/booking.handlers.ts`                           | remember attendees; 3 handlers; store-aware `getBooking`; `MOCK_ADMIN_FEE`                                                                                          |
| `src/infrastructure/mocks/scenario.ts`                                            | 3 scenarios                                                                                                                                                         |
| `src/infrastructure/mocks/__tests__/booking.handlers.test.ts`, `scenario.test.ts` | add cases                                                                                                                                                           |

## Components and Interfaces

```ts
// src/core/services/booking.service.ts (additions)
import type {
  ActiveBookingsResponse,
  Booking,
  CreateBookingRequest,
  EnterPaymentResponse,
  // …existing imports
} from '@core/entities/booking/booking.entity';

export const ADMISSION_TOKEN_HEADER = 'X-Admission-Token'; // unchanged
/** createBooking: a client UUID; the same key returns the same booking for 24 h (openapi IdempotencyKey). */
export const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key';

export interface BookingServiceInterface {
  // …getCategories, getBooking, listMyTickets, downloadTickets, validateAttendee unchanged
  /**
   * `POST /core/bookings`: a SELECTION booking (5 min, D5) from one validated attendee per ticket. No stock hold yet.
   * 403 ADMISSION_INVALID; 409 NIK_SEAT_TAKEN, DUPLICATE_NIK, ATTENDEE_NOT_VALIDATED, QUANTITY_OVER_RESERVATION,
   * ACCOUNT_HAS_ACTIVE_BOOKING, CATEGORY_SOLD_OUT (+ categoryId); 422 VALIDATION_FAILED.
   */
  createBooking: (
    admissionToken: string,
    idempotencyKey: string,
    body: CreateBookingRequest,
  ) => Promise<HttpResponse<Booking>>;
  /**
   * `POST /core/bookings/{bookingId}/payment`: the atomic stock + NIK hold, SELECTION → PAYMENT_PENDING (10 min), and the
   * first Snap token. Idempotent while PAYMENT_PENDING. 403; 404; 409 BOOKING_NOT_HELD, CATEGORY_SOLD_OUT (+ categoryId),
   * NIK_SEAT_TAKEN (+ nikMasked); 503 retryable.
   */
  enterPayment: (bookingId: string, admissionToken: string) => Promise<HttpResponse<EnterPaymentResponse>>;
  /** `GET /core/bookings/active`: this account's SELECTION / PAYMENT_PENDING bookings, at most one per event. */
  getActiveBooking: () => Promise<HttpResponse<ActiveBookingsResponse>>;
}

export const BookingService = ({ coreHttp }: Pick<AwilixRegistry, 'coreHttp'>): BookingServiceInterface => ({
  // …existing methods unchanged
  createBooking: (admissionToken, idempotencyKey, body) =>
    coreHttp.post<Booking, CreateBookingRequest>('core/bookings', body, {
      headers: { [ADMISSION_TOKEN_HEADER]: admissionToken, [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
    }),
  enterPayment: (bookingId, admissionToken) =>
    coreHttp.post<EnterPaymentResponse>(`core/bookings/${encodeURIComponent(bookingId)}/payment`, undefined, {
      headers: { [ADMISSION_TOKEN_HEADER]: admissionToken },
    }),
  getActiveBooking: () => coreHttp.get<ActiveBookingsResponse>('core/bookings/active'),
});
```

Compile check: `HttpProtocol.post<T, B = unknown>(path, body?: B, config?)` accepts `undefined` with `B` defaulting to
`unknown`. `AwilixRegistry.bookingService: BookingServiceInterface` widens by three methods; typed fakes of the full
interface (none today: the use-case tests use plain partial objects cast through `as never`) gain `vi.fn()`s only if
`tsc` asks.

```ts
// src/utils/random-uuid.ts
/** UUID v4: `crypto.randomUUID` where available (secure contexts), else built from `getRandomValues`. */
export function randomUuid(): string; // body moved verbatim from http.adapter.ts randomRequestId

// src/infrastructure/adapters/http.adapter.ts
import { randomUuid } from '@utils/random-uuid';
/** Kept for the adapter tests and callers; same function. */
export const randomRequestId = randomUuid;
```

`@utils` imports from infrastructure already exist (`STORAGE_KEYS`, `singleFlight`), so the direction is allowed.

```ts
// src/infrastructure/mocks/handlers/mock-booking-store.ts
import type { Booking } from '@core/entities/booking/booking.entity';

/** What a validation token stands for in the mock: never the full NIK. */
export interface MockAttendee {
  fullName: string;
  /** "3174 •••• •••• 0004" (first 4 + last 4, ADR-0024), as in Booking.attendees. */
  nikMasked: string;
}

export interface StoredBooking {
  booking: Booking;
  idempotencyKey: string;
  /** Set at the first successful payment entry; repeated entries answer the same one. */
  snapToken: string | null;
  /** Payment-entry calls so far (payment_busy fails only the first). */
  paymentEntries: number;
}

export interface MockBookingStore {
  rememberAttendee: (validationToken: string, attendee: MockAttendee) => void;
  attendee: (validationToken: string) => MockAttendee | undefined;
  byKey: (idempotencyKey: string) => StoredBooking | undefined;
  get: (bookingId: string) => StoredBooking | undefined;
  /** Adds or replaces by bookingId. */
  save: (entry: StoredBooking) => void;
  /** Live SELECTION / PAYMENT_PENDING entries for an event, after marking expired ones EXPIRED (at `now`). */
  active: (now: Date, eventId?: string) => StoredBooking[];
  /** Next order number: RSH-26-9xxxxx. */
  nextOrderCode: () => string;
}

/** Closure state per createHandlers call (like createMockQueueState): a page reload starts empty. */
export function createMockBookingStore(): MockBookingStore;
```

```ts
// src/infrastructure/mocks/handlers/shared.ts
export interface MockHandlerContext extends MockContext {
  queueState: MockQueueState;
  bookingStore: MockBookingStore; // ← new: the payment handlers of FR-20-W1 read the same bookings
}

// src/infrastructure/mocks/handlers/handlers.ts
const shared: MockHandlerContext = {
  ...context,
  queueState: createMockQueueState(),
  bookingStore: createMockBookingStore(),
};
```

```ts
// src/infrastructure/mocks/handlers/booking.handlers.ts (additions)
/** Fixed per order (ADR-0010): the categories answer and the created booking use the same amount. */
export const MOCK_ADMIN_FEE = 10000;
const SELECTION_MS = 5 * 60_000; // D5
const PAYMENT_MS = 10 * 60_000; // ADR-0005
const MOCK_RESERVED_UNITS = 3; // the categories answer's reservedUnits

// Handler order inside bookingHandlers (MSW: first match wins):
//   categories, tickets, GET core/bookings/active, GET core/bookings/:bookingId, tickets.pdf,
//   POST attendees/validate, POST core/bookings, POST core/bookings/:bookingId/payment
```

The categories handler uses `MOCK_ADMIN_FEE` instead of the literal `10000` (same value).

```ts
// src/infrastructure/mocks/scenario.ts (additions, after 'short_window')
  /** FR-16: payment entry finds a holder's NIK already holds its seats: 409 NIK_SEAT_TAKEN with that nikMasked. */
  'nik_seat_taken',
  /** FR-16: the hold finds the first ticket's category sold out: 409 CATEGORY_SOLD_OUT with its categoryId. */
  'category_sold_out',
  /** FR-16: the first payment entry of each booking answers 503 PAYMENT_PROVIDER_BUSY; a retry succeeds. */
  'payment_busy',
```

## Data Models

```ts
// src/core/entities/booking/booking.entity.ts (changes)

/**
 * v1 (D5): SELECTION (5 min from create) → PAYMENT_PENDING (10 min from payment entry) → PAID; or EXPIRED / CANCELLED.
 * HELD is the pre-v1 name: core v1 never produces it, old records may still carry it. Only PAID bookings have tickets.
 */
export type BookingStatus = 'SELECTION' | 'PAYMENT_PENDING' | 'HELD' | 'PAID' | 'EXPIRED' | 'CANCELLED';

/** One ticket's holder as the booking stores it (ADR-0007, ADR-0024). The full NIK never reaches the web. */
export interface Attendee {
  categoryId: string;
  categoryName: string;
  fullName: string;
  /** First 4 and last 4 digits: "3174 •••• •••• 0004". */
  nikMasked: string;
}

export interface Booking {
  // …existing fields unchanged
  /** One per ticket, in request order. */
  attendees?: Attendee[];
  /** Deadline of the current step (end of SELECTION or of PAYMENT_PENDING); null once PAID or EXPIRED. */
  expiresAt?: string | null;
  /** A payment arrived after expiry (ADR-0009). */
  refundRequired?: boolean;
}

/** One ticket of createBooking: its category and its holder's validation token (spec 53). */
export interface CreateBookingTicket {
  categoryId: string;
  /** From validateAttendee; carries the attendee name and NIK (opaque to the web, never logged). */
  validationToken: string;
}

/** createBooking body: 1–3 tickets, one entry per ticket (N-1, ADR-0024). */
export interface CreateBookingRequest {
  eventId: string;
  tickets: CreateBookingTicket[];
}

/** enterPayment 200: the booking is PAYMENT_PENDING; the Snap token is for the payment page (FR-20-W1). */
export interface EnterPaymentResponse {
  bookingId: string;
  snapToken: string;
  /** End of the 10-minute payment window (server time). */
  paymentExpiresAt: string;
  redirectUrl?: string | null;
  serverNow: string;
}

/** getActiveBooking 200. */
export interface ActiveBookingsResponse {
  items: Booking[];
}
```

`PriceBreakdown.tax` (optional in the contract, "only if Finance requires PPN") is not added: nothing reads it yet.

Mock `POST /core/bookings` (first match wins):

| #   | Condition                                                                                                            | Answer                                                              |
| --- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 1   | `failure(scenario)`                                                                                                  | network error / 503 `INTERNAL_ERROR` / continue after 3 s           |
| 2   | no bearer                                                                                                            | 401 `UNAUTHORIZED`                                                  |
| 3   | scenario `admission_invalid`, no `X-Admission-Token`, `eventId` not in `eventsFixture(now)`                          | 403 `ADMISSION_INVALID`                                             |
| 4   | no `Idempotency-Key` header                                                                                          | 422 `VALIDATION_FAILED`                                             |
| 5   | `byKey(key)` exists                                                                                                  | 201 the stored booking (replay)                                     |
| 6   | body not JSON, `tickets` not an array of 1–3 `{ categoryId: string, validationToken: string }`, unknown `categoryId` | 422 `VALIDATION_FAILED`                                             |
| 7   | `tickets.length > MOCK_RESERVED_UNITS` (unreachable after row 6 while both are 3; kept for when they differ)         | 409 `QUANTITY_OVER_RESERVATION` + first `categoryId`                |
| 8   | a token not in `attendee(token)`                                                                                     | 409 `ATTENDEE_NOT_VALIDATED`                                        |
| 9   | a token used twice in the body                                                                                       | 409 `DUPLICATE_NIK`                                                 |
| 10  | a ticket's fixture category is `sold_out`, or scenario `category_sold_out`                                           | 409 `CATEGORY_SOLD_OUT` + that (or the first ticket's) `categoryId` |
| 11  | `active(now, eventId)` is not empty                                                                                  | 409 `ACCOUNT_HAS_ACTIVE_BOOKING`                                    |
| 12  | otherwise                                                                                                            | save + 201 SELECTION booking (below)                                |

Created booking: `bookingId` `bk_mock_<n>`; `eventId`; `status: 'SELECTION'`; `price.lines` one per category in
first-appearance order (`name`, `quantity`, `unitPrice` from `categoriesFixture('id')`, `lineTotal = unitPrice ×
quantity`); `ticketSubtotal` = Σ lines; `adminFee` = `MOCK_ADMIN_FEE` (once); `total` = subtotal + fee; `orderCode`
from `nextOrderCode()`; `attendees` one per ticket in request order (`categoryId`, `categoryName`, the stored `fullName`
and `nikMasked`); `expiresAt` = now + 5 min; `refundRequired: false`; `tickets: []`; `paidAt: null`;
`paymentMethod: null`; `createdAt` = `serverNow` = now.

Mock `POST /core/bookings/:bookingId/payment`:

| #   | Condition                                                             | Answer                                                                                                                                                      |
| --- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `failure(scenario)`                                                   | as above                                                                                                                                                    |
| 2   | no bearer                                                             | 401                                                                                                                                                         |
| 3   | scenario `admission_invalid`, no `X-Admission-Token`                  | 403 `ADMISSION_INVALID`                                                                                                                                     |
| 4   | `get(id)` missing                                                     | 404 `NOT_FOUND`                                                                                                                                             |
| 5   | `paymentEntries += 1` (save)                                          | —                                                                                                                                                           |
| 6   | status PAYMENT_PENDING and `expiresAt` in the future                  | 200 same `snapToken`, `paymentExpiresAt` = stored `expiresAt`                                                                                               |
| 7   | status SELECTION past `expiresAt` → mark EXPIRED; or any other status | 409 `BOOKING_NOT_HELD`                                                                                                                                      |
| 8   | scenario `payment_busy` and `paymentEntries === 1`                    | 503 `PAYMENT_PROVIDER_BUSY` (booking stays SELECTION)                                                                                                       |
| 9   | scenario `nik_seat_taken`                                             | 409 `NIK_SEAT_TAKEN` + `nikMasked` of the last attendee (booking stays SELECTION)                                                                           |
| 10  | otherwise                                                             | PAYMENT_PENDING, `expiresAt` = now + 10 min, `snapToken` `mock-snap-<id>-1`; 200 `{ bookingId, snapToken, paymentExpiresAt, redirectUrl: null, serverNow }` |

`GET /core/bookings/active`: `failure`; 401; else 200 `{ items: active(now).map((e) => ({ ...e.booking, serverNow })) }`.
`GET /core/bookings/:bookingId`: store first (with `serverNow` = now), then the fixtures, else 404 (unchanged).

Mock QA paths (sample NIKs from spec 53, e.g. `3174055203960004`, `3201125203960001`):

| URL                        | What happens on "Lanjut ke pembayaran"                                                |
| -------------------------- | ------------------------------------------------------------------------------------- |
| `/order?event=evt_samudra` | SELECTION → PAYMENT_PENDING → `/payment?booking=bk_mock_1` (not found until FR-20-W1) |
| `…&mock=category_sold_out` | 409 at create: the first category flagged, categories refetched                       |
| `…&mock=nik_seat_taken`    | 409 at payment entry: the last holder's field shows the seat-taken error              |
| `…&mock=payment_busy`      | 503 popup with "Coba lagi"; the retry repeats only the payment entry and succeeds     |

Problem titles (Indonesian, as the contract examples; never a NIK or a name): `ATTENDEE_NOT_VALIDATED` "Data pemegang
tiket belum divalidasi", `QUANTITY_OVER_RESERVATION` "Jumlah tiket melebihi jatah Anda", `ACCOUNT_HAS_ACTIVE_BOOKING`
"Anda masih punya pesanan aktif", `CATEGORY_SOLD_OUT` "Kategori sudah habis", `DUPLICATE_NIK` "NIK yang sama dipakai
lebih dari sekali", `NIK_SEAT_TAKEN` "NIK sudah terdaftar untuk event ini", `BOOKING_NOT_HELD` "Pesanan tidak lagi aktif",
`PAYMENT_PROVIDER_BUSY` "Layanan pembayaran sedang sibuk", `NOT_FOUND` "Pesanan tidak ditemukan".

**Differences from the contract, on purpose (mock only):** the mock has no accounts, so "one active booking per account
per event" is "one per event" in this tab; `PAYMENT_PROVIDER_BUSY` is the contract's code for `createPaymentAttempt`,
while `enterPayment` documents 503 `INTERNAL_ERROR`; the client treats both as retryable (spec 72), and the scenario uses
the more specific code so the popup copy ("Pembayaran sedang padat") is visible.

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
- Export only the protocol-typed factory, never the library instance.
- Every service: `src/core/services/__tests__/{domain}.service.test.ts`, mocking the `http` protocol and asserting
  method, path and payload. No network.
- Every adapter: tests for header injection and error normalisation.
- Coverage threshold 85%.
- ❌ Importing Axios/fetch in a service
- ❌ Transforming data or catching errors in a service
- ❌ Several aggregates in one service file
- ❌ Inline types instead of `@core/entities/`
- ❌ Returning unwrapped data instead of `HttpResponse<T>`

Note: the rule's example names a `CreateBookingResponse`; the contract's 201 body is the shared `Booking` schema, so the
call is typed `post<Booking, CreateBookingRequest>` (no alias type for the same shape). `enterPayment` stays in the
booking service: the contract tags it `Booking` and `x-service: core.booking` (the `payment` service is the payment
module's own API, FR-20+).

From `.claude/rules/scaffold.md`:

- Services and use cases: `asFunction(Factory).singleton()`
- `AwilixRegistry` (`src/infrastructure/di/registry.types.ts`) is the single source of truth. **Every key in it has a
  `container.register()` call** in one of the three registries or a `di/controllers/` file. Awilix resolves at
  runtime, so TypeScript will not catch a missing registration. Count keys vs registrations after every change.

From `CLAUDE.md`:

- NIKs are shown masked after entry and never logged.
- Errors from the API carry a stable `code`; map it to a translation key, never show raw messages.

## Correctness Properties

- Property 1: `createBooking(token, key, body)` issues exactly one `coreHttp.post` to `core/bookings` with `body` as the
  same object (`toBe`) and headers exactly `{ 'X-Admission-Token': token, 'Idempotency-Key': key }`.
  **Validates: Requirements 2**
- Property 2: `enterPayment(id, token)` posts to `core/bookings/{encodeURIComponent(id)}/payment` with an `undefined`
  body and only the admission header; an id with `/`, `?` or spaces keeps the path shape. **Validates: Requirements 3**
- Property 3: `getActiveBooking()` issues one `coreHttp.get('core/bookings/active')` with no config.
  **Validates: Requirements 3**
- Property 4: any rejection from `coreHttp` reaches the caller as the same object, for all three calls.
  **Validates: Requirements 2, 3**
- Property 5: `randomUuid()` matches the v4 pattern with and without `crypto.randomUUID`; `randomRequestId ===
randomUuid`. **Validates: Requirements 4**
- Property 6: for each row of both handler tables the mock answers that status and `code`; `CATEGORY_SOLD_OUT` and
  `QUANTITY_OVER_RESERVATION` carry `categoryId`; the `nik_seat_taken` 409 carries `nikMasked` matching `^\d{4} •••• ••••
\d{4}$`. **Validates: Requirements 5**
- Property 7: for 1, 2 and 3 tickets the created booking's `price.adminFee.amount === MOCK_ADMIN_FEE` and `total ===
ticketSubtotal + MOCK_ADMIN_FEE` (never × tickets); `attendees.length === tickets.length` in request order.
  **Validates: Requirements 5**
- Property 8: the same `Idempotency-Key` twice returns the same `bookingId` and the store holds one booking; a second key
  for the same event while the first is live answers 409 `ACCOUNT_HAS_ACTIVE_BOOKING`, and `getActiveBooking` then lists
  exactly that booking. **Validates: Requirements 5**
- Property 9: payment entry moves SELECTION → PAYMENT_PENDING with `paymentExpiresAt − serverNow === 600 000 ms`; a repeat
  returns the same `snapToken` and deadline; `getBooking(id)` afterwards returns `status: 'PAYMENT_PENDING'`.
  **Validates: Requirements 5**
- Property 10: under `payment_busy` the first entry answers 503 and the second succeeds for the same booking; a SELECTION
  booking past its `expiresAt` (advance the mock clock 5 min + 1 s) answers 409 `BOOKING_NOT_HELD` and is no longer
  listed as active. **Validates: Requirements 5**
- Property 11: no problem body and no booking body contains a request NIK in full (only `nikMasked`).
  **Validates: Requirements 5**
- Property 12: `booking.entity.ts` contains only `import type` and `export interface|type`. **Validates: Requirements 1**

## Error Handling

None in the service: every `HttpError` propagates. What each code becomes is decided in spec 72 (use case) and spec 73
(controller):

| Call    | Status / code                                                                                      | Spec 72 outcome                                      |
| ------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| create  | 403 `ADMISSION_INVALID`                                                                            | `admission-invalid`                                  |
| create  | 409 `NIK_SEAT_TAKEN`, `DUPLICATE_NIK`                                                              | `nik-conflict` (no slot info: `slotIndexes: []`)     |
| create  | 409 `ATTENDEE_NOT_VALIDATED`                                                                       | `attendees-stale`                                    |
| create  | 409 `QUANTITY_OVER_RESERVATION`                                                                    | `over-reservation` (+ `categoryId`)                  |
| create  | 409 `CATEGORY_SOLD_OUT`                                                                            | `sold-out` (+ `categoryId`)                          |
| create  | 409 `ACCOUNT_HAS_ACTIVE_BOOKING`                                                                   | recovery through `getActiveBooking`                  |
| payment | 409 `BOOKING_NOT_HELD`, 404 `NOT_FOUND`                                                            | `not-held`                                           |
| payment | 409 `CATEGORY_SOLD_OUT` / `NIK_SEAT_TAKEN`                                                         | `sold-out` / `nik-conflict` (slots from `nikMasked`) |
| any     | 401 `UNAUTHORIZED` (after the adapter's refresh)                                                   | `unauthorized`                                       |
| any     | 5xx (`INTERNAL_ERROR`, `PAYMENT_PROVIDER_BUSY`, `SERVICE_UNAVAILABLE`), `NETWORK_ERROR`, `TIMEOUT` | `retryable`                                          |
| any     | 422 `VALIDATION_FAILED`, `UNKNOWN_ERROR`, other                                                    | rethrown                                             |

Every code above already has an `ERROR_CODE_MAP` entry and both locale strings (`src/utils/constants/error-codes.ts`);
none is added.

## Testing Strategy

- `src/core/services/__tests__/booking.service.test.ts`: Properties 1–4 with a mocked `coreHttp` (`get`, `post` as
  `vi.fn()`), `toBe` identity for the body and the rejection.
- `src/utils/__tests__/random-uuid.test.ts`: Property 5 (stub `crypto.randomUUID` to `undefined` with `vi.stubGlobal` or
  `vi.spyOn` for the fallback branch). `http.adapter.test.ts` unchanged and green.
- `src/infrastructure/mocks/__tests__/booking.handlers.test.ts` (node env, real HTTP adapter + `BookingService` through
  `createHandlers`, as today): a helper that validates N sample NIKs to get real tokens, then one `it` per row of both
  tables, Properties 6–11, the active handler not shadowed by `:bookingId`, store-first `getBooking`. The mock clock is
  the context's `now`; advance it with a mutable `let now`. Keep the validate latency in mind (≈ 600 ms per token):
  reuse tokens within a test, ≤ 20 validations in the file.
- `src/infrastructure/mocks/__tests__/scenario.test.ts`: the three scenarios resolve from `?mock=`.
- Gate: `npm run typecheck && npm run lint && npx vitest --run`; coverage ≥ 85% on the changed files.
