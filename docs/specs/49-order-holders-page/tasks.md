# Implementation Plan: Order steppers and holders (page)

> **Updated 13 Nov 2026 (spec 79):** the "Saya sendiri / Orang lain" choice is removed. The account holds no NIK (D17),
> so every holder's name and NIK are typed in. The radiogroup, its styles and its translation keys no longer apply; see
> `docs/specs/79-order-holders-without-choice`.

## Overview

Render the − / count / + stepper in every `CategoryList` row with the Figma sizes and selected style, add the
"2 Pemegang tiket" section (`HolderList`) with one block per ticket (radiogroup "Untuk siapa tiket ini", name and NIK
`TextField`s), wire both in the Order shell, and give the skeleton rows a stepper placeholder. Writer:
presentation-writer. Depends on spec 48 (controller fields and translation keys). Builds the ADR-0007 variant of the
Figma holder block; the profile-NIK card is a recorded decision, not built.

## Tasks

- [x] 1. `CategoryList/index.tsx`: add `onIncrement` / `onDecrement` props and `OrderCategoryRow` type; render the stepper after the price with labelled buttons, `disabled` from `canIncrement` / `canDecrement`, `output aria-live="polite"` with the keyed count span; `data-selected` on the `li` [Requirement 1]
- [x] 2. `CategoryList/category-list.module.css`: phone grid `"n p" "s st"`, `md` grid `minmax(0,1fr) 120px 150px auto` / `"n s p st"` (replace the FR-13/14-W1 comment); stepper, step button (hit area ≥ 44×44), count, selected and bump styles [Requirement 1, Requirement 2]
- [x] 3. Create `HolderList/index.tsx` and `holder-list.module.css`: section head with badge "2" and note, one block per holder with `h3`, radiogroup of native radios (hidden when `showChoice` is false), name and NIK `TextField`s; segment states, phone stack / desktop side-by-side layout, rise-in animation [Requirement 3, Requirement 4, Requirement 5]
- [x] 4. Shell `src/presentation/pages/Order/index.tsx`: pass `increment` / `decrement` to `CategoryList`, render `HolderList` when `status === 'ready' && showHolders`; `OrderSkeleton`: stepper placeholder per row and matching grid [Requirement 3, Requirement 6]
- [x] 5. Tests: update `CategoryList`, `OrderSkeleton` and shell tests; write `HolderList/__tests__/index.test.tsx` (ID and EN renders) per the Testing Strategy [Requirement 7]
- [x] 6. Run the gate check and compare with the Figma frames at 390 and 1440, ID and EN [ALL]

## Task Dependency Graph

```json
{ "waves": [[1, 2, 3], [4], [5], [6]] }
```

## Notes

- Gate: `npx tsc --noEmit && npm run lint && npx vitest --run && npm run build && npm run check:bundle`;
  `out/order.html` keeps scoped class names.
- Decision to raise with the owner and the designer: Figma's profile-NIK card ("NIK 3174 •••• •••• 0004 · Dari profil
  Anda · Ubah di Akun"), "Profil Anda belum punya NIK." and "Simpan NIK ini ke profil" conflict with ADR-0007 and
  `openapi.yaml` ("The account holds no NIK"); not built. Also confirm the checked-segment colours and whether the
  disabled "Saya sendiri" needs a short reason.
- Inputs are 54px (design-system), not Figma's 52px; step buttons keep Figma's 42×40 drawing with a ≥ 44px hit area.
- Deferred: sold-out stepper disabling, the "3/3 Batas 3 tiket tercapai…" limit line and stock-aware limits (FR-14-W1,
  #14); NIK format checks, duplicate-NIK error, `validateAttendee` / Dukcapil states (FR-15-W1, #15); summary aside
  "Ringkasan", phone dock, "Lanjut ke pembayaran" / `createBooking` hold, section 3 "Kirim e-tiket ke"; timer and
  time's-up sheet (FR-17/18-W1); queue `Admission.maxTickets` → `reservedUnits` (follow-up).
- Commit: `feat(order): [FR-13-W1] add ticket steppers and holder fields`.
