# Implementation Plan: Order stepper limits (controller)

## Overview

Extend `OrderController` with `limitNotice` (HiFi "3/3 Batas 3 tiket tercapai…" line, plus a proposed reservation
variant when the limit is 1 or 2), switch `categoryNote` to the order limit, and pin the stock-aware rows that spec 50's
use case now produces. Add the four ID/EN keys. No new DI dependency, no analytics, no popup. Writer: controller-writer.
Depends on spec 50 (`limitReached`, `limitBelowMax`, stock caps). Spec 52 renders it. No separate use-case spec: the
rules are spec 50.

## Tasks

- [x] 1. Add `order_limit_reached_one/_other` and `order_limit_reached_reserved_one/_other` from the design key table to `src/translation/locale/id.json` and `en.json` [Requirement 4]
- [x] 2. In `src/controllers/order.controller.ts`: export `OrderLimitNotice`, add `limitNotice` to `OrderControllerInterface` and compute it with `useMemo` from `status`, `selection.limitReached`, `selection.limitBelowMax` and `limit`; pass `count: limit` to `order_category_note` [Requirement 1, Requirement 2, Requirement 3]
- [x] 3. Update `src/controllers/__tests__/order.controller.test.ts` per the Testing Strategy (sold-out and `available` rows, stale pick after refetch, notice states, note count, no analytics) [Requirement 1, Requirement 2, Requirement 3, Requirement 5]
- [x] 4. Add `limitNotice: null` to the fake controller in `src/presentation/pages/Order/__tests__/index.test.tsx`, and the EN singular/plural assertion to `src/infrastructure/i18n/__tests__/i18n.test.ts` [Requirement 4, Requirement 5]
- [x] 5. Run the gate check [ALL]

## Task Dependency Graph

```json
{ "waves": [[1, 2], [3, 4], [5]] }
```

## Notes

- Gate: `npx tsc --noEmit && npm run lint && npx vitest --run && npm run build`; controller coverage ≥ 85%; the i18n
  parity test checks the new keys.
- Re-check before done: no `trackEvent` for limits, no `usePopupError`, no runtime import from `@core`, no rule in the
  body (the key choice reads `limitBelowMax`, it does not compare with 3).
- `order_limit_reached_reserved` copy is proposed (no HiFi/Figma frame); confirm with the designer. `categoryNote` now
  states the order limit, reversing spec 48's recorded choice.
- Out of scope: per-NIK seats across bookings (`NIK_SEAT_TAKEN`, FR-15-W1, ADR-0007) and one active booking per account
  (`ACCOUNT_HAS_ACTIVE_BOOKING`); the hold and `QUANTITY_OVER_RESERVATION` / `CATEGORY_SOLD_OUT`; live stock refresh (Q-20).
- Commit: `feat(order): [FR-14-W1] add the limit notice and stock-aware steppers`.
