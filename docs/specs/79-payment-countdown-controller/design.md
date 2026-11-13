# Design Document

## Overview

`PaymentController` (`src/controllers/payment.controller.ts`) is extended, not replaced. Additions, mirroring the order
countdown (spec 59, `order.controller.ts`):

1. **`PaymentTimerView`** (`{ seconds, label }`) and two interface fields: `timer: PaymentTimerView | null`,
   `timeUp: boolean`.
2. **An anchor** in `useState`: `view.expiresAt` / `view.serverNow` of the last real `ready` page answer and the moment
   it arrived (`pageQuery.dataUpdatedAt`), written in render under a guard.
3. **One clock**: `useState(() => Date.now())` + `setInterval` in `useEffect`, running only while the timer is shown and
   above zero.
4. **Derived values**: seconds left → `timer` (in the timer states) and `timeUp`.
5. **Time-up reaction**: `pay.enabled` false and `onPay` a no-op; one `pageQuery.refetch()` per false → true edge of
   `timeUp`; `payment_expired` once per page visit.

No new dependency, DI key, query, mutation or popup; one new import name (`ANALYTICS_EVENTS.PAYMENT_EXPIRED` from the
already-imported `@utils/analytics`). No use case: the use-case rule table asks for one for "multi-step flow, business
validation, branching on status"; this is one subtraction on fields spec 76 already returns, and the controller rule
puts countdowns in the controller. The rule tension recorded in spec 59 (`core-use-case.md` lists "remaining time from
`expiresAt − serverNow`" as a use-case example) is resolved the same way: the elapsed part needs React state and
TanStack's `dataUpdatedAt`, which a use case may not touch.

**The server decides expiry (ADR-0026).** The client's zero is a display event, not a state change. At zero the page
disables "Bayar" (a tap would only meet 409 `BOOKING_NOT_HELD`) and asks the server again through the existing page
query. The server checks `expires_at` on every read (ADR-0005) and the sweeper cancels within a second, so the refetch
returns 409, which `payBookingUseCase.load` already settles into `inactive` (existing message) or `paid` (a payment that
landed in time → e-ticket). If the server still answers 200 with time left (device clock drift during the window), the
countdown re-anchors and "Bayar" comes back.

**Differences from the HiFi (ADRs win):**

| Topic             | HiFi (`payment.html`)                                   | This spec                                                                  |
| ----------------- | ------------------------------------------------------- | -------------------------------------------------------------------------- |
| Source of time    | `data-countdown="552"` counted with the device clock    | `expiresAt − serverNow` + elapsed since the answer (ADR-0005)              |
| At zero           | `data-onzero="expired"` opens the "Waktu habis" section | `timeUp`, pay off, one refetch; the server moves the page to `inactive`    |
| States with timer | select, va, qris, verifying                             | `ready`, `opening`, `verifying`, `failed`, `busy` (no method screens, H-3) |

### Anchoring

`pageQuery` has no `placeholderData` and its key (`[QUERY_KEYS.PAYMENT, bookingId]`) has no locale, so the placeholder
trap of spec 59 does not occur today; the `isPlaceholderData` guard is kept so the pattern stays identical and safe if a
placeholder is ever added.

```ts
const [anchor, setAnchor] = useState<TimerAnchor | null>(null);
if (view && !pageQuery.isPlaceholderData && pageQuery.dataUpdatedAt !== anchor?.receivedAt) {
  setAnchor({ expiresAt: view.expiresAt, serverNow: view.serverNow, receivedAt: pageQuery.dataUpdatedAt });
}
```

Guarded render-time `setState` (React's "adjust state while rendering"), as `order.controller.ts` and this file's own
`handledAt`; the guard is false right after the update, so it cannot loop. `Date.now()` is never called in the render
body (`react-hooks/purity`): only in the `useState` initialiser and the interval callback.

## Architecture

```
PaymentScreen ─► container.resolve('paymentController')       (src/infrastructure/di/controllers/payment.ts, unchanged)
  │
  ├─ pageQuery, snap preload, phase, attempt, payMutation, statusQuery, effects        unchanged
  ├─ view = loaded?.view ?? null                                                       unchanged
  ├─ anchor: TimerAnchor | null          ← new useState, guarded setAnchor right after `view`
  ├─ state (first match)                 unchanged logic; moved above onPay (it reads only values defined before it)
  ├─ now: number                         ← new useState(() => Date.now())
  ├─ windowSeconds = anchor ? (Date.parse(anchor.expiresAt) − Date.parse(anchor.serverNow)) / 1000 : NaN
  ├─ secondsLeft   = view && anchor && Number.isFinite(windowSeconds)
  │                    ? Math.max(0, windowSeconds − Math.max(0, now − anchor.receivedAt) / 1000) : null
  ├─ showsTimer    = TIMER_STATES.has(state) && secondsLeft !== null
  ├─ timeUp        = showsTimer && secondsLeft === 0
  ├─ ticking       = showsTimer && secondsLeft > 0
  │     useEffect(() => { if (!ticking) return; const id = setInterval(() => setNow(Date.now()), 1000);
  │                       return () => clearInterval(id); }, [ticking])
  ├─ useEffect([timeUp]): if (!timeUp) return; void refetchPage(); payment_expired once (ref)
  ├─ onPay: `if (!view || timeUp || payGuard.current || paying) return;` …unchanged; `timeUp` in the deps
  ├─ pay.enabled = !paying && !timeUp
  └─ timer = showsTimer ? { seconds: Math.floor(secondsLeft), label: t('payment_timer_label') } : null
```

Route `/payment?booking=<id>` (unchanged). API operations through spec 76, no new call: `getPaymentPage` (the anchor;
the refetch at zero), `getPaymentStatus` (poll, unchanged). Data flow: `getPaymentPage` → `load` `ready` (`view.expiresAt`,
`view.serverNow`) → anchor → `timer` / `timeUp` → shell → `FlowHeader` `timer` slot → `Timer warnAt={120}` (spec 80).

Notes on the arithmetic and hooks:

- `now` and `anchor.receivedAt` are both device-clock readings; only their difference is used, so a constant clock error
  cancels out. `Math.max(0, now − receivedAt)` covers an answer arriving after the last tick (and a clock set back).
- The clock runs only while the timer is shown (decision 3). If it was stopped (e.g. `error` after a failed refetch) and
  a new answer re-anchors, the stale `now` is earlier than `receivedAt`: elapsed clamps to 0 and the next tick catches up.
- `timeUp` uses the unrounded value; `timer.seconds` can read 0 for the last fraction of a second before it.
- `const { refetch: refetchPage } = pageQuery;` is TanStack's stable bound function; the effect runs on the `timeUp`
  edge only. It is TanStack-managed async work (the same `refetch` the error view's "Coba lagi" calls), not a service
  call in an effect.
- Hooks stay unconditional. New order after the status-handling block: … `state` → `now` → clock effect → time-up
  effect → `onPay` (`useCallback`) → views.

## Components and Interfaces

```ts
// src/controllers/payment.controller.ts (changes; everything else unchanged)

/** The payment-window countdown for the flow header (FR-21-W1): what the shared Timer component takes. */
export interface PaymentTimerView {
  /** Whole seconds left, rounded down, never negative. From server time plus elapsed client time. */
  seconds: number;
  /** "untuk membayar" / "left to pay". */
  label: string;
}

export interface PaymentControllerInterface {
  // …all existing fields unchanged…
  /** Null unless state is ready / opening / verifying / failed / busy and expiresAt / serverNow are valid dates. */
  timer: PaymentTimerView | null; // ← new
  /** Seconds left reached 0 in a timer state: "Bayar" is off and the page has asked the server again. */
  timeUp: boolean; // ← new
}

// PaymentControllerDeps: unchanged (no new key).
```

Module scope (not exported):

```ts
/** The answer the countdown runs from: its server times and when it arrived (the query's dataUpdatedAt). */
interface TimerAnchor {
  expiresAt: string;
  serverNow: string;
  receivedAt: number;
}

/** The states that show the order, so the payment countdown (HiFi: select, va, qris, verifying). */
const TIMER_STATES: ReadonlySet<PaymentScreenState> = new Set(['ready', 'opening', 'verifying', 'failed', 'busy']);
```

Time-up effect:

```ts
const { refetch: refetchPage } = pageQuery;
const expiredTracked = useRef(false);
useEffect(() => {
  if (!timeUp) return;
  // The server decides (ADR-0026): 409 BOOKING_NOT_HELD → load settles to inactive / paid; 200 → re-anchor.
  void refetchPage();
  if (expiredTracked.current) return;
  expiredTracked.current = true;
  analyticsAdapter.trackEvent(ANALYTICS_EVENTS.PAYMENT_EXPIRED, { booking_id: bookingId });
}, [timeUp, refetchPage, analyticsAdapter, bookingId]);
```

Compile check against the existing code and `AwilixRegistry`:

- `pageQuery` is `UseQueryResult<PaymentPageResult, HttpError>`: `dataUpdatedAt: number`, `isPlaceholderData: boolean`,
  `refetch` exist; no cast. `view` is `PaymentView | null`, whose `expiresAt` and `serverNow` are `string`.
- `TIMER_STATES.has(state)` takes `PaymentScreenState`; `secondsLeft > 0` is reached only when `showsTimer` (non-null),
  so write `ticking = secondsLeft !== null && secondsLeft > 0 && TIMER_STATES.has(state)` to keep the narrowing.
- `PaymentControllerInterface` widens by two required fields: the shell test's `base()` must gain them (task 3).
  `asFunction(PaymentController)` and `paymentController: PaymentControllerInterface` in `registry.types.ts` are
  unchanged; no `AwilixRegistry` change.

## Data Models

Translation key used by this controller, **written to `src/translation/locale/id.json` and `en.json` by spec 80 task 1**
(the page spec owns the copy; both specs land in the same PR):

| Key                   | ID             | EN          | Source                |
| --------------------- | -------------- | ----------- | --------------------- |
| `payment_timer_label` | untuk membayar | left to pay | HiFi `payment.html:7` |

Analytics (tracking plan §3 exits; constant already in `src/utils/analytics.ts`, unused until now):

| Event             | Params                     | When                                    |
| ----------------- | -------------------------- | --------------------------------------- |
| `payment_expired` | `booking_id` (= bookingId) | first `timeUp` of the page visit (once) |

State shapes: `anchor: TimerAnchor | null`, `now: number` (epoch ms of the last tick), `expiredTracked: Ref<boolean>`.

Example (answer `serverNow` 03:00:00Z, `expiresAt` 03:10:00Z, arrived at device time T; any device clock). The last
column is what `Timer` prints in spec 80, for orientation:

| Moment                                                      | state     | timer.seconds | timeUp | pay.enabled | interval | Timer shows |
| ----------------------------------------------------------- | --------- | ------------- | ------ | ----------- | -------- | ----------- |
| page loading                                                | loading   | (null)        | false  | (pay null)  | off      | —           |
| T                                                           | ready     | 600           | false  | true        | on       | 10:00       |
| T + 48 s                                                    | ready     | 552           | false  | true        | on       | 9:12        |
| T + 480 s                                                   | ready     | 120           | false  | true        | on       | 2:00 (pink) |
| T + 500 s, Snap closed after `pending`                      | verifying | 100           | false  | true        | on       | 1:40 (pink) |
| T + 600 s                                                   | ready     | 0             | true   | false       | off      | 0:00 (pink) |
| refetch → 409 → `inactive`                                  | inactive  | (null)        | false  | (pay null)  | off      | —           |
| refetch → 200, `serverNow` 03:09:50Z (server had 10 s left) | ready     | 10            | false  | true        | on       | 0:10 (pink) |
| refetch → `paid`                                            | leaving   | (null)        | false  | (pay null)  | off      | —           |
| `expiresAt: 'soon'`                                         | ready     | (null)        | false  | true        | off      | —           |

## Layer Constraints

From `.claude/rules/controller.md`:

- Page UI state (`useState`), form state (`useForm` + Zod, `useWatch`)
- Queries and mutations wrapping use cases or services (`useQueryTanstack`, `useMutationTanstack`)
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
- ❌ any runtime import from @core/services, @infrastructure, or a context
- `export default` the factory; named export the interface `{Page}ControllerInterface`.
- Return only what the screen needs, already translated or formatted.
- One query or mutation per async operation. Never call a service inside another mutation's `onSuccess`/`onError`.
- Never `.then()/.catch()`; never `useEffect` + service call (use `useQueryTanstack`, with `refetchInterval` for polling).
- Error display (fallback through the same DI map, no extra import): `ERROR_CODE_MAP[error.code] ?? ERROR_CODE_MAP.UNKNOWN_ERROR` → `t(key)` → `openPopupError()` or a field error.
  `401` goes to sign-in; `NETWORK_ERROR` shows the offline message.
- Countdowns: compute from `expiresAt − serverNow` (plus elapsed client time since the response), never `Date.now()`
  against a deadline alone.
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

Notes: the clock effect only starts and clears an interval; the time-up effect calls the existing query's `refetch`
(TanStack-managed, no service called directly) and `trackEvent`. No second query is added for the time-up check: the
page query is the one async operation that loads the payment view. `toggleLoading()` does not apply (no mutation added;
the pay mutation does not use the overlay, spec 77). No helper function in the body: expressions on `anchor`, `now`
and `state`. `seconds` is a number because the shared `Timer` formats it.

From `.claude/rules/core-use-case.md` (when to create one):

| Scenario                                                  | Use case?                                       |
| --------------------------------------------------------- | ----------------------------------------------- |
| Simple GET, no transformation                             | No — controller wraps the service in `useQuery` |
| Multi-step flow, business validation, branching on status | Yes                                             |

From `.claude/rules/error-handling.md`:

- `401` always goes to sign-in; never an "unauthorized" page.
- No automatic replay of failed mutations; the user retries.

(The time-up refetch is a query, not a mutation replay; no payment is retried for the user.)

From `CLAUDE.md`:

- All async work goes through TanStack Query (`useQuery` / `useMutation`) — never `.then()` or `useEffect` + fetch.
- Countdowns use server time: `expiresAt − serverNow` from the API, never the device clock.
- Errors from the API carry a stable `code`; map it to a translation key, never show raw messages.

## Correctness Properties

- Property 1: with `serverNow` 03:00:00Z / `expiresAt` 03:10:00Z arrived "now", `timer` is
  `{ seconds: 600, label: 'payment_timer_label' }` whether the faked device clock is 2026-11-13T03:00:00Z, ten hours
  earlier or the year 2031. **Validates: Requirements 1**
- Property 2: after 48 s `timer.seconds` is 552; it is always a non-negative integer, never increases between ticks
  without a new answer; no `storage.set` argument contains `expiresAt`. **Validates: Requirements 1, 2**
- Property 3: an answer that arrived 30 s before mount starts at 570; 30.4 s before gives 569.
  **Validates: Requirements 1**
- Property 4: after 600 s `timer` is `{ seconds: 0, label }`, `timeUp` true, `pay.enabled` false,
  `vi.getTimerCount()` 0; calling `pay.onPay()` does not call `mutate` or `randomUuid`; 10 s more changes nothing.
  **Validates: Requirements 2, 3**
- Property 5: an answer with `expiresAt` ≤ `serverNow` gives `seconds: 0` and `timeUp` at once, no interval.
  **Validates: Requirements 3**
- Property 6: reaching zero calls `pageRefetch` exactly once; rerenders while `timeUp` stays true do not call it again;
  `router.replace`, `openPopupError` and `setPhase`-visible changes (`state`, `message`) do not happen on the client's
  zero alone. **Validates: Requirements 3**
- Property 7: after zero, `pageState = { data: { kind: 'inactive', refund: false } }` gives `state: 'inactive'`,
  `timer` null, `timeUp` false and the existing inactive `message`; `{ kind: 'paid' }` gives `leaving` and
  `replace('/tickets/detail?booking=bk1')`. **Validates: Requirements 3, 5**
- Property 8 (re-anchor): after zero, a real answer with `serverNow` 03:09:50Z and a new `dataUpdatedAt` gives 10,
  `timeUp` false, `pay.enabled` true, ticking again; reaching zero a second time calls `pageRefetch` again (second edge)
  but `payment_expired` is still tracked once. **Validates: Requirements 3, 4, 6**
- Property 9: in `verifying` at zero, the status query stays `enabled` with `refetchInterval: 4000`, and a `paid` step
  still leads to `leaving` + `replace(e-ticket)`. **Validates: Requirements 3**
- Property 10: `payment_expired` is tracked once with exactly `{ booking_id: 'bk1' }`. **Validates: Requirements 6**
- Property 11: `timer` null and `timeUp` false in `loading`, `inactive`, `not-found` (no booking param too), `error`
  and `leaving`; non-null in `ready`, `opening` (pay pending), `verifying`, `failed`, `busy`.
  **Validates: Requirements 5**
- Property 12: `expiresAt: 'soon'`, `serverNow: ''` or either `undefined` (cast) gives `timer` null, `timeUp` false,
  `vi.getTimerCount()` 0, `pay.enabled` true. **Validates: Requirements 5**
- Property 13: unmounting while counting leaves `vi.getTimerCount()` at 0. **Validates: Requirements 2**
- Property 14: every existing `PaymentController` test still passes (with the harness default below);
  `PaymentControllerDeps` has the same keys; the shell test compiles with `timer: null`, `timeUp: false`.
  **Validates: Requirements 7**

## Error Handling

`getPaymentPage` / `getPaymentStatus` handling is unchanged (spec 77 Error Handling); only the timer column is new:

| Source / outcome                                                         | Outcome (existing)                         | timer / timeUp           |
| ------------------------------------------------------------------------ | ------------------------------------------ | ------------------------ |
| load 200 `ready`, valid dates                                            | `ready`                                    | counted from the answer  |
| load 200 `ready`, unparseable `expiresAt` / `serverNow`                  | `ready`, "Bayar" usable                    | `null` / false           |
| load / refetch 409 `BOOKING_NOT_HELD` → `inactive` (EXPIRED / CANCELLED) | "Pesanan ini sudah tidak aktif." + home    | `null` / false           |
| same with `paid_after_expiry`                                            | the same + refund note (H-4)               | `null` / false           |
| load / refetch 409 → `paid`                                              | leaving → `/tickets/detail?booking=`       | `null` / false           |
| load 404 / no booking param                                              | not-found                                  | `null` / false           |
| 401 (load, refetch, poll)                                                | `/login?next=/payment?booking=<id>`        | `null` (loading) / false |
| refetch at zero fails (5xx, `NETWORK_ERROR`, `TIMEOUT`)                  | `error` view, mapped message + "Coba lagi" | `null` / false           |
| start 503 `PAYMENT_PROVIDER_BUSY`, `SNAP_UNAVAILABLE`, network (busy)    | busy notice + "Coba lagi"                  | counting; off at 0       |
| poll `failed`                                                            | failed notice + "Bayar lagi"               | counting; off at 0       |
| pay rethrown (422 `VALIDATION_FAILED`, unknown)                          | popup with "Kode bantuan"                  | counting                 |
| pay tapped after zero                                                    | nothing (`onPay` no-op; the button is off) | 0 / true                 |

A refetch that fails after zero shows the existing load-error view (TanStack keeps `data` but reports `isError`, which
`state` checks first); its "Coba lagi" refetches and lands on `inactive` / `paid` / a re-anchored `ready`. Time running
out is not an API error: no new code, no new `ERROR_CODE_MAP` entry.

## Testing Strategy

`src/controllers/__tests__/payment.controller.test.ts`:

- Harness: add `isPlaceholderData?: boolean` to `QueryState`; give the page fake a stable default
  `dataUpdatedAt: answeredAt` (a `let` set **once** in `beforeEach`, before `...pageState`). A fresh `Date.now()` per
  render would re-anchor every render; the current default of 0 would make every existing test start at `timeUp`
  (elapsed ≈ 56 years) and disable "Bayar".
- Update the ready-state test (line ~640): replace `not.toHaveProperty('timer')` with `timer.label ===
'payment_timer_label'`, `timer.seconds` 599–600 under real timers (or exactly 600 with fake timers), `timeUp` false;
  keep `not.toHaveProperty('secondsLeft')`.
- New `describe('payment countdown (FR-21-W1)')` with `vi.useFakeTimers({ now: … })` / `vi.useRealTimers()` in
  `afterEach`; time moves with `act(() => vi.advanceTimersByTime(ms))`; answer and state changes through `rerender()`
  after mutating `pageState`, `statusState`, `payPending`.
- One `it` per Property 1–13; Property 1 as `it.each` over three device times; Properties 6–8 as one flow on the same
  mounted controller (zero → refetch → inactive / re-anchor). Interval checks with `vi.getTimerCount()`.
- No warning-state assertions (spec 80).
- Fixture: `timer: null`, `timeUp: false` in `base()` of `src/presentation/pages/Payment/__tests__/index.test.tsx`.
- Gate: `npx tsc --noEmit && npx vitest --run`; controller coverage ≥ 85%; `npm run lint` (guarded `setAnchor` passes
  the `react-hooks` rules; no `Date.now()` in the render body).
