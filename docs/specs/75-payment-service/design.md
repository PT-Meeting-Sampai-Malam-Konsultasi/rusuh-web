# Design Document

## Overview

Five additions:

1. **Entities** `src/core/entities/payment/payment.entity.ts`: `PaymentStatus`, `SnapTransaction`, `PaymentView`,
   `StartSnapPaymentRequest`, `PaymentStatusResponse`. Booking types (`PaymentMethod`, `BookingStatus`, `Attendee`,
   `PriceBreakdown`) are imported from `booking.entity.ts`, not copied.
2. **`paymentService`** (`src/core/services/payment.service.ts`): `getPaymentPage`, `startSnap`, `getPaymentStatus` on
   `coreHttp` (same host as core; `NEXT_PUBLIC_CORE_API_URL` ends in `/v1`, so the paths are `payment/payments/…`, as
   `bookingService` uses `core/…`).
3. **`SnapProtocol`** + `createSnapAdapter` / `createMockSnap` (`src/infrastructure/adapters/snap.adapter.ts`), the
   Turnstile adapter's lazy-script pattern. New client error code `SNAP_UNAVAILABLE`.
4. **Page-scoped DI**: `snap` registered in `src/infrastructure/di/controllers/payment.ts`, like `qrEncoder` in
   `ticket-detail.ts`, so the adapter ships only with the payment page. (Spec 77 adds the controller registration to the
   same file, as its first `register` call.)
5. **Mocks**: Snap attempts on the booking store, `payment.handlers.ts`, five scenarios, `readMockScenario()`.

**Why `di/controllers/payment.ts` and not `infrastructure.registry.ts`.** The brief suggested the infrastructure
registry. `.claude/rules/scaffold.md` says "a controller's libraries (React Hook Form, Zod, Snap…) must ship only with
its own page", and `qrEncoder` is the precedent. The adapter has no npm dependency, so the byte cost is small either way,
but the page-scoped file also keeps the mock-scenario import out of every page. `payBookingUseCase` (spec 76) is
registered in `services.registry.ts` and depends on `snap`: Awilix resolves dependencies when the use case is first
resolved, which only the payment controller does, after the shell's import registered `snap`.

**No `method`, ever.** `startSnapPayment` accepts an optional `method`; with none, "the customer picks on the Snap page"
(openapi description, ADR-0008, H-3). The service has no parameter for it.

**Server and auth.** The contract lists `servers: https://pay.rusuh.id/api/v1` and `security: paySession | bearerAuth`.
The web uses `bearerAuth` on the core host (`coreHttp` adds `Authorization`); `paySession`, `csrfToken` and the handoff
are mobile only. A `csrfToken` in the view is ignored.

**Supersedes a note of spec 73.** Spec 73 assumed the payment page would call `enterPayment` again for the Snap token.
The payment module's own `getPaymentPage` returns the live attempt (`currentSnap`) and `startSnapPayment` creates one,
both with the bearer only, so the payment page needs neither `enterPayment` nor the admission token.

## Architecture

```
payBookingUseCase (spec 76)
  ├─ paymentService.getPaymentPage(id)    GET  {CORE}/payment/payments/{id}          200 PaymentView · 401 · 404 · 409 BOOKING_NOT_HELD
  ├─ paymentService.startSnap(id, key)    POST {CORE}/payment/payments/{id}/snap     201 SnapTransaction · 401 · 404 · 409 BOOKING_NOT_HELD
  │                                            Idempotency-Key: <uuid>, no body           · 422 VALIDATION_FAILED · 503 PAYMENT_PROVIDER_BUSY
  ├─ paymentService.getPaymentStatus(id)  GET  {CORE}/payment/payments/{id}/status   200 { bookingStatus, paymentStatus?, returnUrl?, serverNow } · 401 · 404
  └─ snap.pay(snapToken)                  window.snap.pay(token, { language, onSuccess, onPending, onError, onClose })
                                               snap.js injected once: <script async src={midtransSnapUrl} data-client-key={midtransClientKey}>
```

| Operation          | Documented responses                                                       | Also possible (adapter / gateway)                                                            |
| ------------------ | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `getPaymentPage`   | 200 `PaymentView`; 401 `UNAUTHORIZED`; 409 `BOOKING_NOT_HELD`              | 404 `NOT_FOUND` (unknown / someone else's, as `getBooking`); 5xx, `NETWORK_ERROR`, `TIMEOUT` |
| `startSnapPayment` | 201 `SnapTransaction`; 409 `BOOKING_NOT_HELD`; 503 `PAYMENT_PROVIDER_BUSY` | 401; 404; 422 `VALIDATION_FAILED` (no key); 5xx; transport                                   |
| `getPaymentStatus` | 200                                                                        | 401; 404; 5xx (LLD-03 §6.1: last known status or 503); transport                             |

Files:

| File                                                                              | Change                                                                    |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `src/core/entities/payment/payment.entity.ts`                                     | new                                                                       |
| `src/core/services/payment.service.ts`                                            | new                                                                       |
| `src/core/services/__tests__/payment.service.test.ts`                             | new                                                                       |
| `src/core/protocols/snap.protocol.ts`                                             | new                                                                       |
| `src/infrastructure/adapters/snap.adapter.ts`                                     | new (`createSnapAdapter`, `createMockSnap`)                               |
| `src/infrastructure/adapters/__tests__/snap.adapter.test.ts`                      | new                                                                       |
| `src/infrastructure/di/controllers/payment.ts`                                    | new (registers `snap`)                                                    |
| `src/infrastructure/di/services.registry.ts`                                      | `paymentService`                                                          |
| `src/infrastructure/di/registry.types.ts`                                         | `paymentService`, `snap`                                                  |
| `src/infrastructure/di/__tests__/registry.test.ts`                                | both keys in `KEYS`; `paymentService` singleton; `snap.pay` is a function |
| `src/utils/constants/error-codes.ts`                                              | `SNAP_UNAVAILABLE` (client code, next to `NETWORK_ERROR`)                 |
| `src/translation/locale/id.json`, `en.json`                                       | `error_snap_unavailable`                                                  |
| `src/infrastructure/mocks/scenario.ts`                                            | 5 scenarios, `readMockScenario()`, `mockSnapOutcome()`                    |
| `src/infrastructure/mocks/browser.ts`                                             | use `readMockScenario`                                                    |
| `src/infrastructure/mocks/handlers/mock-booking-store.ts`                         | `MockSnapAttempt`, `attempts` on `StoredBooking`                          |
| `src/infrastructure/mocks/handlers/booking.handlers.ts`                           | `attempts: []` on create; attempt 1 on payment entry                      |
| `src/infrastructure/mocks/handlers/payment.handlers.ts`                           | new                                                                       |
| `src/infrastructure/mocks/handlers/handlers.ts`                                   | add `paymentHandlers`                                                     |
| `src/infrastructure/mocks/__tests__/payment.handlers.test.ts`, `scenario.test.ts` | new / add cases                                                           |

## Components and Interfaces

```ts
// src/core/services/payment.service.ts
import type { PaymentStatusResponse, PaymentView, SnapTransaction } from '@core/entities/payment/payment.entity';
import type { HttpResponse } from '@core/protocols/http.protocol';
import { IDEMPOTENCY_KEY_HEADER } from '@core/services/booking.service';
import type { AwilixRegistry } from '@infrastructure/di/registry.types';

const paymentPath = (bookingId: string) => `payment/payments/${encodeURIComponent(bookingId)}`;

export interface PaymentServiceInterface {
  /** `GET /payment/payments/{bookingId}`: order, attendees, breakdown, live Snap attempt, deadline. 401; 404; 409 BOOKING_NOT_HELD. */
  getPaymentPage: (bookingId: string) => Promise<HttpResponse<PaymentView>>;
  /**
   * `POST /payment/payments/{bookingId}/snap`, no body: the customer picks the method on the Snap page (H-3). The same key
   * returns the same attempt for 24 h; a new key creates attempt n + 1 (old token not revoked, LLD-03 §4.4).
   * 409 BOOKING_NOT_HELD; 503 PAYMENT_PROVIDER_BUSY (retryable).
   */
  startSnap: (bookingId: string, idempotencyKey: string) => Promise<HttpResponse<SnapTransaction>>;
  /** `GET /payment/payments/{bookingId}/status`: poll every 3–5 s. Only `bookingStatus: PAID` means paid. */
  getPaymentStatus: (bookingId: string) => Promise<HttpResponse<PaymentStatusResponse>>;
}

export const PaymentService = ({ coreHttp }: Pick<AwilixRegistry, 'coreHttp'>): PaymentServiceInterface => ({
  getPaymentPage: (bookingId) => coreHttp.get<PaymentView>(paymentPath(bookingId)),
  startSnap: (bookingId, idempotencyKey) =>
    coreHttp.post<SnapTransaction>(`${paymentPath(bookingId)}/snap`, undefined, {
      headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
    }),
  getPaymentStatus: (bookingId) => coreHttp.get<PaymentStatusResponse>(`${paymentPath(bookingId)}/status`),
});
```

`paymentPath` is a stateless module-scope helper building the path (not a data transformation). Importing
`IDEMPOTENCY_KEY_HEADER` from `booking.service.ts` keeps one header name; it is a constant import between two core
files.

```ts
// src/core/protocols/snap.protocol.ts — zero imports
/** How the Snap popup ended. A hint only: the payment is confirmed by getPaymentStatus, never by this (LLD-03 §4.3). */
export type SnapPayResult =
  | { kind: 'success' } // onSuccess: Midtrans reports a settled / captured transaction
  | { kind: 'pending' } // onPending: a VA / QRIS / e-wallet transaction waits for the money
  | { kind: 'error' } // onError: the transaction failed inside Snap
  | { kind: 'closed' }; // onClose: closed without finishing

export interface SnapProtocol {
  /** Loads snap.js once (no-op when loaded). Rejects with an HttpError coded SNAP_UNAVAILABLE. */
  load(): Promise<void>;
  /** Opens the Snap popup for this token; resolves with the first callback. Rejects with SNAP_UNAVAILABLE. */
  pay(snapToken: string): Promise<SnapPayResult>;
}
```

```ts
// src/infrastructure/adapters/snap.adapter.ts
import type { SnapPayResult, SnapProtocol } from '@core/protocols/snap.protocol';

import { HttpRequestError } from './http.adapter';

/** The part of Midtrans' `window.snap` this adapter uses. */
export interface SnapApi {
  pay(
    snapToken: string,
    options: {
      language?: string;
      onSuccess?: (result: unknown) => void;
      onPending?: (result: unknown) => void;
      onError?: (result: unknown) => void;
      onClose?: () => void;
    },
  ): void;
}

export interface SnapAdapterOptions {
  /** config.midtransSnapUrl (sandbox: https://app.sandbox.midtrans.com/snap/snap.js). */
  scriptUrl: string;
  /** config.midtransClientKey, as `data-client-key` (public key; the server key never reaches the web). */
  clientKey: string;
  /** Snap UI language, read per call ('id' | 'en'). */
  getLocale: () => string;
  /** Default 15_000. */
  timeoutMs?: number;
}

/** snap.js loads on the first load() / pay() only: no other page, and not this one before it is needed. */
export function createSnapAdapter(options: SnapAdapterOptions): SnapProtocol;

export interface MockSnapOptions {
  /** Picked per call (the mock scenario). */
  outcome: () => SnapPayResult['kind'];
  /** Default 800. */
  delayMs?: number;
}

/** NEXT_PUBLIC_API_MOCK: no Midtrans script, no popup; resolves like a finished Snap. */
export function createMockSnap(options: MockSnapOptions): SnapProtocol;
```

Behaviour of `createSnapAdapter` (closure state `loading: Promise<SnapApi> | null`; `type SnapWindow = Window & { snap?:
SnapApi }`):

- `load()`: `window.snap` present → resolve. Else `loading ??= new Promise(…)`: create `script` with `src = scriptUrl`,
  `async = true`, `dataset.clientKey = clientKey` (renders `data-client-key`), append to `document.head`; `onload` →
  `window.snap ? resolve : reject(unavailable(…))`; `onerror` → `loading = null`, `script.remove()`, reject; a
  `timeoutMs` timer → same as `onerror`. The timer is cleared on settle.
- `pay(token)`: `const api = await loadApi()`; then `new Promise((resolve, reject) => { let done = false; const settle =
(r) => { if (!done) { done = true; resolve(r); } }; try { api.pay(token, { language: getLocale(), onSuccess: () =>
settle({ kind: 'success' }), onPending: () => settle({ kind: 'pending' }), onError: () => settle({ kind: 'error' }),
onClose: () => settle({ kind: 'closed' }) }); } catch (e) { reject(unavailable('snap.pay failed', e)); } })`. The
  callback payloads are dropped: they carry Midtrans transaction details the client must not act on or log.
- `unavailable(message, cause?) = new HttpRequestError({ status: 0, code: 'SNAP_UNAVAILABLE', message }, { cause })`.

`createMockSnap`: `load: async () => {}`; `pay: () => new Promise((r) => setTimeout(() => r({ kind: outcome() }),
delayMs))`. It never touches `document`.

```ts
// src/infrastructure/di/controllers/payment.ts
import { asFunction } from 'awilix';

import { createMockSnap, createSnapAdapter } from '@infrastructure/adapters/snap.adapter';
import type { AwilixRegistry } from '@infrastructure/di/registry.types';
import { mockSnapOutcome, readMockScenario } from '@infrastructure/mocks/scenario';
import { STORAGE_KEYS } from '@utils/constants/storage-keys';

import container from '../container';

/** Imported by the payment page shell: the Snap adapter (and snap.js, on first use) load only with that page. */
// Spec 77 adds `container.register({ paymentController: asFunction(PaymentController) });` above this call: the
// registry test maps a file to the key of its FIRST register call.
container.register({
  snap: asFunction(({ config, storage }: Pick<AwilixRegistry, 'config' | 'storage'>) =>
    config.apiMock
      ? createMockSnap({ outcome: () => mockSnapOutcome(readMockScenario()) })
      : createSnapAdapter({
          scriptUrl: config.midtransSnapUrl,
          clientKey: config.midtransClientKey,
          getLocale: () => storage.get(STORAGE_KEYS.LANGUAGE) ?? config.defaultLocale,
        }),
  ).singleton(),
});
```

```ts
// src/infrastructure/di/registry.types.ts (additions)
import type { SnapProtocol } from '@core/protocols/snap.protocol';
import type { PaymentServiceInterface } from '@core/services/payment.service';
//   after qrEncoder:
  /** Registered by the payment page only (di/controllers/payment.ts): snap.js loads with that page. */
  snap: SnapProtocol;
//   in "services", after queueService:
  paymentService: PaymentServiceInterface;

// src/infrastructure/di/services.registry.ts
    paymentService: asFunction(PaymentService).singleton(),
```

```ts
// src/infrastructure/mocks/scenario.ts (additions; MOCK_SCENARIOS after 'payment_busy')
  /** FR-20: the view has no live Snap attempt and the first Snap start answers 503 PAYMENT_PROVIDER_BUSY; a retry works. */
  'snap_busy',
  /** FR-20: the customer closes the Snap popup without paying. */
  'snap_closed',
  /** FR-20: attempt 1 is denied (Snap onError, status denied); "Bayar lagi" opens attempt 2, which settles. */
  'payment_denied',
  /** FR-20: a VA / QRIS that is never paid: Snap onPending, the status stays pending. */
  'payment_pending',
  /** FR-20 / ADR-0009: the payment settles after expiry: EXPIRED, paid_after_expiry, refundRequired. */
  'payment_late',

/** The scenario of this tab: URL `?mock=` first, then sessionStorage; saved back. Browser only (moved from browser.ts). */
export function readMockScenario(): MockScenario;

/** What the mock Snap popup "does": snap_closed → closed · payment_pending → pending · payment_denied → error · else success. */
export function mockSnapOutcome(scenario: MockScenario): 'success' | 'pending' | 'error' | 'closed';
```

`browser.ts` keeps its behaviour and passes `readMockScenario` as `getScenario`.

Compile check: `HttpProtocol.post<T, B = unknown>(path, body?: B, config?)` accepts `undefined`; `AwilixRegistry` gains
two keys, both registered (`services.registry.ts`, `di/controllers/payment.ts`); `storage.get` and
`STORAGE_KEYS.LANGUAGE` are what `infrastructure.registry.ts` already uses for the locale; `MockScenario` gains five
members, so `mockSnapOutcome`'s `switch` needs a `default`.

## Data Models

```ts
// src/core/entities/payment/payment.entity.ts
// Payment module types, matching rusuh-documentation/api/openapi.yaml (PaymentView, SnapTransaction, PaymentStatus).
import type { Attendee, BookingStatus, PaymentMethod, PriceBreakdown } from '@core/entities/booking/booking.entity';

/** The latest attempt as Midtrans confirmed it. Only `bookingStatus: PAID` means paid. */
export type PaymentStatus =
  'none' | 'pending' | 'settled' | 'denied' | 'expired' | 'cancelled' | 'failed' | 'paid_after_expiry';

/** One Midtrans attempt (`order_id = {bookingId}-{attempt}`, ADR-0008). */
export interface SnapTransaction {
  attemptId: number;
  orderId: string;
  /** The method this attempt was opened on; null when the customer picks on Snap (always, on the web). */
  method?: PaymentMethod | null;
  /** For `window.snap.pay(token)`. Never logged, never in analytics. */
  snapToken: string;
  /** Snap page URL (system tab / WebView; unused on the web). */
  redirectUrl: string;
  /** Midtrans expiry: 10 minutes from the payment entry (P + 10, LLD-03 §4). */
  gatewayExpiresAt: string;
}

/** getPaymentPage 200. */
export interface PaymentView {
  bookingId: string;
  orderCode: string;
  eventName?: string;
  eventStartsAt?: string;
  venueShort?: string;
  /** IANA zone of the venue ("Asia/Jakarta"): dates are shown in it. */
  timezone?: string;
  /** One line per ticket (category, masked NIK); the price comes from price.lines. */
  attendees: Attendee[];
  /** Where a refund notice goes if the payment arrives late (ADR-0009). */
  customerEmail?: string;
  price: PriceBreakdown;
  /** The live attempt, or null before the first one. */
  currentSnap?: SnapTransaction | null;
  /** Payment deadline (end of PAYMENT_PENDING). For FR-21-W1; not shown in this ticket. */
  expiresAt: string;
  serverNow: string;
  /** paySession (mobile) only: the web authenticates with bearer and ignores it. */
  csrfToken: string;
  /** Public Midtrans client key; the web loads snap.js with config.midtransClientKey. */
  snapClientKey: string;
}

/** startSnapPayment body. The web sends none: the customer picks on Snap (H-3). Kept for the contract. */
export interface StartSnapPaymentRequest {
  method?: PaymentMethod;
}

/** getPaymentStatus 200. */
export interface PaymentStatusResponse {
  bookingStatus: BookingStatus;
  paymentStatus?: PaymentStatus;
  /** Mobile App Link, set when final; unused on the web. */
  returnUrl?: string;
  serverNow: string;
}
```

Mock store (`mock-booking-store.ts` additions):

```ts
import type { PaymentStatus } from '@core/entities/payment/payment.entity';

/** One mocked Snap attempt. */
export interface MockSnapAttempt {
  attemptId: number;
  /** null for attempt 1, created by the FR-16 payment entry. */
  idempotencyKey: string | null;
  /** `mock-snap-<bookingId>-<attemptId>`. */
  snapToken: string;
  /** 'none' until its first status poll. */
  status: PaymentStatus;
  /** Server time (ms) of the first status poll of this attempt; it settles MOCK_SETTLE_MS later. */
  firstPolledAt: number | null;
}

export interface StoredBooking {
  // …existing fields
  attempts: MockSnapAttempt[];
}
```

`booking.handlers.ts`: `save({ …, attempts: [] })` on create; a successful payment entry pushes attempt 1
(`idempotencyKey: null`, the same `mock-snap-<id>-1`, status `none`) when `attempts` is empty.

Mock handlers (`payment.handlers.ts`; `export const MOCK_SETTLE_MS = 3000`; first match wins). A "final" attempt status
is `denied`, `failed`, `cancelled` or `expired`.

`GET {core}/payment/payments/:bookingId`

| #   | Condition                                                                  | Answer                                            |
| --- | -------------------------------------------------------------------------- | ------------------------------------------------- |
| 1   | `failure(scenario)`                                                        | as every handler                                  |
| 2   | no bearer                                                                  | 401 `UNAUTHORIZED`                                |
| 3   | not in the store and not in `bookingsFixture`                              | 404 `NOT_FOUND`                                   |
| 4   | fixture booking, or stored booking not PAYMENT_PENDING after `expireIfDue` | 409 `BOOKING_NOT_HELD` "Pesanan tidak lagi aktif" |
| 5   | otherwise                                                                  | 200 `PaymentView` (below)                         |

View: `bookingId`, `orderCode`, `attendees`, `price`, `expiresAt` (the booking's), `serverNow`, the event's `name`,
`startsAt`, `venueShort`, `timezone` from `eventsFixture(now)`, `customerEmail: 'nadia.saputri@example.com'`,
`currentSnap` = the last attempt that is not final, as a `SnapTransaction` (`orderId <id>-<n>`, `method: null`,
`redirectUrl https://app.sandbox.midtrans.com/snap/v4/redirection/<token>`, `gatewayExpiresAt` = the booking's
`expiresAt`), else `null` — and always `null` under `snap_busy`, so the first "Bayar" calls `startSnap` and meets the
503; `csrfToken: 'mock-csrf'`, `snapClientKey: 'SB-Mid-client-mock'`.

`POST {core}/payment/payments/:bookingId/snap` (`snapStarts`: a per-booking counter in the factory closure)

| #   | Condition                                                      | Answer                                       |
| --- | -------------------------------------------------------------- | -------------------------------------------- |
| 1   | `failure`; no bearer; unknown id                               | as above (401 / 404)                         |
| 2   | no `Idempotency-Key`                                           | 422 `VALIDATION_FAILED`                      |
| 3   | not PAYMENT_PENDING after `expireIfDue`                        | 409 `BOOKING_NOT_HELD`                       |
| 4   | an attempt with this key                                       | 201 that attempt (replay)                    |
| 5   | `snapStarts += 1`; scenario `snap_busy` and `snapStarts === 1` | 503 `PAYMENT_PROVIDER_BUSY` (no attempt)     |
| 6   | otherwise                                                      | push attempt `n + 1` (status `none`), 201 it |

`GET {core}/payment/payments/:bookingId/status`

| #   | Condition                                                              | Answer                                                                                                                             |
| --- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `failure`; no bearer; unknown id                                       | as above                                                                                                                           |
| 2   | fixture booking                                                        | `{ bookingStatus, paymentStatus: PAID ? 'settled' : 'expired' }`                                                                   |
| 3   | stored, not PAYMENT_PENDING (after `expireIfDue`)                      | `{ bookingStatus, paymentStatus: last attempt's status ?? 'none' }`                                                                |
| 4   | no attempt, or the last attempt is final                               | `{ PAYMENT_PENDING, last status ?? 'none' }`                                                                                       |
| 5   | last attempt `firstPolledAt` is null                                   | set it to now; `{ PAYMENT_PENDING, 'pending' }`                                                                                    |
| 6   | `payment_pending`, or less than `MOCK_SETTLE_MS` since `firstPolledAt` | `{ PAYMENT_PENDING, 'pending' }`                                                                                                   |
| 7   | `payment_denied` and `attemptId === 1`                                 | attempt `denied`; `{ PAYMENT_PENDING, 'denied' }`                                                                                  |
| 8   | `payment_late`                                                         | booking EXPIRED, `expiresAt: null`, `refundRequired: true`; attempt `paid_after_expiry`; `{ EXPIRED, 'paid_after_expiry' }`        |
| 9   | otherwise                                                              | attempt `settled`; booking PAID, `paidAt` = now, `paymentMethod: 'qris'`, `expiresAt: null`, tickets minted; `{ PAID, 'settled' }` |

Every 200 carries `serverNow`. Minted tickets, one per attendee (`i` from 1): `ticketId <id>_t<i>`, `ticketCode
MCK-<orderCode's last 6 digits>-<i>`, `bookingId`, `eventId`, `categoryId`, `categoryName`, `holderName = fullName`,
`nikMasked`, `qrPayload RSH1.<ticketCode>.bW9jay1zaWduZWQ`, `issuedAt` = now. `GET /core/bookings/:id` (store first)
then serves the paid booking to the e-ticket page.

Mock QA paths (start at `/order?event=evt_samudra`, hold, land on `/payment?booking=bk_mock_1`):

| Scenario          | "Bayar" does                                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------------------------ |
| `ok`              | 0.8 s mock Snap → verifying → ~3 s → `/tickets/detail?booking=bk_mock_1`                                     |
| `snap_closed`     | back to ready; "Bayar" again reopens the same token (no new attempt)                                         |
| `payment_pending` | waiting ("Menunggu pembayaran Anda"), polling, "Buka lagi pembayaran"                                        |
| `payment_denied`  | verifying → failed → "Bayar lagi" (new key → attempt 2) → paid                                               |
| `snap_busy`       | no `currentSnap`, so Bayar calls `startSnap` → 503 → busy notice → "Coba lagi" (same key) → attempt 2 → paid |
| `payment_late`    | verifying → "Pesanan ini sudah tidak aktif." + the refund note                                               |

`snap_busy` hides attempt 1 from the view on purpose: in the real flow the FR-16 payment entry already created attempt 1
(`enterPayment` returns its token), so the first "Bayar" reuses `currentSnap` and a 503 is only met on a re-create.

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
- ❌ Library types or any import inside a protocol file

Notes: `snap.adapter.ts` imports the `HttpRequestError` class from `./http.adapter`, as `turnstile.adapter.ts` does (an
error class, not another adapter instance). "Header injection" for this adapter is the `data-client-key` attribute.

From `.claude/rules/scaffold.md`:

- **Controllers register per page**, not in `registerAll()`: one file per controller in
  `src/infrastructure/di/controllers/<page>.ts` (`container.register({ xController: asFunction(XController) })` at module
  scope), imported for its side effect by that page's shell (`import '@infrastructure/di/controllers/<page>';`).
  `providers.tsx` loads on every page, so anything `registerAll()` imports ships on every page; a controller's
  libraries (React Hook Form, Zod, Snap…) must ship only with its own page.
- Adapters: `asFunction(createAdapter).singleton()`
- Services and use cases: `asFunction(Factory).singleton()`
- `AwilixRegistry` (`src/infrastructure/di/registry.types.ts`) is the single source of truth. **Every key in it has a
  `container.register()` call** in one of the three registries or a `di/controllers/` file. Awilix resolves at
  runtime, so TypeScript will not catch a missing registration. Count keys vs registrations after every change.
- Only public values go in `NEXT_PUBLIC_*` (API base URLs, Midtrans **client** key, Turnstile site key). No secrets.
- Client components are still prerendered at build: read `window` / `localStorage` only inside effects or event handlers.

From `.claude/rules/performance.md`:

- Load page-specific libraries (Snap, QR, PDF) with `next/dynamic`, never in providers.
- Load `snap.js` only on the payment screen, `afterInteractive`, never in `<head>` of every page.
- ❌ Third-party scripts in `<head>` synchronously

Note: the adapter appends an `async` script from client code on the payment page only, after the page is interactive
(spec 77 preloads it once the view has loaded): the effect of `next/script` `afterInteractive`, without a component in
the route file.

From `.claude/rules/error-handling.md`:

- Every code the endpoint can return (see `openapi.yaml`) has an entry in `ERROR_CODE_MAP` and both locale files.

From `CLAUDE.md`:

- No secrets in `NEXT_PUBLIC_*`; only `src/infrastructure/config.ts` reads `process.env`.
- NIKs are shown masked after entry and never logged.

## Correctness Properties

- Property 1: `getPaymentPage(id)` issues one `coreHttp.get('payment/payments/' + encodeURIComponent(id))` with no
  config; `getPaymentStatus(id)` the same path + `/status`. **Validates: Requirements 2**
- Property 2: `startSnap(id, key)` issues one `coreHttp.post` to `…/snap` with body `undefined` and headers exactly
  `{ 'Idempotency-Key': key }`; an id with `/`, `?` or spaces keeps the path shape. **Validates: Requirements 2**
- Property 3: any `coreHttp` rejection reaches the caller as the same object for all three calls.
  **Validates: Requirements 2**
- Property 4: before the first `load()` / `pay()` no script is in the document; after two concurrent `pay()` calls exactly
  one `script[src="<url>"][data-client-key="<key>"]` exists. **Validates: Requirements 3, 4**
- Property 5: each callback resolves its kind; a second callback after the first changes nothing; `language` is the
  current `getLocale()`. **Validates: Requirements 3**
- Property 6: script `error`, a timeout (fake timers), `onload` without `window.snap`, and a throwing `snap.pay` each
  reject with `code === 'SNAP_UNAVAILABLE'`, `status === 0`; after an `error` the next `load()` appends a new script.
  **Validates: Requirements 3**
- Property 7: `createMockSnap` never touches `document` and resolves `outcome()` after `delayMs`; `mockSnapOutcome` maps
  the four rows. **Validates: Requirements 3, 5**
- Property 8: every row of the three handler tables answers its status and `code`; a repeated key returns the same
  `attemptId`; a new key returns `attemptId + 1`; `currentSnap` skips a denied attempt and is null under `snap_busy`.
  **Validates: Requirements 5**
- Property 9: `ok`: status polls answer `pending` until `MOCK_SETTLE_MS` after the first, then `PAID` / `settled`, and
  `getBooking(id)` then returns `status: 'PAID'` with one ticket per attendee; `payment_late` ends in `EXPIRED` /
  `paid_after_expiry` with `refundRequired: true`. **Validates: Requirements 5**
- Property 10: `ERROR_CODE_MAP.SNAP_UNAVAILABLE === 'error_snap_unavailable'` and both locales have it; key count =
  registration count (`registry.test.ts`). **Validates: Requirements 3, 4**
- Property 11: `payment.entity.ts` has only `import type` and `export interface|type`; `snap.protocol.ts` has no import.
  **Validates: Requirements 1, 3**

## Error Handling

None in the service or the adapter beyond normalising snap.js failures to `SNAP_UNAVAILABLE`. What each code becomes is
spec 76's job:

| Call       | Status / code                                                  | Spec 76 outcome                                |
| ---------- | -------------------------------------------------------------- | ---------------------------------------------- |
| page       | 409 `BOOKING_NOT_HELD`                                         | status check → `paid` or `inactive` (+ refund) |
| page, snap | 404 `NOT_FOUND`                                                | `not-found`                                    |
| page, snap | 401 `UNAUTHORIZED` (after the adapter's refresh)               | `unauthorized`                                 |
| snap       | 409 `BOOKING_NOT_HELD`                                         | status check → `paid` or `inactive`            |
| snap       | 503 `PAYMENT_PROVIDER_BUSY`, ≥ 500, `NETWORK_ERROR`, `TIMEOUT` | `retryable`                                    |
| snap.pay   | `SNAP_UNAVAILABLE` (script blocked, offline, timeout)          | `retryable` (same token kept)                  |
| status     | any                                                            | rethrown; the poll keeps going, 401 → sign-in  |
| any        | 422 `VALIDATION_FAILED`, `UNKNOWN_ERROR`, other                | rethrown                                       |

New copy (written by this spec): `error_snap_unavailable` — ID "Halaman pembayaran Midtrans tidak bisa dibuka. Periksa
koneksi Anda lalu coba lagi." / EN "The Midtrans payment page couldn't open. Check your connection and try again."

## Testing Strategy

- `src/core/services/__tests__/payment.service.test.ts`: Properties 1–3 (`get`, `post` as `vi.fn()`, `toBe` identity).
- `src/infrastructure/adapters/__tests__/snap.adapter.test.ts` (jsdom, like `turnstile.adapter.test.ts`): dispatch the
  script's `load` / `error` events by hand, stub `window.snap = { pay: vi.fn() }` and call the captured callbacks;
  Properties 4–7. Remove `window.snap` and the script between tests.
- `src/infrastructure/mocks/__tests__/payment.handlers.test.ts` (node env, real HTTP adapter + `PaymentService` +
  `BookingService` through `createHandlers`, a mutable `let now`): create and enter a booking through the booking
  handlers (reuse the helper of `booking.handlers.test.ts`), then Properties 8–9 per row and scenario.
- `scenario.test.ts`: the five scenarios resolve; the `mockSnapOutcome` table; `readMockScenario` with a stubbed
  `location.search` and `sessionStorage`.
- `registry.test.ts`: `snap`, `paymentService` in `KEYS`; `paymentService` resolves as a singleton.
- Gate: `npm run typecheck && npm run lint && npx vitest --run`; coverage ≥ 85% on the changed files.
