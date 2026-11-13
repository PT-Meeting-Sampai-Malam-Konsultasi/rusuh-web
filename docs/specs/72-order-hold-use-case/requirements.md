# Requirements Document

## Introduction

Business logic for FR-16-W1 (rusuh-web#78; parent FR-16, rusuh-documentation#16: "Saat customer melanjutkan ke
pembayaran, stok tiket di-hold (reservasi sementara)"). `HoldBookingUseCase` turns "Lanjut ke pembayaran" into the v1
two-step hold: `createBooking` (SELECTION) then `enterPayment` (the atomic stock + NIK hold, PAYMENT_PENDING), resumes a
half-done attempt from a known `bookingId`, recovers an existing active booking after 409 `ACCOUNT_HAS_ACTIVE_BOOKING`,
and classifies every answer into a discriminated union. It also prices the summary (`quote`): one line per category,
the admin fee **once per order** (ADR-0010, `hifi-api-review.md` H-1), and the total. Sources: `openapi.yaml`
(`createBooking`, `enterPayment`, `getActiveBooking`), LLD-02 §3, §5, §6 (D5, D8), ADR-0005, ADR-0007 + ADR-0024,
ADR-0010, `customer-journey.md` F20, F15, G0–G10. Uses spec 71; spec 73 calls it.

Decision under `.claude/rules/core-use-case.md` "When to create one": **yes**. It is a multi-step flow (create → enter
payment, or active bookings → enter payment), it branches on status (SELECTION vs PAYMENT_PENDING) and it classifies
expected API errors into business outcomes. It is not "a simple POST, no branching".

## Glossary

| Term          | Definition                                                                                             |
| ------------- | ------------------------------------------------------------------------------------------------------ |
| Hold          | v1: the Valkey check-and-hold at `enterPayment` that moves the booking to PAYMENT_PENDING (D8)         |
| Attempt       | One "Lanjut ke pembayaran" selection (tickets + tokens) with its own idempotency key; retries reuse it |
| Known booking | The `bookingId` of an attempt whose create succeeded and whose payment entry failed retryably          |
| Slot index    | 0-based ticket position in the order (slot order: category server order, then ordinal)                 |
| nikLast4      | The last 4 NIK digits of a slot, used only to match a problem's `nikMasked`; never sent, never logged  |
| Quote         | The summary prices: lines, ticket subtotal, admin fee (once), total, in whole rupiah                   |

## Requirements

### Requirement 1: Price quote

**User Story:**

AS the order controller
I WANT the summary priced by one pure function
SO THAT the aside and the dock show the same numbers the server will charge

#### Acceptance Criteria

- SHALL return one line per category with quantity ≥ 1, in category order: `categoryId`, `name`, `quantity`,
  `lineTotal = price.amount × quantity`
- SHALL return `ticketCount` (Σ quantities), `ticketSubtotal` (Σ line totals), `adminFee` and `total = ticketSubtotal +
adminFee`
- SHALL charge `adminFee` once per order when `ticketCount ≥ 1`, never × tickets; WHEN `ticketCount` is 0 THEN `adminFee`
  and `total` SHALL be 0
- SHALL read a quantity that is not a non-negative integer as 0 (same rule as `orderTicketSelectionUseCase`) and ignore
  quantities for unknown category ids
- SHALL NOT format money (the controller formats)

### Requirement 2: Create then enter payment

**User Story:**

AS a buyer with verified holders
I WANT one tap to create my booking and hold the tickets
SO THAT I land on the payment page with stock held for 10 minutes

#### Acceptance Criteria

- WHEN `tickets` is empty or any ticket has an empty `validationToken` THEN SHALL return `not-verified` without a call
- WHEN `admissionToken` is null or empty THEN SHALL return `admission-invalid` without a call
- WHEN `bookingId` is null THEN SHALL call `createBooking(admissionToken, idempotencyKey, { eventId, tickets: [{
categoryId, validationToken }] })` with one entry per ticket in the given (slot) order, and nothing else in the body
- WHEN the create succeeds THEN SHALL call `enterPayment(created.bookingId, admissionToken)` and, on 200, return
  `{ kind: 'held', bookingId, resumed: false }`
- SHALL NOT return or keep `snapToken` (FR-20-W1 asks again; `enterPayment` is idempotent)
- SHALL NOT retry automatically (the buyer retries; error-handling rule)

### Requirement 3: Resume a half-done attempt

**User Story:**

AS a buyer whose payment entry failed after the booking was created
I WANT "Coba lagi" to repeat only the payment entry
SO THAT I don't hit "Anda masih punya pesanan aktif" for my own booking

#### Acceptance Criteria

- WHEN `bookingId` is given THEN SHALL skip `createBooking` and call only `enterPayment(bookingId, admissionToken)`
- WHEN payment entry fails retryably THEN the result SHALL carry that `bookingId` so the caller can pass it back
- WHEN create fails retryably THEN the result SHALL carry `bookingId: null` (the caller repeats the create with the same
  idempotency key, which the server answers with the same booking if it was in fact created)

### Requirement 4: Recover an existing active booking

**User Story:**

AS a buyer who already created this booking (another tab, a reload, a lost response)
I WANT the app to continue with it
SO THAT I can pay instead of being blocked for 5 minutes

#### Acceptance Criteria

- WHEN `createBooking` answers 409 `ACCOUNT_HAS_ACTIVE_BOOKING` THEN SHALL call `getActiveBooking()` once
- SHALL pick the item with `eventId === input.eventId` and status SELECTION or PAYMENT_PENDING
- WHEN that booking has the same tickets as the input (same category per ticket and the same NIK last 4 digits, compared
  as sorted `categoryId:last4` lists; by `price.lines` category quantities when `attendees` is absent) THEN:
  PAYMENT_PENDING SHALL return `held` with `resumed: true` and no payment call; SELECTION SHALL call `enterPayment` on it
  and classify as in Requirement 2
- WHEN no such booking exists, or its tickets differ THEN SHALL return `{ kind: 'active-booking', bookingId, status }`
  (`null`s when none) and SHALL NOT call `enterPayment`
- WHEN `getActiveBooking` fails transiently THEN SHALL return `retryable` with `bookingId: null`; any other failure SHALL
  be rethrown

### Requirement 5: Classify every answer

**User Story:**

AS the order controller
I WANT one result kind per user-visible state, with codes and ids, never sentences
SO THAT I can mark the right field or category and pick the right copy

#### Acceptance Criteria

- 403 `ADMISSION_INVALID` (either call) SHALL give `admission-invalid`
- 401 / `UNAUTHORIZED` (either call, after the adapter's refresh) SHALL give `unauthorized`
- 409 `NIK_SEAT_TAKEN` / `DUPLICATE_NIK` SHALL give `nik-conflict` with the `code`, the stage's `bookingId` (null at
  create) and `slotIndexes`: the indexes whose `nikLast4` equals the last 4 digits of the problem's `nikMasked`; `[]` when
  the problem has no usable `nikMasked` (always for create, whose 409 carries none) or nothing matches
- 409 `ATTENDEE_NOT_VALIDATED` SHALL give `attendees-stale`
- 409 `CATEGORY_SOLD_OUT` SHALL give `sold-out` with `categoryId` from the problem (null when absent) and the stage's
  `bookingId`
- 409 `QUANTITY_OVER_RESERVATION` SHALL give `over-reservation` with `categoryId` (or null)
- 409 `BOOKING_NOT_HELD` and 404 `NOT_FOUND` at payment entry SHALL give `not-held`
- status ≥ 500, `INTERNAL_ERROR`, `PAYMENT_PROVIDER_BUSY`, `SERVICE_UNAVAILABLE`, `NETWORK_ERROR`, `TIMEOUT` SHALL give
  `retryable` with the `code`, the `requestId` when present, and the stage's `bookingId`
- SHALL rethrow anything else (422 `VALIDATION_FAILED`, `UNKNOWN_ERROR`, other 4xx) as the same object
- SHALL NOT throw for an expected outcome; SHALL NOT include a NIK, a name or a validation token in any result

### Requirement 6: Registration and tests

**User Story:**

AS a developer
I WANT the use case in DI and every branch tested
SO THAT the controller can resolve it and rely on the union

#### Acceptance Criteria

- SHALL live in `src/core/use_case/booking/hold-booking.use-case.ts`, depend only on `bookingService`, and be registered
  as `holdBookingUseCase: asFunction(HoldBookingUseCase).singleton()` in `services.registry.ts`, typed in `AwilixRegistry`
- SHALL add `holdBookingUseCase` to `KEYS` in `src/infrastructure/di/__tests__/registry.test.ts`
- SHALL test every branch with plain-object fakes, including one test that an unclassified error propagates
- SHALL keep coverage ≥ 85%
