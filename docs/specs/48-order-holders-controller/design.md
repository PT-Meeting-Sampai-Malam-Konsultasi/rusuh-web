# Design Document

> **Updated 13 Nov 2026 (spec 79):** the "Saya sendiri / Orang lain" choice is removed. The account holds no NIK (D17),
> so every holder's name and NIK are typed in. The profile query (`getMe`), `showHolderChoice`, `choose`, `selfDisabled`,
> the read-only name and Requirement 3 no longer apply; see `docs/specs/79-order-holders-without-choice`.

## Overview

`OrderController` (`src/controllers/order.controller.ts`) is extended, not replaced. It adds:

1. **Quantities** in `useState<TicketQuantities>({})`, changed only through `orderTicketSelectionUseCase.increment` /
   `decrement` (spec 47), and summarized into category rows (`quantity`, `canIncrement`, …), `totalTickets` and
   `orderLimit`.
2. **Holders** in React Hook Form (`useForm` + `zodResolver`, `useWatch`), one entry per ticket slot, reconciled by slot
   key on every quantity change.
3. **Profile** from `getMe` through `useQueryTanstack`, enabled once the page is `ready`, used only for the
   "Saya sendiri" prefill; any failure hides the choice silently.
4. **NIK display**: raw digits while focused, masked (`3174 •••• •••• 0004`) otherwise, via `src/utils/format/nik.ts`.

**No new use-case spec for `getMe`.** It is a simple GET with no transformation: core-use-case rule "Simple GET, no
transformation | No — controller wraps the service in `useQuery`". The selection rules are spec 47
(`orderTicketSelectionUseCase`); the entity fix is spec 46.

**No new analytics events.** The convention (`queue_join`, `queue_claim`, `home_event_select`, `account_name_saved`,
`login_verified`) tracks completed actions and outcomes, not intermediate UI ticks; the controller rule's "`trackEvent`
on actions" is met by the hold, which is out of scope and will carry the order's quantities. Holder changes are never
tracked: the values are personal data (name, NIK). `trackPageView('order')` is unchanged.

## Architecture

```
OrderScreen ─► container.resolve('orderController')     (src/infrastructure/di/controllers/order.ts, unchanged)
  │
  ├─ eventQuery, categoriesQuery                        unchanged (specs 14, 44); categoriesQuery → ok.reservedUnits (spec 46)
  ├─ status                                             unchanged derivation
  ├─ meQuery = useQueryTanstack<User, HttpError>({ queryKey: [QUERY_KEYS.ME], enabled: status === 'ready', retry: false,
  │                                                 refetchOnWindowFocus: false })            GET /me (getMe)
  │
  ├─ [quantities, setQuantities] = useState({})
  ├─ limit     = ok ? orderTicketSelectionUseCase.orderLimit(ok) : 0
  ├─ selection = useMemo(summarize(ok?.categories ?? NO_CATEGORIES, quantities, limit))
  ├─ categories = useMemo(views (spec 44) ⨯ selection.lines ⨯ t labels)
  │
  ├─ formApi = useForm<HoldersValues>({ resolver: zodResolver(holdersSchema), defaultValues: { holders: [] } })
  ├─ holderValues = useWatch({ control: formApi.control, name: 'holders' })
  ├─ [focusedNik, setFocusedNik] = useState<string | null>(null)
  └─ holders = useMemo(selection.slots → OrderHolderView[])
        increment/decrement → use case → setQuantities(next) + formApi.setValue('holders', reconcileHolders(current, nextSlots))
        choose(type)        → setHolderType(current, key, type, profileName) → formApi.setValue('holders', …)
        name.onChange       → formApi.setValue(`holders.${i}.fullName`, value)          (only when not read-only)
        nik.onChange        → formApi.setValue(`holders.${i}.nik`, toNikDigits(value))
        nik.value           → focusedNik === key ? digits : maskNik(digits)
```

API operations: `getCategories` (unchanged; reads `maxTicketsPerOrder`, `reservedUnits`) and `getMe` (`GET /me`,
200 `User`, 401). No mutation.

## Components and Interfaces

```ts
// src/utils/format/nik.ts (new, pure)
/** Keeps digits only: what the NIK field stores. No length or structure rule (FR-15-W1). */
export function toNikDigits(value: string): string;

/**
 * Digits grouped by 4; every digit except the first 4 and the last 4 becomes "•" (design-system "NIK masked as first
 * 4 + last 4"). '3174055203960004' → '3174 •••• •••• 0004'; 8 digits or fewer stay visible ('3174 0552'); '' → ''.
 */
export function maskNik(digits: string): string;
```

```ts
// src/controllers/order.controller.ts (additions; existing fields unchanged)
import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod/mini';

import type { User } from '@core/entities/auth/auth.entity';
import type {
  ChangeQuantityResult,
  HolderEntry,
  HolderType,
  TicketQuantities,
} from '@core/use_case/booking/order-ticket-selection.use-case';
import { maskNik, toNikDigits } from '@utils/format/nik';

/** Re-exported so the presentation layer never imports from @core. */
export type OrderHolderType = HolderType;

export interface OrderCategoryRow extends OrderCategoryView {
  quantity: number;
  /** quantity > 0: accent name and filled count. */
  selected: boolean;
  canIncrement: boolean;
  canDecrement: boolean;
  /** "Tambah Festival B" / "Add Festival B". */
  incrementLabel: string;
  /** "Kurangi Festival B" / "Remove Festival B". */
  decrementLabel: string;
}

export interface OrderHolderNameField {
  id: string;
  value: string;
  /** True for "Saya sendiri" (name from the profile). */
  readOnly: boolean;
  /** "Dari profil Anda." when read-only, else "Dicetak di e-tiket.". */
  hint: string;
  onChange: (value: string) => void;
}

export interface OrderHolderNikField {
  id: string;
  /** Raw digits while focused; masked ("3174 •••• •••• 0004") otherwise. */
  value: string;
  onChange: (value: string) => void;
  onFocus: () => void;
  onBlur: () => void;
}

export interface OrderHolderView {
  /** Slot key: React key and id base. */
  key: string;
  /** "Tiket 1 · Festival B" / "Ticket 1 · Festival B". */
  title: string;
  holderType: OrderHolderType;
  /** Radio group name: `order-holder-${key}-type`. */
  choiceName: string;
  /** "Saya sendiri" is taken by another ticket (block, spec 47). */
  selfDisabled: boolean;
  choose: (holderType: OrderHolderType) => void;
  name: OrderHolderNameField;
  nik: OrderHolderNikField;
}

export interface OrderControllerInterface {
  // …all existing fields unchanged (t, status, event, categoryNote, errorMessage, retry, steps, backHref, homeHref,
  // locale, setLocale), except categories, whose element type widens:
  /** Server order; empty until the categories load. */
  categories: OrderCategoryRow[];
  increment: (categoryId: string) => void;
  decrement: (categoryId: string) => void;
  totalTickets: number;
  /** min(3, maxTicketsPerOrder, reservedUnits); 0 until loaded. */
  orderLimit: number;
  /** status === 'ready' && totalTickets >= 1. */
  showHolders: boolean;
  /** The profile has a name: show "Saya sendiri" / "Orang lain". */
  showHolderChoice: boolean;
  /** One per ticket, slot order; empty when totalTickets is 0. */
  holders: OrderHolderView[];
}

type OrderControllerDeps = Pick<
  AwilixRegistry,
  | 'catalogService'
  | 'accountService'
  | 'getOrderCategoriesUseCase'
  | 'orderTicketSelectionUseCase'
  | 'admissionStore'
  | 'analyticsAdapter'
  | 'storage'
  | 'ERROR_CODE_MAP'
  | 'useTranslation'
  | 'useQueryTanstack'
  | 'useRouterNext'
  | 'useSearchParamsNext'
>;

const holdersSchema = z.object({
  holders: z.array(
    z.object({
      slotKey: z.string(),
      holderType: z.enum(['self', 'other']),
      fullName: z
        .string()
        .check(z.trim(), z.minLength(1, 'login_name_required'), z.maxLength(200, 'login_name_too_long')),
      /** Digits only, kept by toNikDigits on change; format rules are FR-15-W1. */
      nik: z.string(),
    }),
  ),
});
type HoldersValues = z.infer<typeof holdersSchema>; // structurally HolderEntry[] under `holders`

/** Stable empty list for summarize before the categories load (constant, not mutable state). */
const NO_CATEGORIES: readonly [] = [];
```

Notes on the sketch:

- `HoldersValues['holders'][number]` is assignable to and from `HolderEntry` (same four fields, `holderType` the same
  union), so `reconcileHolders` / `setHolderType` results go straight into `formApi.setValue('holders', …)`.
- `react-hook-form`, `@hookform/resolvers/zod` and `zod/mini` are already dependencies and already used the same way by
  `login.controller.ts` and `account.controller.ts`; they load only with the Order page because the controller is
  registered per page.
- Views find each slot's entry by `slotKey` in `holderValues` (index kept for the `setValue` path). After
  `reconcileHolders` the arrays align; if an entry is ever missing (not expected), the view renders an empty `other`
  holder whose handlers do nothing.
- `name.onChange` writes only when `holderType === 'other'` or the choice is hidden. `readOnly` is
  `holderType === 'self' && showHolderChoice`, so a `self` entry never gets stuck read-only if the profile disappears.
- Ids: `order-holder-${key}-name`, `order-holder-${key}-nik` (slot keys are unique, spec 47).
- `categories` memo deps: `[ok, locale, t, selection]`; `holders` memo deps:
  `[selection.slots, holderValues, focusedNik, profileName, showHolderChoice, t]`.

DI: no new `AwilixRegistry` key from this spec. `accountService` (services) and `orderTicketSelectionUseCase` (spec 47)
are registered in `services.registry.ts`; `orderController` stays `asFunction(OrderController)` in
`src/infrastructure/di/controllers/order.ts`. `OrderControllerInterface` widens; the registry type compiles unchanged.

## Data Models

Form state: `{ holders: HolderEntry[] }` (`slotKey`, `holderType`, `fullName`, `nik` digits). Quantities:
`Record<categoryId, number>`. UI state: `focusedNik: string | null` (slot key).

NIK display (`maskNik`):

| Digits typed       | Focused            | Not focused            |
| ------------------ | ------------------ | ---------------------- |
| `` (empty)         | ``                 | `` (placeholder shows) |
| `3174`             | `3174`             | `3174`                 |
| `31740552`         | `31740552`         | `3174 0552`            |
| `3174055203`       | `3174055203`       | `3174 ••52 03`         |
| `3174055203960004` | `3174055203960004` | `3174 •••• •••• 0004`  |

Translation keys (added to both `id.json` and `en.json`; flat snake_case):

| Key                              | ID                                                                                                       | EN                                                                                                                 |
| -------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `order_stepper_decrease`         | Kurangi {{category}}                                                                                     | Remove {{category}}                                                                                                |
| `order_stepper_increase`         | Tambah {{category}}                                                                                      | Add {{category}}                                                                                                   |
| `order_holders_heading`          | Pemegang tiket                                                                                           | Ticket holders                                                                                                     |
| `order_holders_note`             | Nama dan NIK sesuai KTP. 1 NIK = 1 tiket per event — di pintu masuk, e-tiket dicocokkan dengan KTP asli. | Name and NIK as on the KTP. 1 NIK = 1 ticket per event — at the gate, the e-ticket is matched to the original KTP. |
| `order_holder_title`             | Tiket {{index}} · {{category}}                                                                           | Ticket {{index}} · {{category}}                                                                                    |
| `order_holder_for_label`         | Untuk siapa tiket ini                                                                                    | Who is this ticket for                                                                                             |
| `order_holder_self`              | Saya sendiri                                                                                             | Myself                                                                                                             |
| `order_holder_other`             | Orang lain                                                                                               | Someone else                                                                                                       |
| `order_holder_name_label`        | Nama sesuai KTP                                                                                          | Name as on the KTP                                                                                                 |
| `order_holder_name_placeholder`  | Nama lengkap                                                                                             | Full name                                                                                                          |
| `order_holder_name_hint`         | Dicetak di e-tiket.                                                                                      | Printed on the e-ticket.                                                                                           |
| `order_holder_name_hint_profile` | Dari profil Anda.                                                                                        | From your profile.                                                                                                 |
| `order_holder_nik_label`         | NIK                                                                                                      | NIK                                                                                                                |
| `order_holder_nik_placeholder`   | 16 digit sesuai KTP                                                                                      | 16 digits, as on the KTP                                                                                           |
| `order_holder_nik_hint`          | Contoh: 3201 1234 5678 0001                                                                              | Example: 3201 1234 5678 0001                                                                                       |

The section's static labels (heading, note, legend, options, field labels, placeholders, NIK hint) are read with `t` in
the page (spec 49); the controller translates the dynamic ones (row button labels, holder titles, name hints). The
schema's messages reuse `login_name_required` / `login_name_too_long` (same rule as the profile name; not shown in this
ticket).

**HiFi vs ADR / Figma differences recorded here:**

- HiFi `detail.html` keys NIK fields by position (`have[i]`), so removing a ticket shifts later values onto other
  tickets; this design keys by slot (spec 47).
- HiFi section 2 is "NIK pemegang tiket" with NIK fields only; Figma and H-2 add "Nama sesuai KTP"; this design follows
  ADR-0007 / H-2 (name + NIK).
- HiFi new-field hint "Satu NIK untuk satu tiket."; Figma "Contoh: 3201 1234 5678 0001" for every field; Figma wins.
- Figma's "Saya sendiri" card with a profile NIK, "Profil Anda belum punya NIK." and "Simpan NIK ini ke profil" are
  not built: the account holds no NIK (ADR-0007, `account.service.ts` "the account holds no NIK (D17)"). See spec 49.
- `order_category_note` keeps `maxTicketsPerOrder` ("Maks. 3 tiket per transaksi"); when `reservedUnits` is lower the
  steppers stop earlier without a message until the FR-14-W1 limit line.

## Layer Constraints

From `.claude/rules/controller.md`:

- Page UI state (`useState`), form state (`useForm` + Zod, `useWatch`)
- Queries and mutations wrapping use cases or services (`useQueryTanstack`, `useMutationTanstack`)
- Translation of codes into text (`t` from `useTranslation`)
- Analytics (`trackPageView` once on mount, `trackEvent` on actions)
- Business rules, validation, data transformation → use case
- HTTP details, storage, tokens → infrastructure
- Helper functions defined in the body → `src/utils/` (pure) or a use case (business)
- ✅ import { useForm, useWatch } from 'react-hook-form';
- ✅ import { zodResolver } from '@hookform/resolvers/zod';
- ✅ import type { ... } from '@core/...';
- ❌ import { useQuery, useMutation } from '@tanstack/react-query'; // DI: useQueryTanstack, useMutationTanstack
- ❌ any runtime import from @core/services, @infrastructure, or a context
- `export default` the factory; named export the interface `{Page}ControllerInterface`.
- Return only what the screen needs, already translated or formatted.
- One query or mutation per async operation. Never call a service inside another mutation's `onSuccess`/`onError`.
- Never `.then()/.catch()`; never `useEffect` + service call (use `useQueryTanstack`, with `refetchInterval` for polling).
- `useWatch` for reactive form values; never `watch()` (React 19 re-render issue).
- Registered in its own `src/infrastructure/di/controllers/{page-name}.ts` as `asFunction(Controller)` — **no**
  `.singleton()` — and that file is imported by the page shell, never by `registerAll()` (see scaffold rule).
- Mock every DI dependency (hooks return plain objects); capture `useMutationTanstack` options and call
  `mutationFn` / `onSuccess` / `onError` directly.
- Test: returned interface, loading in all paths, error mapping, navigation targets, analytics.
- Coverage threshold 85%.
- [ ] No `.then(`, `.catch(`, or `useEffect` with a service call
- [ ] No direct imports of framework or context hooks
- [ ] No business logic or helpers in the body
- [ ] One query/mutation per async operation
- [ ] Every destructured DI key has a `container.register()` call
- [ ] The screen needs nothing beyond the returned interface

From `.claude/rules/core-use-case.md` (when to create one):

| Scenario                      | Use case?                                       |
| ----------------------------- | ----------------------------------------------- |
| Simple GET, no transformation | No — controller wraps the service in `useQuery` |

From `.claude/rules/error-handling.md`:

- Field-level codes (`NIK_INVALID`, `DUPLICATE_NIK`, `NIK_SEAT_TAKEN`, `WRONG_CODE`…) show under the field, not in a popup.
- `401` always goes to sign-in; never an "unauthorized" page.

(For `getMe` on this page the 401 is not acted on: the profile is optional here, and a real session loss is caught by
`getCategories`, which needs the same bearer token.)

From `.claude/rules/design-system.md`:

- NIK masked as first 4 + last 4.
- Trust zones (NIK, payment, summary) are quiet: no tilt, no halftone behind text.

From `.claude/rules/scaffold.md`:

- Resources: `src/translation/locale/id.json` and `en.json`, same keys in both, flat `snake_case`, single namespace.
- Query keys live in `src/utils/constants/query-keys.ts`.

From `CLAUDE.md`:

- NIKs are shown masked after entry and never logged.
- All async work goes through TanStack Query (`useQuery` / `useMutation`) — never `.then()` or `useEffect` + fetch.

## Correctness Properties

- Property 1: every row has the spec 44 fields plus `quantity`, `selected === quantity > 0`, `canIncrement`,
  `canDecrement` equal to the matching `summarize` line, `incrementLabel === t('order_stepper_increase', { category: name })`
  and `decrementLabel === t('order_stepper_decrease', { category: name })`. **Validates: Requirements 1**
- Property 2: `increment` / `decrement` call the use case; an `unchanged` result leaves `quantities` and the form
  untouched; `totalTickets` never exceeds `orderLimit`. **Validates: Requirements 1**
- Property 3: with `ok.maxTicketsPerOrder: 3, ok.reservedUnits: 2`, `orderLimit` is 2 and after two increments every
  row has `canIncrement: false`. **Validates: Requirements 1**
- Property 4: `holders.length === totalTickets`; `holders[i].title === t('order_holder_title', { index: i + 1, category })`;
  `showHolders` is false at 0 tickets and whenever `status !== 'ready'`. **Validates: Requirements 2**
- Property 5: after typing a name and NIK on the Tribun Atas holder, incrementing Festival B keeps those values on the
  Tribun Atas holder (now a higher "Tiket n"); decrementing Festival B keeps the Tribun Atas values.
  **Validates: Requirements 2**
- Property 6: the `me` query options are `{ queryKey: ['me'], enabled: status === 'ready', retry: false,
refetchOnWindowFocus: false }`; `queryFn` calls `accountService.getMe`. **Validates: Requirements 3**
- Property 7: with `fullName: 'Nadia Saputri'`, `choose('self')` gives `name.value 'Nadia Saputri'`, `readOnly: true`,
  hint `order_holder_name_hint_profile`, `nik.value ''`; other holders get `selfDisabled: true`; `choose('other')`
  clears the name, `readOnly: false`, hint `order_holder_name_hint`. **Validates: Requirements 3**
- Property 8: for `/me` error (401, `NETWORK_ERROR`, `INTERNAL_ERROR`), pending, `fullName` missing or `'  '`:
  `showHolderChoice` is false, `status` is unchanged, `errorMessage` is unchanged, no popup, no `router` call.
  **Validates: Requirements 3**
- Property 9: `nik.onChange('3174 0552-0396 0004')` stores `3174055203960004`; `nik.value` is the raw digits after
  `onFocus` and `3174 •••• •••• 0004` after `onBlur`. **Validates: Requirements 4, 5**
- Property 10: across every test, no `analyticsAdapter.trackEvent` / `reportError` argument and no query key contains a
  typed NIK or holder name; `trackPageView('order')` is still the only analytics call. **Validates: Requirements 5**
- Property 11: `maskNik` / `toNikDigits` follow the Data Models table; `maskNik` output never contains more than 8
  digits. **Validates: Requirements 5**
- Property 12: `id.json` and `en.json` have the same key set, including the 15 new keys. **Validates: Requirements 6**
- Property 13: the existing controller tests (queries, status, redirect, retry, locale, steps) pass unchanged except
  for fixtures. **Validates: Requirements 7**

## Error Handling

| Operation       | Status / code                                                                                                       | User sees                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `getCategories` | no token, 403 `ADMISSION_INVALID`                                                                                   | Skeleton, then `router.replace('/queue?event=<id>')` (unchanged)             |
| `getCategories` | 401 `UNAUTHORIZED`                                                                                                  | Inline error `error_unauthorized` + "Coba lagi" (unchanged)                  |
| `getCategories` | `NETWORK_ERROR`                                                                                                     | Inline error `error_network_error` + "Coba lagi"; offline banner (unchanged) |
| `getCategories` | `TIMEOUT`, `INTERNAL_ERROR`, `RATE_LIMITED`, `UNKNOWN_ERROR`, unmapped                                              | Inline error from `ERROR_CODE_MAP` + "Coba lagi" (unchanged)                 |
| `getMe`         | 401 `UNAUTHORIZED`                                                                                                  | Nothing: holder choice hidden, plain editable fields; no redirect            |
| `getMe`         | `NETWORK_ERROR`, `TIMEOUT`, `INTERNAL_ERROR`, `RATE_LIMITED`, `UNKNOWN_ERROR`, unmapped                             | Nothing: holder choice hidden; no popup, no retry (`retry: false`)           |
| `getMe`         | 200 without `fullName` / blank                                                                                      | Holder choice hidden                                                         |
| (rules)         | `LIMIT_REACHED`, `NONE_TO_REMOVE`, `UNKNOWN_CATEGORY`, `SELF_TAKEN`, `NO_PROFILE_NAME`, `SAME_TYPE`, `UNKNOWN_SLOT` | No change; the buttons/options are already disabled or hidden                |

`getMe` lists only 200 and 401 in `openapi.yaml`; the transport codes come from the HTTP adapter. No `ERROR_CODE_MAP`
entry is added: nothing is shown for `/me`.

## Testing Strategy

- `src/utils/format/__tests__/nik.test.ts`: `toNikDigits` (spaces, dashes, letters, empty); `maskNik` table above;
  never more than 8 digits in the output.
- `src/controllers/__tests__/order.controller.test.ts`:
  - Fake `useQueryTanstack` routes on `queryKey[0]`: `'event'`, `'categories'`, `'me'` (new `meOptions`, `meState`).
  - Use the real `OrderTicketSelectionUseCase()` as the dep (pure), plus one test with a spy fake to assert delegation
    and the `unchanged` no-op.
  - Rows: shape, labels, `selected`; limit with `reservedUnits: 2`; language rerender keeps quantities.
  - Holders: count and titles; values follow their slot across increment/decrement (Property 5); `showHolders`.
  - Profile: query options; `self` / `other` transitions; `selfDisabled`; every hidden-choice case (Property 8).
  - NIK: digits only, focus/blur display, no NIK or name in any analytics call (inspect all `mock.calls`).
  - Run inside `renderHook`; drive handlers with `act`.
- Typed fixtures: add `quantity`, `selected`, `canIncrement`, `canDecrement`, `incrementLabel`, `decrementLabel` to the
  category fixtures in `src/presentation/pages/Order/__tests__/index.test.tsx` and
  `CategoryList/__tests__/index.test.tsx`, and the new interface fields to the shell's fake controller; their rendering
  assertions change in spec 49.
- The i18n key-parity test covers the new keys.
