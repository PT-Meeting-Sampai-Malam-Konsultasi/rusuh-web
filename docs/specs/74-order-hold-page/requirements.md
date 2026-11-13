# Requirements Document

## Introduction

Screen for FR-16-W1 (rusuh-web#78, "Web: Order: hold tickets and continue to payment"; parent FR-16,
rusuh-documentation#16). Renders spec 73's `summary` and `checkout` on the Order page as in the HiFi
(`analysis/hifi/src/detail.html` lines 46–56, `assets/flow.css` `.sum*` / `.dock*`, screenshots
`analysis/hifi/shots/detail/default-1440x900.png` and `default-390x844.png`): the "Ringkasan" aside in the right column
from 720px, and a sticky bottom dock ("n tiket · Rp X · Lanjut bayar →") below 720px. Adds the ID / EN copy for every new
key. Sources: `customer-journey.md` F20 / F15, ADR-0010 + `hifi-api-review.md` H-1 (fee once per order), ADR-0005 (the
10-minute note), ADR-0014 (ID / EN), `.claude/rules/design-system.md` ("Trust zones (NIK, payment, summary) are quiet").

Until FR-20-W1 (rusuh-web#19) adds `/payment`, the button's success path lands on the not-found page; expected.

## Glossary

| Term  | Definition                                                                                                  |
| ----- | ----------------------------------------------------------------------------------------------------------- |
| Aside | `OrderSummary`: the "Ringkasan" card in the flow grid's right column (≥ 720px), sticky under the header     |
| Dock  | `OrderDock`: the fixed bottom bar on phones (< 720px) with the ticket count, the total and the short button |
| Hint  | The line under the button saying why it is disabled (neutral) or what the hold refused (error)              |

## Requirements

### Requirement 1: Summary aside

**User Story:**

AS a buyer on a laptop
I WANT the order summary next to my picks
SO THAT I see the total and continue from the same place (HiFi)

#### Acceptance Criteria

- SHALL render `OrderSummary` (`src/presentation/pages/Order/components/OrderSummary/`) as an `aside` labelled by its
  `h2` (`summary.heading`), with a `ul` of lines ("2 × Festival B" left, amount right), the fee row ("Biaya layanan"),
  the total row ("Total" + the amount in display type), the button, the hint and the note, in HiFi order
- SHALL show it from 720px only (`display: none` below), sticky at `top: 120px`, with the HiFi card (2.5px ink border,
  card fill, 6px ink offset, square corners)
- SHALL use the shared `Button` (`fullWidth`, `disabled={!checkout.enabled}`, `busy={checkout.busy}`) with the label and an
  `aria-hidden` arrow "→"; the button SHALL be `aria-describedby` the hint when there is one
- SHALL render the hint with `role="alert"` when `hint.error` is true and as plain text otherwise
- SHALL use tabular figures for every amount and no tilt, halftone or print effect (trust zone)

### Requirement 2: Phone dock

**User Story:**

AS a buyer on a phone
I WANT the total and the continue button always in reach
SO THAT I can continue without scrolling back up

#### Acceptance Criteria

- SHALL render `OrderDock` (`…/components/OrderDock/`) as a `section` with `aria-label={summary.dockLabel}`, fixed to the
  bottom below 720px (paper fill, 2.5px ink top border, padding `12px 16px calc(14px + env(safe-area-inset-bottom))`),
  hidden from 720px
- SHALL show the ticket count (small, ink-2) above the total (display 26px, stretch 75%) on the left, and the shared
  `Button` with `checkout.shortLabel` + "→" on the right (max width 210px)
- SHALL show the hint above the row when there is one (same `role` rule as the aside)
- SHALL reserve space so the dock never covers the last field: a phone-only spacer of the dock's height after the main
  content

### Requirement 3: Shell wiring

**User Story:**

AS a developer
I WANT the shell to place both sections from the controller's props
SO THAT the page stays props-in / JSX-out

#### Acceptance Criteria

- SHALL read `summary` and `checkout` from the controller in `src/presentation/pages/Order/index.tsx`
- WHEN both are non-null THEN SHALL render `OrderSummary` as the second child of `main` (the grid's right column,
  replacing the "Summary aside: deferred" comment) and `OrderDock` after `</main>`, before the time's-up sheet
- WHEN either is null THEN SHALL render neither
- SHALL NOT add hooks or conditions beyond `summary && checkout &&`

### Requirement 4: States

**User Story:**

AS a buyer
I WANT the button to show what is happening
SO THAT I know whether I can tap, have to wait, or have to fix something

#### Acceptance Criteria

- WHEN `checkout.enabled` is false and not busy THEN both buttons SHALL be disabled and the hint visible
- WHEN `checkout.busy` THEN both buttons SHALL be `aria-busy` and disabled (the global loading overlay covers the page)
- WHEN enabled THEN a click on either button SHALL call `checkout.onContinue` once
- SHALL cover: 0 tickets (no aside, no dock), holders incomplete (neutral hint), all verified (enabled, no hint), in
  flight (busy), hold refused (error hint), time's up (no aside, no dock; the sheet)

### Requirement 5: Copy in both languages

**User Story:**

AS a buyer reading English or Indonesian
I WANT every new text in my language
SO THAT the summary and the hold messages read naturally (ADR-0014)

#### Acceptance Criteria

- SHALL add every key of spec 73's Data Models table to `src/translation/locale/id.json` and `en.json` with the given
  copy (`order_summary_tickets` as `_one` / `_other`)
- SHALL assert the ID and EN values of the new keys in `src/infrastructure/i18n/__tests__/i18n.test.ts`
- SHALL NOT add a key the controller does not use

### Requirement 6: Tests and build

**User Story:**

AS a developer
I WANT the sections and the shell covered and the export building
SO THAT the page ships without regressions

#### Acceptance Criteria

- SHALL add `__tests__/index.test.tsx` for `OrderSummary` and `OrderDock`, querying by role and text, `userEvent` for
  clicks
- SHALL extend the shell test: both sections present only when `summary` and `checkout` are non-null
- SHALL pass `npm run build` with scoped class names in `out/order.html`, and the CSS budget (≤ 30 KB total)
- SHALL be checked by hand at 390 and 1440, ID and EN, against the HiFi screenshots
