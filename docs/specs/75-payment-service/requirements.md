# Requirements Document

## Introduction

Data layer for FR-20-W1 (rusuh-web#19, "Web: Payment page and Midtrans Snap (snap.js)"; parent FR-20,
rusuh-documentation#20: "Customer dapat memilih metode pembayaran dari mitra pembayaran yang tersedia"; aanwijzing T-07:
use Midtrans). Adds the payment entities, a `paymentService` for the three payment-module calls (`getPaymentPage`,
`startSnapPayment`, `getPaymentStatus`), a `SnapProtocol` with a lazy snap.js adapter (and a mock one for
`NEXT_PUBLIC_API_MOCK`), a client error code for a Snap page that cannot open, and MSW handlers so the whole payment
can be clicked through locally up to the e-ticket. Sources: `../rusuh-documentation/api/openapi.yaml`
(`getPaymentPage`, `startSnapPayment`, `getPaymentStatus`; schemas `PaymentView`, `SnapTransaction`, `PaymentStatus`,
`BookingStatus`, `PriceBreakdown`, `Attendee`, `IdempotencyKey`), ADR-0008 (Snap hosted page), ADR-0028 (`/payment/*`
prefix), ADR-0009 + ADR-0026 (late payment flagged for refund, no grace), `architecture/lld-03-payment-module.md` §4.3
(redirect is never confirmation), §4.4 (re-create = new attempt, old token not revoked), §5.2, §6.1. First spec of
FR-20-W1; spec 76 orchestrates, spec 77 drives the page, spec 78 renders it.

Out of scope (deferred): the 10-minute countdown (FR-21-W1 / BR-05-W1), the expired "Pesanan dibatalkan / Antre lagi"
screen (FR-23-W1), resume after refresh beyond reloading `/payment?booking=` (NFR-02-W1), an in-page method picker
(H-3: the customer picks on the Midtrans page, so no `method` is ever sent), the mobile `paySession` / CSRF / handoff
flow.

## Glossary

| Term             | Definition                                                                                                 |
| ---------------- | ---------------------------------------------------------------------------------------------------------- |
| Payment view     | `getPaymentPage` 200: order code, event, attendees, price, the live Snap transaction, deadline, server now |
| Snap transaction | One Midtrans attempt: `order_id = {bookingId}-{attempt}`, a `snapToken` for `window.snap.pay`              |
| Attempt          | One Snap transaction; a new `Idempotency-Key` on `startSnapPayment` creates the next one (LLD-03 §4.4)     |
| snap.js          | Midtrans' browser script (`config.midtransSnapUrl`, `data-client-key = config.midtransClientKey`)          |
| Snap hint        | `onSuccess` / `onPending` / `onError` / `onClose` from snap.js: never a confirmation, only the server is   |
| Payment status   | `getPaymentStatus` 200: `bookingStatus` (+ `paymentStatus`), polled every 3–5 s                            |

## Requirements

### Requirement 1: Payment entities

**User Story:**

AS a web developer
I WANT the payment-module shapes typed once
SO THAT the use case, the controller and the mocks share the contract

#### Acceptance Criteria

- SHALL add `src/core/entities/payment/payment.entity.ts` with `PaymentStatus`, `SnapTransaction`, `PaymentView`,
  `StartSnapPaymentRequest` and `PaymentStatusResponse`, matching `openapi.yaml` (required vs optional as the schema says)
- SHALL reuse `PaymentMethod`, `BookingStatus`, `Attendee` and `PriceBreakdown` from
  `src/core/entities/booking/booking.entity.ts` (type imports), never redeclare them
- SHALL keep `csrfToken` and `snapClientKey` on `PaymentView` (required in the contract) and document that the web does
  not use `csrfToken` (bearer auth) and loads snap.js with the config key
- SHALL NOT add runtime code to the entity file

### Requirement 2: Payment service

**User Story:**

AS the payment use case
I WANT one typed call per payment operation
SO THAT I can load the page, open Snap and poll the result

#### Acceptance Criteria

- SHALL add `PaymentService` in `src/core/services/payment.service.ts`, depending only on `coreHttp`
- `getPaymentPage(bookingId)` SHALL call `coreHttp.get<PaymentView>('payment/payments/{encoded id}')`
- `startSnap(bookingId, idempotencyKey)` SHALL call `coreHttp.post<SnapTransaction>('payment/payments/{encoded id}/snap',
undefined, { headers: { 'Idempotency-Key': idempotencyKey } })`: no body, so no `method` (H-3)
- `getPaymentStatus(bookingId)` SHALL call `coreHttp.get<PaymentStatusResponse>('payment/payments/{encoded id}/status')`
- SHALL return `HttpResponse<T>` and let every `HttpError` reach the caller unchanged; SHALL NOT generate the key
- SHALL be registered as `paymentService: asFunction(PaymentService).singleton()` and typed in `AwilixRegistry`

### Requirement 3: Snap protocol and adapter

**User Story:**

AS the payment use case
I WANT `snap.pay(token)` behind a protocol
SO THAT Snap opens without core or the controller touching `window`

#### Acceptance Criteria

- SHALL add `SnapProtocol` in `src/core/protocols/snap.protocol.ts` (zero imports): `load(): Promise<void>` and
  `pay(snapToken): Promise<SnapPayResult>`, where `SnapPayResult` is `success | pending | error | closed`
- SHALL add `createSnapAdapter` in `src/infrastructure/adapters/snap.adapter.ts`: on the first `load()` / `pay()` only,
  append one `<script async src={scriptUrl} data-client-key={clientKey}>` to `document.head`; concurrent calls share one
  load; a failed load removes the script and lets the next call try again; a load that does not finish within
  `timeoutMs` (default 15 s) rejects
- `pay(token)` SHALL call `window.snap.pay(token, { language, onSuccess, onPending, onError, onClose })` and resolve with
  the first callback only (`language` from `getLocale()`, `'id'` or `'en'`)
- A load failure, a timeout, a missing `window.snap` or a throwing `snap.pay` SHALL reject with an `HttpRequestError`
  `{ status: 0, code: 'SNAP_UNAVAILABLE' }`
- SHALL add `createMockSnap` (same file): no script, `load()` resolves, `pay()` resolves after `delayMs` (800 ms) with
  the outcome its `outcome()` option returns
- SHALL add `SNAP_UNAVAILABLE` to `ERROR_CODE_MAP` with `error_snap_unavailable` in both locale files
- SHALL NOT load snap.js from `registerAll()`, `providers.tsx` or any other page

### Requirement 4: Page-scoped registration

**User Story:**

AS a buyer on any other page
I WANT none of the payment code or Midtrans script to load
SO THAT the waiting room and home stay light (performance rule)

#### Acceptance Criteria

- SHALL register `snap` in a new `src/infrastructure/di/controllers/payment.ts` (imported later by the payment shell,
  spec 78), as `asFunction(...).singleton()`: `createMockSnap` when `config.apiMock`, else `createSnapAdapter` with
  `config.midtransSnapUrl`, `config.midtransClientKey` and the stored language
- SHALL type `snap: SnapProtocol` in `AwilixRegistry` (with the `qrEncoder`-style comment that one page registers it)
  and add `snap`, `paymentService` to `KEYS` in `registry.test.ts`
- SHALL move the browser mock's scenario reader into `readMockScenario()` in `src/infrastructure/mocks/scenario.ts`
  and use it from `browser.ts` and the mock Snap wiring

### Requirement 5: Mock payment API

**User Story:**

AS QA without a backend
I WANT the payment page to work end to end in the mock
SO THAT I can reach paid, waiting, failed, busy, closed and late-payment states and land on the e-ticket

#### Acceptance Criteria

- SHALL add `src/infrastructure/mocks/handlers/payment.handlers.ts` (in `HANDLER_FACTORIES`), reading the shared
  `bookingStore`
- SHALL keep Snap attempts on each stored booking; the FR-16 payment entry SHALL record its token as attempt 1
- `GET payment/payments/:bookingId` SHALL answer the design's rows (401, 404, 409 `BOOKING_NOT_HELD` when not
  PAYMENT_PENDING, 200 `PaymentView` with the event from `eventsFixture` and `currentSnap` = the latest attempt that has
  not failed, or null)
- `POST …/snap` SHALL answer 401, 404, 422 without `Idempotency-Key`, 409 `BOOKING_NOT_HELD`, the `snap_busy` 503 on
  the first call of a booking, 201 the same attempt for a repeated key, else 201 a new attempt `n + 1`
- `GET …/status` SHALL settle an attempt 3 s after its first poll: `ok` → PAID (`settled`, tickets minted from the
  attendees so `/tickets/detail` works); `payment_denied` → `denied` on attempt 1 only; `payment_pending` → stays
  `pending`; `payment_late` → EXPIRED + `paid_after_expiry` + `refundRequired`
- SHALL add the scenarios `snap_busy`, `snap_closed`, `payment_denied`, `payment_pending`, `payment_late`, each with a
  comment; the mock Snap SHALL resolve `closed` / `pending` / `error` for `snap_closed` / `payment_pending` /
  `payment_denied`, else `success`
- SHALL NOT put a NIK or a name in any problem body

### Requirement 6: Tests

**User Story:**

AS a developer
I WANT the service, the adapter and the mock pinned by tests
SO THAT specs 76–78 can rely on them

#### Acceptance Criteria

- SHALL test the three service calls with a mocked `coreHttp`: method, path, encoding, headers, no body, error identity
- SHALL test the Snap adapter in jsdom: one script with the right `src` and `data-client-key`, shared load, retry after a
  failed load, timeout, each callback → its result, first callback wins, `SNAP_UNAVAILABLE` rejections, and that nothing
  is appended before the first call; and the mock Snap outcomes
- SHALL test the payment handlers through the real HTTP adapter + `PaymentService` (node env) for every row and scenario
- SHALL keep coverage ≥ 85% on the changed files
