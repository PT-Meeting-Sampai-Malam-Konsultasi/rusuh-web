# Design Document

## Overview

`OrderCategoryView` grows from `{ id, name, description? }` to also carry `price`, `availability`,
`availabilityLabel` and `soldOut`. The pure mapper `toOrderCategoryView` takes the locale and `t`; the controller's
`categories` memo passes them and recomputes when either changes. Nothing else in `OrderController` changes: same two
queries, same status derivation, same redirect.

**No use-case spec.** The data already arrives through `getOrderCategoriesUseCase` (spec 13). Formatting a number and
picking a translation key is presentation formatting, not a business rule, so it lives in `src/utils/format/` (the
same place as `toOrderEventView` and `formatRupiah`); core-use-case rule: "Simple GET, no transformation | No —
controller wraps the service in `useQuery`". No entity change: `Category.price: Money` and
`Category.availability: CategoryAvailability` exist in `src/core/entities/booking/booking.entity.ts`.

## Architecture

```
OrderScreen ─► container.resolve('orderController')            (registration: src/infrastructure/di/controllers/order.ts, unchanged)
                 │
                 ├─ useQueryTanstack [CATEGORIES, eventId, locale]   (unchanged, no refetchInterval: Q-20 snapshot)
                 │
                 └─ useMemo([ok, locale, t]):
                      ok.categories.map((c) => toOrderCategoryView(c, locale, t))
                                                 │
                                                 ├─ price             = formatRupiah(c.price.amount, locale)
                                                 ├─ availability      = isCategoryAvailability(c.availability) ? value : null
                                                 ├─ availabilityLabel = availability ? t(ORDER_AVAILABILITY_LABEL_KEY[availability]) : ''
                                                 └─ soldOut           = availability === 'sold_out'
```

API operation: `getCategories` (`GET /events/{eventId}/categories`), unchanged. Fields read: `categories[].price`,
`categories[].availability`. `categories[].available` is ignored.

Why `locale` and `t` both in the deps: `placeholderData` keeps the previous language's categories on screen while the
new-language refetch runs (spec 14). Without `locale`/`t` in the memo the prices and labels would stay in the old
language until the refetch lands; with them they switch on the same render as the rest of the page. `t` from
`react-i18next` changes identity on a language change, `locale` is derived from `i18n.language`; listing both is cheap
and robust to either signal.

## Components and Interfaces

```ts
// src/utils/format/order-event.ts (changes only)
import type { TFunction } from 'i18next';

import type { Category, CategoryAvailability } from '@core/entities/booking/booking.entity';
import type { EventSummary } from '@core/entities/catalog/catalog.entity';

import { DEFAULT_TIME_ZONE, formatEventDate, type FormatLocale } from './date';
import { posterToneFor, type PosterTone } from './event-card';
import { formatRupiah } from './number';

/** One category row: name, availability label and price (stepper comes with FR-13-W1). */
export interface OrderCategoryView {
  id: string;
  name: string;
  description?: string;
  /** "Rp 1.250.000" (ID) / "Rp 1,250,000" (EN). */
  price: string;
  /** Null when the server sent a value outside the enum: the row shows no label. */
  availability: CategoryAvailability | null;
  /** "Tersedia" / "Hampir habis" / "Habis" (EN "Available" / "Almost gone" / "Sold out"); '' when availability is null. */
  availabilityLabel: string;
  /** availability === 'sold_out'. */
  soldOut: boolean;
}

/** Translation key per availability value. */
export const ORDER_AVAILABILITY_LABEL_KEY: Record<CategoryAvailability, string> = {
  available: 'order_availability_available',
  almost_gone: 'order_availability_almost_gone',
  sold_out: 'order_availability_sold_out',
};

/** Runtime guard: the type is a closed enum, the payload is not. */
export function isCategoryAvailability(value: unknown): value is CategoryAvailability;

export function toOrderEventView(event: EventSummary, locale: FormatLocale): OrderEventView; // unchanged
export function toOrderCategoryView(category: Category, locale: FormatLocale, t: TFunction): OrderCategoryView;
```

`isCategoryAvailability` = `typeof value === 'string' && Object.hasOwn(ORDER_AVAILABILITY_LABEL_KEY, value)` (own keys
only, so `'toString'` or `'__proto__'` never pass).

```ts
// src/controllers/order.controller.ts (one line changes)
const categories = useMemo(
  () => (ok ? ok.categories.map((category) => toOrderCategoryView(category, locale, t)) : []),
  [ok, locale, t],
);
```

`OrderControllerInterface` is unchanged in shape (`categories: OrderCategoryView[]`); its element type widens. The
arrow in `map` is not a body helper: it adapts the call signature and holds no logic.

DI: nothing to add. `orderController` is already in `AwilixRegistry` (`OrderControllerInterface`) and registered in
`src/infrastructure/di/controllers/order.ts` as `asFunction(OrderController)`; `OrderControllerDeps` keeps the same
`Pick<AwilixRegistry, …>` keys (no new dependency: `formatRupiah` and the key map are pure imports from `@utils`).

## Data Models

Mapping (`category.price = { amount: 1250000, currency: 'IDR' }`):

| `availability` from server | `availability` | `availabilityLabel` ID / EN | `soldOut` | `price` ID / EN             |
| -------------------------- | -------------- | --------------------------- | --------- | --------------------------- |
| `available`                | `available`    | Tersedia / Available        | `false`   | Rp 1.250.000 / Rp 1,250,000 |
| `almost_gone`              | `almost_gone`  | Hampir habis / Almost gone  | `false`   | same                        |
| `sold_out`                 | `sold_out`     | Habis / Sold out            | `true`    | same                        |
| anything else (`paused`)   | `null`         | `''`                        | `false`   | same                        |

**Unknown-value fallback: hide the label, keep the row buyable-looking.** Options considered:

| Option                         | Why not / why                                                                                                                                                                                                           |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Show "Tersedia"                | Rejected: claims stock the server did not confirm ("Say the real number, never inflate", design-system rule 5)                                                                                                          |
| Show "Habis" / mark sold out   | Rejected: could block a buyer from a category that is on sale; the 5-minute window makes a false block costly                                                                                                           |
| Show the raw value             | Rejected: raw server strings never reach users (CLAUDE.md, error-handling rule)                                                                                                                                         |
| **No label, `soldOut: false`** | **Chosen.** The row shows name and price only. The hold re-checks stock atomically (`getCategories` description: "the hold re-checks it atomically"), so a wrong guess fails safely at FR-14-W1 with its own error code |

Translation keys added (both `id.json` and `en.json`):

| Key                              | ID           | EN          |
| -------------------------------- | ------------ | ----------- |
| `order_availability_available`   | Tersedia     | Available   |
| `order_availability_almost_gone` | Hampir habis | Almost gone |
| `order_availability_sold_out`    | Habis        | Sold out    |

Case: stored in sentence case as in the HiFi markup; the uppercase look is CSS (`text-transform: uppercase`, spec 45),
so screen readers read words, not letter-by-letter acronyms.

**HiFi vs ADR / scope differences:**

- SRS FR-12 says "jumlah tiket available"; the HiFi and `hifi-api-review.md` replace the count with a label, and Q-20 /
  T-08 make live stock optional. This spec follows the HiFi + aanwijzing: label only, snapshot at load, no count.

## Layer Constraints

From `.claude/rules/controller.md`:

- Return only what the screen needs, already translated or formatted.
- One query or mutation per async operation. Never call a service inside another mutation's `onSuccess`/`onError`.
- Never `.then()/.catch()`; never `useEffect` + service call (use `useQueryTanstack`, with `refetchInterval` for polling).
- Translation of codes into text (`t` from `useTranslation`)
- Business rules, validation, data transformation → use case
- HTTP details, storage, tokens → infrastructure
- Helper functions defined in the body → `src/utils/` (pure) or a use case (business)
- ❌ any runtime import from @core/services, @infrastructure, or a context
- Registered in its own `src/infrastructure/di/controllers/{page-name}.ts` as `asFunction(Controller)` — **no**
  `.singleton()` — and that file is imported by the page shell, never by `registerAll()` (see scaffold rule).
- Mock every DI dependency (hooks return plain objects); capture `useMutationTanstack` options and call
  `mutationFn` / `onSuccess` / `onError` directly.
- Test: returned interface, loading in all paths, error mapping, navigation targets, analytics.
- Coverage threshold 85%.
- [ ] No business logic or helpers in the body
- [ ] Every destructured DI key has a `container.register()` call
- [ ] The screen needs nothing beyond the returned interface

From `.claude/rules/design-system.md`:

- Say the real number ("± 4 menit"), never inflate.
- Formats: `1.248`, `Rp 2.180.000`, `19.00 WIB`, `Sab, 12 Des 2026` (EN `1,248`, `Rp 2,180,000`, `7.00 pm WIB`,
  `Sat, 12 Dec 2026`).

From `.claude/rules/scaffold.md`:

- Resources: `src/translation/locale/id.json` and `en.json`, same keys in both, flat `snake_case`, single namespace.

From `CLAUDE.md`: "Errors from the API carry a stable `code`; map it to a translation key, never show raw messages."

## Correctness Properties

- Property 1: for every category, `price === formatRupiah(category.price.amount, locale)`; ID uses `.` and EN `,` as the
  thousands separator. **Validates: Requirements 1**
- Property 2: re-rendering with a new `locale` / `t` and the same `ok` result returns new `price` and
  `availabilityLabel` strings (memo deps include `locale` and `t`). **Validates: Requirements 1, 2**
- Property 3: `soldOut === (availability === 'sold_out')` for every view. **Validates: Requirements 2**
- Property 4: `availabilityLabel` is `''` iff `availability` is `null`; otherwise it is
  `t(ORDER_AVAILABILITY_LABEL_KEY[availability])`. A raw server value never appears in any view field except `name` /
  `description`. **Validates: Requirements 2**
- Property 5: `isCategoryAvailability` is true for exactly the three enum strings and false for `'toString'`,
  `'__proto__'`, `''`, `undefined`, numbers. **Validates: Requirements 2**
- Property 6: no view has an `available` (count) field, and the categories query options still have no
  `refetchInterval`. **Validates: Requirements 2**
- Property 7: views keep server order and keep `id`, `name`, `description`. **Validates: Requirements 3**
- Property 8: the `id.json` and `en.json` key sets are equal and contain the three `order_availability_*` keys.
  **Validates: Requirements 3**

## Error Handling

No new API call and no new error code. The categories query's handling stays as in spec 14:

| Operation       | Status / code                                                | User sees                                                             |
| --------------- | ------------------------------------------------------------ | --------------------------------------------------------------------- |
| `getCategories` | no token, 403 `ADMISSION_INVALID`                            | Skeleton, then `router.replace('/queue?event=<id>')`                  |
| `getCategories` | 401 `UNAUTHORIZED`                                           | Inline error: `error_unauthorized` + "Coba lagi" (interim, NFR-07-W2) |
| `getCategories` | `NETWORK_ERROR`                                              | Inline error: `error_network_error` + "Coba lagi"; offline banner     |
| `getCategories` | `TIMEOUT`, `INTERNAL_ERROR`, `RATE_LIMITED`, `UNKNOWN_ERROR` | Inline error: translated `ERROR_CODE_MAP` text + "Coba lagi"          |
| `getCategories` | unmapped code                                                | Inline error: `error_unknown_error` + "Coba lagi"                     |
| (payload)       | `availability` outside the enum                              | Row with name and price, no label (fallback above); no error state    |

## Testing Strategy

- `src/utils/format/__tests__/order-event.test.ts`: replace "keeps only id, name and description" with: full view for
  each of the three values in ID and EN (`Rp 1.250.000` / `Rp 1,250,000`, labels through a fake `t` that echoes the
  key); `soldOut` only for `sold_out`; unknown value (`'paused' as never`) → `availability: null`, `''`, `false`, price
  still set; no `available` field on the result; `isCategoryAvailability` table including `'toString'`.
- `src/controllers/__tests__/order.controller.test.ts`: update the "is ready with formatted views" expectation to the
  new shape (fixtures: one `available`, one `sold_out`); new test: same `okResult`, `i18n.language` `id` → `en` with
  `rerender`, prices switch to `,` separators and labels are re-translated; keep the existing
  `not.toHaveProperty('refetchInterval')` assertion.
- Typed fixtures of `OrderCategoryView` outside this layer (`src/presentation/pages/Order/__tests__/index.test.tsx`,
  `src/presentation/pages/Order/components/CategoryList/__tests__/index.test.tsx`) get the four new fields so
  `tsc --noEmit` passes; their rendering assertions change in spec 45.
- The existing i18n key-parity test covers the new keys.
