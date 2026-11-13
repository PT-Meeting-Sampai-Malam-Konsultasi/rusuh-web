# Implementation Plan: Order countdown (page)

## Overview

Show the order-window countdown from spec 59 in the Order page's flow header by reusing the shared `Timer` component:
one new optional `compact` prop (HiFi app-bar form below 720px: 22px value, 3px offset, tighter padding, label visually
removed; the normal stamp from 720px), one new `timer` prop from the shell to `FlowHeader`, the `order_timer_label` copy
in ID and EN, and a `short_window` mock scenario (75-second window) to see the warning and zero states quickly. `Timer`
keeps formatting the value and deciding the warning (`seconds <= 60`: pink from "1:00"). Writer: presentation-writer.
Depends on spec 59 (`OrderControllerInterface.timer`).

## Tasks

- [x] 1. Add `order_timer_label` ("sisa waktu memilih" / "left to choose") to `src/translation/locale/id.json` and `en.json`, and assert both values in `src/infrastructure/i18n/__tests__/i18n.test.ts` [Requirement 5, Requirement 7]
- [x] 2. In `src/presentation/components/Timer/index.tsx`: add the optional `compact?: boolean` prop and `data-compact={compact || undefined}` on the root; nothing else changes [Requirement 3]
- [x] 3. In `src/presentation/components/Timer/timer.module.css`: add the `[data-compact]` rules per the design (compact base: 22px, 5px 9px 4px, 3px ink offset, label `sr-only`; normal values restated in `@variant md`; pink plate for `.warn[data-compact]` at both sizes), leaving the existing rules as they are [Requirement 2, Requirement 3]
- [x] 4. In `src/presentation/pages/Order/index.tsx`: read `timer` from the controller and pass `timer={timer && <Timer seconds={timer.seconds} label={timer.label} compact />}` to `FlowHeader`; nothing else changes [Requirement 1, Requirement 2, Requirement 4]
- [x] 5. Add the `short_window` scenario to `src/infrastructure/mocks/scenario.ts` and the 75-second window to the categories handler in `src/infrastructure/mocks/handlers/booking.handlers.ts`, with tests in `scenario.test.ts` and `booking.handlers.test.ts` [Requirement 6, Requirement 7]
- [x] 6. Tests: extend `src/presentation/components/Timer/__tests__/index.test.tsx` (`data-compact` on / off, label still in the DOM, warning at 60 / 61 / 0 with `compact`, ID and EN label, CSS module checks; existing tests untouched) and `src/presentation/pages/Order/__tests__/index.test.tsx` (two timers in the banner when given, both compact, warning at 60 seconds, none when `timer` is null in ready / loading / error / not-found) [Requirement 1, Requirement 2, Requirement 3, Requirement 4, Requirement 7]
- [x] 7. Run the gate check and the manual check at 390 and 1440, ID and EN, with `?mock=ok` and `?mock=short_window`, plus the queue turn timer for no visual change [ALL]

## Task Dependency Graph

```json
{ "waves": [[1, 2, 3, 5], [4], [6], [7]] }
```

## Notes

- Gate: `npx tsc --noEmit && npx vitest --run && npm run build`; `npm run lint` (ESLint + Stylelint) runs in
  lint-staged; `out/order.html` keeps scoped class names.
- No new component: `Timer` is the one timer. Without `compact` its markup and styles are exactly today's, so `QueueTurn`
  is untouched; check the turn screen once by eye (task 7).
- `FlowHeader` is reused unchanged: its `timer` slot renders the node in the flow bar and in the app bar, and the bar
  that is not shown is `display: none`, so one timer is visible and announced. jsdom applies no CSS: page tests see two.
- Warning: `Timer`'s existing `seconds <= warnAt` with the default 60, so the first pink value is "1:00" (design-system
  "pink at 60 s", HiFi `left <= 60`). The digits are the status, pink is emphasis; no extra word in this ticket.
- The 3px compact offset has no token (`--shadow-off-s` is 4px): raw `box-shadow` from `--color-ink` / `--color-pink`.
  From 720px the compact timer must be pixel-identical to the normal one.
- Known follow-up, not this ticket: `Timer`'s `aria-live="polite"` while warning and its missing accessible name (shared
  with the queue page).
- `timeUp` is not rendered: the time's-up sheet and "Antre lagi" are FR-18-W1 (rusuh-web#17). At zero the timer stays
  "0:00" in pink and the page is otherwise unchanged.
- Mock caveat for the manual check: each `getCategories` request gets a fresh window in the mock, so a language switch
  restarts the countdown there; the real API keeps `expiresAt`. `?mock=ok` resets the scenario.
- The timer re-renders the Order screen once a second (the controller's memoised lists are not recomputed). Check that
  typing in the holder fields is unaffected; no `React.memo` is planned.
- Out of scope: keeping the countdown across a refresh (FR-19-W1), the payment countdown (FR-21-W1, will reuse `Timer`
  with `warnAt={120}`), the hold, disabling inputs at zero, the `openapi.yaml` contract drift.
- Commit: `feat(order): [FR-17-W1] show the order countdown in the flow header`.
