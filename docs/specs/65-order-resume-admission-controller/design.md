# Design Document

## Overview

`OrderController` (`src/controllers/order.controller.ts`) is extended, not replaced. Changes, all small:

1. **`window-ended` latches `expired`.** The spec 62 guard becomes
   `if ((windowOver || windowEnded) && !expired) setExpired(true)` with
   `windowEnded = categoriesData?.kind === 'window-ended'`. Everything spec 62 hangs off `expired` follows unchanged:
   the one-time effect (`redirected` guard, `endOrderWindowUseCase`, `order_time_up`), the disabled categories query,
   `timeUp`, `timeUpSheet`.
2. **`order_resumed` analytics**, once per mounted page, when a real `ok` answer has `resumed: true`.
3. **Doc comment** of `timeUp` mentions the reload path.
4. **`ADMISSION_UNAVAILABLE` copy**: map entry (`src/utils/constants/error-codes.ts`) and ID / EN text. This commit is
   where the order page first surfaces claim errors (through spec 64), and the error-handling rule requires every code an
   endpoint returns to have a map entry and both locales; today it would fall back to `error_unknown_error`.

No new query, mutation, DI key, interface field, popup or loading overlay. The categories query (key, `enabled`,
`gcTime`, `retry`, `placeholderData`, token read at fetch time) is unchanged: the re-claim lives inside its `queryFn`
(spec 64).

**The countdown needs no change.** Spec 59 anchors the countdown to each real `ok` answer's `expiresAt`, `serverNow`
and arrival time. After a reload the first answer is the re-claimed one, whose `expiresAt` is the slot's lease end (the
same as before the reload), so `expiresAt − serverNow` is the real time left. A test pins it (Property 5).

**When `window-ended` happens.** Spec 64 claims only when a queue place is stored. After the time's-up sheet has run on
this page, `endOrderWindowUseCase` has removed the place, so a reload after the sheet answers `admission-invalid` and the
existing redirect takes the buyer to the waiting room (a new number at the back, as "Antre lagi" would). `window-ended`
is the case where the place is still stored but the server says the turn is over: typically the tab was closed before
0:00 and reopened later, or the browser was killed. A browser that never queued gets `admission-invalid` (redirect), not
the sheet.

**What the page shows under the sheet for `window-ended` (decision).** `status` stays as computed today: with no `ok`
answer it is `'loading'` once the event has loaded (or `'error'` / `'not-found'` as usual), so the page behind the sheet
is the flow header (no timer: `timer` is null outside `'ready'`) and the skeleton, and the aria-modal sheet covers it.
Options considered:

| Option                                             | Verdict                                                                                              |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Keep `status` (skeleton under the sheet)           | **Chosen.** No interface or shell change; the sheet is modal and focused, the skeleton is never read |
| New `OrderStatus` `'ended'` with an empty `main`   | Needs a shell branch and tests for a state nobody sees behind a modal; no user value                 |
| Map `window-ended` to `'ready'` with no categories | Breaks spec 59's "ready means an answer with times" and would show an empty category list            |

The skeleton's `aria-busy="true"` stays on `main` behind the modal; assistive technology is held in the dialog by
`aria-modal` and the focused primary button (spec 63). Acceptable; recorded.

**Why `tickets: 0` in `order_time_up` for this path.** No categories were loaded on this visit, so `selection.total` is 0. That also tells analytics the time ran out before the page loaded rather than on it (no new parameter needed).

**Why the analytics guard is a ref, not the answer identity.** After a language switch the previous answer comes back as
placeholder data (same object, `resumed: true`), and a later refetch reads the token now in memory, so it answers
`resumed: false`. A ref set on the first resumed answer keeps the event at exactly one per page visit. Known gap: if the
first resumed load fails after the claim (categories 5xx) and the query's one transient retry succeeds, that retry finds
the token in memory and answers `resumed: false`, so that resume is not tracked. Rare; accepted.

**Rule tension (recorded in spec 62, unchanged).** The expiry effect calls a synchronous local use case, not a service.
The new `order_resumed` effect calls only the analytics adapter.

## Architecture

```
OrderScreen ─► container.resolve('orderController')                (src/infrastructure/di/controllers/order.ts, unchanged)
  │
  ├─ eventQuery                                                  unchanged
  ├─ [expired, setExpired] = useState(false)                     unchanged (spec 62)
  ├─ categoriesQuery  key [CATEGORIES, eventId, locale]          unchanged
  │     queryFn → getOrderCategoriesUseCase.execute({ eventId, admissionToken: admissionStore.get(eventId) })
  │               token null after a reload → stored place? → claim again inside the use case (spec 64)
  │               → ok (resumed true|false) | admission-invalid | window-ended | throws
  ├─ redirect effect on admission-invalid                         unchanged
  ├─ ok = kind === 'ok' ? data : null; anchor                     unchanged (spec 59)
  ├─ resumedTracked (ref) + effect: ok?.resumed → order_resumed   ← new
  ├─ status, selection, holders, NIK mutation                     unchanged
  ├─ now / secondsLeft / clock effect                             unchanged
  ├─ windowOver = status === 'ready' && secondsLeft === 0          unchanged
  │  windowEnded = categoriesData?.kind === 'window-ended'         ← new
  │  if ((windowOver || windowEnded) && !expired) setExpired(true) ← changed
  ├─ ended effect: redirected, endOrderWindowUseCase, order_time_up  unchanged (spec 62)
  ├─ errorMessage via ERROR_CODE_MAP                              unchanged (map gains ADMISSION_UNAVAILABLE)
  └─ return { …, timeUp: expired, timeUpSheet }                    unchanged
```

Route `/order?event=<id>` (unchanged). API operations: `claimTurn` (only on a reload with a stored place, inside the use
case) and `getCategories`; no new operation from the controller.

Reload flows (real API):

| Moment of the reload                              | Use case answer (spec 64)                       | Controller                                                   | Page                         |
| ------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------ | ---------------------------- |
| 2:12 left                                         | `ok`, `resumed: true`, 132 s window             | anchor, `timer.seconds` 132, `order_resumed` once            | order page, "2:12"           |
| after 0:00, sheet already ran (place removed)     | `admission-invalid` (no claim)                  | `router.replace('/queue?event=<id>')` once                   | waiting room, new number     |
| after 0:00, place stored, server still has record | `ok`, `resumed: true`, `expiresAt <= serverNow` | spec 62: `expired` at once, use case, `order_time_up`        | order page at "0:00" + sheet |
| after 0:00, place stored, claim says EXPIRED      | `window-ended`                                  | `expired` at once, use case, `order_time_up` (`tickets: 0`)  | header + skeleton + sheet    |
| never queued / storage cleared                    | `admission-invalid` (no claim)                  | redirect once                                                | waiting room, joins          |
| needs sign-in / wait / sold out                   | `admission-invalid`                             | redirect once                                                | waiting room                 |
| claim 503 `ADMISSION_UNAVAILABLE`                 | throws (one transient retry)                    | `status` `'error'`, `error_admission_unavailable`, `retry()` | message + "Coba lagi"        |
| claim 5xx / network                               | throws (one transient retry)                    | `status` `'error'`, `errorMessage`, `retry()`                | error message + "Coba lagi"  |

## Components and Interfaces

```ts
// src/controllers/order.controller.ts (changes only; no new import, no new DI key)

export interface OrderControllerInterface {
  // …all existing fields unchanged…
  /**
   * The order window has run out on this page visit: true from the first render at zero, or from a reload whose
   * re-claim found the window ended (FR-19-W1); then latched (stays true whatever status does later). Drives timeUpSheet.
   */
  timeUp: boolean;
  timeUpSheet: OrderTimeUpView | null;
}
```

Body changes, in order of appearance:

```ts
// after `const ok = categoriesData?.kind === 'ok' ? categoriesData : null;` and the anchor update
// FR-19-W1: a reload claimed the turn again (spec 64); once per page visit (a placeholder or refetch never repeats it).
const resumedTracked = useRef(false);
useEffect(() => {
  if (!ok?.resumed || resumedTracked.current) return;
  resumedTracked.current = true;
  analyticsAdapter.trackEvent('order_resumed', { eventId });
}, [ok, analyticsAdapter, eventId]);

// replaces spec 62's two lines after the clock effect
const windowOver = status === 'ready' && secondsLeft === 0;
// FR-19-W1: a reload's re-claim found the turn over: the same time's-up state, without a ready page under it.
const windowEnded = categoriesData?.kind === 'window-ended';
if ((windowOver || windowEnded) && !expired) setExpired(true);
```

```ts
// src/utils/constants/error-codes.ts (CODES, after 'ADMISSION_INVALID')
'ADMISSION_UNAVAILABLE',
```

Compile check against the existing code and `AwilixRegistry`:

- `OrderCategoriesResult` (spec 64) has `ok.resumed: boolean` and the `window-ended` member, so `ok?.resumed` and
  `categoriesData?.kind === 'window-ended'` type-check; `ok` stays `null` for `window-ended`, so every existing `ok`
  consumer is unchanged.
- `useRef` and `useEffect` are already imported; `analyticsAdapter` is already a dep;
  `trackEvent(name, params)` takes a params record.
- `shouldRedirect` is still `!!eventData && categoriesData?.kind === 'admission-invalid'`: `window-ended` never redirects.
- Hooks stay unconditional: the new `useRef` / `useEffect` are declared before `return`, after `ok`.
- The guarded `setExpired` stays a render-time update (spec 62), so `react-hooks/set-state-in-effect` is not triggered;
  `resumedTracked` is read and written only inside its effect (`react-hooks/refs`).
- `ERROR_CODE_MAP` is built from `CODES`, registered as `asValue` in `helpers.registry.ts`; the `ErrorCode` type gains a
  member, nothing switches on it exhaustively.

## Data Models

State: unchanged except `resumedTracked: { current: boolean }`.

Analytics events (only the first is new):

| Name            | Params                 | When                                                                 |
| --------------- | ---------------------- | -------------------------------------------------------------------- |
| `order_resumed` | `{ eventId }`          | once per page visit, the first `ok` answer with `resumed: true`      |
| `order_time_up` | `{ eventId, tickets }` | once, on the first expiry (spec 62); `tickets: 0` for `window-ended` |

`queue_join` / `queue_claim` no longer fire on an `/order` reload during the window (the waiting room is not visited).

Translation (ID first; the openapi title "Sedang menyiapkan pesanan Anda" and J9.5 "The turn is kept"):

| Key                           | ID                                                                               | EN                                                                               |
| ----------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `error_admission_unavailable` | Pesanan Anda sedang disiapkan. Giliran Anda tetap aman, coba lagi sebentar lagi. | We're getting your order ready. Your turn is safe; please try again in a moment. |

Timeline of a reload (resumed answer: `serverNow` 03:00:00, `expiresAt` 03:02:12, arrived at R):

| Moment          | categories data                                                              | timer.seconds | timeUp | order_resumed | Page          |
| --------------- | ---------------------------------------------------------------------------- | ------------- | ------ | ------------- | ------------- |
| R − (in flight) | undefined                                                                    | (null)        | false  | no            | skeleton      |
| R               | `ok`, resumed                                                                | 132           | false  | once          | order, "2:12" |
| R + 1 s         | same                                                                         | 131           | false  | no            | order         |
| R + 60 s, EN    | placeholder, then `ok` (`resumed: false`, anchor re-set from the new answer) | ~72           | false  | no            | order         |
| R + 132 s       | same                                                                         | 0             | true   | no            | order + sheet |

## Layer Constraints

From `.claude/rules/controller.md`:

- Page UI state (`useState`), form state (`useForm` + Zod, `useWatch`)
- Queries and mutations wrapping use cases or services (`useQueryTanstack`, `useMutationTanstack`)
- Loading overlay (`useLoading`), error popup (`usePopupError`), navigation (`useRouterNext`)
- Translation of codes into text (`t` from `useTranslation`)
- Analytics (`trackPageView` once on mount, `trackEvent` on actions)
- Timers derived from server time, polling intervals (`refetchInterval`), SSE subscriptions through a DI adapter
- Business rules, validation, data transformation → use case
- HTTP details, storage, tokens → infrastructure
- Helper functions defined in the body → `src/utils/` (pure) or a use case (business)
- ✅ import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
- ✅ import type { ... } from '@core/...';
- ✅ import type { AwilixRegistry } from '@infrastructure/di/registry.types';
- ❌ any runtime import from @core/services, @infrastructure, or a context
- `export default` the factory; named export the interface `{Page}ControllerInterface`.
- Return only what the screen needs, already translated or formatted.
- One query or mutation per async operation. Never call a service inside another mutation's `onSuccess`/`onError`.
- Never `.then()/.catch()`; never `useEffect` + service call (use `useQueryTanstack`, with `refetchInterval` for polling).
- Error display (fallback through the same DI map, no extra import): `ERROR_CODE_MAP[error.code] ?? ERROR_CODE_MAP.UNKNOWN_ERROR` → `t(key)` → `openPopupError()` or a field error.
  `401` goes to sign-in; `NETWORK_ERROR` shows the offline message.
- Countdowns: compute from `expiresAt − serverNow` (plus elapsed client time since the response), never `Date.now()`
  against a deadline alone.
- `trackPageView` inside `useEffect(..., [])`, not in the render body.
- `src/controllers/__tests__/{page-name}.controller.test.ts`
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

Notes: the re-claim is in the use case (spec 64), inside the existing categories query: one query for the one async
operation "load the order page", no claim query chained in the controller, no token or store handling here. The
countdown is untouched and server-time based. No mutation is added, so the `toggleLoading` line does not apply. `401`
from the categories call keeps today's handling (error state with `error_unauthorized`); a 401 on the claim arrives as
`admission-invalid` and the waiting room sends to sign-in.

From `.claude/rules/error-handling.md`:

- `401` always goes to sign-in; never an "unauthorized" page.
- Every code the endpoint can return (see `openapi.yaml`) has an entry in `ERROR_CODE_MAP` and both locale files.
- ❌ Technical messages to users
- ❌ Auto-retrying mutations without the user

From `.claude/rules/scaffold.md`:

- Constants such as `ERROR_CODE_MAP` go in `helpers.registry.ts` as `asValue(object)`, never an empty `{}`.
- Resources: `src/translation/locale/id.json` and `en.json`, same keys in both, flat `snake_case`, single namespace.
- Copy comes from the HiFi / Design Brief voice rules; write ID first, then a full EN translation.

From `.claude/rules/design-system.md`:

- Short, warm, "Anda". ID first, full EN translation.

From `CLAUDE.md`:

- All async work goes through TanStack Query (`useQuery` / `useMutation`) — never `.then()` or `useEffect` + fetch.
- Countdowns use server time: `expiresAt − serverNow` from the API, never the device clock.
- Errors from the API carry a stable `code`; map it to a translation key, never show raw messages.

## Correctness Properties

- Property 1: with the event loaded and `categoriesState = { data: { kind: 'window-ended' } }`, the first result has
  `timeUp: true`, `timeUpSheet` equal to spec 62 Property 2's view, `status: 'loading'`, `timer: null`.
  **Validates: Requirements 1**
- Property 2: in Property 1, after rerenders, `endOrderWindowUseCase.execute` was called once with `'evt_samudra'`,
  `trackEvent('order_time_up', { eventId: 'evt_samudra', tickets: 0 })` once, `router.replace` never, and the categories
  options have `enabled: false`. **Validates: Requirements 1**
- Property 3: with `window-ended` and the event query still pending (`eventState = {}`), `timeUp` is true and the use
  case runs once; then setting `eventState = { isError: true, error: 500 INTERNAL_ERROR }` keeps `timeUpSheet` non-null
  with `status: 'error'`. **Validates: Requirements 1**
- Property 4: `admission-invalid` with the event loaded still calls `router.replace('/queue?event=evt_samudra')` once and
  leaves `timeUp` false; a categories error `err(503, 'INTERNAL_ERROR')` gives `status: 'error'`, `errorMessage
'error_internal_error'`, `timeUp` false. **Validates: Requirements 2**
- Property 5: with fake timers and `categoriesState = { data: { ...okResult, resumed: true, serverNow:
'2026-11-09T03:00:00Z', expiresAt: '2026-11-09T03:02:12Z' }, dataUpdatedAt: <fake now> }`, `timer.seconds` is 132,
  and 131 after `vi.advanceTimersByTime(1000)`. **Validates: Requirements 3**
- Property 6: a resumed answer with `expiresAt === serverNow` gives `timeUp: true` in the first ready render.
  **Validates: Requirements 3**
- Property 7: a resumed `ok` answer tracks `order_resumed` `{ eventId: 'evt_samudra' }` exactly once across several
  rerenders, a ticket increment and a language switch (placeholder then a new `resumed: false` answer); `okResult`
  (`resumed: false`) never tracks it. **Validates: Requirements 4**
- Property 8: with the real `ERROR_CODE_MAP` passed in `deps()` for this test, `err(503, 'ADMISSION_UNAVAILABLE')` gives
  `errorMessage 'error_admission_unavailable'`; `ERROR_CODE_MAP.ADMISSION_UNAVAILABLE === 'error_admission_unavailable'`;
  `id.json` / `en.json` have the key with the Data Models values; the i18n parity and "message for every API error
  code" tests pass. **Validates: Requirements 5**
- Property 9: the categories options keep `queryKey: ['categories', 'evt_samudra', 'id']`, `gcTime: 0`, `retry:
retryTransientOnce`, a `placeholderData` function, and `queryFn` calls `getOrderCategoriesUseCase.execute({ eventId:
'evt_samudra', admissionToken: <admissionStore.get value> })` (with `get` returning `null` too).
  **Validates: Requirements 2, 6**
- Property 10: every existing `OrderController` test passes; `OrderControllerDeps` and `OrderControllerInterface` have
  the same keys as before. **Validates: Requirements 6**

## Error Handling

The use case (spec 64) turns every claim and categories answer into a result or a thrown `HttpError`. The controller:

| Use case outcome (source)                                                                                                                                    | Controller                                   | User sees                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- | ------------------------------------------- |
| `ok`, `resumed: true` (claim 200 + categories 200)                                                                                                           | anchor, countdown, `order_resumed`           | order page, real time left                  |
| `ok`, `resumed: false` (token present)                                                                                                                       | unchanged                                    | order page                                  |
| `window-ended` (claim ran: 410 `MISSED` / `EXPIRED` / `MOVED`)                                                                                               | latch `expired`, spec 62 effect              | time's-up sheet over header + skeleton      |
| `admission-invalid` (no stored place; claim 401 `UNAUTHORIZED`, 409 `NOT_YET` / `FULL` / `NO_STOCK`, 410 `QUEUE_CLOSED`; categories 403 `ADMISSION_INVALID`) | redirect once (before expiry)                | waiting room                                |
| throws: claim 503 `ADMISSION_UNAVAILABLE`                                                                                                                    | one transient retry, then `status` `'error'` | `error_admission_unavailable` + "Coba lagi" |
| throws: 5xx `INTERNAL_ERROR`                                                                                                                                 | one transient retry, then `status` `'error'` | `error_internal_error` + "Coba lagi"        |
| throws: `NETWORK_ERROR`, `TIMEOUT`                                                                                                                           | retry once, then error state                 | offline message / banner                    |
| throws: claim `LOGIN_REQUIRED`, `ACCOUNT_HAS_PLACE_ELSEWHERE`, `NOT_FOUND`, 429                                                                              | error state                                  | mapped message or `error_unknown_error`     |
| throws: categories 401 `UNAUTHORIZED`                                                                                                                        | error state (unchanged)                      | `error_unauthorized`                        |

`getEvent` 404 / failures and `validateAttendee` outcomes are unchanged (specs 44, 55, 62). After `expired`, every
`admission-invalid` is ignored for navigation (spec 62 guard), including a NIK check in flight. `MOVED` reaching the
sheet is spec 64's recorded limitation.

States covered on `/order`: loading (first load and reload in flight), error (including the new message), not-found,
ready counting, ready resumed (real time left), ready at zero (sheet), expired on arrival (sheet at once), window ended
on reload (sheet over skeleton), redirect to the waiting room (including no stored place). Both languages: the sheet's
texts and the new error text follow the language; a language switch after a resume keeps counting from the same lease
end.

## Testing Strategy

`src/controllers/__tests__/order.controller.test.ts`, new `describe('order resume after reload (FR-19-W1)')`:

- Harness as spec 62 (fake timers, `categoriesState`, `eventState`, captured `categoriesOptions`, `tFor(language)`).
- `const resumed = { ...okResult, resumed: true, expiresAt: '2026-11-09T03:02:12Z' }` (with `okResult.serverNow`
  03:00:00 → 132 s).
- `window-ended`: `categoriesState = { data: { kind: 'window-ended' } }` with and without `eventState = { data: event }`.
- Language switch for Property 7: set `isPlaceholderData: true` with the resumed data, rerender, then `{ data: okResult,
isPlaceholderData: false, dataUpdatedAt: later }`.
- Property 8: `render({ ...deps(), ERROR_CODE_MAP })` with the real map from `@utils/constants/error-codes`.
- `queryFn` for Property 9: call `categoriesOptions.queryFn()` with `admissionStore.get` returning `null` and assert the
  use-case call.
- One `it` per Property 1–9; Property 10 is the existing suite.
- `src/infrastructure/i18n/__tests__/i18n.test.ts`: `ADMISSION_UNAVAILABLE` in `API_ERROR_CODES` and an `it` with the
  ID / EN values (Property 8).
- Gate: `npx tsc --noEmit && npx vitest --run`; controller coverage ≥ 85%. `npm run lint` (lint-staged) checks the
  `react-hooks` rules on the changed guard and the new ref.
