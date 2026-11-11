# Implementation Plan: Order category price and availability (controller)

## Overview

Widen `OrderCategoryView` with a locale-formatted price, the availability value, its translated label and a sold-out
flag; map it in the pure `toOrderCategoryView(category, locale, t)`; pass `locale` and `t` from `OrderController`'s
memo; add the three labels in ID and EN; update tests and typed fixtures. Writer: controller-writer. Depends on specs
12–15 (entity, use case, controller, page). No entity, service or use-case work (see design Overview). Spec 45 renders
the new fields.

## Tasks

- [x] 1. Add `order_availability_available`, `order_availability_almost_gone`, `order_availability_sold_out` to `src/translation/locale/id.json` (Tersedia / Hampir habis / Habis) and `en.json` (Available / Almost gone / Sold out) [Requirement 2, Requirement 3]
- [x] 2. In `src/utils/format/order-event.ts`: widen `OrderCategoryView` (`price`, `availability`, `availabilityLabel`, `soldOut`), add `ORDER_AVAILABILITY_LABEL_KEY` and `isCategoryAvailability`, change `toOrderCategoryView(category, locale, t)` with the unknown-value fallback [Requirement 1, Requirement 2, Requirement 3]
- [x] 3. Rewrite the `toOrderCategoryView` cases in `src/utils/format/__tests__/order-event.test.ts` (three values × ID/EN, unknown value, no count field, guard table) [Requirement 1, Requirement 2, Requirement 3]
- [x] 4. In `src/controllers/order.controller.ts`: map with `toOrderCategoryView(category, locale, t)` and memo deps `[ok, locale, t]`; registration in `src/infrastructure/di/controllers/order.ts` and `AwilixRegistry` stay as they are [Requirement 1, Requirement 2]
- [x] 5. Update `src/controllers/__tests__/order.controller.test.ts` (ready view shape, language rerender reformats prices and labels, still no `refetchInterval`) and add the new fields to the `OrderCategoryView` fixtures in `src/presentation/pages/Order/__tests__/index.test.tsx` and `CategoryList/__tests__/index.test.tsx` [Requirement 1, Requirement 2, Requirement 3]
- [x] 6. Run the gate check [ALL]

## Task Dependency Graph

```json
{ "waves": [[1, 2], [3, 4], [5], [6]] }
```

## Notes

- Gate: `npx tsc --noEmit && npx vitest --run && npm run build`; utils and controller coverage stays ≥ 85%; the i18n
  parity test checks the new keys in both locales.
- Unknown `availability` → no label, `soldOut: false`, price shown. The hold (FR-14-W1) re-checks stock atomically, so
  this never sells a sold-out seat; it only avoids a false "Tersedia" or a false block.
- `available` (count) is deliberately not mapped (HiFi, T-08, Q-20). Live stock is out of scope; if it is ever wanted it
  needs a `refetchInterval` decision against the queue-load budget, not a change here.
- Task 5 touches presentation test fixtures only for their type; what the page renders is spec 45.
- Commit: `feat(order): [FR-12-W1] map category price and availability label`.
