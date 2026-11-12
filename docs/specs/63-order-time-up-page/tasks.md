# Implementation Plan: Order time's up (page)

## Overview

Show the time's-up sheet from spec 62 on the Order page: a new section `OrderTimeUpSheet` (scrim + sheet modelled on
`QueueLeaveSheet`: `role="dialog"`, `aria-modal`, labelled by the title, described by the body; `Stamp tone="sold"`
"Waktu habis"; "5 menit sudah lewat."; the HiFi body; "Antre lagi →" as the focused primary `Button`; "Ke beranda" as a
text link). Not dismissible: no close button, Escape and the scrim do nothing. A centred 520px dialog with the pink
offset from 720px; a full-width bottom sheet with a top border only below. The shell renders it when `timeUpSheet` is
non-null and keeps the page (timer at "0:00") underneath. Copy in ID and EN. Writer: presentation-writer. Depends on spec
62 (`OrderTimeUpView`, `timeUpSheet`).

## Tasks

- [x] 1. Add `order_time_up_stamp`, `order_time_up_title`, `order_time_up_body` and `order_time_up_queue_again` (HiFi copy, ID / EN) to `src/translation/locale/id.json` and `en.json` after `order_timer_label`, and assert the values in `src/infrastructure/i18n/__tests__/i18n.test.ts`; the home link reuses `action_back_home` [Requirement 6, Requirement 7]
- [x] 2. Create `src/presentation/pages/Order/components/OrderTimeUpSheet/index.tsx` per the design (props `sheet: OrderTimeUpView`; dialog attributes; `Stamp tone="sold"`; `h2` and body with ids; `Button` with `ref` focused at mount and the `aria-hidden` arrow; `next/link` home link; no key handler, no scrim `onClick`, no close button) [Requirement 1, Requirement 2, Requirement 3]
- [x] 3. Create `order-time-up-sheet.module.css` next to it per the design (phone bottom sheet base; `@variant md` centred 520px dialog with `6px 6px 0 var(--color-pink)`; HiFi `.d-l` title, body, actions spacing; the `.link` of `OrderMessage`; tokens only) [Requirement 2, Requirement 4]
- [x] 4. In `src/presentation/pages/Order/index.tsx`: read `timeUpSheet` from the controller and render `{timeUpSheet && <OrderTimeUpSheet sheet={timeUpSheet} />}` after `</main>`; nothing else changes [Requirement 5]
- [x] 5. Tests: `src/presentation/pages/Order/components/OrderTimeUpSheet/__tests__/index.test.tsx` (dialog name / description / modal, stamp and title, focus on the primary button and its name without the arrow, click calls `queueAgain`, home link `href`, Escape and scrim click do nothing, one button, real ID and EN strings, CSS module checks) and `src/presentation/pages/Order/__tests__/index.test.tsx` (dialog only when `timeUpSheet` is non-null; categories, banner and the "0:00" timers still rendered under it) [Requirement 1, Requirement 2, Requirement 3, Requirement 4, Requirement 5, Requirement 7]
- [x] 6. Run the gate check and the manual check with `?mock=short_window` at 390 and 1440, ID and EN (sheet at zero, focus, not dismissible, layout per width, stored place gone, "Antre lagi" gives a new number without the missed screen, "Ke beranda") [ALL]

## Task Dependency Graph

```json
{ "waves": [[1, 2, 3], [4], [5], [6]] }
```

## Notes

- Gate: `npx tsc --noEmit && npx vitest --run && npm run build`; `npm run lint` (ESLint + Stylelint) runs in
  lint-staged; `out/order.html` keeps scoped class names.
- Specs 61 and 62 must be in first (same PR): the section imports `OrderTimeUpView`, and the shell test's `base()`
  already has `timeUpSheet: null` (spec 62 task 4).
- Reuse, don't share: `Stamp` and `Button` are used as they are; `QueueLeaveSheet` is copied in shape, not extracted
  (different behaviour; a shared dialog with a real focus trap is the follow-up for both).
- Not dismissible on purpose: the order no longer exists, so there is nothing to return to. The buyer leaves by
  "Antre lagi" (primary, focused) or "Ke beranda".
- Known follow-up, shared with `QueueLeaveSheet`: no focus trap, no `inert` on the page behind, no scroll lock. Spec 62
  keeps the page behind from fetching or redirecting if focus wanders there.
- Copy change from the brief: no `order_time_up_home` key; "Ke beranda" / "Go home" is the existing `action_back_home`
  (same words, already used for the home link on this page).
- HiFi differences are listed in the design (dialog role on the sheet, `aria-describedby`, hidden arrow, focus,
  `router.replace` instead of a link to the waiting room).
- Out of scope: the countdown across a refresh (FR-19-W1, rusuh-web#18), the payment countdown / expiry (FR-21 /
  FR-23), the hold, any release call, disabling inputs under the sheet.
- Commit: `feat(order): [FR-18-W1] show the time's-up sheet`.
