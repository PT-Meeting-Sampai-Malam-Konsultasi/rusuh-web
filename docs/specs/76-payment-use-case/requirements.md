# Requirements Document

## Introduction

Business logic for FR-20-W1 (rusuh-web#19, "Web: Payment page and Midtrans Snap (snap.js)"; parent FR-20,
rusuh-documentation#20: "Customer dapat memilih metode pembayaran dari mitra pembayaran yang tersedia"; T-07: Midtrans).
`PayBookingUseCase` loads the payment page (and tells "paid" from "no longer active" when the page answers 409), runs
"Bayar" (reuse the live Snap attempt or start one with the caller's idempotency key, then open Snap), and maps a status
poll to the next step. Snap callbacks are hints; only `bookingStatus: PAID` from the server means paid (LLD-03 §4.3,
ADR-0008). Sources: `openapi.yaml` (`getPaymentPage`, `startSnapPayment`, `getPaymentStatus`, `PaymentStatus`,
`BookingStatus`), LLD-03 §4.3, §4.4 (re-create = new attempt, old token not revoked; retry = change method inside Snap),
§5.2 (deny / cancel / failure is a failed attempt, the booking stays PAYMENT_PENDING), §6.1, ADR-0009 + ADR-0026 (late
settlement: EXPIRED, refund flagged), `customer-journey.md` §8–§11, `hifi-api-review.md` H-3, H-4. Uses spec 75; spec 77
calls it.

Decision under `.claude/rules/core-use-case.md` "When to create one": **yes**. "Multi-step flow, business validation,
branching on status" (page → status on 409; reuse vs start → open Snap), "mapping booking/payment status to the next
screen" (the rule's own example), and expected-error classification.

Out of scope (deferred): the countdown (FR-21-W1 / BR-05-W1), the expired screen (FR-23-W1), resume beyond reloading the
page (NFR-02-W1), a method picker (H-3).

## Glossary

| Term          | Definition                                                                                             |
| ------------- | ------------------------------------------------------------------------------------------------------ |
| Reusable snap | The attempt the caller may reopen: the view's `currentSnap`, or the one opened last on this page       |
| Attempt key   | The `Idempotency-Key` the controller holds; a new key after a failed attempt creates attempt n + 1     |
| Snap hint     | How the last Snap popup ended (`success`, `pending`, `error`); steers the verifying copy, never "paid" |
| Step          | What the page does next after a status poll: `paid`, `verifying`, `failed`, `inactive`                 |
| Refund note   | Shown with `inactive` when the payment arrived after expiry (`paid_after_expiry`, ADR-0009, H-4)       |

## Requirements

### Requirement 1: Load the payment page

**User Story:**

AS a buyer who just held tickets
I WANT the payment page to show my order, or tell me what happened to it
SO THAT I pay the right order, or I am not asked to pay a paid or dead one

#### Acceptance Criteria

- WHEN `bookingId` is empty THEN `load` SHALL return `not-found` without a call
- WHEN `getPaymentPage` answers 200 THEN SHALL return `{ kind: 'ready', view, tickets }`, `tickets` one per attendee in
  order: `categoryId`, `categoryName`, `nikMasked`, `unitPrice` (whole rupiah from the `price.lines` entry of that
  category; `null` when none matches); `fullName` SHALL NOT be copied
- WHEN it answers 409 `BOOKING_NOT_HELD` THEN SHALL call `getPaymentStatus` once and return `paid` for `bookingStatus:
PAID`, else `inactive` with `refund: paymentStatus === 'paid_after_expiry'`
- 404 / `NOT_FOUND` SHALL give `not-found`; 401 / `UNAUTHORIZED` SHALL give `unauthorized`
- SHALL rethrow anything else (5xx, transport, 422) as the same object, so the page shows its load error with a retry

### Requirement 2: Pay

**User Story:**

AS a buyer
I WANT one "Bayar" to open the Midtrans page
SO THAT I can pick QRIS, e-wallet or any method Midtrans offers there

#### Acceptance Criteria

- WHEN `bookingId` is empty THEN `pay` SHALL return `not-found` without a call
- WHEN `reusable` is given THEN SHALL NOT call `startSnap` and SHALL open that token (the live attempt stays payable;
  LLD-03 §4.4: retry is inside Snap on the same token)
- WHEN `reusable` is null THEN SHALL call `startSnap(bookingId, idempotencyKey)` once and open the returned token
- SHALL open Snap with `snap.pay(snapToken)` and return `{ kind: 'snap', outcome, snap }` where `outcome` is the
  popup's `success | pending | error | closed` and `snap` the opened transaction
- SHALL NOT send a `method`, retry by itself, or treat any outcome as paid

### Requirement 3: Classify pay failures

**User Story:**

AS the payment controller
I WANT one result kind per user-visible state
SO THAT I show busy, no-longer-active, paid or sign-in correctly

#### Acceptance Criteria

- `startSnap` 409 `BOOKING_NOT_HELD` SHALL go through the same status check as Requirement 1 (`paid` / `inactive`)
- 404 SHALL give `not-found`; 401 SHALL give `unauthorized`
- status ≥ 500, `PAYMENT_PROVIDER_BUSY`, `INTERNAL_ERROR`, `SERVICE_UNAVAILABLE`, `NETWORK_ERROR`, `TIMEOUT` SHALL give
  `{ kind: 'retryable', code, requestId?, snap: null }` (the caller retries with the same key)
- a `snap.pay` rejection coded `SNAP_UNAVAILABLE` SHALL give `{ kind: 'retryable', code: 'SNAP_UNAVAILABLE', snap }`
  with the transaction it tried to open (the retry reuses it, no new attempt)
- SHALL rethrow anything else as the same object; SHALL NOT include the snap token in anything but `snap`

### Requirement 4: Map the status to the next step

**User Story:**

AS a buyer back from the Midtrans page
I WANT the page to follow the real result
SO THAT I see my e-ticket only when the payment is confirmed, and can pay again when it failed

#### Acceptance Criteria

- `checkStatus(bookingId, hint)` SHALL call `getPaymentStatus` once and map it, first match:
  1. `bookingStatus: PAID` → `paid`
  2. `paymentStatus: paid_after_expiry` → `inactive` with `refund: true`
  3. `bookingStatus` EXPIRED, CANCELLED or SELECTION → `inactive` with `refund: false`
  4. `paymentStatus` denied, failed, cancelled or expired → `failed` with that `paymentStatus`
  5. `settled` → `verifying` `confirming` (the core transition lags the settlement)
  6. `pending` → `verifying`, `waiting` when the hint is `pending`, else `confirming`
  7. `none` or missing → `failed` (`paymentStatus: 'none'`) when the hint is `error`; else `verifying` as row 6
- SHALL treat `HELD` (pre-v1) as PAYMENT_PENDING
- SHALL rethrow every error (the poll keeps its interval; the controller handles 401)

### Requirement 5: Registration and tests

**User Story:**

AS a developer
I WANT the use case in DI and every branch tested
SO THAT the controller can resolve it and rely on the unions

#### Acceptance Criteria

- SHALL live in `src/core/use_case/payment/pay-booking.use-case.ts`, depend only on `paymentService` and `snap`, and be
  registered as `payBookingUseCase: asFunction(PayBookingUseCase).singleton()` in `services.registry.ts`, typed in
  `AwilixRegistry`, listed in `KEYS`
- SHALL test every branch with plain-object fakes, including one test that an unclassified error propagates unchanged
- SHALL keep coverage ≥ 85%
