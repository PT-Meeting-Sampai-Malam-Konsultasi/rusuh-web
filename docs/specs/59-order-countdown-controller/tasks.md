# Implementation Plan: Order countdown (controller)

## Overview

Extend `OrderController` with the 5-minute order-window countdown: an anchor (the `expiresAt` / `serverNow` of the last
real `ok` categories answer plus its `dataUpdatedAt`) kept in state and written only from a non-placeholder answer, a
1-second clock that runs while time is left, and the derived `timer` (`{ seconds, label }`: whole seconds for the shared
`Timer` component, which formats and warns) and `timeUp`. Server times give the window length; the device clock only
measures elapsed time. Writer: controller-writer. Depends on spec 13 (the use case already returns both times); spec 60
renders it and writes the translation key. No use-case spec (no business logic beyond one subtraction; see the design
Overview).

## Tasks

- [x] 1. In `src/controllers/order.controller.ts`: export `OrderTimerView { seconds: number; label: string }`, add `timer: OrderTimerView | null` and `timeUp: boolean` to `OrderControllerInterface`, and add the module-scope `TimerAnchor` type [Requirement 6]
- [x] 2. In the same file: the `anchor` state with the guarded render-time `setAnchor` (real `ok` answer, `!isPlaceholderData`, new `dataUpdatedAt`), the `now` clock with its `setInterval` effect (`ticking` only while seconds left is above 0, cleared on unmount), `secondsLeft` from the anchor with the `Number.isFinite` check, and `timer` (`Math.floor(secondsLeft)`, `t('order_timer_label')`) / `timeUp` gated on `status === 'ready'` in the returned object [Requirement 1, Requirement 2, Requirement 3, Requirement 4, Requirement 5]
- [x] 3. Add `timer: null` and `timeUp: false` to `base()` in `src/presentation/pages/Order/__tests__/index.test.tsx` so `tsc --noEmit` passes [Requirement 6]
- [x] 4. In `src/controllers/__tests__/order.controller.test.ts`: give the categories fake a stable default `dataUpdatedAt` and `isPlaceholderData: false`, then add `describe('order countdown (FR-17-W1)')` with fake timers per the Testing Strategy (wrong device clock, elapsed since the answer, whole seconds, ticking, stop at 0 with `timeUp`, already-expired answer, null states, `NaN` dates, placeholder / language switch, re-anchor, interval cleared on unmount) [Requirement 1, Requirement 2, Requirement 3, Requirement 4, Requirement 5, Requirement 6]
- [x] 5. Run the gate check [ALL]

## Task Dependency Graph

```json
{ "waves": [[1], [2, 3], [4], [5]] }
```

## Notes

- Gate: `npx tsc --noEmit && npx vitest --run`; controller coverage ≥ 85%. Tasks 1 and 2 edit the same file, in sequence.
- Re-check before done: the countdown reads only the anchor (never `ok.expiresAt` or `categoriesQuery.dataUpdatedAt`
  directly); no `Date.now()` in the render body; no comparison of `Date.now()` with `expiresAt`; nothing written to
  storage; no new dep in `OrderControllerDeps` and no new import; no analytics, popup or redirect at zero.
- The controller sends whole seconds and the label only. The `m:ss` text and the pink warning (`seconds <= 60`) belong to
  the shared `Timer` component (spec 60), as on the queue turn screen: no `formatCountdown`, no `urgent` here.
- The trap this design exists for: on a language switch TanStack (5.105.0) reports the previous answer as placeholder
  data with the new query's `dataUpdatedAt` of 0. Do not "simplify" to `now − categoriesQuery.dataUpdatedAt`.
- The test fake's default `dataUpdatedAt` must be one number per test (set in `beforeEach`), not `Date.now()` per render:
  a changing value re-anchors on every render and loops.
- Difference recorded in the design: `timer` / `timeUp` are gated on `status === 'ready'` (a little tighter than
  "categories `ok`").
- `timeUp` has no consumer yet: the time's-up sheet and "Antre lagi" are FR-18-W1 (rusuh-web#17). Keeping the countdown
  across a refresh is FR-19-W1 (rusuh-web#18): a reload refetches `getCategories` and re-anchors, nothing is stored.
- The translation key `order_timer_label` is written by spec 60 task 1 (same PR).
- Commit: `feat(order): [FR-17-W1] count down the order window from server time`.
