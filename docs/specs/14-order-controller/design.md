# Design Document

## Overview

`OrderController` is the only data source of the order screen. It reads `?event=`, runs two queries (event header,
categories), derives one `status`, redirects to the waiting room on `admission-invalid`, and returns view models that
are already translated and formatted. Pure formatters live in `src/utils/format/order-event.ts`; the retry predicate in
`src/utils/query/retry.ts`.

**Use cases.** The categories query goes through `getOrderCategoriesUseCase` (spec 13: token guard and
`ADMISSION_INVALID` classification). The event query has no business logic, so it calls `catalogService.getEvent`
directly and **no use-case spec exists for it** (core-use-case rule: "Simple GET, no transformation | No — controller
wraps the service in `useQuery`").

## Architecture

```
src/app/order/page.tsx ─ <Suspense> ─► OrderScreen ─► container.resolve('orderController')
                                                         │
     useSearchParamsNext().get('event') ─► eventId       │
                                                         ├─ useQueryTanstack [EVENT, eventId]
                                                         │    queryFn: (await catalogService.getEvent(eventId)).data
                                                         ├─ useQueryTanstack [CATEGORIES, eventId, locale]
                                                         │    queryFn: getOrderCategoriesUseCase.execute({
                                                         │               eventId, admissionToken: admissionStore.get(eventId) })
                                                         ├─ useEffect: admission-invalid && event loaded
                                                         │    → router.replace('/queue?event=<id>')
                                                         └─ useEffect([]): analyticsAdapter.trackPageView('order')
```

Query options:

| Query      | Key                                        | `enabled`        | `staleTime` | `gcTime` | `retry`              | Other                                                           |
| ---------- | ------------------------------------------ | ---------------- | ----------- | -------- | -------------------- | --------------------------------------------------------------- |
| event      | `[QUERY_KEYS.EVENT, eventId]`              | `eventId !== ''` | 60 s        | default  | `retryTransientOnce` | —                                                               |
| categories | `[QUERY_KEYS.CATEGORIES, eventId, locale]` | `eventId !== ''` | default     | `0`      | `retryTransientOnce` | `placeholderData: (previous) => previous`; no `refetchInterval` |

- `gcTime: 0` on categories: the snapshot and `expiresAt` belong to one admission; a later visit (a new turn) must not
  reuse them. `refetchOnWindowFocus` is already off app-wide (`providers.tsx`).
- `locale` in the categories key: descriptions come in the `Accept-Language` language, which the HTTP adapter reads
  from `storage` at request time; `setLocale` writes `storage` before `changeLanguage`, so the refetch uses the new
  language. `placeholderData` keeps the old list visible meanwhile.
- The token is read inside `queryFn`, never in the key, so FR-08-W1 can fill the store before the fetch and the token
  never lands in the query cache key.
- Both queries run in parallel; the redirect waits for the event so an unknown event shows not-found instead of
  bouncing to a waiting room that does not exist.

New constants:

```ts
// src/utils/constants/query-keys.ts
export const QUERY_KEYS = {
  EVENTS: 'events',
  EVENT: 'event',
  CATEGORIES: 'categories',
} as const;
```

## Components and Interfaces

```ts
// src/utils/query/retry.ts
import type { HttpError } from '@core/protocols/http.protocol';
/** Retry once for transport failures (status 0) and 5xx; never for 4xx (NOT_FOUND, UNAUTHORIZED, …). */
export function retryTransientOnce(failureCount: number, error: HttpError): boolean;
```

```ts
// src/utils/format/order-event.ts
import type { Category } from '@core/entities/booking/booking.entity';
import type { EventSummary } from '@core/entities/catalog/catalog.entity';
import type { FormatLocale } from './date';
import type { PosterTone } from './event-card';

export interface OrderEventView {
  id: string;
  name: string;
  subtitle?: string;
  imageUrl?: string;
  /** posterToneFor(eventId): the same colour as the Home card. */
  posterTone: PosterTone;
  /** "Sab, 12 Des 2026 · 19.00 WIB · Stadion Utama GBK, Jakarta" in the event time zone. */
  metaLine: string;
}

export interface OrderCategoryView {
  id: string;
  name: string;
  description?: string;
}

export function toOrderEventView(event: EventSummary, locale: FormatLocale): OrderEventView;
export function toOrderCategoryView(category: Category): OrderCategoryView;
```

`metaLine` = `[formatEventDate(startsAt, locale, timezone ?? DEFAULT_TIME_ZONE), [venue, city].filter(Boolean).join(', ')].join(' · ')`.

```ts
// src/controllers/order.controller.ts
import { useEffect, useMemo } from 'react';
import type { TFunction } from 'i18next';

import type { EventSummary } from '@core/entities/catalog/catalog.entity';
import type { HttpError } from '@core/protocols/http.protocol';
import type { OrderCategoriesResult } from '@core/use_case/booking/get-order-categories.use-case';
import type { AwilixRegistry } from '@infrastructure/di/registry.types';
import type { FormatLocale } from '@utils/format/date';
import { toOrderCategoryView, toOrderEventView, type OrderCategoryView, type OrderEventView } from '@utils/format/order-event';
import { retryTransientOnce } from '@utils/query/retry';
import { QUERY_KEYS } from '@utils/constants/query-keys';
import { ROUTES, withQuery } from '@utils/constants/routes';
import { STORAGE_KEYS } from '@utils/constants/storage-keys';

export type OrderStatus = 'loading' | 'error' | 'not-found' | 'ready';

export interface FlowStep {
  number: 1 | 2 | 3;
  label: string;
  current: boolean;
}

export interface OrderControllerInterface {
  t: TFunction;
  status: OrderStatus;
  /** Null until the event loads, and in the not-found state. */
  event: OrderEventView | null;
  /** Server order; empty until the categories load. */
  categories: OrderCategoryView[];
  /** "Maks. 3 tiket per transaksi. Tanpa nomor kursi — masuk sesuai kategori."; '' until loaded. */
  categoryNote: string;
  /** Translated; '' unless status is 'error'. */
  errorMessage: string;
  /** Refetches every failed query. */
  retry: () => void;
  steps: FlowStep[];
  /** /queue?event=<id>, or Home without an event id. */
  backHref: string;
  homeHref: string;
  locale: FormatLocale;
  setLocale: (locale: FormatLocale) => void;
}

type OrderControllerDeps = Pick<
  AwilixRegistry,
  | 'catalogService'
  | 'getOrderCategoriesUseCase'
  | 'admissionStore'
  | 'analyticsAdapter'
  | 'storage'
  | 'ERROR_CODE_MAP'
  | 'useTranslation'
  | 'useQueryTanstack'
  | 'useRouterNext'
  | 'useSearchParamsNext'
>;

const OrderController = (deps: OrderControllerDeps): OrderControllerInterface;
export default OrderController;
```

```ts
// src/infrastructure/di/registry.types.ts (addition, under "controllers")
import type { OrderControllerInterface } from '@controllers/order.controller';
orderController: OrderControllerInterface;

// src/infrastructure/di/controllers.registry.ts (addition)
orderController: asFunction(OrderController),
```

Hook typing: `useQueryTanstack<EventSummary, HttpError>(…)` and
`useQueryTanstack<OrderCategoriesResult, HttpError>(…)`; `retryTransientOnce` matches TanStack's
`(failureCount, error) => boolean`.

## Data Models

Status derivation (first match wins):

| #   | Condition                                                         | `status`    |
| --- | ----------------------------------------------------------------- | ----------- |
| 1   | `eventId === ''` (missing or blank `event`)                       | `not-found` |
| 2   | event query error with `code === 'NOT_FOUND'` or `status === 404` | `not-found` |
| 3   | event query error (other) or categories query error               | `error`     |
| 4   | event data and categories `kind === 'ok'`                         | `ready`     |
| 5   | otherwise (pending, or `admission-invalid` while redirecting)     | `loading`   |

`eventId` = `searchParams.get('event')?.trim() ?? ''`.

`errorMessage` uses the event error first, then the categories error. `categoryNote` is `''` unless categories are
`ok`.

Steps: `[{ 1, t('order_step_choose'), current: true }, { 2, t('order_step_pay'), false }, { 3, t('order_step_ticket'), false }]`.

Translation keys translated by this controller (both `id.json` and `en.json`; the page adds its own in spec 15):

| Key                         | ID                                                                              | EN                                                                    |
| --------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `order_step_choose`         | Pilih tiket                                                                     | Tickets                                                               |
| `order_step_pay`            | Bayar                                                                           | Pay                                                                   |
| `order_step_ticket`         | E-tiket                                                                         | E-ticket                                                              |
| `order_category_note_one`   | Maks. {{count}} tiket per transaksi. Tanpa nomor kursi — masuk sesuai kategori. | Max {{count}} ticket per order. No seat numbers — entry by category.  |
| `order_category_note_other` | Maks. {{count}} tiket per transaksi. Tanpa nomor kursi — masuk sesuai kategori. | Max {{count}} tickets per order. No seat numbers — entry by category. |

Error texts reuse the existing `error_*` keys through `ERROR_CODE_MAP`.

## Layer Constraints

From `.claude/rules/controller.md`:

- `export default` the factory; named export the interface `{Page}ControllerInterface`.
- Return only what the screen needs, already translated or formatted.
- One query or mutation per async operation. Never call a service inside another mutation's `onSuccess`/`onError`.
- Never `.then()/.catch()`; never `useEffect` + service call (use `useQueryTanstack`, with `refetchInterval` for polling).
- Error display (fallback through the same DI map, no extra import): `ERROR_CODE_MAP[error.code] ?? ERROR_CODE_MAP.UNKNOWN_ERROR` → `t(key)` → `openPopupError()` or a field error.
  `401` goes to sign-in; `NETWORK_ERROR` shows the offline message.
- Countdowns: compute from `expiresAt − serverNow` (plus elapsed client time since the response), never `Date.now()`
  against a deadline alone.
- `trackPageView` inside `useEffect(..., [])`, not in the render body.
- Registered in `controllers.registry.ts` as `asFunction(Controller)` — **no** `.singleton()`.
- File name `{page-name}.controller.ts`, never `use-…`.
- Reading search params (`useSearchParamsNext`) — the route file must wrap the screen in `<Suspense>`
- Business rules, validation, data transformation → use case
- HTTP details, storage, tokens → infrastructure
- Helper functions defined in the body → `src/utils/` (pure) or a use case (business)
- ❌ any runtime import from @core/services, @infrastructure, or a context
- Mock every DI dependency (hooks return plain objects); capture `useMutationTanstack` options and call
  `mutationFn` / `onSuccess` / `onError` directly.
- Test: returned interface, loading in all paths, error mapping, navigation targets, analytics.
- Coverage threshold 85%.

From `.claude/rules/error-handling.md`:

- `401` always goes to sign-in; never an "unauthorized" page.
- Every code the endpoint can return (see `openapi.yaml`) has an entry in `ERROR_CODE_MAP` and both locale files.

From `CLAUDE.md`: "Countdowns use server time: `expiresAt − serverNow` from the API, never the device clock." and
"Errors from the API carry a stable `code`; map it to a translation key, never show raw messages."

**Deviations, agreed for this ticket:**

- 401 does not go to sign-in yet: it shows the inline error state with `error_unauthorized` ("Sesi Anda berakhir.
  Silakan masuk lagi."). ADR-0006 puts sign-in _inside_ the order window as a login sheet on this page (HiFi review
  H-6); that sheet is NFR-07-W2. Navigating to `/login` would burn the 5 minutes, so the interim is a message, not a
  redirect.
- The controller reads `admissionStore` (a token holder) through DI. Use cases may depend only on services, config and
  use cases, so the token is read here and passed in; the controller never sends it itself.
- No countdown yet (FR-17-W1); `expiresAt`/`serverNow` are already in the use-case result for it.

## Correctness Properties

- Property 1: with no `event` param, neither `queryFn` runs and `status === 'not-found'`. **Validates: Requirements 1, 2**
- Property 2: the categories query key never contains the admission token; the token passed to `execute` is
  `admissionStore.get(eventId)` at fetch time. **Validates: Requirements 1**
- Property 3: the categories query options have no `refetchInterval`. **Validates: Requirements 1**
- Property 4: exactly one `status` per render, following the derivation table. **Validates: Requirements 2**
- Property 5: `errorMessage` is always a translation of an `ERROR_CODE_MAP` value; an unmapped code gives
  `t(ERROR_CODE_MAP.UNKNOWN_ERROR)`. **Validates: Requirements 2**
- Property 6: `retryTransientOnce` is false for every status 400–499 and for `failureCount >= 1`; true for status 0 or
  ≥ 500 at `failureCount 0`. **Validates: Requirements 2**
- Property 7: `router.replace` is called once with `/queue?event=<encoded id>` iff the categories result is
  `admission-invalid` and the event loaded; never on not-found. **Validates: Requirements 3**
- Property 8: `metaLine` uses the event time zone (WIB/WITA/WIT label from `zoneAbbr`), never the device zone.
  **Validates: Requirements 4**
- Property 9: the category views carry only `id`, `name`, `description`, in server order. **Validates: Requirements 4**
- Property 10: `trackPageView('order')` is called once per mount, whatever the status. **Validates: Requirements 5**

## Error Handling

| Operation       | Status / code                                                | User sees                                                                                      |
| --------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| —               | no `event` param                                             | Not-found state: "Event tidak ditemukan." + "Ke beranda"                                       |
| `getEvent`      | 404 `NOT_FOUND`                                              | Not-found state (same)                                                                         |
| `getCategories` | no token, 403 `ADMISSION_INVALID`                            | Skeleton, then `router.replace('/queue?event=<id>')`                                           |
| `getCategories` | 401 `UNAUTHORIZED`                                           | Inline error: `error_unauthorized` + "Coba lagi" (interim, NFR-07-W2)                          |
| both            | `NETWORK_ERROR`                                              | Inline error: `error_network_error` (offline text) + "Coba lagi"; the offline banner shows too |
| both            | `TIMEOUT`, `INTERNAL_ERROR`, `RATE_LIMITED`, `UNKNOWN_ERROR` | Inline error: translated `ERROR_CODE_MAP` text + "Coba lagi"                                   |
| both            | unmapped code (`HTTP_<status>`, a 403 with another code)     | Inline error: `error_unknown_error` + "Coba lagi"                                              |

Errors are inline, not popups: the page has nothing else to show (same choice as Home). Every listed code already has
an `ERROR_CODE_MAP` entry and both locale strings.

## Testing Strategy

- `src/controllers/__tests__/order.controller.test.ts` with fake hooks (as in `home.controller.test.ts`): capture both
  `useQueryTanstack` option objects and call their `queryFn` directly; assert keys, `enabled`, `retry`, `gcTime`,
  absence of `refetchInterval`; every status row; error mapping (`NETWORK_ERROR`, `UNAUTHORIZED`, unmapped code);
  `retry()` refetches only failed queries; redirect target and no redirect on not-found; token read from
  `admissionStore` in `queryFn`; `setLocale` writes storage and calls `changeLanguage`; `trackPageView('order')`.
- `src/utils/format/__tests__/order-event.test.ts`: ID and EN meta lines, missing city, missing timezone, WITA event,
  category view picks only three fields.
- `src/utils/query/__tests__/retry.test.ts`: the predicate table.
- `registry.test.ts`: `orderController` in `KEYS`.
