# Design Document

## Overview

`OrderTicketSelectionUseCase` (spec 47) is extended, not replaced. Two additions:

1. **Category caps.** Each selectable category now carries `availability` and the optional `available` snapshot count.
   A sold-out category has cap 0; a valid `available` caps the category; anything else adds no cap. `summarize` and
   `increment` apply the cap next to the order limit.
2. **Limit flags.** `TicketSelection` gains `limitReached` and `limitBelowMax`, so the controller (spec 51) can show the
   HiFi limit line ("3/3 Batas 3 tiket tercapai…") or the reservation variant without a rule in its body.

The client checks are a convenience, not the guarantee: the hold re-checks the reservation (`QUANTITY_OVER_RESERVATION`)
and the stock (`CATEGORY_SOLD_OUT`) in one PostgreSQL transaction (`openapi.yaml` `createBooking`, customer journey
"stock per category (id order)"). That is why an invalid `available` or an unknown `availability` is ignored rather than
blocking a category that may still be on sale.

**Why `limitBelowMax` in the use case (not in the brief).** The controller rule allows only `import type` from
`@core/...`, so the controller cannot compare against `ORDER_MAX_TICKETS` at runtime, and a literal `3` in the controller
would duplicate a contract constant. The boolean keeps the decision ("is this limit the smaller reservation?") in core.

**Check order** for a refused increment: `UNKNOWN_CATEGORY` → `SOLD_OUT` → `LIMIT_REACHED` → `STOCK_REACHED`. Reasons:
an unknown id is a programming error and short-circuits; sold out is a property of the category regardless of the order;
the order limit comes before the stock cap because it is the one the page explains (the limit line), so a test or a
future message gets the explained reason when both apply.

## Architecture

```
orderController (spec 51)
  ├─ selectable = ok.categories                          Category[] (getCategories, spec 46) — already carries availability/available
  ├─ limit      = orderTicketSelectionUseCase.orderLimit(ok)                    unchanged
  ├─ selection  = orderTicketSelectionUseCase.summarize(selectable, quantities, limit)
  │                 → lines (canIncrement = total < limit && quantity < cap), slots, total,
  │                   limitReached, limitBelowMax                                ← new
  ├─ increment  → increment(selectable, quantities, id, limit)
  │                 → changed | unchanged UNKNOWN_CATEGORY | SOLD_OUT | LIMIT_REACHED | STOCK_REACHED
  └─ decrement  → decrement(selectable, quantities, id)                         unchanged (allowed on sold out)
```

No API operation. Inputs come from `getCategories` (`categories[].availability`, `categories[].available`,
`maxTicketsPerOrder`, `reservedUnits`), fetched by the controller.

## Components and Interfaces

```ts
// src/core/use_case/booking/order-ticket-selection.use-case.ts (changes only; everything else as in spec 47)
import type { Category } from '@core/entities/booking/booking.entity';

export const ORDER_MAX_TICKETS = 3; // unchanged

/** Widened: the stock caps need availability and the optional snapshot count. */
export type SelectableCategory = Pick<Category, 'categoryId' | 'name' | 'availability' | 'available'>;

export interface TicketSelection {
  total: number;
  /** One per category, server order. canIncrement reflects the order limit and the category cap. */
  lines: TicketLine[];
  /** Category server order, then ordinal. */
  slots: TicketSlot[];
  /** limit > 0 && total >= limit: every "+" is off because of the order limit. */
  limitReached: boolean;
  /** limit < ORDER_MAX_TICKETS: the limit is a smaller reservation (ADR-0004) or a lower policy value. */
  limitBelowMax: boolean;
}

export type ChangeQuantityResult =
  | { kind: 'changed'; quantities: TicketQuantities }
  | {
      kind: 'unchanged';
      reason: 'LIMIT_REACHED' | 'NONE_TO_REMOVE' | 'UNKNOWN_CATEGORY' | 'SOLD_OUT' | 'STOCK_REACHED';
    };

// OrderTicketSelectionUseCaseInterface: signatures unchanged (they take readonly SelectableCategory[]).
```

Private helpers (module scope, pure, not exported):

```ts
/** Sold out → 0; valid snapshot count → that count; otherwise no cap. */
const capOf = (category: SelectableCategory): number => {
  if (category.availability === 'sold_out') return 0;
  return isValidCount(category.available) ? category.available : Number.POSITIVE_INFINITY;
};
```

Behaviour:

- `summarize(categories, quantities, limit)`: as spec 47, plus per line
  `canIncrement = total < limit && quantity < capOf(category)`; plus `limitReached = limit > 0 && total >= limit` and
  `limitBelowMax = limit < ORDER_MAX_TICKETS`.
- `increment(categories, quantities, id, limit)`: `category = categories.find(id)`; none → `UNKNOWN_CATEGORY`;
  `availability === 'sold_out'` → `SOLD_OUT`; `total >= limit` → `LIMIT_REACHED`; `quantity >= capOf(category)` →
  `STOCK_REACHED`; else `changed` with `+1` in a new object.
- `decrement`: unchanged (unknown → `UNKNOWN_CATEGORY`; 0 → `NONE_TO_REMOVE`; else `−1`). It does not read caps, so a
  sold-out or stale pick can always be removed.
- `orderLimit`, `reconcileHolders`, `canChooseSelf`, `setHolderType`: unchanged.

Compile check against the existing code:

- The controller passes `ok.categories` (`Category[]`, where `availability` is required and `available?: number`) as
  `readonly SelectableCategory[]`; the widened `Pick` is still a supertype of `Category`, so no controller change is
  needed to pass the new fields. `NO_CATEGORIES: readonly []` still fits.
- `AwilixRegistry.orderTicketSelectionUseCase: OrderTicketSelectionUseCaseInterface` is unchanged; the registration
  `asFunction(OrderTicketSelectionUseCase).singleton()` in `services.registry.ts` is unchanged.
- The controller test's spy fake returns `{ kind: 'unchanged' as const, reason: 'LIMIT_REACHED' as const }`, which is
  still assignable to the widened union.
- The spec 47 test fixtures (`{ categoryId, name }`) no longer satisfy `SelectableCategory` (`availability` is
  required); they gain `availability: 'available'` (task 3).

DI: no change. No new `AwilixRegistry` key; `KEYS` in `src/infrastructure/di/__tests__/registry.test.ts` unchanged.

## Data Models

Example: limit 3; categories (server order):

| id  | name         | availability  | available | cap |
| --- | ------------ | ------------- | --------- | --- |
| A   | Festival A   | `sold_out`    | 0         | 0   |
| B   | Festival B   | `available`   | —         | ∞   |
| C   | Tribun Bawah | `almost_gone` | 1         | 1   |
| D   | Tribun Atas  | `available`   | 2.5       | ∞   |

| Quantities         | Lines (`qty` / `+` / `−`)          | total | limitReached | Increment reasons                                    |
| ------------------ | ---------------------------------- | ----- | ------------ | ---------------------------------------------------- |
| `{}`               | A 0/✗/✗, B 0/✓/✗, C 0/✓/✗, D 0/✓/✗ | 0     | false        | A `SOLD_OUT`                                         |
| `{ C: 1 }`         | A 0/✗/✗, B 0/✓/✗, C 1/✗/✓, D 0/✓/✗ | 1     | false        | A `SOLD_OUT`, C `STOCK_REACHED`                      |
| `{ B: 2, C: 1 }`   | A 0/✗/✗, B 2/✗/✓, C 1/✗/✓, D 0/✗/✗ | 3     | true         | A `SOLD_OUT`, B/D `LIMIT_REACHED`, C `LIMIT_REACHED` |
| `{ A: 1 }` (stale) | A 1/✗/✓, B 0/✓/✗, C 0/✓/✗, D 0/✓/✗ | 1     | false        | A `SOLD_OUT`; decrement A → `changed` `{ A: 0 }`     |

Limit flags:

| maxTicketsPerOrder | reservedUnits | limit | total | limitReached | limitBelowMax |
| ------------------ | ------------- | ----- | ----- | ------------ | ------------- |
| 3                  | 3             | 3     | 2     | false        | false         |
| 3                  | 3             | 3     | 3     | true         | false         |
| 3                  | 2             | 2     | 2     | true         | true          |
| 3                  | 1             | 1     | 1     | true         | true          |
| 3                  | 0             | 0     | 0     | false        | true          |

## Layer Constraints

From `.claude/rules/core-use-case.md`:

- `src/core/use_case/{domain}/{action}.use-case.ts`
- Depend only on services, config and other use cases from `AwilixRegistry`
- Zero React, zero Next.js, zero hooks, zero browser APIs
- Business rules and validation, for example:
  - order limits: total tickets ≤ `min(maxTicketsPerOrder, reservedUnits)`; one NIK per ticket, all different
- React state, TanStack Query, navigation, analytics, `t()`, user-facing strings, loading overlays, popups
- Return **typed discriminated unions**; never throw for an expected business outcome:
- Return codes, never sentences: the controller maps codes to translation keys.
- Stateless; registered as `asFunction(UseCase).singleton()`; interface added to `AwilixRegistry`.
- `src/core/use_case/{domain}/__tests__/{action}.use-case.test.ts`
- Plain object mocks, every business branch, and one test that infrastructure errors propagate.
- Coverage threshold 85%.
- ❌ React or Next.js imports
- ❌ User-facing strings
- ❌ Navigation, analytics or translation calls
- ❌ Module-level mutable state
- ❌ Throwing for an expected outcome

From `.claude/rules/scaffold.md`:

- Services and use cases: `asFunction(Factory).singleton()`
- `AwilixRegistry` (`src/infrastructure/di/registry.types.ts`) is the single source of truth. **Every key in it has a
  `container.register()` call** in one of the three registries or a `di/controllers/` file. Awilix resolves at
  runtime, so TypeScript will not catch a missing registration. Count keys vs registrations after every change.

From `.claude/rules/core-service.md` (entities, read not changed):

- Match the API contract in `../rusuh-documentation/api/openapi.yaml`.
- Optional fields (`?`) only where the contract makes them optional.

Note on "one test that infrastructure errors propagate": this use case calls no service, so there is no infrastructure
error to propagate; the existing comment in the test file stays.

## Correctness Properties

- Property 1: for every category with `availability === 'sold_out'`, `summarize(...).lines[i].canIncrement` is false and
  `increment` returns `unchanged` `SOLD_OUT`, for any quantities and any limit. **Validates: Requirements 1**
- Property 2: `availability` `'almost_gone'`, `'available'` or an out-of-enum string (`'paused'`) with no valid
  `available` never blocks: `canIncrement === total < limit`. **Validates: Requirements 1, 2**
- Property 3: with a valid `available = n`, a sequence of increments never makes that category's quantity exceed `n`;
  the call at quantity `n` (with `total < limit`) returns `STOCK_REACHED`. `available` of `undefined`, `NaN`, `-1`,
  `1.5`, `'2'` adds no cap. **Validates: Requirements 2**
- Property 4: the first matching reason wins in the order `UNKNOWN_CATEGORY` → `SOLD_OUT` → `LIMIT_REACHED` →
  `STOCK_REACHED`; e.g. a sold-out category at the limit returns `SOLD_OUT`; a capped category at its cap and at the
  limit returns `LIMIT_REACHED`. **Validates: Requirements 3**
- Property 5: for every known category, `lines[i].canIncrement === (increment(...).kind === 'changed')`.
  **Validates: Requirements 3**
- Property 6: `decrement` on a sold-out or stale pick (quantity > cap) returns `changed` with quantity − 1;
  `canDecrement === quantity > 0` for every line; `summarize` never changes the quantities it reads.
  **Validates: Requirements 4**
- Property 7: `limitReached === (limit > 0 && total >= limit)` and `limitBelowMax === (limit < 3)` for every row of the
  Data Models limit-flags table; a category cap at its maximum alone never sets `limitReached`.
  **Validates: Requirements 5**
- Property 8: inputs are never mutated (frozen fixtures); the spec 47 properties still hold (slots, reconciliation,
  self rule); the module still imports only `import type` from `@core/entities`. **Validates: Requirements 3, 6**

## Error Handling

No API call and no `HttpError`. Refused changes are values:

| Call        | Reason code        | Controller behaviour (spec 51)                                               |
| ----------- | ------------------ | ---------------------------------------------------------------------------- |
| `increment` | `SOLD_OUT`         | No change; "+" is already disabled; the row shows "Habis" / "Sold out"       |
| `increment` | `LIMIT_REACHED`    | No change; "+" disabled; the limit line explains it (`limitReached`)         |
| `increment` | `STOCK_REACHED`    | No change; "+" disabled; the row's availability label ("Hampir habis") stays |
| `increment` | `UNKNOWN_CATEGORY` | No change                                                                    |
| `decrement` | `NONE_TO_REMOVE`   | No change; "−" already disabled                                              |
| `decrement` | `UNKNOWN_CATEGORY` | No change                                                                    |

Server codes this rule anticipates but does not handle (the hold is out of scope): `QUANTITY_OVER_RESERVATION`,
`CATEGORY_SOLD_OUT` (with `categoryId`), `NIK_SEAT_TAKEN`, `ACCOUNT_HAS_ACTIVE_BOOKING` from `createBooking`.

## Testing Strategy

`src/core/use_case/booking/__tests__/order-ticket-selection.use-case.test.ts`, plain objects, `Object.freeze` on inputs:

- Update the shared fixtures with `availability: 'available'` (no `available`) so every spec 47 test keeps its meaning.
- `summarize`: the Data Models example rows (`it.each`); `limitReached` / `limitBelowMax` table; out-of-enum
  availability does not block; invalid `available` values (`undefined`, `NaN`, `-1`, `1.5`, `'2' as never`) add no cap;
  `available: 0` with `availability: 'available'` blocks with no `+`.
- `increment`: each new reason (`SOLD_OUT`, `STOCK_REACHED`) and the order table of Property 4; Property 5 checked over
  the Data Models example for every category.
- `decrement`: a sold-out stale pick and a pick above `available` both decrement.
- Scripted sequence (seeded list, no `Math.random`) over the example categories keeps every quantity ≤ its cap and the
  total ≤ the limit.
- Gate: `npm run typecheck && npm run lint && npx vitest --run`; coverage of the file ≥ 85%.
