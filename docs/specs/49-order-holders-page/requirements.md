# Requirements Document

> **Updated 13 Nov 2026 (spec 79):** the "Saya sendiri / Orang lain" choice is removed. The account holds no NIK (D17),
> so every holder's name and NIK are typed in. The radiogroup, its styles and its translation keys no longer apply; see
> `docs/specs/79-order-holders-without-choice`.

## Introduction

The Detail Ticket screen for FR-13-W1 (rusuh-web#13, "Web: Order: 1–3 tickets, a holder (name + NIK) per ticket,
'Myself' option"; parent FR-13). Each `CategoryList` row gets a − / count / + stepper, and a new section
"2 Pemegang tiket" shows one holder block per ticket with a "Saya sendiri" / "Orang lain" choice, "Nama sesuai KTP" and
"NIK". Layout and copy come from the Figma notes and frames (Rusuh-Tiket-App copy, Ticket Detail Desktop 60:2088,
Mobile 60:2486, holders 60:1641 / 60:1825); where Figma conflicts with ADR-0007 the ADR wins (no NIK on the account).
Data and translated dynamic text come from `orderController` (spec 48). ADR-0014: ID and EN.

## Glossary

| Term             | Definition                                                                                                     |
| ---------------- | -------------------------------------------------------------------------------------------------------------- |
| Stepper          | Figma 129×45 box: button "−" (42×40) · `output` 40×40 · button "+" (42×40), 2.5px ink border, card fill        |
| Selected row     | A category with `quantity > 0`: name in accent (`pink-ink`), count box filled `pink` with white text           |
| Holder block     | One ticket: Heading 3 "Tiket n · Category", the holder choice, the name field, the NIK field                   |
| Holder choice    | Radiogroup "Untuk siapa tiket ini": two equal segments "Saya sendiri"                                          | "Orang lain" |
| Profile-NIK card | Figma's "Nadia Saputri / NIK 3174 •••• •••• 0004 / Dari profil Anda · Ubah di Akun" card: not built (ADR-0007) |

## Requirements

### Requirement 1: Stepper in each category row

**User Story:**

AS a buyer whose turn came
I WANT a − / + stepper on every category
SO THAT I can pick how many tickets of each category I want

#### Acceptance Criteria

- SHALL render, after the price in each row, a stepper: `button` "−", `output` with `quantity`, `button` "+"
- SHALL give the buttons the accessible names `decrementLabel` / `incrementLabel` from the controller ("Kurangi
  Festival B" / "Tambah Festival B"; EN "Remove …" / "Add …") and `type="button"`
- SHALL disable "−" when `canDecrement` is false and "+" when `canIncrement` is false (native `disabled`)
- SHALL call `onDecrement(id)` / `onIncrement(id)` on click
- SHALL mark the `output` `aria-live="polite"` so the new count is announced
- WHEN `selected` THEN the row's name SHALL be `pink-ink` and the count box `pink` with white text (the number stays
  visible, so selection is not colour alone)
- SHALL size the stepper 129×45 (buttons 42×40, output 40×40, border 2.5px ink) and give each button a hit area of at
  least 44×44 without changing the drawn box
- SHALL animate the count with the 450ms "bump" on change, only under `prefers-reduced-motion: no-preference`
- SHALL NOT disable sold-out rows or show the limit line (FR-14-W1)

### Requirement 2: Row layout with the stepper

**User Story:**

AS a buyer on a phone or a desktop
I WANT the stepper where Figma puts it
SO THAT name, status, price and stepper line up

#### Acceptance Criteria

- WHEN the viewport is ≥ 720px THEN the row grid SHALL be `minmax(0,1fr) 120px 150px auto` with areas `"n s p st"`
  (replacing the FR-13/14-W1 comment)
- WHEN the viewport is < 720px THEN the row grid SHALL be `minmax(0,1fr) auto` with areas `"n p" "s st"`, the stepper
  right-aligned beside the availability label
- SHALL keep every spec 45 rule (status, price, sold-out styles, DOM order name → status → price)

### Requirement 3: "Pemegang tiket" section

**User Story:**

AS a buyer who picked tickets
I WANT a section for the people who will use them, only once I picked at least one
SO THAT the page stays short until it matters

#### Acceptance Criteria

- WHEN `status === 'ready'` and `showHolders` THEN SHALL render the section below "Kategori"; otherwise SHALL NOT
  render it
- SHALL head it with the badge "2" and `h2` "Pemegang tiket" / "Ticket holders", and the note "Nama dan NIK sesuai KTP.
  1 NIK = 1 tiket per event — di pintu masuk, e-tiket dicocokkan dengan KTP asli." (EN from spec 48)
- SHALL use the same head layout as "Kategori" (heading over note on phones; side by side with the note right-aligned
  from 720px; 2.5px ink rule under both)
- SHALL render one holder block per `holders` entry, keyed by `key`, separated by a 1px `hair` border
- SHALL NOT render Figma's section 3 "Kirim e-tiket ke", the summary aside or the phone dock

### Requirement 4: Holder block

**User Story:**

AS a buyer
I WANT to say who each ticket is for and type their KTP name and NIK
SO THAT each e-ticket carries the right person (ADR-0007)

#### Acceptance Criteria

- SHALL render Heading 3 `title` ("Tiket 1 · Festival B")
- WHEN `showChoice` THEN SHALL render a radiogroup named "Untuk siapa tiket ini" / "Who is this ticket for" with two
  native radio inputs labelled "Saya sendiri" / "Myself" and "Orang lain" / "Someone else", `checked` from
  `holderType`, the "Saya sendiri" input `disabled` when `selfDisabled`, calling `choose('self' | 'other')` on change
- WHEN `showChoice` is false THEN SHALL render no radiogroup (plain fields)
- SHALL render the name field with `TextField`: label "Nama sesuai KTP", placeholder "Nama lengkap", hint from
  `name.hint` ("Dicetak di e-tiket." or "Dari profil Anda."), `readOnly` from `name.readOnly`, `autoComplete="off"`
- SHALL render the NIK field with `TextField`: label "NIK", placeholder "16 digit sesuai KTP", hint
  "Contoh: 3201 1234 5678 0001", `inputMode="numeric"`, `autoComplete="off"`, `spellCheck={false}`, value from
  `nik.value` (masked when not focused), with `onFocus` / `onBlur` / `onChange` from the controller
- SHALL NOT render the profile-NIK card, "Profil Anda belum punya NIK." or the "Simpan NIK ini ke profil" checkbox
  (ADR-0007, `openapi.yaml` "The account holds no NIK")
- SHALL NOT render NIK error or valid messages (FR-15-W1)

### Requirement 5: Holder block layout and style

**User Story:**

AS a buyer on a phone or a desktop
I WANT the holder blocks laid out as in Figma
SO THAT filling three tickets is quick on either screen

#### Acceptance Criteria

- WHEN the viewport is ≥ 720px THEN the radiogroup SHALL sit right of the heading on the same row and the name and NIK
  fields SHALL sit side by side (two equal columns, gap 22px 28px)
- WHEN the viewport is < 720px THEN heading, radiogroup (full width, two equal segments) and fields SHALL stack
- SHALL style segments as the design-system "Holder block" segmented control: 2.5px ink border, min height 45px,
  checked "Saya sendiri" `pink` with white text, checked "Orang lain" `ink` with `paper` text, unchecked `card`, disabled
  `paper-2` with `ink-3` text and `not-allowed` cursor; visible focus ring on the focused segment
- SHALL keep the trust zone quiet: no tilt, halftone or print effects in the section
- SHALL animate new blocks in (rise 300ms) only under `prefers-reduced-motion: no-preference`

### Requirement 6: Loading skeleton parity

**User Story:**

AS a buyer on a slow connection
I WANT the loading rows to match the loaded rows
SO THAT nothing jumps when the categories arrive (CLS ≤ 0.1)

#### Acceptance Criteria

- SHALL add a 129×45 stepper placeholder to each `OrderSkeleton` row with the same grid as the loaded rows (desktop
  fourth `auto` column; phone second line, right)
- SHALL keep the skeleton `aria-hidden` and its four rows

### Requirement 7: Tests, languages and gate

**User Story:**

AS a developer
I WANT tests that pin the stepper and holder markup in both languages
SO THAT FR-14/15-W1 can build on them safely

#### Acceptance Criteria

- SHALL test `CategoryList`, `HolderList`, `OrderSkeleton` and the page shell with React Testing Library, querying by
  role and text, `t` mocked as `(k) => k`, plus one ID and one EN render with real strings
- SHALL show every string through i18n keys from spec 48 (no hard-coded copy in JSX)
- SHALL pass `npx tsc --noEmit && npm run lint && npx vitest --run && npm run build` and `npm run check:bundle`
