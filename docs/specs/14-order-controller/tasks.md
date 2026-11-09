# Implementation Plan: Order controller

## Overview

`OrderController` for `/order?event=`: two queries, status derivation, admission redirect, formatted event and
category views, flow steps, back link, language switch and the page view; with its pure helpers, translations,
registration and tests. Writer: controller-writer. Depends on specs 12 and 13. No use case for `getEvent` (simple GET).

## Tasks

- [x] 1. Add `EVENT` and `CATEGORIES` to `src/utils/constants/query-keys.ts`; write `src/utils/query/retry.ts` (`retryTransientOnce`) with `src/utils/query/__tests__/retry.test.ts` [Requirement 1, Requirement 2]
- [x] 2. Write `src/utils/format/order-event.ts` (`OrderEventView`, `OrderCategoryView`, `toOrderEventView`, `toOrderCategoryView`) with `src/utils/format/__tests__/order-event.test.ts` [Requirement 4]
- [x] 3. Add the controller's keys (`order_step_*`, `order_category_note_one` / `_other`) to `src/translation/locale/id.json` and `en.json` [Requirement 4, Requirement 5]
- [x] 4. Write `src/controllers/order.controller.ts` (`OrderStatus`, `FlowStep`, `OrderControllerInterface`, default `OrderController`) [Requirement 1, Requirement 2, Requirement 3, Requirement 4, Requirement 5]
- [x] 5. Write `src/controllers/__tests__/order.controller.test.ts` covering the Testing Strategy [Requirement 1, Requirement 2, Requirement 3, Requirement 4, Requirement 5]
- [x] 6. Register `orderController` in `controllers.registry.ts`; add it to `AwilixRegistry` and to `KEYS` in `registry.test.ts` [Requirement 5]
- [x] 7. Run the gate check [ALL]

## Task Dependency Graph

```json
{ "waves": [[1, 2, 3], [4], [5, 6], [7]] }
```

## Notes

- Gate: `npm run typecheck && npm run lint && npx vitest --run` (controller and utils coverage ≥ 85%); the i18n test
  checks the new keys exist in both locales.
- The redirect target `/queue` has no route until the waiting room ticket (FR-06-W1) lands; until then a real
  `admission-invalid` lands on the 404 page. In mock mode the fallback token keeps `/order` usable;
  `?mock=admission_invalid` exercises the redirect.
- The admission store is in memory only, so a refresh on `/order` sends the buyer to the waiting room. Resuming is
  NFR-02-W1 / FR-10-W1.
- Deferred: price and availability (FR-12-W1), steppers and `min(maxTicketsPerOrder, reservedUnits)` (FR-13-W1),
  summary and hold (FR-14-W1), NIK (FR-15-W1), countdown and time's-up (FR-17/18-W1), login sheet on 401 (NFR-07-W2).
