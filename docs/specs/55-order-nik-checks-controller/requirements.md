# Requirements Document

> **Updated 13 Nov 2026 (spec 79):** the "Saya sendiri / Orang lain" choice is removed. The account holds no NIK (D17),
> so every holder's name and NIK are typed in. The "choosing Saya sendiri" check trigger no longer applies; see
> `docs/specs/79-order-holders-without-choice`.

## Introduction

Page logic for FR-15-W1 (rusuh-web#15, "Web: Order: NIK field checks and Dukcapil states"; parent FR-15 "Sistem
memvalidasi format NIK (16 digit) dan mencegah penggunaan NIK yang sama untuk melampaui kuota 3 tiket pada event yang
sama."; aanwijzing T-09: 1 NIK = 1 seat per event, one NIK per ticket). `orderController` gives every ticket holder's NIK
field a check state (idle, checking, valid, error) from `validateAttendeeUseCase` (spec 54): local errors (16 digits,
structure, repeated in this order) and the Dukcapil states (match, mismatch, seat taken, rate limited, busy with
"Periksa lagi", admission lost). Sources: ADR-0007, `architecture/customer-journey.md` F5–F11, F17–F19, F23 and the
sequence "Each attendee (1-3)", HiFi `analysis/hifi/src/detail.html` lines 31–35, `openapi.yaml` `validateAttendee`,
ADR-0014 (ID/EN). Spec 56 renders it.

The use case is spec 54 (business validation and error classification: the use-case rule table says "Yes").

Out of scope: the hold (`createBooking`, `ATTENDEE_NOT_VALIDATED`, `ACCOUNT_HAS_ACTIVE_BOOKING`) and the "Lanjut ke
Pembayaran" button (FR-16+; this spec only exposes `allHoldersVerified`); the order countdown (FR-17-W1); a client-side
3-per-minute counter (server-enforced, C-6); a "name required" error on the name field (the form is never submitted in
this ticket; the empty name only keeps the check idle); expiry of validation tokens.

## Glossary

| Term               | Definition                                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Slot               | One ticket of the order (`TicketSlot`, key `${categoryId}-${ordinal}`, `index` 1–3)                                |
| fieldIndex         | `slot.index − 1`, sent to `validateAttendee`                                                                       |
| Local check        | `validateAttendeeUseCase.checkNik(digits, earlierNiks)` on every render                                            |
| Check run          | The controller's record per slot: the exact `{ nik, fullName }` sent, and `checking`, the result or a failure code |
| Touched            | The slot's NIK field was blurred at least once                                                                     |
| Check state        | `idle` / `checking` / `valid` / `error`, derived per slot from the local check, touched/focus and the run          |
| Retryable error    | `unavailable`, `rate-limited` or an unclassified failure: the field offers "Periksa lagi"                          |
| allHoldersVerified | Every slot is `valid` (and there is at least one)                                                                  |

## Requirements

### Requirement 1: NIK form value and local errors

**User Story:**

AS a buyer typing a holder's NIK
I WANT obvious mistakes shown at the right moment
SO THAT I am not scolded while typing but never miss a repeated NIK

#### Acceptance Criteria

- SHALL keep `nik: z.string()` holding digits only (`toNikDigits` on change); the rules stay in the use case (the
  placeholder comment changes to say so)
- SHALL run `checkNik(digits, earlierNiks)` per slot, `earlierNiks` = the NIK digits of the slots before it in slot order
- WHEN the local result is `duplicate` THEN the field SHALL show at once (focused or not) `t('order_nik_duplicate',
{ index: ticketIndex })` → "NIK ini sudah dipakai di Tiket 1. Setiap tiket butuh NIK orang yang berbeda."
- WHEN the local result is `incomplete` or `invalid-structure` THEN SHALL show `t('order_nik_incomplete')` /
  `t('order_nik_invalid_structure')` only when the field is touched and not focused
- WHEN the local result is `empty` THEN SHALL show no message
- SHALL NOT call the API while the local result is not `ok`
- SHALL keep the existing masking (raw digits while focused, `maskNik` otherwise); SHALL NOT display the server's
  `nikMasked`

### Requirement 2: When the Dukcapil check runs

**User Story:**

AS a buyer
I WANT the name and NIK checked when I leave the field
SO THAT I learn early, without spending attempts on half-typed values

#### Acceptance Criteria

- WHEN the NIK field blurs, the local result is `ok`, the trimmed name is non-empty and there is no run for the exact
  current `{ nik, fullName }` THEN SHALL start a check
- WHEN the name field blurs under the same conditions THEN SHALL start a check
- WHEN the holder type changes to "Saya sendiri" (name prefilled) under the same conditions THEN SHALL start a check
- SHALL run checks through one `useMutationTanstack` (`retry: false`; the retry is in the use case) calling
  `validateAttendeeUseCase.execute({ eventId, admissionToken: admissionStore.get(eventId), fieldIndex, fullName, nik })`
  with `fieldIndex = slot.index − 1`; the token is read in `mutationFn`, never stored in state or variables
- SHALL allow checks on several slots at once; each result goes to its own slot
- SHALL NOT start a second check for a slot while one with the same values is in flight

### Requirement 3: Results stay tied to the values they checked

**User Story:**

AS a buyer who corrects a NIK or a name
I WANT the old result to disappear
SO THAT a green tick never belongs to values I have since changed

#### Acceptance Criteria

- SHALL keep, per slot key, the run's exact `{ nik, fullName }` and its phase/result (including `validationToken`,
  `nikMasked`, `expiresAt` for `valid`)
- WHEN the NIK or the name of a slot changes, or its holder type changes THEN SHALL drop that slot's run (token
  discarded) and the field SHALL return to its local state
- WHEN a ticket is removed (stepper) THEN SHALL drop that slot's run and its touched flag, so a re-added slot with the same
  key starts clean
- WHEN a response arrives for values that no longer match the slot's run THEN SHALL ignore it for display
- SHALL show a run's result only while the slot's current values equal the run's values; a local `duplicate` SHALL win
  over a stored `valid`

### Requirement 4: Check states and messages

**User Story:**

AS a buyer
I WANT a clear, translated message for every Dukcapil answer
SO THAT I know whether to wait, fix the name or NIK, or use another person's NIK

#### Acceptance Criteria

- WHEN checking THEN `nik.checking` SHALL be true and no error/valid text SHALL be set
- WHEN `valid` THEN `nik.valid` SHALL be `t('order_nik_valid')` ("Nama dan NIK cocok dengan Dukcapil.")
- WHEN `nik-invalid` THEN `nik.error` SHALL be `t('error_nik_invalid')`
- WHEN `seat-taken` THEN `nik.error` SHALL be `t('error_nik_seat_taken')` + " " + `t('order_nik_use_another')` (D-3)
- WHEN `duplicate` (server) THEN `nik.error` SHALL be `t('error_duplicate_nik')`
- WHEN `rate-limited` with seconds THEN `nik.error` SHALL be `t('order_nik_rate_limited', { count })`; without seconds
  `t('order_nik_rate_limited_later')`
- WHEN `unavailable` THEN `nik.error` SHALL be `t('order_nik_unavailable')`
- WHEN the mutation fails with an unclassified error THEN `nik.error` SHALL be
  `t(ERROR_CODE_MAP[code] ?? ERROR_CODE_MAP.UNKNOWN_ERROR)`, shown under the field, never in a popup
- WHEN the error is retryable (`unavailable`, `rate-limited`, unclassified) THEN `nik.canRecheck` SHALL be true and
  `nik.recheck()` SHALL start a new check with the current values (if still locally ok with a name)
- SHALL retranslate every message on a language change without re-running checks

### Requirement 5: Admission lost

**User Story:**

AS a buyer whose turn ended
I WANT to go back to the waiting room
SO THAT I am not stuck on a page I can no longer order from

#### Acceptance Criteria

- WHEN a check returns `admission-invalid` THEN SHALL `router.replace('/queue?event=<id>')` once (same target and guard as
  the categories redirect)
- SHALL NOT track an analytics event or set a field message for `admission-invalid`

### Requirement 6: Verified summary, analytics and privacy

**User Story:**

AS the next ticket (FR-16+) and the product team
I WANT to know when every holder is verified, and which outcomes happen
SO THAT the payment button can rely on it and Dukcapil trouble is visible without personal data

#### Acceptance Criteria

- SHALL expose `allHoldersVerified: boolean`: true when there is at least one holder and every holder's state is `valid`
- WHEN a check settles with `valid`, `nik-invalid`, `seat-taken`, `duplicate`, `rate-limited` or `unavailable` THEN SHALL
  call `analyticsAdapter.trackEvent('order_nik_checked', { outcome })` once
- SHALL NOT pass the NIK, the name, the token or an error object to analytics, `reportError`, `console` or any message
- SHALL NOT use `useLoading` or `usePopupError` for the check (the field stays editable; errors are field-level)

### Requirement 7: Interface, DI and tests

**User Story:**

AS a developer
I WANT the controller extended without breaking FR-11–FR-14 behaviour
SO THAT the page keeps working while NIK checks arrive

#### Acceptance Criteria

- SHALL add to `OrderHolderNikField`: `error?: string`, `valid?: string`, `checking: boolean`, `canRecheck: boolean`,
  `recheck: () => void`; to `OrderHolderNameField`: `onBlur: () => void`; to `OrderControllerInterface`:
  `allHoldersVerified: boolean`
- SHALL add `validateAttendeeUseCase` and `useMutationTanstack` to `OrderControllerDeps` (both registered)
- SHALL keep every other field and behaviour unchanged
- SHALL update the fake controller / holder fixtures in `src/presentation/pages/Order/__tests__/index.test.tsx` and
  `HolderList/__tests__/index.test.tsx` just enough for `tsc --noEmit` to pass
- SHALL test every state, stale responses, value-change resets, removal, the redirect and analytics; coverage ≥ 85%
