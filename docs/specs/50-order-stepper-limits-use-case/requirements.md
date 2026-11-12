# Requirements Document

## Introduction

The business rules behind FR-14-W1 (rusuh-web#14, "Web: Order: stepper limits (stock, max 3, reserved units)"; parent
FR-14 "Sistem menolak/menonaktifkan pemilihan jumlah yang melebihi stok available, melebihi batas 3, atau yang
menyebabkan akumulasi tiket NIK/sesi tersebut melebihi 3 (termasuk booking lain yang masih aktif)."). The existing
`OrderTicketSelectionUseCase` (spec 47) already caps the order at `min(3, maxTicketsPerOrder, reservedUnits)`; this spec
extends it with the per-category stock caps (sold out, snapshot `available`) and tells the controller when the order
limit is reached and whether that limit is the smaller reservation. Sources: `architecture/customer-journey.md` F13/F14
("Client checks: total <= 3 per order, <= reservation, <= stock? FR-14" → "Disable + / show limit"),
`analysis/hifi-api-review.md` §4 "Ticket limit" ("The reservation can be 1 or 2 near sell-out, not always 3"), ADR-0004
(reservation of `min(3, remaining)`), ADR-0007 (1–3 tickets per order; one seat per NIK per event), `openapi.yaml`
`getCategories` / `Category` (`availability` required, `available` optional "Snapshot count"), N-1 (3 per order).
Pure TypeScript; no API call; no new DI key.

Out of scope (enforced elsewhere, not in this use case):

- **Per-NIK seats across bookings** ("akumulasi tiket NIK … termasuk booking lain yang masih aktif"): one NIK holds one
  seat per event (ADR-0007, `nik_seat` unique key), checked by `validateAttendee` / the hold with `NIK_SEAT_TAKEN`
  (FR-15-W1); one active booking per account per event is checked by the hold with `ACCOUNT_HAS_ACTIVE_BOOKING`. The
  client cannot see other bookings' NIKs, so it cannot pre-check this.
- **Hold error codes** `QUANTITY_OVER_RESERVATION` and `CATEGORY_SOLD_OUT`: the hold (`createBooking`) is not built yet.
- **Live stock refresh**: `availability` / `available` are a snapshot at load (Q-20); no polling is added.

## Glossary

| Term            | Definition                                                                                                     |
| --------------- | -------------------------------------------------------------------------------------------------------------- |
| Order limit     | `min(3, maxTicketsPerOrder, reservedUnits)` (spec 47, unchanged)                                               |
| Category cap    | Most tickets the client lets the buyer pick in one category: 0 when sold out, else `available` when valid      |
| Sold out        | `Category.availability === 'sold_out'`                                                                         |
| Snapshot count  | `Category.available`: units left at load; optional; used only when it is a whole number ≥ 0                    |
| Limit reached   | `limit > 0 && total >= limit`: every "+" is disabled because of the order limit                                |
| Limit below max | `limit < ORDER_MAX_TICKETS` (3): the limit comes from a smaller reservation (ADR-0004) or a lower policy value |
| Stale pick      | A quantity above its category cap after the categories were refetched (e.g. a language change)                 |

## Requirements

### Requirement 1: Sold-out categories cannot be added

**User Story:**

AS a buyer whose turn came
I WANT the "+" of a sold-out category to be off
SO THAT I never pick tickets the hold will refuse

#### Acceptance Criteria

- SHALL treat a category with `availability === 'sold_out'` as having a category cap of 0
- WHEN `increment` is called for a sold-out category THEN SHALL return `{ kind: 'unchanged', reason: 'SOLD_OUT' }` and
  leave the quantities as they were
- SHALL report `canIncrement: false` on the line of every sold-out category
- WHEN `availability` is `'available'`, `'almost_gone'` or a value outside the enum THEN SHALL NOT block the category
  on availability alone (the hold re-checks stock with `CATEGORY_SOLD_OUT`; same rule as `toOrderCategoryView`)

### Requirement 2: Stock cap from the snapshot count

**User Story:**

AS a buyer in a nearly sold-out category
I WANT the stepper to stop at the units left
SO THAT I do not pick more than the category has

#### Acceptance Criteria

- WHEN `available` is a whole number ≥ 0 THEN the category cap SHALL be `available`
- WHEN `available` is missing, `NaN`, negative, fractional or not a number THEN SHALL ignore it (no cap from stock;
  the hold re-checks with `CATEGORY_SOLD_OUT`)
- WHEN the category's quantity is at or above its cap THEN `increment` SHALL return
  `{ kind: 'unchanged', reason: 'STOCK_REACHED' }` and the line SHALL have `canIncrement: false`
- SHALL never produce a quantity above the category cap through `increment`

### Requirement 3: Order of the checks and the increment rule

**User Story:**

AS a developer
I WANT one deterministic reason for every refused increment
SO THAT the controller and the tests never depend on which check ran first by accident

#### Acceptance Criteria

- SHALL check an increment in this order and return the first reason that applies: `UNKNOWN_CATEGORY` → `SOLD_OUT` →
  `LIMIT_REACHED` → `STOCK_REACHED`
- SHALL compute each line's `canIncrement` as `total < limit && quantity < cap` (cap `Infinity` when there is none), so
  `canIncrement` is true exactly when `increment` would return `changed`
- SHALL keep every spec 47 rule for `orderLimit`, `summarize` slots, `reconcileHolders`, `canChooseSelf` and
  `setHolderType` unchanged

### Requirement 4: Removing a ticket stays possible

**User Story:**

AS a buyer whose picked category sold out or shrank after a refetch
I WANT to still remove those tickets
SO THAT I can switch category instead of being stuck

#### Acceptance Criteria

- SHALL allow `decrement` whenever the category's quantity is above 0, including sold-out categories and stale picks
  above the cap; `canDecrement` stays `quantity > 0`
- SHALL NOT lower, clear or trim quantities on its own when a cap is below the current quantity (the buyer removes them;
  the hold re-checks)

### Requirement 5: Limit-reached flags

**User Story:**

AS a buyer at my limit
I WANT the page to tell me why "+" is off
SO THAT I know to remove one ticket to switch category

#### Acceptance Criteria

- SHALL add `limitReached: boolean` to `TicketSelection`: `limit > 0 && total >= limit`
- SHALL add `limitBelowMax: boolean` to `TicketSelection`: `limit < ORDER_MAX_TICKETS`, so the controller can choose the
  reservation copy without a runtime import of the constant
- WHEN the limit is 0 THEN `limitReached` SHALL be false (nothing can be picked; nothing to explain as a reached limit)
- SHALL NOT set `limitReached` because of a category cap (stock caps are explained by the row's availability label)
- SHALL NOT return text: codes and booleans only

### Requirement 6: Pure, registered, tested

**User Story:**

AS a developer
I WANT the stock rules in the same stateless use case
SO THAT the controller stays free of business logic

#### Acceptance Criteria

- SHALL stay in `src/core/use_case/booking/order-ticket-selection.use-case.ts` with zero React, Next.js, browser or
  infrastructure imports and no module-level mutable state
- SHALL widen `SelectableCategory` to `Pick<Category, 'categoryId' | 'name' | 'availability' | 'available'>`
- SHALL NOT add or change a DI registration (`orderTicketSelectionUseCase` is already registered)
- SHALL have tests for every new branch, with the file's coverage ≥ 85%
- SHALL NOT check NIK seats, other bookings or account bookings (out of scope, see Introduction)
