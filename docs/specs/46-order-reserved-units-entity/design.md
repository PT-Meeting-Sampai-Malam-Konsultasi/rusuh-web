# Design Document

## Overview

A rename, no new behaviour. `openapi.yaml` (`getCategories`, lines 139–149) requires `reservedUnits`; the web has
`maxTickets` since spec 12. The field is renamed end to end for `getCategories` only: entity → use-case result → MSW
mock → test fixtures. The order controller does not read the field today (spec 13 deferred the limit to FR-13-W1), so no
controller source changes, only its test fixture.

**No service work.** `BookingServiceInterface.getCategories(eventId, admissionToken)` returns
`HttpResponse<GetCategoriesResponse>` and does no transformation (core-service rule), so it follows the entity type
without edits. `AccountServiceInterface.getMe()` (`GET /me`, `User`) already exists for the "Saya sendiri" prefill
(spec 48). No new `AwilixRegistry` key, no registration change.

**Out of scope, follow-up:** the queue `Admission` entity (`src/core/entities/queue/queue.entity.ts` line 66) also uses
`maxTickets` where `openapi.yaml` `Admission` (line 1556) requires `reservedUnits`. `claimTurn` lives in the queue
feature; changing it here would mix scopes. Raise it as a separate queue sub-issue (the next free `FR-08-W*` or
`FR-13-W*` number on the board; do not invent one).

## Architecture

```
GET /events/{eventId}/categories (getCategories)            openapi.yaml: reservedUnits (1–3, ADR-0004)
  └─ bookingService.getCategories        → HttpResponse<GetCategoriesResponse>   (unchanged source)
       └─ getOrderCategoriesUseCase.execute → OrderCategoriesResult { kind: 'ok', …, reservedUnits }
            └─ orderController (spec 48 reads it through orderTicketSelectionUseCase.orderLimit, spec 47)
MSW: bookingHandlers → HttpResponse.json<GetCategoriesResponse>({ …, reservedUnits: 3 })
```

## Components and Interfaces

```ts
// src/core/entities/booking/booking.entity.ts (changed field only)
export interface GetCategoriesResponse {
  eventId: string;
  categories: Category[];
  /** Policy maximum per order (N-1). */
  maxTicketsPerOrder: number;
  /** Units reserved for this admission, 1–3 (ADR-0004); the order may not exceed it. */
  reservedUnits: number;
  /** Fixed amount per order, not per ticket (ADR-0010); shown as "Biaya layanan". */
  adminFee: Money;
  /** End of the 5-minute order window. */
  expiresAt: string;
  serverNow: string;
}
```

```ts
// src/core/use_case/booking/get-order-categories.use-case.ts (changed lines only)
export type OrderCategoriesResult =
  | {
      kind: 'ok';
      categories: Category[];
      maxTicketsPerOrder: number;
      /** Units reserved for this admission, 1–3 (ADR-0004). */
      reservedUnits: number;
      adminFee: Money;
      expiresAt: string;
      serverNow: string;
    }
  | { kind: 'admission-invalid' };

// inside execute, the ok branch:
//   reservedUnits: data.reservedUnits,
```

`GetOrderCategoriesUseCaseInterface`, `GetOrderCategoriesInput` and `GetOrderCategoriesUseCase` keep their signatures;
`AwilixRegistry.getOrderCategoriesUseCase: GetOrderCategoriesUseCaseInterface` compiles unchanged.

```ts
// src/infrastructure/mocks/handlers/booking.handlers.ts (changed line only)
return HttpResponse.json<GetCategoriesResponse>({
  eventId,
  categories,
  maxTicketsPerOrder: 3,
  reservedUnits: 3,
  adminFee: { amount: 10000, currency: 'IDR' },
  expiresAt: new Date(today.getTime() + ORDER_WINDOW_MS).toISOString(),
  serverNow: today.toISOString(),
});
```

## Data Models

| Layer                          | Before               | After                   |
| ------------------------------ | -------------------- | ----------------------- |
| `GetCategoriesResponse`        | `maxTickets: number` | `reservedUnits: number` |
| `OrderCategoriesResult` (`ok`) | `maxTickets: number` | `reservedUnits: number` |
| MSW `getCategories` body       | `maxTickets: 3`      | `reservedUnits: 3`      |
| Queue `Admission`              | `maxTickets: number` | unchanged (follow-up)   |

Files touched: `booking.entity.ts`, `get-order-categories.use-case.ts`, its test, `booking.handlers.ts`,
`mocks/__tests__/booking.handlers.test.ts`, `controllers/__tests__/order.controller.test.ts` (fixture only).

## Layer Constraints

From `.claude/rules/core-service.md`:

- Types only: request (`…Request`), response (`…Response`), domain models (plain names). No classes, no runtime code.
- Match the API contract in `../rusuh-documentation/api/openapi.yaml`. Generated types (e.g. `openapi-typescript`
  into `src/core/entities/generated/`) are allowed; domain entities may re-export or narrow them.
- Optional fields (`?`) only where the contract makes them optional.
- No transformation (that is a use case), no try/catch: let `HttpError` propagate.
- ❌ Inline types instead of `@core/entities/`

From `.claude/rules/core-use-case.md`:

- Depend only on services, config and other use cases from `AwilixRegistry`
- Zero React, zero Next.js, zero hooks, zero browser APIs
- Catch only the specific `HttpError` codes you classify; re-throw everything else for the controller.
- Plain object mocks, every business branch, and one test that infrastructure errors propagate.
- Coverage threshold 85%.

From `.claude/skills/add-feature/reference/add-entity.md`:

- Types only, no runtime code, zero imports except `import type` from other entities.
- Optional (`?`) only where the contract says so; nullable as `T | null` where the contract says `null`.

## Correctness Properties

- Property 1: `GetCategoriesResponse` has a required `reservedUnits: number` and no `maxTickets` key; `tsc --noEmit`
  passes. **Validates: Requirements 1**
- Property 2: for any 200 response `data`, the `ok` result has `reservedUnits === data.reservedUnits` and the result
  has no `maxTickets` property; the response object is not mutated. **Validates: Requirements 2**
- Property 3: the use case's non-`ok` branches behave exactly as before (same tests pass with only the fixture rename).
  **Validates: Requirements 2**
- Property 4: the MSW categories body has `reservedUnits: 3` and no `maxTickets`; outside the queue `Admission` files no
  source or test under `src/` mentions `maxTickets`. **Validates: Requirements 3**
- Property 5: no file under `src/core/entities/queue/`, `src/core/use_case/queue/` or
  `src/infrastructure/mocks/handlers/queue.handlers.ts` changes. **Validates: Requirements 3**

## Error Handling

No new code paths. `getCategories` errors keep the handling of specs 13–14:

| Status / code                                                                           | Use case                        | User sees (order page)                           |
| --------------------------------------------------------------------------------------- | ------------------------------- | ------------------------------------------------ |
| no token / 403 `ADMISSION_INVALID`                                                      | `{ kind: 'admission-invalid' }` | Redirect to `/queue?event=<id>`                  |
| 401 `UNAUTHORIZED`                                                                      | re-thrown                       | Inline error `error_unauthorized` + "Coba lagi"  |
| `NETWORK_ERROR`, `TIMEOUT`, `INTERNAL_ERROR`, `RATE_LIMITED`, `UNKNOWN_ERROR`, unmapped | re-thrown                       | Inline error from `ERROR_CODE_MAP` + "Coba lagi" |

A server that still sends `maxTickets` (or omits `reservedUnits`) yields `reservedUnits: undefined` at runtime; spec 47's
`orderLimit` ignores a non-positive-integer value and falls back to `maxTicketsPerOrder`, and `createBooking` rejects an
over-reservation order with `QUANTITY_OVER_RESERVATION` (FR-14-W1), so nothing oversells.

## Testing Strategy

- `src/core/use_case/booking/__tests__/get-order-categories.use-case.test.ts`: fixture `reservedUnits: 2` (with
  `maxTicketsPerOrder: 4`, so a swap of the two would fail), expectation `reservedUnits: 2`, plus
  `expect(result).not.toHaveProperty('maxTickets')`.
- `src/infrastructure/mocks/__tests__/booking.handlers.test.ts`: the body has `reservedUnits: 3` and no `maxTickets`.
- `src/controllers/__tests__/order.controller.test.ts`: `okResult.reservedUnits: 3`; no assertion changes.
- Gate: `npm run typecheck && npm run lint && npx vitest --run`; then `grep -rn "maxTickets\b" src` lists only the queue
  `Admission` files.
