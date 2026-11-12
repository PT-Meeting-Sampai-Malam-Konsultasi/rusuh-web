# Requirements Document

## Introduction

The Detail Ticket screen for FR-15-W1 (rusuh-web#15, "Web: Order: NIK field checks and Dukcapil states"; parent FR-15
"Sistem memvalidasi format NIK (16 digit) dan mencegah penggunaan NIK yang sama untuk melampaui kuota 3 tiket pada event
yang sama."; aanwijzing T-09: 1 NIK = 1 seat per event, one NIK per ticket). `HolderList` renders the check states that
`orderController` now sends (spec 55): error ("!") and valid ("✓") lines through the existing `TextField`, a polite
"Memeriksa ke Dukcapil…" while checking (input stays editable), a small "Periksa lagi" button for retryable failures, and
the name field's blur. Adds every new ID/EN string and fixes the NIK hint example, which fails the new structure rule.
Visual source: HiFi `analysis/hifi/src/detail.html` lines 31–35 (`.field.ok`, `.field.err`); behaviour:
`architecture/customer-journey.md` F5–F11, F17–F19, F23; ADR-0007; ADR-0014.

Out of scope: the hold and the "Lanjut ke Pembayaran" button (FR-16+; `allHoldersVerified` is not rendered yet); the
order countdown (FR-17-W1); a client-side attempt counter; summary aside and phone dock; a "name required" message.

## Glossary

| Term           | Definition                                                                                                |
| -------------- | --------------------------------------------------------------------------------------------------------- |
| NIK field      | `TextField` for `holder.nik` (label "NIK", numeric keyboard)                                              |
| Message line   | `TextField`'s single line under the input: error ("!", `role="alert"`), valid ("✓") or hint               |
| Check region   | A visually hidden `role="status"` paragraph per holder, always mounted, announcing "checking" and "valid" |
| Recheck button | "Periksa lagi" / "Check again", shown under the NIK field when `holder.nik.canRecheck`                    |

## Requirements

### Requirement 1: Error and valid lines

**User Story:**

AS a buyer
I WANT each NIK field to say what is wrong or that it passed
SO THAT I know which ticket to fix (HiFi `.field.err` / `.field.ok`)

#### Acceptance Criteria

- SHALL pass `holder.nik.error` and `holder.nik.valid` to the NIK `TextField` (`error` / `valid` props)
- WHEN `error` is set THEN the field SHALL show the red border, "!" and the message with `role="alert"`, and the input
  SHALL have `aria-invalid="true"` (existing `TextField` behaviour)
- WHEN `valid` is set and `error` is not THEN SHALL show "✓" and the message in green (existing `TextField` behaviour)
- WHEN neither is set and not checking THEN SHALL show the example hint `t('order_holder_nik_hint')`
- SHALL NOT hard-code any message: all text comes from the controller or `t`

### Requirement 2: Checking state

**User Story:**

AS a buyer waiting for Dukcapil
I WANT to see and hear that the check is running
SO THAT I wait a moment instead of retyping

#### Acceptance Criteria

- WHEN `holder.nik.checking` THEN the message line SHALL read `t('order_nik_checking')` ("Memeriksa ke Dukcapil…")
  instead of the example hint
- WHEN checking THEN the NIK input SHALL have `aria-busy="true"` and stay editable (not `disabled`, not `readOnly`)
- SHALL keep one visually hidden `role="status"` region per holder, mounted with the holder block, whose text is
  `t('order_nik_checking')` while checking, `holder.nik.valid` when valid, and empty otherwise
- SHALL NOT move focus or open a popup for any state

### Requirement 3: Recheck button

**User Story:**

AS a buyer whose check failed because Dukcapil was busy or I hit the limit
I WANT a button to check again
SO THAT I do not have to retype the NIK (customer journey F10)

#### Acceptance Criteria

- WHEN `holder.nik.canRecheck` THEN SHALL render a `<button type="button">` with `t('order_nik_recheck')` under the NIK
  field, described by the field's message (`aria-describedby="${nik.id}-message"`), calling `holder.nik.recheck` on click
- WHEN `canRecheck` is false THEN SHALL render no button
- SHALL style it as a quiet secondary action (ink border, card fill, ≥ 44px tall) with `:hover`, `:focus-visible`,
  `:active` and `:disabled` states; no tilt, halftone or print effect (trust zone)

### Requirement 4: Name field blur

**User Story:**

AS a buyer who types the NIK first and the name second
I WANT leaving the name field to start the check
SO THAT I do not have to touch the NIK again

#### Acceptance Criteria

- SHALL pass `onBlur={holder.name.onBlur}` to the name `TextField`
- SHALL keep `onFocus` / `onBlur` / `onChange` of the NIK field as today

### Requirement 5: Copy in Indonesian and English

**User Story:**

AS a buyer reading Indonesian or English
I WANT every NIK message in my language
SO THAT the checks read naturally (ADR-0014)

#### Acceptance Criteria

- SHALL add every key of the spec 55 key table (`order_nik_incomplete`, `order_nik_invalid_structure`,
  `order_nik_duplicate`, `order_nik_checking`, `order_nik_valid`, `order_nik_use_another`,
  `order_nik_rate_limited_one`, `order_nik_rate_limited_other`, `order_nik_rate_limited_later`, `order_nik_unavailable`,
  `order_nik_recheck`) to both `src/translation/locale/id.json` and `en.json`
- SHALL change `order_holder_nik_hint` to "Contoh: 3201 1252 0396 0001" / "Example: 3201 1252 0396 0001" (the old example
  has day 34 and fails the structure rule)
- SHALL keep the same key set in both files (the i18n parity test)

### Requirement 6: Tests and gate

**User Story:**

AS a developer
I WANT each visual state pinned by tests in both languages
SO THAT the payment step can build on them

#### Acceptance Criteria

- SHALL test `HolderList` with React Testing Library for idle, checking, valid, each error kind, recheck shown/hidden and
  clicked, NIK and name blur
- SHALL render the duplicate and rate-limited messages once with real ID strings and once with real EN strings
- SHALL assert in the i18n test that the new hint example passes `checkNik` and that the EN rate-limit message is
  singular for 1 and plural for 60
- SHALL pass `npx tsc --noEmit && npx vitest --run && npm run build`
