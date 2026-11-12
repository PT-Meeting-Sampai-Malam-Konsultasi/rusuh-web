# Implementation Plan: Order stepper limits (use case)

## Overview

Extend `OrderTicketSelectionUseCase` (spec 47) with per-category caps (sold out → 0; a valid snapshot `available` → that
count), the new refusal reasons `SOLD_OUT` and `STOCK_REACHED` in the order `UNKNOWN_CATEGORY` → `SOLD_OUT` →
`LIMIT_REACHED` → `STOCK_REACHED`, and the `limitReached` / `limitBelowMax` flags on `TicketSelection`. Decrement stays
allowed on sold-out and stale picks. No new file, no DI change. Writer: use-case-writer. Spec 51 consumes it.

## Tasks

- [x] 1. In `src/core/use_case/booking/order-ticket-selection.use-case.ts`: widen `SelectableCategory` with `availability` and `available`, add the private `capOf` helper, add `SOLD_OUT` / `STOCK_REACHED` to `ChangeQuantityResult`, apply the cap in `summarize` lines and in `increment` with the stated check order; leave `decrement` reading no cap [Requirement 1, Requirement 2, Requirement 3, Requirement 4, Requirement 6]
- [x] 2. In the same file: add `limitReached` (`limit > 0 && total >= limit`) and `limitBelowMax` (`limit < ORDER_MAX_TICKETS`) to `TicketSelection` and return them from `summarize` [Requirement 5]
- [x] 3. Update `src/core/use_case/booking/__tests__/order-ticket-selection.use-case.test.ts`: `availability: 'available'` on the existing fixtures, then every case in the Testing Strategy (caps, invalid counts, reason order, `canIncrement` ⇔ `changed`, stale-pick decrement, limit flags table, scripted sequence) [Requirement 1, Requirement 2, Requirement 3, Requirement 4, Requirement 5, Requirement 6]
- [x] 4. Run the gate check [ALL]

## Task Dependency Graph

```json
{ "waves": [[1], [2], [3], [4]] }
```

## Notes

- Tasks 1 and 2 edit the same file, so they run in sequence.
- Gate: `npm run typecheck && npm run lint && npx vitest --run`; coverage ≥ 85% on the file. `npm run typecheck` also
  confirms the controller still compiles against the widened `SelectableCategory` (it passes `Category[]`).
- `limitBelowMax` is added beyond the brief so the controller needs no runtime import of `ORDER_MAX_TICKETS` (controller
  rule: `import type` only from `@core`).
- Out of scope: per-NIK seat across bookings (ADR-0007, `NIK_SEAT_TAKEN`, FR-15-W1) and one active booking per account
  (`ACCOUNT_HAS_ACTIVE_BOOKING`), both enforced by the server; handling `QUANTITY_OVER_RESERVATION` /
  `CATEGORY_SOLD_OUT` (the hold is not built); live stock refresh (snapshot at load, Q-20).
- Commit: `feat(order): [FR-14-W1] cap steppers at stock and flag the order limit`.
