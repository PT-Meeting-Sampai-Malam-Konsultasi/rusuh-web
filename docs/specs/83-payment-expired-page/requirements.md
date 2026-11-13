# Requirements Document

## Introduction

Presentation for FR-23-W1 ("Web: Payment expired state and queue again", rusuh-web#22; parent FR-23, MUST). A new
`PaymentExpired` section renders spec 82's `PaymentExpiredView` in the Payment page's main column, as the HiFi
`analysis/hifi/src/payment.html` 83–90 (`section[data-state="expired"].mid.left`): stamp "Waktu habis", display title
"Pesanan dibatalkan.", body with the released-ticket count, the quiet "Saldo terpotong?" note, "Antre lagi →" primary and
"Ke beranda" link. The page shell renders it when `expired` is non-null; the timer, intro, pay dock and progress are
already absent in that state (spec 82). The copy is written here in ID and EN (ADR-0014), with the refund promise of H-4
(`analysis/hifi-api-review.md`) instead of the HiFi's "otomatis".

Out of scope: the controller logic (spec 82), the e-mail itself, the `inactive` / `not-found` / `error` messages
(unchanged `PaymentMessage`), `src/app/payment/page.tsx` and `error.tsx` (unchanged).

## Glossary

| Term         | Definition                                                                                         |
| ------------ | -------------------------------------------------------------------------------------------------- |
| Expired view | `PaymentExpiredView` from `paymentController.expired` (spec 82), all strings translated            |
| Seen aside   | The `PaymentSummary` aside, present in `expired` only when the order was loaded earlier this visit |

## Requirements

### Requirement 1: The expired section

**User Story:**

AS a buyer whose payment time ran out
I WANT a calm, clear screen saying the order was cancelled
SO THAT I understand what happened to my tickets

#### Acceptance Criteria

- SHALL render a `section` labelled by its `h1` (the title) containing, in order: the `Stamp` (`tone="sold"`) with
  `stamp`, the `h1`, the body paragraph, the note box, the actions
- SHALL render the note as `<b>{noteLead}</b> {note}` WHEN `noteLead` is non-null, else `note` alone
- WHEN the section mounts THEN focus SHALL move to the `h1` (`tabIndex={-1}`), so a screen reader announces the change
  when the page turns expired mid-visit
- SHALL NOT render a timer, a pay button or a dock

### Requirement 2: Actions

**User Story:**

AS a buyer
I WANT to queue again or go home
SO THAT I can still try for a ticket or leave

#### Acceptance Criteria

- WHEN `onQueueAgain` is non-null THEN SHALL render a `Button` "`queueAgainLabel` →" (arrow `aria-hidden`) calling it
- WHEN `onQueueAgain` is null THEN SHALL NOT render the button; the home link stays
- SHALL render a `next/link` to `homeHref` with `homeLabel`

### Requirement 3: Page shell

**User Story:**

AS the Payment page
I WANT to show the expired section only in the expired state
SO THAT other states are unchanged

#### Acceptance Criteria

- SHALL read `expired` from the controller and render `{expired && <PaymentExpired expired={expired} />}` in the main
  column; nothing else in the shell changes
- WHEN `summary` is non-null in that state THEN the aside SHALL render as today (with `pay: null`, no pay button); the
  dock SHALL NOT render (`summary && pay` is false)
- SHALL keep `PaymentMessage` for `inactive`, `not-found` and `error`, and drop its "FR-23-W1 builds the full expired
  screen" doc remark

### Requirement 4: Style (Poster Sablon)

**User Story:**

AS a buyer on a phone or a laptop
I WANT the screen to read well at 390 and 1440 px
SO THAT the message is clear on any device

#### Acceptance Criteria

- SHALL port the HiFi values: `.mid.left` (left-aligned column, gap 18px, max 640px), `.d-xl` + `.exp-h` (58px on
  phones, `clamp(64px, 9vw, 128px)` from 720px, line height .84, stretch 75%, `-.02em`, 6px top margin), `.mid-p`
  (16 / 18px, 1.55), `.note` (2.5px ink border, card fill, 16px 18px, 15px, max 600px), `.turn-act` (gap 24px, 10px
  top, wraps)
- SHALL use a co-located `payment-expired.module.css` starting with `@reference`; no Tailwind classes in JSX; no hex
- The link SHALL have hover, `:focus-visible`, pressed states and a ≥ 44px target

### Requirement 5: Copy in both languages

**User Story:**

AS an Indonesian or English reader
I WANT the whole screen in my language
SO THAT nothing is half translated (ADR-0014)

#### Acceptance Criteria

- SHALL add the nine `payment_expired_*` keys of spec 82's Data Models table to `src/translation/locale/id.json` and
  `en.json`, after `payment_inactive_refund`, in the same order in both files
- WHEN `count` is 1 THEN EN SHALL read "…released the held ticket…"; otherwise "…the {{count}} held tickets…"; ID uses
  the same sentence for both forms
- SHALL NOT contain "otomatis" / "automatically" in any refund text (H-4); SHALL NOT contain an e-mail literal
- SHALL reuse `action_back_home` and `payment_inactive_refund` unchanged

### Requirement 6: Tests

**User Story:**

AS a developer
I WANT the section and the shell covered
SO THAT regressions show up in CI

#### Acceptance Criteria

- SHALL add `components/PaymentExpired/__tests__/index.test.tsx` and extend the shell and i18n tests per the Testing
  Strategy; both languages rendered with the real locale strings
