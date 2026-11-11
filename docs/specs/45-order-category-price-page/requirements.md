# Requirements Document

## Introduction

The Detail Ticket category rows for FR-12-W1 (rusuh-web#12, parent FR-12 "Setiap kategori menampilkan jumlah tiket
available dan harga yang berbeda-beda."), ported from `../rusuh-documentation/analysis/hifi/src/detail.html` lines
22–26 and `analysis/hifi/assets/flow.css` lines 28–38 and 72–75 (shots `analysis/hifi/shots/detail/default-1440x900.png`,
`default-390x844.png`): each row in `CategoryList` shows the availability label ("Tersedia" / "Hampir habis" / "Habis")
and the price, with the HiFi sold-out style. Aanwijzing T-08 and Q-20: the label is a snapshot at load, no live stock,
no count. Data comes formatted from `orderController` (spec 44). Steppers, the selected state and the limit line are
FR-13/14-W1. Figma is not accessible; the HiFi is the reference.

## Glossary

| Term           | Definition                                                                                                     |
| -------------- | -------------------------------------------------------------------------------------------------------------- |
| Status label   | HiFi `.cat-s`: the availability word, uppercase by CSS                                                         |
| Price          | HiFi `.cat-p`: the formatted price, right-aligned, tabular figures                                             |
| Sold-out row   | HiFi `.cat.is-out`: name and price in `ink-3`, price struck through, label as an ink word on a `paper-2` plate |
| Stepper column | HiFi fourth grid column (`auto`) with − / count / +; not built here (FR-13/14-W1)                              |

## Requirements

### Requirement 1: Status label and price in each row

**User Story:**

AS a buyer whose turn came
I WANT every category to show whether it is available and what it costs
SO THAT I can choose quickly and within my budget

#### Acceptance Criteria

- SHALL render, inside each category `li` and in this DOM order: the name block (`h3` + description), the status label,
  the price
- SHALL render the status label as a `span` with `availabilityLabel` from the controller (ID "Tersedia" /
  "Hampir habis" / "Habis", EN "Available" / "Almost gone" / "Sold out"), styled 600 13px, uppercase, letter-spacing
  .04em, `ink-2`
- WHEN `availability` is `almost_gone` THEN the label SHALL be `pink-ink`
- WHEN `availabilityLabel` is `''` (unknown server value, spec 44) THEN SHALL render no label element and leave the
  price in its own column
- SHALL render the price as a `span` with `price` from the controller (e.g. `Rp 850.000` / `Rp 850,000`), 700 18px,
  right-aligned, tabular figures
- SHALL show every string in ID and EN through the controller (no translation call in the section)
- SHALL NOT render the stock count, a stepper, a selected state or any button in the row (FR-13/14-W1)
- SHALL NOT update the label or price after load (no live stock, Q-20)

### Requirement 2: Sold-out row

**User Story:**

AS a buyer
I WANT a sold-out category to look clearly unavailable and be announced as sold out
SO THAT I do not try to buy it, with or without a screen reader

#### Acceptance Criteria

- WHEN `soldOut` is true THEN the name (`h3`) and price SHALL be `ink-3` and the price SHALL be struck through
- WHEN `soldOut` is true THEN the label SHALL be `ink` on a `paper-2` plate with 3px 6px padding, sized to its text
  (`justify-self: start`)
- SHALL convey sold out by the word "Habis" / "Sold out", not by colour or strike-through alone
- SHALL read in the order name, status, price for assistive tech, so "Habis" is announced before the price
- SHALL NOT mark the price up with `<s>` or `<del>` (screen readers announce those as "deleted" / "strikethrough",
  which reads as a discounted old price); the strike-through is CSS only

### Requirement 3: Row layout, phone and desktop

**User Story:**

AS a buyer on a phone or a desktop
I WANT the rows to match the HiFi at 390 px and 1440 px
SO THAT name, status and price line up and are easy to scan

#### Acceptance Criteria

- WHEN the viewport is ≥ 720 px THEN each row SHALL be a grid `minmax(0,1fr) 120px 150px` with areas name, status,
  price, `align-items: center`, gap 20px, padding 18px 0, with a CSS comment that the stepper `auto` column joins in
  FR-13/14-W1
- WHEN the viewport is < 720 px THEN each row SHALL be a grid `minmax(0,1fr) auto` with areas `"n p" "s ."`, gap
  6px 12px, padding 14px 0; price 16px; status 12.5px (design-system minimum; HiFi 12px), `align-self: center`
- SHALL use Poster Sablon tokens from `src/styles/app.css` (`ink`, `ink-2`, `ink-3`, `paper-2`, `pink-ink`,
  `font-sans`), no raw hex values
- SHALL give the loading skeleton rows a price placeholder in the same position, so the ready rows do not shift the
  layout (CLS ≤ 0.1)
- SHALL keep the existing section heading, note, description and entry motion unchanged

### Requirement 4: Tests and gate

**User Story:**

AS a developer
I WANT tests that pin the row content and the sold-out semantics
SO THAT later stepper work does not break them

#### Acceptance Criteria

- SHALL replace the `CategoryList` test that asserts no `Rp` with tests for label, price, DOM order, sold-out
  semantics, unknown availability and no button
- SHALL keep the page shell test passing with the spec 44 fixtures and assert a price reaches the list
- SHALL pass `npx tsc --noEmit && npx vitest --run && npm run build`
