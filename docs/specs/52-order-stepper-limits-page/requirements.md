# Requirements Document

## Introduction

The Detail Ticket screen for FR-14-W1 (rusuh-web#14, "Web: Order: stepper limits (stock, max 3, reserved units)";
parent FR-14 "Sistem menolak/menonaktifkan pemilihan jumlah yang melebihi stok available, melebihi batas 3, atau yang
menyebabkan akumulasi tiket NIK/sesi tersebut melebihi 3 (termasuk booking lain yang masih aktif)."). `CategoryList`
shows the HiFi limit line under the list ("**3/3** Batas 3 tiket tercapai. Kurangi satu untuk ganti kategori.") in a
polite live region, and its existing stepper renders the stock-aware disabled states that the controller (spec 51) now
sends. Visual source: HiFi `analysis/hifi/detail.html` line 33 and `analysis/hifi/assets/flow.css` `.limit` (Figma is not
accessible to this team). Sources for the behaviour: `architecture/customer-journey.md` F13/F14 ("Disable + / show
limit"), ADR-0004, ADR-0014 (ID/EN). No route, DI or translation-key change in this layer (keys are spec 51's).

Out of scope: per-NIK seats across bookings and one active booking per account (server-enforced, `NIK_SEAT_TAKEN` in
FR-15-W1, `ACCOUNT_HAS_ACTIVE_BOOKING`); hold errors `QUANTITY_OVER_RESERVATION` / `CATEGORY_SOLD_OUT`; live stock
refresh (Q-20); summary aside and phone dock.

## Glossary

| Term         | Definition                                                                                           |
| ------------ | ---------------------------------------------------------------------------------------------------- |
| Limit notice | `OrderLimitNotice` `{ count, message }` from spec 51, or `null`                                      |
| Limit line   | HiFi `.limit`: a pink plate with the count ("3/3") followed by the message, 14px under the list      |
| Limit region | The always-mounted `role="status"` wrapper that holds the limit line, so its appearance is announced |
| Sold-out row | `data-sold-out` row (spec 45 styles); with spec 50/51 its "+" is disabled, and "−" too at quantity 0 |

## Requirements

### Requirement 1: Limit line under the category list

**User Story:**

AS a buyer who reached my limit
I WANT a line under the categories telling me so
SO THAT I understand why "+" is off and how to switch category

#### Acceptance Criteria

- SHALL add a `limitNotice: OrderLimitNotice | null` prop to `CategoryList`
- WHEN `limitNotice` is non-null THEN SHALL render, after the `ul`, a `p` with `<b>{count}</b>` followed by the
  `message` ("**3/3** Batas 3 tiket tercapai. Kurangi satu untuk ganti kategori." / "**3/3** You've hit the 3-ticket
  limit. Remove one to switch category.")
- WHEN `limitNotice` is `null` THEN SHALL render no line and no visible space for it
- SHALL show the reservation variant unchanged when the controller sends it ("**2/2** Kuota giliran Anda 2 tiket. …")
- The shell SHALL pass `limitNotice` from the controller to `CategoryList`
- SHALL NOT hard-code any copy: count and message come from the controller

### Requirement 2: Announced politely

**User Story:**

AS a buyer using a screen reader
I WANT to hear that I reached the limit when I press "+" for the last ticket
SO THAT the disabled buttons that follow make sense

#### Acceptance Criteria

- SHALL keep a limit region with `role="status"` (implicit `aria-live="polite"`) and `aria-atomic="true"` mounted
  whenever `CategoryList` is rendered, empty when `limitNotice` is `null`
- WHEN `limitNotice` becomes non-null THEN the line SHALL be inserted inside the already-mounted region, so it is
  announced once
- SHALL NOT use `role="alert"` or move focus (the limit is information, not an error)

### Requirement 3: Style per the HiFi

**User Story:**

AS a buyer
I WANT the line to look like the rest of Poster Sablon
SO THAT it reads as a quiet note, with my count in "you" pink

#### Acceptance Criteria

- SHALL style the line as HiFi `.limit`: margin-top 14px, 14px text, `ink` colour, flex row, items centred, gap 10px
- SHALL style the count as HiFi `.limit b`: `pink` background, white text, display font 800 15px, line-height 1,
  padding 4px 7px 3px, tabular figures
- SHALL use theme tokens only (`pink`, `ink`, `font-display`, `text-white`); no raw hex
- WHEN the message wraps on a 390px phone THEN the count plate SHALL keep its size (no shrink, no wrap inside "3/3")
- SHALL NOT add tilt, halftone or print effects (the line is not a hero element)

### Requirement 4: Sold-out and capped rows

**User Story:**

AS a buyer
I WANT a sold-out row's stepper to be visibly and semantically off
SO THAT I do not try to pick it

#### Acceptance Criteria

- SHALL keep rendering the stepper buttons with native `disabled` from `canIncrement` / `canDecrement` (spec 49),
  which exposes the disabled state to assistive technology; SHALL NOT add a redundant `aria-disabled`
- WHEN a row is sold out with quantity 0 THEN both its buttons SHALL be `disabled`
- WHEN a sold-out row still has a quantity (stale pick after a refetch) THEN "−" SHALL stay enabled and "+" disabled
- SHALL keep the spec 45 sold-out styles ("Habis" plate, grey, strike-through price) and the "status never by colour
  alone" rule

### Requirement 5: Tests, languages and gate

**User Story:**

AS a developer
I WANT tests that pin the limit line and the disabled states in both languages
SO THAT the summary and the hold can build on them

#### Acceptance Criteria

- SHALL test `CategoryList` with React Testing Library: region always present, line shown/hidden, count and message
  text, sold-out row buttons disabled, stale-pick row "−" enabled
- SHALL render once with real ID strings and once with real EN strings (from the locale files)
- SHALL test that the shell passes `limitNotice` to `CategoryList`
- SHALL pass `npx tsc --noEmit && npm run lint && npx vitest --run && npm run build` and `npm run check:bundle`
