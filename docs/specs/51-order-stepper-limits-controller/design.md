# Design Document

## Overview

`OrderController` (`src/controllers/order.controller.ts`) is extended, not replaced. Three changes:

1. **Stock-aware rows.** No body change is needed to pass the stock fields: `selectable = ok?.categories ?? NO_CATEGORIES`
   is already `Category[]`, which carries `availability` and `available`, and spec 50 widened `SelectableCategory` to
   read them. Rows keep taking `canIncrement` / `canDecrement` from `selection.lines`. This spec pins that behaviour
   with tests (sold out at 0: both buttons off; stale pick: "−" on, "+" off).
2. **`limitNotice`.** Non-null only when the page is ready and `selection.limitReached`; `count` is `"total/limit"`,
   `message` is `order_limit_reached` (HiFi copy) or, when `selection.limitBelowMax`, `order_limit_reached_reserved`
   (proposed copy for the smaller reservation, ADR-0004).
3. **`categoryNote` count = the order limit.** Today it is `t('order_category_note', { count: ok.maxTicketsPerOrder })`,
   so with `reservedUnits: 2` the note says "Maks. 3 tiket" while the steppers stop at 2 (pinned by the current test
   "caps the limit at the reserved units"). Spec 48 recorded that gap as "without a message until the FR-14-W1 limit
   line"; this spec closes it by passing `limit`.

**No use-case spec beyond spec 50; no analytics; no popup.** The rules are in `orderTicketSelectionUseCase` (spec 50).
A reached limit is an intermediate UI state, not a completed action, so it is not tracked (same convention as spec 48:
`queue_join`, `home_event_select`, `login_verified` track outcomes). The notice is inline, so no `usePopupError`.

## Architecture

```
OrderScreen ─► container.resolve('orderController')             (src/infrastructure/di/controllers/order.ts, unchanged)
  │
  ├─ eventQuery, categoriesQuery, meQuery, status               unchanged (getEvent, getCategories, getMe)
  ├─ selectable = ok?.categories ?? NO_CATEGORIES               Category[] → readonly SelectableCategory[] (spec 50)
  ├─ limit      = ok ? orderTicketSelectionUseCase.orderLimit(ok) : 0
  ├─ selection  = useMemo(summarize(selectable, quantities, limit))
  │                → lines (stock-aware canIncrement), slots, total, limitReached, limitBelowMax
  ├─ categories = rows from selection.lines                      unchanged code
  ├─ limitNotice = useMemo(status === 'ready' && selection.limitReached
  │                  ? { count: `${total}/${limit}`, message: t(limitBelowMax ? reserved : reached, { count: limit }) }
  │                  : null)                                     ← new
  └─ categoryNote = ok ? t('order_category_note', { count: limit }) : ''      ← count changed
```

API operations: unchanged (`getEvent`, `getCategories`, `getMe`). No mutation.

## Components and Interfaces

```ts
// src/controllers/order.controller.ts (additions; existing fields unchanged)

/** The line under the category list when the order limit is reached (HiFi `.limit`). */
export interface OrderLimitNotice {
  /** "3/3": tickets picked / order limit. */
  count: string;
  /** "Batas 3 tiket tercapai. Kurangi satu untuk ganti kategori." or the reservation variant. */
  message: string;
}

export interface OrderControllerInterface {
  // …all existing fields unchanged…
  /** Non-null only when status is 'ready' and the order limit is reached. */
  limitNotice: OrderLimitNotice | null;
  /** "Maks. {{count}} tiket per transaksi. …" with count = orderLimit (was maxTicketsPerOrder); '' until loaded. */
  categoryNote: string;
}
```

Body additions (no new import, no new DI key; `useMemo` is already imported):

```ts
const limitNotice = useMemo<OrderLimitNotice | null>(
  () =>
    status === 'ready' && selection.limitReached
      ? {
          count: `${selection.total}/${limit}`,
          message: t(selection.limitBelowMax ? 'order_limit_reached_reserved' : 'order_limit_reached', {
            count: limit,
          }),
        }
      : null,
  [status, selection, limit, t],
);

// return { …, limitNotice, categoryNote: ok ? t('order_category_note', { count: limit }) : '', … }
```

Compile check: `selection.limitReached` / `selection.limitBelowMax` exist on `TicketSelection` after spec 50;
`OrderControllerDeps` is unchanged; `AwilixRegistry.orderController: OrderControllerInterface` widens with one field and
needs no registration change. The shell destructures `limitNotice` in spec 52.

The ternary choosing the key is translation of a code-like flag, which the controller rule assigns to the controller
("Translation of codes into text"); the rule itself (`limit < ORDER_MAX_TICKETS`) stays in the use case.

## Data Models

`limitNotice` by state (t = real ID strings):

| maxTicketsPerOrder | reservedUnits | Quantities           | limitNotice                                                                                   |
| ------------------ | ------------- | -------------------- | --------------------------------------------------------------------------------------------- |
| 3                  | 3             | `{ B: 2 }`           | `null`                                                                                        |
| 3                  | 3             | `{ B: 2, D: 1 }`     | `{ count: '3/3', message: 'Batas 3 tiket tercapai. Kurangi satu untuk ganti kategori.' }`     |
| 3                  | 2             | `{ B: 2 }`           | `{ count: '2/2', message: 'Kuota giliran Anda 2 tiket. Kurangi satu untuk ganti kategori.' }` |
| 3                  | 1             | `{ D: 1 }`           | `{ count: '1/1', message: 'Kuota giliran Anda 1 tiket. Kurangi satu untuk ganti kategori.' }` |
| 3                  | 0             | `{}`                 | `null` (limit 0)                                                                              |
| any                | any           | status not `'ready'` | `null`                                                                                        |

Translation keys (added to both `id.json` and `en.json`; flat snake_case; `{{count}}` is the order limit; i18next picks
`_one` / `_other` from `count`; Indonesian has only the `other` category, so the ID `_one` value is kept for key parity
like `order_category_note_one`):

| Key                                  | ID                                                                     | EN                                                                    |
| ------------------------------------ | ---------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `order_limit_reached_one`            | Batas {{count}} tiket tercapai. Kurangi satu untuk ganti kategori.     | You've hit the {{count}}-ticket limit. Remove one to switch category. |
| `order_limit_reached_other`          | Batas {{count}} tiket tercapai. Kurangi satu untuk ganti kategori.     | You've hit the {{count}}-ticket limit. Remove one to switch category. |
| `order_limit_reached_reserved_one`   | Kuota giliran Anda {{count}} tiket. Kurangi satu untuk ganti kategori. | Your turn holds {{count}} ticket. Remove one to switch category.      |
| `order_limit_reached_reserved_other` | Kuota giliran Anda {{count}} tiket. Kurangi satu untuk ganti kategori. | Your turn holds {{count}} tickets. Remove one to switch category.     |

Existing key reused with a new count: `order_category_note_one/_other` ("Maks. {{count}} tiket per transaksi. …" /
"Max {{count}} ticket(s) per order. …").

**Copy status and source differences recorded here:**

- `order_limit_reached`: HiFi `detail.html` line 33, ID "Batas 3 tiket tercapai. Kurangi satu untuk ganti kategori.",
  EN "You've hit the 3-ticket limit. Remove one to switch category." The "3" becomes `{{count}}`.
- `order_limit_reached_reserved`: **proposed copy**, no HiFi or Figma frame (Figma is not accessible to this team; the
  HiFi only shows the line at `total >= 3`, its script `limit.hidden = total < MAX`). It explains ADR-0004's reservation
  of `min(3, remaining)` in the voice rules ("short, warm, 'Anda'"). Confirm with the designer.
- HiFi hard-codes `MAX = 3` and never shows the line for a smaller reservation; this design follows ADR-0004 and the
  HiFi API review §4 ("The reservation can be 1 or 2 near sell-out, not always 3").
- The HiFi sold-out row has both buttons `disabled` at 0; this design matches it through spec 50's cap.
- `categoryNote` now uses the order limit (reverses the spec 48 note "`order_category_note` keeps `maxTicketsPerOrder`").
- `limitBelowMax` is also true if the policy `maxTicketsPerOrder` is ever below 3 (contract example and N-1 say 3); the
  reserved copy would then read slightly off. Accepted; revisit if the policy value changes.

## Layer Constraints

From `.claude/rules/controller.md`:

- Page UI state (`useState`), form state (`useForm` + Zod, `useWatch`)
- Translation of codes into text (`t` from `useTranslation`)
- Analytics (`trackPageView` once on mount, `trackEvent` on actions)
- Business rules, validation, data transformation → use case
- Helper functions defined in the body → `src/utils/` (pure) or a use case (business)
- ✅ import type { ... } from '@core/...';
- ❌ any runtime import from @core/services, @infrastructure, or a context
- `export default` the factory; named export the interface `{Page}ControllerInterface`.
- Return only what the screen needs, already translated or formatted.
- Never `.then()/.catch()`; never `useEffect` + service call (use `useQueryTanstack`, with `refetchInterval` for polling).
- Registered in its own `src/infrastructure/di/controllers/{page-name}.ts` as `asFunction(Controller)` — **no**
  `.singleton()` — and that file is imported by the page shell, never by `registerAll()` (see scaffold rule).
- Mock every DI dependency (hooks return plain objects); capture `useMutationTanstack` options and call
  `mutationFn` / `onSuccess` / `onError` directly.
- Test: returned interface, loading in all paths, error mapping, navigation targets, analytics.
- Coverage threshold 85%.
- [ ] No `.then(`, `.catch(`, or `useEffect` with a service call
- [ ] No direct imports of framework or context hooks
- [ ] No business logic or helpers in the body
- [ ] Every destructured DI key has a `container.register()` call
- [ ] The screen needs nothing beyond the returned interface

From `.claude/rules/core-use-case.md` (when to create one):

| Scenario                                                  | Use case? |
| --------------------------------------------------------- | --------- |
| Multi-step flow, business validation, branching on status | Yes       |

(The validation lives in spec 50's use case; this controller adds no rule.)

From `.claude/rules/scaffold.md`:

- Resources: `src/translation/locale/id.json` and `en.json`, same keys in both, flat `snake_case`, single namespace.
- Copy comes from the HiFi / Design Brief voice rules; write ID first, then a full EN translation.

From `.claude/rules/design-system.md`:

- Short, warm, "Anda". ID first, full EN translation.
- Say the real number ("± 4 menit"), never inflate.

From `.claude/rules/error-handling.md`:

- Every code the endpoint can return (see `openapi.yaml`) has an entry in `ERROR_CODE_MAP` and both locale files.

## Correctness Properties

- Property 1: with a sold-out category at quantity 0, its row has `canIncrement: false` and `canDecrement: false`;
  `increment(thatId)` leaves `totalTickets`, every row and the holders unchanged. **Validates: Requirements 1**
- Property 2: with `available: 1` on a category, after one increment its row has `canIncrement: false` while other
  rows stay `true` (total 1 < 3). **Validates: Requirements 1**
- Property 3: after a picked category comes back sold out on a refetch (new `categoriesState`), its row keeps the
  quantity with `canIncrement: false`, `canDecrement: true`, and `decrement` lowers it. **Validates: Requirements 1**
- Property 4: across the tests, `analyticsAdapter.trackEvent` is never called and no popup hook is used for a refused
  increment or a reached limit; `trackPageView('order')` is the only analytics call. **Validates: Requirements 1, 2**
- Property 5: `limitNotice` follows the Data Models table: `null` below the limit, at limit 0 and when status is not
  `'ready'`; otherwise `count` is the total and the limit joined by `/` (`'3/3'`, `'2/2'`), and `message` is
  `t('order_limit_reached', { count: 3 })` at limit 3 and `t('order_limit_reached_reserved', { count: 2 })` with
  `reservedUnits: 2`. **Validates: Requirements 2**
- Property 6: decrementing from the limit sets `limitNotice` to `null`; a language rerender keeps the quantities and the
  notice with the message retranslated. **Validates: Requirements 2**
- Property 7: `categoryNote === t('order_category_note', { count: orderLimit })` when loaded (`{"count":2}` with
  `reservedUnits: 2`, `{"count":3}` otherwise) and `''` before. **Validates: Requirements 3**
- Property 8: `id.json` and `en.json` have the same key set including the four new keys; with the real i18n instance,
  `t('order_limit_reached_reserved', { count: 1 })` in EN is "Your turn holds 1 ticket. Remove one to switch category."
  and with `count: 2` "…2 tickets…"; ID gives "Kuota giliran Anda 2 tiket. …". **Validates: Requirements 4**
- Property 9: every existing controller test (queries, status, redirect, retry, locale, steps, holders, NIK) passes
  unchanged except the note assertion; `OrderControllerDeps` is unchanged. **Validates: Requirements 5**

## Error Handling

No new API call. Every code the page's operations return is handled as before:

| Operation       | Status / code                                                                      | User sees                                                                    |
| --------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `getCategories` | no token, 403 `ADMISSION_INVALID`                                                  | Skeleton, then `router.replace('/queue?event=<id>')` (unchanged)             |
| `getCategories` | 401 `UNAUTHORIZED`                                                                 | Inline error `error_unauthorized` + "Coba lagi" (unchanged)                  |
| `getCategories` | `NETWORK_ERROR`                                                                    | Inline error `error_network_error` + "Coba lagi"; offline banner (unchanged) |
| `getCategories` | `TIMEOUT`, `INTERNAL_ERROR`, `RATE_LIMITED`, `UNKNOWN_ERROR`, unmapped             | Inline error from `ERROR_CODE_MAP` + "Coba lagi" (unchanged)                 |
| `getEvent`      | 404 `NOT_FOUND`                                                                    | Not-found state (unchanged)                                                  |
| `getMe`         | any failure                                                                        | Holder choice hidden, nothing shown (unchanged, spec 48)                     |
| (rules)         | `SOLD_OUT`, `STOCK_REACHED`, `LIMIT_REACHED`, `UNKNOWN_CATEGORY`, `NONE_TO_REMOVE` | No change; "+" / "−" already disabled; limit line for `LIMIT_REACHED`        |

Not handled here (the hold is not built): `createBooking` `QUANTITY_OVER_RESERVATION`, `CATEGORY_SOLD_OUT`,
`NIK_SEAT_TAKEN`, `ACCOUNT_HAS_ACTIVE_BOOKING`. No `ERROR_CODE_MAP` entry is added by this spec.

## Testing Strategy

`src/controllers/__tests__/order.controller.test.ts` (real `OrderTicketSelectionUseCase()` as the dep, `t` mocked as
`key:JSON(options)` like today):

- Fixtures: the category fixtures already carry `availability`; add a sold-out category and one with `available: 1` in
  a new `describe('stepper limits')`.
- Rows: Properties 1–3 (refetch simulated by changing `categoriesState` and `rerender()`).
- Notice: below limit `null`; at 3 → `{ count: '3/3', message: 'order_limit_reached:{"count":3}' }`; `reservedUnits: 2`
  → `'2/2'` and `order_limit_reached_reserved:{"count":2}`; `reservedUnits: 0` → `null`; status loading/error → `null`;
  decrement clears it; language rerender keeps it.
- Note: update "caps the limit at the reserved units" to expect `order_category_note:{"count":2}`; keep the `{"count":3}`
  case for the default fixture.
- Analytics: assert `trackEvent` is not called after reaching the limit and calling `increment` on a sold-out row.
- Shell fixture: add `limitNotice: null` to the fake controller in `src/presentation/pages/Order/__tests__/index.test.tsx`.
- The i18n key-parity test covers the four new keys; add one assertion with the real i18n instance for the EN singular
  and plural of `order_limit_reached_reserved` (Property 8) in `src/infrastructure/i18n/__tests__/i18n.test.ts`.
