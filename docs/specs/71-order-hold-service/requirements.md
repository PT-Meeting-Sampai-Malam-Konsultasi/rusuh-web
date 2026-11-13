# Requirements Document

## Introduction

Data layer for FR-16-W1 (rusuh-web#78, "Web: Order: hold tickets and continue to payment"; parent FR-16,
rusuh-documentation#16: "Saat customer melanjutkan ke pembayaran, stok tiket di-hold (reservasi sementara)"). Adds the
v1 booking types (`SELECTION`, `PAYMENT_PENDING`, `Attendee`, the create / payment-entry / active-bookings shapes), three
`bookingService` calls (`createBooking`, `enterPayment`, `getActiveBooking`), a shared UUID helper for the
`Idempotency-Key`, and an in-memory MSW booking store so QA can run the whole hold locally and FR-20-W1 can later read
the same booking through `getBooking`. Sources: `../rusuh-documentation/api/openapi.yaml` (`createBooking`,
`getActiveBooking`, `getBooking`, `enterPayment`; schemas `Booking`, `BookingStatus`, `Attendee`, `PriceBreakdown`,
`IdempotencyKey`), ADR-0004, ADR-0005, ADR-0007 + ADR-0024, ADR-0010, ADR-0026, `architecture/lld-02-core-module.md`
(D5, D8: SELECTION → PAYMENT_PENDING at payment entry), `architecture/customer-journey.md` (G0–G10, H0–H1). First spec of
FR-16-W1; spec 72 orchestrates the calls, spec 73 drives the page, spec 74 renders it.

Out of scope: storing or using `snapToken` (FR-20-W1), `checkPaymentStatus`, Snap, the payment page.

## Glossary

| Term                 | Definition                                                                                         |
| -------------------- | -------------------------------------------------------------------------------------------------- |
| SELECTION            | v1 booking state after `createBooking`: priced, attendees fixed, no stock hold yet (5 minutes, D5) |
| PAYMENT_PENDING      | v1 booking state after `enterPayment`: the atomic Valkey hold succeeded (10 minutes, ADR-0005)     |
| HELD                 | Pre-v1 status name; core v1 never produces it, it stays for old records                            |
| Idempotency-Key      | Client UUID header on `createBooking`; the same key returns the same booking for 24 h              |
| Validation token     | Opaque per-attendee token from `validateAttendee` (spec 53); carries the attendee name and NIK     |
| Active booking       | A booking of this account in SELECTION or PAYMENT_PENDING; at most one per event (Q-38)            |
| Booking store (mock) | Per-`createHandlers` in-memory map of mocked bookings, shared by the booking handlers              |

## Requirements

### Requirement 1: v1 booking entities

**User Story:**

AS a web developer
I WANT the v1 booking states and the hold request / response shapes typed
SO THAT the use case and the payment page share one contract

#### Acceptance Criteria

- SHALL widen `BookingStatus` to `'SELECTION' | 'PAYMENT_PENDING' | 'HELD' | 'PAID' | 'EXPIRED' | 'CANCELLED'` (keep `HELD`)
- SHALL add `Attendee { categoryId; categoryName; fullName; nikMasked }` (all required)
- SHALL add `attendees?: Attendee[]`, `expiresAt?: string | null` and `refundRequired?: boolean` to `Booking`
- SHALL add `CreateBookingTicket`, `CreateBookingRequest`, `EnterPaymentResponse` (`redirectUrl?: string | null` the only
  optional field) and `ActiveBookingsResponse { items: Booking[] }`
- SHALL NOT add runtime code to `booking.entity.ts`
- WHEN the existing code compiles against the widened `BookingStatus` THEN no file other than the ones listed SHALL need a
  change (`get-e-ticket` keeps `status: BookingStatus` as is)

### Requirement 2: createBooking

**User Story:**

AS the hold use case
I WANT `bookingService.createBooking(admissionToken, idempotencyKey, body)`
SO THAT one call creates the SELECTION booking, safely repeatable

#### Acceptance Criteria

- SHALL call `coreHttp.post<Booking, CreateBookingRequest>('core/bookings', body, { headers: { 'X-Admission-Token':
admissionToken, 'Idempotency-Key': idempotencyKey } })`
- SHALL send the body as the same object (no reordering of `tickets`)
- SHALL return `HttpResponse<Booking>` and let every `HttpError` (403, 409 with `categoryId`, 422, 401, transport) reach
  the caller unchanged
- SHALL NOT generate the idempotency key itself (the caller owns the attempt)

### Requirement 3: enterPayment and getActiveBooking

**User Story:**

AS the hold use case
I WANT `enterPayment(bookingId, admissionToken)` and `getActiveBooking()`
SO THAT I can place the stock hold and recover an existing booking

#### Acceptance Criteria

- SHALL call `coreHttp.post<EnterPaymentResponse>('core/bookings/{encoded id}/payment', undefined, { headers: {
'X-Admission-Token': admissionToken } })`
- SHALL call `coreHttp.get<ActiveBookingsResponse>('core/bookings/active')` with no admission header
- SHALL return `HttpResponse<T>` and propagate errors unchanged; SHALL NOT catch, log or transform
- SHALL NOT add a DI key (`bookingService` is registered)

### Requirement 4: Shared UUID helper

**User Story:**

AS the order controller
I WANT a UUID v4 generator outside the infrastructure layer
SO THAT I can make one `Idempotency-Key` per attempt without importing an adapter

#### Acceptance Criteria

- SHALL move `randomRequestId` from `src/infrastructure/adapters/http.adapter.ts` to `src/utils/random-uuid.ts` as
  `randomUuid()` (same body: `crypto.randomUUID`, else a v4 from `getRandomValues`)
- SHALL keep `randomRequestId` exported from the adapter as an alias, so `http.adapter.test.ts` stays green
- SHALL test `randomUuid` (v4 pattern, both branches) in `src/utils/__tests__/random-uuid.test.ts`

### Requirement 5: Mock booking store and handlers

**User Story:**

AS QA without a backend
I WANT the hold to work end to end in the mock
SO THAT I can reach every hold outcome on `/order` and the payment page can read the booking later

#### Acceptance Criteria

- SHALL add `src/infrastructure/mocks/handlers/mock-booking-store.ts` and a `bookingStore` on `MockHandlerContext`,
  created once per `createHandlers` call (like `queueState`)
- WHEN `validateAttendee` answers 200 THEN the handler SHALL remember the token's attendee (`fullName`, `nikMasked` as
  first 4 + `•••• ••••` + last 4) in the store; the response is unchanged
- SHALL answer `POST {core}/core/bookings` with 201 and a SELECTION `Booking` built from the request: one attendee per
  ticket, price lines per category from `categoriesFixture`, `adminFee` = `MOCK_ADMIN_FEE` **once per order**
  (ADR-0010), `total = ticketSubtotal + adminFee`, `expiresAt` = now + 5 min, an `orderCode`, `tickets: []`
- WHEN the same `Idempotency-Key` is sent again THEN SHALL answer the stored booking (201, same body) without creating one
- SHALL answer, in order: `failure(scenario)`; 401 without a bearer; 403 `ADMISSION_INVALID` (no admission header,
  scenario `admission_invalid`, unknown event); 422 `VALIDATION_FAILED` (no `Idempotency-Key`, bad body, 0 or > 3
  tickets, unknown `categoryId`); 409 `QUANTITY_OVER_RESERVATION` (more than `reservedUnits` = 3); 409
  `ATTENDEE_NOT_VALIDATED` (a token the store does not know); 409 `DUPLICATE_NIK` (a token used twice); 409
  `CATEGORY_SOLD_OUT` + `categoryId` (a sold-out fixture category, or scenario `category_sold_out` → the first ticket's
  category); 409 `ACCOUNT_HAS_ACTIVE_BOOKING` (a live SELECTION / PAYMENT_PENDING booking for the event under another key)
- SHALL answer `POST {core}/core/bookings/:bookingId/payment`: `failure`; 401; 403 (as above); 404 `NOT_FOUND` (unknown
  id); 409 `BOOKING_NOT_HELD` (not SELECTION / PAYMENT_PENDING, or SELECTION past `expiresAt`, which the store then marks
  `EXPIRED`); scenario `nik_seat_taken` → 409 `NIK_SEAT_TAKEN` with the last attendee's `nikMasked`; scenario
  `payment_busy` → 503 `PAYMENT_PROVIDER_BUSY` on the **first** entry of each booking only; otherwise 200 with the booking
  moved to PAYMENT_PENDING, `expiresAt` = `paymentExpiresAt` = now + 10 min, `snapToken` `mock-snap-<bookingId>-1`,
  `redirectUrl: null`, `serverNow`; a repeat while PAYMENT_PENDING SHALL answer the same token and deadline
- SHALL answer `GET {core}/core/bookings/active` (registered **before** `/core/bookings/:bookingId`) with the store's live
  SELECTION / PAYMENT_PENDING bookings (expired ones are marked `EXPIRED` on read and left out)
- SHALL make `GET /core/bookings/:bookingId` read the store first, then `bookingsFixture`
- SHALL add `nik_seat_taken`, `category_sold_out` and `payment_busy` to `MOCK_SCENARIOS`, each with a comment
- SHALL NOT echo a NIK or a name in a problem `title` or `detail`

### Requirement 6: Tests

**User Story:**

AS a developer
I WANT the service, the helper and the mock pinned by tests
SO THAT specs 72–74 and FR-20-W1 can rely on them

#### Acceptance Criteria

- SHALL test the three service calls with a mocked `coreHttp`: method, path, encoding, headers, body identity, error
  propagation
- SHALL test the handlers through the real HTTP adapter + `BookingService` (node env): one case per handler row, the
  idempotent replay, the fee once per order, the active-booking recovery shape, the PAYMENT_PENDING repeat, the three
  scenarios, and `getBooking` returning a created booking
- SHALL test that the three scenarios resolve from the URL in `scenario.test.ts`
- SHALL keep coverage ≥ 85% on the changed files
