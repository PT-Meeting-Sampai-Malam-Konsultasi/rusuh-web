# Design Document

## Overview

`HoldBookingUseCase` (`src/core/use_case/booking/hold-booking.use-case.ts`) has two members:

1. **`quote(categories, quantities, adminFee)`**: pure, synchronous pricing for the summary aside and dock. The admin fee
   is charged once per order (ADR-0010); the HiFi's `FEE × tickets` is the H-1 conflict the ADR settles.
2. **`execute(input)`**: the v1 hold. Create the SELECTION booking (unless the caller already has one), then enter
   payment (the atomic hold, PAYMENT_PENDING). 409 `ACCOUNT_HAS_ACTIVE_BOOKING` turns into one `getActiveBooking` call
   and, when the active booking is the same order, a payment entry on it. Every answer becomes one result kind.

**Why a use case** (`.claude/rules/core-use-case.md` "When to create one"): "Multi-step flow, business validation,
branching on status" → Yes. Two or three calls in sequence, a status branch (SELECTION vs PAYMENT_PENDING), a business
match ("is the active booking this order?") and error classification. The controller rule forbids calling a service in
another mutation's `onSuccess`, so the sequence cannot live in the controller either.

**No automatic retry.** Unlike `validateAttendeeUseCase` (one retry on a Dukcapil blip), a retry here can create a
second payment attempt, and the error-handling rule says "No automatic replay of failed mutations; the user retries".
`retryable` is returned at once; the controller offers "Coba lagi".

**The idempotency key is input, not made here.** A UUID needs `crypto` (a browser API) and belongs to the attempt, which
the controller tracks across retries (spec 73). The use case only forwards it.

**Union names vs the brief.** The brief sketched `held | nik-taken | sold-out | over-reservation | admission-invalid |
unauthorized | retryable | error`. This spec: `nik-taken` → `nik-conflict` (it also carries `DUPLICATE_NIK`, with the
code); adds `not-verified`, `attendees-stale`, `active-booking`, `not-held` (each has its own copy or action in spec 73);
drops `error`: the rule says "Catch only the specific `HttpError` codes you classify; re-throw everything else", so
unclassified errors reach the mutation's `onError`.

## Architecture

```
orderController (spec 73)
  ├─ every render:   holdBookingUseCase.quote(ok.categories, quantities, ok.adminFee.amount)       pure
  └─ on "Lanjut":    useMutationTanstack → holdBookingUseCase.execute(input)
                       ├─ no tickets / empty token ──────────────► not-verified        (no call)
                       ├─ no admission token ────────────────────► admission-invalid   (no call)
                       ├─ bookingId given? ── yes ─────────────────────────────┐
                       │                     no                                ▼
                       ├─ createBooking(token, key, { eventId, tickets })     enterPayment(bookingId, token)
                       │     ├─ 201 ───────────────────────────────────────► │  ├─ 200 ──► held
                       │     ├─ 409 ACCOUNT_HAS_ACTIVE_BOOKING                │  └─ error ► classify('payment', bookingId)
                       │     │     └─ getActiveBooking()
                       │     │          ├─ same order, PAYMENT_PENDING ──► held (resumed, no call)
                       │     │          ├─ same order, SELECTION ───────► enterPayment(that id) ► held (resumed) / classify
                       │     │          ├─ other / none ─────────────────► active-booking
                       │     │          └─ transient ─► retryable(null) · other ─► rethrow
                       │     └─ other error ► classify('create', null)
```

API operations (spec 71): `createBooking`, `enterPayment`, `getActiveBooking`.

Files:

| File                                                                | Change                        |
| ------------------------------------------------------------------- | ----------------------------- |
| `src/core/use_case/booking/hold-booking.use-case.ts`                | new                           |
| `src/core/use_case/booking/__tests__/hold-booking.use-case.test.ts` | new                           |
| `src/infrastructure/di/services.registry.ts`                        | register `holdBookingUseCase` |
| `src/infrastructure/di/registry.types.ts`                           | add `holdBookingUseCase`      |
| `src/infrastructure/di/__tests__/registry.test.ts`                  | add the key to `KEYS`         |

## Components and Interfaces

```ts
// src/core/use_case/booking/hold-booking.use-case.ts
import type { Booking, Category } from '@core/entities/booking/booking.entity';
import type { HttpError } from '@core/protocols/http.protocol';
import type { TicketQuantities } from '@core/use_case/booking/order-ticket-selection.use-case';
import { errorCodeOf } from '@core/use_case/device/with-device-token';
import type { AwilixRegistry } from '@infrastructure/di/registry.types';

/** One ticket of the order, in slot order. */
export interface HoldTicket {
  categoryId: string;
  /** From the slot's valid NIK check (spec 55); '' when the slot has none. Never logged. */
  validationToken: string;
  /** Last 4 NIK digits, only to match a problem's nikMasked to the slot. Never sent, never logged. */
  nikLast4: string;
}

export interface HoldBookingInput {
  eventId: string;
  /** From the admission store at tap time; null when the tab has no live turn. */
  admissionToken: string | null;
  /** One UUID per attempt (spec 73); the same on a retry of the same selection. */
  idempotencyKey: string;
  /** Slot order: the body's tickets follow it. */
  tickets: readonly HoldTicket[];
  /** A booking this attempt already created (a retryable payment-entry failure); null to create one. */
  bookingId: string | null;
}

export type HoldConflictCode = 'NIK_SEAT_TAKEN' | 'DUPLICATE_NIK';
export type ActiveBookingStatus = 'SELECTION' | 'PAYMENT_PENDING';

export type HoldBookingResult =
  /** PAYMENT_PENDING: stock held for 10 minutes; go to the payment page. resumed: an existing booking was continued. */
  | { kind: 'held'; bookingId: string; resumed: boolean }
  /** No tickets, or a ticket without a validation token: nothing was sent. */
  | { kind: 'not-verified' }
  /** 409 NIK_SEAT_TAKEN / DUPLICATE_NIK. slotIndexes: matched by nikMasked; [] when unknown (recheck every holder). */
  | { kind: 'nik-conflict'; code: HoldConflictCode; slotIndexes: number[]; bookingId: string | null }
  /** 409 ATTENDEE_NOT_VALIDATED: a validation token expired or was refused: recheck every holder. */
  | { kind: 'attendees-stale' }
  /** 409 CATEGORY_SOLD_OUT (create or payment entry). */
  | { kind: 'sold-out'; categoryId: string | null; bookingId: string | null }
  /** 409 QUANTITY_OVER_RESERVATION: more tickets than this admission's reservation. */
  | { kind: 'over-reservation'; categoryId: string | null }
  /** 409 ACCOUNT_HAS_ACTIVE_BOOKING and the active booking is not this order (or is gone). */
  | { kind: 'active-booking'; bookingId: string | null; status: ActiveBookingStatus | null }
  /** 409 BOOKING_NOT_HELD / 404 at payment entry: the booking expired, was paid or cancelled. Start a new attempt. */
  | { kind: 'not-held' }
  /** No token, or 403 ADMISSION_INVALID. */
  | { kind: 'admission-invalid' }
  /** 401 after the adapter's refresh. */
  | { kind: 'unauthorized' }
  /** 5xx / busy / network / timeout. bookingId: pass it back on the retry (null: repeat the create, same key). */
  | { kind: 'retryable'; code: string; bookingId: string | null; requestId?: string };

export interface PriceQuoteLine {
  categoryId: string;
  name: string;
  quantity: number;
  /** Whole rupiah: price.amount × quantity. */
  lineTotal: number;
}

export interface PriceQuote {
  /** Categories with quantity ≥ 1, category order. */
  lines: PriceQuoteLine[];
  ticketCount: number;
  ticketSubtotal: number;
  /** Once per order (ADR-0010); 0 when ticketCount is 0. */
  adminFee: number;
  total: number;
}

export type QuotableCategory = Pick<Category, 'categoryId' | 'name' | 'price'>;

export interface HoldBookingUseCaseInterface {
  /** Summary prices from the selection (whole rupiah). Pure. */
  quote: (categories: readonly QuotableCategory[], quantities: TicketQuantities, adminFee: number) => PriceQuote;
  /** createBooking → enterPayment (or resume / recover); at most 3 calls, never retried here. */
  execute: (input: HoldBookingInput) => Promise<HoldBookingResult>;
}

export const HoldBookingUseCase = ({
  bookingService,
}: Pick<AwilixRegistry, 'bookingService'>): HoldBookingUseCaseInterface;
```

Private module-scope constants and pure helpers (not exported, no mutable state):

```ts
const TRANSIENT_CODES = new Set(['INTERNAL_ERROR', 'PAYMENT_PROVIDER_BUSY', 'SERVICE_UNAVAILABLE', 'NETWORK_ERROR', 'TIMEOUT']);
const ACTIVE: ReadonlySet<string> = new Set<ActiveBookingStatus>(['SELECTION', 'PAYMENT_PENDING']);

const statusOf = (error: unknown): number => (error as HttpError | null)?.status ?? 0;
const isTransient = (error: unknown) => TRANSIENT_CODES.has(errorCodeOf(error) ?? '') || statusOf(error) >= 500;
const isUnauthorized = (error: unknown) => errorCodeOf(error) === 'UNAUTHORIZED' || statusOf(error) === 401;
/** A string member of the problem body (HttpError.data), else null. */
const problemField = (error: unknown, field: 'categoryId' | 'nikMasked'): string | null => { … };
/** Last 4 digits of "3174 •••• •••• 0004" / "************0004"; null when there are no 4 trailing digits. */
const lastFourOf = (masked: string | null): string | null => masked?.match(/(\d{4})\D*$/)?.[1] ?? null;
/** Non-negative integer, else 0 (the selection use case's rule). */
const countOf = (value: unknown): number => …;
/** Sorted "categoryId:last4" per ticket; from attendees, else "categoryId" × quantity from price.lines. */
const signatureOf = (booking: Booking, withNik: boolean): string[] => …;
```

Behaviour:

- `quote`: for each category in order, `quantity = countOf(quantities[categoryId])`; keep `quantity ≥ 1` lines with
  `lineTotal = price.amount × quantity`; `ticketCount`, `ticketSubtotal` are sums; `adminFee = ticketCount ≥ 1 ?
adminFee : 0`; `total = ticketSubtotal + adminFee`.
- `execute`:
  1. `tickets.length === 0 || tickets.some((t) => !t.validationToken)` → `not-verified`.
  2. `!admissionToken` → `admission-invalid`.
  3. `bookingId` given → `enter(bookingId, false)`.
  4. else `try createBooking(...)` → `enter(created.data.bookingId, false)`; `catch`:
     `ACCOUNT_HAS_ACTIVE_BOOKING` → `recover()`; else `classify(error, 'create', null)`.
  - `enter(id, resumed)`: `try enterPayment(id, token)` → `{ held, bookingId: id, resumed }`; `catch` →
    `classify(error, 'payment', id)`.
  - `recover()`: `try getActiveBooking()`; `catch` → transient ? `retryable(code, null, requestId)` : `throw`.
    `found = items.find((b) => b.eventId === eventId && ACTIVE.has(b.status))`; none → `active-booking(null, null)`;
    `sameOrder(found)` false → `active-booking(found.bookingId, found.status)`; PAYMENT_PENDING → `held(found.bookingId,
resumed: true)`; SELECTION → `enter(found.bookingId, true)`.
  - `sameOrder(booking)`: with `attendees` (length > 0) compare `signatureOf(booking, true)` with the input's sorted
    `categoryId:nikLast4`; without, compare `signatureOf(booking, false)` with the input's sorted `categoryId` list.
    Equal arrays → true.
  - `classify(error, stage, bookingId)`, first match wins: `ADMISSION_INVALID` → `admission-invalid`; unauthorized →
    `unauthorized`; `NIK_SEAT_TAKEN` / `DUPLICATE_NIK` → `nik-conflict` (indexes `i` where `tickets[i].nikLast4 ===
lastFourOf(problemField(error, 'nikMasked'))`, `[]` when that is null); `ATTENDEE_NOT_VALIDATED` →
    `attendees-stale`; `CATEGORY_SOLD_OUT` → `sold-out`; `QUANTITY_OVER_RESERVATION` → `over-reservation`; stage
    `payment` and (`BOOKING_NOT_HELD` or `NOT_FOUND` or status 404) → `not-held`; transient → `retryable` (`code =
errorCodeOf(error) ?? 'UNKNOWN_ERROR'`, `requestId` when a string); else `throw error`.

DI:

```ts
// src/infrastructure/di/registry.types.ts (addition, in "use cases" after endOrderWindowUseCase)
import type { HoldBookingUseCaseInterface } from '@core/use_case/booking/hold-booking.use-case';
  holdBookingUseCase: HoldBookingUseCaseInterface;

// src/infrastructure/di/services.registry.ts (addition, after endOrderWindowUseCase)
    holdBookingUseCase: asFunction(HoldBookingUseCase).singleton(),
```

Compile check: `bookingService.createBooking / enterPayment / getActiveBooking` exist after spec 71; `errorCodeOf` is
exported from `with-device-token.ts` and already used by `validate-attendee.use-case.ts`; `TicketQuantities` is a type
export of `order-ticket-selection.use-case.ts`; `Category.price` is `Money` (`amount: number`); `Booking.attendees?` and
`Booking.status: BookingStatus` (spec 71) cover `signatureOf` and the `ACTIVE` check; the narrowing to
`ActiveBookingStatus` for the result uses `found.status as ActiveBookingStatus` after the `ACTIVE.has` check. Key count
= registration count after the change.

## Data Models

`quote` (categories: Festival B 850 000, Tribun Bawah 650 000, Tribun Atas 450 000; adminFee 10 000):

| quantities                 | lines                                         | ticketCount | subtotal  | adminFee | total     |
| -------------------------- | --------------------------------------------- | ----------- | --------- | -------- | --------- |
| `{}`                       | `[]`                                          | 0           | 0         | 0        | 0         |
| `{ B: 1 }`                 | B×1 = 850 000                                 | 1           | 850 000   | 10 000   | 860 000   |
| `{ B: 2, TA: 1 }`          | B×2 = 1 700 000, TA×1 = 450 000               | 3           | 2 150 000 | 10 000   | 2 160 000 |
| `{ TA: 1, B: 2 }`          | same order as categories (B first)            | 3           | 2 150 000 | 10 000   | 2 160 000 |
| `{ B: -1, TB: 1.5, X: 2 }` | `[]` (invalid counts → 0, unknown id ignored) | 0           | 0         | 0        | 0         |

(The HiFi's "Biaya layanan Rp 30.000" for 3 tickets is the per-ticket fee H-1 rejects; with this spec it shows the
event's `adminFee` once.)

`execute` outcomes (`T = [{ cat_b, tok1, '0004' }, { cat_b, tok2, '0019' }]`, token `adm`, key `k1`):

| Input / answers                                                              | Calls                      | Result                                                           |
| ---------------------------------------------------------------------------- | -------------------------- | ---------------------------------------------------------------- |
| `tickets: []` or a `''` token                                                | none                       | `not-verified`                                                   |
| token `null` / `''`                                                          | none                       | `admission-invalid`                                              |
| create 201 `bk1` → entry 200                                                 | create, entry(bk1)         | `held bk1, resumed false`                                        |
| `bookingId: 'bk1'` → entry 200                                               | entry(bk1)                 | `held bk1, resumed false`                                        |
| create 403 `ADMISSION_INVALID`                                               | create                     | `admission-invalid`                                              |
| create 401                                                                   | create                     | `unauthorized`                                                   |
| create 409 `NIK_SEAT_TAKEN` (no nikMasked)                                   | create                     | `nik-conflict NIK_SEAT_TAKEN, [], null`                          |
| create 409 `DUPLICATE_NIK`                                                   | create                     | `nik-conflict DUPLICATE_NIK, [], null`                           |
| create 409 `ATTENDEE_NOT_VALIDATED`                                          | create                     | `attendees-stale`                                                |
| create 409 `CATEGORY_SOLD_OUT` `categoryId: cat_b`                           | create                     | `sold-out cat_b, null`                                           |
| create 409 `QUANTITY_OVER_RESERVATION` (no categoryId)                       | create                     | `over-reservation null`                                          |
| create 503 `INTERNAL_ERROR` / `NETWORK_ERROR` / `TIMEOUT`                    | create                     | `retryable <code>, null` (+ requestId)                           |
| create 422 `VALIDATION_FAILED` / `UNKNOWN_ERROR`                             | create                     | rethrow (same object)                                            |
| create 201 → entry 503 `PAYMENT_PROVIDER_BUSY`                               | create, entry              | `retryable PAYMENT_PROVIDER_BUSY, bk1`                           |
| create 201 → entry 409 `NIK_SEAT_TAKEN` `nikMasked: '3275 •••• •••• 0019'`   | create, entry              | `nik-conflict NIK_SEAT_TAKEN, [1], bk1`                          |
| entry 409 `NIK_SEAT_TAKEN` `nikMasked: '************9999'`                   | entry                      | `nik-conflict …, [], bk1`                                        |
| entry 409 `CATEGORY_SOLD_OUT` `cat_b`                                        | entry                      | `sold-out cat_b, bk1`                                            |
| entry 409 `BOOKING_NOT_HELD` / 404 `NOT_FOUND`                               | entry                      | `not-held`                                                       |
| entry 403                                                                    | entry                      | `admission-invalid`                                              |
| create 409 `ACCOUNT_HAS_ACTIVE_BOOKING` → active `[]`                        | create, active             | `active-booking null, null`                                      |
| … → active `[{ bk9, other event, SELECTION }]`                               | create, active             | `active-booking null, null`                                      |
| … → active `[{ bk9, same event, PAYMENT_PENDING, same attendees }]`          | create, active             | `held bk9, resumed true`                                         |
| … → active `[{ bk9, same event, SELECTION, same attendees }]` → entry 200    | create, active, entry(bk9) | `held bk9, resumed true`                                         |
| … → same, entry 503                                                          | create, active, entry(bk9) | `retryable …, bk9`                                               |
| … → active `[{ bk9, same event, SELECTION, other NIK }]`                     | create, active             | `active-booking bk9, SELECTION`                                  |
| … → active `[{ bk9, same event, PAYMENT_PENDING, no attendees, lines B×2 }]` | create, active             | `held bk9, resumed true`                                         |
| … → active `[{ bk9, same event, EXPIRED }]`                                  | create, active             | `active-booking null, null`                                      |
| … → active fails `NETWORK_ERROR`                                             | create, active             | `retryable NETWORK_ERROR, null`                                  |
| … → active fails 401                                                         | create, active             | rethrow (only the hold calls are classified; see Error Handling) |

Note on the last row: `getActiveBooking` failures other than transient are rethrown, including 401 (the controller's
`onError` sends a 401 to sign-in the same way).

## Layer Constraints

From `.claude/rules/core-use-case.md`:

- `src/core/use_case/{domain}/{action}.use-case.ts`
- Depend only on services, config and other use cases from `AwilixRegistry`
- Zero React, zero Next.js, zero hooks, zero browser APIs
- Multi-step orchestration (check → validate → transform → decide)
- Business rules and validation, for example:
  - order limits: total tickets ≤ `min(maxTicketsPerOrder, reservedUnits)`; one NIK per ticket, all different
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

From `.claude/rules/error-handling.md`:

- No automatic replay of failed mutations; the user retries.
- ❌ Auto-retrying mutations without the user

From `.claude/rules/scaffold.md`:

- Services and use cases: `asFunction(Factory).singleton()`
- `AwilixRegistry` (`src/infrastructure/di/registry.types.ts`) is the single source of truth. **Every key in it has a
  `container.register()` call** in one of the three registries or a `di/controllers/` file. Awilix resolves at
  runtime, so TypeScript will not catch a missing registration. Count keys vs registrations after every change.

From `CLAUDE.md`:

- NIKs are shown masked after entry and never logged.

## Correctness Properties

- Property 1: for every row of the `quote` table the result matches; `adminFee` never depends on `ticketCount` beyond
  0 vs ≥ 1 (loop 1..3 tickets: fee constant); `total === ticketSubtotal + adminFee`. **Validates: Requirements 1**
- Property 2: for every row of the `execute` table the result and the exact call list (names, arguments, order) match.
  **Validates: Requirements 2, 3, 4, 5**
- Property 3: the create body is exactly `{ eventId, tickets: tickets.map(({ categoryId, validationToken }) => ({
categoryId, validationToken })) }` (`toEqual`, no `nikLast4`), and the key and token are passed as given.
  **Validates: Requirements 2**
- Property 4: with `bookingId` given, `createBooking` and `getActiveBooking` are never called. **Validates: Requirements 3**
- Property 5: `retryable` after a successful create carries the created `bookingId`; after a failed create it carries
  `null`. **Validates: Requirements 3**
- Property 6: `getActiveBooking` is called only after 409 `ACCOUNT_HAS_ACTIVE_BOOKING`, at most once per `execute`; a
  non-matching active booking never gets an `enterPayment`. **Validates: Requirements 4**
- Property 7: at most 3 service calls per `execute`; no call is repeated with the same arguments. **Validates: Requirements 2**
- Property 8: an unclassified error is rethrown as the same object (`toBe`) from create, entry and active.
  **Validates: Requirements 5**
- Property 9: `JSON.stringify(result)` never contains a validation token, a `nikLast4` value that the server did not echo,
  or the `snapToken`. **Validates: Requirements 2, 5**

## Error Handling

| Stage         | Code / condition                                                                                    | Outcome                                                      |
| ------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| before        | no tickets / empty token                                                                            | `not-verified` (no call)                                     |
| before        | no admission token                                                                                  | `admission-invalid` (no call)                                |
| create, entry | 403 `ADMISSION_INVALID`                                                                             | `admission-invalid`                                          |
| create, entry | 401 `UNAUTHORIZED`                                                                                  | `unauthorized`                                               |
| create, entry | 409 `NIK_SEAT_TAKEN`, `DUPLICATE_NIK`                                                               | `nik-conflict` (+ slots from `nikMasked`)                    |
| create        | 409 `ATTENDEE_NOT_VALIDATED`                                                                        | `attendees-stale`                                            |
| create, entry | 409 `CATEGORY_SOLD_OUT`                                                                             | `sold-out` (+ `categoryId`)                                  |
| create        | 409 `QUANTITY_OVER_RESERVATION`                                                                     | `over-reservation` (+ `categoryId`)                          |
| create        | 409 `ACCOUNT_HAS_ACTIVE_BOOKING`                                                                    | recovery → `held` / `active-booking` / `retryable` / rethrow |
| entry         | 409 `BOOKING_NOT_HELD`, 404 `NOT_FOUND`                                                             | `not-held`                                                   |
| any           | ≥ 500, `INTERNAL_ERROR`, `PAYMENT_PROVIDER_BUSY`, `SERVICE_UNAVAILABLE`, `NETWORK_ERROR`, `TIMEOUT` | `retryable`                                                  |
| any           | 422 `VALIDATION_FAILED`, `UNKNOWN_ERROR`, other                                                     | rethrown for the controller                                  |

**Doc conflicts recorded:**

- LLD-02 §5 point 3 says a second `POST /bookings` for the same admission returns the existing booking (200,
  idempotent); `openapi.yaml` lists 409 `ACCOUNT_HAS_ACTIVE_BOOKING`. This use case handles both: a 200/201 replay is a
  plain success, a 409 goes through recovery.
- The 409 `NIK_SEAT_TAKEN` of `createBooking` has no `nikMasked` (only `enterPayment`'s has), so the create-stage
  conflict cannot name a slot; the controller re-checks every holder, and `validateAttendee`'s own seat check then marks
  the right field. Asking core to add `nikMasked` (or a `ticketIndex`) to the create 409 is an open question.
- `PAYMENT_PROVIDER_BUSY` is documented for `createPaymentAttempt`, not `enterPayment` (which documents 503
  `INTERNAL_ERROR`); both are `retryable` here.
- v1 has no cancel endpoint (LLD-02 §4): after a payment-entry failure the SELECTION booking stays until its 5 minutes
  end, so a changed selection gets `active-booking` until then. Recorded for the core team in spec 73.

## Testing Strategy

`src/core/use_case/booking/__tests__/hold-booking.use-case.test.ts`, plain-object `bookingService` fake with
`createBooking`, `enterPayment`, `getActiveBooking` as `vi.fn()` (cast `as never` like the other booking tests), problems
as plain `{ status, code, message, data, requestId }` objects:

- `quote`: `it.each` over the table; a fee-constancy loop for 1–3 tickets.
- `execute`: `it.each` over the outcomes table with `mockResolvedValueOnce` / `mockRejectedValueOnce`; assert
  `toHaveBeenNthCalledWith` for every call and `not.toHaveBeenCalled` for the skipped ones; body shape (Property 3);
  `toBe` identity for rethrows (Property 8); Property 9 on every result.
- `src/infrastructure/di/__tests__/registry.test.ts`: `holdBookingUseCase` in `KEYS` and resolves.
- Gate: `npm run typecheck && npm run lint && npx vitest --run`; coverage ≥ 85% on the new file.
