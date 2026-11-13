# Design Document

## Overview

`OrderController` (`src/controllers/order.controller.ts`) is extended, not replaced. Additions:

1. **Views:** `OrderSummaryView` (lines, fee, total, note, dock count) and `OrderCheckoutView` (labels, `enabled`,
   `busy`, `hint`, `onContinue`), exposed as `summary` and `checkout` (both null unless the page is ready with ≥ 1
   ticket and not timed out).
2. **One mutation** (`mutationKey: [MUTATION_KEYS.ORDER_HOLD]`) around `holdBookingUseCase.execute` (spec 72), with the
   loading overlay in all three paths.
3. **Attempt bookkeeping** in a ref: signature of the tickets, the `Idempotency-Key` (`randomUuid()`, spec 71) and the
   known `bookingId` after a retryable payment-entry failure.
4. **Outcome handling:** field marking through the existing `checks` state, a hold flag for category problems and
   slot-less NIK conflicts, popups with `reference`, the existing admission redirect guard, sign-in on 401, navigation on
   `held`.
5. **Time's-up guard:** `leaving` state; `expired` does not latch while a hold is in flight or after `held`.

**Name: `checkout`, not `continue`.** The brief calls the action `continue`. `continue` is a reserved word: it is legal as
a property name but cannot be destructured in the page shell (`const { continue } = …` is a syntax error). The view is
`checkout` / `OrderCheckoutView`.

**Loading: the overlay and a busy button, both.** The controller rule asks for `toggleLoading()` in all three mutation
paths, and here it is also the right UX: the hold reads the holders and quantities at tap time, so the page must not be
editable while it runs (an edit mid-flight would show a selection that is not the one held). The overlay blocks the
page; `checkout.busy` (`isPending || leaving`) drives `aria-busy` on the button for assistive tech and keeps it disabled
between `onSuccess` (overlay off) and the route change. The sign-in flow avoided the overlay because of the Turnstile
checkbox; the hold has no such widget.

**No use case for the summary formatting.** `quote` (spec 72) does the arithmetic; the controller only formats with the
existing `formatRupiah` and translates labels ("Return only what the screen needs, already translated or formatted").

## Architecture

```
OrderScreen ─► container.resolve('orderController')          (src/infrastructure/di/controllers/order.ts, unchanged)
  │
  ├─ existing: queries, status, selection, holders + NIK checks (checks state), countdown, expired latch
  ├─ quote = ok ? holdBookingUseCase.quote(ok.categories, quantities, ok.adminFee.amount) : null      (useMemo)
  ├─ [leaving, setLeaving] = useState(false)
  ├─ [holdFlag, setHoldFlag] = useState<HoldFlag | null>(null)          cleared in applyQuantities
  ├─ attemptRef = useRef<HoldAttempt | null>(null)                      written only in handlers / callbacks
  ├─ holdGuard  = useRef(false)                                         double-tap guard, handlers only
  ├─ holdMutation = useMutationTanstack<HoldBookingResult, HttpError, HoldBookingInput>({
  │     mutationKey: [MUTATION_KEYS.ORDER_HOLD], retry: false,
  │     mutationFn: (input) => { toggleLoading(); return holdBookingUseCase.execute(input); },
  │     onSuccess: (result) => { toggleLoading(); … outcome table … },
  │     onError:   (error)  => { toggleLoading(); … 401 → login, else popup … } })
  ├─ expired latch: (windowOver || windowEnded) && !expired && !leaving && !holdMutation.isPending
  ├─ onContinue (useCallback) → guard → tickets → attempt → track → holdMutation.mutate(input)
  ├─ continueRef.current = onContinue                                   (useEffect, for the popup's "Coba lagi")
  └─ summary / checkout views
        │
        ▼ success
  router.push('/payment?booking=<id>')   → FR-20-W1 page (not-found until it merges)
```

Route `/order?event=<id>` (unchanged). API operations through spec 72: `createBooking`, `enterPayment`,
`getActiveBooking`. `getCategories` is refetched (`categoriesQuery.refetch()`) after a category refusal.

## Components and Interfaces

```ts
// src/controllers/order.controller.ts (additions; everything else unchanged unless listed)
import type { HoldBookingInput, HoldBookingResult, HoldTicket } from '@core/use_case/booking/hold-booking.use-case';
import { formatRupiah } from '@utils/format/number';
import { randomUuid } from '@utils/random-uuid';
import { MUTATION_KEYS, QUERY_KEYS } from '@utils/constants/query-keys';

/** One summary row: "2 × Festival B" and its line total. */
export interface OrderSummaryLine {
  /** categoryId: React key. */
  key: string;
  /** "2 × Festival B". */
  label: string;
  /** "Rp 1.700.000" (ID) / "Rp 1,700,000" (EN). */
  amount: string;
}

/** The "Ringkasan" aside and the phone dock (FR-16-W1). Texts translated, money formatted. */
export interface OrderSummaryView {
  /** "Ringkasan" / "Summary". */
  heading: string;
  lines: OrderSummaryLine[];
  /** "Biaya layanan" / "Service fee". */
  feeLabel: string;
  /** The admin fee, once per order (ADR-0010). */
  fee: string;
  /** "Total". */
  totalLabel: string;
  total: string;
  /** "Tiket ditahan untuk Anda selama 10 menit saat Anda lanjut. Belum ada biaya sampai Anda membayar." */
  note: string;
  /** Dock: "3 tiket" / "3 tickets". */
  ticketCount: string;
  /** Dock region label: "Ringkasan pesanan" / "Order summary". */
  dockLabel: string;
}

export interface OrderCheckoutHint {
  text: string;
  /** True for a hold refusal (red, role="alert"); false for the neutral "complete the holders" hint. */
  error: boolean;
}

/** "Lanjut ke pembayaran" (FR-16-W1). */
export interface OrderCheckoutView {
  /** "Lanjut ke pembayaran" / "Continue to payment" (the arrow is drawn by the section, aria-hidden). */
  label: string;
  /** Dock: "Lanjut bayar" / "Continue". */
  shortLabel: string;
  enabled: boolean;
  /** A hold is in flight, or it succeeded and the page is navigating. */
  busy: boolean;
  /** Why the button is disabled; null when enabled or busy. */
  hint: OrderCheckoutHint | null;
  /** No-op unless enabled; a second tap while one is in flight is ignored. */
  onContinue: () => void;
}

export interface OrderControllerInterface {
  // …all existing fields unchanged
  /** Non-null exactly when status is 'ready', totalTickets ≥ 1 and not timeUp. */
  summary: OrderSummaryView | null;
  /** Non-null exactly when summary is. */
  checkout: OrderCheckoutView | null;
}

type OrderControllerDeps = Pick<
  AwilixRegistry,
  // …existing keys
  'holdBookingUseCase' | 'useLoading' | 'usePopupError'
>;
```

Module-scope types (not exported):

```ts
/** The selection one Idempotency-Key belongs to, and the booking it already created. */
interface HoldAttempt {
  /** `${categoryId}:${validationToken}` per ticket, slot order, joined by '|'. */
  signature: string;
  idempotencyKey: string;
  bookingId: string | null;
}

type HoldFlag =
  | { kind: 'sold-out'; categoryId: string | null }
  | { kind: 'over-reservation' }
  | { kind: 'holders'; code: 'NIK_SEAT_TAKEN' | 'DUPLICATE_NIK' | 'ATTENDEE_NOT_VALIDATED' };
```

```ts
// src/utils/constants/query-keys.ts (addition)
/** TanStack mutation keys; tests tell mutations apart by them. */
export const MUTATION_KEYS = {
  ORDER_HOLD: 'order-hold',
} as const;
```

Behaviour:

- `quote`: `useMemo(() => (ok ? holdBookingUseCase.quote(ok.categories, quantities, ok.adminFee.amount) : null), …)`.
- `holdTickets` (inside `onContinue`, not in render): for each `selection.slots` slot, `entry` = form value for the
  slot, `run = checks[slot.key]`; `validationToken` = `run?.phase === 'done' && run.result.kind === 'valid' && run.nik
=== entry.nik && run.fullName === entry.fullName ? run.result.validationToken : ''`; `nikLast4 = entry?.nik.slice(-4)
?? ''`.
- `onContinue`: return if `!enabled || holdGuard.current`; `holdGuard.current = true`; build tickets and signature; if
  `attemptRef.current?.signature !== signature` → `attemptRef.current = { signature, idempotencyKey: randomUuid(),
bookingId: null }`; `setHoldFlag(null)`; `trackEvent('order_continue_tapped', { eventId, tickets: tickets.length })`;
  `holdMutation.mutate({ eventId, admissionToken: admissionStore.get(eventId), idempotencyKey, tickets, bookingId })`.
- `continueRef`: `const continueRef = useRef(onContinue); useEffect(() => { continueRef.current = onContinue; });` The
  retry popup's action calls `continueRef.current()`, so it uses the latest `enabled` (e.g. not after time ran out).
- Outcome handling in `onSuccess` (after `toggleLoading()`; `holdGuard.current = false` for every kind except `held`):

| Result                      | Page effect                                                                                                                                                                                                                    | Analytics                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| `held`                      | `setLeaving(true)`; `redirected.current = true`; `router.push(withQuery(ROUTES.PAYMENT, { booking: bookingId }))`                                                                                                              | `order_hold_created { eventId, tickets, resumed }` |
| `not-verified`              | nothing (cannot happen while `enabled`); hint stays                                                                                                                                                                            | `order_hold_failed { outcome }`                    |
| `nik-conflict`, indexes ≥ 1 | for each index: that slot's run → `{ nik, fullName, phase: 'done', result: { kind: code === 'NIK_SEAT_TAKEN' ? 'seat-taken' : 'duplicate' } }` (form values at that moment)                                                    | `order_hold_failed { outcome, code }`              |
| `nik-conflict`, `[]`        | every slot's run → `{ …, phase: 'failed', code: 'ATTENDEE_NOT_VALIDATED' }`; `setHoldFlag({ kind: 'holders', code })`                                                                                                          | same                                               |
| `attendees-stale`           | same as above with `code: 'ATTENDEE_NOT_VALIDATED'`                                                                                                                                                                            | same                                               |
| `sold-out`                  | `setHoldFlag({ kind: 'sold-out', categoryId })`; `void categoriesQuery.refetch()`                                                                                                                                              | `{ outcome, code: 'CATEGORY_SOLD_OUT' }`           |
| `over-reservation`          | `setHoldFlag({ kind: 'over-reservation' })`; `void categoriesQuery.refetch()`                                                                                                                                                  | `{ outcome, code: 'QUANTITY_OVER_RESERVATION' }`   |
| `active-booking`            | popup `error_account_has_active_booking`; when `status === 'PAYMENT_PENDING'` and `bookingId`: `actionLabel: t('order_hold_open_active')`, `onAction`: `setLeaving(true)`, `redirected.current = true`, `router.push(payment)` | `{ outcome, code: 'ACCOUNT_HAS_ACTIVE_BOOKING' }`  |
| `not-held`                  | popup `error_booking_not_held`; `attemptRef.current = null`                                                                                                                                                                    | `{ outcome, code: 'BOOKING_NOT_HELD' }`            |
| `admission-invalid`         | if `!redirected.current`: set it, `router.replace(withQuery(ROUTES.QUEUE, { event: eventId }))`                                                                                                                                | `{ outcome }`                                      |
| `unauthorized`              | `router.push(signInHref)`                                                                                                                                                                                                      | `{ outcome }`                                      |
| `retryable`                 | `attemptRef.current.bookingId = bookingId`; popup `{ message: t(ERROR_CODE_MAP[code] ?? ERROR_CODE_MAP.UNKNOWN_ERROR), reference: requestId, actionLabel: t('action_retry'), onAction: () => continueRef.current() }`          | `{ outcome, code }`                                |

`signInHref = withQuery(ROUTES.LOGIN, { next: withQuery(ROUTES.ORDER, { event: eventId }) })`.

- `onError(error)`: `toggleLoading()`; `holdGuard.current = false`; `trackEvent('order_hold_failed', { eventId, outcome:
'error', code: error.code })`; `error.status === 401 || error.code === 'UNAUTHORIZED'` → `router.push(signInHref)`;
  else `openPopupError({ message: t(ERROR_CODE_MAP[error.code] ?? ERROR_CODE_MAP.UNKNOWN_ERROR), reference:
error.requestId })`. No `reportError` (the HTTP adapter already reports 5xx through `apiErrorReporter`, scrubbed; the
  error's `cause` holds the request with the validation tokens).
- `applyQuantities` (existing) also calls `setHoldFlag(null)`.
- Expired latch (existing line 649) becomes
  `if ((windowOver || windowEnded) && !expired && !leaving && !holdMutation.isPending) setExpired(true);`
  The mutation and `leaving` are declared above it. When a hold fails after zero, the mutation's state change re-renders
  the page and the latch fires then (Requirement 5).
- Views:

```ts
const showCheckout = status === 'ready' && selection.total >= 1 && !expired;
const flagBlocks =
  holdFlag?.kind === 'over-reservation' ||
  (holdFlag?.kind === 'sold-out' && (holdFlag.categoryId === null || (quantities[holdFlag.categoryId] ?? 0) > 0));
const busy = holdMutation.isPending || leaving;
const enabled = showCheckout && allHoldersVerified && (secondsLeft ?? 0) > 0 && !busy && !flagBlocks;
// hint, first match, only when !enabled && !busy:
//   sold-out:  categoryId known → t('order_hold_sold_out', { category: name from ok.categories }), else t(ERROR_CODE_MAP.CATEGORY_SOLD_OUT); error true
//   over-reservation: t('order_hold_over_reservation'); error true
//   !allHoldersVerified && holdFlag?.kind === 'holders': t(ERROR_CODE_MAP[holdFlag.code]); error true
//   !allHoldersVerified: t('order_checkout_hint_holders'); error false
//   else null
```

`summary` lines: `quote.lines.map((l) => ({ key: l.categoryId, label: t('order_summary_line', { quantity:
  l.quantity, category: l.name }), amount: formatRupiah(l.lineTotal, locale) }))`; `fee: formatRupiah(quote.adminFee,
  locale)`; `total: formatRupiah(quote.total, locale)`; `ticketCount: t('order_summary_tickets', { count:
  quote.ticketCount })`.

Compile check against the existing code and `AwilixRegistry`:

- `holdBookingUseCase` is a registry key after spec 72; `useLoading: () => LoadingApi` and `usePopupError: () =>
PopupErrorApi` are existing keys (registered in `infrastructure.registry.ts`, used by the queue and account
  controllers). `PopupErrorInput` has `message`, `actionLabel`, `onAction`, `reference`.
- `useMutationTanstack<HoldBookingResult, HttpError, HoldBookingInput>` is `typeof useMutation`; `mutationKey` is a
  `readonly unknown[]`.
- `run.result.validationToken` is reachable after narrowing `run.phase === 'done'` and `run.result.kind === 'valid'`
  (`ValidateAttendeeResult` `valid` member).
- `ok.adminFee` is `Money`; `ok.categories` is `Category[]`, assignable to `readonly QuotableCategory[]`.
- `OrderControllerInterface` widens by `summary` and `checkout`: the shell test's `base()` must gain `summary: null,
checkout: null` (task 5) or `tsc` fails. `asFunction(OrderController)` in `src/infrastructure/di/controllers/order.ts`
  is unchanged; the deps type picks three more existing keys.
- The existing controller test harness keeps a single `mutationOptions`: it must branch on `options.mutationKey?.[0] ===
'order-hold'` (task 5) so the NIK-check tests still capture the NIK mutation.

## Data Models

Translation keys used by this controller. **They are written to `src/translation/locale/id.json` and `en.json` by spec
74 task 1** (the page spec owns the copy; both specs land in the same PR).

| Key                                    | ID                                                                                               | EN                                                                                      | Source                 |
| -------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- | ---------------------- |
| `order_summary_heading`                | Ringkasan                                                                                        | Summary                                                                                 | HiFi `detail.html:47`  |
| `order_summary_line`                   | {{quantity}} × {{category}}                                                                      | {{quantity}} × {{category}}                                                             | HiFi script `q × name` |
| `order_summary_fee`                    | Biaya layanan                                                                                    | Service fee                                                                             | HiFi `:49`             |
| `order_summary_total`                  | Total                                                                                            | Total                                                                                   | HiFi `:50`             |
| `order_summary_note`                   | Tiket ditahan untuk Anda selama 10 menit saat Anda lanjut. Belum ada biaya sampai Anda membayar. | We hold the tickets for 10 minutes once you continue. Nothing is charged until you pay. | HiFi `:52`             |
| `order_summary_tickets_one` / `_other` | {{count}} tiket                                                                                  | {{count}} ticket / {{count}} tickets                                                    | HiFi `:56`, script     |
| `order_summary_dock_label`             | Ringkasan pesanan                                                                                | Order summary                                                                           | new (dock region name) |
| `order_checkout_label`                 | Lanjut ke pembayaran                                                                             | Continue to payment                                                                     | HiFi `:51`             |
| `order_checkout_short_label`           | Lanjut bayar                                                                                     | Continue                                                                                | HiFi `:56`             |
| `order_checkout_hint_holders`          | Lengkapi data pemegang tiket untuk lanjut.                                                       | Complete the ticket holders' details to continue.                                       | brief                  |
| `order_hold_sold_out`                  | {{category}} sudah habis. Kurangi tiketnya atau pilih kategori lain.                             | {{category}} has sold out. Remove those tickets or pick another category.               | new                    |
| `order_hold_over_reservation`          | Jumlah tiket melebihi kuota giliran Anda. Kurangi tiketnya lalu lanjut lagi.                     | You picked more tickets than your turn allows. Remove some and continue again.          | new                    |
| `order_hold_open_active`               | Buka pesanan itu                                                                                 | Open that order                                                                         | new                    |

Reused: `action_retry`, `error_*` for every code in Error Handling (all exist in both locales).

Analytics events (naming as `order_resumed`, `order_nik_checked`, `order_time_up`):

| Event                   | Params                                                               | When                        |
| ----------------------- | -------------------------------------------------------------------- | --------------------------- |
| `order_continue_tapped` | `eventId`, `tickets`                                                 | accepted tap                |
| `order_hold_created`    | `eventId`, `tickets`, `resumed`                                      | `held`                      |
| `order_hold_failed`     | `eventId`, `outcome` (result kind or `'error'`), `code` (when known) | any other result, `onError` |

State shapes: `leaving: boolean` (false until `held` or the active-booking action); `holdFlag: HoldFlag | null`;
`attemptRef: HoldAttempt | null`; `holdGuard: boolean`.

Example (Festival B 850 000 × 2, Tribun Atas 450 000 × 1, `adminFee` 10 000, ID): lines "2 × Festival B" "Rp
1.700.000", "1 × Tribun Atas" "Rp 450.000"; fee "Rp 10.000"; total "Rp 2.160.000"; dock "3 tiket". (HiFi shows "Rp 30.000"
/ "Rp 2.180.000": its per-ticket fee is H-1.)

## Layer Constraints

From `.claude/rules/controller.md`:

- Page UI state (`useState`), form state (`useForm` + Zod, `useWatch`)
- Queries and mutations wrapping use cases or services (`useQueryTanstack`, `useMutationTanstack`)
- Loading overlay (`useLoading`), error popup (`usePopupError`), navigation (`useRouterNext`)
- Translation of codes into text (`t` from `useTranslation`)
- Analytics (`trackPageView` once on mount, `trackEvent` on actions)
- Timers derived from server time, polling intervals (`refetchInterval`), SSE subscriptions through a DI adapter
- Business rules, validation, data transformation → use case
- HTTP details, storage, tokens → infrastructure
- Helper functions defined in the body → `src/utils/` (pure) or a use case (business)
- ✅ import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
- ✅ import type { ... } from '@core/...';
- ✅ import type { AwilixRegistry } from '@infrastructure/di/registry.types';
- ❌ import { useQuery, useMutation } from '@tanstack/react-query'; // DI: useQueryTanstack, useMutationTanstack
- ❌ import { useRouter, useSearchParams } from 'next/navigation'; // DI: useRouterNext, useSearchParamsNext
- ❌ import { useLoading } from '@contexts/loading.context'; // DI: useLoading
- ❌ any runtime import from @core/services, @infrastructure, or a context
- `export default` the factory; named export the interface `{Page}ControllerInterface`.
- Return only what the screen needs, already translated or formatted.
- `toggleLoading()` in **all three** mutation paths: `mutationFn`, `onSuccess`, `onError`. A missing one leaves the
  overlay stuck.
- One query or mutation per async operation. Never call a service inside another mutation's `onSuccess`/`onError`.
- Never `.then()/.catch()`; never `useEffect` + service call (use `useQueryTanstack`, with `refetchInterval` for polling).
- Error display (fallback through the same DI map, no extra import): `ERROR_CODE_MAP[error.code] ?? ERROR_CODE_MAP.UNKNOWN_ERROR` → `t(key)` → `openPopupError()` or a field error.
  `401` goes to sign-in; `NETWORK_ERROR` shows the offline message.
- Registered in its own `src/infrastructure/di/controllers/{page-name}.ts` as `asFunction(Controller)` — **no**
  `.singleton()` — and that file is imported by the page shell, never by `registerAll()` (see scaffold rule).
- `src/controllers/__tests__/{page-name}.controller.test.ts`
- Mock every DI dependency (hooks return plain objects); capture `useMutationTanstack` options and call
  `mutationFn` / `onSuccess` / `onError` directly.
- Test: returned interface, loading in all paths, error mapping, navigation targets, analytics.
- Coverage threshold 85%.
- [ ] No `.then(`, `.catch(`, or `useEffect` with a service call
- [ ] No direct imports of framework or context hooks
- [ ] No business logic or helpers in the body
- [ ] One query/mutation per async operation
- [ ] `toggleLoading()` in all three mutation paths
- [ ] Every destructured DI key has a `container.register()` call
- [ ] The screen needs nothing beyond the returned interface

Notes: the three service calls of the hold are one async operation (one mutation) because the use case sequences them;
nothing calls a service in `onSuccess`. `categoriesQuery.refetch()` in `onSuccess` re-runs an existing query (TanStack),
not a service call. Building `HoldTicket[]` from `checks` + form values is wiring of controller state (the token lives in
controller state), not a business rule; the rules (fee once, same-order match, classification) are in spec 72. The new
`useEffect` only copies `onContinue` into a ref.

From `.claude/rules/error-handling.md`:

- Field-level codes (`NIK_INVALID`, `DUPLICATE_NIK`, `NIK_SEAT_TAKEN`, `WRONG_CODE`…) show under the field, not in a popup.
- `401` always goes to sign-in; never an "unauthorized" page.
- Every code the endpoint can return (see `openapi.yaml`) has an entry in `ERROR_CODE_MAP` and both locale files.
- No automatic replay of failed mutations; the user retries.
- ❌ Auto-retrying mutations without the user

From `.claude/rules/presentation.md` (route table):

- `/payment` | Payment (Snap) | `booking`
- Keep the paths in `src/utils/constants/routes.ts`; never hard-code them in controllers.

From `CLAUDE.md`:

- All async work goes through TanStack Query (`useQuery` / `useMutation`) — never `.then()` or `useEffect` + fetch.
- Countdowns use server time: `expiresAt − serverNow` from the API, never the device clock.
- Errors from the API carry a stable `code`; map it to a translation key, never show raw messages.
- NIKs are shown masked after entry and never logged.

## Correctness Properties

- Property 1: with two Festival B and one Tribun Atas selected and `adminFee` 10 000, `summary` has two lines in category
  order with the formatted amounts, `fee` "Rp 10.000" and `total` "Rp 2.160.000" (ID) / "Rp 2,160,000" (EN); with 1, 2
  or 3 tickets `fee` is the same string. **Validates: Requirements 1**
- Property 2: `summary` and `checkout` are null while loading, on error, not-found, with 0 tickets, and when `timeUp`.
  **Validates: Requirements 1, 2**
- Property 3: `checkout.enabled` is true only when every condition of Requirement 2 holds (table test flipping one
  condition at a time), and `hint` follows the first-match order. **Validates: Requirements 2**
- Property 4: `onContinue` with an enabled checkout calls `mutate` once with `{ eventId, admissionToken: 'adm_token',
idempotencyKey: <uuid>, tickets: [slot order, tokens, last 4], bookingId: null }`; two calls in the same act call it
  once. **Validates: Requirements 3**
- Property 5: after `retryable` with `bookingId: 'bk1'`, the next tap sends the same `idempotencyKey` and `bookingId:
'bk1'`; after a holder re-validation (new token) it sends a new key and `bookingId: null`; after `not-held` a new key.
  **Validates: Requirements 3**
- Property 6: `mutationFn`, `onSuccess` and `onError` each call `toggleLoading` once. **Validates: Requirements 3**
- Property 7: `held` → `router.push('/payment?booking=bk1')`, `order_hold_created` tracked, `checkout.busy` true and
  `enabled` false; a later `admission-invalid` categories answer does not redirect. **Validates: Requirements 3**
- Property 8: every row of the outcome table produces exactly its page effect, popup input (message key, `reference`,
  action) and navigation target, and no other. **Validates: Requirements 4**
- Property 9: `nik-conflict [1]` leaves slot 0's ✓ and gives slot 1 the seat-taken error with "Gunakan NIK pemegang
  lain."; `allHoldersVerified` becomes false. `nik-conflict []` gives every slot the `error_attendee_not_validated` field
  error with `canRecheck`. **Validates: Requirements 4**
- Property 10: after `sold-out cat_b` the categories `refetch` is called once, the hint names Festival B, `enabled` is
  false while Festival B is selected and true again after decrementing it to 0 (holders still verified).
  **Validates: Requirements 2, 4**
- Property 11: when the window reaches zero while `isPending` is true, `timeUp` stays false and `endOrderWindowUseCase`
  is not called; after `held` and zero, the same; when the pending hold then fails, `timeUp` becomes true on that render.
  **Validates: Requirements 5**
- Property 12: no `trackEvent` call's params contain a name, a NIK (or its last 4 digits), a validation token or a
  booking id; `reportError` is never called by the hold. **Validates: Requirements 4, 6**
- Property 13: every existing `OrderController` test passes; the shell test compiles with `summary: null, checkout:
null`. **Validates: Requirements 6**

## Error Handling

`holdBookingUseCase` results and rethrown errors (spec 72):

| Outcome / code                                                                          | User sees                                                                                                        |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `nik-conflict` (slot known) `NIK_SEAT_TAKEN`                                            | that field: "NIK ini sudah punya tiket untuk event ini. Gunakan NIK pemegang lain."                              |
| `nik-conflict` (slot known) `DUPLICATE_NIK`                                             | that field: "NIK ini sudah dipakai di tiket lain dalam pesanan ini."                                             |
| `nik-conflict` (no slot), `attendees-stale`                                             | every field: "Periksa NIK setiap pemegang tiket dulu." + "Periksa lagi"; hint with the code's message            |
| `sold-out` `CATEGORY_SOLD_OUT`                                                          | categories refreshed; hint "Festival B sudah habis. Kurangi tiketnya atau pilih kategori lain."                  |
| `over-reservation` `QUANTITY_OVER_RESERVATION`                                          | categories refreshed (new limit); hint "Jumlah tiket melebihi kuota giliran Anda…"                               |
| `active-booking` `ACCOUNT_HAS_ACTIVE_BOOKING`                                           | popup "Anda masih punya pesanan yang belum dibayar untuk event ini." (+ "Buka pesanan itu" when PAYMENT_PENDING) |
| `not-held` `BOOKING_NOT_HELD` / 404                                                     | popup "Pesanan ini sudah tidak aktif."                                                                           |
| `admission-invalid` `ADMISSION_INVALID`                                                 | back to the waiting room (`router.replace`)                                                                      |
| `unauthorized` / 401                                                                    | `/login?next=%2Forder%3Fevent%3D<id>`                                                                            |
| `retryable` `INTERNAL_ERROR`, `PAYMENT_PROVIDER_BUSY`, `SERVICE_UNAVAILABLE`, `TIMEOUT` | popup with the mapped message, "Kode bantuan", "Coba lagi"                                                       |
| `retryable` `NETWORK_ERROR`                                                             | popup "Koneksi terputus. Periksa internet Anda lalu coba lagi." + "Coba lagi" (+ the offline banner)             |
| rethrown 422 `VALIDATION_FAILED`, `UNKNOWN_ERROR`                                       | popup with the mapped message and "Kode bantuan"                                                                 |

No new error code and no new `ERROR_CODE_MAP` entry: every code above is already mapped with both locale strings.

**Open questions / doc conflicts (for the PR and the core team):**

- v1 has no cancel (LLD-02 §4): after a payment-entry refusal (sold out, NIK seat) the SELECTION booking stays until its
  5 minutes end, so a corrected selection gets `active-booking` until then. Given that the order window is also 5
  minutes, the buyer will usually run out of time. Options for core: release the SELECTION booking on a refused
  `enterPayment`, or let `createBooking` replace a SELECTION booking of the same account and event.
- SELECTION's own 5 minutes start at `createBooking` (LLD-02 §3.1), while ADR-0005's order window starts at the claim.
  The page keeps showing the claim window from `getCategories` until it navigates; it does not read
  `booking.expiresAt`.
- The payment page (FR-20-W1) calls `enterPayment` again and needs the admission token: it only knows the booking id, so
  it must read `getBooking(id).eventId` and then `admissionStore.get(eventId)`. This controller therefore never clears
  the token after `held`.

## Testing Strategy

`src/controllers/__tests__/order.controller.test.ts`, new `describe('order hold (FR-16-W1)')`:

- Harness: `useMutationTanstack` stores options by key: `if (options.mutationKey?.[0] === 'order-hold') holdOptions =
options; else mutationOptions = options;` and returns `{ mutate: holdMutate, isPending: holdPending }` for the hold
  (`let holdPending = false`, flipped between renders) and the existing `{ mutate, isPending: false }` otherwise. Add
  `holdBookingUseCase: HoldBookingUseCase({ bookingService: {} as never })` but replace `execute` with `vi.fn()` (keep
  the real `quote`), `useLoading: () => ({ isLoading: false, toggleLoading })`, `usePopupError: () => ({ openPopupError,
closePopupError: vi.fn() })`. Mock `@utils/random-uuid` with a counter (`uuid-1`, `uuid-2`, …).
- A helper brings two slots to "valid": select quantities, fill the form through the holder views, then resolve the NIK
  mutation's `onSuccess` with `valid` results (the existing pattern around line 968).
- One `it` per Property 1–12 (Property 8 as `it.each` over the outcome table); time with `vi.useFakeTimers` and the
  existing countdown harness for Property 11.
- `src/presentation/pages/Order/__tests__/index.test.tsx`: add `summary: null`, `checkout: null` to `base()` (rendering
  tests are spec 74).
- Gate: `npx tsc --noEmit && npx vitest --run`; controller coverage ≥ 85%; `npm run lint` (react-hooks rules: refs
  written only in handlers / effects, no `Date.now()` in render).
