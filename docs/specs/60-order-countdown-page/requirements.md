# Requirements Document

## Introduction

The Detail Ticket screen for FR-17-W1 (rusuh-web#16, "Web: Order: 5-minute countdown from server time"; parent FR-17,
rusuh-documentation#17). The Order page shows the order-window countdown that `orderController` now sends (spec 59) in
the `FlowHeader` `timer` slot, which was left empty for this ticket. It reuses the existing shared `Timer` component
(`src/presentation/components/Timer/`, already used by the queue turn screen and written for "60 on the order page, 120
on payment"), extended with one optional `compact` prop for the phone app bar, wired by the page shell, with the label in
Indonesian and English. Visual source: HiFi `analysis/hifi/detail.html` lines 13 (desktop bar) and 15 (phone app bar),
`analysis/hifi/assets/rusuh.css` lines 137–141 and 184–187 (`.timer`, `.timer .t`, `.timer .l`, `.timer.warn`,
`.appbar .timer`); behaviour: ADR-0005, `architecture/customer-journey.md` F2; ADR-0014 (ID/EN). A mock scenario with a
short window lets QA see the warning and zero states without waiting five minutes.

Out of scope: the time's-up sheet, "Antre lagi" and any redirect at zero (FR-18-W1, rusuh-web#17; `timeUp` is not
consumed yet); keeping the countdown across a refresh (FR-19-W1, rusuh-web#18); the payment countdown (FR-21-W1; it will
reuse `Timer` with `warnAt={120}`); the hold and "Lanjut ke Pembayaran"; disabling inputs at zero; the summary aside and
phone dock; the API contract drift in the updated `openapi.yaml` (`/core/…` prefixes, `reservedUnits` → `maxTickets`);
`Timer`'s existing `aria-live` behaviour and missing accessible name (shared with the queue page); any change to
`QueueTurn`.

## Glossary

| Term           | Definition                                                                                                                 |
| -------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Timer          | Shared component `src/presentation/components/Timer/`: props `seconds`, `label?`, `warnAt?` (60), new `compact?`           |
| Timer slot     | `FlowHeader`'s optional `timer?: ReactNode`, rendered in the flow bar (from 720px) and in the phone app bar (below)        |
| Flow bar       | `FlowHeader` `.bar`: `display: none` below 720px (`--breakpoint-md`), flex from 720px                                      |
| App bar        | `FlowHeader` `.appBar`: shown below 720px, `display: none` from 720px                                                      |
| Normal form    | 34px value + the label, 4px offset shadow (HiFi `.timer`): what `Timer` renders today                                      |
| Compact form   | Below 720px with `compact`: 22px value, 3px offset shadow, tighter padding, label visually removed (HiFi `.appbar .timer`) |
| Warning        | `seconds <= warnAt` (60 on the order page), decided by `Timer`: pink offset shadow and pink-ink value (HiFi `.timer.warn`) |
| `short_window` | New mock scenario: `getCategories` answers with a 75-second order window                                                   |

## Requirements

### Requirement 1: The countdown in the flow header

**User Story:**

AS a buyer choosing tickets
I WANT to see how long I have left, in the header
SO THAT I finish before my turn ends (customer journey F2)

#### Acceptance Criteria

- SHALL render the countdown with the existing `Timer` component: `role="timer"`, the value as `m:ss` from
  `timer.seconds` (`formatSeconds`), the label next to it, display font with tabular numerals on the card-coloured ink
  stamp (HiFi `.timer`)
- SHALL NOT add a second timer component, and SHALL NOT format the value or the label anywhere else
- SHALL NOT hard-code any text: the seconds and the label come from the controller

### Requirement 2: Warning state in the last minute

**User Story:**

AS a buyer in the last minute
I WANT the timer to turn pink
SO THAT I notice the time is nearly gone (HiFi `.timer.warn`, `left <= 60`; design system "Timer: ink stamp; pink at
60 s (Detail)")

#### Acceptance Criteria

- SHALL use `Timer`'s default `warnAt` of 60: WHEN `timer.seconds` is 60 or less THEN the stamp SHALL have the pink
  offset shadow and the pink-ink value (first pink value "1:00"); at 61 or more it SHALL be ink
- WHEN `timer.seconds` is 0 THEN the timer SHALL read "0:00" and stay in the warning style
- SHALL keep the warning style in the compact form (3px pink offset below 720px)
- SHALL keep the remaining time readable as text in both states: the digits are the status, the pink is emphasis
  (status never by colour alone)

### Requirement 3: Compact form in the phone app bar

**User Story:**

AS a buyer on a phone
I WANT a small timer in the app bar
SO THAT it fits next to the back arrow and the title (HiFi `.appbar .timer`)

#### Acceptance Criteria

- SHALL add one optional prop `compact?: boolean` to `Timer`; WHEN it is set THEN the root SHALL carry `data-compact`
- WHEN `compact` is set and the viewport is below 720px THEN the timer SHALL use the compact form: 22px value, padding
  5px 9px 4px, 3px offset shadow (ink, pink when warning), the label visually removed but still in the DOM
- WHEN `compact` is set and the viewport is 720px or wider THEN the timer SHALL look exactly like the normal form (34px
  value, padding 8px 14px 7px, 4px offset shadow, label shown)
- WHEN `compact` is not set THEN `Timer` SHALL render the same markup and styles as today at every width (`QueueTurn`
  unchanged in markup and appearance)
- SHALL rely on `FlowHeader`'s existing bars for exposure: the slot renders the timer twice, and the hidden bar is
  `display: none`, so exactly one timer is visible and in the accessibility tree at any width
- SHALL NOT change `FlowHeader`, its CSS, `QueueTurn`, or `Timer`'s `aria-live` / naming behaviour

### Requirement 4: Page shell wiring

**User Story:**

AS a buyer
I WANT the countdown on the Order page whenever my order window is known
SO THAT I see it from the first moment the categories show

#### Acceptance Criteria

- SHALL read `timer` from `orderController` in `src/presentation/pages/Order/index.tsx` and pass
  `timer={timer && <Timer seconds={timer.seconds} label={timer.label} compact />}` to `FlowHeader` (no `warnAt`: the
  default 60 applies)
- WHEN `timer` is null (loading, error, not-found, redirect, invalid dates) THEN no timer SHALL be rendered
- SHALL NOT read `timeUp` in the shell yet (FR-18-W1), and SHALL NOT add hooks, state or conditions beyond the prop above
- SHALL keep every other part of the page unchanged

### Requirement 5: Copy in Indonesian and English

**User Story:**

AS a buyer reading Indonesian or English
I WANT the timer label in my language
SO THAT I know what the number counts (ADR-0014)

#### Acceptance Criteria

- SHALL add `order_timer_label` to `src/translation/locale/id.json` ("sisa waktu memilih") and `en.json`
  ("left to choose"), the HiFi copy
- SHALL keep the same key set in both files (the i18n parity test)

### Requirement 6: A mock scenario for the last minute

**User Story:**

AS a tester without a backend
I WANT an order window that ends in about a minute
SO THAT I can see the warning and zero states without waiting five minutes

#### Acceptance Criteria

- SHALL add `'short_window'` to `MOCK_SCENARIOS` in `src/infrastructure/mocks/scenario.ts`, with a comment like its
  neighbours ("FR-17: the order window is 75 seconds…")
- WHEN the scenario is `short_window` THEN the `getCategories` mock SHALL answer with `expiresAt = serverNow + 75 s`
  ("1:15", pink from "1:00", then "0:00"); every other field and every other scenario SHALL stay as today (300 s)
- SHALL NOT change production code paths: the scenario exists only in the mock handlers

### Requirement 7: Tests and gate

**User Story:**

AS a developer
I WANT the timer pinned by tests in both forms and both languages
SO THAT FR-18-W1 and the payment countdown can build on it

#### Acceptance Criteria

- SHALL extend `src/presentation/components/Timer/__tests__/index.test.tsx`: `data-compact` present with `compact` and
  absent without it, the label still in the DOM in the compact form, the warning unchanged at 60 / 61 seconds, and the
  CSS module (compact rules scoped to `[data-compact]`, 22px / 3px below the md variant, normal values inside it, tokens
  only, no hex)
- SHALL keep every existing `Timer` test passing unchanged
- SHALL update the Order page test: two `role="timer"` nodes (flow bar and app bar; jsdom applies no CSS) with the
  formatted value and the label when the controller gives a timer, both marked compact, the warning at 60 seconds, and no
  timer when it is null (ready, loading, error, not-found)
- SHALL assert the ID and EN values of `order_timer_label` in the i18n test
- SHALL test the `short_window` scenario in `scenario.test.ts` and `booking.handlers.test.ts`
- SHALL pass `npx tsc --noEmit && npx vitest --run && npm run build`
