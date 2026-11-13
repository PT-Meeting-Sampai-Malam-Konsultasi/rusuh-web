# Requirements Document

## Introduction

The Detail Ticket screen for FR-18-W1 (rusuh-web#17, "Web: Order: time's-up sheet and queue again"; parent FR-18,
rusuh-documentation#18). When the order window has run out, `orderController.timeUpSheet` (spec 62) is non-null and the
Order page shows the time's-up sheet over the page: a "Waktu habis" stamp, "5 menit sudah lewat.", why ("Pilihan Anda
belum disimpan dan tempat Anda kami berikan ke nomor berikutnya. Antre lagi untuk mencoba lagi."), "Antre lagi →" and
"Ke beranda", in Indonesian and English. This is how SRS FR-18 (`requirements/srs-v1.0-rusuh-booking-tiket.html` line 248) "notifies the customer and directs them out of the booking page" (no email: `architecture/lld-02-core-module.md`
line 77), with "queue again at the back" from A-10 / Q-26 (`analysis/requirements-review.md`). Visual source: HiFi
`analysis/hifi/detail.html` lines 63–70 and `analysis/hifi/assets/rusuh.css` lines 81–86 (`.stamp`, `.stamp.sold`),
153–154 (`.scrim`, `.sheet`) and 198–199 (phone bottom sheet); Figma Ticket Detail desktop node 60-2088 and mobile
60-2486 (reference only). Pattern: the queue page's `QueueLeaveSheet` (spec 57). ADR-0014 (ID/EN).

Out of scope: keeping the countdown across a refresh (FR-19-W1, rusuh-web#18); the payment countdown and expiry (FR-21 /
FR-23); the hold; any server release call; focus trapping, `inert` on the page behind and returning focus (the known
follow-up shared with `QueueLeaveSheet`); scroll locking; disabling inputs under the sheet; a shared dialog component.

## Glossary

| Term              | Definition                                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------------------------- |
| Time's-up sheet   | New section `src/presentation/pages/Order/components/OrderTimeUpSheet/`: scrim + sheet, `role="dialog"`       |
| Scrim             | The fixed full-screen layer behind the sheet: ink at 55% (HiFi `.scrim`)                                      |
| Sheet             | The panel: a centred dialog from 720px, a bottom sheet below (HiFi `.sheet` and its phone override)           |
| `OrderTimeUpView` | Spec 62: `{ stamp, title, body, queueAgainLabel, homeLabel, homeHref, queueAgain }`, texts already translated |
| Stamp             | Shared `src/presentation/components/Stamp/`, tone `sold`: ink fill, paper text, caps, rotated −2°             |
| Not dismissible   | No close button, Escape and a scrim click do nothing: the only ways out are the two actions                   |
| `short_window`    | Mock scenario from spec 60: a 75-second order window                                                          |

## Requirements

### Requirement 1: What the sheet says

**User Story:**

AS a buyer whose 5 minutes ran out
I WANT to read plainly that my time is up and what happened to my picks and my place
SO THAT I know why I am leaving the page and what to do next

#### Acceptance Criteria

- SHALL render, in order: `Stamp tone="sold"` with `sheet.stamp`; an `h2` with `sheet.title`; a paragraph with
  `sheet.body`; the actions row
- SHALL render the primary action as the shared `Button` with `sheet.queueAgainLabel` followed by an arrow `→` in a
  `span` with `aria-hidden="true"` (accessible name "Antre lagi" / "Queue again"), calling `sheet.queueAgain` on click
- SHALL render the secondary action as a text link (`next/link`, HiFi `.link`) with `sheet.homeLabel` to `sheet.homeHref`
- SHALL NOT hard-code any text: every string comes from the props
- SHALL NOT call `useTranslation()` or `container.resolve()` (props-in / JSX-out)

### Requirement 2: An accessible dialog

**User Story:**

AS a buyer using a screen reader or a keyboard
I WANT the message announced as a dialog and the main action focused
SO THAT I hear what happened and can queue again with one key

#### Acceptance Criteria

- SHALL put `role="dialog"`, `aria-modal="true"`, `aria-labelledby` (the title's id) and `aria-describedby` (the body's
  id) on the sheet element
- WHEN the sheet mounts THEN the primary button SHALL receive focus (the `QueueLeaveSheet` pattern: a `ref` and a mount
  effect)
- SHALL keep both actions at least 44px tall with a visible focus style (`Button` already; the link `min-h-11` and the
  blue `:focus-visible` outline of `OrderMessage`'s `.link`), and define `:hover`, `:focus-visible` and pressed states
  for the link
- SHALL carry the status in words ("Waktu habis", the title), not only in the ink stamp
- SHALL add no animation or transition (nothing to switch off under `prefers-reduced-motion`)

### Requirement 3: Not dismissible

**User Story:**

AS a buyer whose turn has ended
I WANT the message to stay until I choose where to go
SO THAT I cannot close it and keep editing an order that no longer exists

#### Acceptance Criteria

- SHALL have no close button and no other button than the primary action
- WHEN Escape is pressed THEN nothing SHALL happen (no key handler; the sheet stays, no callback is called)
- WHEN the scrim is clicked THEN nothing SHALL happen (no `onClick` on the scrim)

### Requirement 4: Layout per HiFi

**User Story:**

AS a buyer on a phone or a laptop
I WANT the sheet to fit my screen
SO THAT the message and both actions are visible without scrolling

#### Acceptance Criteria

- WHEN the viewport is 720px or wider THEN the sheet SHALL be a centred dialog: max width 520px, 2.5px ink border on all
  sides, padding 32px, a 6px pink offset shadow (no blur), over the scrim with 16px padding
- WHEN the viewport is below 720px THEN the sheet SHALL be a bottom sheet: full width, at the bottom, 2.5px ink border on
  top only, no shadow, padding 26px 20px 30px
- SHALL render the title in the display face (HiFi `.d-l`: Bricolage 800, stretch 75%, 40px, `clamp(40px, 5vw, 64px)`
  from 720px, line height 0.92), the title 16px below the stamp, the body 12px below the title, the actions 24px below
  with a 20px gap, wrapping
- SHALL use theme tokens only (no hex), a co-located `order-time-up-sheet.module.css` with `@reference` on the first line,
  mobile-first rules with `@variant md`, and the scrim's stacking order of `QueueLeaveSheet` (`z-[90]`, under the error
  popup and the offline banner)

### Requirement 5: Page shell wiring

**User Story:**

AS a buyer
I WANT the sheet over the page I was on
SO THAT I can still see what I had picked and the timer at "0:00"

#### Acceptance Criteria

- SHALL read `timeUpSheet` from `orderController` in `src/presentation/pages/Order/index.tsx` and render
  `{timeUpSheet && <OrderTimeUpSheet sheet={timeUpSheet} />}` after `</main>`, inside the page wrapper
- WHEN `timeUpSheet` is null THEN no dialog SHALL be rendered
- WHEN it is non-null THEN the header (timer at "0:00"), the event, the categories and the holders SHALL stay rendered
  underneath
- SHALL NOT read `timeUp` in the shell, and SHALL NOT add hooks, state or conditions beyond that line

### Requirement 6: Copy in Indonesian and English

**User Story:**

AS a buyer reading Indonesian or English
I WANT the message in my language
SO THAT I understand it at once (ADR-0014)

#### Acceptance Criteria

- SHALL add to `src/translation/locale/id.json` and `en.json` (HiFi copy): `order_time_up_stamp` ("Waktu habis" /
  "Time's up"), `order_time_up_title` ("5 menit sudah lewat." / "Your 5 minutes are up."), `order_time_up_body`
  ("Pilihan Anda belum disimpan dan tempat Anda kami berikan ke nomor berikutnya. Antre lagi untuk mencoba lagi." /
  "Your picks weren't saved and your place went to the next number. Queue again to try once more."),
  `order_time_up_queue_again` ("Antre lagi" / "Queue again")
- SHALL reuse the existing `action_back_home` ("Ke beranda" / "Go home") for the home link
- SHALL keep the same key set in both files (the i18n parity test)

### Requirement 7: Tests and gate

**User Story:**

AS a developer
I WANT the sheet pinned by tests
SO THAT the way back into the queue keeps working

#### Acceptance Criteria

- SHALL add `src/presentation/pages/Order/components/OrderTimeUpSheet/__tests__/index.test.tsx`: dialog role, modal,
  name and description; stamp, title and body text; focus on the primary button; its accessible name without the arrow;
  click calls `queueAgain`; the home link's name and `href`; Escape and a scrim click do nothing; one button only; the
  real ID and EN strings; CSS module checks (first-line `@reference`, the phone base and `@variant md` values, no hex,
  no `transition` / `animation`)
- SHALL extend `src/presentation/pages/Order/__tests__/index.test.tsx`: the dialog only when `timeUpSheet` is non-null,
  and the page (categories, timer) still rendered under it
- SHALL assert the ID and EN values of the four new keys in `src/infrastructure/i18n/__tests__/i18n.test.ts`
- SHALL pass `npx tsc --noEmit && npx vitest --run && npm run build`, then a manual check with `?mock=short_window` at
  390 and 1440, ID and EN
