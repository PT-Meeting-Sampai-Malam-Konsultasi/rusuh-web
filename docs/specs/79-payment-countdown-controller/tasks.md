# Implementation Plan: Payment countdown (controller)

## Overview

Extend `PaymentController` with the 10-minute payment-window countdown, following the order countdown (spec 59): an
anchor (`view.expiresAt` / `view.serverNow` of the last real `ready` page answer plus its `dataUpdatedAt`) written in
render under a guard, a 1-second clock that runs only while the timer is shown and above zero, and the derived `timer`
(`{ seconds, label }` for the shared `Timer`) and `timeUp`. At zero "Bayar" is off, the page query is refetched once per
zero so the server moves the page to the existing `inactive` (or `paid`) state, and `payment_expired` is tracked once.
Writer: controller-writer. Depends on spec 76 (the use case already returns both times); spec 80 renders the timer and
writes `payment_timer_label`. No entity, service or use-case spec (no new operation, no business logic beyond one
subtraction).

## Tasks

- [x] 1. In `src/controllers/payment.controller.ts`: export `PaymentTimerView { seconds: number; label: string }`, add `timer: PaymentTimerView | null` and `timeUp: boolean` to `PaymentControllerInterface`, and add the module-scope `TimerAnchor` type and `TIMER_STATES` set [Requirement 7]
- [x] 2. In the same file: the `anchor` state with the guarded render-time `setAnchor` after `view`; move the `state` computation above `onPay`; the `now` clock and its `setInterval` effect (`ticking` only while shown and above 0, cleared on unmount); `secondsLeft` from the anchor with the `Number.isFinite` check; `timer` gated on `TIMER_STATES` and `timeUp` in the returned object [Requirement 1, Requirement 2, Requirement 4, Requirement 5]
- [x] 3. In the same file: `timeUp` in `onPay`'s guard and deps, `pay.enabled = !paying && !timeUp`, and the time-up effect (`void refetchPage()` per false → true edge; `trackEvent(ANALYTICS_EVENTS.PAYMENT_EXPIRED, { booking_id })` once via a ref); add `timer: null` and `timeUp: false` to `base()` in `src/presentation/pages/Payment/__tests__/index.test.tsx` [Requirement 3, Requirement 6, Requirement 7]
- [x] 4. In `src/controllers/__tests__/payment.controller.test.ts`: stable default `dataUpdatedAt` (`answeredAt` set in `beforeEach`) and `isPlaceholderData` in the page fake; replace the `not.toHaveProperty('timer')` assertion; add `describe('payment countdown (FR-21-W1)')` with fake timers per the Testing Strategy (wrong device clock, elapsed since the answer, ticking, stop at 0, pay off and `onPay` no-op, one refetch per zero, inactive / paid / re-anchor after the refetch, verifying keeps polling, `payment_expired` once, null states, `NaN` dates, unmount) [Requirement 1, Requirement 2, Requirement 3, Requirement 4, Requirement 5, Requirement 6, Requirement 7]
- [x] 5. Run the gate check [ALL]

## Task Dependency Graph

```json
{ "waves": [[1], [2], [3], [4], [5]] }
```

## Notes

- Gate: `npx tsc --noEmit && npx vitest --run`; controller coverage ≥ 85%; `npm run lint` in lint-staged. Tasks 1–3 edit
  the same file, in sequence.
- Re-check before done: the countdown reads only the anchor; no `Date.now()` in the render body; no comparison of
  `Date.now()` with `expiresAt`; nothing written to storage; no new key in `PaymentControllerDeps`; no popup, navigation
  or state change on the client's zero (the server decides, ADR-0026).
- The existing test harness defaults `dataUpdatedAt` to 0: without the new stable default every existing test would
  start at `timeUp` and fail on `pay.enabled`.
- Lifts spec 77's "SHALL NOT … expose a countdown (FR-21-W1)" and its "no countdown field" property, and the
  `payment_expired` half of its analytics deferral.
- Out of scope: the "Waktu habis" screen and "Antre lagi" (FR-23-W1), the expiry e-mail (backend), `order_expired`,
  persistence beyond the reload's refetch (NFR-02-W1).
- `payment_timer_label` is written by spec 80 task 1 (same PR).
- Commit: `feat(payment): [FR-21-W1] count down the payment window from server time`.
