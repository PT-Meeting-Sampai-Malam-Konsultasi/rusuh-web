# Implementation Plan: Order categories use case

## Overview

`GetOrderCategoriesUseCase`: short-circuit on a missing admission token, classify `ADMISSION_INVALID`, pass the order
data through, re-throw everything else; registration and tests. Writer: use-case-writer. Depends on spec 12
(`bookingService`, booking entities).

## Tasks

- [x] 1. Write `src/core/use_case/booking/get-order-categories.use-case.ts` (`GetOrderCategoriesInput`, `OrderCategoriesResult`, `GetOrderCategoriesUseCaseInterface`, `GetOrderCategoriesUseCase`) [Requirement 1, Requirement 2]
- [x] 2. Write `src/core/use_case/booking/__tests__/get-order-categories.use-case.test.ts` covering every branch in the Testing Strategy [Requirement 1, Requirement 2]
- [x] 3. Register `getOrderCategoriesUseCase` in `services.registry.ts`; add it to `AwilixRegistry` and to `KEYS` in `registry.test.ts` [Requirement 2]
- [x] 4. Run the gate check [ALL]

## Task Dependency Graph

```json
{ "waves": [[1], [2, 3], [4]] }
```

## Notes

- Gate: `npm run typecheck && npm run lint && npx vitest --run` (coverage ≥ 85% for the use case).
- No expiry check here (`expiresAt <= serverNow`): the time's-up sheet is FR-17-W1 / FR-18-W1. The server rejects an
  expired token with `ADMISSION_INVALID`, which this use case already classifies.
- No `min(maxTicketsPerOrder, reservedUnits)` here: the order limit belongs to the stepper use case of FR-13-W1.
