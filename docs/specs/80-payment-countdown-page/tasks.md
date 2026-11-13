# Implementation Plan: Payment countdown (page)

## Overview

Show the payment-window countdown from spec 79 in the Payment page's flow header, wired exactly like the Order page
(spec 60): `timer={timer && <Timer seconds={timer.seconds} label={timer.label} warnAt={120} compact />}` on
`FlowHeader`, the `payment_timer_label` copy in ID and EN, and a `short_payment` mock scenario (150-second window) to
see the warning, zero and server-driven inactive states quickly. `Timer` keeps formatting the value and deciding the
warning (pink from "2:00"); "Bayar" off at zero comes from `pay.enabled` (already rendered). No component or CSS change.
Writer: presentation-writer. Depends on spec 79 (`PaymentControllerInterface.timer`).

## Tasks

- [x] 1. Add `payment_timer_label` ("untuk membayar" / "left to pay") after `payment_step_done` in `src/translation/locale/id.json` and `en.json`, and assert both values in `src/infrastructure/i18n/__tests__/i18n.test.ts` [Requirement 4, Requirement 6]
- [x] 2. In `src/presentation/pages/Payment/index.tsx`: read `timer` from the controller, import `Timer`, and pass `timer={timer && <Timer seconds={timer.seconds} label={timer.label} warnAt={120} compact />}` to `FlowHeader`; nothing else changes [Requirement 1, Requirement 2, Requirement 3]
- [x] 3. Add the `short_payment` scenario to `src/infrastructure/mocks/scenario.ts` and `MOCK_SHORT_PAYMENT_WINDOW_MS` (150 s) to the payment-entry handler in `src/infrastructure/mocks/handlers/booking.handlers.ts`, with tests in `scenario.test.ts` and `booking.handlers.test.ts` [Requirement 5, Requirement 6]
- [x] 4. Tests in `src/presentation/pages/Payment/__tests__/`: `timerView()` in `fixtures.ts`; replace the "no timer" assertions; two compact timers in the banner with value and label; warning at 120 / 121; zero with both pay buttons disabled; per-state timer count in the state table [Requirement 1, Requirement 2, Requirement 3, Requirement 6]
- [ ] 5. Run the gate check and the manual check at 390 and 1440, ID and EN, with `?mock=ok` and `?mock=short_payment` [ALL]

## Task Dependency Graph

```json
{ "waves": [[1, 2, 3], [4], [5]] }
```

## Notes

- Gate: `npx tsc --noEmit && npx vitest --run && npm run build`; `npm run lint` in lint-staged; `out/payment.html` keeps
  scoped class names.
- Lifts spec 78's "no `timer`" (Requirement 2) and its two `queryByRole('timer')` null assertions.
- No `Timer` / `FlowHeader` change: `warnAt` and `compact` already exist (spec 60). Order and Queue pages untouched.
- jsdom applies no CSS: page tests see two timers (flow bar and app bar); in the browser one is `display: none`.
- The shell does not read `timeUp`; at zero the page stays as it is apart from "0:00" and the disabled buttons until the
  server's answer (inactive / paid) arrives through the controller.
- Mock: set `short_payment` before the hold (`/order?event=evt_samudra&mock=short_payment`); `expireIfDue` makes the
  next page read answer 409, which the use case settles into inactive.
- Out of scope: the "Waktu habis" screen and "Antre lagi" (FR-23-W1), the expiry e-mail (backend), persistence beyond the
  reload (NFR-02-W1), `Timer`'s shared `aria-live` / accessible-name follow-up.
- Commit: `feat(payment): [FR-21-W1] show the payment countdown in the flow header`.
