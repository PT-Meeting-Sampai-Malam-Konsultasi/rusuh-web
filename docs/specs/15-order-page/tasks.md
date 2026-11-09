# Implementation Plan: Order page

## Overview

Shared `FlowHeader` and the `Poster` `thumb` size, the order sections, the page shell and styles, translations, the
`/order` route with its error boundary, tests and the build gate. Writer: presentation-writer. Depends on spec 14
(`orderController`).

## Tasks

- [x] 1. Shared components: `Poster` gains `size: 'thumb'` and a `loading` prop; new `src/presentation/components/FlowHeader/` (`index.tsx`, `flow-header.module.css`, test) [Requirement 2, Requirement 3]
- [x] 2. Add the page keys (`order_title`, `order_steps_label`, `order_back_label`, `order_category_heading`, `order_error_title`, `order_not_found_title`, `order_not_found_body`) to `id.json` and `en.json` [Requirement 2, Requirement 4, Requirement 5]
- [x] 3. Sections in `src/presentation/pages/Order/components/`: `OrderEventHeader`, `CategoryList`, `OrderSkeleton`, `OrderMessage`, each with `.module.css` and `__tests__/index.test.tsx` [Requirement 3, Requirement 4, Requirement 5, Requirement 6]
- [x] 4. Page shell `src/presentation/pages/Order/index.tsx` + `order.module.css` (flow grid 390 → 720 → 1180, entry motion, reduced motion) + `__tests__/index.test.tsx` [Requirement 5, Requirement 6]
- [x] 5. Route `src/app/order/page.tsx` (metadata, `Suspense` with `OrderSkeleton withHeader`) and `src/app/order/error.tsx` [Requirement 1]
- [x] 6. Run the gate check and compare with the HiFi at 390 and 1440, ID and EN, every mock scenario [ALL]

## Task Dependency Graph

```json
{ "waves": [[1, 2], [3], [4], [5], [6]] }
```

## Notes

- Gate: `npm run typecheck && npm run lint && npx vitest --run && npm run build && npm run check:bundle`; check that
  `out/order.html` exists and carries scoped class names; first-load JS of `/order` grows ≤ 5 KB over Home's shared
  code (no new libraries).
- Manual matrix: `/order?event=evt_samudra` with `?mock=ok|slow|error|offline|admission_invalid`, `/order` with no
  param, `/order?event=nope`; ID and EN; 390×844 and 1440×900 against `analysis/hifi/shots/detail/default-*.png`
  (left column only).
- Under `admission_invalid` the redirect lands on `/queue`, which has no route until FR-06-W1: the 404 page is expected
  there for now.
- Open question: the HiFi phone app bar has no ID/EN switch (only back, title, timer). This spec follows the HiFi; the
  language chosen on Home persists. If the switch is wanted on phones, it goes in the app bar right group next to the
  timer slot.
- Deferred: price and availability columns (FR-12-W1), steppers, limit line, summary aside and phone dock
  (FR-13/14-W1), NIK section (FR-15-W1), countdown and time's-up sheet (FR-17/18-W1), login sheet (NFR-07-W2).
