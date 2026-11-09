# Design Document

## Overview

`GetOrderCategoriesUseCase.execute({ eventId, admissionToken })` guards the order page on the admission token and
classifies the API's admission rejection into a business outcome. It earns a use case (core-use-case rule, "branching
on status" / "Classifying expected API errors into business outcomes"): a missing token short-circuits the call, and
`ADMISSION_INVALID` is an expected result, not an error. `getEvent` has no business logic and gets no use case (see
spec 14).

## Architecture

```
OrderController ── useQueryTanstack(queryFn) ──► getOrderCategoriesUseCase.execute({ eventId, admissionToken })
                     admissionToken = admissionStore.get(eventId)   (read by the controller, at fetch time)
                                                  │
                         token null/'' ──────────►│ { kind: 'admission-invalid' }   (no request)
                                                  ▼
                                   bookingService.getCategories(eventId, token)
                                     200 ──► { kind: 'ok', … }
                                     403 ADMISSION_INVALID ──► { kind: 'admission-invalid' }
                                     anything else ──► re-throw (controller error state)
```

Use cases may depend only on services, config and other use cases, so the token comes in through the input; the
controller reads `admissionStore` (decided with the user for FR-11-W1).

## Components and Interfaces

```ts
// src/core/use_case/booking/get-order-categories.use-case.ts
import type { Category } from '@core/entities/booking/booking.entity';
import type { Money } from '@core/entities/catalog/catalog.entity';
import type { HttpError } from '@core/protocols/http.protocol';
import type { AwilixRegistry } from '@infrastructure/di/registry.types';

export interface GetOrderCategoriesInput {
  eventId: string;
  /** From the admission store; null when the buyer has no live turn on this tab. */
  admissionToken: string | null;
}

export interface GetOrderCategoriesUseCaseInterface {
  execute: (input: GetOrderCategoriesInput) => Promise<OrderCategoriesResult>;
}

export const GetOrderCategoriesUseCase = ({
  bookingService,
}: Pick<AwilixRegistry, 'bookingService'>): GetOrderCategoriesUseCaseInterface;
```

```ts
// src/infrastructure/di/registry.types.ts (addition, under "use cases")
import type { GetOrderCategoriesUseCaseInterface } from '@core/use_case/booking/get-order-categories.use-case';
getOrderCategoriesUseCase: GetOrderCategoriesUseCaseInterface;

// src/infrastructure/di/services.registry.ts (addition)
getOrderCategoriesUseCase: asFunction(GetOrderCategoriesUseCase).singleton(),
```

The rejection is a plain `HttpError` object (the HTTP adapter rejects with `toHttpError(...)`, not an `Error`), so the
check is a narrow structural guard in the use-case file:

```ts
const isAdmissionInvalid = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as HttpError).code === 'ADMISSION_INVALID';
```

## Data Models

```ts
export type OrderCategoriesResult =
  | {
      kind: 'ok';
      categories: Category[];
      maxTicketsPerOrder: number;
      reservedUnits: number;
      adminFee: Money;
      /** End of the 5-minute order window (ADR-0005); the timer (FR-17-W1) uses expiresAt − serverNow. */
      expiresAt: string;
      serverNow: string;
    }
  | { kind: 'admission-invalid' };
```

`eventId` from the response is dropped: the controller already keys everything by the `event` search param.

## Layer Constraints

From `.claude/rules/core-use-case.md`:

- `src/core/use_case/{domain}/{action}.use-case.ts`
- Depend only on services, config and other use cases from `AwilixRegistry`
- Zero React, zero Next.js, zero hooks, zero browser APIs
- Classifying expected API errors into business outcomes
- React state, TanStack Query, navigation, analytics, `t()`, user-facing strings, loading overlays, popups
  (does not belong)
- Return **typed discriminated unions**; never throw for an expected business outcome
- Catch only the specific `HttpError` codes you classify; re-throw everything else for the controller.
- Return codes, never sentences: the controller maps codes to translation keys.
- Stateless; registered as `asFunction(UseCase).singleton()`; interface added to `AwilixRegistry`.
- `src/core/use_case/{domain}/__tests__/{action}.use-case.test.ts`
- Plain object mocks, every business branch, and one test that infrastructure errors propagate.
- Coverage threshold 85%.
- ❌ Catching all errors
- ❌ Module-level mutable state
- ❌ A use case that only forwards one service call
- ❌ Throwing for an expected outcome

## Correctness Properties

- Property 1: `admissionToken` `null` or `''` → result `admission-invalid` and `bookingService.getCategories` is called
  zero times. **Validates: Requirements 1**
- Property 2: a rejection with `code: 'ADMISSION_INVALID'` → `admission-invalid`; a rejection with `status: 403` and any
  other code is re-thrown. **Validates: Requirements 1, 2**
- Property 3: for a 200 response, every field of the `ok` result equals the matching response field (same
  `categories` order, no mutation). **Validates: Requirements 2**
- Property 4: every non-classified rejection reaches the caller as the same value (`toBe`). **Validates: Requirements 2**
- Property 5: the use case holds no state between calls; two calls with different events are independent.
  **Validates: Requirements 2**

## Error Handling

| Input / response                                                                                      | Result                                                                       |
| ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| token `null` or `''`                                                                                  | `{ kind: 'admission-invalid' }`, no request                                  |
| 200                                                                                                   | `{ kind: 'ok', … }`                                                          |
| 403 `ADMISSION_INVALID`                                                                               | `{ kind: 'admission-invalid' }`                                              |
| 401 `UNAUTHORIZED`                                                                                    | re-thrown (controller: generic error state until the login sheet, NFR-07-W2) |
| `NETWORK_ERROR`, `TIMEOUT`, `INTERNAL_ERROR`, `RATE_LIMITED`, `UNKNOWN_ERROR`, `HTTP_<status>`, other | re-thrown                                                                    |

## Testing Strategy

`src/core/use_case/booking/__tests__/get-order-categories.use-case.test.ts` with a plain `bookingService` mock
(`vi.fn()`):

- null token and empty token: `admission-invalid`, service not called
- 200: `ok` with every field; input response not mutated; service called with `(eventId, token)`
- `ADMISSION_INVALID`: `admission-invalid`
- 403 with another code, `UNAUTHORIZED`, `NETWORK_ERROR`, a thrown `Error`: re-thrown unchanged
