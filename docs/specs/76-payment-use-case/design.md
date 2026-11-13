# Design Document

## Overview

`PayBookingUseCase` (`src/core/use_case/payment/pay-booking.use-case.ts`) has three members:

1. **`load(bookingId)`**: the payment view and its per-ticket lines, or `paid` / `inactive` / `not-found` /
   `unauthorized`. `getPaymentPage` answers 409 for "paid, expired or cancelled" alike, so a 409 is followed by one
   `getPaymentStatus` to tell a reload after paying (→ e-ticket) from a dead order.
2. **`pay(input)`**: reuse the live attempt or `startSnap` with the caller's key, then `snap.pay(token)`. One async
   operation for the controller's one mutation: the rule forbids chaining a service call in another mutation's
   `onSuccess`, so "start then open" lives here.
3. **`checkStatus(bookingId, hint)`**: one status poll mapped to the next step.

**Idempotency and attempts (the key is input, as in spec 72).** LLD-03 §4.4: retry is "ganti metode di dalam Snap" on the
same token, and the old token stays payable; a re-create is a new attempt. So:

| Situation                                                    | Controller passes                | Effect                                                    |
| ------------------------------------------------------------ | -------------------------------- | --------------------------------------------------------- |
| First "Bayar", view has `currentSnap` (FR-16 made attempt 1) | `reusable: currentSnap`          | no `startSnap`; Snap opens attempt 1                      |
| First "Bayar", no `currentSnap`                              | `reusable: null`, key K1         | `startSnap(K1)` → attempt n                               |
| Snap closed / Snap unavailable, "Bayar" again                | `reusable: the opened snap`      | same token reopened, no new attempt                       |
| `retryable` busy after `startSnap`, "Coba lagi"              | `reusable: null`, same key K1    | same key: the server returns the attempt it may have made |
| Status says `failed`, "Bayar lagi"                           | `reusable: null`, **new** key K2 | attempt n + 1 (new `order_id`), as LLD-03 §4.4            |

A new key after a failure is required: with the same key the server answers the failed attempt for 24 h. Reopening a
denied token would land the buyer on a dead Snap transaction.

**Snap hints are hints.** No outcome of `snap.pay` maps to `paid`. `success` / `pending` / `error` only start the
poll and pick the copy; `closed` sends the page back to ready. `paid` comes only from `bookingStatus: PAID`.

**`fullName` is dropped.** The HiFi summary shows category + masked NIK per ticket, no names; the use case does not pass
names on.

## Architecture

```
paymentController (spec 77)
  ├─ useQuery  ─► payBookingUseCase.load(bookingId)
  │                 ├─ '' ─────────────────────────────► not-found (no call)
  │                 ├─ getPaymentPage 200 ─────────────► ready { view, tickets }
  │                 ├─ 409 BOOKING_NOT_HELD ─► getPaymentStatus ─► paid | inactive { refund }
  │                 ├─ 404 ► not-found · 401 ► unauthorized · other ► rethrow
  ├─ useMutation ─► payBookingUseCase.pay({ bookingId, idempotencyKey, reusable })
  │                 ├─ reusable ? reuse : startSnap(bookingId, key)
  │                 │     409 ► status check · 404 ► not-found · 401 ► unauthorized · transient ► retryable(snap: null) · other ► rethrow
  │                 └─ snap.pay(token) ─► snap { outcome, snap }   ·   SNAP_UNAVAILABLE ► retryable(snap) · other ► rethrow
  └─ useQuery (refetchInterval) ─► payBookingUseCase.checkStatus(bookingId, hint) ─► paid | verifying | failed | inactive
```

Files:

| File                                                               | Change                       |
| ------------------------------------------------------------------ | ---------------------------- |
| `src/core/use_case/payment/pay-booking.use-case.ts`                | new                          |
| `src/core/use_case/payment/__tests__/pay-booking.use-case.test.ts` | new                          |
| `src/infrastructure/di/services.registry.ts`                       | register `payBookingUseCase` |
| `src/infrastructure/di/registry.types.ts`                          | add `payBookingUseCase`      |
| `src/infrastructure/di/__tests__/registry.test.ts`                 | key in `KEYS`; resolves      |

## Components and Interfaces

```ts
// src/core/use_case/payment/pay-booking.use-case.ts
import type {
  PaymentStatus,
  PaymentStatusResponse,
  PaymentView,
  SnapTransaction,
} from '@core/entities/payment/payment.entity';
import type { HttpError } from '@core/protocols/http.protocol';
import type { SnapPayResult } from '@core/protocols/snap.protocol';
import { errorCodeOf } from '@core/use_case/device/with-device-token';
import type { AwilixRegistry } from '@infrastructure/di/registry.types';

/** How the last Snap popup ended, when it started a poll ('closed' does not poll). */
export type SnapHint = 'success' | 'pending' | 'error';

/** One summary line per ticket (category, masked NIK, unit price). No name. */
export interface PaymentTicketLine {
  categoryId: string;
  categoryName: string;
  /** "3174 •••• •••• 0004". */
  nikMasked: string;
  /** Whole rupiah from price.lines; null when the category has no line. */
  unitPrice: number | null;
}

export type PaymentPageResult =
  | { kind: 'ready'; view: PaymentView; tickets: PaymentTicketLine[] }
  /** 409 and the status says PAID: go to the e-ticket. */
  | { kind: 'paid' }
  /** 409 and expired / cancelled. refund: the payment arrived after expiry (ADR-0009). */
  | { kind: 'inactive'; refund: boolean }
  /** Empty id, 404 (unknown or someone else's booking). */
  | { kind: 'not-found' }
  | { kind: 'unauthorized' };

export interface PayInput {
  bookingId: string;
  /** The controller's attempt key (a UUID); a new one only after a failed attempt. */
  idempotencyKey: string;
  /** A transaction to reopen (the view's currentSnap or the one opened last); null to start one. */
  reusable: SnapTransaction | null;
}

export type PayResult =
  /** Snap was shown and ended this way: a hint, never a confirmation. */
  | { kind: 'snap'; outcome: SnapPayResult['kind']; snap: SnapTransaction }
  | { kind: 'paid' }
  | { kind: 'inactive'; refund: boolean }
  | { kind: 'not-found' }
  | { kind: 'unauthorized' }
  /** Busy / transport / Snap would not open. snap: reopen it on the retry (null: start again, same key). */
  | { kind: 'retryable'; code: string; requestId?: string; snap: SnapTransaction | null };

export type PaymentStep =
  | { kind: 'paid' }
  /** confirming: money sent, waiting for Midtrans / core. waiting: a VA / QRIS that is not paid yet. */
  | { kind: 'verifying'; reason: 'confirming' | 'waiting' }
  /** The attempt failed; the booking is still PAYMENT_PENDING, so the buyer can pay again (new attempt). */
  | { kind: 'failed'; paymentStatus: PaymentStatus }
  | { kind: 'inactive'; refund: boolean };

export interface PayBookingUseCaseInterface {
  load: (bookingId: string) => Promise<PaymentPageResult>;
  /** At most: startSnap, snap.pay, and on 409 one getPaymentStatus. Never retried here. */
  pay: (input: PayInput) => Promise<PayResult>;
  checkStatus: (bookingId: string, hint: SnapHint) => Promise<PaymentStep>;
}

export const PayBookingUseCase = ({
  paymentService,
  snap,
}: Pick<AwilixRegistry, 'paymentService' | 'snap'>): PayBookingUseCaseInterface;
```

Private module-scope constants and pure helpers (no mutable state):

```ts
const TRANSIENT_CODES = new Set(['INTERNAL_ERROR', 'PAYMENT_PROVIDER_BUSY', 'SERVICE_UNAVAILABLE', 'NETWORK_ERROR', 'TIMEOUT']);
const FAILED: ReadonlySet<PaymentStatus> = new Set(['denied', 'failed', 'cancelled', 'expired']);
const DEAD = new Set(['EXPIRED', 'CANCELLED', 'SELECTION']);

const statusOf = (error: unknown): number => (error as HttpError | null)?.status ?? 0;
const isTransient = (error: unknown) => TRANSIENT_CODES.has(errorCodeOf(error) ?? '') || statusOf(error) >= 500;
const isUnauthorized = (error: unknown) => errorCodeOf(error) === 'UNAUTHORIZED' || statusOf(error) === 401;
const isNotFound = (error: unknown) => errorCodeOf(error) === 'NOT_FOUND' || statusOf(error) === 404;
const isNotHeld = (error: unknown) => errorCodeOf(error) === 'BOOKING_NOT_HELD';
const requestIdOf = (error: unknown): string | undefined => …; // a string requestId, else undefined

/** Rows 1–7 of Requirement 4. */
const stepOf = (status: PaymentStatusResponse, hint: SnapHint): PaymentStep => …;
/** Attendees in order with the unit price of their category's line. */
const ticketLines = (view: PaymentView): PaymentTicketLine[] => …;
```

Behaviour:

- `settle(bookingId)` (private, used after a 409): `try getPaymentStatus` → `data.bookingStatus === 'PAID'` ? `paid` :
  `inactive { refund: data.paymentStatus === 'paid_after_expiry' }`; `catch` → unauthorized ? `unauthorized` : `throw`.
- `load(id)`: `''` → `not-found`; `try getPaymentPage(id)` → `ready { view: data, tickets: ticketLines(data) }`; `catch`:
  not held → `settle`; not found → `not-found`; unauthorized → `unauthorized`; else `throw error`.
- `pay({ bookingId, idempotencyKey, reusable })`: `''` → `not-found`. `let tx = reusable`; if null: `try tx = (await
startSnap(bookingId, idempotencyKey)).data` `catch` not held → `settle`; not found → `not-found`; unauthorized →
  `unauthorized`; transient → `retryable { code: errorCodeOf ?? 'UNKNOWN_ERROR', requestId, snap: null }`; else `throw`.
  Then `try { const r = await snap.pay(tx.snapToken); return { kind: 'snap', outcome: r.kind, snap: tx } }` `catch` →
  `errorCodeOf === 'SNAP_UNAVAILABLE'` ? `retryable { code: 'SNAP_UNAVAILABLE', snap: tx }` : `throw`.
- `checkStatus(id, hint)`: `stepOf((await getPaymentStatus(id)).data, hint)`; no catch.
- `stepOf`, first match: `bookingStatus === 'PAID'` → paid; `paymentStatus === 'paid_after_expiry'` → inactive true;
  `DEAD.has(bookingStatus)` → inactive false; `FAILED.has(paymentStatus)` → failed; `settled` → verifying confirming;
  `pending` → verifying (`hint === 'pending'` ? waiting : confirming); else (`none` / undefined) → `hint === 'error'` ?
  failed `none` : verifying as `pending`. PAYMENT_PENDING and HELD reach rows 4–7.

DI:

```ts
// src/infrastructure/di/registry.types.ts (in "use cases", after getETicketUseCase)
import type { PayBookingUseCaseInterface } from '@core/use_case/payment/pay-booking.use-case';
  payBookingUseCase: PayBookingUseCaseInterface;

// src/infrastructure/di/services.registry.ts (after getETicketUseCase)
    payBookingUseCase: asFunction(PayBookingUseCase).singleton(),
```

Compile check: `paymentService` and `snap` are registry keys after spec 75; `errorCodeOf` is exported by
`with-device-token.ts` (used by spec 72); `SnapPayResult['kind']` is the four-literal union; `PaymentView.price.lines[]`
has `categoryId` and `unitPrice: Money`. `snap` is registered by `di/controllers/payment.ts`, so `payBookingUseCase`
resolves only after that file ran: true on the payment page (the shell imports it) and in `registry.test.ts` (it loads
every `di/controllers` file before resolving). Key count = registration count.

## Data Models

`load` (view: Festival B × 2 at 850 000, Tribun Atas × 1 at 450 000):

| Answers                                          | Calls        | Result                                                                 |
| ------------------------------------------------ | ------------ | ---------------------------------------------------------------------- |
| id `''`                                          | none         | `not-found`                                                            |
| page 200                                         | page         | `ready`, tickets `[FB 850000, FB 850000, TA 450000]` in attendee order |
| page 200, an attendee of a category with no line | page         | that line's `unitPrice: null`                                          |
| page 409 → status `PAID / settled`               | page, status | `paid`                                                                 |
| page 409 → status `EXPIRED / expired`            | page, status | `inactive false`                                                       |
| page 409 → status `EXPIRED / paid_after_expiry`  | page, status | `inactive true`                                                        |
| page 409 → status `CANCELLED`                    | page, status | `inactive false`                                                       |
| page 409 → status 401                            | page, status | `unauthorized`                                                         |
| page 409 → status 503                            | page, status | rethrow                                                                |
| page 404 / 401                                   | page         | `not-found` / `unauthorized`                                           |
| page 503 / `NETWORK_ERROR` / 422                 | page         | rethrow (same object)                                                  |

`pay` (`S1` = attempt 1, `S2` = attempt 2):

| Input / answers                                     | Calls                        | Result                                                     |
| --------------------------------------------------- | ---------------------------- | ---------------------------------------------------------- |
| id `''`                                             | none                         | `not-found`                                                |
| `reusable: S1`, Snap `success`                      | snap.pay(S1)                 | `snap success, S1`                                         |
| `reusable: S1`, Snap `closed` / `pending` / `error` | snap.pay(S1)                 | `snap <outcome>, S1`                                       |
| `reusable: null` → start 201 S2, Snap `success`     | start(id, key), snap.pay(S2) | `snap success, S2`                                         |
| start 503 `PAYMENT_PROVIDER_BUSY`                   | start                        | `retryable PAYMENT_PROVIDER_BUSY, snap null` (+ requestId) |
| start `NETWORK_ERROR` / `TIMEOUT` / 500             | start                        | `retryable <code>, snap null`                              |
| start 409 → status PAID                             | start, status                | `paid`                                                     |
| start 409 → status EXPIRED / paid_after_expiry      | start, status                | `inactive true`                                            |
| start 404 / 401                                     | start                        | `not-found` / `unauthorized`                               |
| start 422 `VALIDATION_FAILED`                       | start                        | rethrow                                                    |
| `reusable: S1`, snap.pay rejects `SNAP_UNAVAILABLE` | snap.pay                     | `retryable SNAP_UNAVAILABLE, snap S1`                      |
| snap.pay rejects something else                     | snap.pay                     | rethrow                                                    |

`checkStatus` (`bookingStatus / paymentStatus`, hint):

| Status                                        | hint                | Step                   |
| --------------------------------------------- | ------------------- | ---------------------- |
| `PAID / settled` (or any)                     | any                 | `paid`                 |
| `EXPIRED / paid_after_expiry`                 | any                 | `inactive true`        |
| `PAYMENT_PENDING / paid_after_expiry`         | any                 | `inactive true`        |
| `EXPIRED / expired`, `CANCELLED`, `SELECTION` | any                 | `inactive false`       |
| `PAYMENT_PENDING / denied`                    | any                 | `failed denied`        |
| `… / failed`, `cancelled`, `expired`          | any                 | `failed <status>`      |
| `PAYMENT_PENDING / settled`                   | any                 | `verifying confirming` |
| `PAYMENT_PENDING / pending`                   | `pending`           | `verifying waiting`    |
| `PAYMENT_PENDING / pending`                   | `success` / `error` | `verifying confirming` |
| `PAYMENT_PENDING / none` or missing           | `error`             | `failed none`          |
| `PAYMENT_PENDING / none` or missing           | `success`           | `verifying confirming` |
| `PAYMENT_PENDING / none` or missing           | `pending`           | `verifying waiting`    |
| `HELD / pending`                              | `success`           | `verifying confirming` |

## Layer Constraints

From `.claude/rules/core-use-case.md`:

- `src/core/use_case/{domain}/{action}.use-case.ts`
- Depend only on services, config and other use cases from `AwilixRegistry`
- Zero React, zero Next.js, zero hooks, zero browser APIs
- Multi-step orchestration (check → validate → transform → decide)
- Business rules and validation, for example:
  - mapping booking/payment status to the next screen
- Transforming API responses into domain models
- Classifying expected API errors into business outcomes
- React state, TanStack Query, navigation, analytics, `t()`, user-facing strings, loading overlays, popups
- Return **typed discriminated unions**; never throw for an expected business outcome:
- Catch only the specific `HttpError` codes you classify; re-throw everything else for the controller.
- Return codes, never sentences: the controller maps codes to translation keys.
- Stateless; registered as `asFunction(UseCase).singleton()`; interface added to `AwilixRegistry`.

| Scenario                                                  | Use case?                                          |
| --------------------------------------------------------- | -------------------------------------------------- |
| Simple GET, no transformation                             | No — controller wraps the service in `useQuery`    |
| Simple POST, no branching                                 | No — controller wraps the service in `useMutation` |
| Multi-step flow, business validation, branching on status | Yes                                                |
| Aggregating or transforming data from several services    | Yes                                                |

- `src/core/use_case/{domain}/__tests__/{action}.use-case.test.ts`
- Plain object mocks, every business branch, and one test that infrastructure errors propagate.
- Coverage threshold 85%.
- ❌ React or Next.js imports
- ❌ User-facing strings
- ❌ Catching all errors
- ❌ Navigation, analytics or translation calls
- ❌ Module-level mutable state
- ❌ A use case that only forwards one service call
- ❌ Throwing for an expected outcome

Note on "depend only on services, config and other use cases": the use case also takes the `snap` protocol, as
`verifySignInCodeUseCase` takes `turnstile` and `followQueueUseCase` takes `queueStream`. It only sees `SnapProtocol`
(no browser API, no `window`), so it stays pure and testable with a plain fake.

From `.claude/rules/error-handling.md`:

- No automatic replay of failed mutations; the user retries.
- ❌ Auto-retrying mutations without the user

From `.claude/rules/scaffold.md`:

- Services and use cases: `asFunction(Factory).singleton()`
- `AwilixRegistry` (`src/infrastructure/di/registry.types.ts`) is the single source of truth. **Every key in it has a
  `container.register()` call** in one of the three registries or a `di/controllers/` file. Awilix resolves at
  runtime, so TypeScript will not catch a missing registration. Count keys vs registrations after every change.

From `CLAUDE.md`:

- Errors from the API carry a stable `code`; map it to a translation key, never show raw messages.
- NIKs are shown masked after entry and never logged.

## Correctness Properties

- Property 1: for every row of the `load` table the result and the exact call list match; `tickets.length ===
view.attendees.length`, in order, and no ticket line has a `fullName` key. **Validates: Requirements 1**
- Property 2: for every row of the `pay` table the result and the exact call list (names, arguments, order) match.
  **Validates: Requirements 2, 3**
- Property 3: with `reusable` given, `startSnap` is never called; with `reusable: null`, `startSnap` is called once with
  exactly `(bookingId, idempotencyKey)`. **Validates: Requirements 2**
- Property 4: no `snap.pay` outcome (`success`, `pending`, `error`, `closed`) ever yields `kind: 'paid'`; `paid` only
  follows a status answer with `bookingStatus: 'PAID'`. **Validates: Requirements 2, 4**
- Property 5: for every row of the `checkStatus` table the step matches. **Validates: Requirements 4**
- Property 6: every unclassified error is rethrown as the same object (`toBe`) from `load`, `pay` (start and snap) and
  `checkStatus`. **Validates: Requirements 1, 3, 4**
- Property 7: `JSON.stringify` of every `load` / `checkStatus` result, and of `pay` results without a `snap` member,
  contains no snap token and no attendee name. **Validates: Requirements 1, 3**
- Property 8: at most three calls per `pay` (start, pay, status) and two per `load`; none repeated.
  **Validates: Requirements 2, 3**

## Error Handling

| Stage               | Code / condition                                                                                    | Outcome                                          |
| ------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| before              | empty `bookingId`                                                                                   | `not-found` (no call)                            |
| page, start         | 409 `BOOKING_NOT_HELD`                                                                              | status → `paid` / `inactive`                     |
| page, start         | 404 `NOT_FOUND`                                                                                     | `not-found`                                      |
| page, start, settle | 401 `UNAUTHORIZED`                                                                                  | `unauthorized`                                   |
| start               | ≥ 500, `PAYMENT_PROVIDER_BUSY`, `INTERNAL_ERROR`, `SERVICE_UNAVAILABLE`, `NETWORK_ERROR`, `TIMEOUT` | `retryable` (`snap: null`)                       |
| snap.pay            | `SNAP_UNAVAILABLE`                                                                                  | `retryable` (`snap` kept)                        |
| page                | ≥ 500 / transport                                                                                   | rethrown: the page's load error with "Coba lagi" |
| status              | any                                                                                                 | rethrown                                         |
| any                 | 422 `VALIDATION_FAILED`, `UNKNOWN_ERROR`, other                                                     | rethrown                                         |

**Doc conflicts recorded:**

- `customer-journey.md` §9 says "expiry = hold − 60 s" and the booking "stays HELD"; `openapi.yaml` and LLD-03 §4 (later)
  say Snap expiry = P + 10 and the v1 state is PAYMENT_PENDING. This spec follows the contract; `HELD` is handled like
  PAYMENT_PENDING for old records.
- `getPaymentPage` documents no 404; `getBooking` answers 404 for unknown and other people's bookings, so the same is
  assumed here (`not-found`). Asking core to document it is an open question.
- LLD-03 §6.1 mentions a FE "cek status" button (`check-status`, throttled to 1 per 10 s). The contract's
  `getPaymentStatus` is a plain poll; no button is built, and the poll interval (spec 77) is 4 s, inside the 3–5 s the
  contract asks for.

## Testing Strategy

`src/core/use_case/payment/__tests__/pay-booking.use-case.test.ts`, plain-object fakes: `paymentService` with
`getPaymentPage`, `startSnap`, `getPaymentStatus` as `vi.fn()`, `snap` with `load`, `pay` as `vi.fn()` (cast `as never`),
problems as plain `{ status, code, message, requestId }` objects:

- `load`, `pay`, `checkStatus`: `it.each` over the three tables with `mockResolvedValueOnce` / `mockRejectedValueOnce`;
  `toHaveBeenNthCalledWith` for every call and `not.toHaveBeenCalled` for skipped ones; `toBe` identity for rethrows;
  Properties 4, 7, 8 on every row.
- `registry.test.ts`: `payBookingUseCase` in `KEYS`; it resolves as a singleton with `load`, `pay`, `checkStatus`.
- Gate: `npm run typecheck && npm run lint && npx vitest --run`; coverage ≥ 85% on the new file.
