# Implementation Plan: Order category price and availability (page)

## Overview

Render the status label and the price in each `CategoryList` row with the HiFi sold-out and almost-gone styles, the
three-column desktop grid and the two-row phone grid; give the skeleton rows a price placeholder; update tests.
Writer: presentation-writer. Depends on spec 44 (widened `OrderCategoryView`). No new props, keys, routes or DI.

## Tasks

- [x] 1. `CategoryList/index.tsx`: add the status `span` (only when `availabilityLabel` is set, `data-availability`) and the price `span` after the name block; `data-sold-out` on the `li`; no `<s>` / `<del>` [Requirement 1, Requirement 2]
- [x] 2. `CategoryList/category-list.module.css`: phone grid `minmax(0,1fr) auto` / `"n p" "s ."`, `md` grid `minmax(0,1fr) 120px 150px` / `"n s p"` with the FR-13/14-W1 stepper comment; `.status`, `.price`, almost-gone and sold-out rules with theme tokens [Requirement 1, Requirement 2, Requirement 3]
- [x] 3. `OrderSkeleton`: add a price placeholder per row and the matching row grid in `order-skeleton.module.css` [Requirement 3]
- [x] 4. Tests: rewrite `CategoryList/__tests__/index.test.tsx` (replace the no-`Rp` assertion), update `OrderSkeleton` and the page shell tests [Requirement 4]
- [x] 5. Run the gate check and compare with the HiFi at 390 and 1440, ID and EN [ALL]

## Task Dependency Graph

```json
{ "waves": [[1, 2, 3], [4], [5]] }
```

## Notes

- Gate: `npx tsc --noEmit && npx vitest --run && npm run build`; `out/order.html` carries scoped class names.
- Status on phones is 12.5px, not the HiFi's 12px (design-system minimum).
- Sold out is announced by the word, read before the price; the strike-through is CSS only.
- Deferred: stepper column and disabled sold-out stepper, selected state, limit line (FR-13/14-W1); live stock is out
  of scope (T-08, Q-20).
- Commit: `feat(order): [FR-12-W1] show category price and availability`.
