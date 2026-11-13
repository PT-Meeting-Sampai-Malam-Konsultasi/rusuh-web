# Requirements Document

## Introduction

The Payment screen for FR-21-W1 ("Web: Payment: 10-minute countdown"; parent FR-21, rusuh-documentation, MUST; BR-05).
The Payment page shows the payment-window countdown that `paymentController` now sends (spec 79) in the `FlowHeader`
`timer` slot, exactly as the Order page does (spec 60): the shared `Timer` component with `compact` (phone app-bar form)
and `warnAt={120}` (pink in the last two minutes), the label in Indonesian and English. Visual source: HiFi
`analysis/hifi/src/payment.html` lines 7 (desktop bar: `role="timer"`, `data-warn="120"`, "untuk membayar" / "left to
pay") and 9 (phone app bar); `.claude/rules/design-system.md` ("Timer: ink stamp; pink at 60 s (Detail) / 120 s
(Payment)"; "Payment: timer + pay"); behaviour: ADR-0005, ADR-0026, `architecture/customer-journey.md` §8 H10; ADR-0014
(ID/EN). A mock scenario with a short payment window lets QA see the warning, zero and server-driven inactive states
without waiting ten minutes.

This spec lifts spec 78's Requirement 2 "… and no `timer`" and its "no timer" test assertions. "Bayar" disabled at zero
needs no page change: the aside and dock buttons already render `disabled={!pay.enabled}` (spec 78), and spec 79 sets
`pay.enabled` false when `timeUp`.

Out of scope: the "Waktu habis / Pesanan dibatalkan" expired screen and "Antre lagi" (FR-23-W1; at zero the page keeps
showing "0:00" until the server's answer moves it to the existing inactive message); the expiry e-mail (backend); any
change to `Timer`, `FlowHeader`, `QueueTurn` or the Order page; `Timer`'s shared `aria-live` / accessible-name
follow-up (spec 60); persistence beyond reloading `/payment?booking=` (NFR-02-W1).

## Glossary

| Term            | Definition                                                                                              |
| --------------- | ------------------------------------------------------------------------------------------------------- |
| Timer           | Shared `src/presentation/components/Timer/`: `seconds`, `label?`, `warnAt?` (default 60), `compact?`    |
| Timer slot      | `FlowHeader`'s `timer?: ReactNode`, rendered in the flow bar (from 720px) and the phone app bar (below) |
| Compact form    | `Timer` with `compact` below 720px: 22px value, 3px offset, label visually removed (spec 60)            |
| Warning         | `seconds <= warnAt`; 120 on this page: pink offset and pink-ink value from "2:00"                       |
| Timer states    | Controller states with a non-null `timer`: `ready`, `opening`, `verifying`, `failed`, `busy` (spec 79)  |
| `short_payment` | New mock scenario: payment entry sets a 150-second payment window                                       |

## Requirements

### Requirement 1: The countdown in the flow header

**User Story:**

AS a buyer paying for held tickets
I WANT to see how long I have left to pay, in the header
SO THAT I finish before my tickets are released (customer journey H10)

#### Acceptance Criteria

- SHALL read `timer` from `paymentController` in `src/presentation/pages/Payment/index.tsx` and pass
  `timer={timer && <Timer seconds={timer.seconds} label={timer.label} warnAt={120} compact />}` to `FlowHeader`
- WHEN `timer` is null (loading, inactive, not-found, error, leaving, invalid dates) THEN no timer SHALL be rendered
- SHALL render the timer in every timer state, including `verifying` (HiFi shows it while verifying)
- SHALL NOT add a timer component, format the value, or hard-code any text; SHALL NOT read `timeUp` in the shell
- SHALL NOT add hooks, state or conditions beyond the prop above; every other part of the page stays unchanged

### Requirement 2: Warning in the last two minutes

**User Story:**

AS a buyer in the last two minutes
I WANT the timer to turn pink
SO THAT I notice the time is nearly gone (HiFi `data-warn="120"`, design system "120 s (Payment)")

#### Acceptance Criteria

- WHEN `timer.seconds` is 120 or less THEN the stamp SHALL be in `Timer`'s warning style (first pink value "2:00"); at
  121 or more it SHALL be ink
- WHEN `timer.seconds` is 0 THEN the timer SHALL read "0:00" in the warning style, and both "Bayar" buttons SHALL be
  disabled (from `pay.enabled`)
- SHALL keep the remaining time as text in both states (status never by colour alone: the digits are the status)

### Requirement 3: Phone and desktop forms

**User Story:**

AS a buyer on a phone or a laptop
I WANT the timer to fit the bar I see
SO THAT it sits next to the title on a phone and with its label on a laptop (HiFi lines 7 and 9)

#### Acceptance Criteria

- SHALL pass `compact`, so below 720px the app-bar timer is the compact form and from 720px the flow-bar timer is the
  normal form with its label (spec 60's `Timer` rules, unchanged)
- SHALL rely on `FlowHeader`'s bars: exactly one timer visible and in the accessibility tree at any width

### Requirement 4: Copy in Indonesian and English

**User Story:**

AS a buyer reading Indonesian or English
I WANT the timer label in my language
SO THAT I know what the number counts (ADR-0014)

#### Acceptance Criteria

- SHALL add `payment_timer_label` to `src/translation/locale/id.json` ("untuk membayar") and `en.json` ("left to pay"),
  the HiFi copy, after `payment_step_done` in both files
- SHALL keep the same key set in both files (the i18n parity test)

### Requirement 5: A mock scenario for the last minutes

**User Story:**

AS a tester without a backend
I WANT a payment window that ends in a couple of minutes
SO THAT I can see the warning, "0:00", "Bayar" turning off and the server-driven inactive message quickly

#### Acceptance Criteria

- SHALL add `'short_payment'` to `MOCK_SCENARIOS` in `src/infrastructure/mocks/scenario.ts` with a comment like its
  neighbours ("FR-21: the payment window is 150 seconds…")
- WHEN the scenario is `short_payment` at payment entry THEN the mock SHALL set `expiresAt = now + 150 s` ("2:30", pink
  from "2:00", "0:00"); the existing `expireIfDue` then makes the page refetch answer 409 → inactive; every other
  scenario SHALL keep 10 minutes
- SHALL NOT change production code paths

### Requirement 6: Tests and gate

**User Story:**

AS a developer
I WANT the payment timer pinned by tests
SO THAT FR-23-W1 can build on it

#### Acceptance Criteria

- SHALL replace the "no timer" assertions in `src/presentation/pages/Payment/__tests__/index.test.tsx`: two
  `role="timer"` nodes in the `banner` (flow bar and app bar; jsdom applies no CSS) with the value and the label, both
  `data-compact`, when the controller gives a timer; none when it is null; `aria-live` polite at 120 and off at 121;
  at 0 "0:00" with both pay buttons disabled
- SHALL give the state table's timer states a timer and the others none, and assert the count per state
- SHALL assert the ID and EN values of `payment_timer_label` in the i18n test
- SHALL test `short_payment` in `scenario.test.ts` and `booking.handlers.test.ts`
- SHALL pass `npx tsc --noEmit && npx vitest --run && npm run build`
