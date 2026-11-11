# Design Document

## Overview

`OrderTicketSelectionUseCase` holds the FR-13 order rules as pure, synchronous functions: the order limit, stepper
changes, slots derived from quantities, holder reconciliation and the one-"Saya sendiri" rule. The controller (spec 48)
keeps the state (`useState` for quantities, React Hook Form for holders) and calls these functions to change it.

**Use case, not `src/utils/` helpers, and DI-registered rather than imported.** Decision against the rule table and the
existing code:

| Option                                                                                                    | Decision                                                                                                                                                                                                                                                                                                                                             |
| --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pure helpers in `src/utils/`                                                                              | Rejected. `src/utils/` is formatting; these are business rules, and the core-use-case rule lists them by name: "order limits: total tickets ≤ `min(maxTicketsPerOrder, reservedUnits)`" and "'Myself' may be used on one ticket only (1 NIK = 1 seat per event)". The controller rule: "Business rules, validation, data transformation → use case". |
| Pure functions in `src/core/use_case/` imported at runtime (precedent: `queue/wait-estimate.ts`, spec 36) | Rejected for new code. The controller rule's allowed imports list only `import type { ... } from '@core/...'`; the queue controller's runtime import is an exception, not a pattern to copy.                                                                                                                                                         |
| **Stateless factory registered in DI**                                                                    | **Chosen.** Matches "Stateless; registered as `asFunction(UseCase).singleton()`; interface added to `AwilixRegistry`", keeps the controller's core imports type-only, and lets the controller test pass a fake.                                                                                                                                      |

The use case has no async step and no service dependency; it is still a use case under the table's "business
validation" row. It ships in the shared `services.registry.ts` bundle (pure TypeScript, well under 1 KB gzip, no
library), which is within the performance rule's 5 KB budget.

**"Saya sendiri": block, not move.** Choosing "Saya sendiri" on a second ticket is refused while another ticket is
`self`; the option is disabled there. Reasons: the Figma Booking and Profile-without-NIK frames draw "Saya sendiri"
greyed on Tiket 2 and Tiket 3 while Tiket 1 is "Saya sendiri" (`holders-booking-desktop.png`,
`holders-profile-without-nik-desktop.png`), which is the disabled state; and a silent move would clear a name the buyer
can still see on another ticket. The refused call returns `{ kind: 'unchanged', reason: 'SELF_TAKEN' }` and is tested.

## Architecture

```
orderController (spec 48)
  ├─ limit      = orderTicketSelectionUseCase.orderLimit({ maxTicketsPerOrder, reservedUnits })   (from getCategories, spec 46)
  ├─ selection  = orderTicketSelectionUseCase.summarize(categories, quantities, limit)            → lines + slots + total
  ├─ increment  → orderTicketSelectionUseCase.increment(categories, quantities, id, limit)        → changed | unchanged
  ├─ decrement  → orderTicketSelectionUseCase.decrement(categories, quantities, id)
  │                 └─ on changed: reconcileHolders(currentHolders, summarize(…, next, limit).slots) → form value
  └─ choose     → orderTicketSelectionUseCase.setHolderType(holders, slotKey, type, profileName)  → changed | unchanged
```

No API operation. Inputs come from `getCategories` (`categories`, `maxTicketsPerOrder`, `reservedUnits`) and `getMe`
(`fullName`), both fetched by the controller.

## Components and Interfaces

```ts
// src/core/use_case/booking/order-ticket-selection.use-case.ts
import type { Category } from '@core/entities/booking/booking.entity';

/** `createBooking.tickets.maxItems` (N-1, ADR-0007): never more than 3 tickets per order. */
export const ORDER_MAX_TICKETS = 3;

export type SelectableCategory = Pick<Category, 'categoryId' | 'name'>;

/** Tickets per categoryId; a missing key is 0. */
export type TicketQuantities = Readonly<Record<string, number>>;

export interface OrderLimitInput {
  maxTicketsPerOrder: number;
  reservedUnits: number;
}

export interface TicketLine {
  categoryId: string;
  quantity: number;
  canIncrement: boolean;
  canDecrement: boolean;
}

export interface TicketSlot {
  /** `${categoryId}-${ordinal}`: stable while the slot exists. */
  key: string;
  categoryId: string;
  categoryName: string;
  /** 1-based within the category. */
  ordinal: number;
  /** 1-based over the order: the n in "Tiket n". */
  index: number;
}

export interface TicketSelection {
  total: number;
  /** One per category, server order. */
  lines: TicketLine[];
  /** Category server order, then ordinal. */
  slots: TicketSlot[];
}

export type HolderType = 'self' | 'other';

export interface HolderEntry {
  slotKey: string;
  holderType: HolderType;
  fullName: string;
  /** Digits only; never logged. */
  nik: string;
}

export type ChangeQuantityResult =
  | { kind: 'changed'; quantities: TicketQuantities }
  | { kind: 'unchanged'; reason: 'LIMIT_REACHED' | 'NONE_TO_REMOVE' | 'UNKNOWN_CATEGORY' };

export type SetHolderTypeResult =
  | { kind: 'changed'; holders: HolderEntry[] }
  | { kind: 'unchanged'; reason: 'SELF_TAKEN' | 'NO_PROFILE_NAME' | 'SAME_TYPE' | 'UNKNOWN_SLOT' };

export interface OrderTicketSelectionUseCaseInterface {
  orderLimit: (input: OrderLimitInput) => number;
  summarize: (
    categories: readonly SelectableCategory[],
    quantities: TicketQuantities,
    limit: number,
  ) => TicketSelection;
  increment: (
    categories: readonly SelectableCategory[],
    quantities: TicketQuantities,
    categoryId: string,
    limit: number,
  ) => ChangeQuantityResult;
  decrement: (
    categories: readonly SelectableCategory[],
    quantities: TicketQuantities,
    categoryId: string,
  ) => ChangeQuantityResult;
  reconcileHolders: (holders: readonly HolderEntry[], slots: readonly TicketSlot[]) => HolderEntry[];
  canChooseSelf: (holders: readonly HolderEntry[], slotKey: string) => boolean;
  setHolderType: (
    holders: readonly HolderEntry[],
    slotKey: string,
    holderType: HolderType,
    profileName: string,
  ) => SetHolderTypeResult;
}

/** No dependencies: pure order rules (FR-13, ADR-0004, ADR-0007). */
export const OrderTicketSelectionUseCase = (): OrderTicketSelectionUseCaseInterface => ({ … });
```

Behaviour:

- `orderLimit`: `valid = (n) => Number.isInteger(n) && n >= 0`; returns
  `Math.min(ORDER_MAX_TICKETS, ...[maxTicketsPerOrder, reservedUnits].filter(valid))`.
- `summarize`: `total = Σ quantities[c.categoryId] ?? 0` over `categories`; each line
  `canIncrement = total < limit`, `canDecrement = quantity > 0`; slots built by iterating categories, then
  `ordinal = 1..quantity`, with a running `index`.
- `increment`: unknown id → `UNKNOWN_CATEGORY`; `total >= limit` → `LIMIT_REACHED`; else a new object with `+1`.
- `decrement`: unknown id → `UNKNOWN_CATEGORY`; quantity `0` → `NONE_TO_REMOVE`; else a new object with `−1` (the key is
  kept at `0` or removed; either way `summarize` reads 0).
- `reconcileHolders`: `slots.map((s) => byKey.get(s.key) ?? { slotKey: s.key, holderType: 'other', fullName: '', nik: '' })`.
- `canChooseSelf(holders, key)`: `!holders.some((h) => h.holderType === 'self' && h.slotKey !== key)`.
- `setHolderType`: unknown key → `UNKNOWN_SLOT`; same type → `SAME_TYPE`; `self` with `profileName.trim() === ''` →
  `NO_PROFILE_NAME`; `self` while another slot is `self` → `SELF_TAKEN`; else a new array where the target becomes
  `{ …, holderType: 'self', fullName: profileName.trim() }` or `{ …, holderType: 'other', fullName: '' }`; `nik` unchanged.

Slot key uniqueness: the ordinal after the last `-` is a positive integer, so `${categoryId}-${ordinal}` is unique for
any category ids, including ids that contain `-`.

DI:

```ts
// src/infrastructure/di/services.registry.ts
orderTicketSelectionUseCase: asFunction(OrderTicketSelectionUseCase).singleton(),

// src/infrastructure/di/registry.types.ts (use cases block)
import type { OrderTicketSelectionUseCaseInterface } from '@core/use_case/booking/order-ticket-selection.use-case';
orderTicketSelectionUseCase: OrderTicketSelectionUseCaseInterface;
```

`OrderTicketSelectionUseCase` takes no parameters; `asFunction` passes the cradle, which it ignores. Add
`orderTicketSelectionUseCase: true` to `KEYS` in `src/infrastructure/di/__tests__/registry.test.ts`.

## Data Models

Example: limit 3; categories `[A "Festival A", B "Festival B", C "Tribun Bawah", D "Tribun Atas"]`;
quantities `{ B: 2, D: 1 }`:

| index | key   | categoryName | ordinal |
| ----- | ----- | ------------ | ------- |
| 1     | `B-1` | Festival B   | 1       |
| 2     | `B-2` | Festival B   | 2       |
| 3     | `D-1` | Tribun Atas  | 1       |

Lines: A `0/+✓/−✗`, B `2/+✗/−✓`, C `0/+✗/−✗`, D `1/+✗/−✓`; total 3.

Decrement B → `{ B: 1, D: 1 }` → slots `B-1` (Tiket 1), `D-1` (Tiket 2): `B-1` and `D-1` keep their entries, `B-2` is
dropped. Increment A from `{ B: 1, D: 1 }` → slots `A-1` (Tiket 1, new, `other`), `B-1` (Tiket 2), `D-1` (Tiket 3).

Holder type transitions (profile name "Nadia Saputri"):

| From    | Request | Another slot `self`? | Result                                            |
| ------- | ------- | -------------------- | ------------------------------------------------- |
| `other` | `self`  | no                   | `changed`: `fullName` "Nadia Saputri", `nik` kept |
| `other` | `self`  | yes                  | `unchanged` `SELF_TAKEN`                          |
| `other` | `self`  | — (profile name '')  | `unchanged` `NO_PROFILE_NAME`                     |
| `self`  | `other` | —                    | `changed`: `fullName` '', `nik` kept              |
| same    | same    | —                    | `unchanged` `SAME_TYPE`                           |

A name typed in `other` and then overwritten by `self` is not restored on switching back; the buyer retypes it. Accepted:
keeping a hidden copy of a typed name adds state for a rare path.

## Layer Constraints

From `.claude/rules/core-use-case.md`:

- `src/core/use_case/{domain}/{action}.use-case.ts`
- Depend only on services, config and other use cases from `AwilixRegistry`
- Zero React, zero Next.js, zero hooks, zero browser APIs
- Business rules and validation, for example:
  - order limits: total tickets ≤ `min(maxTicketsPerOrder, reservedUnits)`; one NIK per ticket, all different
  - "Myself" may be used on one ticket only (1 NIK = 1 seat per event)
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

Note on "one test that infrastructure errors propagate": this use case calls no service, so there is no infrastructure
error to propagate; the test file states that in a comment instead of a vacuous test.

## Correctness Properties

- Property 1: `orderLimit` returns `min(3, valid inputs)`; e.g. `(3, 3) → 3`, `(3, 2) → 2`, `(3, 1) → 1`, `(4, 3) → 3`,
  `(3, undefined) → 3`, `(3, NaN) → 3`, `(3, -1) → 3`, `(3, 1.5) → 3`, `(3, 0) → 0`. **Validates: Requirements 1**
- Property 2: for any sequence of `increment` / `decrement` calls starting from `{}`, every quantity is ≥ 0 and the total
  is ≤ the limit. **Validates: Requirements 2**
- Property 3: `increment` at `total === limit` returns `LIMIT_REACHED`; `decrement` at 0 returns `NONE_TO_REMOVE`; an id
  outside `categories` returns `UNKNOWN_CATEGORY`; the input object is never mutated (frozen fixtures).
  **Validates: Requirements 2**
- Property 4: `summarize(...).lines` has one line per category in input order with `canIncrement === total < limit` and
  `canDecrement === quantity > 0`; quantities for unknown ids are ignored in `total` and `slots`.
  **Validates: Requirements 2, 3**
- Property 5: `slots.length === total`; `slots[i].index === i + 1`; slots are grouped by category in server order with
  ordinals `1..quantity`; keys are unique. **Validates: Requirements 3**
- Property 6: `reconcileHolders(h, slots)` returns `slots.length` entries with `result[i].slotKey === slots[i].key`;
  every entry whose key is in `slots` keeps its exact values; new entries are `other` with empty values.
  **Validates: Requirements 4**
- Property 7: removing a ticket from a later category leaves earlier categories' entries unchanged; adding to an earlier
  category leaves later entries' values unchanged. **Validates: Requirements 4**
- Property 8: after any sequence of `setHolderType` and `reconcileHolders` calls, at most one entry is `self`; removing
  the `self` slot leaves none, and `canChooseSelf` is then true for every slot. **Validates: Requirements 4, 5**
- Property 9: `setHolderType` follows the transition table above, never changes `nik`, and never returns `changed` with
  two `self` entries. **Validates: Requirements 5**
- Property 10: the module imports only `import type` from `@core/entities`; no `react`, `next`, `window`, `console`.
  **Validates: Requirements 6**

## Error Handling

No API call and no `HttpError`. Refused changes are values, not exceptions:

| Call            | Reason code                 | Controller behaviour (spec 48)                                     |
| --------------- | --------------------------- | ------------------------------------------------------------------ |
| `increment`     | `LIMIT_REACHED`             | No change; the + button is already disabled (`canIncrement` false) |
| `increment`     | `UNKNOWN_CATEGORY`          | No change                                                          |
| `decrement`     | `NONE_TO_REMOVE`            | No change; the − button is already disabled                        |
| `decrement`     | `UNKNOWN_CATEGORY`          | No change                                                          |
| `setHolderType` | `SELF_TAKEN`                | No change; "Saya sendiri" is already disabled on that slot         |
| `setHolderType` | `NO_PROFILE_NAME`           | No change; the choice is hidden when the profile has no name       |
| `setHolderType` | `SAME_TYPE`, `UNKNOWN_SLOT` | No change                                                          |

None reaches the user as a message in this ticket; the limit line is FR-14-W1.

## Testing Strategy

`src/core/use_case/booking/__tests__/order-ticket-selection.use-case.test.ts`, plain objects, `Object.freeze` on inputs:

- `orderLimit`: the Property 1 table (`it.each`).
- `summarize`: empty quantities; the Data Models example (lines, total, slots, keys, indexes); unknown id ignored; a
  category id containing `-` (`'cat-vip'`) gives unique keys.
- `increment` / `decrement`: each `changed` and each `unchanged` reason; inputs not mutated; a scripted sequence of 20
  random steps (seeded list, no `Math.random`) keeps Property 2.
- `reconcileHolders`: keep / drop / add; the "remove from B keeps A" and "add to A keeps later" cases with typed values;
  removing the `self` slot frees `self`.
- `canChooseSelf` / `setHolderType`: every row of the transition table, `nik` untouched, profile name trimmed
  (`'  Nadia Saputri '` → `'Nadia Saputri'`), whitespace-only name → `NO_PROFILE_NAME`.
- No-state test: two calls with different inputs do not influence each other.
- `src/infrastructure/di/__tests__/registry.test.ts`: `orderTicketSelectionUseCase` in `KEYS`.
- Gate: `npm run typecheck && npm run lint && npx vitest --run`; coverage of the file ≥ 85%.
