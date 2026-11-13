# Design Document

## Overview

`PayBookingUseCase` (`src/core/use_case/payment/pay-booking.use-case.ts`) is extended, not replaced. One private helper,
`endedOutcome(bookingId, status)`, becomes the single exit of every inactive path:

1. `settle` (after a 409 `BOOKING_NOT_HELD` on `load` / `pay`): non-PAID → `endedOutcome`.
2. `checkStatus`: when `stepOf` decides the step is dead (`paid_after_expiry`, or `bookingStatus` in `DEAD`) →
   `endedOutcome`. All other steps are returned as today, with no extra call.

`endedOutcome` makes one `bookingService.getBooking` call and classifies. This is a use case concern (rule table:
"branching on status", "aggregating data from several services"): the reason, the event and the count come from two
services and are business decisions, not formatting.

**Rule tension, recorded.** `core-use-case.md` says "catch only the specific `HttpError` codes you classify; re-throw
everything else". Here every non-401 failure of the Booking read is caught on purpose: the read only enriches an outcome
the use case has already decided from `getPaymentStatus`, and losing it must not turn an expired order into an error
screen (ticket decision 1). The catch is limited to that one call; `getPaymentStatus` errors still propagate.

**Why not trust the Status alone.** `getPaymentStatus` has no `eventId` and no ticket count, and right at the deadline
the sweeper may not yet have moved the booking to `EXPIRED` (ADR-0026: "within a second"), so the 409 can come with
`bookingStatus: PAYMENT_PENDING`. The Booking's own `expiresAt ≤ serverNow` (server clock, ADR-0005) classifies that race
as expired.

## Architecture

```
paymentController ─► payBookingUseCase.load / pay / checkStatus
                        │
                        ├─ paymentService.getPaymentPage / startSnap / getPaymentStatus     unchanged
                        └─ inactive path ─► endedOutcome(bookingId, status)
                                              └─ bookingService.getBooking(bookingId)   ← new, once, never retried
```

API operations: `getPaymentPage` (200 / 409 / 404 / 401), `startSnapPayment` (409 / 404 / 401 / 503), `getPaymentStatus`
(200 / 401), `getBooking` (200 / 404 / 401; 5xx and transport as for any call). No new service method.

## Components and Interfaces

```ts
// src/core/use_case/payment/pay-booking.use-case.ts (changes; everything else unchanged)
import type { Booking, BookingStatus } from '@core/entities/booking/booking.entity'; // classification only

/** Why the order can no longer be paid. expired: the 10 minutes ran out (late payments included). other: anything else. */
export type InactiveReason = 'expired' | 'other';

/** The booking is dead (409 BOOKING_NOT_HELD or a dead status). eventId / ticketCount are null when getBooking failed. */
export interface InactiveOutcome {
  kind: 'inactive';
  /** A payment arrived after expiry (ADR-0009): paid_after_expiry or booking.refundRequired. */
  refund: boolean;
  reason: InactiveReason;
  eventId: string | null;
  /** Tickets the booking held; null when unknown or 0. */
  ticketCount: number | null;
}

export type PaymentPageResult =
  | { kind: 'ready'; view: PaymentView; tickets: PaymentTicketLine[] }
  | { kind: 'paid' }
  | InactiveOutcome
  | { kind: 'not-found' }
  | { kind: 'unauthorized' };

export type PayResult =
  | { kind: 'snap'; outcome: SnapPayResult['kind']; snap: SnapTransaction }
  | { kind: 'paid' }
  | InactiveOutcome
  | { kind: 'not-found' }
  | { kind: 'unauthorized' }
  | { kind: 'retryable'; code: string; requestId?: string; snap: SnapTransaction | null };

export type PaymentStep =
  | { kind: 'paid' }
  | { kind: 'verifying'; reason: 'confirming' | 'waiting' }
  | { kind: 'failed'; paymentStatus: PaymentStatus }
  | InactiveOutcome;

export interface PayBookingUseCaseInterface {
  /** ready: 1 call. 409: + getPaymentStatus; dead: + getBooking (3 at most). */
  load: (bookingId: string) => Promise<PaymentPageResult>;
  /** At most: startSnap, snap.pay; or on 409 startSnap, getPaymentStatus, getBooking (dead only). Never retried here. */
  pay: (input: PayInput) => Promise<PayResult>;
  /** 1 call; + getBooking only when the step is inactive. A 401 from either call is thrown. */
  checkStatus: (bookingId: string, hint: SnapHint) => Promise<PaymentStep>;
}

export const PayBookingUseCase = ({
  paymentService,
  bookingService,
  snap,
}: Pick<AwilixRegistry, 'paymentService' | 'bookingService' | 'snap'>): PayBookingUseCaseInterface => { … };
```

Classification (module scope, pure; `booking: Booking | null`, null after a failed read):

```ts
const EXPIRED_BY_TIME: ReadonlySet<BookingStatus> = new Set<BookingStatus>(['PAYMENT_PENDING', 'HELD']);

// refund  = status.paymentStatus === 'paid_after_expiry' || booking?.refundRequired === true
// expired = refund
//        || status.bookingStatus === 'EXPIRED'
//        || booking?.status === 'EXPIRED'
//        || (booking && EXPIRED_BY_TIME.has(booking.status) && booking.expiresAt
//              && Date.parse(booking.expiresAt) <= Date.parse(booking.serverNow))
// ticketCount = booking ? (booking.attendees?.length || sum(booking.price.lines[].quantity) || null) : null
// eventId     = booking?.eventId ?? null
```

- `stepOf` keeps its order; its two inactive branches return a marker that `checkStatus` turns into
  `await endedOutcome(bookingId, status)`. `settle` calls `endedOutcome` inside its existing `try`, so a 401 from
  `getBooking` becomes `{ kind: 'unauthorized' }` there; `checkStatus` lets it throw.
- `endedOutcome` catches the Booking read: `isUnauthorized(error)` → re-throw; anything else → `booking = null`.
- Compile check: `bookingService: BookingServiceInterface` is already in `AwilixRegistry`; `getBooking` returns
  `Promise<HttpResponse<Booking>>`. The use case stays `asFunction(PayBookingUseCase).singleton()`; Awilix PROXY injects
  the new key. `exactOptionalPropertyTypes` is respected: `eventId` / `ticketCount` are `| null`, never `undefined`.

## Data Models

| Status (`bookingStatus` / `paymentStatus`) | Booking read                                     | Result                                                                   |
| ------------------------------------------ | ------------------------------------------------ | ------------------------------------------------------------------------ |
| `EXPIRED` / `expired`                      | `EXPIRED`, 3 attendees, `evt_1`                  | `{ refund: false, reason: 'expired', eventId: 'evt_1', ticketCount: 3 }` |
| `EXPIRED` / `paid_after_expiry`            | `EXPIRED`, `refundRequired: true`, 2 attendees   | `{ refund: true, reason: 'expired', eventId, ticketCount: 2 }`           |
| `PAYMENT_PENDING` / `pending` (409 race)   | `PAYMENT_PENDING`, `expiresAt` = `serverNow`     | `reason: 'expired'`                                                      |
| `PAYMENT_PENDING` / `none` (409)           | `PAYMENT_PENDING`, `expiresAt` after `serverNow` | `reason: 'other'`                                                        |
| `CANCELLED`                                | `CANCELLED`                                      | `{ refund: false, reason: 'other', eventId, ticketCount }`               |
| `SELECTION`                                | `SELECTION`, no attendees, lines 1 + 1           | `reason: 'other'`, `ticketCount: 2`                                      |
| `EXPIRED`                                  | 503 / `NETWORK_ERROR` / 404                      | `{ refund: false, reason: 'expired', eventId: null, ticketCount: null }` |
| `EXPIRED` / `paid_after_expiry`            | 500                                              | `{ refund: true, reason: 'expired', eventId: null, ticketCount: null }`  |
| any dead                                   | 401                                              | `load` / `pay`: `{ kind: 'unauthorized' }`; `checkStatus`: throws        |

## Layer Constraints

From `.claude/rules/core-use-case.md`:

- `src/core/use_case/{domain}/{action}.use-case.ts`
- Depend only on services, config and other use cases from `AwilixRegistry`
- Zero React, zero Next.js, zero hooks, zero browser APIs
- Multi-step orchestration (check → validate → transform → decide)
- mapping booking/payment status to the next screen
- Transforming API responses into domain models
- Classifying expected API errors into business outcomes
- React state, TanStack Query, navigation, analytics, `t()`, user-facing strings, loading overlays, popups
- Return **typed discriminated unions**; never throw for an expected business outcome:
- Catch only the specific `HttpError` codes you classify; re-throw everything else for the controller.
- Return codes, never sentences: the controller maps codes to translation keys.
- Stateless; registered as `asFunction(UseCase).singleton()`; interface added to `AwilixRegistry`.
- `src/core/use_case/{domain}/__tests__/{action}.use-case.test.ts`
- Plain object mocks, every business branch, and one test that infrastructure errors propagate.
- Coverage threshold 85%.
- ❌ React or Next.js imports
- ❌ User-facing strings
- ❌ Catching all errors
- ❌ Navigation, analytics or translation calls
- ❌ Module-level mutable state
- ❌ Throwing for an expected outcome

Notes: the only catch-all is the Booking read inside `endedOutcome` (see Overview, rule tension); 401 is still
re-thrown there. `EXPIRED_BY_TIME` is an immutable constant, not mutable state. `Date.parse` on two server strings is
pure arithmetic, not a browser API or the device clock.

## Correctness Properties

- Property 1: each row of the Data Models table, through `load` (409 → status → booking), gives exactly that
  `InactiveOutcome`. **Validates: Requirements 1, 2**
- Property 2: the same Status / Booking pairs through `checkStatus(…, 'success')` give the same outcomes; `pay` with a
  409 on `startSnap` gives them too and never calls `snap.pay`. **Validates: Requirements 1, 3**
- Property 3: `getBooking` is called exactly once (with `bookingId`) on every inactive path and zero times on `ready`,
  `paid`, `snap`, `retryable`, `not-found`, `failed`, `verifying`. **Validates: Requirements 3**
- Property 4: a 401 / `UNAUTHORIZED` from `getBooking` gives `{ kind: 'unauthorized' }` from `load` and `pay` and rejects
  `checkStatus` with that error; any other rejection is not retried and yields `eventId: null, ticketCount: null`.
  **Validates: Requirements 2**
- Property 5: with a faked device clock in 2031, the `PAYMENT_PENDING` race rows classify the same (only
  `booking.serverNow` is compared). **Validates: Requirements 1**
- Property 6: a `getPaymentStatus` rejection with 500 propagates from `load`, `pay` and `checkStatus` (no `getBooking`).
  **Validates: Requirements 4**
- Property 7: every existing test, with `{ kind: 'inactive', refund }` expectations widened to `InactiveOutcome`,
  passes. **Validates: Requirements 4**

## Error Handling

| Call / outcome                                                                                                  | Use case returns                                      |
| --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `getPaymentPage` / `startSnap` 409 `BOOKING_NOT_HELD` → status PAID                                             | `{ kind: 'paid' }` (unchanged, no `getBooking`)       |
| same → status dead                                                                                              | `InactiveOutcome` (one `getBooking`)                  |
| `getPaymentStatus` 401 inside `settle`                                                                          | `{ kind: 'unauthorized' }` (unchanged)                |
| `getPaymentStatus` other error                                                                                  | thrown (unchanged)                                    |
| `getBooking` 200                                                                                                | enriched outcome                                      |
| `getBooking` 401 / `UNAUTHORIZED`                                                                               | `load` / `pay`: `unauthorized`; `checkStatus`: thrown |
| `getBooking` 404 `NOT_FOUND`, 5xx `INTERNAL_ERROR` / `SERVICE_UNAVAILABLE`, `NETWORK_ERROR`, `TIMEOUT`, unknown | outcome with `eventId: null, ticketCount: null`       |
| 404 / 401 / 503 `PAYMENT_PROVIDER_BUSY` / `SNAP_UNAVAILABLE` on the existing calls                              | unchanged (spec 76)                                   |

## Testing Strategy

`src/core/use_case/payment/__tests__/pay-booking.use-case.test.ts`:

- Add `bookingService: { getBooking: vi.fn() }` to the deps factory; a `booking(overrides)` fixture with `eventId`,
  `attendees`, `price.lines`, `serverNow`, `expiresAt`.
- `describe('inactive outcome (FR-23-W1)')`: `it.each` over the Data Models rows for `load`, `checkStatus` and `pay`
  (Properties 1, 2); call counts per method (Property 3); 401 vs other failures (Property 4); fake clock (Property 5).
- Widen the existing inactive expectations; keep the propagation tests (Property 6).
- Gate: `npx tsc --noEmit && npx vitest --run`; use-case coverage ≥ 85%. `tsc` will flag the controller's
  `{ kind: 'inactive', refund }` uses: spec 82 lands in the same PR.
