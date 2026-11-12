# Implementation Plan: Order time's up (controller)

## Overview

Make the end of the order window final on the Order page: latch an `expired` state the first render the countdown is at
zero (spec 59's condition), expose it as `timeUp`, and add `timeUpSheet` (translated texts, home link, `queueAgain`). On
the first expiry, once, in an effect: end the window on this device (`endOrderWindowUseCase`, spec 61), track
`order_time_up`, and set the existing `redirected` guard so no later `admission-invalid` answer pulls the page away
behind the sheet. The categories query is disabled after expiry, so a language switch keeps the page as it is.
`queueAgain()` tracks `queue_rejoin` and replaces the page with `/queue?event=<id>`. Writer: controller-writer. Depends
on spec 61 (DI key) and spec 59 (countdown); spec 63 renders the sheet and writes the translation keys.

## Tasks

- [x] 1. In `src/controllers/order.controller.ts`: export `OrderTimeUpView`, add `timeUpSheet: OrderTimeUpView | null` to `OrderControllerInterface`, update the `timeUp` doc comment (latched), and add `'endOrderWindowUseCase'` to `OrderControllerDeps` and the destructured deps [Requirement 4, Requirement 5]
- [x] 2. In the same file: `useState(false)` for `expired` before the categories query; `enabled: hasEventId && !expired` on the categories query; after the clock effect, the guarded render-time `setExpired(true)` when `status === 'ready' && secondsLeft === 0`; return `timeUp: expired` [Requirement 1, Requirement 3]
- [x] 3. In the same file: the `ended` ref and the `useEffect` keyed on `expired` that once sets `redirected.current = true`, calls `endOrderWindowUseCase.execute(eventId)` and tracks `order_time_up` `{ eventId, tickets }`; and `timeUpSheet` (texts from `order_time_up_*` and `action_back_home`, `homeHref: ROUTES.HOME`, `queueAgain` tracking `queue_rejoin` `{ eventId, from: 'order' }` and calling `router.replace(withQuery(ROUTES.QUEUE, { event: eventId }))`) [Requirement 2, Requirement 3, Requirement 4]
- [x] 4. Add `timeUpSheet: null` to `base()` in `src/presentation/pages/Order/__tests__/index.test.tsx` so `tsc --noEmit` passes [Requirement 5]
- [x] 5. In `src/controllers/__tests__/order.controller.test.ts`: add `endOrderWindowUseCase` to `deps()`, then `describe('order time up (FR-18-W1)')` with fake timers per the Testing Strategy (no sheet before zero, sheet at zero and at once for an expired answer, use case and `order_time_up` once, latch through a status change, categories disabled after expiry, no redirect for `admission-invalid` after expiry from categories or a NIK check, `queueAgain` navigation and analytics, texts retranslated on a language switch) [Requirement 1, Requirement 2, Requirement 3, Requirement 4, Requirement 5]
- [x] 6. Run the gate check [ALL]

## Task Dependency Graph

```json
{ "waves": [[1], [2, 4], [3], [5], [6]] }
```

## Notes

- Gate: `npx tsc --noEmit && npx vitest --run`; controller coverage ≥ 85%. Tasks 1–3 edit the same file, in sequence.
  Spec 61 must be in first (the `endOrderWindowUseCase` key in `AwilixRegistry` and its registration).
- `setExpired` is a guarded render-time update (the spec 59 anchor pattern), not an effect: an effect would paint "0:00"
  without the sheet for one frame and trips `react-hooks/set-state-in-effect`.
- The use case and the analytics run in the effect, once (the `ended` ref), never in render. Rule tension recorded in the
  design: the effect calls a synchronous, local use case, not a service; no async work is added.
- No popup, no error popup, no loading overlay, no automatic navigation at zero: the buyer leaves through the sheet.
- The translation keys `order_time_up_stamp`, `order_time_up_title`, `order_time_up_body`, `order_time_up_queue_again`
  are written by spec 63 task 1 (same PR); "Ke beranda" / "Go home" reuses the existing `action_back_home`.
- Accepted race, not handled: the server sweeper may lag the client's zero by up to ~1 s; a rejoin inside that second can
  get the old place back (ADR-0030 live-place check), which then ends and shows "missed".
- Known follow-up (spec 63): no focus trap, so keyboard focus can reach fields under the scrim; the redirect guard keeps
  a NIK check started that way from navigating.
- Out of scope: the countdown across a refresh (FR-19-W1, rusuh-web#18), the payment countdown / expiry (FR-21 /
  FR-23), the hold, disabling inputs under the sheet, any server release call.
- Commit: `feat(order): [FR-18-W1] end the order window at zero`.
