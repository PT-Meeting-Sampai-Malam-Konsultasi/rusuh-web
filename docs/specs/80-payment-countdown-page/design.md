# Design Document

## Overview

Presentation changes on `/payment`, props-in / JSX-out, the same wiring as the Order page (spec 60):

1. **Page shell**: one new prop on `FlowHeader` (`timer`), fed from `paymentController.timer` through the shared
   `Timer` with `warnAt={120}` and `compact`.
2. **Copy**: `payment_timer_label` in ID and EN.
3. **Mock**: a `short_payment` scenario (150-second payment window) for the manual check.

No new component, no CSS change, no route change (`src/app/payment/page.tsx` already wraps the screen in `<Suspense>`),
no DI change, no `Timer` / `FlowHeader` change: `Timer` already has `warnAt` (its prop doc names "120 on payment") and
`compact` (spec 60), and `FlowHeader`'s slot renders the node in both bars. "Bayar" disabled at zero is already drawn
from `pay.enabled` (spec 78 `PaymentSummary` / `PaymentDock`). `timeUp` is not read by the shell.

**One loud thing.** Spec 78 recorded "no timer (FR-21-W1 deferred), so pay is the page's one loud thing". The design
system's rule is "Payment: timer + pay"; with the timer in the header the page now matches it. Nothing else changes in
weight: the summary stays a quiet trust zone.

**Warning.** `warnAt={120}`: the first pink value is "2:00" (HiFi `data-warn="120"`, design system "120 s (Payment)").
The digits stay the status; pink is emphasis. At "0:00" the disabled "Bayar" is the visible consequence; the words for
time running out come with the expired screen (FR-23-W1) once the server's answer arrives as the inactive message.

**HiFi differences recorded here:**

| Topic          | HiFi (`payment.html`)                                   | This spec                                                                                         |
| -------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Source of time | `data-countdown="552"` counted with the device clock    | controller seconds from `expiresAt − serverNow` + elapsed (ADR-0005)                              |
| `role="timer"` | desktop timer only; the app-bar timer has no role/label | both are `Timer` (role on both, label `sr-only` when compact); one visible                        |
| States         | select, va, qris, verifying                             | the controller's timer states (no method screens, H-3)                                            |
| At zero        | `data-onzero="expired"` opens the "Waktu habis" section | "0:00" pink, "Bayar" off; the server moves the page to inactive (FR-23-W1 builds the full screen) |

## Architecture

```
src/app/payment/page.tsx                                   unchanged
src/presentation/pages/Payment/index.tsx                   + timer from the controller → <Timer … warnAt={120} compact /> → FlowHeader
src/presentation/pages/Payment/__tests__/index.test.tsx    + timer in both bars / warning at 120 / pay off at 0 / per-state count
src/presentation/pages/Payment/__tests__/fixtures.ts       + timerView()
src/presentation/components/Timer/, FlowHeader/            unchanged
src/translation/locale/id.json, en.json                    + payment_timer_label
src/infrastructure/i18n/__tests__/i18n.test.ts             + payment_timer_label in both locales
src/infrastructure/mocks/scenario.ts                       + 'short_payment'
src/infrastructure/mocks/handlers/booking.handlers.ts      + 150 s payment window under short_payment
src/infrastructure/mocks/__tests__/scenario.test.ts, booking.handlers.test.ts   + short_payment
```

Route: `/payment?booking=<id>`. Data flow: `getPaymentPage` → `payBookingUseCase.load` (spec 76) →
`paymentController.timer` (`{ seconds, label }`, spec 79) → shell → `FlowHeader` `timer` slot → `Timer` (twice: flow bar
and app bar). No API call in this layer.

## Components and Interfaces

```tsx
// src/presentation/pages/Payment/index.tsx (changes only)
import Timer from '@presentation/components/Timer';

const { /* …existing fields… */ timer } = container.resolve<PaymentControllerInterface>('paymentController');

<FlowHeader
  /* …existing props unchanged… */
  timer={timer && <Timer seconds={timer.seconds} label={timer.label} warnAt={120} compact />}
/>;
```

- `timer && …` yields `null` when there is no timer; `FlowHeader` renders its wrapper only for a truthy node. Prop
  passing like the shell's existing `x && <X />` guards; no hook, no logic.
- `PaymentTimerView` (`{ seconds: number; label: string }`, spec 79) matches `Timer`'s `seconds: number`,
  `label?: string`. `warnAt={120}` is a literal of the page's design, as the Order page relies on the default 60.

Existing `Timer` (unchanged, for reference): `warn = seconds <= warnAt`; `role="timer"`;
`aria-live={warn ? 'polite' : 'off'}`; `data-compact={compact || undefined}`; value `formatSeconds(seconds)` → "9:12".

Test fixture:

```ts
// src/presentation/pages/Payment/__tests__/fixtures.ts (addition)
export const timerView = (overrides: Partial<PaymentTimerView> = {}): PaymentTimerView => ({
  seconds: 552,
  label: 'payment_timer_label',
  ...overrides,
});
```

Mock (dev only):

```ts
// src/infrastructure/mocks/scenario.ts — new entry in MOCK_SCENARIOS, after 'payment_late'
/** FR-21: the payment window is 150 seconds, so the pink last two minutes, 0:00 and the inactive answer show quickly. */
'short_payment',

// src/infrastructure/mocks/handlers/booking.handlers.ts
/** `?mock=short_payment`: 30 s of the ink timer, pink from 2:00, then 0:00 and EXPIRED on the next read. */
export const MOCK_SHORT_PAYMENT_WINDOW_MS = 150_000;
// in the payment-entry handler, where PAYMENT_PENDING is set:
expiresAt: new Date(today.getTime() + (scenario === 'short_payment' ? MOCK_SHORT_PAYMENT_WINDOW_MS : PAYMENT_MS)).toISOString(),
```

The scenario must be active when the hold enters payment (`/order?event=evt_samudra&mock=short_payment`, then
"Lanjut ke pembayaran"); it persists in `sessionStorage`. `expireIfDue` already marks the booking EXPIRED on the next
read after the deadline, so the controller's refetch at zero meets 409 `BOOKING_NOT_HELD` and the use case settles it
into `inactive`. The queue mock's placement and the order window ignore the new name.

## Data Models

Props come from `PaymentTimerView` (spec 79): `{ seconds: number; label: string } | null`.

Translation key (written here):

| Key                   | ID             | EN          | Source                |
| --------------------- | -------------- | ----------- | --------------------- |
| `payment_timer_label` | untuk membayar | left to pay | HiFi `payment.html:7` |

Lower case in both languages, as in the HiFi (it follows the number: "9:12 untuk membayar"). Placed after
`payment_step_done` in both files.

Timer per page state (the shell renders what the controller gives):

| State                                  | `timer`    | Header shows          | "Bayar"                       |
| -------------------------------------- | ---------- | --------------------- | ----------------------------- |
| loading                                | null       | —                     | — (skeleton)                  |
| ready / opening / failed / busy        | `{ s, l }` | "9:12 untuk membayar" | per `pay` (opening busy)      |
| verifying confirming / waiting         | `{ s, l }` | same                  | null / "Buka lagi pembayaran" |
| any timer state, 120 s or less         | `{ ≤120 }` | pink from "2:00"      | unchanged                     |
| any timer state at zero                | `{ 0 }`    | "0:00" pink           | disabled (aside and dock)     |
| leaving / inactive / not-found / error | null       | —                     | —                             |

## Layer Constraints

From `.claude/rules/presentation.md`:

- `'use client'` at the top.
- Zero hooks and zero logic of their own: `container.resolve<Interface>('xController')` at the top of render, then pass
  props to sections.
- One shell per page, co-located `{page-name}.module.css`.
- Receive all data and callbacks as props, including `t`. Never call `useTranslation()` or `container.resolve()`.
- Plain function declarations with a typed props interface; no `React.FC`, no `forwardRef` (React 19: `ref` is a prop).
- `export default` for every component.
- **No Tailwind class strings in JSX**, no inline `style` except CSS variables for dynamic values
  (`style={{ '--progress': `${p}%` }}`), no Sass, no CSS-in-JS.
- Mobile first: base styles target the phone (390), then `@variant md` / `lg` (or `@media (width >= …)`) for wider.
- Live regions: the queue number and ETA (`aria-live="polite"`), field errors (`role="alert"`), timers (`role="timer"`).
- Status never by colour alone: word + style.
- `__tests__/index.test.tsx` for every page shell and section.
- React Testing Library; query by role and text, not test id; `userEvent` for interaction; mock `t` as `(k) => k`.
- Shells: mock `container.resolve` and assert props reach the sections.
- ❌ Hooks or conditions in a page shell
- ❌ `useTranslation()` or `container.resolve()` in a section
- ❌ Tailwind classes in JSX, missing `.module.css`, missing `@reference`
- ❌ Direct imports from `@core/` or `@infrastructure/`
- ❌ `React.FC`, `forwardRef`, named component exports

Notes: `timer && <Timer … />` is prop passing (the add-page reference: "Showing one section per state … is prop passing,
not logic"). The shell's existing imports of `@infrastructure/di/container` and `@infrastructure/di/controllers/payment`
are the sanctioned ones (scaffold rule) and do not change. No CSS is added, so `payment.module.css` is untouched.

From `.claude/rules/design-system.md`:

- One loud thing per screen (Home: poster · Waiting room: your number · Detail: picks + timer · Payment: timer + pay ·
  E-ticket: "Sampai jumpa").
- Colour has a job: **pink = you**, **blue = the event**, **ink = actions**. Never swap.
- Trust zones (NIK, payment, summary) are quiet: no tilt, no halftone behind text.
- Tabular figures for anything that changes (numbers, timers, money). Smallest text 12.5px.
- **Timer:** ink stamp; pink at 60 s (Detail) / 120 s (Payment).
- Short, warm, "Anda". ID first, full EN translation.

From `.claude/rules/scaffold.md`:

- Resources: `src/translation/locale/id.json` and `en.json`, same keys in both, flat `snake_case`, single namespace.
- Copy comes from the HiFi / Design Brief voice rules; write ID first, then a full EN translation.

From `.claude/rules/performance.md`:

- Don't let first-load JS grow by more than 5 KB per PR without a reason in the PR.

(`Timer` is already in the shared bundle through the Order and Queue pages; the payment route adds only the import.)

From `CLAUDE.md`:

- Countdowns use server time: `expiresAt − serverNow` from the API, never the device clock.

## Correctness Properties

- Property 1: with `timer = { seconds: 552, label: 'payment_timer_label' }` the Payment screen renders two
  `role="timer"` nodes, both within `getByRole('banner')`, both with `data-compact`, "9:12" and `payment_timer_label`.
  **Validates: Requirements 1, 3**
- Property 2: with `seconds: 120` both timers have `aria-live="polite"` (warning); with `121` both `"off"`.
  **Validates: Requirements 2**
- Property 3: with `timer = { seconds: 0, … }`, `timeUp: true` and `pay = payView({ enabled: false })` both timers read
  "0:00" with `aria-live="polite"`, and the aside and dock "Bayar" buttons are disabled; the rest of the page is the
  ready layout. **Validates: Requirements 2**
- Property 4: in the state table, rows `ready`, `opening`, `verifying` (both), `failed`, `busy` carry `timerView()` and
  render 2 timers; `loading`, `leaving`, `inactive` (both), `not-found`, `error` carry `timer: null` and render none.
  **Validates: Requirements 1**
- Property 5: `id.json` has `payment_timer_label` = "untuk membayar", `en.json` = "left to pay"; same key sets.
  **Validates: Requirements 4**
- Property 6: `resolveScenario('?mock=short_payment', null)` is `'short_payment'`; under it the payment entry answers
  with `Date.parse(paymentExpiresAt) − Date.parse(serverNow) === 150_000`; under `ok` it is still `600_000`.
  **Validates: Requirements 5**
- Property 7: `Timer`, `FlowHeader`, `QueueTurn`, the Order page and `payment.module.css` have no diff; the shell has
  no new hook; `out/payment.html` keeps scoped class names. **Validates: Requirements 1, 3, 6**

## Error Handling

No API call in this layer. Every `getPaymentPage` / `getPaymentStatus` / `startSnapPayment` outcome reaches the page
through the controller (spec 79 Error Handling); the header follows `timer`:

| Outcome (spec 79)                                                                                                        | Page (unchanged)                         | Timer                 |
| ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------- | --------------------- |
| `ready` with valid dates; `opening`; `failed`; `busy` (503 `PAYMENT_PROVIDER_BUSY`, `SNAP_UNAVAILABLE`, `NETWORK_ERROR`) | intro / summary / pay / notice           | shown, counting       |
| `verifying` (confirming / waiting)                                                                                       | progress panel                           | shown, counting       |
| `ready` with unparseable dates                                                                                           | intro / summary / pay                    | not rendered          |
| time runs out (not an API error)                                                                                         | "Bayar" disabled                         | "0:00", warning style |
| refetch 409 `BOOKING_NOT_HELD` → inactive (± refund note)                                                                | "Pesanan ini sudah tidak aktif." + home  | not rendered          |
| 409 → paid / poll `PAID`                                                                                                 | "Pembayaran diterima…" → e-ticket        | not rendered          |
| 404 / no booking param                                                                                                   | not-found                                | not rendered          |
| 401                                                                                                                      | redirect to sign-in (skeleton meanwhile) | not rendered          |
| load or refetch 5xx / `NETWORK_ERROR` / `TIMEOUT`                                                                        | error view + "Coba lagi"                 | not rendered          |

States covered: loading, ready, opening, verifying confirming, verifying waiting, failed, busy, last two minutes (pink),
zero ("0:00", pay off), leaving, inactive (with / without refund), not-found, error, offline banner (unchanged; the
countdown keeps running from its anchor). Both languages: the label switches; the seconds do not reset. The segment
fallback `src/app/payment/error.tsx` is unchanged and shows no timer.

## Testing Strategy

- `src/presentation/pages/Payment/__tests__/index.test.tsx`:
  - `base()` has `timer: null`, `timeUp: false` (spec 79 task 3); the header test drops "and no timer" from its name and
    keeps `queryByRole('timer')` null for `timer: null`;
  - new: Property 1 (two timers in the banner, compact, value, label), Property 2 (120 / 121), Property 3 (zero, both
    pay buttons disabled);
  - state table: add `timer: timerView()` to the timer-state rows; the line-209 assertion becomes
    `expect(screen.queryAllByRole('timer')).toHaveLength(c.timer ? 2 : 0)` (Property 4).
- `src/infrastructure/i18n/__tests__/i18n.test.ts`: `payment_timer_label` in both locales (Property 5).
- `src/infrastructure/mocks/__tests__/scenario.test.ts` and `booking.handlers.test.ts`: Property 6.
- `Timer`, `FlowHeader`, Order tests: unchanged.
- Gate: `npx tsc --noEmit && npx vitest --run && npm run build`; then the manual check with the mock API:
  - `/payment?booking=<id>` reached from `/order?event=evt_samudra&mock=ok` at 390 and 1440, ID and EN: "10:00" counting
    down; label only at 1440; compact stamp in the app bar at 390; one timer visible at each width; the timer stays
    through Snap closed / pending (verifying) and failed;
  - with `mock=short_payment` set before the hold: "2:30" → pink from "2:00" → "0:00", both "Bayar" off → within a
    moment the inactive message without a timer;
  - with the device clock set a day wrong: still "10:00" at load; a reload re-anchors to the server's remaining time;
  - `?mock=slow`: no timer under the skeleton; `?mock=error`: no timer on the error view.
